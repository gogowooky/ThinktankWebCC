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
import './ToDoArea.css';

interface Props {
  app: TTApplication;
}

export function ToDoArea({ app }: Props) {
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

      {/* ── チャット ─────────────────────────────────────────── */}
      <div className="todo-area__chat">
        <ToDoChat panel={panel} />
      </div>

    </div>
  );
}
