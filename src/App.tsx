import React, { useEffect, useState } from 'react'
import { TTObject } from './models/TTObject'
import { TTCollection } from './models/TTCollection'

/**
 * Phase 2: データモデル基盤（TTObject / TTCollection）
 * TTObject / TTCollection の CRUD と Observer 通知を検証する。
 * Phase 5 以降で AppLayout に置き換える。
 */

// ── Phase 2 検証ロジック ────────────────────────────────────────────────

interface TestResult {
  name: string
  passed: boolean
  detail: string
}

function runPhase2Tests(): TestResult[] {
  const results: TestResult[] = []
  const pass = (name: string, detail: string) => results.push({ name, passed: true, detail })
  const fail = (name: string, detail: string) => results.push({ name, passed: false, detail })

  // ── TTObject ──────────────────────────────────────────────────────────

  // 1. インスタンス生成
  const obj = new TTObject()
  obj.ID   = 'test-001'
  obj.Name = 'TestItem'
  pass('TTObject: インスタンス生成', `ID=${obj.ID}, Name=${obj.Name}`)

  // 2. Observer 通知
  let notified = 0
  obj.AddOnUpdate('test', () => { notified++ })
  const dateBefore = obj.UpdateDate
  obj.NotifyUpdated()
  if (notified === 1 && obj.UpdateDate !== dateBefore) {
    pass('TTObject: Observer 通知 + UpdateDate 更新', `UpdateDate=${obj.UpdateDate}`)
  } else {
    fail('TTObject: Observer 通知', `notified=${notified}, date変化=${obj.UpdateDate !== dateBefore}`)
  }

  // 3. Observer 削除
  obj.RemoveOnUpdate('test')
  obj.NotifyUpdated()
  if (notified === 1) {
    pass('TTObject: Observer 削除', 'RemoveOnUpdate 後に通知されない')
  } else {
    fail('TTObject: Observer 削除', `notified=${notified} (期待: 1)`)
  }

  // ── TTCollection CRUD ─────────────────────────────────────────────────

  const col = new TTCollection()
  col.ID = 'TestCollection'

  // 4. AddItem
  const item1 = new TTObject(); item1.ID = 'a001'; item1.Name = 'Alpha'
  const item2 = new TTObject(); item2.ID = 'a002'; item2.Name = 'Beta'
  const item3 = new TTObject(); item3.ID = 'a003'; item3.Name = 'Gamma'
  col.AddItem(item1)
  col.AddItem(item2)
  col.AddItem(item3)
  if (col.Count === 3 && item1._parent === col) {
    pass('TTCollection: AddItem × 3', `Count=${col.Count}, _parent 設定済み`)
  } else {
    fail('TTCollection: AddItem', `Count=${col.Count}`)
  }

  // 5. GetItem
  const found = col.GetItem('a002')
  if (found && found.Name === 'Beta') {
    pass('TTCollection: GetItem', `Name=${found.Name}`)
  } else {
    fail('TTCollection: GetItem', `found=${found?.Name}`)
  }

  // 6. DeleteItem
  col.DeleteItem('a002')
  if (col.Count === 2 && !col.GetItem('a002')) {
    pass('TTCollection: DeleteItem', 'Count=2, a002 削除済み')
  } else {
    fail('TTCollection: DeleteItem', `Count=${col.Count}`)
  }

  // 7. コレクションへの Observer 通知伝播
  let colNotified = 0
  col.AddOnUpdate('colTest', () => { colNotified++ })
  item1.NotifyUpdated()   // 子 → 親への伝播
  if (colNotified >= 1) {
    pass('TTCollection: 子 → 親 Observer 伝播', `colNotified=${colNotified}`)
  } else {
    fail('TTCollection: 子 → 親 Observer 伝播', `colNotified=${colNotified}`)
  }

  // 8. GetItems
  const items = col.GetItems()
  if (items.length === 2) {
    pass('TTCollection: GetItems', `[${items.map(i => i.Name).join(', ')}]`)
  } else {
    fail('TTCollection: GetItems', `length=${items.length}`)
  }

  // 9. CSV シリアライズ / デシリアライズ
  col.ItemSaveProperties = 'ID,Name,UpdateDate'
  const csv = col.SerializeToCsv()
  const col2 = new TTCollection()
  col2.ItemSaveProperties = 'ID,Name,UpdateDate'
  col2.DeserializeFromCsv(csv)
  if (col2.Count === 2 && col2.IsLoaded && col2.GetItem('a001')?.Name === 'Alpha') {
    pass('TTCollection: CSV シリアライズ / デシリアライズ', `復元 Count=${col2.Count}`)
  } else {
    fail('TTCollection: CSV シリアライズ / デシリアライズ', `Count=${col2.Count}, IsLoaded=${col2.IsLoaded}`)
  }

  // 10. ClearItems
  col.ClearItems()
  if (col.Count === 0 && item1._parent === null) {
    pass('TTCollection: ClearItems', '_parent=null, Count=0')
  } else {
    fail('TTCollection: ClearItems', `Count=${col.Count}`)
  }

  // コンソールにも出力
  console.group('[Phase 2] TTObject / TTCollection 検証')
  results.forEach(r => {
    if (r.passed) {
      console.log(`✅ ${r.name}: ${r.detail}`)
    } else {
      console.error(`❌ ${r.name}: ${r.detail}`)
    }
  })
  console.groupEnd()

  return results
}

