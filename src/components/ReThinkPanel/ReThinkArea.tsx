/**
 * ReThinkArea.tsx
 * Phase 10: ReThinkPanel のメインエリア。
 *
 * - 上部コンテキストバー: 連携中 Thought / Think 名を表示
 * - 下部: ReThinkChat（AI との CLI ターミナル風チャット）
 */

import { BookOpen, FileText } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { ReThinkChat } from './ReThinkChat';
import { ReThinkMenuRibbon } from './ReThinkMenuRibbon';
import type { ReThinkViewMode } from './ReThinkRibbon';
import '../../components/Layout/MenuRibbon.css';
import './ReThinkArea.css';

const RETHINK_MODE_NAMES: Record<ReThinkViewMode, string> = {
  chat:     'AI相談',
  settings: '設定',
};

interface Props {
  app:      TTApplication;
  viewMode: ReThinkViewMode;
}

export function ReThinkArea({ app, viewMode }: Props) {
  const panel = app.ReThinkPanel;
  useAppUpdate(panel);

  const vault         = app.Models.Vault;
  const thoughtName   = panel.LinkedThoughtID
    ? (vault.GetThink(panel.LinkedThoughtID)?.Name ?? panel.LinkedThoughtID)
    : null;
  const thinkName     = panel.LinkedThinkID
    ? (vault.GetThink(panel.LinkedThinkID)?.Name ?? panel.LinkedThinkID)
    : null;

  const hasContext = !!thoughtName || !!thinkName;

  return (
    <div className="rethink-area">

      {/* ── タイトル行 ────────────────────────────────────────── */}
      <div className="panel-title-row rethink-area__title-row">
        ReThink&gt;{RETHINK_MODE_NAMES[viewMode]}
      </div>

      {/* ── メニューリボン ─────────────────────────────────────── */}
      <ReThinkMenuRibbon />

      {/* ── コンテキストバー ─────────────────────────────────── */}
      <div className={`rethink-area__context${hasContext ? '' : ' rethink-area__context--empty'}`}>
        {thoughtName ? (
          <>
            <BookOpen size={11} className="rethink-area__context-icon" />
            <span className="rethink-area__context-label" title={thoughtName}>
              {thoughtName}
            </span>
          </>
        ) : thinkName ? (
          <>
            <FileText size={11} className="rethink-area__context-icon" />
            <span className="rethink-area__context-label" title={thinkName}>
              {thinkName}
            </span>
          </>
        ) : (
          <span className="rethink-area__context-none">コンテキスト未設定</span>
        )}
      </div>

      {/* ── コンテンツ ───────────────────────────────────────── */}
      <div className="rethink-area__chat">
        {viewMode === 'settings' ? (
          <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
            ReThink設定は今後追加予定です。
          </div>
        ) : (
          <ReThinkChat panel={panel} />
        )}
      </div>

    </div>
  );
}
