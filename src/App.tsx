/**
 * App.tsx
 * Phase 1-4 検証ページ
 * - Phase 1-3: CSS変数カラースウォッチ / モード検出 / TTVault / TTThink / TTModels
 * - Phase 4: TTApplication / 4パネルビューモデル動作確認
 */

import { useEffect, useState } from 'react'
import { TTThink } from './models/TTThink'
import { TTVault } from './models/TTVault'
import { TTModels } from './models/TTModels'
import { TTApplication } from './views/TTApplication'

// ── Phase 1-3 テスト ────────────────────────────────────────────────────

function runPhase3Tests(): string[] {
  const results: string[] = []
  TTModels.resetInstance()
  const models = TTModels.Instance

  results.push(`[1] TTModels singleton: ${TTModels.Instance === models ? 'OK' : 'FAIL'}`)

  const vault = models.Vault
  results.push(`[2] TTVault exists: ${vault instanceof TTVault ? 'OK' : 'FAIL'}`)
  results.push(`[2] TTVault name: ${vault.VaultName}`)

  const memo = new TTThink()
  memo.ContentType = 'memo'
  memo.Content = '# テストメモ\nこれはテストです。'
  vault.AddThink(memo)
  results.push(`[3] AddThink(memo): ${vault.Count === 1 ? 'OK' : 'FAIL'} (count=${vault.Count})`)
  results.push(`[3] VaultID auto-set: ${memo.VaultID === vault.ID ? 'OK' : 'FAIL'}`)
  results.push(`[3] Title extracted: ${memo.Name}`)

  const contentTypes = ['memo', 'thought', 'tables', 'links', 'chat', 'nettext'] as const
  contentTypes.forEach(ct => {
    const t = new TTThink()
    t.ContentType = ct
    t.Content = `${ct} コンテンツ`
    vault.AddThink(t)
  })
  results.push(`[4] All ContentTypes added: count=${vault.Count}`)

  const thought = new TTThink()
  thought.ContentType = 'thought'
  thought.Content = `# テストThought\n> メモ\n* ${memo.ID}`
  vault.AddThink(thought)

  const thoughts = vault.GetThoughts()
  results.push(`[5] GetThoughts(): ${thoughts.length >= 1 ? 'OK' : 'FAIL'} (count=${thoughts.length})`)

  const linkedThinks = vault.GetThinksForThought(thought.ID)
  results.push(`[6] GetThinksForThought(): ${linkedThinks.length >= 1 ? 'OK' : 'FAIL'} (count=${linkedThinks.length})`)

  const item = new TTThink()
  item.Content = 'dirty test'
  results.push(`[7] IsDirty before markSaved: ${item.IsDirty ? 'OK' : 'FAIL'}`)
  item.markSaved()
  results.push(`[7] IsDirty after markSaved: ${!item.IsDirty ? 'OK' : 'FAIL'}`)

  return results
}

// ── Phase 4 テスト ──────────────────────────────────────────────────────

