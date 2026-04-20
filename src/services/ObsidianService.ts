/**
 * ObsidianService.ts
 * Obsidian Local REST API プラグイン経由で Vault の .md ファイルを取得するクライアントサービス
 *
 * ■ 必要なプラグイン
 *   Obsidian Community Plugin: "Local REST API"
 *   https://github.com/coddingtonbear/obsidian-local-rest-api
 *
 * ■ デフォルト設定
 *   URL  : https://127.0.0.1:27123
 *   Token: プラグイン設定画面の "API Key" に表示される値
 *
 * ■ HTTPS 証明書について
 *   プラグインは自己署名証明書を使用する。HTTPS でホストされたアプリから呼び出す場合は、
 *   ブラウザで https://127.0.0.1:27123 を一度開いて証明書を許可してから使用すること。
 *
 * ■ 設定の保存場所
 *   localStorage キー "obsidian-api-url" / "obsidian-api-token"（デバイスごとに設定）
 *
 * ■ 差分検出
 *   GET /vault/{path} レスポンスの Last-Modified ヘッダーを BQ の updated_at と比較し、
 *   変更のないファイルはスキップする。
 */

import type { FileRecord } from './storage/IStorageService';

// ─── 設定キー ──────────────────────────────────────────────────────────────────
const LS_KEY_URL   = 'obsidian-api-url';
const LS_KEY_TOKEN = 'obsidian-api-token';

export const OBSIDIAN_DEFAULT_URL = 'https://127.0.0.1:27123';

// ─── 型定義 ────────────────────────────────────────────────────────────────────

export interface ObsidianConfig {
  url: string;
  token: string;
}

export interface ObsidianSyncResult {
  /** BQ へ保存（新規/更新）したファイル数 */
  synced: number;
  /** 変更なしでスキップしたファイル数 */
  unchanged: number;
  /** Vault 内の総 .md ファイル数 */
  total: number;
  /** エラーメッセージ一覧 */
  errors: string[];
  /** 保存した FileRecord 一覧（呼び出し元が IndexedDB / TTKnowledge に反映する） */
  records: FileRecord[];
}

// ─── BQ タイムスタンプ正規化 ──────────────────────────────────────────────────

/** BQ が返す { value: "..." } 形式のタイムスタンプ、または文字列を Date に変換 */
function normalizeBqTs(ts: unknown): Date {
  if (ts instanceof Date) return ts;
  if (typeof ts === 'object' && ts !== null && 'value' in (ts as Record<string, unknown>)) {
    return new Date((ts as { value: string }).value);
  }
  return new Date(String(ts));
}

// ─── サービス ─────────────────────────────────────────────────────────────────

export class ObsidianService {
  // ── 設定 ──

  /** localStorage から設定を読み込む。未設定の場合は null を返す */
  getConfig(): ObsidianConfig | null {
    const token = localStorage.getItem(LS_KEY_TOKEN);
    if (!token) return null;
    return {
      url:   localStorage.getItem(LS_KEY_URL) || OBSIDIAN_DEFAULT_URL,
      token,
    };
  }

  /** 設定を localStorage に保存する */
  saveConfig(url: string, token: string): void {
    localStorage.setItem(LS_KEY_URL,   url.trim().replace(/\/$/, ''));
    localStorage.setItem(LS_KEY_TOKEN, token.trim());
  }

  // ── API アクセス ──

