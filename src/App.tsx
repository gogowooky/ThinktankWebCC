/**
 * App.tsx
 * Phase 6: AppLayout を描画。起動時にダミー Thought データを投入する。
 */

import { useEffect } from 'react'
import { AppLayout } from './components/Layout/AppLayout'
import { TTModels } from './models/TTModels'
import { TTApplication } from './views/TTApplication'
import { TTThink } from './models/TTThink'

// ── ダミーデータ投入（Phase 6 UI 確認用）────────────────────────────

function seedDummyData() {
  const vault = TTModels.Instance.Vault
  if (vault.Count > 0) return  // 既に投入済み

  const items: Array<{ title: string; keywords?: string }> = [
    { title: 'プロジェクト全体計画',    keywords: 'project plan' },
    { title: '競合分析レポート',        keywords: '競合 analysis' },
    { title: 'UI設計方針まとめ',        keywords: 'UI design' },
    { title: 'データモデル検討メモ',    keywords: 'data model' },
    { title: 'チームミーティング議事録', keywords: 'meeting' },
    { title: 'リリース要件一覧',        keywords: 'release requirements' },
    { title: 'バグ一覧 2026-04',       keywords: 'bug' },
    { title: 'ロードマップ草案',        keywords: 'roadmap' },
    { title: '技術選定メモ',           keywords: 'tech stack' },
    { title: 'ユーザーヒアリング整理',  keywords: 'user research' },
  ]

  items.forEach(({ title, keywords }) => {
    const t = new TTThink()
    t.ContentType = 'thought'
    t.Content = `# ${title}\n> ${keywords ?? ''}`
    t.Keywords = keywords ?? ''
    vault.AddThink(t)
  })
}

// ── App ──────────────────────────────────────────────────────────────

export default function App() {
  useEffect(() => {
    seedDummyData()
    window.__runTests = () => {
      TTModels.resetInstance()
      TTApplication.resetInstance()
      console.log('[Thinktank] reset. Reload to re-init.')
    }
  }, [])

  return <AppLayout />
}
