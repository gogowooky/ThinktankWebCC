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
import { AI_MODEL_OPTIONS, DEFAULT_AI_MODEL_SELECTION, PROVIDER_LABELS, modelLabel, parseSelectionValue, selectionToValue } from '../../services/aiModels';
import type { AiModelSelection, AiProvider } from '../../services/aiModels';
import './AiChatView.css';

export interface AiChatViewRef {
  scrollToPrevUser: () => void;
  scrollToNextUser: () => void;
  focus:            () => void;
}

export interface AiModelSelectorProps {
  value:    AiModelSelection;
  onChange: (selection: AiModelSelection) => void;
}

interface Props {
  messages:  ChatMessage[];
  isWaiting: boolean;
  onSend:    (text: string) => void;
  /** ログの scrollTop 変化を通知する（Pane側での永続化用。省略可）*/
  onScroll?: (scrollTop: number) => void;
  /** 初回マウント時に復元する scrollTop。省略時は末尾へ自動スクロール */
  initialScrollTop?: number;
  /**
   * AIモデル選択ドロップダウンを表示する場合に指定する。
   * 省略時はドロップダウン自体を表示しない（例: WorkoutPane の Chat は
   * WorkoutSettingArea 側の選択をそのまま使うため、ここでは選ばせない）。
   * メッセージ入力欄がフォーカスされている間だけ下から現れる。
   */
  modelSelector?: AiModelSelectorProps;
  /**
   * 発言者名の表示に使うモデル。ドロップダウンを出さない場合（WorkoutPane の Chat）に指定する。
   * modelSelector がある場合はそちらの選択値を使うので不要。
   */
  aiModel?: AiModelSelection;
}

const PROVIDER_ORDER: AiProvider[] = ['anthropic', 'openai', 'gemini'];

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
  { messages, isWaiting, onSend, onScroll, initialScrollTop, modelSelector, aiModel },
  ref,
) {
  // 発言者名は選択中のAIモデル名
  const aiName = modelLabel(aiModel ?? modelSelector?.value ?? DEFAULT_AI_MODEL_SELECTION);

  const [input, setInput] = useState('');
  const [isInputAreaFocused, setIsInputAreaFocused] = useState(false);
  const logRef            = useRef<HTMLDivElement>(null);
  const textareaRef       = useRef<HTMLTextAreaElement>(null);
  const hasRestoredRef    = useRef(false);

  const handleInputAreaFocus = useCallback(() => setIsInputAreaFocused(true), []);
  const handleInputAreaBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsInputAreaFocused(false);
    }
  }, []);

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
    if (!el) return;
    if (!hasRestoredRef.current) {
      hasRestoredRef.current = true;
      if (typeof initialScrollTop === 'number') {
        el.scrollTop = initialScrollTop;
        return;
      }
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, isWaiting]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    onScroll?.(e.currentTarget.scrollTop);
  }, [onScroll]);

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
      <div className="ai-chat-view__log" ref={logRef} onScroll={handleLogScroll}>

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
                  {/* 本文は改行ごとに分けず1つの pre-wrap 要素にまとめ、AI名をその中の
                      先頭に置く（AI名は block なので直後で改行される）。本文の全行が
                      AI名と同じ左端に揃い、モデル名の長さが変わっても位置は動かない。 */}
                  <div className="ai-chat-view__ai-line">
                    <span className="ai-chat-view__ai-text">
                      {/* 時刻は float。行として並べると本文の全行から幅を奪うため、
                          1行目だけを避けて流し込ませる */}
                      {msg.timestamp && (
                        <span className="ai-chat-view__ts">{formatTime(msg.timestamp)}</span>
                      )}
                      <span className="ai-chat-view__ai-prefix">{aiName}▸</span>
                      {msg.content}
                      {isLastStreaming && <span className="ai-chat-view__cursor">▋</span>}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* ── 入力エリア（下部固定）────────────────────────────────── */}
      <div
        className="ai-chat-view__input-area"
        onFocus={handleInputAreaFocus}
        onBlur={handleInputAreaBlur}
      >
        <div className="ai-chat-view__input-row">
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

        {modelSelector && (
          <div className={`ai-chat-view__model-row${isInputAreaFocused ? ' ai-chat-view__model-row--visible' : ''}`}>
            <select
              className="ai-chat-view__model-select"
              value={selectionToValue(modelSelector.value)}
              onChange={(e) => {
                const parsed = parseSelectionValue(e.target.value);
                if (parsed) modelSelector.onChange(parsed);
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
        )}
      </div>

    </div>
  );
});
