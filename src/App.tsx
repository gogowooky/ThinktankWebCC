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
import { isIPhone } from './utils/deviceInfo'
import { flushAllPanes } from './utils/unsavedGuard'
import { StorageConflictError } from './services/storage/IStorageBackend'

export default function App() {
  useEffect(() => {
    const app = TTApplication.Instance
    const vault = app.Models.Vault

    // ① UI状態マネージャー初期化（localStorage から即時復元）
    TTUIStateManager.instance.init(app)
    TTShortcutManager.instance.init(app)
    registerFocusedPanelActions(app)

    // UI状態/ショートカットのシステム Think はローカルファイルからの読み込みのみのため、
    // Vault ロード完了を待たず並行して初期化する
    void Promise.all([
      TTUIStateManager.instance.ensureThinkExists(vault),
      TTShortcutManager.instance.ensureThinkExists(vault),
    ]).then(() => {
      // iPhone 表示時は、保存済み UI 状態に関わらず簡易モード・WordWrap を強制する
      // （狭幅画面ではサイドパネルが実質使えず、折り返し無しだと横スクロールが多発するため）
      if (isIPhone()) {
        const ui = TTUIStateManager.instance
        if (ui.getProperty('Application.PanelDisplay.Mode') !== 'Simple') {
          ui.applyProperty('Application.PanelDisplay.Mode', 'Simple')
        }
        if (ui.getProperty('TextEditor.WordWrap.IsVisible') !== 'true') {
          ui.applyProperty('TextEditor.WordWrap.IsVisible', 'true')
        }
      }
    })

    // ② Vault保存/削除失敗（TTThink.SaveContent, TTVault.Create*/DeleteThinks等）は
    // 呼び出し元で個別に catch されていない箇所があるため、未処理の Promise rejection を
    // ここで一括捕捉し、ステータスバーの同期エラー表示（既存の SyncState='error' 導線）で
    // ユーザーに知らせる。以前はここで何も起きず、保存失敗が完全に無音だった。
    // 楽観ロックの衝突（PROJECT_REVIEW_REPORT.md D-2）は専用の確認ダイアログで扱う。
    // 同じ衝突で連続表示しないよう、対応中の thinkId を覚えておく。
    let conflictPromptOpen = false
    const handleConflict = (err: StorageConflictError) => {
      if (conflictPromptOpen) return
      conflictPromptOpen = true
      const think = app.Models.Vault.GetThink(err.thinkId)
      const name  = think?.Name || err.thinkId
      const ok = window.confirm(
        `「${name}」はサーバー側でも更新されています。\n\n` +
        `［OK］ 自分の変更で上書きする\n` +
        `［キャンセル］ ページを再読み込みしてサーバー版を取得する（このメモの未保存の変更は失われます）`,
      )
      if (ok) {
        void think?.SaveContent(true).finally(() => { conflictPromptOpen = false })
      } else {
        window.location.reload()
      }
    }

    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof StorageConflictError) {
        e.preventDefault()
        handleConflict(e.reason)
        return
      }
      console.error('[App] Unhandled promise rejection:', e.reason)
      app.Status.SetSyncState('error')
    }
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    // ②' 未保存データ損失の防止（PROJECT_REVIEW_REPORT.md D-1）
    //   - 開いているペインに未保存の変更（area.IsDirty）があればウィンドウ終了を確認で止める
    //   - タブ非表示・終了直前には保留中の自動保存（3秒デバウンス待ち）を先行実行する
    //   - Electron のパッケージ版は electron/main.cjs の close ハンドラーが下の window 関数を使う
    const hasUnsavedChanges = () => app.WorkoutPanel.Areas.some(a => a.IsDirty)
    window.__ttHasUnsavedChanges = hasUnsavedChanges
    window.__ttFlushAllSaves = () => flushAllPanes()

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      void flushAllPanes()
      if (hasUnsavedChanges()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const handlePageHide = () => { void flushAllPanes() }
    const handleFlushOnHide = () => {
      if (document.visibilityState === 'hidden') void flushAllPanes()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleFlushOnHide)

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
        const colName = name.split('.')[0]
        document.body.dataset.focusColumn = colName

        const isSimple = localStorage.getItem('tt-layout-mode') === 'simple'
        const validColumns = isSimple
          ? ['Thinktank', 'WorkoutSetting', 'Workout']
          : ['Thinktank', 'Overview', 'WorkoutSetting', 'Workout', 'ReThink']

        if (validColumns.includes(colName)) {
          if (app.FocusedColumn !== colName) {
            app.FocusedColumn = colName
            TTUIStateManager.instance.notifyPropertyChanged('Application.FocusedPanel.Name')
          }
        }

        TTUIStateManager.instance.notifyConstPropertyChanged('Application.FocusedArea.Name')
      })
    }
    const handleWindowBlur = () => {
      delete document.body.dataset.focusColumn
      TTUIStateManager.instance.notifyConstPropertyChanged('Application.FocusedArea.Name')
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
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleFlushOnHide)
      delete window.__ttHasUnsavedChanges
      delete window.__ttFlushAllSaves
      cancelAnimationFrame(_focusRaf)
    }
  }, [])

  return <AppLayout />
}