function runPhase4Tests(): string[] {
  const results: string[] = []

  TTApplication.resetInstance()
  const app = TTApplication.Instance

  // 1. シングルトン
  results.push(`[1] TTApplication singleton: ${TTApplication.Instance === app ? 'OK' : 'FAIL'}`)

  // 2. 4パネル生成
  results.push(`[2] ThinktankPanel: ${app.ThinktankPanel.ID === 'ThinktankPanel' ? 'OK' : 'FAIL'}`)
  results.push(`[2] OverviewPanel:  ${app.OverviewPanel.ID  === 'OverviewPanel'  ? 'OK' : 'FAIL'}`)
  results.push(`[2] WorkoutPanel:   ${app.WorkoutPanel.ID   === 'WorkoutPanel'   ? 'OK' : 'FAIL'}`)
  results.push(`[2] ToDoPanel:      ${app.ToDoPanel.ID      === 'ToDoPanel'      ? 'OK' : 'FAIL'}`)

  // 3. 各パネル開閉
  app.ThinktankPanel.ToggleArea()
  results.push(`[3] ThinktankPanel ToggleArea (close): ${!app.ThinktankPanel.IsAreaOpen ? 'OK' : 'FAIL'}`)
  app.ThinktankPanel.ToggleArea()
  results.push(`[3] ThinktankPanel ToggleArea (reopen): ${app.ThinktankPanel.IsAreaOpen ? 'OK' : 'FAIL'}`)
  app.OverviewPanel.ToggleArea()
  results.push(`[3] OverviewPanel ToggleArea (close): ${!app.OverviewPanel.IsAreaOpen ? 'OK' : 'FAIL'}`)
  app.OverviewPanel.ToggleArea()
  app.ToDoPanel.ToggleArea()
  results.push(`[3] ToDoPanel ToggleArea (close): ${!app.ToDoPanel.IsAreaOpen ? 'OK' : 'FAIL'}`)
  app.ToDoPanel.ToggleArea()

  // 4. OpenThought: ThinktankPanel選択・OverviewPanel表示・ToDoPanel連携
  const dummyThoughtId = '2026-04-26-120000'
  app.OpenThought(dummyThoughtId)
  results.push(`[4] OpenThought - ThinktankPanel.SelectedThoughtID: ${app.ThinktankPanel.SelectedThoughtID === dummyThoughtId ? 'OK' : 'FAIL'}`)
  results.push(`[4] OpenThought - OverviewPanel.ThoughtID: ${app.OverviewPanel.ThoughtID === dummyThoughtId ? 'OK' : 'FAIL'}`)
  results.push(`[4] OpenThought - ToDoPanel.LinkedThoughtID: ${app.ToDoPanel.LinkedThoughtID === dummyThoughtId ? 'OK' : 'FAIL'}`)
  results.push(`[4] OpenThought - OverviewPanel.IsAreaOpen: ${app.OverviewPanel.IsAreaOpen ? 'OK' : 'FAIL'}`)

  // 5. WorkoutPanel: Area追加・削除・グリッド再計算
  const area0 = app.WorkoutPanel.AddArea('think-001', 'texteditor', 'メモ1')
  const area1 = app.WorkoutPanel.AddArea('think-002', 'markdown',   'メモ2')
  const area2 = app.WorkoutPanel.AddArea('think-003', 'datagrid',   'テーブル')
  results.push(`[5] AddArea x3: count=${app.WorkoutPanel.Areas.length} ${app.WorkoutPanel.Areas.length === 3 ? 'OK' : 'FAIL'}`)
  results.push(`[5] area0.Position: row=${area0!.Position.row} col=${area0!.Position.col}`)
  results.push(`[5] area1.Position: row=${area1!.Position.row} col=${area1!.Position.col}`)
  results.push(`[5] area2.RowSpan (datagrid→2): ${area2!.RowSpan === 2 ? 'OK' : 'FAIL'}`)
  app.WorkoutPanel.RemoveArea(area1!.ID)
  results.push(`[5] RemoveArea: count=${app.WorkoutPanel.Areas.length} ${app.WorkoutPanel.Areas.length === 2 ? 'OK' : 'FAIL'}`)
  for (let i = 0; i < 4; i++) app.WorkoutPanel.AddArea(`think-fill-${i}`, 'texteditor')
  results.push(`[5] IsFull (6 areas): ${app.WorkoutPanel.IsFull ? 'OK' : 'FAIL'}`)
  const overflow = app.WorkoutPanel.AddArea('think-overflow', 'texteditor')
  results.push(`[5] AddArea when full returns null: ${overflow === null ? 'OK' : 'FAIL'}`)

  // 6. MoveArea（ドラッグ移動）
  const areas = app.WorkoutPanel.Areas
  if (areas.length >= 2) {
    const id0 = areas[0].ID
    const id1 = areas[1].ID
    app.WorkoutPanel.MoveArea(id0, id1)
    results.push(`[6] MoveArea: areas[0] swapped: ${app.WorkoutPanel.Areas[0].ID === id1 ? 'OK' : 'FAIL'}`)
  }

  // 7. ThinktankPanel フィルター・チェック
  app.ThinktankPanel.SetFilter('テスト')
  results.push(`[7] ThinktankPanel.Filter: ${app.ThinktankPanel.Filter === 'テスト' ? 'OK' : 'FAIL'}`)
  app.ThinktankPanel.ToggleCheck('thought-001')
  app.ThinktankPanel.ToggleCheck('thought-002')
  results.push(`[7] CheckedThoughtIDs count=2: ${app.ThinktankPanel.CheckedThoughtIDs.length === 2 ? 'OK' : 'FAIL'}`)
  app.ThinktankPanel.ToggleCheck('thought-001')
  results.push(`[7] ToggleCheck off (count=1): ${app.ThinktankPanel.CheckedThoughtIDs.length === 1 ? 'OK' : 'FAIL'}`)

  // 8. ToDoPanel チャット
  app.ToDoPanel.AddUserMessage('テスト質問です')
  app.ToDoPanel.AddAssistantMessage('テスト回答です')
  results.push(`[8] ChatMessages count=2: ${app.ToDoPanel.ChatMessages.length === 2 ? 'OK' : 'FAIL'}`)
  results.push(`[8] ChatMessages[0].role=user: ${app.ToDoPanel.ChatMessages[0].role === 'user' ? 'OK' : 'FAIL'}`)
  app.ToDoPanel.ClearChat()
  results.push(`[8] ClearChat: ${app.ToDoPanel.ChatMessages.length === 0 ? 'OK' : 'FAIL'}`)

  // 9. App.Reset()
  app.Reset()
  results.push(`[9] Reset - WorkoutPanel empty: ${app.WorkoutPanel.Areas.length === 0 ? 'OK' : 'FAIL'}`)
  results.push(`[9] Reset - SelectedThoughtID empty: ${app.ThinktankPanel.SelectedThoughtID === '' ? 'OK' : 'FAIL'}`)
  results.push(`[9] Reset - ToDoPanel.LinkedThoughtID empty: ${app.ToDoPanel.LinkedThoughtID === '' ? 'OK' : 'FAIL'}`)

  return results
}

