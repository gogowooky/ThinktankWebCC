/**
 * TTVaultCreation.ts
 * Think の作成（Project・タスク・サブタスク・メモ・linkファイル・AIまとめ・chat など）と Project への登録。
 * TTVault（TTVault.ts）の土台として継承して使う。子クラスから使うメンバーは protected にしている。
 */

import { TTThink } from './TTThink';
import type { ContentType } from '../types';
import { StorageManager } from '../services/storage/StorageManager';
import { PROJECT_TITLE_PLACEHOLDER, parseProject, projectTargetIds, serializeProject, updateProjectTargets } from '../utils/thinkFormat';
import { fetchLinkTitle } from '../services/linkTitleService';
import { createLinkFile, linkTargetKey, parseLinkFile, serializeLinkFile, type LinkSource } from '../utils/linkFormat';
import { emptyThinkValues, readThinkSupport, type ThinkSupportRecord } from '../../shared/contracts/thinkSupportRecord';
import type { TaskSeed } from '../services/taskSeed';
import { readTaskRelation, type TaskRelation } from '../services/taskRelation';
import type { ConversationTurn } from '../services/ConversationService';
import { validateSubtaskCandidates } from '../../shared/contracts/lifecycleProposals';
import { TTVaultStore } from './TTVaultStore';
import { TTVaultProjects } from './TTVaultProjects';

export abstract class TTVaultCreation extends TTVaultProjects {
  /** 複数 bundle を合成した新 bundle を作成する
   *  各 bundle の ThinkID を展開・重複排除して `* id` 行にまとめる
   *  タイトル: {count1}件＋{count2}件：{name1}＋{name2}＋...
   */
  /** Project一覧モード: 複数 project を合成した新 project を作成する */
  public async CreateProjectFromProjects(ids: string[]): Promise<TTThink> {
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
    const title = `${uniqueIds.length}件：Projectファイルの連結（${uniqueIds.join(' x ')}）`;

    return this._createProject({
      title,
      ids: uniqueIds
    });
  }

  /** @deprecated Use CreateProjectFromProjects */
  public CreateBundleFromBundles(ids: string[]): Promise<TTThink> {
    return this.CreateProjectFromProjects(ids);
  }

  /** Think ID の固定リストから Project を作成する。 */
  public async CreateProjectFromIds(ids: string[]): Promise<TTThink> {
    const uniqueIds = [...new Set(ids)];
    const firstName = uniqueIds.length > 0 ? (this.GetThink(uniqueIds[0])?.Name ?? uniqueIds[0]) : '';
    const title = uniqueIds.length > 0
      ? `${uniqueIds.length}件：含む「${firstName}」`
      : '0件：Thinkファイルの一覧';
    return this._createProject({ title, ids: uniqueIds });
  }

  /** @deprecated Use CreateProjectFromIds */
  public CreateBundleFromIds(ids: string[]): Promise<TTThink> {
    return this.CreateProjectFromIds(ids);
  }

  /**
   * 規定フォーマットのテンプレート Project ファイルを作成して保存する。
   * parentProjectId を渡すと、その Project の # 対象 に新しい Project を載せる（配下に作る）。
   */
  public CreateProject(title: string = PROJECT_TITLE_PLACEHOLDER, parentProjectId?: string): Promise<TTThink> {
    return this._createProject({ title, ...(parentProjectId ? { parentProjectId } : {}) });
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
    const id = options.id ?? TTVaultStore.generateUniqueId(new Set(this._children.keys()));
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
    if (contentType === 'project') await this.SyncParentProjectIds(id, [], parseProject(fullContent).ids);
    if (bundleId) await this._linkThinkToProject(bundleId, id);
    this.NotifyUpdated();
    return think;
  }

  /** project新規作成の共通ロジック */
  private async _createProject(options: {
    title: string,
    ids?: string[],
    thinkSupport?: ThinkSupportRecord,
    taskRelation?: TaskRelation,
    originChatId?: string,
    isCurrent?: () => boolean,
    parentProjectId?: string,
  }): Promise<TTThink> {
    const { title, ids = [] } = options;
    const items = ids.map(id => {
      const target = this.GetThink(id);
      return {
        id,
        contentType: target?.ContentType ?? 'memo',
        title: target?.Name || undefined,
      };
    });
    const fullContent = serializeProject({ title, items });
    const metadata = {
      ...(options.thinkSupport ? { thinkSupport: options.thinkSupport } : {}),
      ...(options.originChatId ? { taskOrigin: { schemaVersion: 1, chatId: options.originChatId } } : {}),
      ...(options.taskRelation ? { taskRelation: options.taskRelation } : {}),
    };
    return this._createThink({ contentType: 'project', fullContent, relatedIds: ids.join(','),
      ...(Object.keys(metadata).length ? { metadata } : {}), ...(options.isCurrent ? { isCurrent: options.isCurrent } : {}),
      ...(options.parentProjectId ? { bundleId: options.parentProjectId } : {}) });
  }

