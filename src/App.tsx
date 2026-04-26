/**
 * App.tsx
 * Phase 7: AppLayout を描画。起動時にダミーデータを投入する。
 * ※ seedDummyData はモジュールロード時に同期実行して初回レンダー前にデータを確保する。
 */

import { useEffect } from 'react'
import { AppLayout } from './components/Layout/AppLayout'
import { TTModels } from './models/TTModels'
import { TTApplication } from './views/TTApplication'
import { TTThink } from './models/TTThink'

// ── ダミーデータ投入（Phase 7 UI 確認用）────────────────────────────

function seedDummyData() {
  const vault = TTModels.Instance.Vault
  if (vault.Count > 0) return  // 既に投入済み（HMR 再実行ガード）

  // ── Thought データ ────────────────────────────────────────────
  const thoughts: Array<{ title: string; keywords?: string }> = [
    { title: 'プロジェクト全体計画',    keywords: 'project plan' },
    { title: '競合分析レポート',        keywords: '競合 analysis' },
    { title: 'UI設計方針まとめ',        keywords: 'UI design' },
    { title: 'データモデル検討メモ',    keywords: 'data model' },
    { title: 'チームミーティング議事録', keywords: 'meeting' },
    { title: 'リリース要件一覧',        keywords: 'release requirements UI' },
    { title: 'バグ一覧 2026-04',       keywords: 'bug' },
    { title: 'ロードマップ草案',        keywords: 'roadmap' },
    { title: '技術選定メモ',           keywords: 'tech stack' },
    { title: 'ユーザーヒアリング整理',  keywords: 'user research' },
  ]
  thoughts.forEach(({ title, keywords }) => {
    const t = new TTThink()
    t.ContentType = 'thought'
    t.Content = `# ${title}\n> ${keywords ?? ''}`
    t.Keywords = keywords ?? ''
    vault.AddThink(t)
  })

  // ── Memo データ（WorkoutPanel 表示用）──────────────────────────
  const memos = [
    { title: 'アーキテクチャ概要', content: '# アーキテクチャ概要\nLocalApp First 方針で実装。' },
    { title: 'スプリント計画',     content: '# スプリント計画\nPhase 7-10 を優先する。' },
    { title: '課題リスト',         content: '# 課題リスト\n- Phase 8 メディア実装\n- Phase 11 WPF Shell' },
  ]
  memos.forEach(({ content }) => {
    const t = new TTThink()
    t.ContentType = 'memo'
    t.Content = content
    vault.AddThink(t)
  })

  // ── WorkoutArea 初期表示（BSP ツリー: 3エリアを右・下に追加）────
  const app = TTApplication.Instance
  const allMemos = vault.GetThinks().filter(t => t.ContentType === 'memo')
  if (allMemos.length >= 1) app.WorkoutPanel.AddFirst(allMemos[0].ID, 'texteditor', allMemos[0].Name)
  if (allMemos.length >= 2) app.WorkoutPanel.AddRight(allMemos[1].ID, 'markdown',   allMemos[1].Name)
  if (allMemos.length >= 3) app.WorkoutPanel.AddBelow(allMemos[2].ID, 'texteditor', allMemos[2].Name)
}

// モジュールロード時に同期実行 → 初回レンダー前にデータ確定
seedDummyData()

// ── App ──────────────────────────────────────────────────────────────

export default function App() {
  useEffect(() => {
    // デバッグ用リセット関数をグローバルに公開
    window.__runTests = () => {
      TTModels.resetInstance()
      TTApplication.resetInstance()
      console.log('[Thinktank] reset. Reload to re-init.')
    }
  }, [])

  return <AppLayout />
}
