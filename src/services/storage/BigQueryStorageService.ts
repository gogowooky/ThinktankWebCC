/**
 * BigQueryStorageService.ts
 * REST API経由でサーバサイドBigQueryにアクセスするストレージ実装
 */

import type { IStorageService, FileRecord, VersionInfo } from './IStorageService';

export class BigQueryStorageService implements IStorageService {
  readonly name = 'BigQuery';
  private baseUrl: string;

  constructor(baseUrl: string = '/api/bq') {
    this.baseUrl = baseUrl;
  }

  async initialize(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/versions`);
      return res.ok;
    } catch {
      console.warn('[BigQueryStorage] Server not reachable');
      return false;
    }
  }

  async listFiles(category?: string): Promise<FileRecord[]> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    const url = `${this.baseUrl}/files${params.toString() ? '?' + params : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`listFiles failed: ${res.status}`);
    const data = await res.json();
    return data.files || [];
  }

  async getFile(fileId: string): Promise<FileRecord | null> {
    const res = await fetch(`${this.baseUrl}/files/${encodeURIComponent(fileId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getFile failed: ${res.status}`);
    const data = await res.json();
    return data.file || null;
  }

  async saveFile(record: FileRecord): Promise<void> {
    const res = await fetch(`${this.baseUrl}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`saveFile failed: ${res.status}`);
  }

  async deleteFile(fileId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`deleteFile failed: ${res.status}`);
  }

  async getAllFiles(): Promise<FileRecord[]> {
    const res = await fetch(`${this.baseUrl}/all`);
    if (!res.ok) throw new Error(`getAllFiles failed: ${res.status}`);
    const data = await res.json();
    return data.files || [];
  }

  async getVersions(): Promise<VersionInfo[]> {
    const res = await fetch(`${this.baseUrl}/versions`);
    if (!res.ok) throw new Error(`getVersions failed: ${res.status}`);
    const data = await res.json();
    return data.versions || [];
  }

  async bulkSave(records: FileRecord[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: records }),
    });
    if (!res.ok) throw new Error(`bulkSave failed: ${res.status}`);
  }
}
