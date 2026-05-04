/**
 * ChatMedia.tsx
 * Phase 14: CLI 風ターミナル表示の AI チャットメディア。
 * Anthropic SSE ストリーミング対応。
 *
 * - think.Content が ContentType='chat' なら既存履歴をパース
 * - think データをシステムプロンプトのコンテキストとして渡す
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { ChatMessage } from '../../../types';
import type { MediaProps } from './types';
import { streamChat } from '../../../services/ChatApiService';
import './ChatMedia.css';

function parseChatContent(content: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      const userText = line.slice(3).trim();
      if (userText) {
        messages.push({ id: `u-${i}`, role: 'user', content: userText, timestamp: '' });
      }
      i++;
      const aiLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('## ')) {
        aiLines.push(lines[i]);
        i++;
      }
      const aiText = aiLines.join('\n').trim();
      if (aiText) {
        messages.push({ id: `a-${i}`, role: 'assistant', content: aiText, timestamp: '' });
      }
    } else {
      i++;
    }
  }
  return messages;
}

function buildSystemPrompt(thinkName: string, thinkContent: string): string {
  return (
    'あなたは Thinktank の AI アシスタントです。' +
    'ユーザーの Think（メモ・アイデア）について分析・整理・提案を日本語で行ってください。' +
    (thinkName ? `\n\n## 現在の Think\nタイトル: ${thinkName}` : '') +
    (thinkContent ? `\n内容:\n${thinkContent.slice(0, 2000)}` : '')
  );
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function ChatMedia({ think }: MediaProps) {
  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (!think || think.ContentType !== 'chat') return [];
    return parseChatContent(think.Content);
  }, [think?.ID]); // eslint-disable-line react-hooks/exhaustive-deps

  const [messages,  setMessages]  = useState<ChatMessage[]>(initialMessages);
  const [input,     setInput]     = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);
  const abortRef                  = useRef<AbortController | null>(null);
  const accumulatedRef            = useRef('');

  useEffect(() => {
    setMessages(initialMessages);
    setInput('');
  }, [think?.ID]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isWaiting]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const systemPrompt = useMemo(
    () => buildSystemPrompt(think?.Name ?? '', think?.Content ?? ''),
    [think?.Name, think?.Content], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isWaiting) return;

    const ts = new Date().toISOString();
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: ts };
    const aiId = `a-${Date.now() + 1}`;
    const aiMsg: ChatMessage   = { id: aiId, role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setInput('');
    setIsWaiting(true);
    accumulatedRef.current = '';

    abortRef.current = new AbortController();

    const history = [...messages, userMsg].map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }));

    await streamChat(
      history,
      systemPrompt,
      {
        onDelta: (delta) => {
          accumulatedRef.current += delta;
          const accumulated = accumulatedRef.current;
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: accumulated } : m));
        },
        onDone: () => {
          setIsWaiting(false);
        },
        onError: (message) => {
          setMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, content: `[エラー] ${message}` } : m,
          ));
          setIsWaiting(false);
        },
      },
      abortRef.current.signal,
    );
  }, [input, isWaiting, messages, systemPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const lastMsg = messages[messages.length - 1];

  return (
    <div className="chat-media">

      {/* ターミナルヘッダー */}
      <div className="chat-media__header">
        <span className="chat-media__header-dots">
          <span /><span /><span />
        </span>
        <span className="chat-media__header-title">
          thinktank-ai{think ? ` — ${think.Name}` : ''}
        </span>
      </div>

      {/* ログ出力エリア */}
      <div className="chat-media__log">

        <div className="chat-media__banner">
          <span className="chat-media__banner-line">Thinktank AI v5</span>
          <span className="chat-media__banner-line chat-media__dim">Type your message and press Enter to send.</span>
          <span className="chat-media__banner-sep">{'─'.repeat(48)}</span>
        </div>

        {messages.map(msg => (
          <div key={msg.id} className="chat-media__entry">
            {msg.role === 'user' ? (
              <div className="chat-media__user-line">
                <span className="chat-media__prompt">{'>'}</span>
                <span className="chat-media__user-text">{msg.content}</span>
                {msg.timestamp && (
                  <span className="chat-media__ts">{formatTime(msg.timestamp)}</span>
                )}
              </div>
            ) : (
              <div className="chat-media__ai-block">
                {(msg.content || ' ').split('\n').map((line, li) => (
                  <div key={li} className="chat-media__ai-line">
                    <span className="chat-media__ai-prefix">{li === 0 ? 'AI▸' : '   '}</span>
                    <span className="chat-media__ai-text">{line}</span>
                    {li === 0 && msg.timestamp && !isWaiting && (
                      <span className="chat-media__ts">{formatTime(msg.timestamp)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* ストリーム開始前の待機カーソル */}
        {isWaiting && lastMsg?.role === 'assistant' && lastMsg.content === '' && (
          <div className="chat-media__ai-block">
            <div className="chat-media__ai-line">
              <span className="chat-media__ai-prefix">AI▸</span>
              <span className="chat-media__cursor">▋</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 入力ライン */}
      <div className="chat-media__input-row">
        <span className="chat-media__input-prompt">{'>'}</span>
        <textarea
          ref={inputRef}
          className="chat-media__input"
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
