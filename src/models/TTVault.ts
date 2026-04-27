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
