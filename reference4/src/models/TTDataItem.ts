/**
 * TTDataItem.ts
 * v4 統一コンテンツモデル。
 * メモ・チャット・ファイル・写真・メール等、すべてのデータを統一的に扱う。
 *
 * Phase 3: 基本フィールド（IsMetaOnly / DeviceId / SyncVersion / IsDirty）
 * Phase 13 以降: LoadContent / SaveContent を StorageManager に接続
 */

import { TTObject } from './TTObject';
import type { ContentType } from '../types';

export class TTDataItem extends TTObject {
  /** コンテンツ種別 */
  public ContentType: ContentType = 'memo';

  /** 検索用キーワード（カンマ区切り） */
  public Keywords: string = '';

  /** 関連アイテム ID 群（カンマ区切り） */
  public RelatedIDs: string = '';

  /** 所属コレクション ID（保存先カテゴリの特定に使用） */
  public CollectionID: string = '';

  // ── v4 追加フィールド ───────────────────────────────────────────────

  /**
   * true = メタデータのみ取得済みで content は未フェッチ。
   * ナビゲーターで薄色表示。開いた時点で LoadContent() を呼ぶ。
   */
  public IsMetaOnly: boolean = false;

  /** 最終更新デバイス ID（競合検出に使用）*/
  public DeviceId: string = '';

  /** 競合検出用バージョン番号（BQ の sync_version と比較）*/
  public SyncVersion: number = 0;

  // ── コンテンツ管理（内部） ─────────────────────────────────────────

  private _content: string = '';
  private _savedContent: string = '';  // 変更検出用

  public override get ClassName(): string {
    return 'TTDataItem';
  }

  constructor() {
    super();
    // UpdateDate は super() で設定済み。ID としても流用する。
    this.ID = this.UpdateDate;
    this.Name = '新しいメモ';
  }

  // ── Content プロパティ ─────────────────────────────────────────────

  public get Content(): string {
    return this._content;
  }

  /**
   * コンテンツをセットする。
   * - 改行コードを正規化して比較し、変化がなければ通知しない。
   * - 先頭行からタイトル（Name）を自動抽出する。
   */
  public set Content(value: string) {
    const normalized = TTDataItem.normalize(value);
    if (TTDataItem.normalize(this._content) === normalized) return;
    this._content = value;
    this._extractTitle();
    this.NotifyUpdated();
  }

  /**
   * 通知なしでコンテンツをセット（メタデータ同期・外部ロード用）。
   * BOM（\uFEFF）を自動除去する。
   */
  public setContentSilent(value: string): void {
    const stripped = value.startsWith('\uFEFF') ? value.slice(1) : value;
    if (TTDataItem.normalize(this._content) === TTDataItem.normalize(stripped)) return;
    this._content = stripped;
    this._extractTitle();
  }

  // ── 変更検出 ───────────────────────────────────────────────────────

  /** 保存時点から変更されているか（未送信フラグ） */
  public get IsDirty(): boolean {
    return TTDataItem.normalize(this._content) !== TTDataItem.normalize(this._savedContent);
  }

  /** 保存完了としてマークする（StorageManager が呼ぶ） */
  public markSaved(): void {
    this._savedContent = this._content;
  }

  // ── ストレージ連携（Phase 13 で StorageManager に接続） ─────────────

  /**
   * コンテンツをロードする（stub）。
   * Phase 13 以降: StorageManager.getContent(this.ID) を呼び出す。
   */
  public async LoadContent(): Promise<void> {
    this.IsMetaOnly = false;
    this._savedContent = this._content;
  }

  /**
   * コンテンツを保存する（stub）。
   * Phase 13 以降: StorageManager.save(record) を呼び出す。
   */
  public async SaveContent(): Promise<void> {
    if (!this.IsDirty) return;
    this.markSaved();
  }

  // ── ヘルパー ───────────────────────────────────────────────────────

  /** コンテンツ先頭行から Name（タイトル）を抽出する */
  private _extractTitle(): void {
    if (!this._content) {
      this.Name = '新しいメモ';
      return;
    }
    const firstLine = this._content.split('\n')[0].trim();
    const title = firstLine.replace(/^#+\s*/, ''); // Markdown 見出し記号を除去
    this.Name = title || '新しいメモ';
  }

  /** 改行コードを LF に正規化（変更検出の比較に使用）*/
  private static normalize(s: string): string {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
}
