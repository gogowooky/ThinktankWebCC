/**
 * App.tsx
 * Phase 1-3 検証ページ
 * - CSS変数カラースウォッチ
 * - モード検出（window.__THINKTANK_MODE__）
 * - TTVault / TTThink / TTModels の動作確認
 */

import { useEffect, useState } from 'react'
import { TTThink } from './models/TTThink'
import { TTVault } from './models/TTVault'
import { TTModels } from './models/TTModels'

// ── Phase 1-3 テスト ────────────────────────────────────────────────────

function runPhase3Tests(): string[] {
  const results: string[] = []
  TTModels.resetInstance()
  const models = TTModels.Instance

  // 1. TTModels シングルトン
  results.push(`[1] TTModels singleton: ${TTModels.Instance === models ? 'OK' : 'FAIL'}`)

  // 2. TTVault 初期化
  const vault = models.Vault
  results.push(`[2] TTVault exists: ${vault instanceof TTVault ? 'OK' : 'FAIL'}`)
  results.push(`[2] TTVault name: ${vault.VaultName}`)

  // 3. TTThink 追加（memo）
  const memo = new TTThink()
  memo.ContentType = 'memo'
  memo.Content = '# テストメモ\nこれはテストです。'
  vault.AddThink(memo)
  results.push(`[3] AddThink(memo): ${vault.Count === 1 ? 'OK' : 'FAIL'} (count=${vault.Count})`)
  results.push(`[3] VaultID auto-set: ${memo.VaultID === vault.ID ? 'OK' : 'FAIL'}`)
  results.push(`[3] Title extracted: ${memo.Name}`)

  // 4. ContentType 各種
  const contentTypes = ['memo', 'thought', 'tables', 'links', 'chat', 'nettext'] as const
  contentTypes.forEach(ct => {
    const t = new TTThink()
    t.ContentType = ct
    t.Content = `${ct} コンテンツ`
    vault.AddThink(t)
  })
  results.push(`[4] All ContentTypes added: count=${vault.Count}`)

  // 5. TTThink（thought）テスト
  const thought = new TTThink()
  thought.ContentType = 'thought'
  thought.Content = `# テストThought\n> メモ\n* ${memo.ID}`
  vault.AddThink(thought)

  // 6. GetThoughts()
  const thoughts = vault.GetThoughts()
  results.push(`[5] GetThoughts(): ${thoughts.length >= 1 ? 'OK' : 'FAIL'} (count=${thoughts.length})`)

  // 7. GetThinksForThought()
  const linkedThinks = vault.GetThinksForThought(thought.ID)
  results.push(`[6] GetThinksForThought(): ${linkedThinks.length >= 1 ? 'OK' : 'FAIL'} (count=${linkedThinks.length})`)

  // 8. IsDirty
  const item = new TTThink()
  item.Content = 'dirty test'
  results.push(`[7] IsDirty before markSaved: ${item.IsDirty ? 'OK' : 'FAIL'}`)
  item.markSaved()
  results.push(`[7] IsDirty after markSaved: ${!item.IsDirty ? 'OK' : 'FAIL'}`)

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
  const [testResults, setTestResults] = useState<string[]>([])

  useEffect(() => {
    const results = runPhase3Tests()
    setTestResults(results)
    window.__runTests = () => {
      TTModels.resetInstance()
      const r = runPhase3Tests()
      setTestResults(r)
      console.log('[Tests]', r)
    }
  }, [])

  const allPassed = testResults.every(r => !r.includes('FAIL'))

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%', background: 'var(--bg-primary)' }}>
      <h1 style={{ color: 'var(--text-accent)', marginBottom: 24, fontSize: 20 }}>
        Thinktank v5 — Phase 1-3 検証
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
          Phase 3 テスト結果 {allPassed ? '✓ ALL PASS' : '✗ FAIL あり'}
        </h2>
        <div style={{ background: 'var(--bg-panel)', padding: 12, borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: 12 }}>
          {testResults.map((r, i) => (
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
