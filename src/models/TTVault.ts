/**
 * TTVault.ts
 * v5 保管庫クラス。TTCollection の派生クラス。
 *
 * データ階層: TTVault > Thoughts > Thought > Think
 *
 * LocalFS パス: ./../ThinktankLocal/vault/{ContentType}/{ID}.md
 * BigQuery テーブル: thinktank.vault
 */

import { TTCollection } from './TTCollection';
import { TTThink } from './TTThink';
import { TTObject } from './TTObject';
import type { ContentType } from '../types';
import { TTModels } from './TTModels';
import { formatDateRangeJapanese, computeDateRange } from '../utils/dateUtils';
import { StorageManager } from '../services/storage/StorageManager';
import { parseThought, serializeThought, serializeLinks } from '../utils/thinkFormat';

export class TTVault extends TTCollection {
  /** 保管庫名（LocalFS ではディレクトリ名、BigQuery ではテーブル識別子）*/
  public VaultName: string = 'vault';

  /** LocalFS ルートフォルダパス（Local モード用）*/
  public DataFolder: string = './../ThinktankLocal/vault';

  /** GetThinksForThoughtAsync の結果をキャッシュする（同期版 GetThinksForThought 用）*/
  private _thoughtThinksCache: Map<string, string[]> = new Map();

  public override get ClassName(): string {
    return 'TTVault';
  }

  constructor(vaultName: string = 'vault') {
    super();
    this.ID = vaultName;
    this.VaultName = vaultName;
    this.Name = vaultName;
    this.ItemSaveProperties = 'ID,Name,ContentType,Keywords,VaultID,UpdateDate';
  }

  // ── 型付きアクセス ─────────────────────────────────────────────────

  /** 全 TTThink を型付きで取得する */
  public GetThinks(): TTThink[] {
    return this.GetItems().filter((item): item is TTThink => item instanceof TTThink);
  }

  /**
   * Thoughts を取得する（ContentType='thought' の TTThink 一覧）
   * Thoughts = TTVault を ContentType='thought' でフィルターした集合
   */
  public GetThoughts(): TTThink[] {
    return this.GetThinks().filter(t => t.ContentType === 'thought');
  }


