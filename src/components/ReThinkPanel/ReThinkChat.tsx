/**
 * ReThinkChat.tsx
 * Phase 10: ReThinkPanel の AI チャット UI。
 *
 * - ChatMedia と同じ CLI ターミナル風スタイル
 * - メッセージ履歴は TTReThinkPanel の ChatMessages（ビューモデル管理）
 * - 送信: panel.AddUserMessage() → モック応答（Phase 14 で AI API に置き換え）
 * - Enter 送信 / Shift+Enter 改行
 */

import { useRef, useState, useEffect } from 'react';
import type { TTReThinkPanel } from '../../views/TTReThinkPanel';
import './ReThinkChat.css';

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
  panel: TTReThinkPanel;
}

export function ReThinkChat({ panel }: Props) {
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
    <div className="rethink-chat">

      {/* ログ出力エリア */}
      <div className="rethink-chat__log">

        {/* 起動バナー */}
        <div className="rethink-chat__banner">
          <span className="rethink-chat__banner-line">Thinktank AI  [Phase 14 pending]</span>
          <span className="rethink-chat__banner-line rethink-chat__dim">
            Thought / Think のコンテキストで AI と相談できます。
          </span>
          <span className="rethink-chat__banner-sep">{'─'.repeat(44)}</span>
        </div>

        {/* メッセージ履歴 */}
        {panel.ChatMessages.map(msg => (
          <div key={msg.id} className="rethink-chat__entry">
            {msg.role === 'user' ? (
              <div className="rethink-chat__user-line">
                <span className="rethink-chat__prompt">{'>'}</span>
                <span className="rethink-chat__user-text">{msg.content}</span>
                {msg.timestamp && (
                  <span className="rethink-chat__ts">{formatTime(msg.timestamp)}</span>
                )}
              </div>
            ) : (
              <div className="rethink-chat__ai-block">
                {msg.content.split('\n').map((line, li) => (
                  <div key={li} className="rethink-chat__ai-line">
                    <span className="rethink-chat__ai-prefix">{li === 0 ? 'AI▸' : '   '}</span>
                    <span className="rethink-chat__ai-text">{line}</span>
                    {li === 0 && msg.timestamp && (
                      <span className="rethink-chat__ts">{formatTime(msg.timestamp)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 待機中カーソル */}
        {isWaiting && (
          <div className="rethink-chat__ai-block">
            <div className="rethink-chat__ai-line">
              <span className="rethink-chat__ai-prefix">AI▸</span>
              <span className="rethink-chat__cursor">▋</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 入力ライン */}
      <div className="rethink-chat__input-row">
        <span className="rethink-chat__input-prompt">{'>'}</span>
        <textarea
          ref={inputRef}
          className="rethink-chat__input"
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
