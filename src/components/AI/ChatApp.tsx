/**
 * ChatApp.tsx
 * Phase 11 段123: AIチャットUI
 *
 * WebViewパネルで /aichat として表示される独立したReactページ。
 * - チャットセッション一覧（左ペイン）
 * - メッセージ一覧（スクロール可）
 * - 入力欄 + 送信ボタン
 * - ユーザー / AI返答の区別表示
 * - Markdownレンダリング（簡易）
 * - 送信中スピナー表示
 */

import React, { useState, useEffect, useRef } from 'react';
import './ChatApp.css';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

interface ChatSession {
    id: string;
    title: string;
    updatedAt: string;
}

// 簡易Markdownレンダラ（コードブロック・インラインコード・箇条書き・段落）
function renderMarkdown(text: string): React.ReactNode {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCode = false;
    let codeLines: string[] = [];
    let keyIdx = 0;

    const flush = () => {
        if (codeLines.length > 0) {
            elements.push(
                <pre key={keyIdx++}>
                    <code>{codeLines.join('\n')}</code>
                </pre>
            );
            codeLines = [];
        }
    };

    for (const line of lines) {
        if (line.startsWith('```')) {
            if (inCode) {
                flush();
                inCode = false;
            } else {
                inCode = true;
            }
            continue;
        }
        if (inCode) {
            codeLines.push(line);
            continue;
        }

        if (line.startsWith('- ') || line.startsWith('* ')) {
            elements.push(<li key={keyIdx++}>{inlineFormat(line.slice(2))}</li>);
        } else if (line === '') {
            elements.push(<br key={keyIdx++} />);
        } else {
            elements.push(<p key={keyIdx++}>{inlineFormat(line)}</p>);
        }
    }
    if (inCode) flush();

    return <>{elements}</>;
}

