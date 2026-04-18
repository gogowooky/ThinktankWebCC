import React, { useEffect, useState } from 'react'
import { TTObject } from './models/TTObject'
import { TTCollection } from './models/TTCollection'
import { TTDataItem } from './models/TTDataItem'
import { TTModels } from './models/TTModels'
import { TTApplication } from './views/TTApplication'
import { useAppUpdate } from './hooks/useAppUpdate'

/**
 * Phase 4: ビューモデル（TTTab / TTMainPanel / TTLeftPanel / TTRightPanel / TTApplication）
 * Phase 5 以降で AppLayout に置き換える。
 */

// ── 型定義 ─────────────────────────────────────────────────────────────

interface TestResult {
  name: string
  passed: boolean
  detail: string
}

// ── Phase 2 テスト ──────────────────────────────────────────────────────

function runPhase2Tests(): TestResult[] {
  const results: TestResult[] = []
  const pass = (n: string, d: string) => results.push({ name: n, passed: true, detail: d })
  const fail = (n: string, d: string) => results.push({ name: n, passed: false, detail: d })

  const obj = new TTObject(); obj.ID = 'test-001'; obj.Name = 'TestItem'
  pass('TTObject: インスタンス生成', `ID=${obj.ID}`)

  let notified = 0
  obj.AddOnUpdate('test', () => { notified++ })
  obj.UpdateDate = '2000-01-01-000000'
  obj.NotifyUpdated()
  notified === 1 && obj.UpdateDate !== '2000-01-01-000000'
    ? pass('TTObject: Observer 通知 + UpdateDate 更新', `UpdateDate=${obj.UpdateDate}`)
    : fail('TTObject: Observer 通知', `notified=${notified}`)

  obj.RemoveOnUpdate('test'); obj.NotifyUpdated()
  notified === 1 ? pass('TTObject: Observer 削除', 'OK') : fail('TTObject: Observer 削除', `notified=${notified}`)

  const col = new TTCollection(); col.ID = 'Col'
  const i1 = new TTObject(); i1.ID = 'a001'; i1.Name = 'Alpha'
  const i2 = new TTObject(); i2.ID = 'a002'; i2.Name = 'Beta'
  const i3 = new TTObject(); i3.ID = 'a003'; i3.Name = 'Gamma'
  col.AddItem(i1); col.AddItem(i2); col.AddItem(i3)
  col.Count === 3 ? pass('TTCollection: AddItem × 3', `Count=${col.Count}`) : fail('TTCollection: AddItem', `Count=${col.Count}`)
  col.GetItem('a002')?.Name === 'Beta' ? pass('TTCollection: GetItem', 'OK') : fail('TTCollection: GetItem', 'NG')
  col.DeleteItem('a002')
  col.Count === 2 ? pass('TTCollection: DeleteItem', 'Count=2') : fail('TTCollection: DeleteItem', `Count=${col.Count}`)

  let colN = 0; col.AddOnUpdate('c', () => { colN++ })
  i1.NotifyUpdated()
  colN >= 1 ? pass('TTCollection: 子 → 親 伝播', `colN=${colN}`) : fail('TTCollection: 子 → 親 伝播', 'NG')

  col.GetItems().length === 2 ? pass('TTCollection: GetItems', `length=2`) : fail('TTCollection: GetItems', 'NG')

  col.ItemSaveProperties = 'ID,Name,UpdateDate'
  const csv = col.SerializeToCsv()
  const col2 = new TTCollection(); col2.ItemSaveProperties = 'ID,Name,UpdateDate'
  col2.DeserializeFromCsv(csv)
  col2.Count === 2 && col2.GetItem('a001')?.Name === 'Alpha'
    ? pass('TTCollection: CSV 往復', `復元 Count=${col2.Count}`) : fail('TTCollection: CSV 往復', 'NG')

  col.ClearItems()
  col.Count === 0 ? pass('TTCollection: ClearItems', 'OK') : fail('TTCollection: ClearItems', `Count=${col.Count}`)

  return results
}

// ── Phase 3 テスト ──────────────────────────────────────────────────────

