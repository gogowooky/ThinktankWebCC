/**
 * ChatMedia.tsx
 * AIチャット表示メディア。Phase 8 は UI のみ（バックエンド未接続）。
 *
 * - think.Content が ContentType='chat' の場合、既存の会話履歴をパース
 * - ユーザー発言（右）/ AI応答（左・Markdown）
 * - 入力欄は下部固定
 * - Phase 14 でバックエンドに接続予定（SSEストリーミング）
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import { Send, Bot } from 'lucide-react';
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
      // AI 応答を収集（次の ## が来るまで）
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

// 簡易プレースホルダー応答（Phase 14 でバックエンド接続）
const PLACEHOLDER_RESPONSES = [
  'ご質問ありがとうございます。Phase 14 でAI接続後に応答いたします。',
  'その点については詳しく分析する必要がありますね。バックエンド接続後に対応します。',
  '興味深い視点です。AIチャット機能はPhase 14で実装予定です。',
];

let _resIdx = 0;
function nextPlaceholder(): string {
  return PLACEHOLDER_RESPONSES[_resIdx++ % PLACEHOLDER_RESPONSES.length];
}

export function ChatMedia({ think }: MediaProps) {
  // 初期メッセージ（think が chat なら Content をパース）
  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (!think || think.ContentType !== 'chat') return [];
    return parseChatContent(think.Content);
  }, [think?.ID]);  // eslint-disable-line react-hooks/exhaustive-deps

  const [messages, setMessages]   = useState<ChatMessage[]>(initialMessages);
  const [input, setInput]         = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);

  // think が変わったらメッセージをリセット
  useEffect(() => {
    setMessages(initialMessages);
    setInput('');
  }, [think?.ID]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 新しいメッセージが来たら下にスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isWaiting) return;

    const userMsg: ChatMessage = {
      id:        `u-${Date.now()}`,
      role:      'user',
      content:   text,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsWaiting(true);

    // Phase 14 でバックエンド接続（現在はプレースホルダー）
    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id:        `a-${Date.now()}`,
        role:      'assistant',
        content:   nextPlaceholder(),
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
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
      {/* コンテキスト表示 */}
      {think && (
        <div className="chat-media__context">
          <Bot size={11} />
          <span>コンテキスト: {think.Name}</span>
        </div>
      )}

      {/* メッセージ一覧 */}
      <div className="chat-media__messages">
        {messages.length === 0 && (
          <div className="chat-media__empty">
            メッセージを入力して会話を始めてください。
            <br />
            <span className="chat-media__phase-note">※ AI接続は Phase 14 で実装予定</span>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={[
              'chat-media__msg',
              msg.role === 'user'      ? 'chat-media__msg--user'      : '',
              msg.role === 'assistant' ? 'chat-media__msg--assistant'  : '',
            ].join(' ')}
          >
            {msg.role === 'assistant' && (
              <div className="chat-media__avatar"><Bot size={13} /></div>
            )}
            <div className="chat-media__bubble">
              {msg.content}
            </div>
          </div>
        ))}

        {/* ウェイティングインジケーター */}
        {isWaiting && (
          <div className="chat-media__msg chat-media__msg--assistant">
            <div className="chat-media__avatar"><Bot size={13} /></div>
            <div className="chat-media__bubble chat-media__bubble--waiting">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div className="chat-media__input-area">
        <textarea
          ref={inputRef}
          className="chat-media__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力… (Enter で送信 / Shift+Enter で改行)"
          rows={2}
          disabled={isWaiting}
        />
        <button
          className="chat-media__send"
          onClick={handleSend}
          disabled={!input.trim() || isWaiting}
          title="送信 (Enter)"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
