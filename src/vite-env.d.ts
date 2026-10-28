/// <reference types="vite/client" />

interface Window {
  /** 未保存の変更があるか（Electron の close ハンドラーが executeJavaScript で参照） */
  __ttHasUnsavedChanges?: () => boolean
  /** 指定した thinkid が画面のエディタで編集中（未保存変更あり）か（MCP 上書き防止ガード用） */
  __ttIsThinkDirty?: (thinkId: string) => boolean
  /** 保留中の自動保存を全ペイン分フラッシュし、完了を待つ */
  __ttFlushAllSaves?: () => Promise<void>
  /** 開発者ツールから呼ぶモデルのリセット（App.tsx が登録する） */
  __runTests?: () => void
}
