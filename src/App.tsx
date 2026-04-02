import { useEffect, useState } from 'react'
import { TTObject } from './models/TTObject'
import { TTCollection } from './models/TTCollection'

function App() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    const messages: string[] = []
    const addLog = (msg: string) => {
      messages.push(msg)
      setLog([...messages])
    }

    // === TTObject 検証 ===
    const obj = new TTObject()
    addLog(`[TTObject] Created: ID="${obj.ID}", Name="${obj.Name}"`)
    addLog(`[TTObject] ClassName="${obj.ClassName}", UpdateDate="${obj.UpdateDate}"`)

    // Observer 検証
    obj.AddOnUpdate('test-listener', () => {
      addLog(`[TTObject] Observer fired: UpdateDate="${obj.UpdateDate}"`)
    })
    obj.Name = 'TestObject'
    obj.NotifyUpdated()

    obj.RemoveOnUpdate('test-listener')
    obj.NotifyUpdated() // リスナー解除後は発火しない
    addLog(`[TTObject] Listener removed - no fire expected above`)

    // getNowString 検証
    addLog(`[TTObject] getNowString="${TTObject.getNowString()}"`)

    // === TTCollection 検証 ===
    const collection = new TTCollection()
    collection.ID = 'TestMemos'
    collection.Name = 'TestMemos'
    collection.ItemSaveProperties = 'ID,Name,UpdateDate'
    collection.IsLoaded = true
    addLog(`\n[TTCollection] Created: ID="${collection.ID}"`)

    // Observer on collection
    collection.AddOnUpdate('collection-listener', () => {
      addLog(`[TTCollection] Observer fired: Count=${collection.Count}`)
    })

    // AddItem
    const item1 = new TTObject()
    item1.ID = '2026-04-02-120000'
    item1.Name = 'テストメモ1'
    collection.AddItem(item1)

    const item2 = new TTObject()
    item2.ID = '2026-04-02-130000'
    item2.Name = 'テストメモ2'
    collection.AddItem(item2)

    // GetItem
    const found = collection.GetItem('2026-04-02-120000')
    addLog(`[TTCollection] GetItem: "${found?.Name}"`)

    // GetItems
    addLog(`[TTCollection] GetItems: ${collection.GetItems().map(i => i.Name).join(', ')}`)

    // FindItems
    const filtered = collection.FindItems(i => i.Name.includes('メモ2'))
    addLog(`[TTCollection] FindItems("メモ2"): ${filtered.map(i => i.Name).join(', ')}`)

    // CSV シリアライズ
    const csv = collection.ToCsvString()
    addLog(`\n[TTCollection] ToCsvString:\n${csv}`)

    // CSV デシリアライズ
    const collection2 = new TTCollection()
    collection2.ID = 'Restored'
    collection2.ItemSaveProperties = 'ID,Name,UpdateDate'
    collection2.FromCsvString(csv)
    addLog(`[TTCollection] FromCsvString: ${collection2.Count} items restored`)
    collection2.GetItems().forEach(item => {
      addLog(`  - ID="${item.ID}", Name="${item.Name}"`)
    })

    // DeleteItem
    collection.DeleteItem('2026-04-02-120000')
    addLog(`\n[TTCollection] After delete: Count=${collection.Count}`)

    // 親への通知伝播
    const parentCollection = new TTCollection()
    parentCollection.ID = 'Parent'
    parentCollection.IsLoaded = true
    parentCollection.AddOnUpdate('parent-listener', () => {
      addLog(`[Parent] Notified by child propagation`)
    })
    const child = new TTObject()
    child.ID = 'child-1'
    child._parent = parentCollection
    child.NotifyUpdated()

    addLog(`\n✅ Phase 2 検証完了`)
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
      <h2 style={{ color: '#61dafb', marginBottom: '16px' }}>Thinktank - Phase 2 検証</h2>
      {log.map((line, i) => (
        <div key={i} style={{
          whiteSpace: 'pre-wrap',
          color: line.startsWith('✅') ? '#4caf50'
            : line.startsWith('[TTCollection] Observer') ? '#ff9800'
            : line.startsWith('[Parent]') ? '#e91e63'
            : '#e0e0e0'
        }}>
          {line}
        </div>
      ))}
    </div>
  )
}

export default App
