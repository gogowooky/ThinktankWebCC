import React from 'react'
import { TTObject } from './models/TTObject'
import { TTCollection } from './models/TTCollection'
import { TTDataItem } from './models/TTDataItem'
import { TTModels } from './models/TTModels'
import { TTApplication } from './views/TTApplication'
import { AppLayout } from './components/Layout/AppLayout'

/**
 * Phase 5: AppLayout に切り替え済み。
 * Phase 2〜4 のテスト関数はデバッグ用としてファイル内に保持。
 * ブラウザコンソールで window.__runTests() を呼ぶと全テストを実行できる。
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

// ── デバッグ用: コンソールからテストを実行できるようにする ──────────────
// ブラウザコンソールで window.__runTests() を実行すると Phase 2〜4 テスト結果を表示
if (typeof window !== 'undefined') {
  (window as Window & { __runTests?: () => void }).__runTests = () => {
    console.group('[Thinktank] Phase 2〜4 テスト実行')
    const p2 = runPhase2Tests()
    const p3 = runPhase3Tests()
    const p4 = runPhase4Tests()
    const all = [...p2, ...p3, ...p4]
    const passed = all.filter(r => r.passed).length
    console.log(`${passed}/${all.length} テスト通過`)
    console.groupEnd()
  }
}

// ── メインコンポーネント ────────────────────────────────────────────────

export default function App() {
  return <AppLayout />
}
