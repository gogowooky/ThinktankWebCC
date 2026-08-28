import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { Type, CalendarPlus2, CalendarArrowUp, ChevronDown, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { parseRange } from '../../utils/dateUtils';
import { FilterHistoryPulldown } from './FilterHistoryPulldown';
import { saveHistory } from '../../utils/historyUtils';
import './ThinktankFilterPanel.css';

export interface ThinktankFilterPanelRef {
  focus: () => void;
}

interface Props {
  historyKey:       string;
  textValue:        string;
  onTextChange:     (v: string) => void;
  
  createdDate:      string;
  onCreatedDateChange: (v: string) => void;
  createdRange:     string;
  onCreatedRangeChange: (v: string) => void;
  
  updatedDate:      string;
  onUpdatedDateChange: (v: string) => void;
  updatedRange:     string;
  onUpdatedRangeChange: (v: string) => void;
  
  visibleCount?:    number;
  totalCount?:      number;

  onSearch?:        () => void;
  showTextFilter?:  boolean;
  showCreatedDateFilter?: boolean;
  showUpdatedDateFilter?: boolean;

  /** テキスト入力欄のガイド（プレースホルダ）。省略時は既定文言 */
  textPlaceholder?: string;
  /** テキスト入力欄の先頭アイコン。省略時は Type */
  textIcon?:        LucideIcon;
}

export const ThinktankFilterPanel = React.memo(forwardRef<ThinktankFilterPanelRef, Props>(function ThinktankFilterPanel({
  historyKey,
  textValue, onTextChange,
  createdDate, onCreatedDateChange,
  createdRange, onCreatedRangeChange,
  updatedDate, onUpdatedDateChange,
  updatedRange, onUpdatedRangeChange,
  visibleCount, totalCount,
  onSearch,
  showTextFilter = true,
  showCreatedDateFilter = true,
  showUpdatedDateFilter = true,
  textPlaceholder = 'タイトル・キーワードで絞り込み...',
  textIcon: TextIcon = Type,
}, ref) {
  const [showHistory, setShowHistory] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => textInputRef.current?.focus(),
  }));

  const handleTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && textValue.trim()) {
      saveHistory(historyKey, textValue.trim());
      setShowHistory(false);
      onSearch?.();
    }
  };

  const cRangeInvalid = createdRange.trim() !== '' && !parseRange(createdRange.trim());
  const uRangeInvalid = updatedRange.trim() !== '' && !parseRange(updatedRange.trim());

  return (
    <div className="unified-filter-panel">
      {/* 1行目: テキストフィルタ */}
      {showTextFilter && (
        <div className="unified-filter-row">
          <div className="unified-filter-row-left">
            <TextIcon size={12} className="unified-filter-icon" />
            <div className="unified-filter-text-wrapper">
              <input
                ref={textInputRef}
                className="unified-filter-text-input"
                type="text"
                value={textValue}
                onChange={e => onTextChange(e.target.value)}
                onKeyDown={handleTextKeyDown}
                placeholder={textPlaceholder}
                spellCheck={false}
                autoComplete="off"
              />
              <ChevronDown 
                size={12} 
                className={`unified-filter-pulldown-icon ${showHistory ? 'unified-filter-pulldown-icon--active' : ''}`}
                onClick={() => setShowHistory(!showHistory)}
              />
              {showHistory && (
                <FilterHistoryPulldown 
                  historyKey={historyKey} 
                  onSelect={onTextChange} 
                  onClose={() => setShowHistory(false)} 
                />
              )}
            </div>
          </div>
          <div className="unified-filter-row-right">
            <div className="tooltip-wrapper" data-tip="消去" data-tip-side="left">
              <button 
                className="unified-filter-btn unified-filter-btn--clear"
                onClick={() => onTextChange('')}
                disabled={!textValue}
              >
                <X size={12} />
              </button>
            </div>
            {totalCount !== undefined && (
              <span className="unified-filter-count">
                {visibleCount ?? totalCount}/{totalCount}
              </span>
            )}
          </div>
        </div>
      )}

      {showCreatedDateFilter && (
        <div className="unified-filter-row">
          <div className="unified-filter-row-left">
            <CalendarPlus2 size={12} className="unified-filter-icon" />
            <input
              className="unified-filter-date-input"
              type="date"
              value={createdDate}
              onChange={e => onCreatedDateChange(e.target.value)}
              disabled={createdRange.trim().startsWith('@')}
            />
            <input
              className={`unified-filter-range-input ${cRangeInvalid ? 'unified-filter-range-input--invalid' : ''}`}
              type="text"
              value={createdRange}
              onChange={e => onCreatedRangeChange(e.target.value)}
              placeholder="+Nd / @Nd"
              data-tip="範囲指定: +Nd(以降), -Nd(以前), +-Nd(前後), @Nd(現在から遡り)"
              data-tip-side="left"
              autoComplete="off"
            />
          </div>
          <div className="unified-filter-row-right">
            <div className="tooltip-wrapper" data-tip="条件をクリア" data-tip-side="left">
              <button
                className="unified-filter-btn unified-filter-btn--clear"
                onClick={() => { onCreatedDateChange(''); onCreatedRangeChange(''); }}
                disabled={!createdDate && !createdRange}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpdatedDateFilter && (
        <div className="unified-filter-row">
          <div className="unified-filter-row-left">
            <CalendarArrowUp size={12} className="unified-filter-icon" />
            <input
              className="unified-filter-date-input"
              type="date"
              value={updatedDate}
              onChange={e => onUpdatedDateChange(e.target.value)}
              disabled={updatedRange.trim().startsWith('@')}
            />
            <input
              className={`unified-filter-range-input ${uRangeInvalid ? 'unified-filter-range-input--invalid' : ''}`}
              type="text"
              value={updatedRange}
              onChange={e => onUpdatedRangeChange(e.target.value)}
              placeholder="+Nd / @Nd"
              autoComplete="off"
              data-tip="範囲指定: +Nd(以降), -Nd(以前), +-Nd(前後), @Nd(現在から遡り)"
              data-tip-side="left"
            />
          </div>
          <div className="unified-filter-row-right">
            <div className="tooltip-wrapper" data-tip="条件をクリア" data-tip-side="left">
              <button
                className="unified-filter-btn unified-filter-btn--clear"
                onClick={() => { onUpdatedDateChange(''); onUpdatedRangeChange(''); }}
                disabled={!updatedDate && !updatedRange}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}));
