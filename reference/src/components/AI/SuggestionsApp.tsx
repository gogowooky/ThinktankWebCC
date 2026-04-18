/**
 * SuggestionsApp.tsx
 * Phase 12 段266: AI提案パネル UI
 *
 * WebViewパネルで /aisuggestions として表示される独立したReactページ。
 * localStorage の 'tt_suggestions' からデータを読み込む。
 */

import React, { useState, useEffect } from 'react';

interface Suggestion {
    ID: string;
    Type: string;
    Title: string;
    Body: string;
    Priority: number;
    UpdateDate: string;
}

const TYPE_LABEL: Record<string, string> = {
    recall: 'リコール',
    auto_tag: '自動タグ',
    related: '関連メモ',
    anniversary: '記念日',
    insight: 'インサイト',
};

const TYPE_COLOR: Record<string, string> = {
    recall: '#569cd6',
    auto_tag: '#4ec9b0',
    related: '#9cdcfe',
    anniversary: '#ce9178',
    insight: '#dcdcaa',
};

export function SuggestionsApp() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem('tt_suggestions');
            if (raw) setSuggestions(JSON.parse(raw));
        } catch {
            // ignore
        }
    }, []);

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <span style={styles.headerTitle}>AI 提案</span>
                <span style={styles.headerCount}>{suggestions.length} 件</span>
            </div>
            <div style={styles.list}>
                {suggestions.length === 0 ? (
                    <div style={styles.empty}>提案はありません</div>
                ) : (
                    suggestions.map(s => (
                        <div key={s.ID} style={styles.card}>
                            <div style={styles.cardHeader}>
                                <span style={{
                                    ...styles.typeBadge,
                                    color: TYPE_COLOR[s.Type] || '#cccccc',
                                    borderColor: TYPE_COLOR[s.Type] || '#555',
                                }}>
                                    {TYPE_LABEL[s.Type] || s.Type}
                                </span>
                                <span style={styles.priority}>優先度 {s.Priority}</span>
                                <span style={styles.date}>{s.UpdateDate?.slice(0, 16) || ''}</span>
                            </div>
                            <div style={styles.title}>{s.Title}</div>
                            {s.Body && <div style={styles.body}>{s.Body}</div>}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        background: '#1e1e1e',
        color: '#d4d4d4',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        fontSize: '13px',
        boxSizing: 'border-box',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: '#252526',
        borderBottom: '1px solid #3e3e42',
        flexShrink: 0,
    },
    headerTitle: {
        fontSize: '12px',
        color: '#cccccc',
        fontWeight: 600,
    },
    headerCount: {
        fontSize: '11px',
        color: '#858585',
    },
    list: {
        flex: 1,
        overflowY: 'auto',
        padding: '8px',
    },
    empty: {
        color: '#858585',
        textAlign: 'center',
        marginTop: '40px',
        fontSize: '13px',
    },
    card: {
        background: '#252526',
        border: '1px solid #3e3e42',
        borderRadius: '4px',
        padding: '10px 12px',
        marginBottom: '8px',
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '6px',
    },
    typeBadge: {
        fontSize: '11px',
        fontWeight: 600,
        border: '1px solid',
        borderRadius: '3px',
        padding: '1px 6px',
    },
    priority: {
        fontSize: '11px',
        color: '#858585',
    },
    date: {
        fontSize: '11px',
        color: '#858585',
        marginLeft: 'auto',
    },
    title: {
        fontSize: '13px',
        color: '#d4d4d4',
        fontWeight: 500,
        marginBottom: '4px',
    },
    body: {
        fontSize: '12px',
        color: '#9d9d9d',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
    },
};
