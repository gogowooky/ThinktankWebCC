/**
 * ThinktankSearchBar.tsx
 * Think一覧モードの日付欄の下に表示する、
 * ① 全文/AI 検索のキーワード欄＋検索オプション
 * ② 一覧表示する種別（ContentType）の選択ボタン
 */

import React, { useImperativeHandle, forwardRef, useRef } from 'react';
import { TextSearch, X, FileText, Library, Table, Link, MessageCircle, Globe, SquareCheck, type LucideIcon } from 'lucide-react';
import type { ContentType } from '../../types';
import './ThinktankFilterPanel.css';
import './ThinktankSearchBar.css';

const TYPE_DEFS: { type: ContentType; Icon: LucideIcon; label: string }[] = [
  { type: 'memo',    Icon: FileText,      label: 'メモ' },
  { type: 'thought', Icon: Library,       label: 'Thought' },
  { type: 'table',   Icon: Table,         label: 'テーブル' },
  { type: 'links',   Icon: Link,          label: 'リンク' },
  { type: 'chat',    Icon: MessageCircle, label: 'チャット' },
  { type: 'nettext', Icon: Globe,         label: 'WebText' },
];

export interface ThinktankSearchBarRef {
  focus: () => void;
}

interface Props {
  searchQuery:         string;
  onSearchQueryChange: (v: string) => void;
  onSearch:            () => void;
  loading:             boolean;
  visibleTypes:        Set<ContentType>;
  onToggleType:        (t: ContentType) => void;
  onSelectAllTypes:    () => void;
  onClearAllTypes:     () => void;
  showContentFilter?:  boolean;
  showTypeFilter?:     boolean;
}

export const ThinktankSearchBar = forwardRef<ThinktankSearchBarRef, Props>(function ThinktankSearchBar({
  searchQuery, onSearchQueryChange, onSearch,
  loading,
  visibleTypes, onToggleType, onSelectAllTypes, onClearAllTypes,
  showContentFilter = true,
  showTypeFilter = true,
}, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) onSearch();
  };

  return (
    <div className="tt-search-bar">
      {/* 検索キーワード欄（タイトル絞り込み欄と同じスタイル） */}
      {showContentFilter && (
        <div className="unified-filter-row">
          <div className="unified-filter-row-left">
            <TextSearch size={12} className="unified-filter-icon" />
            <div className="unified-filter-text-wrapper">
              <input
                ref={inputRef}
                className="unified-filter-text-input"
                type="text"
                value={searchQuery}
                onChange={e => onSearchQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="コンテンツで絞り込み"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="unified-filter-row-right">
            {loading && <span className="unified-filter-count">検索中…</span>}
            <button
              className="unified-filter-btn unified-filter-btn--clear"
              onClick={() => onSearchQueryChange('')}
              disabled={!searchQuery}
              data-tip="消去"
              data-tip-side="left"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* 種別選択ボタン（右端=全選択/全クリアのトグル）*/}
      {showTypeFilter && (
        <div className="tt-search-bar__types">
          {TYPE_DEFS.map(({ type, Icon, label }) => {
            const active = visibleTypes.has(type);
            return (
              <button
                key={type}
                className={`tt-search-bar__type-btn${active ? ' tt-search-bar__type-btn--active' : ''}`}
                onClick={() => onToggleType(type)}
                data-tip={label}
                aria-label={label}
                aria-pressed={active}
              >
                <Icon size={14} />
              </button>
            );
          })}
          {(() => {
            const allSelected = visibleTypes.size === TYPE_DEFS.length;
            return (
              <button
                className="tt-search-bar__type-all tt-search-bar__type-all--right"
                onClick={allSelected ? onClearAllTypes : onSelectAllTypes}
                data-tip={allSelected ? '全種別をクリア' : '全種別を選択'}
                data-tip-side="left"
                aria-label={allSelected ? '全種別をクリア' : '全種別を選択'}
              >
                {allSelected ? <X size={12} /> : <SquareCheck size={12} />}
              </button>
            );
          })()}
        </div>
      )}
    </div>
  );
});
