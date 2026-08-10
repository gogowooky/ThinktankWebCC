/**
 * ChatMedia.tsx
 * Thinktank / Overview / ReThink / WorkoutSetting と同一の AiChatView を用いた
 * Pane 内 AI チャット。think.Content（ContentType='chat'）を保存先とし、
 * AI応答が完了するたびに MediaProps.onSave 経由で永続化する。
 */

import { useRef, useState, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { MonitorUp, MonitorDown, Save } from 'lucide-react';
import type { ChatMessage } from '../../../types';
import type { MediaProps } from './types';
import { streamChat } from '../../../services/ChatApiService';
import { parseChat, serializeChat } from '../../../utils/thinkFormat';
import { AiChatView } from '../../ThinktankPanel/AiChatView';
import type { AiChatViewRef } from '../../ThinktankPanel/AiChatView';
import './ChatMedia.css';

function buildSystemPrompt(thinkName: string, thinkContent: string): string {
  return (
    'あなたは Thinktank の AI アシスタントです。' +
    'ユーザーの Think（メモ・アイデア）について分析・整理・提案を日本語で行ってください。' +
    (thinkName ? `\n\n## 現在の Think\nタイトル: ${thinkName}` : '') +
    (thinkContent ? `\n内容:\n${thinkContent.slice(0, 2000)}` : '')
  );
}

export interface ChatMediaRef { focus: () => void; }

export const ChatMedia = forwardRef<ChatMediaRef, MediaProps>(function ChatMedia({ think, onSave, onDirtyChange, aiChatModel }: MediaProps, ref) {
  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (!think || think.ContentType !== 'chat') return [];
    return parseChat(think.Content);
  }, [think?.ID]); // eslint-disable-line react-hooks/exhaustive-deps

  const [messages,  setMessages]  = useState<ChatMessage[]>(initialMessages);
  const [isWaiting, setIsWaiting] = useState(false);
  const aiChatViewRef              = useRef<AiChatViewRef>(null);
  const abortRef                   = useRef<AbortController | null>(null);
  const accumulatedRef             = useRef('');
  const messagesRef                = useRef(messages);
  const savedContentRef            = useRef(think?.Content ?? '');

  useImperativeHandle(ref, () => ({ focus: () => aiChatViewRef.current?.focus() }));

  // think 切替: メッセージ・保存済み内容の基準をリセット
  useEffect(() => {
    setMessages(initialMessages);
    messagesRef.current = initialMessages;
    savedContentRef.current = think?.Content ?? '';
  }, [think?.ID, initialMessages]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const buildContent = useCallback((msgs: ChatMessage[]) => {
    if (!think) return '';
    const firstLine = think.Content.split('\n')[0] ?? '';
    const body = serializeChat(msgs);
    return firstLine ? `${firstLine}\n${body}` : body;
  }, [think]);

  const persistChat = useCallback((msgs: ChatMessage[]) => {
    if (!think) return;
    const content = buildContent(msgs);
    if (content === savedContentRef.current) return;
    onSave(content, think.ID).then(() => {
      savedContentRef.current = content;
      onDirtyChange(false);
    });
  }, [think, buildContent, onSave, onDirtyChange]);

  // 未保存変更の検知（Ribbon の ● 表示に反映）
  useEffect(() => {
    if (!think) return;
    onDirtyChange(buildContent(messages) !== savedContentRef.current);
  }, [messages, think, buildContent, onDirtyChange]);

  const systemPrompt = useMemo(
    () => buildSystemPrompt(think?.Name ?? '', think?.Content ?? ''),
    [think?.Name, think?.Content], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleChatSend = useCallback(async (text: string) => {
    const ts = new Date().toISOString();
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: ts };
    const aiId = `a-${Date.now() + 1}`;
    const aiMsg: ChatMessage   = { id: aiId, role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setMessages(prev => {
      const next = [...prev, userMsg, aiMsg];
      messagesRef.current = next;
      return next;
    });
    setIsWaiting(true);
    accumulatedRef.current = '';

    abortRef.current = new AbortController();

    const history = [...messagesRef.current.filter(m => m.id !== aiId), userMsg].map(m => ({
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
          setMessages(prev => {
            const next = prev.map(m => m.id === aiId ? { ...m, content: accumulated } : m);
            messagesRef.current = next;
            return next;
          });
        },
        onDone: () => {
          setIsWaiting(false);
          persistChat(messagesRef.current);
        },
        onError: (message) => {
          setMessages(prev => {
            const next = prev.map(m => m.id === aiId ? { ...m, content: `[エラー] ${message}` } : m);
            messagesRef.current = next;
            return next;
          });
          setIsWaiting(false);
          persistChat(messagesRef.current);
        },
      },
      abortRef.current.signal,
      aiChatModel,
    );
  }, [systemPrompt, persistChat, aiChatModel]);

  const handleScrollPrev = useCallback(() => aiChatViewRef.current?.scrollToPrevUser(), []);
  const handleScrollNext = useCallback(() => aiChatViewRef.current?.scrollToNextUser(), []);
  const handleSaveChat   = useCallback(() => persistChat(messagesRef.current), [persistChat]);

  const isDirty = think ? buildContent(messages) !== savedContentRef.current : false;

  return (
    <div className="chat-media">
      <div className="chat-media__toolbar">
        <button
          className="chat-media__toolbar-btn"
          onClick={handleScrollPrev}
          data-tip="前のユーザーメッセージへ"
        >
          <MonitorUp size={14} />
        </button>
        <button
          className="chat-media__toolbar-btn"
          onClick={handleScrollNext}
          data-tip="次のユーザーメッセージへ"
        >
          <MonitorDown size={14} />
        </button>
        <button
          className="chat-media__toolbar-btn"
          onClick={handleSaveChat}
          disabled={!isDirty || isWaiting}
          data-tip="変更をThinkに保存"
        >
          <Save size={14} />
        </button>
      </div>
      <AiChatView
        key={think?.ID ?? 'none'}
        ref={aiChatViewRef}
        messages={messages}
        isWaiting={isWaiting}
        onSend={handleChatSend}
        initialScrollTop={think?.Metadata?.chatScrollTop}
        onScroll={(top) => {
          if (!think) return;
          if (!think.Metadata) think.Metadata = {};
          think.Metadata.chatScrollTop = top;
        }}
      />
    </div>
  );
});