  /**
   * 指定 Thought が参照する Think 群を非同期で返す（全文検索も含む）。
   * 複数 thought File がある場合はタイトル行以外の行をすべてマージする。
   * - `>` 行: Keyword、作成日、更新日で Filter
   * - `>>` 行: 検索語、作成日、更新日で全文検索
   * - `*` 行: 直接 ID 指定
   * 重複排除して TTThink[] を返す。
   */
  public async GetThinksForThoughtAsync(thoughtId: string): Promise<TTThink[]> {
    const rootThought = this.GetThink(thoughtId);
    if (!rootThought || rootThought.ContentType !== 'thought') return [];

    const allThinks = this.GetThinks().filter(t => t.ContentType !== 'thought');
    const finalIds = new Set<string>();
    const excludeIds = new Set<string>();

    // 解析用パラメータ
    let filterKeyword = '';
    let filterCreatedRange: { from: string; to: string } | null = null;
    let filterUpdatedRange: { from: string; to: string } | null = null;
    
    let searchQuery = '';
    let searchCreatedRange: { from: string; to: string } | null = null;
    let searchUpdatedRange: { from: string; to: string } | null = null;

    // 再帰的にパラメータを収集
    const collectParams = async (tid: string, visited: Set<string>) => {
      if (visited.has(tid)) return;
      visited.add(tid);

      const t = this.GetThink(tid);
      if (!t || t.ContentType !== 'thought') return;
      if (t.IsMetaOnly) await t.LoadContent();

      const parsed = parseThought(t.Content);

      for (const id of parsed.ids) {
        const sub = this.GetThink(id);
        if (sub?.ContentType === 'thought') {
          await collectParams(id, visited);
        } else {
          finalIds.add(id);
        }
      }

      if (parsed.excludeIds) {
        parsed.excludeIds.forEach(id => excludeIds.add(id));
      }

      if (parsed.search.query) searchQuery = parsed.search.query;
      if (parsed.search.createdRange) {
        searchCreatedRange = computeDateRange(parsed.search.createdRange.dateStr, parsed.search.createdRange.rangeStr);
      }
      if (parsed.search.updatedRange) {
        searchUpdatedRange = computeDateRange(parsed.search.updatedRange.dateStr, parsed.search.updatedRange.rangeStr);
      }

      if (parsed.filter.keyword) filterKeyword = parsed.filter.keyword;
      if (parsed.filter.createdRange) {
        filterCreatedRange = computeDateRange(parsed.filter.createdRange.dateStr, parsed.filter.createdRange.rangeStr);
      }
      if (parsed.filter.updatedRange) {
        filterUpdatedRange = computeDateRange(parsed.filter.updatedRange.dateStr, parsed.filter.updatedRange.rangeStr);
      }
    };

    await collectParams(thoughtId, new Set());

    // 1. フィルター実行
    if (filterKeyword || filterCreatedRange || filterUpdatedRange) {
      const q = filterKeyword.toLowerCase();
      for (const t of allThinks) {
        if (q && !`${t.Name} ${t.Keywords}`.toLowerCase().includes(q)) continue;
        if (filterCreatedRange) {
          const range = filterCreatedRange as { from: string; to: string };
          const d = t.ID.slice(0, 10);
          if (d < range.from || d > range.to) continue;
        }
        if (filterUpdatedRange) {
          const range = filterUpdatedRange as { from: string; to: string };
          const d = (t.UpdatedAt || t.ID).slice(0, 10);
          if (d < range.from || d > range.to) continue;
        }
        finalIds.add(t.ID);
      }
    }

    // 2. 全文検索実行
    if (searchQuery || searchCreatedRange || searchUpdatedRange) {
      try {
        const metas = await StorageManager.instance.search(searchQuery);
        for (const meta of metas) {
          if (meta.contentType === 'thought') continue;
          
          // 日付条件チェック
          if (searchCreatedRange) {
            const range = searchCreatedRange as { from: string; to: string };
            const d = meta.id.slice(0, 10);
            if (d < range.from || d > range.to) continue;
          }
          if (searchUpdatedRange) {
            const range = searchUpdatedRange as { from: string; to: string };
            const d = (meta.updatedAt || meta.id).slice(0, 10);
            if (d < range.from || d > range.to) continue;
          }
          finalIds.add(meta.id);
        }
      } catch (e) {
        console.error('[TTVault] GetThinksForThoughtAsync search failed:', e);
      }
    }

    // デフォルト: 何も指定がなければ全データ
    if (finalIds.size === 0 && !filterKeyword && !searchQuery && !filterCreatedRange && !filterUpdatedRange && !searchCreatedRange && !searchUpdatedRange) {
      const result = allThinks.filter(t => !excludeIds.has(t.ID));
      this._thoughtThinksCache.set(thoughtId, result.map(t => t.ID));
      return result;
    }

    for (const id of excludeIds) {
      finalIds.delete(id);
    }

    const idMap = new Map(allThinks.map(t => [t.ID, t]));
    const result = [...finalIds].map(id => idMap.get(id)).filter((t): t is TTThink => t !== undefined);
    this._thoughtThinksCache.set(thoughtId, result.map(t => t.ID));
    return result;
  }