// ── モード検出（Phase 13 で StorageManager に移動） ──────────────────────
const appMode = (window as Window).__THINKTANK_MODE__ ?? 'pwa'
const localApi = (window as Window).__THINKTANK_LOCAL_API__ ?? null

// ── コンポーネント ─────────────────────────────────────────────────────

export default function App() {
  const [testResults, setTestResults] = useState<TestResult[]>([])

  useEffect(() => {
    const results = runPhase2Tests()
    setTestResults(results)
  }, [])

  const passed = testResults.filter(r => r.passed).length
  const total  = testResults.length
  const allOk  = passed === total && total > 0

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--spacing-lg)',
      overflowY: 'auto',
      padding: 'var(--spacing-lg)',
    }}>

      {/* ヘッダー */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', color: 'var(--text-accent)', fontWeight: 600 }}>
          Thinktank — Phase 2 検証
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
          TTObject / TTCollection — CRUD + Observer 通知
        </p>
      </div>

      {/* 合計サマリー */}
      {total > 0 && (
        <div style={{
          padding: 'var(--spacing-sm) var(--spacing-md)',
          background: allOk ? 'rgba(158,206,106,0.12)' : 'rgba(247,118,142,0.12)',
          borderRadius: 'var(--radius)',
          color: allOk ? 'var(--text-success)' : 'var(--text-error)',
          fontWeight: 600,
          fontSize: 'var(--font-size-sm)',
        }}>
          {allOk ? '✅' : '❌'} {passed} / {total} テスト通過
        </div>
      )}

      {/* テスト結果リスト */}
      <div style={{
        width: '100%',
        maxWidth: 640,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        {testResults.map((r, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '6px var(--spacing-sm)',
            background: 'var(--bg-panel)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <span style={{ color: r.passed ? 'var(--text-success)' : 'var(--text-error)', flexShrink: 0 }}>
              {r.passed ? '✅' : '❌'}
            </span>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)' }}>
                {r.name}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {r.detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* モード情報 */}
      <div style={{
        padding: 'var(--spacing-sm) var(--spacing-md)',
        background: 'var(--bg-panel)',
        borderRadius: 'var(--radius)',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--text-muted)',
      }}>
        Mode: <span style={{ color: 'var(--text-accent)' }}>{appMode}</span>
        {localApi && (
          <span style={{ marginLeft: 'var(--spacing-md)' }}>
            Local API: <span style={{ color: 'var(--text-success)' }}>{localApi}</span>
          </span>
        )}
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
        Phase 5 で AppLayout に置き換え
      </p>
    </div>
  )
}
