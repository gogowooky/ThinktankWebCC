/**
 * TTVault.ts
 * v5 保管庫クラス。TTCollection の派生クラス。
 *
 * データ階層: TTVault > Bundles > Bundle > Think
 *
 * Vault パス: Thinktank/vault_ver2/{thinkid}.md
 */

import { TTCollection } from './TTCollection';
import { TTThink } from './TTThink';
import type { ContentType } from '../types';
import { TTModels } from './TTModels';
import { formatDateRangeJapanese } from '../utils/dateUtils';
import { StorageManager } from '../services/storage/StorageManager';
import { parseBundle, serializeBundle, serializeLinks } from '../utils/thinkFormat';
import type { ThinkMeta } from '../services/storage/IStorageBackend';
import { emptyThinkValues, readThinkSupport, type ThinkSupportRecord } from '../../shared/contracts/thinkSupportRecord';
import type { TaskSeed } from '../services/taskSeed';
import { readTaskRelation, type TaskRelation } from '../services/taskRelation';
import type { ConversationTurn } from '../services/ConversationService';
import { validateSubtaskCandidates } from '../../shared/contracts/lifecycleProposals';
import {
  createBundleResolutionState, mergeBundleConditions, addBundleFilterMatches,
  hasBundleSearchConditions, addBundleSearchMatches, finishBundleResolution,
} from './bundleResolution';
import {
  captureBundleResolutionSnapshot, matchesBundleResolutionSnapshot, matchesBundleContentBeforeLoad, acceptBundleContentLoad,
  type BundleResolutionSnapshot,
} from './bundleResolutionCache';

/** Optional diagnostics for isolated, read-only context resolution. Existing UI defaults are preserved. */
export interface BundleResolutionOptions {
  allowImplicitAll?: boolean;
  search?: (query: string) => Promise<ThinkMeta[]>;
  onBundle?: (bundle: TTThink) => void;
  onIssue?: (issue: { code: 'cycle' | 'missing_think' | 'implicit_all_blocked' | 'conflicting_conditions'; thinkId: string }) => void;
}

export class TTVault extends TTCollection {
  /** 保管庫名（LocalFS ではディレクトリ名）*/
  public VaultName: string = 'vault_ver2';

  /** GetThinksForBundleAsync の結果をキャッシュする（同期版 GetThinksForBundle 用）*/
  private _bundleThinksCache = new Map<string, { ids: string[]; snapshot: BundleResolutionSnapshot }>();
  private _bundleCacheRevision = 0;
  private _bundleRequestGenerations = new Map<string, number>();
  private _bundleInputsSnapshot: BundleResolutionSnapshot | null = null;
  private _subtaskCreations = new Map<string, { promise: Promise<TTThink>; isCurrent: () => boolean }>();

  public override get ClassName(): string {
    return 'TTVault';
  }

  constructor(vaultName: string = 'vault_ver2') {
    super();
    this.ID = vaultName;
    this.VaultName = vaultName;
    this.Name = vaultName;
  }

  private _invalidateBundleResults(): void {
    this._bundleCacheRevision++;
    this._bundleThinksCache.clear();
    this._bundleRequestGenerations.clear();
    this._bundleInputsSnapshot = null;
  }

  public override NotifyUpdated(updateProperty: boolean = true): void {
    // Seeds は解決結果の表示通知にもこのAPIを使うため、入力が同じ通知では検索cacheを保つ。
    if (this._bundleInputsSnapshot
      && !matchesBundleResolutionSnapshot(this._bundleInputsSnapshot, this.ID, this.IsLoaded, this.GetThinks())) {
      this._invalidateBundleResults();
    }
    super.NotifyUpdated(updateProperty);
  }

  public override NotifyRefresh(): void {
    this._invalidateBundleResults();
    super.NotifyRefresh();
  }

  protected override InvalidateItemsCache(): void {
    this._invalidateBundleResults();
    super.InvalidateItemsCache();
  }

  protected override ClearItemsSilent(): void {
    this._invalidateBundleResults();
    super.ClearItemsSilent();
  }

  // ── 型付きアクセス ─────────────────────────────────────────────────

