/// <reference types="vite/client" />

interface Window {
  __THINKTANK_MODE__?: 'pwa' | 'local'
  __THINKTANK_LOCAL_API__?: string
  __runTests?: () => void
  /** 未保存の変更があるか（Electron の close ハンドラーが executeJavaScript で参照。D-1） */
  __ttHasUnsavedChanges?: () => boolean
  /** 保留中の自動保存を全ペイン分フラッシュし、完了を待つ（同上） */
  __ttFlushAllSaves?: () => Promise<void>
}
