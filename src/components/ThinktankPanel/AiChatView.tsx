/**
 * AiChatView.tsx
 * ThinktankPanel / OverviewPanel 共通 AI チャットビュー。
 *
 * - 最上位に可変サイズのテキストエリア（ユーザー入力）
 * - 下部にスクロール可能な会話ログ（CLI 風）
 * - Mac 風タイトルバーなし
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessage } from '../../types';
import './AiChatView.css';

interface Props {
  messages:         ChatMessage[];
  isWaiting:        boolean;
  onSend:           (text: string) => void;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function AiChatView({ messages, isWaiting, onSend }: Props) {
  const [input, setInput] = useState('');
  const logRef            = useRef<HTMLDivElement>(null);
  const textareaRef       = useRef<HTMLTextAreaElement>(null);

  // 新メッセージ到着時に最下部へスクロール
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isWaiting]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isWaiting) return;
    onSend(text);
    setInput('');
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; }
  }, [input, isWaiting, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  };

  return (
    <div className="ai-chat-view">

      {/* ── 入力エリア（最上位）────────────────────────────────────── */}
      <div className="ai-chat-view__input-area">
        <textarea
          ref={textareaRef}
          className="ai-chat-view__input"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力…　(Enter=送信 / Shift+Enter=改行)"
          rows={1}
          disabled={isWaiting}
        />
        <button
          className="ai-chat-view__send-btn"
          onClick={handleSend}
          disabled={isWaiting || !input.trim()}
          title="送信"
          aria-label="送信"
        >
          <Send size={13} />
        </button>
      </div>

      {/* ── 会話ログ ─────────────────────────────────────────────── */}
      <div className="ai-chat-view__log" ref={logRef}>

        {messages.length === 0 && !isWaiting && (
          <div className="ai-chat-view__empty">
            メッセージを入力して相談を開始してください
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className="ai-chat-view__entry">
            {msg.role === 'user' ? (
              <div className="ai-chat-view__user-line">
                <span className="ai-chat-view__prompt">{'>'}</span>
                <span className="ai-chat-view__user-text">{msg.content}</span>
                {msg.timestamp && (
                  <span className="ai-chat-view__ts">{formatTime(msg.timestamp)}</span>
                )}
              </div>
            ) : (
              <div className="ai-chat-view__ai-block">
                {msg.content.split('\n').map((line, li) => (
                  <div key={li} className="ai-chat-view__ai-line">
                    <span className="ai-chat-view__ai-prefix">{li === 0 ? 'AI▸' : '   '}</span>
                    <span className="ai-chat-view__ai-text">{line || ' '}</span>
                    {li === 0 && msg.timestamp && (
                      <span className="ai-chat-view__ts">{formatTime(msg.timestamp)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 待機中カーソル */}
        {isWaiting && (
          <div className="ai-chat-view__ai-block">
            <div className="ai-chat-view__ai-line">
              <span className="ai-chat-view__ai-prefix">AI▸</span>
              <span className="ai-chat-view__cursor">▋</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
