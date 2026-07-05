import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA サービスワーカーの登録 (http/httpsプロトコル時のみ実行し、Electron環境など file:// ではスキップする)
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[PWA] ServiceWorker registered', reg))
      .catch(err => console.error('[PWA] ServiceWorker registration failed', err));
  });
}
