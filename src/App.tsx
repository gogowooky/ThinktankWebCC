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

      // 昨日更新されたがスナップショットが未作成のものをチェックし、作成確認する
      try {
        const missing = await vault.GetMissingYesterdaySnapshots();
        if (missing.length > 0) {
          const names = missing.slice(0, 3).map(t => `「${t.Name}」`).join(', ') + (missing.length > 3 ? ` など他${missing.length - 3}件` : '');
          const ok = window.confirm(
            `昨日編集した以下のメモのスナップショット（履歴）が作成されていません。作成しますか？\n${names}`
          );
          if (ok) {
            await vault.CreateSnapshotsForYesterday(missing, '前日の未作成スナップショット自動補完');
            alert(`${missing.length}件のスナップショットを作成しました。`);
            vault.NotifyUpdated();
          }
        }
      } catch (e) {
        console.error('[App] Startup snapshot check failed:', e);
      }
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
      })
    }
    const handleWindowBlur = () => {
      delete document.body.dataset.focusColumn
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
