/**
 * src/platform/web/GoogleAuthService.ts
 * Web版における Google OAuth 2.0 アクセストークン管理（Google Drive API 用）。
 * 環境変数 VITE_GOOGLE_CLIENT_ID または設定画面からの入力に対応。
 */

const STORAGE_KEY_CLIENT_ID = 'thinktank.web.googleClientId';
const STORAGE_KEY_ACCESS_TOKEN = 'thinktank.web.googleAccessToken';
const STORAGE_KEY_TOKEN_EXPIRY = 'thinktank.web.googleTokenExpiry';
const STORAGE_KEY_DRIVE_FOLDER_ID = 'thinktank.web.driveRootFolderId';

const DEFAULT_GOOGLE_CLIENT_ID =
  '699735546730-9td02a2p0hj5jj9srvqr9m48fhd0qc8h.apps.googleusercontent.com';

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
      DEFAULT_GOOGLE_CLIENT_ID;
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
   * ブラウザポップアップで Google OAuth 2.0 同意画面を開く。
   * Think 正本用の通常ログインでは基本プロフィールだけを要求し、外部資料を
   * Google Drive から選ぶ操作をしたときだけ Drive スコープを追加する。
   */
  public startBrowserOAuthFlow(options: { includeDrive?: boolean } = {}): Promise<GoogleAuthConfig> {
    const cfg = this.getConfig();
    if (!cfg.clientId) {
      return Promise.reject(new Error('Google OAuth Client ID を入力してください。'));
    }

    return new Promise((resolve, reject) => {
      // Google Cloud Console に登録する URI はオリジン直下だけにしたいので、開いているページのパスは使わない
      // （Hosting はどのパスでも index.html を返すため、/index.html や深いパスで開くと redirect_uri_mismatch になる）
      const redirectUri = `${window.location.origin}/`;
      // openid/email は Firebase がこのトークンで本人を確認するために要る
      const scopes = ['openid', 'email', 'profile'];
      if (options.includeDrive) scopes.push('https://www.googleapis.com/auth/drive.file');
      const scope = scopes.join(' ');
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

      const cleanup = () => {
        window.clearInterval(timer);
        window.removeEventListener('message', onMsg);
      };

      const handleSuccess = (token: string, expiresInSec: number) => {
        cleanup();
        try {
          if (!popup.closed) popup.close();
        } catch {
          // ignore
        }
        const updated = this.saveConfig({
          accessToken: token,
          expiresAtMs: Date.now() + expiresInSec * 1000,
        });
        resolve(updated);
      };

      const onMsg = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'GOOGLE_OAUTH_TOKEN' && event.data.token) {
          handleSuccess(event.data.token, Number(event.data.expiresInSec || 3600));
        }
      };
      window.addEventListener('message', onMsg);

      const timer = window.setInterval(() => {
        try {
          if (popup.closed) {
            cleanup();
            // ポップアップが閉じられた直後に localStorage を最終確認
            const currentToken = localStorage.getItem(STORAGE_KEY_ACCESS_TOKEN);
            if (currentToken) {
              resolve(this.getConfig());
              return;
            }
            reject(new Error('ログインウィンドウが閉じられました。'));
            return;
          }
          const hash = popup.location.hash;
          if (hash && hash.includes('access_token=')) {
            const params = new URLSearchParams(hash.replace(/^#/, ''));
            const token = params.get('access_token') || '';
            const expiresInSec = Number(params.get('expires_in') || '3600');
            handleSuccess(token, expiresInSec);
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

  /**
   * drive.file の審査負担を増やさず使える、このアプリ専用フォルダを準備する。
   * drive.file では利用者が別途作った既存フォルダを列挙できないため、アクセス可能な
   * 同名フォルダが無い場合はアプリ自身で作成する。
   */
  public async ensureThinktankFolder(folderName = 'Thinktank'): Promise<string> {
    try {
      return await this.autoDetectThinktankFolder(folderName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('見つかりませんでした')) throw error;
    }

    const cfg = this.getConfig();
    if (!cfg.accessToken) {
      throw new Error('先に Google Drive へのアクセスを承認してください。');
    }
    const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    if (!res.ok) throw new Error(`Google Drive フォルダ作成エラー (HTTP ${res.status})`);
    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error('作成したGoogle DriveフォルダのIDを取得できませんでした。');
    this.saveConfig({ driveRootFolderId: data.id });
    return data.id;
  }
}

export const GoogleAuthService = new GoogleAuthServiceImpl();

