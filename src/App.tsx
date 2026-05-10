/**
 * App.tsx
 * Phase 13: StorageManager 経由で実データをロードする。
 * TTModels コンストラクタが Vault.LoadCache() を非同期起動 →
 * データ到着時に NotifyUpdated → useAppUpdate で各パネルが再レンダリングされる。
 */

import { useEffect } from 'react'
import { AppLayout } from './components/Layout/AppLayout'
import { TTModels } from './models/TTModels'
import { TTApplication } from './views/TTApplication'
import { TTUIStateManager } from './views/TTUIStateManager'
import { TTShortcutManager } from './views/TTShortcutManager'

export default function App() {
  useEffect(() => {
    const app = TTApplication.Instance
    const vault = app.Models.Vault

    // ① UI状態マネージャー初期化（localStorage から即時復元）
    TTUIStateManager.instance.init(app)
    TTShortcutManager.instance.init(app)

    // Vault ロード完了後にシステム Think を作成/同期
    const initManagers = async () => {
      await TTUIStateManager.instance.ensureThinkExists(vault)
      await TTShortcutManager.instance.ensureThinkExists(vault)
    }

    if (vault.IsLoaded) {
      initManagers()
    } else {
      const key = 'App-managers-init'
      vault.AddOnUpdate(key, () => {
        if (!vault.IsLoaded) return
        vault.RemoveOnUpdate(key)
        initManagers()
      })
    }

    // ③ グローバルキーボードショートカットリスナー登録
    const handleKeyDown = (e: KeyboardEvent) =>
      TTShortcutManager.instance.handleKeyDown(e)
    document.addEventListener('keydown', handleKeyDown)

    // デバッグ用リセット関数
    window.__runTests = () => {
      TTModels.resetInstance()
      TTApplication.resetInstance()
      console.log('[Thinktank] reset. Reload to re-init.')
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return <AppLayout />
}
