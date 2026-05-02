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
import { StorageManager } from '../services/storage/StorageManager';

export class TTVault extends TTCollection {
  /** 保管庫名（LocalFS ではディレクトリ名、BigQuery ではテーブル識別子）*/
  public VaultName: string = 'vault';

  /** LocalFS ルートフォルダパス（Local モード用）*/
  public DataFolder: string = './../ThinktankLocal/vault';

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
   * 指定 Thought が参照する Think 群を返す。
   * Thought 本文の ID リスト（`* ID`行）と Filter 文字列（`> filter`行）を両方処理する。
   */
  public GetThinksForThought(thoughtId: string): TTThink[] {
    const thought = this.GetThink(thoughtId);
    if (!thought || thought.ContentType !== 'thought') return [];

    const allThinks = this.GetThinks().filter(t => t.ContentType !== 'thought');

    const ids = thought.getThinkIds();
    const filter = thought.getFilter().toLowerCase();

    // ID リストが指定されている場合はそれを優先
    if (ids.length > 0) {
      return allThinks.filter(t => ids.includes(t.ID));
    }

    // Filter 文字列が指定されている場合はタイトル+キーワードで絞り込む
    if (filter) {
      return allThinks.filter(t => {
        const text = `${t.Name} ${t.Keywords}`.toLowerCase();
        return text.includes(filter);
      });
    }

    // 両方空 = 全件対象
    return allThinks;
  }