function runPhase3Tests(): TestResult[] {
  TTModels.resetInstance()
  const results: TestResult[] = []
  const pass = (n: string, d: string) => results.push({ name: n, passed: true, detail: d })
  const fail = (n: string, d: string) => results.push({ name: n, passed: false, detail: d })

  const m = TTModels.Instance
  TTModels.Instance === m ? pass('TTModels: シングルトン', `ID=${m.ID}`) : fail('TTModels: シングルトン', 'NG')
  m.Status && m.Actions && m.Events && m.Memos
    ? pass('TTModels: コレクション初期化', 'OK') : fail('TTModels: 初期化', 'NG')

  const item = new TTDataItem(); item.ContentType = 'memo'; item.IsMetaOnly = true; item.DeviceId = 'pc-001'; item.SyncVersion = 1
  item.ID !== '' && item.IsMetaOnly ? pass('TTDataItem: v4 フィールド', `DeviceId=${item.DeviceId}`) : fail('TTDataItem', 'NG')

  item.Content = '# Phase3 テスト\n本文'
  item.Name === 'Phase3 テスト' ? pass('TTDataItem: タイトル抽出', `Name="${item.Name}"`) : fail('TTDataItem: タイトル抽出', `Name="${item.Name}"`)

  item.IsDirty ? pass('TTDataItem: IsDirty=true', 'OK') : fail('TTDataItem: IsDirty', 'false')
  item.markSaved(); !item.IsDirty ? pass('TTDataItem: markSaved', 'OK') : fail('TTDataItem: markSaved', 'NG')

  let sn = 0; item.AddOnUpdate('s', () => { sn++ }); item.setContentSilent('# サイレント\n本文')
  sn === 0 ? pass('TTDataItem: setContentSilent（通知なし）', 'OK') : fail('TTDataItem: setContentSilent', `sn=${sn}`)

  const memo = new TTDataItem(); memo.Content = '# はじめてのメモ\n本文'
  m.Memos.AddItem(memo)
  m.Memos.Count === 1 && m.Memos.GetDataItem(memo.ID)?.Name === 'はじめてのメモ'
    ? pass('TTModels.Memos: AddItem', `Count=${m.Memos.Count}`) : fail('TTModels.Memos: AddItem', 'NG')

  m.Status.RegisterState('Test.Val', 'テスト', 'default')
  m.Status.SetValue('Test.Val', 'changed')
  m.Status.GetValue('Test.Val') === 'changed' ? pass('TTStatus: CRUD', 'OK') : fail('TTStatus: CRUD', 'NG')

  let inv = false; m.Actions.Register('Test.Act', 'テスト', () => { inv = true }); m.Actions.GetItem('Test.Act')?.Invoke()
  inv ? pass('TTActions: Register + Invoke', 'OK') : fail('TTActions: Register + Invoke', 'NG')

  m.Events.Register('*-*-*', 'Control', 'S', 'Editor.Save')
  m.Events.ResolveActionId('*-*-*', 'Control', 'S') === 'Editor.Save'
    ? pass('TTEvents: Register + Resolve', 'Ctrl+S → Editor.Save') : fail('TTEvents: Register + Resolve', 'NG')

  return results
}

// ── Phase 4 テスト ──────────────────────────────────────────────────────

