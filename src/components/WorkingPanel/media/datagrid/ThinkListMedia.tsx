import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileText, Target, Table, Link, MessagesSquare, Globe, type LucideIcon } from 'lucide-react';
import type { TTThink } from '../../../../models/TTThink';
import type { ContentType } from '../../../../types';
import type { MediaProps } from '../types';
import { useHighlight } from '../../../../contexts/HighlightContext';
import { applyFilter } from '../../../ThinktankPanel/ThoughtsList';
import { HighlightedText } from './HighlightedText';
const CONTENT_ICONS: Record<ContentType, LucideIcon> = {
  memo: FileText,
  project: Target,
  table: Table,
  links: Link,
  chat: MessagesSquare,
  html: Globe,
};

const CONTENT_LABELS: Record<ContentType, string> = {
  memo: 'メモ',
  project: 'プロジェクト',
  table: 'テーブル',
  links: 'リンク',
  chat: 'チャット',
  html: 'HTML',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return dateStr.slice(0, 10);
}

export function ThinkListMedia({ think, vault, editorSettings }: MediaProps) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { seedsBundleIds, workingIds } = useHighlight();

  const [allItems, setAllItems] = useState<TTThink[]>(() => {
    if (think?.ContentType === 'project') return vault.GetThinksForProject(think.ID);
    return vault.GetThinks().filter(t => t.ContentType !== 'project');
  });

  useEffect(() => {
    if (think?.ContentType !== 'project') {
      setAllItems(vault.GetThinks().filter(t => t.ContentType !== 'project'));
      return;
    }
    void vault.GetThinksForProjectAsync(think.ID).then(setAllItems);
  }, [think?.ID, vault]);

  const filtered = useMemo<TTThink[]>(() => {
    return applyFilter(allItems, filter);
  }, [allItems, filter]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    const cur = focusedId ? filtered.findIndex(t => t.ID === focusedId) : -1;
    const next = cur < 0
      ? (dir > 0 ? 0 : filtered.length - 1)
      : Math.max(0, Math.min(filtered.length - 1, cur + dir));
    setFocusedId(filtered[next]?.ID ?? null);
    rowVirtualizer.scrollToIndex(next, { align: 'auto' });
  };

  return (
    <div className="datagrid-media">

      <div className="datagrid-media__toolbar">
        <input
          className="datagrid-media__filter"
          type="text"
          placeholder="タイトル・キーワードで絞り込み…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          autoComplete="off"
        />
        <span className="datagrid-media__count">{filtered.length}/{allItems.length}</span>
      </div>

      <div className="datagrid-media__header">
        <div className="datagrid-media__cell datagrid-media__cell--check" />
        <div className="datagrid-media__cell datagrid-media__cell--type">種別</div>
        <div className="datagrid-media__cell datagrid-media__cell--title">タイトル</div>
        <div className="datagrid-media__cell datagrid-media__cell--date">更新日</div>
      </div>

      <div
        className="datagrid-media__scroll"
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setFocusedId(null)}
      >
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const item = filtered[virtualRow.index];
            const Icon = CONTENT_ICONS[item.ContentType] ?? FileText;
            const isSelected = selected.has(item.ID);
            const isFocus = think?.ID === item.ID;
            const isSeedsBundle = seedsBundleIds.includes(item.ID);
            const isInWorking = workingIds.includes(item.ID);
            const isFocused = item.ID === focusedId;

            return (
              <div
                key={virtualRow.key}
                className={[
                  'datagrid-media__row',
                  isSelected ? 'datagrid-media__row--selected' : '',
                  isFocus ? 'datagrid-media__row--focus' : '',
                  isSeedsBundle ? 'datagrid-media__row--seeds-bundle' : '',
                  isInWorking ? 'datagrid-media__row--working' : '',
                  isFocused ? 'datagrid-media__row--focused' : '',
                ].join(' ')}
                onMouseEnter={() => setFocusedId(item.ID)}
                style={{
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => setSelected(new Set([item.ID]))}
              >
                <div className="datagrid-media__cell datagrid-media__cell--check">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {/* handled by onClick */ }}
                    onClick={e => toggleSelect(item.ID, e)}
                  />
                </div>
                <div className="datagrid-media__cell datagrid-media__cell--type">
                  <Icon size={12} />
                  <span>{CONTENT_LABELS[item.ContentType]}</span>
                </div>
                <div className="datagrid-media__cell datagrid-media__cell--title" title={item.Name}>
                  <HighlightedText text={item.Name} editorSettings={editorSettings} />
                </div>
                <div className="datagrid-media__cell datagrid-media__cell--date">
                  {formatDate(item.UpdateDate)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="datagrid-media__empty">
          {filter ? '一致するアイテムはありません' : 'データがありません'}
        </div>
      )}
    </div>
  );
}