// ── カラースウォッチ ───────────────────────────────────────────────────

const COLOR_THEMES = [
  { name: 'ThinktankPanel', ribbon: 'var(--thinktank-ribbon-bg)', area: 'var(--thinktank-area-bg)', ribbonHex: '#073763', areaHex: '#E8F1F8' },
  { name: 'OverviewPanel',  ribbon: 'var(--overview-ribbon-bg)',  area: 'var(--overview-area-bg)',  ribbonHex: '#3949AB', areaHex: '#F9FAFF' },
  { name: 'WorkoutPanel',   ribbon: 'var(--workout-ribbon-bg)',   area: 'var(--workout-area-bg)',   ribbonHex: '#3F3F3F', areaHex: '#D0D0D0' },
  { name: 'ToDoPanel',      ribbon: 'var(--todo-ribbon-bg)',      area: 'var(--todo-area-bg)',      ribbonHex: '#1E4620', areaHex: '#E2EFDA' },
]

const BG_VARS = [
  { name: '--bg-primary',   value: '#1e2030' },
  { name: '--bg-secondary', value: '#1a1b26' },
  { name: '--bg-panel',     value: '#24283b' },
  { name: '--bg-hover',     value: '#2a3050' },
  { name: '--bg-selected',  value: '#2e3460' },
]

const TEXT_VARS = [
  { name: '--text-primary',   value: '#c0caf5' },
  { name: '--text-muted',     value: '#565f89' },
  { name: '--text-accent',    value: '#7aa2f7' },
  { name: '--text-highlight', value: '#e0af68' },
  { name: '--text-success',   value: '#9ece6a' },
  { name: '--text-warning',   value: '#ff9e64' },
  { name: '--text-error',     value: '#f7768e' },
]

// ── コンポーネント ─────────────────────────────────────────────────────

