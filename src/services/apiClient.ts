/**
 * apiClient.ts
 * サーバー API (/api/*) への接続先と認証を一元化する。
 *
 * 【なぜ必要か】
 * 従来はすべての呼び出しが相対パス（'/api/...'）だった。これは
 *   - ブラウザ dev: vite proxy が localhost:8080 へ転送
 *   - ブラウザ本番: Cloud Run が同一オリジンで配信
 * では成立するが、パッケージ版 Electron は file:// オリジンのため
 * '/api/...' が file:///api/... に解決され、サーバーへ到達できない。
 *
 * そこでパッケージ版では、メインプロセスが起動したローカルサーバーの
 * 絶対 URL と、そのセッション限りの共有シークレットを preload 経由で受け取る。
 */

export interface ApiConfig {
  /** 例: 'http://127.0.0.1:53124'。ブラウザ／dev では空文字（相対パス） */
  baseUrl: string;
  /** ローカルサーバー用のセッション共有シークレット。ブラウザ／dev では undefined */
  apiKey?: string;
}

function resolveConfig(): ApiConfig {
  // パッケージ版 Electron のみメインプロセスから設定が渡る。
  // UI をローカルサーバー自身から配信しているため baseUrl は空文字だが、
  // apiKey は独立して存在しうるので baseUrl の有無で捨てないこと。
  const injected = window.electronAPI?.apiConfig;
  if (injected) {
    return {
      baseUrl: (injected.baseUrl ?? '').replace(/\/$/, ''),
      apiKey:  injected.apiKey,
    };
  }
  // ブラウザ（dev は vite proxy、本番は同一オリジン）と dev Electron は相対パスで解決できる
  return { baseUrl: '' };
}

const config: ApiConfig = resolveConfig();

/** '/api/...' を実際に到達可能な URL へ変換する */
export function apiUrl(path: string): string {
  return `${config.baseUrl}${path}`;
}

/**
 * API 呼び出しの共通ラッパー。接続先の解決と認証ヘッダーの付与を行う。
 * fetch と同じシグネチャで、Response をそのまま返す。
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (config.apiKey) headers.set('X-Thinktank-Api-Key', config.apiKey);
  return fetch(apiUrl(path), { ...init, headers });
}