  /** 本人が採用した課題名と関連資料から、1課題を表すProjectを作成する。 */
  public async CreateTaskProject(title: string, ids: string[], seed?: TaskSeed, originChatId?: string, isCurrent?: () => boolean): Promise<TTThink> {
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
    return this._createProject({ title: normalizedTitle, ids: uniqueIds, thinkSupport, originChatId, isCurrent });
  }

  /** @deprecated Use CreateTaskProject */
  public CreateTaskBundle(title: string, ids: string[], seed?: TaskSeed, originChatId?: string, isCurrent?: () => boolean): Promise<TTThink> {
    return this.CreateTaskProject(title, ids, seed, originChatId, isCurrent);
  }

  /** Candidate identity keeps retries separate without rewriting the parent Project. */
  public async CreateSubtaskFromConversation(turn: ConversationTurn, chatId: string, title: string, candidateId?: string, isCurrent: () => boolean = () => true): Promise<TTThink> {
    if (!isCurrent()) throw new Error('アプリの処理期間が終了しました。');
    if (candidateId !== undefined) validateSubtaskCandidates(turn.answer.subtaskCandidates, turn.context.scope);
    const parentId = turn.context.bundleId;
    const candidate = candidateId === undefined ? undefined : turn.answer.subtaskCandidates?.find(p => p.id === candidateId);
    const proposal = candidateId === undefined ? turn.answer.proposals.find(p => p.field === 'nextAction')
      : candidate ? { after: candidate.goal } : undefined;
    const normalized = title.replace(/[\r\n]+/g, ' ').trim();
    const relation: TaskRelation = { schemaVersion: 1, parentId, chatId, turnId: turn.id, panel: 'Working', ...(candidateId !== undefined ? { candidateId } : {}) };
    const parentThink = this.GetThink(parentId);
    const isParentProject = parentThink?.ContentType === 'project' || (parentThink?.ContentType as string) === 'bundle';
    if (turn.context.scope !== 'bundle-only' || turn.context.vaultId !== this.ID
      || !isParentProject || this.GetThink(chatId)?.ContentType !== 'chat'
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
    const existing = this.GetProjects().find(b => {
      const r = readTaskRelation(b.Metadata.taskRelation);
      return r?.parentId === parentId && r.chatId === chatId && r.turnId === turn.id && r.candidateId === candidateId;
    });
    if (existing) return existing;
    const now = new Date().toISOString();
    const thinkSupport: ThinkSupportRecord = { schemaVersion: 1, revision: 1, author: 'human', confirmedAt: now,
      updatedAt: now, values: { ...emptyThinkValues(), goal: proposal.after, completionCriteria: candidate?.completionCriteria ?? '' }, sources: {} };
    readThinkSupport(thinkSupport);
    const creation = { promise: this._createProject({ title: normalized, ids: [chatId], thinkSupport, taskRelation: relation, isCurrent }), isCurrent };
    this._subtaskCreations.set(key, creation);
    try {
      const created = await creation.promise;
      if (!isCurrent()) throw new Error('アプリの処理期間が終了しました。');
      return created;
    } finally { if (this._subtaskCreations.get(key) === creation) this._subtaskCreations.delete(key); }
  }

  /** 新規の空Thinkを作成して保存する。bundleId を渡すと、そのProjectのIDリストに新しいThinkを追加する。 */
  public async CreateBlankThink(contentType: ContentType, initialName: string = '', bundleId?: string, metadata?: Record<string, unknown>): Promise<TTThink> {
    return this._createThink({ contentType, fullContent: initialName, bundleId,
      ...(metadata ? { metadata: structuredClone(metadata) } : {}) });
  }

  /** 指定した Project の ID リストに newId を追加して保存する（内部ヘルパー） */
  public async LinkThinksToProject(bundleId: string, ids: string[]): Promise<void> {
    for (const id of ids) await this._linkThinkToProject(bundleId, id);
  }

  /** @deprecated Use LinkThinksToProject */
  public LinkThinksToBundle(bundleId: string, ids: string[]): Promise<void> {
    return this.LinkThinksToProject(bundleId, ids);
  }

  private async _linkThinkToProject(bundleId: string, newId: string): Promise<void> {
    const bundle = this.GetThink(bundleId);
    const isProject = bundle?.ContentType === 'project' || (bundle?.ContentType as string) === 'bundle';
    if (!bundle || !isProject) throw new Error('対象Projectが見つかりません。');
    if (bundle.IsMetaOnly) await bundle.LoadContent();
    if (bundle.IsMetaOnly) throw new Error('Project本文を読み込めませんでした。');
    const targetIds = projectTargetIds(bundle.Content);
    if (targetIds.includes(newId)) return;
    const allIds = [...targetIds, newId];
    const items = allIds.map(id => {
      const target = this.GetThink(id);
      return {
        id,
        contentType: target?.ContentType ?? 'memo',
        title: target?.Name || undefined,
      };
    });
    const newContent = updateProjectTargets(bundle.Content, items);
    const previousContent = bundle.Content;
    bundle.Content = newContent;
    try { await bundle.SaveContent(); }
    catch (error) { bundle.Content = previousContent; throw error; }
  }

  /** 同じリンク先の linkファイルを探す。本文未読込のものは Metadata.linkTarget が無ければ読んで確かめる */
  public async FindLinksThink(target: string): Promise<TTThink | undefined> {
    const key = linkTargetKey(target);
    if (!key) return undefined;
    const links = this.GetThinks().filter(t => t.ContentType === 'links');
    const matches = (t: TTThink): boolean => {
      if (!t.IsMetaOnly) {
        const file = parseLinkFile(t.Content);
        return !!file && linkTargetKey(file.link) === key;
      }
      const recorded = t.Metadata?.linkTarget;
      return typeof recorded === 'string' && linkTargetKey(recorded) === key;
    };
    const found = links.find(matches);
    if (found) return found;
    const unknown = links.filter(t => t.IsMetaOnly && typeof t.Metadata?.linkTarget !== 'string');
    // 一度に大量の本文取得を投げないよう、少しずつ読む
    const BATCH = 20;
    for (let i = 0; i < unknown.length; i += BATCH) {
      const batch = unknown.slice(i, i + BATCH);
      await Promise.all(batch.map(t => t.LoadContent().catch(() => undefined)));
      const hit = batch.find(t => !t.IsMetaOnly && matches(t));
      if (hit) return hit;
    }
    return undefined;
  }

  /**
   * 1件の URL/パスをまとめた linkファイルを用意する（書式は utils/linkFormat.ts）。
   * 同じリンク先の linkファイルがあれば新しく作らずそれを返す（1リンク=1ファイル）。
   */
  public async GetOrCreateLinksThink(source: LinkSource, pcName: string = '', bundleId?: string): Promise<{ think: TTThink; created: boolean }> {
    const existing = await this.FindLinksThink(source.target);
    if (existing) {
      if (bundleId) await this._linkThinkToProject(bundleId, existing.ID);
      return { think: existing, created: false };
    }
    // GDrive/GMail は利用者の GAS に名前・件名を問い合わせる（ドラッグ情報のリンク文字より確か）。
    // GAS が未設定・失敗ならドラッグ情報のタイトルを使う
    const pageTitle = await fetchLinkTitle(source.target) ?? source.pageTitle;
    return { think: await this.CreateLinksThink(pageTitle ? { ...source, pageTitle } : source, pcName, bundleId), created: true };
  }

  /** 重複を確かめずに linkファイルを作成する。通常は GetOrCreateLinksThink を使う */
  public CreateLinksThink(source: LinkSource, pcName: string = '', bundleId?: string): Promise<TTThink> {
    return this._createThink({
      contentType: 'links',
      fullContent: serializeLinkFile(createLinkFile(source, pcName)),
      // 一覧のメタデータだけで重複を判定できるよう、リンク先を控えておく
      metadata: { linkTarget: source.target },
      ...(bundleId ? { bundleId } : {}),
    });
  }

  /** AI が書いた本文を AIViewファイル（UIでは読み取り専用）として保存する */
  public async CreateAiViewThink(content: string): Promise<TTThink> {
    return this._createThink({ contentType: 'aiview', fullContent: content });
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
}
