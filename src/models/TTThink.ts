/**
 * TTThink.ts
 * v5 個別データアイテム（旧 TTDataItem を v5 仕様にリネーム・更新）
 *
 * データ階層: TTVault > Thoughts > Thought > Think
 * Think = 個別データアイテム（BigQueryの1レコード）
 * Thought = ContentType='thought' の TTThink（ThinkIDリスト or Filter文字列を本文に持つ）
 */

import { TTObject } from './TTObject';
import type { ContentType } from '../types';
import { StorageManager } from '../services/storage/StorageManager';

export class TTThink extends TTObject {
  /** コンテンツ種別 */
  public ContentType: ContentType = 'memo';

  /** 所属TTVaultのID（データ階層のための必須フィールド）*/
  public VaultID: string = '';

  /** 検索用キーワード（カンマ区切り） */
  public Keywords: string = '';

  /** 関連アイテム ID 群（カンマ区切り） */
  public RelatedIDs: string = '';

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

  public async LoadContent(): Promise<void> {
    if (!this.IsMetaOnly) return;
    try {
      const body = await StorageManager.instance.getContent(this.ID);
      if (body !== null) {
        this.setContentSilent(this.Name + '\n' + body);
        this.markSaved();
      }
    } catch (e) {
      console.error(`[TTThink] LoadContent failed (${this.ID}):`, e);
    }
    this.IsMetaOnly = false;
  }

  public async SaveContent(): Promise<void> {
    if (!this.IsDirty) return;
    try {
      await StorageManager.instance.save({
        id:          this.ID,
        contentType: this.ContentType,
        fullContent: this.Content,
        keywords:    this.Keywords,
        relatedIds:  this.RelatedIDs,
      });
      this.markSaved();
    } catch (e) {
      console.error(`[TTThink] SaveContent failed (${this.ID}):`, e);
    }
  }

  // ── ヘルパー ───────────────────────────────────────────────────────

  /** thought本文からThinkIDリストを取得する（ContentType='thought'専用）*/
  public getThinkIds(): string[] {
    if (this.ContentType !== 'thought') return [];
    return this._content
      .split('\n')
      .filter(line => line.startsWith('* '))
      .map(line => line.slice(2).trim())
      .filter(Boolean);
  }

  /** thought本文からFilter文字列を取得する（ContentType='thought'専用）*/
  public getFilter(): string {
    if (this.ContentType !== 'thought') return '';
    const filterLine = this._content.split('\n').find(line => line.startsWith('> '));
    return filterLine ? filterLine.slice(2).trim() : '';
  }

  private _extractTitle(): void {
    if (!this._content) {
      this.Name = '新しいメモ';
      return;
    }
    const firstLine = this._content.split('\n')[0].trim();
    const title = firstLine.replace(/^#+\s*/, '');
    this.Name = title || '新しいメモ';
  }

  private static normalize(s: string): string {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
}
