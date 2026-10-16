/**
 * src/platform/web/GoogleAuthService.ts
 * Web版における Google OAuth 2.0 アクセストークン管理（Google Drive API 用）。
 * 環境変数 VITE_GOOGLE_CLIENT_ID または設定画面からの入力に対応。
 */

const STORAGE_KEY_CLIENT_ID = 'thinktank.web.googleClientId';
const STORAGE_KEY_ACCESS_TOKEN = 'thinktank.web.googleAccessToken';
const STORAGE_KEY_TOKEN_EXPIRY = 'thinktank.web.googleTokenExpiry';
const STORAGE_KEY_DRIVE_FOLDER_ID = 'thinktank.web.driveRootFolderId';

export interface GoogleAuthConfig {
  clientId: string;
  accessToken: string;
  expiresAtMs: number;
  driveRootFolderId: string;
}

class GoogleAuthServiceImpl {
  public getConfig(): GoogleAuthConfig {
    const envClientId =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID) ||
      '';
    const envFolderId =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DRIVE_FOLDER_ID) ||
      '';

    if (typeof localStorage === 'undefined') {
      return {
        clientId: envClientId,
        accessToken: '',
        expiresAtMs: 0,
        driveRootFolderId: envFolderId,
      };
    }

    return {
      clientId: localStorage.getItem(STORAGE_KEY_CLIENT_ID) || envClientId,
      accessToken: localStorage.getItem(STORAGE_KEY_ACCESS_TOKEN) || '',
      expiresAtMs: Number(localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY) || '0'),
      driveRootFolderId: localStorage.getItem(STORAGE_KEY_DRIVE_FOLDER_ID) || envFolderId,
    };
  }

  public saveConfig(partial: Partial<GoogleAuthConfig>): GoogleAuthConfig {
    if (typeof localStorage !== 'undefined') {
      if (partial.clientId !== undefined) {
        localStorage.setItem(STORAGE_KEY_CLIENT_ID, partial.clientId.trim());
      }
      if (partial.accessToken !== undefined) {
        localStorage.setItem(STORAGE_KEY_ACCESS_TOKEN, partial.accessToken.trim());
      }
      if (partial.expiresAtMs !== undefined) {
        localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRY, String(partial.expiresAtMs));
      }
      if (partial.driveRootFolderId !== undefined) {
        localStorage.setItem(STORAGE_KEY_DRIVE_FOLDER_ID, partial.driveRootFolderId.trim());
      }
    }
    return this.getConfig();
  }

  public hasValidToken(): boolean {
    const cfg = this.getConfig();
    if (!cfg.accessToken) return false;
    if (cfg.expiresAtMs > 0 && Date.now() > cfg.expiresAtMs) return false;
    return true;
  }

  /**
   * ブラウザポップアップで Google OAuth 2.0 同意画面を開き、Drive スコープのアクセストークンを取得する。
   */
  public startBrowserOAuthFlow(): Promise<GoogleAuthConfig> {
    const cfg = this.getConfig();
    if (!cfg.clientId) {
      return Promise.reject(new Error('Google OAuth Client ID を入力してください。'));
    }

    return new Promise((resolve, reject) => {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      const scope = 'https://www.googleapis.com/auth/drive';
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(cfg.clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(scope)}` +
        `&include_granted_scopes=true` +
        `&prompt=consent`;

      const popup = window.open(authUrl, 'tt_google_oauth', 'width=540,height=660');
      if (!popup) {
        reject(new Error('ポップアップウィンドウがブロックされました。ブラウザの設定を確認してください。'));
        return;
      }

      const timer = window.setInterval(() => {
        try {
          if (popup.closed) {
            window.clearInterval(timer);
            reject(new Error('ログインウィンドウが閉じられました。'));
            return;
          }
          const hash = popup.location.hash;
          if (hash && hash.includes('access_token=')) {
            window.clearInterval(timer);
            const params = new URLSearchParams(hash.replace(/^#/, ''));
            const token = params.get('access_token') || '';
            const expiresInSec = Number(params.get('expires_in') || '3600');
            popup.close();
            const updated = this.saveConfig({
              accessToken: token,
              expiresAtMs: Date.now() + expiresInSec * 1000,
            });
            resolve(updated);
          }
        } catch {
          // クロスオリジン遷移中は無視して待機
        }
      }, 400);
    });
  }

  /**
   * Google Drive 上の「Thinktank」フォルダを自動検索し、driveRootFolderId に設定する。
   */
  public async autoDetectThinktankFolder(folderName = 'Thinktank'): Promise<string> {
    const cfg = this.getConfig();
    if (!cfg.accessToken) {
      throw new Error('先に Google アクセストークンを設定またはログインしてください。');
    }
    const q = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`,
      {
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      },
    );
    if (!res.ok) {
      throw new Error(`Google Drive API エラー (HTTP ${res.status})`);
    }
    const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
    if (!data.files || data.files.length === 0) {
      throw new Error(`Google Drive 上に「${folderName}」フォルダが見つかりませんでした。`);
    }
    const folderId = data.files[0].id;
    this.saveConfig({ driveRootFolderId: folderId });
    return folderId;
  }
}

export const GoogleAuthService = new GoogleAuthServiceImpl();

