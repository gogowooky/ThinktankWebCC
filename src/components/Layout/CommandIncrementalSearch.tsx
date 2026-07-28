/**
 * CommandIncrementalSearch.tsx
 * ToolBar Commandモードのインクリメンタルサーチ候補ポップアップ。
 * ToolBar本体の直上に表示し、キーボード操作（上下キー/Enter）による選択は
 * 呼び出し元（ApplicationStatusBarArea）のTextbox onKeyDownで処理する。
 */

import { useEffect, useRef } from 'react';
import './CommandIncrementalSearch.css';

export interface CommandCandidate {
  id:          string;
  description: string;
}

interface Props {
  candidates:    CommandCandidate[];
  selectedIndex: number;
  onSelect:      (value: string) => void;
}

export function CommandIncrementalSearch({ candidates, selectedIndex, onSelect }: Props) {
  // li は display:contents（グリッド整列のため）で自身のボックスを持たないため、
  // scrollIntoView は実際に描画されるid側spanを対象にする
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (candidates.length === 0) return null;

  return (
    <div className="command-incremental-search">
      <ul className="command-incremental-search__list">
        {candidates.map((c, i) => {
          const isActive = i === selectedIndex;
          return (
            <li
              key={c.id}
              className="command-incremental-search__row"
              onMouseDown={e => {
                e.preventDefault();
                onSelect(c.id);
              }}
            >
              <span
                ref={isActive ? activeRef : undefined}
                className={`command-incremental-search__item-id${isActive ? ' command-incremental-search__item-id--active' : ''}`}
              >
                {c.id}
              </span>
              <span className={`command-incremental-search__item-desc${isActive ? ' command-incremental-search__item-desc--active' : ''}`}>{c.description}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