  /** GetThinksForThoughtAsync の同期版（非同期ロードや検索はスキップ）*/
  public GetThinksForThought(thoughtId: string): TTThink[] {
    const cachedIds = this._thoughtThinksCache.get(thoughtId);
    if (cachedIds) {
      const allThinks = this.GetThinks().filter(t => t.ContentType !== 'thought');
      const idMap = new Map(allThinks.map(t => [t.ID, t]));
      return cachedIds.map(id => idMap.get(id)).filter((t): t is TTThink => t !== undefined);
    }

    const rootThought = this.GetThink(thoughtId);
    if (!rootThought || rootThought.ContentType !== 'thought') return [];
    if (rootThought.IsMetaOnly) return []; // 未ロードなら空

    const allThinks = this.GetThinks().filter(t => t.ContentType !== 'thought');
    const finalIds = new Set<string>();
    const excludeIds = new Set<string>();

    let filterKeyword = '';
    let filterCreatedRange: { from: string; to: string } | null = null;
    let filterUpdatedRange: { from: string; to: string } | null = null;
    let searchQuery = '';
    let searchCreatedRange: { from: string; to: string } | null = null;
    let searchUpdatedRange: { from: string; to: string } | null = null;

    const collectParamsSync = (tid: string, visited: Set<string>) => {
      if (visited.has(tid)) return;
      visited.add(tid);
      const t = this.GetThink(tid);
      if (!t || t.ContentType !== 'thought' || t.IsMetaOnly) return;

      const parsed = parseThought(t.Content);

      for (const id of parsed.ids) {
        const sub = this.GetThink(id);
        if (sub?.ContentType === 'thought') collectParamsSync(id, visited);
        else finalIds.add(id);
      }

      if (parsed.excludeIds) {
        parsed.excludeIds.forEach(id => excludeIds.add(id));
      }

      if (parsed.search.query) searchQuery = parsed.search.query;
      if (parsed.search.createdRange) {
        searchCreatedRange = computeDateRange(parsed.search.createdRange.dateStr, parsed.search.createdRange.rangeStr);
      }
      if (parsed.search.updatedRange) {
        searchUpdatedRange = computeDateRange(parsed.search.updatedRange.dateStr, parsed.search.updatedRange.rangeStr);
      }

      if (parsed.filter.keyword) filterKeyword = parsed.filter.keyword;
      if (parsed.filter.createdRange) {
        filterCreatedRange = computeDateRange(parsed.filter.createdRange.dateStr, parsed.filter.createdRange.rangeStr);
      }
      if (parsed.filter.updatedRange) {
        filterUpdatedRange = computeDateRange(parsed.filter.updatedRange.dateStr, parsed.filter.updatedRange.rangeStr);
      }
    };

    collectParamsSync(thoughtId, new Set());

    if (filterKeyword || filterCreatedRange || filterUpdatedRange) {
      const q = filterKeyword.toLowerCase();
      for (const t of allThinks) {
        if (q && !`${t.Name} ${t.Keywords}`.toLowerCase().includes(q)) continue;
        if (filterCreatedRange) {
          const range = filterCreatedRange as { from: string; to: string };
          const d = t.ID.slice(0, 10);
          if (d < range.from || d > range.to) continue;
        }
        if (filterUpdatedRange) {
          const range = filterUpdatedRange as { from: string; to: string };
          const d = (t.UpdatedAt || t.ID).slice(0, 10);
          if (d < range.from || d > range.to) continue;
        }
        finalIds.add(t.ID);
      }
    }

    if (
      finalIds.size === 0 &&
      !filterKeyword &&
      !filterCreatedRange &&
      !filterUpdatedRange &&
      !searchQuery &&
      !searchCreatedRange &&
      !searchUpdatedRange
    ) {
      return allThinks.filter(t => !excludeIds.has(t.ID));
    }

    for (const id of excludeIds) {
      finalIds.delete(id);
    }

    const idMap = new Map(allThinks.map(t => [t.ID, t]));
    return [...finalIds].map(id => idMap.get(id)).filter((t): t is TTThink => t !== undefined);
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

  protected override CreateChildInstance(): TTObject {
    return new TTThink();
  }

  // ── ストレージ連携（Phase 13）────────────────────────────────────────

  /**
   * ローカルAPIモード（ThinktankLocal）では、シェル起動直後にAPIサーバーがまだ
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
          think.ID          = meta.id;
          think.VaultID     = this.ID;
          think.ContentType = meta.contentType as ContentType;
          think.Keywords    = meta.keywords  ?? '';
          think.RelatedIDs  = meta.relatedIds ?? '';
          think.Metadata    = meta.metadata  ?? {};
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

  /** 複数 thought を合成した新 thought を作成する
   *  各 thought の ThinkID を展開・重複排除して `* id` 行にまとめる
   *  タイトル: {count1}件＋{count2}件：{name1}＋{name2}＋...
   */
  /** Thought一覧モード: 複数 thought を合成した新 thought を作成する */
  public async CreateThoughtFromThoughts(ids: string[]): Promise<TTThink> {
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
    const title = `${uniqueIds.length}件：Thoughtファイルの連結（${uniqueIds.join(' x ')}）`;
    
    return this._createThought({
      prefix: '',
      title,
      ids: uniqueIds
    });
  }

  /** Think一覧モード (Filter): チェック済みアイテムまたは条件から作成 */
  public async CreateThoughtFromIds(ids: string[], filter?: string, dates?: { createdDate?: string, createdRange?: string, updatedDate?: string, updatedRange?: string }): Promise<TTThink> {
    const titles: string[] = [];
    if (ids.length > 0) {
      const firstName = this.GetThink(ids[0])?.Name ?? ids[0];
      titles.push(`${ids.length}件：含む「${firstName}」`);
    } else {
      if (filter) titles.push(`フィルター：${filter}`);
      if (dates?.updatedDate || dates?.updatedRange) titles.push(`更新：${formatDateRangeJapanese(dates.updatedDate || '', dates.updatedRange || '')}`);
      if (dates?.createdDate || dates?.createdRange) titles.push(`作成：${formatDateRangeJapanese(dates.createdDate || '', dates.createdRange || '')}`);
    }

    return this._createThought({
      prefix: '> ',
      title: titles.join(' / '),
      filterKeyword: filter,
      ids,
      dates
    });
  }

  /** thought新規作成の共通ロジック */
  private async _createThought(options: {
    prefix: string,
    title: string,
    searchQuery?: string,
    filterKeyword?: string,
    dates?: { createdDate?: string, createdRange?: string, updatedDate?: string, updatedRange?: string },
    ids?: string[]
  }): Promise<TTThink> {
    const { prefix, title, searchQuery, filterKeyword, dates, ids = [] } = options;
    const existingIds = new Set(this._children.keys());
    const newId = TTVault.generateUniqueId(existingIds);

    const fullContent = serializeThought({
      prefix,
      title,
      searchQuery,
      filterKeyword,
      dates: dates ? {
        createdDate: dates.createdDate,
        createdRange: dates.createdRange,
        updatedDate: dates.updatedDate,
        updatedRange: dates.updatedRange,
      } : undefined,
      ids,
    });

    const think = new TTThink();
    think.ID          = newId;
    think.VaultID     = this.ID;
    think.ContentType = 'thought';
    think.IsMetaOnly  = false;
    think.setContentSilent(fullContent);
    think._parent     = this;
    this._children.set(newId, think);
    this.Count = this._children.size;

    try {
      await StorageManager.instance.save({
        id:          newId,
        contentType: 'thought',
        fullContent,
        keywords:    '',
        relatedIds:  ids.join(','),
      });
    } catch (e) {
      // 保存に失敗した場合、サーバーに存在しない「幻の」Thinkをメモリ上に
      // 残さないようロールバックする（次回リロードで消える古い挙動より安全）。
      this._children.delete(newId);
      this.Count = this._children.size;
      throw e;
    }
    think.markSaved();
    this.NotifyUpdated();
    return think;
  }

  /** 全文検索モード: 検索語と条件から作成 */
  public async CreateThoughtFromSearch(query: string, ids: string[], dates?: { createdDate?: string, createdRange?: string, updatedDate?: string, updatedRange?: string }): Promise<TTThink> {
    const titles: string[] = [];
    if (ids.length > 0) {
      const firstName = this.GetThink(ids[0])?.Name ?? ids[0];
      titles.push(`${ids.length}件：含む「${firstName}」`);
    } else {
      if (query) titles.push(`検索語：${query}`);
      if (dates?.updatedDate || dates?.updatedRange) titles.push(`更新：${formatDateRangeJapanese(dates.updatedDate || '', dates.updatedRange || '')}`);
      if (dates?.createdDate || dates?.createdRange) titles.push(`作成：${formatDateRangeJapanese(dates.createdDate || '', dates.createdRange || '')}`);
    }

    return this._createThought({
      prefix: '>> ',
      title: titles.join(' / '),
      searchQuery: query,
      ids,
      dates
    });
  }

  /** フィルターキーワードからthoughtを新規作成して保存する */
  public async CreateThoughtFromFilter(keyword: string, ids: string[], dates?: { createdDate?: string, createdRange?: string, updatedDate?: string, updatedRange?: string }): Promise<TTThink> {
    return this.CreateThoughtFromIds(ids, keyword, dates);
  }

  /** 新規の空Thinkを作成して保存する。thoughtId を渡すと、そのThoughtのIDリストに新しいThinkを追加する。 */
  public async CreateBlankThink(contentType: ContentType, initialName: string = '', thoughtId?: string): Promise<TTThink> {
    const existingIds = new Set(this._children.keys());
    const newId = TTVault.generateUniqueId(existingIds);

    const think = new TTThink();
    think.ID          = newId;
    think.VaultID     = this.ID;
    think.ContentType = contentType;
    think.IsMetaOnly  = false;
    think.setContentSilent(initialName);
    think._parent     = this;
    this._children.set(newId, think);
    this.Count = this._children.size;

    try {
      await StorageManager.instance.save({
        id:          newId,
        contentType: contentType,
        fullContent: initialName,
        keywords:    '',
        relatedIds:  '',
      });
    } catch (e) {
      this._children.delete(newId);
      this.Count = this._children.size;
      throw e;
    }
    think.markSaved();

    if (thoughtId) await this._linkThinkToThought(thoughtId, newId);

    this.NotifyUpdated();
    return think;
  }

  /** 指定した Thought の ID リストに newId を追加して保存する（内部ヘルパー） */
  private async _linkThinkToThought(thoughtId: string, newId: string): Promise<void> {
    const thought = this.GetThink(thoughtId);
    if (!thought || thought.ContentType !== 'thought') return;
    if (thought.IsMetaOnly) await thought.LoadContent();
    const parsed = parseThought(thought.Content);
    const newContent = serializeThought({
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
    thought.Content = newContent;
    await thought.SaveContent();
  }

  /** links データ（URL/path リンク集）を作成して保存する */
  public async CreateLinksThink(title: string, url: string): Promise<TTThink> {
    const existingIds = new Set(this._children.keys());
    const newId       = TTVault.generateUniqueId(existingIds);
    const fullContent = serializeLinks(title, [{ title, url }]);

    const think = new TTThink();
    think.ID          = newId;
    think.VaultID     = this.ID;
    think.ContentType = 'links';
    think.IsMetaOnly  = false;
    think.setContentSilent(fullContent);
    think._parent     = this;
    this._children.set(newId, think);
    this.Count = this._children.size;

    try {
      await StorageManager.instance.save({
        id:          newId,
        contentType: 'links',
        fullContent,
        keywords:    '',
        relatedIds:  '',
      });
    } catch (e) {
      this._children.delete(newId);
      this.Count = this._children.size;
      throw e;
    }
    think.markSaved();
    this.NotifyUpdated();
    return think;
  }

  /** チャット会話を TTThink(ContentType='chat') として保存する。
   *  thoughtId を渡すと、そのThoughtのIDリストに新しいThinkを追加する。 */
  public async CreateChatThink(content: string, thoughtId?: string): Promise<TTThink> {
    const existingIds = new Set(this._children.keys());
    const newId = TTVault.generateUniqueId(existingIds);

    const think = new TTThink();
    think.ID          = newId;
    think.VaultID     = this.ID;
    think.ContentType = 'chat';
    think.IsMetaOnly  = false;
    think.setContentSilent(content);
    think._parent     = this;
    this._children.set(newId, think);
    this.Count = this._children.size;

    try {
      await StorageManager.instance.save({
        id:          newId,
        contentType: 'chat',
        fullContent: content,
        keywords:    '',
        relatedIds:  '',
      });
    } catch (e) {
      this._children.delete(newId);
      this.Count = this._children.size;
      throw e;
    }
    think.markSaved();

    if (thoughtId) await this._linkThinkToThought(thoughtId, newId);

    this.NotifyUpdated();
    return think;
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
    const think = new TTThink();
    think.ID          = id;
    think.VaultID     = this.ID;
    think.ContentType = contentType;
    think.Keywords    = keywords;
    think.IsMetaOnly  = false;
    think.setContentSilent(fullContent);
    think._parent     = this;
    this._children.set(id, think);
    this.Count = this._children.size;
    try {
      await StorageManager.instance.save({ id, contentType, fullContent, keywords, relatedIds: '' });
    } catch (e) {
      this._children.delete(id);
      this.Count = this._children.size;
      throw e;
    }
    think.markSaved();
    this.NotifyUpdated();
    return think;
  }

  /** 指定 ID の Think を BQ から削除しメモリからも除去する。
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
    this.NotifyUpdated();
    if (failedIds.length > 0) {
      throw new Error(`一部のThinkの削除に失敗しました: ${failedIds.join(', ')}`);
    }
  }

  // ── LocalFS パスユーティリティ ─────────────────────────────────────

  public buildLocalPath(contentType: ContentType, id: string): string {
    return `${this.DataFolder}/${contentType}/${id}.md`;
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
