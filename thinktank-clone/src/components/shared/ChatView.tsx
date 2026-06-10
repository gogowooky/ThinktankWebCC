// AIチャット共通ビュー（各パネルのThinkファイル方針をシステムプロンプトとして使用）

import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import type { ChatMessage } from '../../types';
import { streamChat } from '../../services/ChatApiService';
import { IconSend } from '../Layout/Icons';
import './ChatView.css';

interface ChatViewProps {
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  /** システムプロンプト（パネルのThinkファイル方針） */
  systemPrompt: () => string;
  /** 送信時に先頭へ挿入するコンテキストブロック（仕様書06 §2） */
  buildContext?: () => Promise<string> | string;
  placeholder?: string;
  /** CLIターミナル風表示（ReThink用） */
  terminal?: boolean;
  focusName: string;
}

export function ChatView({
  messages, onMessagesChange, systemPrompt, buildContext, placeholder, terminal, focusName,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, streamText]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');

    const userMsg: ChatMessage = { role: 'user', content: text };
    const history = [...messages, userMsg];
    onMessagesChange(history);
    setStreaming(true);
    setStreamText('');

    let context = '';
    try {
      context = buildContext ? await buildContext() : '';
    } catch {
      // コンテキスト取得失敗時は本文なしで続行
    }

    const sendMessages: ChatMessage[] = context
      ? [{ role: 'user', content: context }, { role: 'assistant', content: '（コンテキストを把握しました）' }, ...history]
      : history;

    let acc = '';
    const ac = new AbortController();
    abortRef.current = ac;
    await streamChat(
      sendMessages,
      systemPrompt(),
      {
        onDelta: (t) => {
          acc += t;
          setStreamText(acc);
        },
        onDone: () => {
          onMessagesChange([...history, { role: 'assistant', content: acc }]);
          setStreaming(false);
          setStreamText('');
        },
        onError: (msg) => {
          onMessagesChange([...history, { role: 'assistant', content: `⚠ ${msg}` }]);
          setStreaming(false);
          setStreamText('');
        },
      },
      ac.signal,
    );
  };

  return (
    <div className={`chat-view${terminal ? ' chat-view--terminal' : ''}`} data-focusable={focusName}>
      <div className="chat-view__log" ref={logRef}>
        {messages.length === 0 && !streaming && (
          <div className="chat-view__empty">{placeholder ?? 'AIに質問してみましょう'}</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-view__msg chat-view__msg--${m.role}`}>
            {m.role === 'user' ? (
              <div className="chat-view__msg-user">{terminal ? `> ${m.content}` : m.content}</div>
            ) : (
              <div
                className="chat-view__msg-assistant"
                dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }}
              />
            )}
          </div>
        ))}
        {streaming && (
          <div className="chat-view__msg chat-view__msg--assistant">
            <div
              className="chat-view__msg-assistant"
              dangerouslySetInnerHTML={{ __html: marked.parse(streamText || '…') as string }}
            />
          </div>
        )}
      </div>
      <div className="chat-view__input-row">
        <textarea
          className="chat-view__input"
          value={input}
          rows={2}
          placeholder={placeholder ?? 'メッセージを入力（Enterで送信 / Shift+Enterで改行）'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="chat-view__send" data-tip="送信" onClick={() => void send()} disabled={streaming}>
          <IconSend size={14} />
        </button>
      </div>
    </div>
  );
}
