/**
 * ReThinkChat.tsx
 * Phase 14: ReThinkPanel の AI チャット UI。
 * Anthropic SSE ストリーミング対応。
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { TTReThinkPanel } from '../../views/TTReThinkPanel';
import { streamChat } from '../../services/ChatApiService';
import './ReThinkChat.css';

const HINT_TEXT = 'メッセージを入力…\n(Enter=送信 / Shift+Enter=改行)';

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function resizeToContent(ta: HTMLTextAreaElement) {
  ta.style.height = 'auto';
  const sh = ta.scrollHeight;
  if (sh >= 120) {
    ta.style.height = '120px';
    ta.style.overflowY = 'auto';
  } else {
    ta.style.height = `${sh}px`;
    ta.style.overflowY = 'hidden';
  }
}

interface Props {
  panel:        TTReThinkPanel;
  systemPrompt: string;
}

export function ReThinkChat({ panel, systemPrompt }: Props) {
  const [input,     setInput]     = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const logRef                    = useRef<HTMLDivElement>(null);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const abortRef                  = useRef<AbortController | null>(null);
  const accumulatedRef            = useRef('');

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [panel.ChatMessages, isWaiting]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.value = HINT_TEXT;
    resizeToContent(ta);
    ta.value = '';
    setInput('');
  }, []);

  // アンマウント時にストリームを中断
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isWaiting) return;

    panel.AddUserMessage(text);
    setIsWaiting(true);
    accumulatedRef.current = '';

    const assistantId = panel.AddAssistantMessage('');
    panel.SetStreaming(true);

    abortRef.current = new AbortController();

    // 末尾の空アシスタントメッセージを除いた履歴を送信
    const history = panel.ChatMessages.slice(0, -1).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }));

    await streamChat(
      history,
      systemPrompt,
      {
        onDelta: (delta) => {
          accumulatedRef.current += delta;
          panel.UpdateMessage(assistantId, accumulatedRef.current);
        },
        onDone: () => {
          panel.SetStreaming(false);
          setIsWaiting(false);
        },
        onError: (message) => {
          panel.UpdateMessage(assistantId, `[エラー] ${message}`);
          panel.SetStreaming(false);
          setIsWaiting(false);
        },
      },
      abortRef.current.signal,
    );
  }, [input, isWaiting, panel, systemPrompt]);

  const handleClear = useCallback(() => {
    setInput('');
    const ta = textareaRef.current;
    if (!ta) return;
    ta.value = HINT_TEXT;
    resizeToContent(ta);
    ta.value = '';
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeToContent(e.target);
  };

  const lastMsg = panel.ChatMessages[panel.ChatMessages.length - 1];

  return (
    <div className="rethink-chat">

      {/* ── 入力エリア（最上位）─────────────────────────────────── */}
      <div className="rethink-chat__input-area">
        <textarea
          ref={textareaRef}
          className="rethink-chat__input"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={HINT_TEXT}
          disabled={isWaiting}
        />
        <div className="rethink-chat__btn-stack">
          <button
            className="rethink-chat__clear-btn"
            onClick={handleClear}
            disabled={isWaiting}
            title="消去"
            aria-label="消去"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── ログ出力エリア ───────────────────────────────── */}
      <div className="rethink-chat__log" ref={logRef}>

        <div className="rethink-chat__banner">
          <span className="rethink-chat__banner-line">Thinktank AI</span>
          <span className="rethink-chat__banner-line rethink-chat__dim">
            Thought / Think のコンテキストで AI と相談できます。
          </span>
          <span className="rethink-chat__banner-sep">{'─'.repeat(44)}</span>
        </div>

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
                {(msg.content || ' ').split('\n').map((line, li) => (
                  <div key={li} className="rethink-chat__ai-line">
                    <span className="rethink-chat__ai-prefix">{li === 0 ? 'AI▸' : '   '}</span>
                    <span className="rethink-chat__ai-text">{line || ' '}</span>
                    {li === 0 && msg.timestamp && !isWaiting && (
                      <span className="rethink-chat__ts">{formatTime(msg.timestamp)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* ストリーム開始前の待機カーソル（空メッセージが最後にある間） */}
        {isWaiting && lastMsg?.role === 'assistant' && lastMsg.content === '' && (
          <div className="rethink-chat__ai-block">
            <div className="rethink-chat__ai-line">
              <span className="rethink-chat__ai-prefix">AI▸</span>
              <span className="rethink-chat__cursor">▋</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