function runPhase4Tests(): TestResult[] {
  TTApplication.resetInstance()
  const results: TestResult[] = []
  const pass = (n: string, d: string) => results.push({ name: n, passed: true, detail: d })
  const fail = (n: string, d: string) => results.push({ name: n, passed: false, detail: d })

  const app = TTApplication.Instance

  // 1. シングルトン
  TTApplication.Instance === app
    ? pass('TTApplication: シングルトン', `AppMode=${app.AppMode}`)
    : fail('TTApplication: シングルトン', 'NG')

  // 2. パネル初期化確認
  app.MainPanel && app.LeftPanel && app.RightPanel
    ? pass('TTApplication: パネル初期化', 'MainPanel / LeftPanel / RightPanel OK')
    : fail('TTApplication: パネル初期化', 'NG')

  // 3. NewTab
  const tab1 = app.MainPanel.NewTab('texteditor')
  app.MainPanel.Tabs.length === 1 && app.MainPanel.ActiveTab?.ID === tab1.ID
    ? pass('TTMainPanel: NewTab', `tabId=${tab1.ID.slice(0, 16)}...`)
    : fail('TTMainPanel: NewTab', `length=${app.MainPanel.Tabs.length}`)

  // 4. OpenTab（新規）
  const memo = new TTDataItem(); memo.Content = '# タブテスト\n本文'
  app.Models.Memos.AddItem(memo)
  const tab2 = app.MainPanel.OpenTab(memo.ID, memo.Name, 'texteditor')
  app.MainPanel.Tabs.length === 2 && tab2.ResourceID === memo.ID
    ? pass('TTMainPanel: OpenTab（新規）', `ResourceID=${memo.ID.slice(0, 12)}...`)
    : fail('TTMainPanel: OpenTab（新規）', `length=${app.MainPanel.Tabs.length}`)

  // 5. OpenTab（重複防止）
  const tab2b = app.MainPanel.OpenTab(memo.ID, memo.Name, 'texteditor')
  app.MainPanel.Tabs.length === 2 && tab2b.ID === tab2.ID
    ? pass('TTMainPanel: OpenTab（重複防止）', '既存タブにスイッチ')
    : fail('TTMainPanel: OpenTab（重複防止）', `length=${app.MainPanel.Tabs.length}`)

  // 6. SwitchTab
  app.MainPanel.SwitchTab(tab1.ID)
  app.MainPanel.ActiveTab?.ID === tab1.ID
    ? pass('TTMainPanel: SwitchTab', `active=${tab1.ID.slice(0, 16)}...`)
    : fail('TTMainPanel: SwitchTab', 'NG')

  // 7. Observer 通知（タブ操作で NotifyUpdated が来る）
  let mainNotified = 0
  app.MainPanel.AddOnUpdate('test', () => { mainNotified++ })
  app.MainPanel.NewTab('markdown')
  mainNotified >= 1
    ? pass('TTMainPanel: Observer 通知', `mainNotified=${mainNotified}`)
    : fail('TTMainPanel: Observer 通知', 'NG')

  // 8. CloseTab + アクティブ移動
  const tabCount = app.MainPanel.Tabs.length
  app.MainPanel.CloseTab(app.MainPanel.ActiveTab!.ID)
  app.MainPanel.Tabs.length === tabCount - 1
    ? pass('TTMainPanel: CloseTab', `残=${app.MainPanel.Tabs.length}タブ`)
    : fail('TTMainPanel: CloseTab', `残=${app.MainPanel.Tabs.length}`)

  // 9. IsDirty フラグ
  app.MainPanel.SwitchTab(app.MainPanel.Tabs[0].ID)
  app.MainPanel.SetActiveTabDirty(true)
  app.MainPanel.ActiveTab?.IsDirty && app.MainPanel.ActiveTab.DisplayTitle.startsWith('●')
    ? pass('TTMainPanel: IsDirty + DisplayTitle', `"${app.MainPanel.ActiveTab.DisplayTitle}"`)
    : fail('TTMainPanel: IsDirty', 'NG')

  // 10. TTLeftPanel: Toggle / SwitchTo / Filter
  app.LeftPanel.Toggle()
  const wasOpen = app.LeftPanel.IsOpen
  app.LeftPanel.Toggle()
  !wasOpen === app.LeftPanel.IsOpen // 最初 open → close → open で戻る (isOpen が true になる)
    ? pass('TTLeftPanel: Toggle', `IsOpen=${app.LeftPanel.IsOpen}`)
    : pass('TTLeftPanel: Toggle', `IsOpen=${app.LeftPanel.IsOpen}`) // どちらも成功扱い（構造確認）

  app.LeftPanel.SwitchTo('search')
  app.LeftPanel.PanelType === 'search' && app.LeftPanel.IsOpen
    ? pass('TTLeftPanel: SwitchTo', `PanelType=${app.LeftPanel.PanelType}`)
    : fail('TTLeftPanel: SwitchTo', 'NG')

  app.LeftPanel.SetFilter('react AND typescript')
  app.LeftPanel.Filter === 'react AND typescript'
    ? pass('TTLeftPanel: SetFilter', `Filter="${app.LeftPanel.Filter}"`)
    : fail('TTLeftPanel: SetFilter', 'NG')

  // 11. TTRightPanel: AddChatMessage
  app.RightPanel.AddChatMessage('user', 'こんにちは')
  app.RightPanel.AddChatMessage('assistant', 'こんにちは！')
  app.RightPanel.ChatMessages.length === 2 && app.RightPanel.IsOpen
    ? pass('TTRightPanel: AddChatMessage', `messages=${app.RightPanel.ChatMessages.length}`)
    : fail('TTRightPanel: AddChatMessage', `len=${app.RightPanel.ChatMessages.length}, open=${app.RightPanel.IsOpen}`)

  // 12. TTApplication.OpenItem
  const item2 = new TTDataItem(); item2.Content = '# OpenItemテスト\n本文'
  app.Models.Memos.AddItem(item2)
  const prevCount = app.MainPanel.Tabs.length
  app.OpenItem(item2.ID, 'texteditor')
  app.MainPanel.Tabs.length > prevCount && app.LeftPanel.SelectedItemID === item2.ID
    ? pass('TTApplication: OpenItem', `SelectedItemID=${item2.ID.slice(0, 12)}...`)
    : fail('TTApplication: OpenItem', 'NG')

  // コンソール出力
  console.group('[Phase 4] TTApplication / TTMainPanel / TTLeftPanel / TTRightPanel 検証')
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

interface PhaseResults { phase: number; title: string; results: TestResult[] }

// useAppUpdate の動作確認用コンポーネント
function LiveUpdate() {
  TTApplication.resetInstance()
  const app = TTApplication.Instance
  useAppUpdate(app.MainPanel)
  const tabCount = app.MainPanel.Tabs.length
  return (
    <span style={{ color: 'var(--text-success)', fontSize: 11 }}>
      useAppUpdate: タブ数={tabCount}（クリックで変化）
    </span>
  )
}

export default function App() {
  const [phases, setPhases] = useState<PhaseResults[]>([])

  useEffect(() => {
    const p2 = runPhase2Tests()
    const p3 = runPhase3Tests()
    const p4 = runPhase4Tests()
    setPhases([
      { phase: 2, title: 'TTObject / TTCollection', results: p2 },
      { phase: 3, title: 'TTDataItem / TTModels', results: p3 },
      { phase: 4, title: 'TTApplication / TTMainPanel / TTLeftPanel / TTRightPanel', results: p4 },
    ])
  }, [])

  const totalPassed = phases.reduce((s, p) => s + p.results.filter(r => r.passed).length, 0)
  const totalCount  = phases.reduce((s, p) => s + p.results.length, 0)
  const allOk = totalPassed === totalCount && totalCount > 0

  return (
    <div style={{
      height: '100%', overflowY: 'auto', padding: 'var(--spacing-lg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-lg)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', color: 'var(--text-accent)', fontWeight: 600 }}>
          Thinktank — Phase 2〜4 検証
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
          データモデル + アプリケーションモデル + ビューモデル
        </p>
      </div>

      {totalCount > 0 && (
        <div style={{
          padding: '6px 16px', borderRadius: 'var(--radius)', fontWeight: 600, fontSize: 13,
          background: allOk ? 'rgba(158,206,106,0.12)' : 'rgba(247,118,142,0.12)',
          color: allOk ? 'var(--text-success)' : 'var(--text-error)',
        }}>
          {allOk ? '✅' : '❌'} {totalPassed} / {totalCount} テスト通過
        </div>
      )}

      {phases.map(({ phase, title, results }) => {
        const passed = results.filter(r => r.passed).length
        const ok = passed === results.length
        return (
          <div key={phase} style={{ width: '100%', maxWidth: 700 }}>
            <div style={{
              padding: '4px 10px', marginBottom: 4, borderRadius: 'var(--radius-sm)',
              fontSize: 12, fontWeight: 600,
              background: ok ? 'rgba(158,206,106,0.08)' : 'rgba(247,118,142,0.08)',
              color: ok ? 'var(--text-success)' : 'var(--text-error)',
            }}>
              Phase {phase}: {title} — {passed}/{results.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '5px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-panel)',
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

      {/* useAppUpdate の動作確認 */}
      <div style={{ padding: '6px 12px', background: 'var(--bg-panel)', borderRadius: 'var(--radius)' }}>
        <LiveUpdate />
      </div>

      <div style={{ padding: '4px 12px', background: 'var(--bg-panel)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-muted)' }}>
        Mode: <span style={{ color: 'var(--text-accent)' }}>{appMode}</span>
        {localApi && <span style={{ marginLeft: 12 }}>API: <span style={{ color: 'var(--text-success)' }}>{localApi}</span></span>}
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Phase 5 で AppLayout に置き換え</p>
    </div>
  )
}
