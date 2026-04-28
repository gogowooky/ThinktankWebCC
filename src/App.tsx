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

export default function App() {
  useEffect(() => {
    // デバッグ用リセット関数をグローバルに公開
    window.__runTests = () => {
      TTModels.resetInstance()
      TTApplication.resetInstance()
      console.log('[Thinktank] reset. Reload to re-init.')
    }
  }, [])

  return <AppLayout />
}
