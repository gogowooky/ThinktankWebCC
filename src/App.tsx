import { useEffect } from 'react'
import { TTApplication } from './views/TTApplication'
import { TTModels } from './models/TTModels'
import { TTDataItem } from './models/TTDataItem'
import { storageManager } from './services/storage/StorageManager'
import { syncManager } from './services/sync/SyncManager'
import { AppLayout } from './components/Layout/AppLayout'

/** テストデータ（StorageManagerからデータが取得できない場合のフォールバック） */
function loadTestData(memos: typeof TTModels.Instance.Memos) {
  const testData = [
    { id: '2026-04-02-090000', name: '朝のメモ - 今日のタスク整理', type: 'memo' as const, content: '# 今日のタスク整理\n\n- プロジェクト進捗確認\n- 設計レビュー\n- テスト実行\n\n## 優先度高\n買い物リストの確認' },
    { id: '2026-04-02-100000', name: '会議メモ - プロジェクト進捗', type: 'memo' as const, content: '# プロジェクト進捗会議\n\n参加者: 田中、鈴木、佐藤\n\n## 議題\n1. Phase 5完了報告\n2. Phase 6の方針\n3. スケジュール確認' },
    { id: '2026-04-02-110000', name: '技術調査 - React 19の新機能', type: 'url' as const, content: '# React 19 新機能メモ\n\n- Server Components\n- Actions\n- useOptimistic\n- use() hook' },
    { id: '2026-04-02-120000', name: 'ランチの写真', type: 'photo' as const, content: 'ランチの写真メモ' },
    { id: '2026-04-02-130000', name: 'AIチャット - アーキテクチャ相談', type: 'chat' as const, content: '# アーキテクチャ相談\n\nThinktankの3列レイアウト設計について相談' },
    { id: '2026-04-02-140000', name: '午後のメモ - 設計検討', type: 'memo' as const, content: '# 設計検討\n\n## DataGridの仮想スクロール\nreact-windowを採用。\n\n## パネル間連携\nObserverパターンで実装。' },
    { id: '2026-04-02-150000', name: 'メール下書き - 報告書', type: 'email' as const, content: '件名: 週次報告\n\nお疲れ様です。\n今週の進捗を報告いたします。' },
    { id: '2026-04-02-160000', name: 'ファイル - 仕様書v2.docx', type: 'file' as const, content: '仕様書v2の参照メモ' },
    { id: '2026-04-01-090000', name: '昨日のメモ - 週次振り返り', type: 'memo' as const, content: '# 週次振り返り\n\n## 良かった点\n- Phase 4まで順調に完了\n\n## 改善点\n- テストの自動化' },
    { id: '2026-04-01-140000', name: '昨日の会議 - チーム定例', type: 'memo' as const, content: '# チーム定例\n\n次回リリースに向けた確認事項' },
    { id: '2026-03-31-100000', name: '先週のメモ - 月末まとめ', type: 'memo' as const, content: '# 月末まとめ\n\n3月の活動記録と4月の計画' },
    { id: '2026-03-31-150000', name: 'Google Drive - 共有資料', type: 'drive' as const, content: '共有資料リンク集' },
  ]
  testData.forEach(d => {
    const item = new TTDataItem()
    item.ID = d.id
    item.ContentType = d.type
    item.Content = d.content
    item.UpdateDate = d.id
    memos.AddItem(item)

    // IndexedDBにも保存（/view/markdown 等で参照可能にする）
    storageManager.saveFile({
      file_id: d.id,
      title: d.name,
      file_type: d.type,
      category: 'memos',
      content: d.content,
      metadata: null,
      size_bytes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  })
}

function App() {
  useEffect(() => {
    const app = TTApplication.Instance
    app.Initialize()

    // StorageManager初期化 → データロード → SyncManager開始
    async function initStorage() {
      await storageManager.initialize()

      const memos = TTModels.Instance.Memos
      await memos.LoadCache()

      // データが取得できなかった場合はテストデータをフォールバック
      if (memos.Count === 0) {
        console.log('[App] No data from storage, loading test data')
        loadTestData(memos)
      }

      // SyncManager: WebSocket接続 + リモート更新受信
      syncManager.start((fileId: string) => {
        const item = memos.GetItem(fileId)
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
