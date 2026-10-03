/**
 * HarvestChat.tsx
 * Phase 14: HarvestPanel の AI チャット UI。
 * Anthropic SSE ストリーミング対応。
 * - 入力欄は下部固定（Claude Code スタイル）
 * - 送信後は入力欄をクリア
 * - ユーザーメッセージは緑系背景で識別
 */

import { useRef, useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { TTHarvestPanel } from '../../views/TTHarvestPanel';
import { streamChat } from '../../services/ChatApiService';
import { AI_MODEL_OPTIONS, PROVIDER_LABELS, aiSpeakerPrefix, parseSelectionValue, selectionToValue } from '../../services/aiModels';
import type { AiProvider } from '../../services/aiModels';
import { useAiProviderAvailability } from '../../hooks/useAiProviderAvailability';
import './HarvestChat.css';

const PROVIDER_ORDER: AiProvider[] = ['anthropic', 'openai', 'gemini'];

export interface HarvestChatRef {
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
  panel:        TTHarvestPanel;
  systemPrompt: string;
}

export const HarvestChat = forwardRef<HarvestChatRef, Props>(function HarvestChat(
  { panel, systemPrompt },
  ref,
) {
  const providerAvailability = useAiProviderAvailability();
  const [input,     setInput]     = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [isInputAreaFocused, setIsInputAreaFocused] = useState(false);

  const visibleProviders = useMemo(
    () => PROVIDER_ORDER.filter(
      p => AI_MODEL_OPTIONS.some(o => o.provider === p && providerAvailability[p]),
    ),
    [providerAvailability],
  );

  // 保存済みの選択が「今は使えないプロバイダ」なら先頭の利用可能モデルへ寄せる
  useEffect(() => {
    if (visibleProviders.length === 0) return;
    if (providerAvailability[panel.AIChatProvider]) return;
    const fallback = AI_MODEL_OPTIONS.find(o => o.provider === visibleProviders[0]);
    if (fallback) panel.SetAIChatModel({ provider: fallback.provider, model: fallback.model });
  }, [providerAvailability, visibleProviders, panel]);
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
    // AI発言はどのモデルの回答かが本文に残るよう「(モデル名)」の1行で始める
    const aiPrefix = aiSpeakerPrefix({ provider: panel.AIChatProvider, model: panel.AIChatModel });
    accumulatedRef.current = aiPrefix;

    const assistantId = panel.AddAssistantMessage(aiPrefix);
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
          panel.UpdateMessage(assistantId, `${aiPrefix}[エラー] ${message}`);
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
      void handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resetHeight(e.target);
  };

  return (
    <div className="harvest-chat">

      {/* ── ログ出力エリア ───────────────────────────────── */}
      <div className="harvest-chat__log" ref={logRef}>

        {panel.ChatMessages.length === 0 && !isWaiting && (
          <div className="harvest-chat__empty">
            メッセージを入力して相談を開始してください
          </div>
        )}

        {panel.ChatMessages.map((msg, index) => {
          const isLastStreaming = isWaiting && index === panel.ChatMessages.length - 1 && msg.role === 'assistant';
          return (
            <div key={msg.id} className="harvest-chat__entry">
              {msg.role === 'user' ? (
                <div className="harvest-chat__user-block">
                  <span className="harvest-chat__prompt">{'>'}</span>
                  <span className="harvest-chat__user-text">{msg.content}</span>
                  {msg.timestamp && (
                    <span className="harvest-chat__ts">{formatTime(msg.timestamp)}</span>
                  )}
                </div>
              ) : (
                <div className="harvest-chat__ai-block">
                  {/* 本文は改行ごとに分けず1つの pre-wrap 要素にまとめる。
                      モデル名は本文の先頭行「(モデル名)」として発言自体に含まれるので、
                      発言者名の別表示は持たない（aiSpeakerPrefix）。 */}
                  <div className="harvest-chat__ai-line">
                    <span className="harvest-chat__ai-text">
                      {/* 時刻は float。行として並べると本文の全行から幅を奪うため、
                          1行目だけを避けて流し込ませる */}
                      {msg.timestamp && !isWaiting && (
                        <span className="harvest-chat__ts">{formatTime(msg.timestamp)}</span>
                      )}
                      {msg.content}
                      {isLastStreaming && <span className="harvest-chat__cursor">▋</span>}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* ── 入力エリア（下部固定）────────────────────────────── */}
      <div
        className="harvest-chat__input-area"
        onFocus={handleInputAreaFocus}
        onBlur={handleInputAreaBlur}
      >
        <div className="harvest-chat__input-row">
          <textarea
            ref={textareaRef}
            className="harvest-chat__input"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER}
            disabled={isWaiting}
            rows={2}
            autoComplete="off"
          />
        </div>

        <div className={`harvest-chat__model-row${isInputAreaFocused ? ' harvest-chat__model-row--visible' : ''}`}>
          <select
            className="harvest-chat__model-select"
            value={selectionToValue({ provider: panel.AIChatProvider, model: panel.AIChatModel })}
            onChange={(e) => {
              const parsed = parseSelectionValue(e.target.value);
              if (parsed) panel.SetAIChatModel(parsed);
            }}
            tabIndex={isInputAreaFocused ? 0 : -1}
            aria-label="AI Chat モデル選択"
          >
            {visibleProviders.map(p => (
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