  private apiFetch(config: ObsidianConfig, path: string, options?: RequestInit): Promise<Response> {
    return fetch(`${config.url}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...options?.headers,
      },
    });
  }

  /** 接続テスト（true = 成功） */
  async testConnection(config: ObsidianConfig): Promise<boolean> {
    try {
      const res = await this.apiFetch(config, '/');
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── ファイル一覧 ──

  /**
   * Vault 内の .md ファイルを再帰的に列挙する
   * @param dir Vault ルートからの相対ディレクトリパス（初回は空文字）
   * @returns Vault ルートからの相対パス一覧（例: "Projects/Meeting.md"）
   */
  private async listMdFiles(config: ObsidianConfig, dir = ''): Promise<string[]> {
    const apiPath = `/vault/${dir ? encodeURI(dir) + '/' : ''}`;
    const res = await this.apiFetch(config, apiPath);
    if (!res.ok) {
      throw new Error(`Vault ディレクトリの取得に失敗しました (${res.status}): /${dir || ''}`);
    }

    const data = await res.json() as { files: string[] };
    const result: string[] = [];

    for (const entry of data.files ?? []) {
      if (entry.startsWith('.')) continue; // .obsidian 等の隠しエントリをスキップ
      if (entry.endsWith('/')) {
        // サブディレクトリ → 再帰
        const subDir = dir ? `${dir}/${entry.slice(0, -1)}` : entry.slice(0, -1);
        const sub = await this.listMdFiles(config, subDir);
        result.push(...sub);
      } else if (entry.toLowerCase().endsWith('.md')) {
        result.push(dir ? `${dir}/${entry}` : entry);
      }
    }
    return result;
  }

  // ── 同期 ──

  /**
   * Vault の .md ファイルを BQ バージョン情報と比較し、
   * 新規・更新ファイルの FileRecord 一覧を返す。
   *
   * 呼び出し元（TTColumnView）が storageManager.saveFile() と
   * TTKnowledge.AddOrUpdateFromRecord() を使って反映する。
   *
   * @param onProgress 進捗コールバック (処理済み件数, 総件数)
   */
  async buildSyncRecords(
    onProgress?: (current: number, total: number) => void,
  ): Promise<ObsidianSyncResult> {
    const config = this.getConfig();
    if (!config) {
      throw new Error('設定なし');
    }

    // 1. Vault の .md ファイル一覧を取得
    const files = await this.listMdFiles(config);

    // 2. BQ の obsidian カテゴリのバージョン情報を取得
    const versionRes = await fetch('/api/bq/versions?category=obsidian');
    const versionData = await versionRes.json() as { versions?: { file_id: string; updated_at: unknown }[] };
    const bqVersionMap = new Map<string, Date>();
    for (const v of versionData.versions ?? []) {
      bqVersionMap.set(v.file_id, normalizeBqTs(v.updated_at));
    }

    // 3. ファイルごとに取得 & 差分チェック
    const records: FileRecord[] = [];
    const errors: string[] = [];
    let unchanged = 0;

    for (let i = 0; i < files.length; i++) {
      const relPath = files[i];
      const fileId  = `obs-${relPath}`;
      onProgress?.(i + 1, files.length);

      try {
        const res = await this.apiFetch(config, `/vault/${encodeURI(relPath)}`);
        if (!res.ok) {
          errors.push(`${relPath}: ファイル取得失敗 (${res.status})`);
          continue;
        }

        // Last-Modified ヘッダーからファイルの更新日時を取得
        const lastModifiedStr = res.headers.get('Last-Modified');
        const mtime = lastModifiedStr ? new Date(lastModifiedStr) : new Date();

        // BQ の updated_at と比較して変更なしならスキップ
        const bqTime = bqVersionMap.get(fileId);
        if (bqTime && bqTime >= mtime) {
          await res.body?.cancel(); // ボディを破棄してストリームを閉じる
          unchanged++;
          continue;
        }

        const content = await res.text();
        const title   = relPath.split('/').pop()?.replace(/\.md$/i, '') ?? relPath;
        const iso     = mtime.toISOString();

        records.push({
          file_id:    fileId,
          title,
          file_type:  'obsidian',
          category:   'obsidian',
          content,
          metadata:   { vault_path: relPath },
          size_bytes: content.length,
          created_at: iso,
          updated_at: iso,
        });
      } catch (err) {
        errors.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      synced:    records.length,
      unchanged,
      total:     files.length,
      errors,
      records,
    };
  }
}

export const obsidianService = new ObsidianService();
