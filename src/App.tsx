import { useEffect } from 'react'
import { TTApplication } from './views/TTApplication'
import { TTModels } from './models/TTModels'
import { storageManager } from './services/storage/StorageManager'
import { syncManager } from './services/sync/SyncManager'
import { AppLayout } from './components/Layout/AppLayout'

function App() {
  useEffect(() => {
    const app = TTApplication.Instance
    app.Initialize()

    // StorageManager初期化 → データロード → SyncManager開始
    async function initStorage() {
      await storageManager.initialize()

      const models = TTModels.Instance
      // 各コレクションの初期化
      await Promise.all([
        models.Status.LoadCache(),
        models.Actions.LoadCache(),
        models.Events.LoadCache(),
        models.Knowledge.LoadCache(),
      ])
      await models.LoadCache()

      // SyncManager: WebSocket接続 + リモート更新受信
      syncManager.start((fileId: string) => {
        const item = models.Knowledge.GetItem(fileId)
        if (item && 'applyRemoteUpdate' in item) {
          return item as { applyRemoteUpdate: (content: string) => void }
        }
        return null
      })
    }

    initStorage()

    return () => {
      syncManager.stop()
    }
  }, [])

  return <AppLayout />
}

export default App
