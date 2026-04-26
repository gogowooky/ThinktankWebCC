/**
 * ToDoChat.tsx
 * Phase 10: ToDoPanel の AI チャット UI。
 *
 * - ChatMedia と同じ CLI ターミナル風スタイル
 * - メッセージ履歴は TTToDoPanel の ChatMessages（ビューモデル管理）
 * - 送信: panel.AddUserMessage() → モック応答（Phase 14 で AI API に置き換え）
 * - Enter 送信 / Shift+Enter 改行
 */

import { useRef, useState, useEffect } from 'react';
import type { TTToDoPanel } from '../../views/TTToDoPanel';
import './ToDoChat.css';

// ── モックレスポンス（Phase 14 で AI API に置き換え）──────────────────

const MOCK_RESPONSES = [
  'ご質問を承りました。\nPhase 14 で AI バックエンド接続後に実際の応答が届きます。',
  'その点について考察します。\n[AI 接続待機中 — Phase 14]',
  '興味深い視点です。\nSSE ストリーミングで逐次応答する予定です。',
];
let _mockIdx = 0;
function nextMock(): string {
  return MOCK_RESPONSES[_mockIdx++ % MOCK_RESPONSES.length];
}

// ── タイムスタンプ ────────────────────────────────────────────────────

function formatTime(iso: string): string {
  if (!iso) return '';
  const d  = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// ── コンポーネント ────────────────────────────────────────────────────

interface Props {
  panel: TTToDoPanel;
}

export function ToDoChat({ panel }: Props) {
  const [input,     setInput]     = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);

  // メッセージ更新時に最下部へスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [panel.ChatMessages, isWaiting]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isWaiting) return;

    panel.AddUserMessage(text);
    setInput('');
    setIsWaiting(true);

    // Phase 14 でここを AI API 呼び出しに置き換える
    setTimeout(() => {
      panel.AddAssistantMessage(nextMock());
      setIsWaiting(false);
    }, 900);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="todo-chat">

      {/* ログ出力エリア */}
      <div className="todo-chat__log">

        {/* 起動バナー */}
        <div className="todo-chat__banner">
          <span className="todo-chat__banner-line">Thinktank AI  [Phase 14 pending]</span>
          <span className="todo-chat__banner-line todo-chat__dim">
            Thought / Think のコンテキストで AI と相談できます。
          </span>
          <span className="todo-chat__banner-sep">{'─'.repeat(44)}</span>
        </div>

        {/* メッセージ履歴 */}
        {panel.ChatMessages.map(msg => (
          <div key={msg.id} className="todo-chat__entry">
            {msg.role === 'user' ? (
              <div className="todo-chat__user-line">
                <span className="todo-chat__prompt">{'>'}</span>
                <span className="todo-chat__user-text">{msg.content}</span>
                {msg.timestamp && (
                  <span className="todo-chat__ts">{formatTime(msg.timestamp)}</span>
                )}
              </div>
            ) : (
              <div className="todo-chat__ai-block">
                {msg.content.split('\n').map((line, li) => (
                  <div key={li} className="todo-chat__ai-line">
                    <span className="todo-chat__ai-prefix">{li === 0 ? 'AI▸' : '   '}</span>
                    <span className="todo-chat__ai-text">{line}</span>
                    {li === 0 && msg.timestamp && (
                      <span className="todo-chat__ts">{formatTime(msg.timestamp)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 待機中カーソル */}
        {isWaiting && (
          <div className="todo-chat__ai-block">
            <div className="todo-chat__ai-line">
              <span className="todo-chat__ai-prefix">AI▸</span>
              <span className="todo-chat__cursor">▋</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 入力ライン */}
      <div className="todo-chat__input-row">
        <span className="todo-chat__input-prompt">{'>'}</span>
        <textarea
          ref={inputRef}
          className="todo-chat__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="コマンドを入力…　(Enter=送信 / Shift+Enter=改行)"
          rows={1}
          disabled={isWaiting}
        />
      </div>

    </div>
  );
}
