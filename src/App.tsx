import React, { useEffect, useState } from 'react'
import { TTObject } from './models/TTObject'
import { TTCollection } from './models/TTCollection'
import { TTDataItem } from './models/TTDataItem'
import { TTModels } from './models/TTModels'

/**
 * Phase 3: アプリケーションモデル（TTDataItem / TTModels）
 * Phase 5 以降で AppLayout に置き換える。
 */

// ── 型定義 ─────────────────────────────────────────────────────────────

interface TestResult {
  name: string
  passed: boolean
  detail: string
}

// ── Phase 2 テスト（TTObject / TTCollection）──────────────────────────

function runPhase2Tests(): TestResult[] {
  const results: TestResult[] = []
  const pass = (name: string, detail: string) => results.push({ name, passed: true, detail })
  const fail = (name: string, detail: string) => results.push({ name, passed: false, detail })

  const obj = new TTObject()
  obj.ID = 'test-001'; obj.Name = 'TestItem'
  pass('TTObject: インスタンス生成', `ID=${obj.ID}, Name=${obj.Name}`)

  let notified = 0
  obj.AddOnUpdate('test', () => { notified++ })
  obj.UpdateDate = '2000-01-01-000000'
  obj.NotifyUpdated()
  if (notified === 1 && obj.UpdateDate !== '2000-01-01-000000')
    pass('TTObject: Observer 通知 + UpdateDate 更新', `UpdateDate=${obj.UpdateDate}`)
  else
    fail('TTObject: Observer 通知', `notified=${notified}, date変化=${obj.UpdateDate !== '2000-01-01-000000'}`)

  obj.RemoveOnUpdate('test'); obj.NotifyUpdated()
  notified === 1 ? pass('TTObject: Observer 削除', 'RemoveOnUpdate 後に通知されない')
                 : fail('TTObject: Observer 削除', `notified=${notified}`)

  const col = new TTCollection(); col.ID = 'TestCol'
  const i1 = new TTObject(); i1.ID = 'a001'; i1.Name = 'Alpha'
  const i2 = new TTObject(); i2.ID = 'a002'; i2.Name = 'Beta'
  const i3 = new TTObject(); i3.ID = 'a003'; i3.Name = 'Gamma'
  col.AddItem(i1); col.AddItem(i2); col.AddItem(i3)
  col.Count === 3 && i1._parent === col
    ? pass('TTCollection: AddItem × 3', `Count=${col.Count}`)
    : fail('TTCollection: AddItem', `Count=${col.Count}`)

  const found = col.GetItem('a002')
  found?.Name === 'Beta' ? pass('TTCollection: GetItem', `Name=${found.Name}`)
                         : fail('TTCollection: GetItem', `found=${found?.Name}`)

  col.DeleteItem('a002')
  col.Count === 2 && !col.GetItem('a002')
    ? pass('TTCollection: DeleteItem', 'Count=2, a002 削除済み')
    : fail('TTCollection: DeleteItem', `Count=${col.Count}`)

  let colNotified = 0
  col.AddOnUpdate('colTest', () => { colNotified++ })
  i1.NotifyUpdated()
  colNotified >= 1 ? pass('TTCollection: 子 → 親 Observer 伝播', `colNotified=${colNotified}`)
                   : fail('TTCollection: 子 → 親 Observer 伝播', `colNotified=${colNotified}`)

  col.GetItems().length === 2
    ? pass('TTCollection: GetItems', `[${col.GetItems().map(i => i.Name).join(', ')}]`)
    : fail('TTCollection: GetItems', `length=${col.GetItems().length}`)

  col.ItemSaveProperties = 'ID,Name,UpdateDate'
  const csv = col.SerializeToCsv()
  const col2 = new TTCollection(); col2.ItemSaveProperties = 'ID,Name,UpdateDate'
  col2.DeserializeFromCsv(csv)
  col2.Count === 2 && col2.IsLoaded && col2.GetItem('a001')?.Name === 'Alpha'
    ? pass('TTCollection: CSV シリアライズ / デシリアライズ', `復元 Count=${col2.Count}`)
    : fail('TTCollection: CSV シリアライズ / デシリアライズ', `Count=${col2.Count}`)

  col.ClearItems()
  col.Count === 0 && i1._parent === null
    ? pass('TTCollection: ClearItems', '_parent=null, Count=0')
    : fail('TTCollection: ClearItems', `Count=${col.Count}`)

  return results
}