  /** 全 TTThink を型付きで取得する */
  public GetThinks(): TTThink[] {
    return this.GetItems().filter((item): item is TTThink => item instanceof TTThink);
  }

  /**
   * Bundles を取得する（ContentType='bundle' の TTThink 一覧）
   * Bundles = TTVault を ContentType='bundle' でフィルターした集合
   */
  public GetBundles(): TTThink[] {
    return this.GetThinks().filter(t => t.ContentType === 'bundle');
  }


  /**
   * 指定 Bundle が参照する Think 群を非同期で返す（全文検索も含む）。
   * 複数 bundle File がある場合はタイトル行以外の行をすべてマージする。
   * - `>` 行: Keyword、作成日、更新日で Filter
   * - `>>` 行: 検索語、作成日、更新日で全文検索
   * - `*` 行: 直接 ID 指定
   * 重複排除して TTThink[] を返す。
   */
  public async GetThinksForBundleAsync(bundleId: string, strict: boolean = false, options: BundleResolutionOptions = {}): Promise<TTThink[]> {
    const rootBundle = this.GetThink(bundleId);
    if (!rootBundle || rootBundle.ContentType !== 'bundle') return [];

    const thinks = this.GetThinks();
    const allThinks = thinks.filter(t => t.ContentType !== 'bundle');
    const snapshot = captureBundleResolutionSnapshot(this.ID, this.IsLoaded, thinks);
    this._bundleInputsSnapshot = snapshot;
    const revision = this._bundleCacheRevision;
    const generation = (this._bundleRequestGenerations.get(bundleId) ?? 0) + 1;
    this._bundleRequestGenerations.set(bundleId, generation);
    const discardCurrentCache = () => {
      if (revision === this._bundleCacheRevision && generation === this._bundleRequestGenerations.get(bundleId)) {
        this._bundleThinksCache.delete(bundleId);
      }
    };
    let cacheable = true;
    const state = createBundleResolutionState();
    const activePath = new Set<string>();

    const collectParams = async (tid: string, visited: Set<string>): Promise<void> => {
      if (activePath.has(tid)) {
        options.onIssue?.({ code: 'cycle', thinkId: tid });
        return;
      }
      if (visited.has(tid)) return;
      visited.add(tid);
      activePath.add(tid);
      const think = this.GetThink(tid);
      if (!think || think.ContentType !== 'bundle') return;
      if (think.IsMetaOnly) {
        const unchangedBeforeLoad = matchesBundleContentBeforeLoad(snapshot, think);
        await think.LoadContent();
        if (!unchangedBeforeLoad) cacheable = false;
        acceptBundleContentLoad(snapshot, think);
      }
      if (strict && think.IsMetaOnly) throw new Error('Bundle本文を読み込めませんでした');
      const parsed = parseBundle(think.Content);
      options.onBundle?.(think);
      for (const id of parsed.ids) {
        if (this.GetThink(id)?.ContentType === 'bundle') await collectParams(id, visited);
        else state.ids.add(id);
      }
      mergeBundleConditions(state, parsed).forEach(() => {
        options.onIssue?.({ code: 'conflicting_conditions', thinkId: tid });
      });
      activePath.delete(tid);
    };

    try { await collectParams(bundleId, new Set()); }
    catch (error) { discardCurrentCache(); throw error; }
    addBundleFilterMatches(state, allThinks);
    if (hasBundleSearchConditions(state)) {
      try {
        const metas = await (options.search ?? (query => StorageManager.instance.search(query)))(state.search.query);
        addBundleSearchMatches(state, metas);
      } catch (error) {
        discardCurrentCache();
        if (strict) throw error;
        cacheable = false;
        console.error('[TTVault] GetThinksForBundleAsync search failed:', error);
      }
    }

    const result = finishBundleResolution(state, allThinks, options.allowImplicitAll !== false);
    if (result.implicitAllBlocked) {
      options.onIssue?.({ code: 'implicit_all_blocked', thinkId: bundleId });
      return [];
    }
    for (const id of result.missingIds) options.onIssue?.({ code: 'missing_think', thinkId: id });
    // 入力変更と後発要求の両方を照合し、待ち時間の長い旧結果が同期表示へ戻るのを防ぐ。
    if (cacheable && revision === this._bundleCacheRevision
      && generation === this._bundleRequestGenerations.get(bundleId)
      && matchesBundleResolutionSnapshot(snapshot, this.ID, this.IsLoaded, this.GetThinks())) {
      this._bundleThinksCache.set(bundleId, { ids: result.members.map(think => think.ID), snapshot });
      this._bundleInputsSnapshot = snapshot;
    }
    return result.members;
  }

