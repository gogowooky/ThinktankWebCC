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
import { registerFocusedPanelActions } from './views/TTFocusedPanelActions'
import { getFocusName } from './utils/getFocusName'

export default function App() {
  useEffect(() => {
    const app = TTApplication.Instance
    const vault = app.Models.Vault

    // ① UI状態マネージャー初期化（localStorage から即時復元）
    TTUIStateManager.instance.init(app)
    TTShortcutManager.instance.init(app)
    registerFocusedPanelActions(app)

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

    // ③ グローバルキーボード / マウス / ホイールショートカットリスナー登録
    const handleKeyDown   = (e: KeyboardEvent) => TTShortcutManager.instance.handleKeyDown(e)
    const handleClick     = (e: MouseEvent)    => TTShortcutManager.instance.handleMouseEvent('click',       e)
    const handleDblClick  = (e: MouseEvent)    => TTShortcutManager.instance.handleMouseEvent('dblclick',    e)
    const handleCtxMenu   = (e: MouseEvent)    => TTShortcutManager.instance.handleMouseEvent('contextmenu', e)
    const handleWheel     = (e: WheelEvent)    => TTShortcutManager.instance.handleWheelEvent(e)
    let _focusRaf = 0
    const handleFocusIn   = () => {
      cancelAnimationFrame(_focusRaf)
      _focusRaf = requestAnimationFrame(() => {
        const name = getFocusName(document.activeElement)
        TTShortcutManager.instance.onFocusChange(name)
        document.body.dataset.focusColumn = name.split('.')[0]
        TTUIStateManager.instance.notifyConstPropertyChanged('Application.KeyboardFocused.AreaName')
      })
    }
    const handleWindowBlur = () => {
      delete document.body.dataset.focusColumn
      TTUIStateManager.instance.notifyConstPropertyChanged('Application.KeyboardFocused.AreaName')
    }

    // capture: true でキャプチャフェーズ登録 → テキストボックス・Monaco 含む
    // あらゆる要素より先に実行されるため ExMode ショートカット等が必ず発動する
    document.addEventListener('keydown',     handleKeyDown,  { capture: true })
    document.addEventListener('click',       handleClick)
    document.addEventListener('dblclick',    handleDblClick)
    document.addEventListener('contextmenu', handleCtxMenu)
    document.addEventListener('wheel',       handleWheel,    { passive: false })
    document.addEventListener('focusin',     handleFocusIn)
    window.addEventListener('blur',          handleWindowBlur)

    // デバッグ用リセット関数
    window.__runTests = () => {
      TTModels.resetInstance()
      TTApplication.resetInstance()
      console.log('[Thinktank] reset. Reload to re-init.')
    }

    return () => {
      document.removeEventListener('keydown',     handleKeyDown,  { capture: true })
      document.removeEventListener('click',       handleClick)
      document.removeEventListener('dblclick',    handleDblClick)
      document.removeEventListener('contextmenu', handleCtxMenu)
      document.removeEventListener('wheel',       handleWheel)
      document.removeEventListener('focusin',     handleFocusIn)
      window.removeEventListener('blur',          handleWindowBlur)
      cancelAnimationFrame(_focusRaf)
    }
  }, [])

  return <AppLayout />
}
