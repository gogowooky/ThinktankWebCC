/**
 * AiChatView.tsx
 * ThinktankPanel / OverviewPanel 共通 AI チャットビュー。
 *
 * - 下部に固定の入力エリア（Claude Code スタイル）
 * - 上部にスクロール可能な会話ログ（CLI 風）
 * - Enter 送信後は入力欄を自動クリア
 * - forwardRef でスクロールメソッドを公開（MonitorUp/Down ボタン用）
 */

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { ChatMessage } from '../../types';
import './AiChatView.css';

export interface AiChatViewRef {
  scrollToPrevUser: () => void;
  scrollToNextUser: () => void;
  focus:            () => void;
}

interface Props {
  messages:  ChatMessage[];
  isWaiting: boolean;
  onSend:    (text: string) => void;
}

const PLACEHOLDER = 'メッセージを入力…\n(Enter=送信 / Shift+Enter=改行)';

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function resetHeight(ta: HTMLTextAreaElement) {
  ta.style.height = 'auto';
  const sh = ta.scrollHeight;
  ta.style.height    = sh >= 120 ? '120px' : `${sh}px`;
  ta.style.overflowY = sh >= 120 ? 'auto' : 'hidden';
}

function topInContainer(el: HTMLElement, container: HTMLElement): number {
  const elRect  = el.getBoundingClientRect();
  const cRect   = container.getBoundingClientRect();
  return elRect.top - cRect.top + container.scrollTop;
}

export const AiChatView = forwardRef<AiChatViewRef, Props>(function AiChatView(
  { messages, isWaiting, onSend },
  ref,
) {
  const [input, setInput] = useState('');
  const logRef            = useRef<HTMLDivElement>(null);
  const textareaRef       = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToPrevUser: () => {
      const log = logRef.current;
      if (!log) return;
      const blocks = Array.from(
        log.querySelectorAll<HTMLElement>('.ai-chat-view__user-block'),
      );
      const current = log.scrollTop;
      for (let i = blocks.length - 1; i >= 0; i--) {
        const top = topInContainer(blocks[i], log);
        if (top < current - 5) {
          log.scrollTo({ top, behavior: 'smooth' });
          return;
        }
      }
      log.scrollTo({ top: 0, behavior: 'smooth' });
    },
    scrollToNextUser: () => {
      const log = logRef.current;
      if (!log) return;
      const blocks = Array.from(
        log.querySelectorAll<HTMLElement>('.ai-chat-view__user-block'),
      );
      const current = log.scrollTop;
      for (const el of blocks) {
        const top = topInContainer(el, log);
        if (top > current + 5) {
          log.scrollTo({ top, behavior: 'smooth' });
          return;
        }
      }
    },
    focus: () => { textareaRef.current?.focus(); },
  }), []);

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
    if (ta) {
      ta.style.height    = 'auto';
      ta.style.overflowY = 'hidden';
    }
  }, [input, isWaiting, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resetHeight(e.target);
  };

  return (
    <div className="ai-chat-view">

      {/* ── 会話ログ ─────────────────────────────────────────────── */}
      <div className="ai-chat-view__log" ref={logRef}>

        {messages.length === 0 && !isWaiting && (
          <div className="ai-chat-view__empty">
            メッセージを入力して相談を開始してください
          </div>
        )}

        {messages.map((msg, index) => {
          const isLastStreaming = isWaiting && index === messages.length - 1 && msg.role === 'assistant';
          return (
            <div key={msg.id} className="ai-chat-view__entry">
              {msg.role === 'user' ? (
                <div className="ai-chat-view__user-block">
                  <span className="ai-chat-view__prompt">{'>'}</span>
                  <span className="ai-chat-view__user-text">{msg.content}</span>
                  {msg.timestamp && (
                    <span className="ai-chat-view__ts">{formatTime(msg.timestamp)}</span>
                  )}
                </div>
              ) : (
                <div className="ai-chat-view__ai-block">
                  {msg.content === '' && isLastStreaming ? (
                    <div className="ai-chat-view__ai-line">
                      <span className="ai-chat-view__ai-prefix">AI▸</span>
                      <span className="ai-chat-view__cursor">▋</span>
                    </div>
                  ) : (
                    msg.content.split('\n').map((line, li, arr) => (
                      <div key={li} className="ai-chat-view__ai-line">
                        <span className="ai-chat-view__ai-prefix">{li === 0 ? 'AI▸' : '   '}</span>
                        <span className="ai-chat-view__ai-text">
                          {line || ' '}
                          {isLastStreaming && li === arr.length - 1 && (
                            <span className="ai-chat-view__cursor">▋</span>
                          )}
                        </span>
                        {li === 0 && msg.timestamp && (
                          <span className="ai-chat-view__ts">{formatTime(msg.timestamp)}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* ── 入力エリア（下部固定）────────────────────────────────── */}
      <div className="ai-chat-view__input-area">
        <textarea
          ref={textareaRef}
          className="ai-chat-view__input"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDER}
          disabled={isWaiting}
          rows={2}
        />
      </div>

    </div>
  );
});
