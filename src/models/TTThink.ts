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
import { StorageConflictError, StorageTimeoutError } from '../services/storage/IStorageBackend';
import type { SavePayload, ThinkMeta } from '../services/storage/IStorageBackend';
import { reportSaveResult } from '../services/storage/saveStatus';
import { parseBundle, splitContent, extractTitleLine } from '../utils/thinkFormat';

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

  /**
   * Keywords / RelatedIDs は保存済みの値を追跡していないため、Content・Metadata が
   * 変わらずにこれらだけ書き換えた呼び出し側（YAML＋本文の TextEditor 等）が明示的に立てる。
   */
  private _fieldsDirty = false;
  public markFieldsDirty(): void {
    this._fieldsDirty = true;
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

  /**
   * タイトル行と本文を連ねた全テキスト（Content = TitleLine + '\n' + Body）。
   *
   * 保存先では2列に分かれている（BigQuery の title 列と content 列）。保存時は
   * splitContent() が1行目を title へ切り出し、読み込み時は LoadContent() が
   * 再び連結してここへ入れる。つまりストレージ層の「content」はこの Content とは
   * 別物（本文のみ）で、そちらは getBody() という名前で扱う。
   *
   * 一覧に載っただけの段階（IsMetaOnly）ではタイトル行しか入っていない。
   * 本文まで必要なときは先に LoadContent() を呼ぶこと。
   */
  public get Content(): string {
    return this._content;
  }

  /**
   * Content の1行目。BigQuery の title 列へ保存される生の行で、`#` や `>>` などの
   * 記号を含む。記号を落とした表示用の題名は Name（_extractTitle が生成）。
   */
  public get TitleLine(): string {
    return splitContent(this._content).title;
  }

  /** Content からタイトル行を除いた本文。LoadContent() 前（IsMetaOnly）は空文字。 */
  public get Body(): string {
    return splitContent(this._content).body;
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

  /** 保存先から本文（Body）を取り寄せ、手元のタイトル行と連結して Content を揃える。 */
  public async LoadContent(force: boolean = false): Promise<void> {
    if (!this.IsMetaOnly && !force) return;
    try {
      const body = await StorageManager.instance.getBody(this.ID);
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

  /**
   * 同じ Think の保存は1本ずつ送る。保存中に次の保存を送ると、まだ古い UpdatedAt を
   * baseUpdatedAt にしてしまい、自分の直前の保存と楽観ロックで衝突する。
   * 待っている間に溜まった保存は、順番が来た時点の最新内容でまとめて1回になる
   * （先行の保存で dirty が解消されていれば何も送らない）。
   */
  public SaveContent(force: boolean = false): Promise<void> {
    const run = this._saveQueue.then(() => this._saveNow(force));
    this._saveQueue = run.catch(() => undefined);
    return run;
  }

  private _saveQueue: Promise<void> = Promise.resolve();
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryCount = 0;
  /** 応答待ちを打ち切った保存の本文。サーバーに届いていたかを後で照合する */
  private _unconfirmedContent: string | null = null;

  private async _saveNow(force: boolean): Promise<void> {
    if (!this.IsDirty && !this.IsMetadataDirty && !this._fieldsDirty && !force) return;
    this._cancelRetry();
    // 応答待ちの間も入力は続くため、送った時点の内容だけを保存済みとして記録する
    const content = this._content;
    const metadataJson = JSON.stringify(this.Metadata);
    const fieldsDirty = this._fieldsDirty;
    this._fieldsDirty = false;
    try {
      const meta = await this._send(content, force);
      if (meta.updatedAt) {
        this.UpdatedAt = meta.updatedAt;
      }
      this._savedContent = content;
      this._metadataSaved = metadataJson;
      this._unconfirmedContent = null;
      this._retryCount = 0;
      reportSaveResult(this.ID, false);
      // 親 Vault に通知してDataGridを再描画させる（UpdateDateは自分自身では更新しない）
      if (this._parent) {
        this._parent.NotifyUpdated(false);
      }
    } catch (e) {
      // 呼び出し元が保存失敗を検知できるよう、ログのみで握りつぶさず再送出する。
      // ここで飲み込むと「保存済みのはずが実は保存されていない」というデータ消失に繋がる。
      console.error(`[TTThink] SaveContent failed (${this.ID}):`, e);
      if (fieldsDirty) this._fieldsDirty = true;
      if (e instanceof StorageTimeoutError) this._unconfirmedContent = content;
      if (!(e instanceof StorageConflictError)) {
        reportSaveResult(this.ID, true);
        this._scheduleRetry();
      }
      throw e;
    }
  }

  private async _send(content: string, force: boolean): Promise<ThinkMeta> {
    const payload: SavePayload = {
      thinkid:     this.ID,
      category:    this.ContentType,
      fullContent: content,
      keywords:    this.Keywords,
      relatedIds:  this.RelatedIDs,
      metadata:    this.Metadata,
      // 楽観ロック（D-2）。force 時は照合をスキップして自分の変更で上書きする。
      baseUpdatedAt: force ? undefined : (this.UpdatedAt || undefined),
    };
    try {
      return await StorageManager.instance.save(payload);
    } catch (e) {
      const unconfirmed = this._unconfirmedContent;
      if (!(e instanceof StorageConflictError) || unconfirmed === null || !e.serverUpdatedAt) throw e;
      // 打ち切った保存が実はサーバーに届いていた場合、衝突相手は自分自身。
      // サーバーの本文がそのとき送った本文と一致すれば、その版を基準に送り直す。
      const serverBody = await StorageManager.instance.getBody(this.ID);
      if (serverBody === null
        || TTThink.normalize(serverBody) !== TTThink.normalize(splitContent(unconfirmed).body)) throw e;
      return StorageManager.instance.save({ ...payload, baseUpdatedAt: e.serverUpdatedAt });
    }
  }

  /** 自動保存は入力をきっかけに走るため、入力が止まった後の失敗はここで拾い直す */
  private _scheduleRetry(): void {
    if (this._retryTimer || this._retryCount >= TTThink.RETRY_DELAYS_MS.length) return;
    const delay = TTThink.RETRY_DELAYS_MS[this._retryCount++];
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this.SaveContent().catch(e => {
        // 衝突は App.tsx の unhandledrejection → 確認ダイアログへ渡す
        if (e instanceof StorageConflictError) throw e;
      });
    }, delay);
  }

  private _cancelRetry(): void {
    if (!this._retryTimer) return;
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
  }

  private static readonly RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000];


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
    const titleLine = extractTitleLine(this._content).trim();
    let title = titleLine.replace(/^#+\s*/, '');
    if (this.ContentType === 'bundle') {
      title = title.replace(/^>>?\s*/, '');
    }
    this.Name = title || '新しいメモ';
  }

  private static normalize(s: string): string {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
}