export default function App() {
  const mode = window.__THINKTANK_MODE__ ?? 'pwa'
  const localApi = window.__THINKTANK_LOCAL_API__ ?? '(not injected)'
  const [phase3Results, setPhase3Results] = useState<string[]>([])
  const [phase4Results, setPhase4Results] = useState<string[]>([])

  useEffect(() => {
    setPhase3Results(runPhase3Tests())
    setPhase4Results(runPhase4Tests())
    window.__runTests = () => {
      TTModels.resetInstance()
      TTApplication.resetInstance()
      const r3 = runPhase3Tests()
      const r4 = runPhase4Tests()
      setPhase3Results(r3)
      setPhase4Results(r4)
      console.log('[Phase3]', r3)
      console.log('[Phase4]', r4)
    }
  }, [])

  const allPhase3Passed = phase3Results.every(r => !r.includes('FAIL'))
  const allPhase4Passed = phase4Results.every(r => !r.includes('FAIL'))

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%', background: 'var(--bg-primary)' }}>
      <h1 style={{ color: 'var(--text-accent)', marginBottom: 24, fontSize: 20 }}>
        Thinktank v5 — Phase 1-4 検証
      </h1>

      {/* モード検出 */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text-highlight)', marginBottom: 8, fontSize: 14 }}>モード検出</h2>
        <div style={{ background: 'var(--bg-panel)', padding: 12, borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: 12 }}>
          <div>__THINKTANK_MODE__ = <span style={{ color: 'var(--text-success)' }}>{mode}</span></div>
          <div>__THINKTANK_LOCAL_API__ = <span style={{ color: 'var(--text-success)' }}>{localApi}</span></div>
        </div>
      </section>

      {/* Phase 3 テスト結果 */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text-highlight)', marginBottom: 8, fontSize: 14 }}>
          Phase 3 テスト結果 {allPhase3Passed ? '✓ ALL PASS' : '✗ FAIL あり'}
        </h2>
        <div style={{ background: 'var(--bg-panel)', padding: 12, borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: 12 }}>
          {phase3Results.map((r, i) => (
            <div key={i} style={{ color: r.includes('FAIL') ? 'var(--text-error)' : 'var(--text-success)' }}>{r}</div>
          ))}
        </div>
      </section>

      {/* Phase 4 テスト結果 */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text-highlight)', marginBottom: 8, fontSize: 14 }}>
          Phase 4 テスト結果 {allPhase4Passed ? '✓ ALL PASS' : '✗ FAIL あり'}
        </h2>
        <div style={{ background: 'var(--bg-panel)', padding: 12, borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: 12 }}>
          {phase4Results.map((r, i) => (
            <div key={i} style={{ color: r.includes('FAIL') ? 'var(--text-error)' : 'var(--text-success)' }}>{r}</div>
          ))}
        </div>
      </section>

      {/* パネルカラーテーマ */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text-highlight)', marginBottom: 8, fontSize: 14 }}>パネル別カラーテーマ</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {COLOR_THEMES.map(t => (
            <div key={t.name} style={{ borderRadius: 'var(--radius)', overflow: 'hidden', width: 160 }}>
              <div style={{ background: t.ribbon, padding: '6px 10px', fontSize: 11, color: '#fff', fontWeight: 600 }}>
                {t.name}<br /><span style={{ fontWeight: 400, opacity: 0.8 }}>{t.ribbonHex}</span>
              </div>
              <div style={{ background: t.area, padding: '6px 10px', fontSize: 11, color: '#333' }}>
                Area<br />{t.areaHex}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 背景色パレット */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text-highlight)', marginBottom: 8, fontSize: 14 }}>背景色パレット</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {BG_VARS.map(v => (
            <div key={v.name} style={{ background: v.value, borderRadius: 4, padding: '8px 10px', fontSize: 10, color: 'var(--text-muted)', minWidth: 100 }}>
              {v.name}<br />{v.value}
            </div>
          ))}
        </div>
      </section>

      {/* テキスト色パレット */}
      <section>
        <h2 style={{ color: 'var(--text-highlight)', marginBottom: 8, fontSize: 14 }}>テキスト色パレット</h2>
        <div style={{ background: 'var(--bg-panel)', padding: 12, borderRadius: 'var(--radius)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {TEXT_VARS.map(v => (
            <span key={v.name} style={{ color: v.value, fontSize: 12 }}>
              {v.name.replace('--text-', '')}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
