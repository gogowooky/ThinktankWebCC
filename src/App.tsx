import { useEffect, useState } from 'react'
import { TTModels } from './models/TTModels'
import { TTDataItem } from './models/TTDataItem'

function App() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    const messages: string[] = []
    const addLog = (msg: string) => {
      messages.push(msg)
      setLog([...messages])
    }

    // === TTModels シングルトン検証 ===
    const models = TTModels.Instance
    addLog(`[TTModels] ID="${models.ID}", Name="${models.Name}"`)
    addLog(`[TTModels] Collections: ${models.GetItems().map(i => i.ID).join(', ')}`)

    // === TTStatus 検証 ===
    models.Status.RegisterState('App.Theme', 'テーマ設定', 'dark')
    models.Status.RegisterState('App.FontSize', 'フォントサイズ', '14')
    addLog(`\n[TTStatus] Registered: App.Theme="${models.Status.GetValue('App.Theme')}"`)
    addLog(`[TTStatus] Registered: App.FontSize="${models.Status.GetValue('App.FontSize')}"`)

    models.Status.SetValue('App.Theme', 'light')
    addLog(`[TTStatus] SetValue: App.Theme="${models.Status.GetValue('App.Theme')}"`)

    // [Columns]ワイルドカード検証
    models.Status.RegisterState('Column[Columns].Filter', '列フィルタ', '')
    addLog(`[TTStatus] Column wildcard: ${['Column0.Filter', 'Column1.Filter', 'Column2.Filter']
      .map(id => `${id}="${models.Status.GetValue(id)}"`).join(', ')}`)

    // === TTDataItem 検証 ===
    addLog(`\n[TTDataItem] Creating items...`)
    const memo1 = new TTDataItem()
    memo1.Content = '# 朝の振り返り\n今日の予定を確認する'
    addLog(`[TTDataItem] memo1: ID="${memo1.ID}", Name="${memo1.Name}", ContentType="${memo1.ContentType}"`)
    addLog(`[TTDataItem] memo1.Content first line: "${memo1.Content.split('\\n')[0]}"`)

    const memo2 = new TTDataItem()
    memo2.Content = '買い物リスト\n- 牛乳\n- パン'
    memo2.Keywords = '買い物,生活'
    addLog(`[TTDataItem] memo2: Name="${memo2.Name}", Keywords="${memo2.Keywords}"`)

    // IsDirty 検証
    addLog(`[TTDataItem] memo1.IsDirty=${memo1.IsDirty}`)
    memo1.markSaved()
    addLog(`[TTDataItem] After markSaved: memo1.IsDirty=${memo1.IsDirty}`)
    memo1.Content = '# 朝の振り返り（修正）\n今日の予定を再確認'
    addLog(`[TTDataItem] After edit: memo1.IsDirty=${memo1.IsDirty}`)

    // === Memos コレクション検証 ===
    addLog(`\n[Memos] Adding items to collection...`)
    models.Memos.AddItem(memo1)
    models.Memos.AddItem(memo2)
    addLog(`[Memos] Count=${models.Memos.Count}`)
    addLog(`[Memos] Items: ${models.Memos.GetDataItems().map(i => i.Name).join(', ')}`)

    // GetDataItem 型付き取得
    const found = models.Memos.GetDataItem(memo1.ID)
    addLog(`[Memos] GetDataItem: "${found?.Name}", Content length=${found?.Content.length}`)

    // CSV シリアライズ検証
    const csv = models.Memos.ToCsvString()
    addLog(`\n[Memos] CSV:\n${csv}`)

    // === TTActions 検証 ===
    addLog(`[TTActions] Count=${models.Actions.Count}`)

    // === TTEvents 検証 ===
    addLog(`[TTEvents] Count=${models.Events.Count}`)

    // === シングルトン同一性検証 ===
    const models2 = TTModels.Instance
    addLog(`\n[Singleton] Same instance: ${models === models2}`)

    addLog(`\n✅ Phase 3 検証完了`)
  }, [])

  return (
    <div style={{
      padding: '20px',
      height: '100vh',
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#e0e0e0',
      backgroundColor: '#1e1e1e',
      overflow: 'auto'
    }}>
      <h2 style={{ color: '#61dafb', marginBottom: '16px' }}>Thinktank - Phase 3 検証</h2>
      {log.map((line, i) => (
        <div key={i} style={{
          whiteSpace: 'pre-wrap',
          color: line.startsWith('✅') ? '#4caf50'
            : line.startsWith('[TTModels]') ? '#64b5f6'
            : line.startsWith('[TTStatus]') ? '#ff9800'
            : line.startsWith('[TTDataItem]') ? '#ce93d8'
            : line.startsWith('[Memos]') ? '#81c784'
            : line.startsWith('[Singleton]') ? '#ffeb3b'
            : '#e0e0e0'
        }}>
          {line}
        </div>
      ))}
    </div>
  )
}

export default App
