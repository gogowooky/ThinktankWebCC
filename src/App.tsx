/**
 * App.tsx
 * Phase 5: 4パネルレイアウトを AppLayout で描画する。
 *
 * Phase 1-4 の検証テストは window.__runTests() で引き続き実行可能。
 */

import { useEffect } from 'react'
import { AppLayout } from './components/Layout/AppLayout'
import { TTModels } from './models/TTModels'
import { TTApplication } from './views/TTApplication'

// ── グローバル型拡張 ──────────────────────────────────────────────────

declare global {
  interface Window {
    __runTests?: () => void
  }
}

// ── App ───────────────────────────────────────────────────────────────

export default function App() {
  useEffect(() => {
    // コンソールから手動テストを実行できるようにしておく
    window.__runTests = () => {
      TTModels.resetInstance()
      TTApplication.resetInstance()
      console.log('[Thinktank] Models/Application reset. Reload to re-init.')
    }
  }, [])

  return <AppLayout />
}
