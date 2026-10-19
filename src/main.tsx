import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedMobileDisplayDefaults } from './utils/deviceInfo'
import { applyAppZoom } from './utils/appZoom'
import { FirebaseAuthService } from './platform/web/FirebaseAuthService'

// OAuth 2.0 リダイレクト後のポップアップ・コールバック処理
if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = params.get('access_token');
    const expiresInSec = Number(params.get('expires_in') || '3600');
    if (token) {
      localStorage.setItem('thinktank.web.googleAccessToken', token);
      localStorage.setItem('thinktank.web.googleTokenExpiry', String(Date.now() + expiresInSec * 1000));
      if (window.opener) {
        window.opener.postMessage(
          { type: 'GOOGLE_OAUTH_TOKEN', token, expiresInSec },
          window.location.origin,
        );
        window.close();
      } else {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  } catch (e) {
    console.error('[OAuth callback]', e);
  }
}

// iPhone 表示時はレンダリング前に簡易レイアウトへ先行設定する（初回描画のちらつき防止）
seedMobileDisplayDefaults()
// 保存済みの表示倍率をレンダリング前に反映する（初回描画のちらつき防止）
applyAppZoom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// データ用Firebaseセッションをrendererとメインプロセスの間で相互に引き継ぐ。
if (window.electronAPI?.relay) {
  void (async () => {
    // メインプロセスのOSブラウザログインを正とし、rendererに古い別UIDの
    // セッションが残っていても必ず同じアカウントへ揃える。
    const mainSession = await FirebaseAuthService.syncFromElectronRelayIfAvailable();
    if (!mainSession) await FirebaseAuthService.syncSessionToElectronRelay();
  })().catch(err => {
    console.warn('[Firebase] ログインをElectron内で同期できませんでした', err);
  });
}

// PWA サービスワーカーの登録 (http/httpsプロトコル時のみ実行し、Electron環境ではスキップする)
// Electron dev時は http://localhost:5173 をロードするため protocol チェックだけでは
// 除外できない（file:// になるのは本番ビルドのみ）。window.electronAPI の有無で判定する。
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http') && !window.electronAPI) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[PWA] ServiceWorker registered', reg))
      .catch(err => console.error('[PWA] ServiceWorker registration failed', err));
  });
}
