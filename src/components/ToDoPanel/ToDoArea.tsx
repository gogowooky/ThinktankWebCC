/**
 * ToDoArea.tsx
 * Phase 10: ToDoPanel のメインエリア。
 *
 * - 上部コンテキストバー: 連携中 Thought / Think 名を表示
 * - 下部: ToDoChat（AI との CLI ターミナル風チャット）
 */

import { BookOpen, FileText } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { ToDoChat } from './ToDoChat';
import { ToDoMenuRibbon } from './ToDoMenuRibbon';
import type { ToDoViewMode } from './ToDoRibbon';
import '../../components/Layout/MenuRibbon.css';
import './ToDoArea.css';

const TODO_MODE_NAMES: Record<ToDoViewMode, string> = {
  chat:     'AI相談',
  settings: '設定',
};

interface Props {
  app:      TTApplication;
  viewMode: ToDoViewMode;
}

export function ToDoArea({ app, viewMode }: Props) {
  const panel = app.ToDoPanel;
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
    <div className="todo-area">

      {/* ── タイトル行 ────────────────────────────────────────── */}
      <div className="panel-title-row todo-area__title-row">
        ToDo&gt;{TODO_MODE_NAMES[viewMode]}
      </div>

      {/* ── メニューリボン ─────────────────────────────────────── */}
      <ToDoMenuRibbon />

      {/* ── コンテキストバー ─────────────────────────────────── */}
      <div className={`todo-area__context${hasContext ? '' : ' todo-area__context--empty'}`}>
        {thoughtName ? (
          <>
            <BookOpen size={11} className="todo-area__context-icon" />
            <span className="todo-area__context-label" title={thoughtName}>
              {thoughtName}
            </span>
          </>
        ) : thinkName ? (
          <>
            <FileText size={11} className="todo-area__context-icon" />
            <span className="todo-area__context-label" title={thinkName}>
              {thinkName}
            </span>
          </>
        ) : (
          <span className="todo-area__context-none">コンテキスト未設定</span>
        )}
      </div>

      {/* ── コンテンツ ───────────────────────────────────────── */}
      <div className="todo-area__chat">
        {viewMode === 'settings' ? (
          <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
            ToDo設定は今後追加予定です。
          </div>
        ) : (
          <ToDoChat panel={panel} />
        )}
      </div>

    </div>
  );
}
