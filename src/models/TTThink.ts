/**
 * TTThink.ts
 * v5 個別データアイテム（旧 TTDataItem を v5 仕様にリネーム・更新）
 *
 * データ階層: TTVault > Bundles > Bundle > Think
 * Think = 個別データアイテム（BigQueryの1レコード）
 * Bundle = ContentType='bundle' の TTThink（ThinkIDリスト or Filter文字列を本文に持つ）
 */

import { TTObject } from './TTObject';
import type { ContentType } from '../types';
import { StorageManager } from '../services/storage/StorageManager';
import { parseBundle } from '../utils/thinkFormat';

export class TTThink extends TTObject {
  /** コンテンツ種別 */
  public ContentType: ContentType = 'memo';

  /** 所属TTVaultのID（データ階層のための必須フィールド）*/
  public VaultID: string = '';

  /** 検索用キーワード（カンマ区切り） */
  public Keywords: string = '';

  /** 関連アイテム ID 群（カンマ区切り） */
  public RelatedIDs: string = '';

  /** 表示・編集状態のメタデータ */
  public Metadata: Record<string, any> = {};

  private _metadataSaved: string = '{}';

  public get IsMetadataDirty(): boolean {
    return JSON.stringify(this.Metadata) !== this._metadataSaved;
  }

  public markMetadataSaved(): void {
    this._metadataSaved = JSON.stringify(this.Metadata);
  }

  /** true = メタデータのみ取得済み、content は未フェッチ */
  public IsMetaOnly: boolean = false;

  /** 最終更新日時（ISO 8601文字列、ストレージから取得）*/
  public UpdatedAt: string = '';

  // ── コンテンツ管理 ──────────────────────────────────────────────────

  private _content: string = '';
  private _savedContent: string = '';

  public override get ClassName(): string {
    return 'TTThink';
  }

  constructor() {
    super();
    this.ID = this.UpdateDate;
    this.Name = '新しいメモ';
  }

  // ── Content プロパティ ─────────────────────────────────────────────

  public get Content(): string {
    return this._content;
  }

  public set Content(value: string) {
    const normalized = TTThink.normalize(value);
    if (TTThink.normalize(this._content) === normalized) return;
    this._content = value;
    this._extractTitle();
    this.NotifyUpdated();
  }

  /** 通知なしでコンテンツをセット（外部ロード・メタデータ同期用）*/
  public setContentSilent(value: string): void {
    const stripped = value.startsWith('\uFEFF') ? value.slice(1) : value;
    if (TTThink.normalize(this._content) === TTThink.normalize(stripped)) return;
    this._content = stripped;
    this._extractTitle();
  }

  // ── 変更検出 ───────────────────────────────────────────────────────

  public get IsDirty(): boolean {
    return TTThink.normalize(this._content) !== TTThink.normalize(this._savedContent);
  }

  public markSaved(): void {
    this._savedContent = this._content;
  }

  // ── ストレージ連携（Phase 13）──────────────────────────────────────

  public async LoadContent(force: boolean = false): Promise<void> {
    if (!this.IsMetaOnly && !force) return;
    try {
      const body = await StorageManager.instance.getContent(this.ID);
      if (body !== null) {
        // _content at this point is the raw title line from LoadCache (e.g. "# My Memo")
        // Use it directly instead of this.Name which has the # prefix stripped
        const titleLine = this._content ? this._content.split('\n')[0] : `# ${this.Name}`;
        this.setContentSilent(titleLine + '\n' + body);
        this.markSaved();
      }
      // 取得成功時（404で body===null の場合を含む）のみ IsMetaOnly を解除する。
      // 例外時に解除すると、一過性の通信失敗（Localモード起動直後のAPIサーバー
      // 未起動など）を「ロード済みだが空」として確定させ、二度と再取得されなくなる。
      this.IsMetaOnly = false;
    } catch (e) {
      console.error(`[TTThink] LoadContent failed (${this.ID}):`, e);
    }
  }

  public async SaveContent(force: boolean = false): Promise<void> {
    if (!this.IsDirty && !this.IsMetadataDirty && !force) return;
    try {
      const meta = await StorageManager.instance.save({
        id:          this.ID,
        contentType: this.ContentType,
        fullContent: this.Content,
        keywords:    this.Keywords,
        relatedIds:  this.RelatedIDs,
        metadata:    this.Metadata,
      });
      // 保存成功後: サーバーが返した updatedAt を反映
      if (meta.updatedAt) {
        this.UpdatedAt = meta.updatedAt;
      }
      this.markSaved();
      this.markMetadataSaved();
      // 親 Vault に通知してDataGridを再描画させる（UpdateDateは自分自身では更新しない）
      if (this._parent) {
        this._parent.NotifyUpdated(false);
      }
    } catch (e) {
      // 呼び出し元が保存失敗を検知できるよう、ログのみで握りつぶさず再送出する。
      // ここで飲み込むと「保存済みのはずが実は保存されていない」というデータ消失に繋がる。
      console.error(`[TTThink] SaveContent failed (${this.ID}):`, e);
      throw e;
    }
  }


  // ── ヘルパー ───────────────────────────────────────────────────────

  /** bundle本文からThinkIDリストを取得する（ContentType='bundle'専用）*/
  public getThinkIds(): string[] {
    if (this.ContentType !== 'bundle') return [];
    return parseBundle(this._content).ids;
  }

  private _extractTitle(): void {
    if (!this._content) {
      this.Name = '新しいメモ';
      return;
    }
    const firstLine = this._content.split('\n')[0].trim();
    let title = firstLine.replace(/^#+\s*/, '');
    if (this.ContentType === 'bundle') {
      title = title.replace(/^>>?\s*/, '');
    }
    this.Name = title || '新しいメモ';
  }

  private static normalize(s: string): string {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
}
