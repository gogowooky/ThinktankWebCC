/**
 * ChatMedia.tsx
 * CLI 風ターミナル表示のAIチャットメディア。
 *
 * - 黒背景・等幅フォントのターミナル UI
 * - ユーザー行: `> ` プロンプト（緑）
 * - AI 行: `AI▸ ` プレフィックス（シアン）
 * - 待機中: ブロックカーソル点滅
 * - Enter で送信 / Shift+Enter で改行
 * - think.Content が ContentType='chat' なら既存履歴をパース
 * - Phase 14 でバックエンド（SSEストリーミング）接続予定
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import type { ChatMessage } from '../../../types';
import type { MediaProps } from './types';
import './ChatMedia.css';

// think.Content（chat形式）をメッセージ配列にパース
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

const PLACEHOLDER_RESPONSES = [
  'Phase 14 でバックエンド接続後に応答します。\nSSE ストリーミングで逐次出力される予定です。',
  'その点については詳しく分析が必要です。\n[AI 接続待機中]',
  '興味深い観点です。\nバックエンド実装 (Phase 14) をお待ちください。',
];
let _resIdx = 0;
function nextPlaceholder(): string {
  return PLACEHOLDER_RESPONSES[_resIdx++ % PLACEHOLDER_RESPONSES.length];
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
  }, [think?.ID]);  // eslint-disable-line react-hooks/exhaustive-deps

  const [messages, setMessages]   = useState<ChatMessage[]>(initialMessages);
  const [input, setInput]         = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setInput('');
  }, [think?.ID]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isWaiting]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isWaiting) return;

    const ts = new Date().toISOString();
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: ts }]);
    setInput('');
    setIsWaiting(true);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        id:        `a-${Date.now()}`,
        role:      'assistant',
        content:   nextPlaceholder(),
        timestamp: new Date().toISOString(),
      }]);
      setIsWaiting(false);
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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

        {/* 起動バナー */}
        <div className="chat-media__banner">
          <span className="chat-media__banner-line">Thinktank AI v5  [Phase 14 pending]</span>
          <span className="chat-media__banner-line chat-media__dim">Type your message and press Enter to send.</span>
          <span className="chat-media__banner-sep">{'─'.repeat(48)}</span>
        </div>

        {/* メッセージ */}
        {messages.map(msg => (
          <div key={msg.id} className="chat-media__entry">
            {msg.role === 'user' ? (
              /* ユーザー行 */
              <div className="chat-media__user-line">
                <span className="chat-media__prompt">{'>'}</span>
                <span className="chat-media__user-text">{msg.content}</span>
                {msg.timestamp && (
                  <span className="chat-media__ts">{formatTime(msg.timestamp)}</span>
                )}
              </div>
            ) : (
              /* AI 応答行（複数行対応）*/
              <div className="chat-media__ai-block">
                {msg.content.split('\n').map((line, li) => (
                  <div key={li} className="chat-media__ai-line">
                    <span className="chat-media__ai-prefix">{li === 0 ? 'AI▸' : '   '}</span>
                    <span className="chat-media__ai-text">{line}</span>
                    {li === 0 && msg.timestamp && (
                      <span className="chat-media__ts">{formatTime(msg.timestamp)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 待機中カーソル */}
        {isWaiting && (
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
