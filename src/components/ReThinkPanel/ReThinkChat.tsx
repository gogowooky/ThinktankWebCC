/**
 * ReThinkChat.tsx
 * Phase 14: ReThinkPanel の AI チャット UI。
 * Anthropic SSE ストリーミング対応。
 * - 入力欄は下部固定（Claude Code スタイル）
 * - 送信後は入力欄をクリア
 * - ユーザーメッセージは緑系背景で識別
 */

import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { TTReThinkPanel } from '../../views/TTReThinkPanel';
import { streamChat } from '../../services/ChatApiService';
import { AI_MODEL_OPTIONS, PROVIDER_LABELS, parseSelectionValue, selectionToValue } from '../../services/aiModels';
import type { AiProvider } from '../../services/aiModels';
import './ReThinkChat.css';

const PROVIDER_ORDER: AiProvider[] = ['anthropic', 'openai', 'gemini'];

export interface ReThinkChatRef {
  abortStreaming: () => void;
  focus:          () => void;
}

const PLACEHOLDER = 'メッセージを入力…\n(Enter=送信 / Shift+Enter=改行)';

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function resetHeight(ta: HTMLTextAreaElement) {
  ta.style.height = 'auto';
  const sh = ta.scrollHeight;
  ta.style.height    = sh >= 120 ? '120px' : `${sh}px`;
  ta.style.overflowY = sh >= 120 ? 'auto' : 'hidden';
}

interface Props {
  panel:        TTReThinkPanel;
  systemPrompt: string;
}

export const ReThinkChat = forwardRef<ReThinkChatRef, Props>(function ReThinkChat(
  { panel, systemPrompt },
  ref,
) {
  const [input,     setInput]     = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [isInputAreaFocused, setIsInputAreaFocused] = useState(false);
  const logRef                    = useRef<HTMLDivElement>(null);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const abortRef                  = useRef<AbortController | null>(null);
  const accumulatedRef            = useRef('');

  const handleInputAreaFocus = useCallback(() => setIsInputAreaFocused(true), []);
  const handleInputAreaBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsInputAreaFocused(false);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    abortStreaming: () => {
      abortRef.current?.abort();
      setIsWaiting(false);
      panel.SetStreaming(false);
    },
    focus: () => { textareaRef.current?.focus(); },
  }), []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [panel.ChatMessages, isWaiting]);

  // アンマウント時にストリームを中断
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isWaiting) return;

    panel.AddUserMessage(text);
    setInput('');
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height    = 'auto';
      ta.style.overflowY = 'hidden';
    }
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
      { provider: panel.AIChatProvider, model: panel.AIChatModel },
    );
  }, [input, isWaiting, panel, systemPrompt]);

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
    <div className="rethink-chat">

      {/* ── ログ出力エリア ───────────────────────────────── */}
      <div className="rethink-chat__log" ref={logRef}>

        {panel.ChatMessages.length === 0 && !isWaiting && (
          <div className="rethink-chat__empty">
            メッセージを入力して相談を開始してください
          </div>
        )}

        {panel.ChatMessages.map((msg, index) => {
          const isLastStreaming = isWaiting && index === panel.ChatMessages.length - 1 && msg.role === 'assistant';
          return (
            <div key={msg.id} className="rethink-chat__entry">
              {msg.role === 'user' ? (
                <div className="rethink-chat__user-block">
                  <span className="rethink-chat__prompt">{'>'}</span>
                  <span className="rethink-chat__user-text">{msg.content}</span>
                  {msg.timestamp && (
                    <span className="rethink-chat__ts">{formatTime(msg.timestamp)}</span>
                  )}
                </div>
              ) : (
                <div className="rethink-chat__ai-block">
                  {msg.content === '' && isLastStreaming ? (
                    <div className="rethink-chat__ai-line">
                      <span className="rethink-chat__ai-prefix">Antigravity▸</span>
                      <span className="rethink-chat__cursor">▋</span>
                    </div>
                  ) : (
                    msg.content.split('\n').map((line, li, arr) => (
                      <div key={li} className="rethink-chat__ai-line">
                        <span className="rethink-chat__ai-prefix">{li === 0 ? 'Antigravity▸' : '             '}</span>
                        <span className="rethink-chat__ai-text">
                          {line || ' '}
                          {isLastStreaming && li === arr.length - 1 && (
                            <span className="rethink-chat__cursor">▋</span>
                          )}
                        </span>
                        {li === 0 && msg.timestamp && !isWaiting && (
                          <span className="rethink-chat__ts">{formatTime(msg.timestamp)}</span>
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

      {/* ── 入力エリア（下部固定）────────────────────────────── */}
      <div
        className="rethink-chat__input-area"
        onFocus={handleInputAreaFocus}
        onBlur={handleInputAreaBlur}
      >
        <div className="rethink-chat__input-row">
          <textarea
            ref={textareaRef}
            className="rethink-chat__input"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER}
            disabled={isWaiting}
            rows={2}
          />
        </div>

        <div className={`rethink-chat__model-row${isInputAreaFocused ? ' rethink-chat__model-row--visible' : ''}`}>
          <select
            className="rethink-chat__model-select"
            value={selectionToValue({ provider: panel.AIChatProvider, model: panel.AIChatModel })}
            onChange={(e) => {
              const parsed = parseSelectionValue(e.target.value);
              if (parsed) panel.SetAIChatModel(parsed);
            }}
            tabIndex={isInputAreaFocused ? 0 : -1}
            aria-label="AI Chat モデル選択"
          >
            {PROVIDER_ORDER.map(p => (
              <optgroup key={p} label={PROVIDER_LABELS[p]}>
                {AI_MODEL_OPTIONS.filter(o => o.provider === p).map(o => (
                  <option key={selectionToValue(o)} value={selectionToValue(o)}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

    </div>
  );
});
