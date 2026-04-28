/**
 * driveService.ts
 * Google Drive API サービス
 * Thinktank/yyyy-mm-dd フォルダにファイルをアップロードする
 */

import { google } from 'googleapis';
import { Readable } from 'stream';

const PARENT_FOLDER_NAME = 'Thinktank';

export class DriveService {
  private drive: ReturnType<typeof google.drive> | null = null;
  private parentFolderId: string | null = null;
  private initialized = false;

  async initialize(): Promise<boolean> {
    try {
      const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      if (!credentials) {
        console.log('[DriveService] GOOGLE_SERVICE_ACCOUNT_KEY not set — Drive disabled');
        return false;
      }
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(credentials),
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      this.drive = google.drive({ version: 'v3', auth });
      this.parentFolderId = await this._getOrCreateFolder(PARENT_FOLDER_NAME, null);
      this.initialized = true;
      console.log(`[DriveService] Initialized (parent: ${this.parentFolderId})`);
      return true;
    } catch (e) {
      console.error('[DriveService] Initialization failed:', e);
      return false;
    }
  }

  get isReady(): boolean { return this.initialized && this.drive !== null; }

  // yyyy-mm-dd フォルダを取得または作成してIDを返す
  async getOrCreateDateFolder(date: string): Promise<string> {
    this._assertReady();
    return this._getOrCreateFolder(date, this.parentFolderId!);
  }

  // ファイルをアップロードして {fileId, webViewLink} を返す
  async uploadFile(
    folderId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<{ fileId: string; webViewLink: string }> {
    this._assertReady();
    const stream = Readable.from(buffer);
    const res = await this.drive!.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType, body: stream },
      fields: 'id,webViewLink',
    });
    // リンクを知っている人は誰でも閲覧できるよう設定
    await this.drive!.permissions.create({
      fileId: res.data.id!,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    return {
      fileId:      res.data.id!,
      webViewLink: res.data.webViewLink!,
    };
  }

  // ── プライベート ──────────────────────────────────────────────────────────

  private async _getOrCreateFolder(name: string, parentId: string | null): Promise<string> {
    const parentClause = parentId ? ` and '${parentId}' in parents` : '';
    const q = `name='${name}' and mimeType='application/vnd.google-apps.folder'${parentClause} and trashed=false`;
    const res = await this.drive!.files.list({ q, fields: 'files(id)', spaces: 'drive' });
    if (res.data.files && res.data.files.length > 0) return res.data.files[0].id!;
    const created = await this.drive!.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: 'id',
    });
    return created.data.id!;
  }

  private _assertReady(): void {
    if (!this.initialized || !this.drive) throw new Error('DriveService not initialized');
  }
}

export const driveService = new DriveService();
