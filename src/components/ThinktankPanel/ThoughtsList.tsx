/**
 * ThoughtsList.tsx
 * Phase 6: Thoughts 一覧（仮想スクロール）。
 *
 * 行形式: [チェック] [アイコン] タイトル [更新日]  行高さ 36px
 * チェックで複数 Thought 選択可能。
 * クリックで TTApplication.OpenThought(id) を呼ぶ。
 *
 * フィルター構文:
 *   スペース区切りでトークンに分割し AND 検索。
 *   "-word" で NOT、"OR" キーワードは OR 接続（将来対応）。
 */

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BookOpen } from 'lucide-react';
import type { TTThink } from '../../models/TTThink';
import './ThoughtsList.css';

const ROW_HEIGHT = 36;
const OVERSCAN   = 5;

interface Props {
  thoughts: TTThink[];
  selectedId: string;
  checkedIds: string[];
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
}

/** フィルタートークンを適用して TTThink[] を絞り込む */
export function applyFilter(thoughts: TTThink[], filter: string): TTThink[] {
  const raw = filter.trim();
  if (!raw) return thoughts;

  // スペース区切りで AND トークンに分割（"-" prefix で NOT）
  const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);

  return thoughts.filter(t => {
    const text = `${t.Name} ${t.Keywords}`.toLowerCase();
    return tokens.every(token => {
      if (token.startsWith('-') && token.length > 1) {
        return !text.includes(token.slice(1));
      }
      return text.includes(token);
    });
  });
}

/** 日付文字列を短縮表示（yyyy-MM-dd 形式）*/
function shortDate(dateStr: string): string {
  if (!dateStr) return '';
  // UpdateDate 形式: "yyyy-MM-dd-HHmmss-mmm-rand" → 先頭 10 文字
  const parts = dateStr.split('-');
  if (parts.length >= 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
  return dateStr.slice(0, 10);
}

export function ThoughtsList({
  thoughts,
  selectedId,
  checkedIds,
  onSelect,
  onToggleCheck,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: thoughts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  if (thoughts.length === 0) {
    return (
      <div className="thoughts-list thoughts-list--empty">
        <span>Thought がありません</span>
      </div>
    );
  }

  return (
    <div className="thoughts-list" ref={parentRef}>
      {/* 仮想スクロールの高さ確保用コンテナ */}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vItem => {
          const thought = thoughts[vItem.index];
          const isSelected = thought.ID === selectedId;
          const isChecked  = checkedIds.includes(thought.ID);

          return (
            <div
              key={thought.ID}
              className={[
                'thoughts-list__row',
                isSelected ? 'thoughts-list__row--selected' : '',
                isChecked  ? 'thoughts-list__row--checked'  : '',
              ].join(' ')}
              style={{
                position: 'absolute',
                top:    vItem.start,
                left:   0,
                right:  0,
                height: ROW_HEIGHT,
              }}
              onClick={() => onSelect(thought.ID)}
            >
              {/* チェックボックス */}
              <input
                type="checkbox"
                className="thoughts-list__check"
                checked={isChecked}
                onChange={e => {
                  e.stopPropagation();
                  onToggleCheck(thought.ID);
                }}
                onClick={e => e.stopPropagation()}
                aria-label={`${thought.Name} を選択`}
              />

              {/* アイコン */}
              <BookOpen size={13} className="thoughts-list__icon" />

              {/* タイトル */}
              <span className="thoughts-list__title" title={thought.Name}>
                {thought.Name || '（無題）'}
              </span>

              {/* 更新日 */}
              <span className="thoughts-list__date">
                {shortDate(thought.UpdateDate)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