  /** GetThinksForBundleAsync の同期版（非同期ロードや検索はスキップ）*/
  public GetThinksForBundle(bundleId: string): TTThink[] {
    const thinks = this.GetThinks();
    const allThinks = thinks.filter(t => t.ContentType !== 'bundle');
    const cached = this._bundleThinksCache.get(bundleId);
    if (cached && matchesBundleResolutionSnapshot(cached.snapshot, this.ID, this.IsLoaded, thinks)) {
      const byId = new Map(allThinks.map(think => [think.ID, think]));
      return cached.ids.map(id => byId.get(id)).filter((think): think is TTThink => think !== undefined);
    }
    this._bundleThinksCache.delete(bundleId);
    const rootBundle = this.GetThink(bundleId);
    if (!rootBundle || rootBundle.ContentType !== 'bundle' || rootBundle.IsMetaOnly) return [];

    const state = createBundleResolutionState();
    const collectParams = (tid: string, visited: Set<string>): void => {
      if (visited.has(tid)) return;
      visited.add(tid);
      const think = this.GetThink(tid);
      if (!think || think.ContentType !== 'bundle' || think.IsMetaOnly) return;
      const parsed = parseBundle(think.Content);
      for (const id of parsed.ids) {
        if (this.GetThink(id)?.ContentType === 'bundle') collectParams(id, visited);
        else state.ids.add(id);
      }
      mergeBundleConditions(state, parsed);
    };
    collectParams(bundleId, new Set());
    addBundleFilterMatches(state, allThinks);
    return finishBundleResolution(state, allThinks).members;
  }

  /** ID で TTThink を取得する（型付き）*/
  public GetThink(id: string): TTThink | undefined {
    const item = this.GetItem(id);
    return item instanceof TTThink ? item : undefined;
  }

  /** TTThink を追加する（VaultID を自動設定）*/
  public AddThink(think: TTThink): TTThink {
    think.VaultID = this.ID;
    return this.AddItem(think) as TTThink;
  }

  // ── ストレージ連携────────────────────────────────────────