function inlineFormat(text: string): React.ReactNode {
    // `code` をレンダリング
    const parts = text.split(/(`[^`]+`)/g);
    return (
        <>
            {parts.map((part, i) =>
                part.startsWith('`') && part.endsWith('`')
                    ? <code key={i}>{part.slice(1, -1)}</code>
                    : <React.Fragment key={i}>{part}</React.Fragment>
            )}
        </>
    );
}

function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
        return '';
    }
}

export const ChatApp: React.FC = () => {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [contextNote, setContextNote] = useState<string>('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // URLパラメータからチャットIDや初期コンテキストを取得
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const chatId = params.get('id');
        const ctx = params.get('context');
        if (ctx) {
            setContextNote(decodeURIComponent(ctx).substring(0, 60) + '...');
        }
        loadSessions(chatId || undefined);
    }, []);

    // メッセージ末尾にスクロール
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const loadSessions = async (selectId?: string) => {
        try {
            const res = await fetch('/api/bq/files?category=Chat');
            if (!res.ok) return;
            const data = await res.json();
            const files = (data.files || []) as any[];
            const list: ChatSession[] = files
                .filter((f: any) => f.category === 'Chat')
                .map((f: any) => ({
                    id: f.file_id,
                    title: f.title || f.file_id,
                    updatedAt: f.updated_at || '',
                }))
                .sort((a: ChatSession, b: ChatSession) => b.updatedAt.localeCompare(a.updatedAt));
            setSessions(list);

            const target = selectId || (list.length > 0 ? list[0].id : null);
            if (target) openChat(target);
        } catch (e) {
            console.error('[ChatApp] セッション一覧取得失敗:', e);
        }
    };

    const openChat = async (chatId: string) => {
        setCurrentChatId(chatId);
        setMessages([]);
        setError(null);
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data.messages || []);
            }
        } catch (e) {
            console.error('[ChatApp] チャット読み込み失敗:', e);
        }
    };

    const newChat = () => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const id = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        setCurrentChatId(id);
        setMessages([]);
        setError(null);
        setInput('');
    };

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        // チャットIDがなければ新規作成
        let chatId = currentChatId;
        if (!chatId) {
            newChat();
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            chatId = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            setCurrentChatId(chatId);
        }

        const userMsg: ChatMessage = {
            role: 'user',
            content: text,
            timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            // コンテキストメモを localStorage から取得してsystemPromptとして付与
            const params = new URLSearchParams(window.location.search);
            let systemPrompt: string | undefined;
            if (params.get('source') === 'memo') {
                try {
                    const stored = localStorage.getItem('tt_chat_memo_context');
                    if (stored) {
                        const ctx = JSON.parse(stored) as { memoName: string; memoContent: string };
                        systemPrompt = `以下はユーザーの参照メモ「${ctx.memoName}」です。回答時に活用してください。\n\n${ctx.memoContent}`;
                    }
                } catch { /* パース失敗時は無視 */ }
            }

            const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, systemPrompt }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const aiMsg: ChatMessage = {
                role: 'assistant',
                content: data.reply,
                timestamp: new Date().toISOString(),
            };
            setMessages(prev => [...prev, aiMsg]);

            // セッション一覧を更新
            loadSessions(chatId);
        } catch (e: any) {
            setError(e.message || 'AIへの送信に失敗しました');
            console.error('[ChatApp] sendMessage error:', e);
        } finally {
            setIsLoading(false);
            textareaRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        // 高さ自動調整
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    };

    const currentSession = sessions.find(s => s.id === currentChatId);

    return (
        <div className="chat-app">
            {/* ヘッダー */}
            <div className="chat-header">
                <div className="chat-header-title">
                    {currentSession?.title || (currentChatId ? currentChatId : 'AIチャット')}
                </div>
                <div className="chat-header-actions">
                    <button className="chat-btn" onClick={newChat}>＋ 新規</button>
                </div>
            </div>

            <div className="chat-body">
                {/* セッション一覧（左ペイン） */}
                <div className="chat-sessions">
                    <div className="chat-sessions-header">チャット履歴</div>
                    {sessions.length === 0 && (
                        <div style={{ padding: '8px', color: '#6e6e6e', fontSize: '11px' }}>
                            履歴なし
                        </div>
                    )}
                    {sessions.map(s => (
                        <div
                            key={s.id}
                            className={`chat-session-item${s.id === currentChatId ? ' active' : ''}`}
                            onClick={() => openChat(s.id)}
                            title={s.title}
                        >
                            {s.title}
                        </div>
                    ))}
                </div>

                {/* チャットメインエリア */}
                <div className="chat-main">
                    {/* メッセージ一覧 */}
                    <div className="chat-messages">
                        {messages.length === 0 && !isLoading && (
                            <div className="chat-empty">
                                メッセージを入力してチャットを開始してください
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i} className={`chat-message ${msg.role}`}>
                                <div className="chat-message-icon">
                                    {msg.role === 'user' ? 'U' : 'AI'}
                                </div>
                                <div>
                                    <div className="chat-message-content">
                                        {msg.role === 'assistant'
                                            ? renderMarkdown(msg.content)
                                            : msg.content}
                                    </div>
                                    <div className="chat-message-time">
                                        {formatTime(msg.timestamp)}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="chat-spinner">AI が応答中...</div>
                        )}

                        {error && (
                            <div style={{ color: '#f48771', fontSize: '12px', padding: '6px' }}>
                                ⚠ {error}
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* 入力エリア */}
                    <div className="chat-input-area">
                        {contextNote && (
                            <div className="chat-context-bar">
                                📎 コンテキスト: {contextNote}
                            </div>
                        )}
                        <div className="chat-input-row">
                            <textarea
                                ref={textareaRef}
                                className="chat-textarea"
                                placeholder="メッセージを入力... (Enter で送信、Shift+Enter で改行)"
                                value={input}
                                onChange={handleTextareaInput}
                                onKeyDown={handleKeyDown}
                                rows={1}
                                disabled={isLoading}
                                autoFocus
                            />
                            <button
                                className="chat-send-btn"
                                onClick={sendMessage}
                                disabled={isLoading || !input.trim()}
                            >
                                送信
                            </button>
                        </div>
                        <div className="chat-hint">Enter: 送信 / Shift+Enter: 改行</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