// ── Phase 3 テスト ──────────────────────────────────────────────────────

function runPhase3Tests(): TestResult[] {
  TTModels.resetInstance()
  const results: TestResult[] = []
  const pass = (name: string, detail: string) => results.push({ name, passed: true, detail })
  const fail = (name: string, detail: string) => results.push({ name, passed: false, detail })

  // 1. TTModels シングルトン
  const m = TTModels.Instance
  const m2 = TTModels.Instance
  m === m2 && m.ID === 'Thinktank'
    ? pass('TTModels: シングルトン', `ID=${m.ID}`)
    : fail('TTModels: シングルトン', `同一インスタンス=${m === m2}`)

  // 2. コレクション初期化確認
  m.Status && m.Actions && m.Events && m.Memos
    ? pass('TTModels: コレクション初期化', 'Status / Actions / Events / Memos 設定済み')
    : fail('TTModels: コレクション初期化', '一部コレクションが null')

  // 3. TTDataItem 生成
  const item = new TTDataItem()
  item.ContentType = 'memo'
  item.Keywords = 'テスト,Phase3'
  item.IsMetaOnly = true
  item.DeviceId = 'pc-test-001'
  item.SyncVersion = 1
  item.ID !== '' && item.IsMetaOnly && item.DeviceId === 'pc-test-001'
    ? pass('TTDataItem: 生成 + v4 フィールド', `ID=${item.ID}, DeviceId=${item.DeviceId}, SyncVersion=${item.SyncVersion}`)
    : fail('TTDataItem: 生成', `ID=${item.ID}`)

  // 4. Content setter → タイトル自動抽出
  item.Content = '# Phase3 テストメモ\n本文テキスト'
  item.Name === 'Phase3 テストメモ'
    ? pass('TTDataItem: Content setter → タイトル抽出', `Name="${item.Name}"`)
    : fail('TTDataItem: タイトル抽出', `Name="${item.Name}"`)

  // 5. IsDirty 検出
  item.IsDirty
    ? pass('TTDataItem: IsDirty（未保存）', 'IsDirty=true')
    : fail('TTDataItem: IsDirty', 'IsDirty=false（期待: true）')

  // 6. markSaved → IsDirty=false
  item.markSaved()
  !item.IsDirty
    ? pass('TTDataItem: markSaved → IsDirty=false', 'IsDirty=false')
    : fail('TTDataItem: markSaved', 'IsDirty=true（期待: false）')

  // 7. setContentSilent（通知なし変更）
  let silentNotified = 0
  item.AddOnUpdate('silentTest', () => { silentNotified++ })
  item.setContentSilent('# サイレント変更\n本文')
  silentNotified === 0
    ? pass('TTDataItem: setContentSilent（通知なし）', `silentNotified=${silentNotified}`)
    : fail('TTDataItem: setContentSilent', `silentNotified=${silentNotified}（期待: 0）`)

  // 8. Memos コレクションへのアイテム追加
  const memo = new TTDataItem()
  memo.Content = '# はじめてのメモ\n本文'
  m.Memos.AddItem(memo)
  m.Memos.Count === 1 && m.Memos.GetDataItem(memo.ID)?.Name === 'はじめてのメモ'
    ? pass('TTModels.Memos: AddItem + GetDataItem', `Count=${m.Memos.Count}, Name="${memo.Name}"`)
    : fail('TTModels.Memos: AddItem', `Count=${m.Memos.Count}`)

  // 9. TTStatus: RegisterState + GetValue + SetValue
  m.Status.RegisterState('Test.Value', 'テスト用ステータス', 'default')
  m.Status.RegisterState('Test.Value', '重複登録', 'ignored') // 重複はスキップ
  const before = m.Status.GetValue('Test.Value')
  m.Status.SetValue('Test.Value', 'changed')
  const after = m.Status.GetValue('Test.Value')
  before === 'default' && after === 'changed'
    ? pass('TTStatus: RegisterState + GetValue + SetValue', `${before} → ${after}`)
    : fail('TTStatus: TTStatus CRUD', `before=${before}, after=${after}`)

  // 10. TTActions: Register + Invoke
  let invoked = false
  m.Actions.Register('Test.Action', 'テストアクション', () => { invoked = true })
  const action = m.Actions.GetItem('Test.Action')
  action?.Invoke()
  invoked
    ? pass('TTActions: Register + Invoke', 'スクリプト実行済み')
    : fail('TTActions: Register + Invoke', 'スクリプトが実行されなかった')

  // 11. TTEvents: Register + ResolveActionId
  m.Events.Register('*-*-*', 'Control', 'S', 'Editor.Save')
  const resolved = m.Events.ResolveActionId('*-*-*', 'Control', 'S')
  resolved === 'Editor.Save'
    ? pass('TTEvents: Register + ResolveActionId', `Ctrl+S → ${resolved}`)
    : fail('TTEvents: Register + ResolveActionId', `resolved=${resolved}`)

  // コンソール出力
  console.group('[Phase 3] TTDataItem / TTModels 検証')
  results.forEach(r =>
    r.passed ? console.log(`✅ ${r.name}: ${r.detail}`)
             : console.error(`❌ ${r.name}: ${r.detail}`)
  )
  console.groupEnd()

  return results
}