  /**
   * 指定 Thought が参照する Think 群を非同期で返す（全文検索も含む）。
   * Step 1: `* {id}` 行から ID を収集
   * Step 2: getFilter() でキーワードフィルター（Name に含むものを追加）
   * Step 3: getSearchQuery() で全文検索し、thought 以外の結果を追加
   * 重複排除して TTThink[] を返す。
   */
  public async GetThinksForThoughtAsync(thoughtId: string): Promise<TTThink[]> {
    const thought = this.GetThink(thoughtId);
    if (!thought || thought.ContentType !== 'thought') return [];

    if (thought.IsMetaOnly) await thought.LoadContent();

    const allThinks = this.GetThinks().filter(t => t.ContentType !== 'thought');
    const idSet = new Set<string>();

    // Step 1: collect IDs from `* {id}` lines
    for (const id of thought.getThinkIds()) {
      idSet.add(id);
    }

    // Step 2: keyword filter — search all Think Names containing the keyword
    const filter = thought.getFilter().toLowerCase();
    if (filter) {
      for (const t of allThinks) {
        const text = `${t.Name} ${t.Keywords}`.toLowerCase();
        if (text.includes(filter)) idSet.add(t.ID);
      }
    }

    // Step 3: full-text search — call StorageManager.instance.search(query)
    const query = thought.getSearchQuery();
    if (query) {
      try {
        const metas = await StorageManager.instance.search(query);
        for (const meta of metas) {
          if (meta.contentType !== 'thought') idSet.add(meta.id);
        }
      } catch (e) {
        console.error('[TTVault] GetThinksForThoughtAsync search failed:', e);
      }
    }

    // If nothing was specified at all, return all non-thought thinks
    if (idSet.size === 0 && !filter && !query && thought.getThinkIds().length === 0) {
      return allThinks;
    }

    // Deduplicate and return TTThink[] for matching IDs
    const idMap = new Map(allThinks.map(t => [t.ID, t]));
    return [...idSet].map(id => idMap.get(id)).filter((t): t is TTThink => t !== undefined);
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

  public override async LoadCache(): Promise<void> {
    try {
      const metas = await StorageManager.instance.listMeta();
      for (const meta of metas) {
        const think = new TTThink();
        think.ID          = meta.id;
        think.VaultID     = this.ID;
        think.ContentType = meta.contentType as ContentType;
        think.Keywords    = meta.keywords  ?? '';
        think.RelatedIDs  = meta.relatedIds ?? '';
        think.IsMetaOnly  = true;
        think.UpdatedAt   = meta.updatedAt ?? '';
        think.setContentSilent(meta.title);
        think.markSaved();
        think._parent = this;
        this._children.set(think.ID, think);
      }
      this.Count    = this._children.size;
      this.IsLoaded = true;
      super.NotifyUpdated(false);
      console.log(`[TTVault] LoadCache: ${this.Count} items loaded (vault=${this.ID})`);
    } catch (e) {
      console.error('[TTVault] LoadCache failed:', e);
      this.IsLoaded = true;
    }
  }

  /** 複数 thought を合成した新 thought を作成する
   *  各 thought の ThinkID を展開・重複排除して `* id` 行にまとめる
   *  タイトル: {count1}件＋{count2}件：{name1}＋{name2}＋...
   */
  public async CreateThoughtFromThoughts(ids: string[]): Promise<TTThink> {
    const names: string[] = [];
    const allThinkIds = new Set<string>();
    for (const id of ids) {
      const think = this.GetThink(id);
      if (think?.ContentType === 'thought') {
        if (think.IsMetaOnly) await think.LoadContent();
        names.push(think.Name);
        const thinks = await this.GetThinksForThoughtAsync(id);
        for (const t of thinks) allThinkIds.add(t.ID);
      } else {
        names.push(think?.Name ?? id);
        allThinkIds.add(id);
      }
    }
    const uniqueIds = [...allThinkIds];
    const namesJoined = names.join('＋');
    const namesTruncated = namesJoined.length > 100 ? namesJoined.slice(0, 100) : namesJoined;
    return this._createThought(
      `${uniqueIds.length}件：${namesTruncated}`,
      uniqueIds.map(id => `* ${id}`).join('\n'),
      uniqueIds.join(','),
    );
  }

  /** チェックされた ID 群から thought を新規作成して保存する */
  public async CreateThoughtFromIds(ids: string[], filter?: string): Promise<TTThink> {
    const existingIds = new Set(this._children.keys());
    const newId = TTVault.generateUniqueId(existingIds);

    // thought種別のIDはそのコンテンツ内のIDsに展開する
    const resolvedIds: string[] = [];
    for (const id of ids) {
      const think = this.GetThink(id);
      if (think?.ContentType === 'thought') {
        if (think.IsMetaOnly) await think.LoadContent();
        const subIds = think.getThinkIds();
        resolvedIds.push(...subIds);
      } else {
        resolvedIds.push(id);
      }
    }
    const uniqueIds = [...new Set(resolvedIds)];

    let resolvedTitle: string;
    if (filter && filter.trim()) {
      resolvedTitle = `フィルター：${filter.trim()}`;
    } else if (ids.length === 1) {
      const firstName = this._children.get(ids[0])?.Name ?? ids[0];
      resolvedTitle = `チェック：${firstName.slice(0, 10)}`;
    } else {
      const names = ids.map(id => this._children.get(id)?.Name ?? id).join('・');
      resolvedTitle = `複合：${names}`;
    }
    const body  = uniqueIds.map(id => `* ${id}`).join('\n');
    const fullContent = `${resolvedTitle}\n${body}`;

    const think = new TTThink();
    think.ID          = newId;
    think.VaultID     = this.ID;
    think.ContentType = 'thought';
    think.IsMetaOnly  = false;
    think.setContentSilent(fullContent);
    think._parent     = this;
    this._children.set(newId, think);
    this.Count = this._children.size;

    await StorageManager.instance.save({
      id:          newId,
      contentType: 'thought',
      fullContent,
      keywords:    '',
      relatedIds:  uniqueIds.join(','),
    });
    think.markSaved();
    this.NotifyUpdated();
    return think;
  }

  /** thought新規作成の共通ロジック */
  private async _createThought(title: string, body: string, relatedIds: string): Promise<TTThink> {
    const existingIds = new Set(this._children.keys());
    const newId = TTVault.generateUniqueId(existingIds);
    const fullContent = `${title}\n${body}`;

    const think = new TTThink();
    think.ID          = newId;
    think.VaultID     = this.ID;
    think.ContentType = 'thought';
    think.IsMetaOnly  = false;
    think.setContentSilent(fullContent);
    think._parent     = this;
    this._children.set(newId, think);
    this.Count = this._children.size;

    await StorageManager.instance.save({
      id:          newId,
      contentType: 'thought',
      fullContent,
      keywords:    '',
      relatedIds,
    });
    think.markSaved();
    this.NotifyUpdated();
    return think;
  }

  /** 全文検索クエリからthoughtを新規作成して保存する
   *  ids なし → 検索：{query}      / >> {query}
   *  ids あり → {件数}件：{query}  / * {id}...
   */
  public async CreateThoughtFromSearch(query: string, ids: string[]): Promise<TTThink> {
    if (ids.length === 0) {
      return this._createThought(`検索：${query}`, `>> ${query}`, '');
    }
    return this._createThought(
      `${ids.length}件：${query}`,
      ids.map(id => `* ${id}`).join('\n'),
      ids.join(','),
    );
  }

  /** フィルターキーワードからthoughtを新規作成して保存する
   *  ids なし → フィルター：{keyword}    / > {keyword}
   *  ids あり → {件数}件：{keyword}      / * {id}...
   */
  public async CreateThoughtFromFilter(keyword: string, ids: string[]): Promise<TTThink> {
    if (ids.length === 0) {
      return this._createThought(`フィルタ：${keyword}`, `> ${keyword}`, '');
    }
    return this._createThought(
      `${ids.length}件：${keyword}`,
      ids.map(id => `* ${id}`).join('\n'),
      ids.join(','),
    );
  }

  /** 新規の空Thinkを作成して保存する */
  public async CreateBlankThink(contentType: ContentType, initialName: string = ''): Promise<TTThink> {
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

    await StorageManager.instance.save({
      id:          newId,
      contentType: contentType,
      fullContent: initialName,
      keywords:    '',
      relatedIds:  '',
    });
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

    await StorageManager.instance.save({
      id:          newId,
      contentType: 'chat',
      fullContent: content,
      keywords:    '',
      relatedIds:  '',
    });
    think.markSaved();

    if (thoughtId) {
      const thought = this.GetThink(thoughtId);
      if (thought && thought.ContentType === 'thought') {
        if (thought.IsMetaOnly) await thought.LoadContent();
        const existingIds2 = thought.getThinkIds();
        const nonIdLines = thought.Content.split('\n').filter(l => !l.startsWith('* '));
        const newContent  = [...nonIdLines, ...existingIds2.map(id => `* ${id}`), `* ${newId}`].join('\n');
        thought.Content = newContent;
        await thought.SaveContent();
      }
    }

    this.NotifyUpdated();
    return think;
  }

  /** 指定 ID の Think を BQ から削除しメモリからも除去する */
  public async DeleteThinks(ids: string[]): Promise<void> {
    await Promise.all(ids.map(id => StorageManager.instance.delete(id)));
    for (const id of ids) {
      this._children.delete(id);
    }
    this.Count = this._children.size;
    this.NotifyUpdated();
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
