import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedMobileDisplayDefaults } from './utils/deviceInfo'
import { applyAppZoom } from './utils/appZoom'

// iPhone 表示時はレンダリング前に簡易レイアウトへ先行設定する（初回描画のちらつき防止）
seedMobileDisplayDefaults()
// 保存済みの表示倍率をレンダリング前に反映する（初回描画のちらつき防止）
applyAppZoom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

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