  /**
   * ローカル中継モードでは、シェル起動直後にAPIサーバーがまだ
   * listenを開始していないタイミングでこの呼び出しが競合することがある
   * （シェル側にreadiness gateが無いため）。一過性の接続失敗を「ロード済みだが
   * 空」として確定させてしまわないよう、短い間隔でリトライしてから諦める。
   */
  public override async LoadCache(): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const metas = await StorageManager.instance.listMeta();
        for (const meta of metas) {
          const think = new TTThink();
          think.ID          = meta.thinkid;
          think.VaultID     = this.ID;
          think.ContentType = meta.category as ContentType;
          think.Keywords    = meta.keywords  ?? '';
          think.RelatedIDs  = meta.relatedIds ?? '';
          // metadata が万一オブジェクト以外（文字列化されたYAML等）で届いた場合、
          // そのまま代入すると think.Metadata.xxx = ... の代入時に
          // "Cannot create property on string" で描画がクラッシュする。
          if (meta.metadata != null && typeof meta.metadata !== 'object') {
            console.error(`[TTVault] LoadCache: metadata is not an object for ${meta.thinkid}, resetting to {}`, meta.metadata);
          }
          think.Metadata    = (meta.metadata && typeof meta.metadata === 'object') ? meta.metadata : {};
          think.markMetadataSaved();
          think.IsMetaOnly  = true;
          think.UpdatedAt   = meta.updatedAt ?? '';
          think.setContentSilent(meta.title);
          think.markSaved();
          think._parent = this;
          this._children.set(think.ID, think);
        }
        this.Count    = this._children.size;
        this.IsLoaded = true;
        this.NotifyRefresh();
        console.log(`[TTVault] LoadCache: ${this.Count} items loaded (vault=${this.ID})`);
        return;
      } catch (e) {
        console.error(`[TTVault] LoadCache failed (attempt ${attempt}/${maxAttempts}):`, e);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
        // 最終試行も失敗した場合は IsLoaded を true にせず false のまま残す。
        // ReloadAll() 等による再試行が「ロード済みだが空」に阻まれないようにするため。
      }
    }
  }

  /** 全データをストレージから再ロードしリスナーを発火する（表示更新用）*/
  public async ReloadAll(): Promise<void> {
    this.ClearItemsSilent();
    this.IsLoaded = false;
    await this.LoadCache();
  }

  /** 複数 bundle を合成した新 bundle を作成する
   *  各 bundle の ThinkID を展開・重複排除して `* id` 行にまとめる
   *  タイトル: {count1}件＋{count2}件：{name1}＋{name2}＋...
   */
  /** Bundle一覧モード: 複数 bundle を合成した新 bundle を作成する */
  public async CreateBundleFromBundles(ids: string[]): Promise<TTThink> {
    const titles: string[] = [];
    const allThinkIds = new Set<string>();
    for (const id of ids) {
      const think = this.GetThink(id);
      if (think) {
        titles.push(think.Name);
        allThinkIds.add(id);
      }
    }
    const uniqueIds = [...allThinkIds];
    const title = `${uniqueIds.length}件：Bundleファイルの連結（${uniqueIds.join(' x ')}）`;

    return this._createBundle({
      prefix: '',
      title,
      ids: uniqueIds
    });
  }

  /** Think一覧モード (Filter): チェック済みアイテムまたは条件から作成 */
  public async CreateBundleFromIds(ids: string[], filter?: string, dates?: { createdDate?: string, createdRange?: string, updatedDate?: string, updatedRange?: string }): Promise<TTThink> {
    const titles: string[] = [];
    if (ids.length > 0) {
      const firstName = this.GetThink(ids[0])?.Name ?? ids[0];
      titles.push(`${ids.length}件：含む「${firstName}」`);
    } else {
      if (filter) titles.push(`フィルター：${filter}`);
      if (dates?.updatedDate || dates?.updatedRange) titles.push(`更新：${formatDateRangeJapanese(dates.updatedDate || '', dates.updatedRange || '')}`);
      if (dates?.createdDate || dates?.createdRange) titles.push(`作成：${formatDateRangeJapanese(dates.createdDate || '', dates.createdRange || '')}`);
    }

    return this._createBundle({
      prefix: '> ',
      title: titles.join(' / '),
      filterKeyword: filter,
      ids,
      dates
    });
  }

  private async _createThink(options: {
    id?: string;
    contentType: ContentType;
    fullContent: string;
    keywords?: string;
    relatedIds?: string;
    metadata?: Record<string, unknown>;
    bundleId?: string;
    isCurrent?: () => boolean;
  }): Promise<TTThink> {
    if (options.isCurrent && !options.isCurrent()) throw new Error('アプリの処理期間が終了しました。');
    const { contentType, fullContent, keywords = '', relatedIds = '', metadata, bundleId } = options;
    const id = options.id ?? TTVault.generateUniqueId(new Set(this._children.keys()));
    const previous = this._children.get(id);
    const think = new TTThink();
    think.ID = id;
    think.VaultID = this.ID;
    think.ContentType = contentType;
    think.Keywords = keywords;
    think.RelatedIDs = relatedIds;
    think.IsMetaOnly = false;
    think.setContentSilent(fullContent);
    if (metadata) think.Metadata = metadata;
    think._parent = this;
    this._children.set(id, think);
    this.Count = this._children.size;
    this.InvalidateItemsCache();
    try {
      const saved = await StorageManager.instance.save({ thinkid: id, category: contentType, fullContent,
        keywords, relatedIds, ...(metadata ? { metadata } : {}) });
      if (options.isCurrent && !options.isCurrent()) throw new Error('アプリの処理期間が終了しました。');
      if (saved?.updatedAt) think.UpdatedAt = saved.updatedAt;
    } catch (error) {
      // 固定IDの上書きに失敗したときも、保存前の項目を失わないように戻す。
      if (this._children.get(id) === think) {
        if (previous) this._children.set(id, previous);
        else this._children.delete(id);
        this.Count = this._children.size;
        this.InvalidateItemsCache();
      }
      think._parent = null;
      throw error;
    }
    think.markSaved();
    if (metadata) think.markMetadataSaved();
    if (bundleId) await this._linkThinkToBundle(bundleId, id);
    this.NotifyUpdated();
    return think;
  }

  /** bundle新規作成の共通ロジック */
  private async _createBundle(options: {
    prefix: string,
    title: string,
    searchQuery?: string,
    filterKeyword?: string,
    dates?: { createdDate?: string, createdRange?: string, updatedDate?: string, updatedRange?: string },
    ids?: string[],
    thinkSupport?: ThinkSupportRecord,
    taskRelation?: TaskRelation,
    originChatId?: string,
    isCurrent?: () => boolean
  }): Promise<TTThink> {
    const { prefix, title, searchQuery, filterKeyword, dates, ids = [] } = options;
    const fullContent = serializeBundle({ prefix, title, searchQuery, filterKeyword, dates, ids });
    const metadata = {
      ...(options.thinkSupport ? { thinkSupport: options.thinkSupport } : {}),
      ...(options.originChatId ? { taskOrigin: { schemaVersion: 1, chatId: options.originChatId } } : {}),
      ...(options.taskRelation ? { taskRelation: options.taskRelation } : {}),
    };
    return this._createThink({ contentType: 'bundle', fullContent, relatedIds: ids.join(','),
      ...(Object.keys(metadata).length ? { metadata } : {}), ...(options.isCurrent ? { isCurrent: options.isCurrent } : {}) });
  }

  /** 全文検索モード: 検索語と条件から作成 */
  public async CreateBundleFromSearch(query: string, ids: string[], dates?: { createdDate?: string, createdRange?: string, updatedDate?: string, updatedRange?: string }): Promise<TTThink> {
    const titles: string[] = [];
    if (ids.length > 0) {
      const firstName = this.GetThink(ids[0])?.Name ?? ids[0];
      titles.push(`${ids.length}件：含む「${firstName}」`);
    } else {
      if (query) titles.push(`検索語：${query}`);
      if (dates?.updatedDate || dates?.updatedRange) titles.push(`更新：${formatDateRangeJapanese(dates.updatedDate || '', dates.updatedRange || '')}`);
      if (dates?.createdDate || dates?.createdRange) titles.push(`作成：${formatDateRangeJapanese(dates.createdDate || '', dates.createdRange || '')}`);
    }

    return this._createBundle({
      prefix: '>> ',
      title: titles.join(' / '),
      searchQuery: query,
      ids,
      dates
    });
  }

  /** フィルターキーワードからbundleを新規作成して保存する */
  public async CreateBundleFromFilter(keyword: string, ids: string[], dates?: { createdDate?: string, createdRange?: string, updatedDate?: string, updatedRange?: string }): Promise<TTThink> {
    return this.CreateBundleFromIds(ids, keyword, dates);
  }

  /** 本人が採用した課題名と関連資料から、1課題を表すBundleを作成する。 */
  public async CreateTaskBundle(title: string, ids: string[], seed?: TaskSeed, originChatId?: string, isCurrent?: () => boolean): Promise<TTThink> {
    const normalizedTitle = title.replace(/[\r\n]+/g, ' ').trim();
    if (!normalizedTitle) throw new Error('課題名を入力してください。');
    if (normalizedTitle.length > 200) throw new Error('課題名は200文字以内で入力してください。');
    const uniqueIds = [...new Set(ids)].filter(id => this.GetThink(id));
    const now = new Date().toISOString();
    const thinkSupport: ThinkSupportRecord | undefined = seed ? {
      schemaVersion: 1, revision: 1, author: 'human', confirmedAt: now, updatedAt: now,
      values: { ...emptyThinkValues(), goal: seed.goal, completionCriteria: seed.completionCriteria }, sources: {},
    } : undefined;
    if (thinkSupport) readThinkSupport(thinkSupport);
    return this._createBundle({ prefix: '', title: normalizedTitle, ids: uniqueIds, thinkSupport, originChatId, isCurrent });
  }

  /** Candidate identity keeps retries separate without rewriting the parent Bundle. */
  public async CreateSubtaskFromConversation(turn: ConversationTurn, chatId: string, title: string, candidateId?: string, isCurrent: () => boolean = () => true): Promise<TTThink> {
    if (!isCurrent()) throw new Error('アプリの処理期間が終了しました。');
    if (candidateId !== undefined) validateSubtaskCandidates(turn.answer.subtaskCandidates, turn.context.scope);
    const parentId = turn.context.bundleId;
    const candidate = candidateId === undefined ? undefined : turn.answer.subtaskCandidates?.find(p => p.id === candidateId);
    const proposal = candidateId === undefined ? turn.answer.proposals.find(p => p.field === 'nextAction')
      : candidate ? { after: candidate.goal } : undefined;
    const normalized = title.replace(/[\r\n]+/g, ' ').trim();
    const relation: TaskRelation = { schemaVersion: 1, parentId, chatId, turnId: turn.id, panel: 'Discuss', ...(candidateId !== undefined ? { candidateId } : {}) };
    if (turn.context.scope !== 'bundle-only' || turn.context.vaultId !== this.ID
      || this.GetThink(parentId)?.ContentType !== 'bundle' || this.GetThink(chatId)?.ContentType !== 'chat'
      || !proposal || !readTaskRelation(relation) || !normalized || normalized.length > 200) {
      throw new Error('サブ課題の対象・提案・課題名を確認してください。');
    }
    const key = JSON.stringify([parentId, chatId, turn.id, candidateId]);
    const pending = this._subtaskCreations.get(key);
    if (pending) {
      if (pending.isCurrent()) {
        const created = await pending.promise;
        if (!isCurrent()) throw new Error('アプリの処理期間が終了しました。');
        return created;
      }
      // 旧保存の楽観登録を再利用しないよう、確定または巻戻し後に新寿命で再解決する。
      try { await pending.promise; } catch { /* 旧寿命の失敗は新しい要求へ引き継がない。 */ }
      if (!isCurrent()) throw new Error('アプリの処理期間が終了しました。');
      return this.CreateSubtaskFromConversation(turn, chatId, title, candidateId, isCurrent);
    }
    const existing = this.GetBundles().find(b => {
      const r = readTaskRelation(b.Metadata.taskRelation);
      return r?.parentId === parentId && r.chatId === chatId && r.turnId === turn.id && r.candidateId === candidateId;
    });
    if (existing) return existing;
    const now = new Date().toISOString();
    const thinkSupport: ThinkSupportRecord = { schemaVersion: 1, revision: 1, author: 'human', confirmedAt: now,
      updatedAt: now, values: { ...emptyThinkValues(), goal: proposal.after, completionCriteria: candidate?.completionCriteria ?? '' }, sources: {} };
    readThinkSupport(thinkSupport);
    const creation = { promise: this._createBundle({ prefix: '', title: normalized, ids: [chatId], thinkSupport, taskRelation: relation, isCurrent }), isCurrent };
    this._subtaskCreations.set(key, creation);
    try {
      const created = await creation.promise;
      if (!isCurrent()) throw new Error('アプリの処理期間が終了しました。');
      return created;
    } finally { if (this._subtaskCreations.get(key) === creation) this._subtaskCreations.delete(key); }
  }

  /** 新規の空Thinkを作成して保存する。bundleId を渡すと、そのBundleのIDリストに新しいThinkを追加する。 */
  public async CreateBlankThink(contentType: ContentType, initialName: string = '', bundleId?: string, metadata?: Record<string, unknown>): Promise<TTThink> {
    return this._createThink({ contentType, fullContent: initialName, bundleId,
      ...(metadata ? { metadata: structuredClone(metadata) } : {}) });
  }

  /** 指定した Bundle の ID リストに newId を追加して保存する（内部ヘルパー） */
  public async LinkThinksToBundle(bundleId: string, ids: string[]): Promise<void> {
    for (const id of ids) await this._linkThinkToBundle(bundleId, id);
  }

  private async _linkThinkToBundle(bundleId: string, newId: string): Promise<void> {
    const bundle = this.GetThink(bundleId);
    if (!bundle || bundle.ContentType !== 'bundle') throw new Error('対象Bundleが見つかりません。');
    if (bundle.IsMetaOnly) await bundle.LoadContent();
    if (bundle.IsMetaOnly) throw new Error('Bundle本文を読み込めませんでした。');
    const parsed = parseBundle(bundle.Content);
    if (parsed.ids.includes(newId)) return;
    const newContent = serializeBundle({
      prefix: (parsed.search.query || parsed.search.createdRange || parsed.search.updatedRange) ? '>> ' : '> ',
      title: parsed.title,
      searchQuery: parsed.search.query,
      filterKeyword: parsed.filter.keyword,
      dates: {
        createdDate: parsed.filter.createdRange?.dateStr || parsed.search.createdRange?.dateStr,
        createdRange: parsed.filter.createdRange?.rangeStr || parsed.search.createdRange?.rangeStr,
        updatedDate: parsed.filter.updatedRange?.dateStr || parsed.search.updatedRange?.dateStr,
        updatedRange: parsed.filter.updatedRange?.rangeStr || parsed.search.updatedRange?.rangeStr,
      },
      ids: [...parsed.ids, newId],
    });
    const previousContent = bundle.Content;
    bundle.Content = newContent;
    try { await bundle.SaveContent(); }
    catch (error) { bundle.Content = previousContent; throw error; }
  }

  /** links データ（URL/path リンク集）を作成して保存する */
  public async CreateLinksThink(title: string, url: string): Promise<TTThink> {
    return this._createThink({ contentType: 'links', fullContent: serializeLinks(title, [{ title, url }]) });
  }

  /** チャット会話を TTThink(ContentType='chat') として保存する。
   *  bundleId を渡すと、そのBundleのIDリストに新しいThinkを追加する。 */
  public async CreateChatThink(content: string, bundleId?: string): Promise<TTThink> {
    return this._createThink({ contentType: 'chat', fullContent: content, bundleId });
  }

  /**
   * 固定 ID・初期コンテンツ付きで Think を作成/上書きする。
   * __tt_ui_state__ / __tt_shortcuts__ などのシステム Think 用。
   */
  public async AddThinkWithContent(
    id: string,
    name: string,
    contentType: ContentType,
    keywords: string,
    fullContent: string,
  ): Promise<TTThink> {
    return this._createThink({ id, contentType, keywords, fullContent });
  }

  /** 指定 ID の Think を 保存先から削除しメモリからも除去する。
   *  一部の削除が失敗した場合でも成功した分はメモリからも除去し（サーバーと状態を
   *  一致させる）、失敗した ID を含むエラーを呼び出し元に通知する。 */
  public async DeleteThinks(ids: string[]): Promise<void> {
    const results = await Promise.allSettled(ids.map(id => StorageManager.instance.delete(id)));
    const failedIds: string[] = [];
    results.forEach((result, i) => {
      const id = ids[i];
      if (result.status === 'fulfilled') {
        this._children.delete(id);
      } else {
        failedIds.push(id);
        console.error(`[TTVault] DeleteThinks failed (${id}):`, result.reason);
      }
    });
    this.Count = this._children.size;
    this.InvalidateItemsCache();
    this.NotifyUpdated();
    if (failedIds.length > 0) {
      throw new Error(`一部のThinkの削除に失敗しました: ${failedIds.join(', ')}`);
    }
  }

  // ── ID 生成 ────────────────────────────────────────────────────────

  /** ファイルID を生成する（yyyy-MM-dd-hhmmss 形式）*/
  public static generateId(date: Date = new Date()): string {
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  /** 衝突を避けた ID 生成（同秒衝突時は1秒遡る）*/
  public static generateUniqueId(
    existingIds: Set<string>,
    date: Date = new Date(),
    maxRetries = 60
  ): string {
    let current = new Date(date);
    for (let i = 0; i < maxRetries; i++) {
      const id = TTVault.generateId(current);
      if (!existingIds.has(id)) return id;
      current = new Date(current.getTime() - 1000);
    }
    return `${TTVault.generateId(date)}-${Math.random().toString(36).slice(2, 6)}`;
  }
}