// ── モード検出 ──────────────────────────────────────────────────────────

const appMode = (window as Window).__THINKTANK_MODE__ ?? 'pwa'
const localApi = (window as Window).__THINKTANK_LOCAL_API__ ?? null

// ── コンポーネント ──────────────────────────────────────────────────────

interface PhaseResults {
  phase: number
  title: string
  results: TestResult[]
}

export default function App() {
  const [phases, setPhases] = useState<PhaseResults[]>([])

  useEffect(() => {
    const p2 = runPhase2Tests()
    const p3 = runPhase3Tests()
    setPhases([
      { phase: 2, title: 'TTObject / TTCollection — CRUD + Observer', results: p2 },
      { phase: 3, title: 'TTDataItem / TTModels — アプリケーションモデル', results: p3 },
    ])
  }, [])

  const totalPassed = phases.reduce((s, p) => s + p.results.filter(r => r.passed).length, 0)
  const totalCount  = phases.reduce((s, p) => s + p.results.length, 0)
  const allOk = totalPassed === totalCount && totalCount > 0

  return (
    <div style={{
      height: '100%', overflowY: 'auto', padding: 'var(--spacing-lg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 'var(--spacing-lg)',
    }}>
      {/* ヘッダー */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', color: 'var(--text-accent)', fontWeight: 600 }}>
          Thinktank — Phase 2 &amp; 3 検証
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
          データモデル基盤 + アプリケーションモデル
        </p>
      </div>

      {/* 合計 */}
      {totalCount > 0 && (
        <div style={{
          padding: '6px 16px',
          background: allOk ? 'rgba(158,206,106,0.12)' : 'rgba(247,118,142,0.12)',
          borderRadius: 'var(--radius)',
          color: allOk ? 'var(--text-success)' : 'var(--text-error)',
          fontWeight: 600, fontSize: 13,
        }}>
          {allOk ? '✅' : '❌'} {totalPassed} / {totalCount} テスト通過
        </div>
      )}

      {/* Phase ごとの結果 */}
      {phases.map(({ phase, title, results }) => {
        const passed = results.filter(r => r.passed).length
        const ok = passed === results.length
        return (
          <div key={phase} style={{ width: '100%', maxWidth: 680 }}>
            <div style={{
              padding: '4px 10px', marginBottom: 4,
              background: ok ? 'rgba(158,206,106,0.08)' : 'rgba(247,118,142,0.08)',
              borderRadius: 'var(--radius-sm)',
              color: ok ? 'var(--text-success)' : 'var(--text-error)',
              fontSize: 12, fontWeight: 600,
            }}>
              Phase {phase}: {title} — {passed}/{results.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-panel)',
                }}>
                  <span style={{ color: r.passed ? 'var(--text-success)' : 'var(--text-error)', flexShrink: 0 }}>
                    {r.passed ? '✅' : '❌'}
                  </span>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontSize: 12 }}>{r.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* モード */}
      <div style={{
        padding: '4px 12px', background: 'var(--bg-panel)',
        borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-muted)',
      }}>
        Mode: <span style={{ color: 'var(--text-accent)' }}>{appMode}</span>
        {localApi && <span style={{ marginLeft: 12 }}>
          API: <span style={{ color: 'var(--text-success)' }}>{localApi}</span>
        </span>}
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>
        Phase 5 で AppLayout に置き換え
      </p>
    </div>
  )
}
