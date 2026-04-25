/// <reference types="vite/client" />

// Local版（WPF/WebView2）が注入するグローバル変数
interface Window {
  __THINKTANK_MODE__?: 'pwa' | 'local'
  __THINKTANK_LOCAL_API__?: string
}
