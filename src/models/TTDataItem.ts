import { TTObject } from './TTObject';
import type { ContentType } from '../types';
import { storageManager } from '../services/storage/StorageManager';
import { syncManager } from '../services/sync/SyncManager';

/**
 * TTDataItem - 統一コンテンツモデル
 *
 * メモ、チャット、URL、ファイル、写真、メール、Driveリンク等、
 * すべてのデータを統一的に扱うモデル。TTMemoの後継。
 */
export class TTDataItem extends TTObject {
  /** コンテンツ種別 */
  public ContentType: ContentType = 'memo';

  /** 検索用キーワード */
  public Keywords: string = '';

  /** 所属コレクションID */
  public CollectionID: string = '';

  /** 関連アイテムID群（カンマ区切り） */
  public RelatedIDs: string = '';

  /** コンテンツ非同期ロード完了フラグ */
  public IsLoaded: boolean = false;

  /** コンテンツ本体 */
  private _content: string = '';

  /** 最後に保存されたコンテンツ（変更検出用） */
  private _savedContent: string = '';

  public override get ClassName(): string {
    return 'TTDataItem';
  }

  constructor() {
    super();
    const id = TTObject.getNowString();
    this.ID = id;
    this.Name = `[${id}] 新しいメモ`;
    this.UpdateDate = id;
  }

  // ═══════════════════════════════════════════════════════════════
  // Content プロパティ（setter でタイトル自動抽出 + 通知）
  // ═══════════════════════════════════════════════════════════════

  public get Content(): string {
    return this._content;
  }

  public set Content(value: string) {
    const normalized = TTDataItem.normalizeLineEndings(value);
    if (TTDataItem.normalizeLineEndings(this._content) === normalized) return;
    this._content = value;
    this.updateNameFromContent();
    this.NotifyUpdated();
  }

  /** 通知なしでコンテンツを設定（外部同期用） */
  public setContentSilent(value: string): void {
    const normalized = TTDataItem.normalizeLineEndings(value);
    if (TTDataItem.normalizeLineEndings(this._content) === normalized) return;
    this._content = value;
    this.updateNameFromContent();
  }

  /** リモート更新を適用（通知はするがWebSocket送信をスキップ） */
  public applyRemoteUpdate(content: string): void {
    const normalized = TTDataItem.normalizeLineEndings(content);
    if (TTDataItem.normalizeLineEndings(this._content) === normalized) return;
    this._content = content;
    this.updateNameFromContent();
    this.NotifyUpdated();
  }

  // ═══════════════════════════════════════════════════════════════
  // 変更検出
  // ═══════════════════════════════════════════════════════════════

  /** コンテンツが保存時点から変更されているか */
  public get IsDirty(): boolean {
    return TTDataItem.normalizeLineEndings(this._content)
      !== TTDataItem.normalizeLineEndings(this._savedContent);
  }

  /** 保存済みとしてマーク */
  public markSaved(): void {
    this._savedContent = this._content;
  }

  // ═══════════════════════════════════════════════════════════════
  // コンテンツ読み書き（Phase 12でStorageManager統合）
  // ═══════════════════════════════════════════════════════════════

  /** コンテンツをロード */
  public async LoadContent(): Promise<void> {
    if (!storageManager.isInitialized) {
      this.IsLoaded = true;
      return;
    }

    try {
      const record = await storageManager.getFile(this.ID);
      if (record?.content) {
        this.setContentSilent(record.content);
        this._savedContent = this._content;
      }
    } catch (error) {
      console.error(`[TTDataItem] LoadContent failed: ${this.ID}`, error);
    }
    this.IsLoaded = true;
  }

  /** コンテンツを保存（StorageManager + WebSocket送信） */
  public async SaveContent(): Promise<void> {
    if (!this.IsDirty) return;

    const now = new Date().toISOString();
    this.UpdateDate = TTObject.getNowString();

    try {
      await syncManager.saveAndBroadcast({
        file_id: this.ID,
        title: this.Name || null,
        file_type: this.ContentType,
        category: this.CollectionID || null,
        content: this._content,
        metadata: null,
        size_bytes: null,
        created_at: now,
        updated_at: now,
      });
      this._savedContent = this._content;
    } catch (error) {
      console.error(`[TTDataItem] SaveContent failed: ${this.ID}`, error);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ヘルパー
  // ═══════════════════════════════════════════════════════════════

  /** コンテンツ先頭行からNameを更新 */
  private updateNameFromContent(): void {
    if (!this._content) {
      this.Name = `[${this.ID}] 新しいメモ`;
      return;
    }
    const firstLine = this._content.split('\n')[0].trim();
    // Markdown見出し記号を除去
    const title = firstLine.replace(/^#+\s*/, '');
    this.Name = title || `[${this.ID}] 新しいメモ`;
  }

  /** 改行コードを正規化 */
  private static normalizeLineEndings(s: string): string {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
}
