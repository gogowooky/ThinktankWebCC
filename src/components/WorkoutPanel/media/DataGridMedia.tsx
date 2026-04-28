/**
 * DataGridMedia.tsx
 * テーブル形式一覧メディア。
 *
 * - @tanstack/react-virtual で仮想スクロール
 * - think が Thought → GetThinksForThought の結果を表示
 * - それ以外 → Vault の全 Think（thought 除く）を表示
 * - 上部フィルターテキストボックスでタイトル/キーワード絞り込み
 * - 行クリックで選択（複数選択対応）
 */

import { useRef, useState, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  FileText, Lightbulb, Table, Link, MessageCircle, Globe,
  type LucideIcon,
} from 'lucide-react';
import type { TTThink } from '../../../models/TTThink';
import type { ContentType } from '../../../types';
import type { MediaProps } from './types';
import './DataGridMedia.css';

// ContentType アイコンマッピング
const CONTENT_ICONS: Record<ContentType, LucideIcon> = {
  memo:    FileText,
  thought: Lightbulb,
  tables:  Table,
  links:   Link,
  chat:    MessageCircle,
  nettext: Globe,
};

const CONTENT_LABELS: Record<ContentType, string> = {
  memo:    'メモ',
  thought: '思考',
  tables:  'テーブル',
  links:   'リンク',
  chat:    'チャット',
  nettext: 'Web文書',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  // yyyy-MM-dd-hhmmss 形式
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return dateStr.slice(0, 10);
}

export function DataGridMedia({ think, vault }: MediaProps) {
  const [filter, setFilter]     = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const scrollRef               = useRef<HTMLDivElement>(null);

  // 表示対象アイテム
  const allItems = useMemo<TTThink[]>(() => {
    if (think?.ContentType === 'thought') {
      return vault.GetThinksForThought(think.ID);
    }
    return vault.GetThinks().filter(t => t.ContentType !== 'thought');
  }, [think, vault]);

  // フィルター適用
  const filtered = useMemo<TTThink[]>(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(t =>
      t.Name.toLowerCase().includes(q) ||
      t.Keywords.toLowerCase().includes(q)
    );
  }, [allItems, filter]);

  // 仮想スクロール
  const rowVirtualizer = useVirtualizer({
    count:            filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     () => 36,
    overscan:         5,
  });

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="datagrid-media">

      {/* フィルター */}
      <div className="datagrid-media__toolbar">
        <input
          className="datagrid-media__filter"
          type="text"
          placeholder="タイトル・キーワードで絞り込み…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <span className="datagrid-media__count">{filtered.length} 件</span>
      </div>

      {/* ヘッダー */}
      <div className="datagrid-media__header">
        <div className="datagrid-media__cell datagrid-media__cell--check" />
        <div className="datagrid-media__cell datagrid-media__cell--type">種別</div>
        <div className="datagrid-media__cell datagrid-media__cell--title">タイトル</div>
        <div className="datagrid-media__cell datagrid-media__cell--date">更新日</div>
      </div>

      {/* 仮想スクロール本体 */}
      <div className="datagrid-media__scroll" ref={scrollRef}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const item   = filtered[virtualRow.index];
            const Icon   = CONTENT_ICONS[item.ContentType] ?? FileText;
            const isSelected = selected.has(item.ID);
            const isFocus    = think?.ID === item.ID;

            return (
              <div
                key={virtualRow.key}
                className={[
                  'datagrid-media__row',
                  isSelected ? 'datagrid-media__row--selected' : '',
                  isFocus    ? 'datagrid-media__row--focus'    : '',
                ].join(' ')}
                style={{
                  position:  'absolute',
                  top:       0,
                  left:      0,
                  width:     '100%',
                  height:    virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => setSelected(new Set([item.ID]))}
              >
                {/* チェックボックス */}
                <div className="datagrid-media__cell datagrid-media__cell--check">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {/* handled by onClick */}}
                    onClick={e => toggleSelect(item.ID, e)}
                  />
                </div>

                {/* 種別アイコン */}
                <div className="datagrid-media__cell datagrid-media__cell--type">
                  <Icon size={12} />
                  <span>{CONTENT_LABELS[item.ContentType]}</span>
                </div>

                {/* タイトル */}
                <div className="datagrid-media__cell datagrid-media__cell--title" title={item.Name}>
                  {item.Name}
                </div>

                {/* 更新日 */}
                <div className="datagrid-media__cell datagrid-media__cell--date">
                  {formatDate(item.UpdateDate)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 空状態 */}
      {filtered.length === 0 && (
        <div className="datagrid-media__empty">
          {filter ? '一致するアイテムはありません' : 'データがありません'}
        </div>
      )}
    </div>
  );
}
