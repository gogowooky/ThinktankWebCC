/// <reference types="vite/client" />

interface Window {
  /** 未保存の変更があるか（Electron の close ハンドラーが executeJavaScript で参照） */
  __ttHasUnsavedChanges?: () => boolean
  /** 保留中の自動保存を全ペイン分フラッシュし、完了を待つ */
  __ttFlushAllSaves?: () => Promise<void>
  /** 開発者ツールから呼ぶモデルのリセット（App.tsx が登録する） */
  __runTests?: () => void
}
