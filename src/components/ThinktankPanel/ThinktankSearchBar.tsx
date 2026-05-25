/**
 * ThinktankSearchBar.tsx
 * Think一覧モードの日付欄の下に表示する、
 * ① 全文/AI 検索のキーワード欄＋検索オプション
 * ② 一覧表示する種別（ContentType）の選択ボタン
 */

import React, { useId, useImperativeHandle, forwardRef, useRef } from 'react';
import { TextSearch, X, FileText, Library, Table, Link, MessageCircle, Globe, SquareCheck, type LucideIcon } from 'lucide-react';
import type { ContentType } from '../../types';
import './UnifiedFilterPanel.css';
import './ThinktankSearchBar.css';

export type SearchMode = 'fulltext' | 'semantic' | 'hybrid';

const SEARCH_MODE_LABELS: Record<SearchMode, string> = {
  fulltext: '全文',
  semantic: 'AI意味',
  hybrid:   'ハイブリッド',
};

const SEARCH_MODE_TIPS: Record<SearchMode, string> = {
  fulltext: '通常のキーワード全文検索',
  semantic: 'Vertex AI によるセマンティック（意味）検索',
  hybrid:   'AI意味 + 全文のハイブリッド検索',
};

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
  searchMode:          SearchMode;
  onSearchModeChange:  (m: SearchMode) => void;
  loading:             boolean;
  visibleTypes:        Set<ContentType>;
  onToggleType:        (t: ContentType) => void;
  onSelectAllTypes:    () => void;
  onClearAllTypes:     () => void;
}

export const ThinktankSearchBar = forwardRef<ThinktankSearchBarRef, Props>(function ThinktankSearchBar({
  searchQuery, onSearchQueryChange, onSearch,
  searchMode, onSearchModeChange,
  loading,
  visibleTypes, onToggleType, onSelectAllTypes, onClearAllTypes,
}, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));
  const radioGroupName = `tt-search-mode-${useId()}`;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) onSearch();
  };

  return (
    <div className="tt-search-bar">
      {/* 検索キーワード欄（タイトル絞り込み欄と同じスタイル） */}
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

      {/* 検索オプション（ラジオボタン） */}
      <div className="tt-search-bar__modes">
        {(Object.keys(SEARCH_MODE_LABELS) as SearchMode[]).map(m => (
          <label
            key={m}
            className={`tt-search-bar__mode-radio${searchMode === m ? ' tt-search-bar__mode-radio--active' : ''}`}
            data-tip={SEARCH_MODE_TIPS[m]}
            data-tip-side="bottom"
          >
            <input
              type="radio"
              name={radioGroupName}
              checked={searchMode === m}
              onChange={() => onSearchModeChange(m)}
            />
            <span>{SEARCH_MODE_LABELS[m]}</span>
          </label>
        ))}
      </div>

      {/* 種別選択ボタン（右端=全選択/全クリアのトグル）*/}
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
    </div>
  );
});
