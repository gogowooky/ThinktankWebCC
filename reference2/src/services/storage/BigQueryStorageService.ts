/**
 * BigQueryStorageService.ts
 * サーバーAPI経由でBigQueryにアクセスするストレージサービス
 */

import type { IStorageService, StorageResult } from './IStorageService';

// ファイルレコードの型定義
export interface FileRecord {
    file_id: string;
    title: string | null;
    file_type: string;
    category: string | null;
    content: string | null;
    metadata: Record<string, unknown> | null;
    size_bytes: number | null;
    created_at: string;
    updated_at: string;
}

// バージョン情報の型
export interface VersionInfo {
    file_id: string;
    updated_at: string;
}

// リクエストバッファ（バッファリング用）
interface BufferedRequest {
    type: 'save' | 'delete';
    fileId: string;
    data?: FileRecord;
    resolve: (result: StorageResult) => void;
    reject: (error: Error) => void;
}

export class BigQueryStorageService implements IStorageService {
    readonly name = 'BigQuery';

    private requestBuffer: BufferedRequest[] = [];
    private flushTimer: number | null = null;
    private flushInterval = 2000; // 2秒ごとにバッファをフラッシュ

    /**
     * ファイルを保存
     */
    async save(path: string, content: string): Promise<StorageResult> {
        try {
            // パスからfile_idとfile_typeを抽出
            const { file_id, file_type, category } = this.parseFilePath(path);

            const response = await fetch('/api/bq/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_id,
                    file_type,
                    category,
                    content
                })
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`[BigQueryStorage] Error response body:`, text.slice(0, 1000));
                try {
                    const error = JSON.parse(text);
                    return { success: false, error: error.error || 'Save failed' };
                } catch (e) {
                    return { success: false, error: `Server error (${response.status}): ${text.substring(0, 100)}...` };
                }
            }

            return { success: true };
        } catch (error) {
            console.error(`[BigQueryStorage] Save failed (${path}):`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * ファイルを読み込み
     */
    async load(path: string): Promise<StorageResult<string | null>> {
        try {
            const { file_id } = this.parseFilePath(path);

            const response = await fetch(`/api/bq/files/${encodeURIComponent(file_id)}`);

            if (response.status === 404) {
                return { success: true, data: null };
            }

            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || 'Load failed' };
            }

            const data = await response.json();
            return { success: true, data: data.file?.content || null };
        } catch (error) {
            console.error(`[BigQueryStorage] Load failed (${path}):`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * ファイルが存在するか確認
     */
    async exists(path: string): Promise<StorageResult<boolean>> {
        try {
            const { file_id } = this.parseFilePath(path);

            const response = await fetch(`/api/bq/files/${encodeURIComponent(file_id)}`);
            return { success: true, data: response.status !== 404 };
        } catch (error) {
            console.error(`[BigQueryStorage] Exists check failed (${path}):`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * ファイル一覧を取得
     */
    async list(directory: string, pattern?: string): Promise<StorageResult<string[]>> {
        try {
            const category = directory || undefined;
            const url = category
                ? `/api/bq/files?category=${encodeURIComponent(category)}`
                : '/api/bq/files';

            const response = await fetch(url);

            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || 'List failed' };
            }

            const data = await response.json();
            let files: string[] = data.files?.map((f: FileRecord) => f.file_id) || [];

            // パターンフィルタ（例: "*.md"）
            if (pattern) {
                const regex = new RegExp(pattern.replace('*', '.*'));
                files = files.filter((f: string) => regex.test(f));
            }

            return { success: true, data: files };
        } catch (error) {
            console.error(`[BigQueryStorage] List failed:`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * ファイルを削除
     */
    async delete(path: string): Promise<StorageResult> {
        try {
            const { file_id } = this.parseFilePath(path);

            const response = await fetch(`/api/bq/files/${encodeURIComponent(file_id)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || 'Delete failed' };
            }

            return { success: true };
        } catch (error) {
            console.error(`[BigQueryStorage] Delete failed (${path}):`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * 全文検索
     */
    async search(query: string, category?: string): Promise<StorageResult<FileRecord[]>> {
        try {
            let url = `/api/bq/ttsearch?q=${encodeURIComponent(query)}`;
            if (category) {
                url += `&category=${encodeURIComponent(category)}`;
            }

            const response = await fetch(url);

            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || 'Search failed' };
            }

            const data = await response.json();
            return { success: true, data: data.results || [] };
        } catch (error) {
            console.error(`[BigQueryStorage] Search failed:`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * バージョン情報を取得（キャッシュ整合性チェック用）
     */
    async getVersions(): Promise<StorageResult<VersionInfo[]>> {
        try {
            const response = await fetch('/api/bq/versions');

            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || 'Get versions failed' };
            }

            const data = await response.json();
            return { success: true, data: data.versions || [] };
        } catch (error) {
            console.error(`[BigQueryStorage] Get versions failed:`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * 全データ取得（キャッシュ再構築用）
     */
    async getAllFiles(): Promise<StorageResult<FileRecord[]>> {
        try {
            const response = await fetch('/api/bq/all');

            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || 'Get all files failed' };
            }

            const data = await response.json();
            return { success: true, data: data.files || [] };
        } catch (error) {
            console.error(`[BigQueryStorage] Get all files failed:`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * バッファリングして保存（頻繁なAPI呼び出しを抑制）
     */
    saveBuffered(path: string, content: string): Promise<StorageResult> {
        return new Promise((resolve, reject) => {
            const { file_id, file_type, category } = this.parseFilePath(path);

            this.requestBuffer.push({
                type: 'save',
                fileId: file_id,
                data: {
                    file_id,
                    title: null,
                    file_type,
                    category,
                    content,
                    metadata: null,
                    size_bytes: content.length,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                resolve,
                reject
            });

            this.scheduleFlush();
        });
    }

    /**
     * バッファをスケジュール
     */
    private scheduleFlush(): void {
        if (this.flushTimer !== null) return;

        this.flushTimer = window.setTimeout(() => {
            this.flushBuffer();
        }, this.flushInterval);
    }

    /**
     * バッファをフラッシュ
     */
    async flushBuffer(): Promise<void> {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        if (this.requestBuffer.length === 0) return;

        const requests = [...this.requestBuffer];
        this.requestBuffer = [];

        // 保存リクエストを一括処理
        const saveRequests = requests.filter(r => r.type === 'save' && r.data);
        if (saveRequests.length > 0) {
            try {
                const response = await fetch('/api/bq/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        files: saveRequests.map(r => r.data)
                    })
                });

                const result: StorageResult = response.ok
                    ? { success: true }
                    : { success: false, error: 'Bulk save failed' };

                saveRequests.forEach(r => r.resolve(result));
            } catch (error) {
                const result: StorageResult = { success: false, error: String(error) };
                saveRequests.forEach(r => r.resolve(result));
            }
        }

        // 削除リクエストは個別に処理
        const deleteRequests = requests.filter(r => r.type === 'delete');
        for (const req of deleteRequests) {
            const result = await this.delete(req.fileId);
            req.resolve(result);
        }
    }

    /**
     * ファイルパスを解析
     */
    private parseFilePath(path: string): {
        file_id: string;
        file_type: string;
        category: string | null;
    } {
        // 拡張子を取得
        const ext = path.split('.').pop() || '';
        const file_type = ext.toLowerCase();

        // ファイル名（拡張子なし）をfile_idとして使用
        const baseName = path.replace(/\.[^.]+$/, '');
        const file_id = baseName.replace(/[/\\]/g, '_');

        // カテゴリを判定
        let category: string | null = null;
        if (path.endsWith('.md')) {
            category = 'Memo';
        } else if (path.endsWith('.csv')) {
            category = 'Cache';
        } else if (path.endsWith('.json')) {
            category = 'Config';
        }

        return {
            file_id,
            file_type,
            category
        };
    }
}
