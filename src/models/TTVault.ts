/**
 * TTVault.ts
 * 保管庫（ストレージ）の定義。
 * アプリは複数の保管庫を管理できるが、保管庫間のデータ移動は行わない。
 *
 * Phase 9Ex1: 基本実装（メタデータ管理のみ）
 * Phase 13 以降: StorageManager と接続して LocalFS / BigQuery を切り替える
 *
 * LocalFS パス構造:
 *   {dataFolder}/{vaultName}/{contentType}/{id}.md
 *
 * BigQuery 構造:
 *   テーブル名 = vaultName
 *   カラム: file_type(.md), category(ContentType), id, title, content, ...
 */

import { TTObject } from './TTObject';
import type { ContentType } from '../types';

export type VaultBackendType = 'localfs' | 'bigquery';

export class TTVault extends TTObject {
  /** 保管庫名（LocalFS ではディレクトリ名、BigQuery ではテーブル名）*/
  public VaultName: string = '';

  /** バックエンド種別 */
  public BackendType: VaultBackendType = 'localfs';

  /** LocalFS ルートフォルダパス（BackendType=localfs の場合のみ使用）*/
  public DataFolder: string = '';

  /** 表示名（UI 表示用、省略時は VaultName を使用）*/
  public DisplayName: string = '';

  public override get ClassName(): string {
    return 'TTVault';
  }

  constructor(vaultName: string = '', backendType: VaultBackendType = 'localfs') {
    super();
    this.ID = vaultName || `vault-${Date.now()}`;
    this.VaultName = vaultName;
    this.BackendType = backendType;
    this.Name = vaultName;
  }

  /** UI 表示用の名前（DisplayName が設定されていれば優先）*/
  public get Label(): string {
    return this.DisplayName || this.VaultName || this.ID;
  }

  /**
   * LocalFS のファイルパスを生成する。
   * @param contentType  ContentType
   * @param id           ファイルID（yyyy-MM-dd-hhmmss 形式）
   */
  public buildLocalPath(contentType: ContentType, id: string): string {
    return `${this.DataFolder}/${this.VaultName}/${contentType}/${id}.md`;
  }

  /**
   * ファイルID を生成する（yyyy-MM-dd-hhmmss 形式）。
   * 衝突チェックは呼び出し側が行い、衝突時は generateId(existingIds) を使用する。
   */
  public static generateId(date: Date = new Date()): string {
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      '-',
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join('').replace('-', '-'); // yyyy-MM-dd-hhmmss
  }

  /**
   * 衝突を避けたファイルIDを生成する。
   * 同秒に衝突した場合、1秒ずつ遡って空いている ID を返す。
   * @param existingIds  既存の ID セット
   * @param maxRetries   最大遡りステップ数（デフォルト 60）
   */
  public static generateUniqueId(
    existingIds: Set<string>,
    date: Date = new Date(),
    maxRetries = 60
  ): string {
    let current = new Date(date);
    for (let i = 0; i < maxRetries; i++) {
      const id = TTVault.generateId(current);
      if (!existingIds.has(id)) return id;
      current = new Date(current.getTime() - 1000); // 1秒遡る
    }
    // フォールバック: ミリ秒付きランダム
    return `${TTVault.generateId(date)}-${Math.random().toString(36).slice(2, 6)}`;
  }
}
