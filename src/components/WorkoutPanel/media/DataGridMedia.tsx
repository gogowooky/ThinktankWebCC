/**
 * DataGridMedia.tsx
 * テーブル形式一覧メディア。
 *
 * - think.ContentType === 'table' → TableGridView でスプレッドシート表示
 * - think が Thought → GetThinksForThought の結果を表示
 * - それ以外 → Vault の全 Think（thought 除く）を表示
 */

import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  FileText, Lightbulb, Table, Link, MessageCircle, Globe,
  ChevronUp, ChevronDown, ChevronsUpDown, Plus, RefreshCcw,
  type LucideIcon,
} from 'lucide-react';
import { TTUIStateManager } from '../../../views/TTUIStateManager';
import type { TTThink } from '../../../models/TTThink';
import type { ContentType } from '../../../types';
import type { MediaProps } from './types';
import type { TableSection, RawLine } from '../../../utils/tableFormat';
import { useHighlight } from '../../../contexts/HighlightContext';
import { parseTableContent, tableSectionToContent } from '../../../utils/tableFormat';
import './DataGridMedia.css';

// ContentType アイコンマッピング
const CONTENT_ICONS: Record<ContentType, LucideIcon> = {
  memo:    FileText,
  thought: Lightbulb,
  table:   Table,
  links:   Link,
  chat:    MessageCircle,
  nettext: Globe,
};

const CONTENT_LABELS: Record<ContentType, string> = {
  memo:    'メモ',
  thought: '思考',
  table:   'テーブル',
  links:   'リンク',
  chat:    'チャット',
  nettext: 'Web文書',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return dateStr.slice(0, 10);
}

// ── TableGridView ────────────────────────────────────────────────────────────

const ROWNUM_WIDTH  = 40;
const AUTO_CHAR_W   = 7;   // 12px フォントのおおよその文字幅(px)
const AUTO_MIN_W    = 60;
const AUTO_CAP_CHARS = 40; // 極端に長い値にはカラム幅を合わせない

function calcColumnWidth(col: string, rows: string[][], colIdx: number): number {
  const headerLen  = col.length;
  const maxDataLen = rows.reduce((max, row) => Math.max(max, (row[colIdx] ?? '').length), 0);
  const effLen     = Math.max(headerLen, Math.min(maxDataLen, AUTO_CAP_CHARS));
  return Math.max(AUTO_MIN_W, effLen * AUTO_CHAR_W + 28); // +28: ソートアイコン+パディング
}

type SortDir  = 'asc' | 'desc';
interface SortState { col: number; dir: SortDir; }
interface EditState { rowIdx: number; col: number; value: string; }
type DisplayRow = { rowIdx: number; row: string[] };

interface TableGridViewProps {
  think:          TTThink;
  onSave?:        (content: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  editorSettings?: MediaProps['editorSettings'];
}

function HighlightedText({ text, editorSettings }: { text: string; editorSettings?: MediaProps['editorSettings'] }) {
  if (!editorSettings?.highlightWord) return <>{text}</>;

  const groups = editorSettings.highlightWord.split(',').slice(0, 5);
  let segments: { text: string; groupIdx?: number }[] = [{ text }];

  groups.forEach((groupStr, groupIdx) => {
    const words = groupStr.split(' ').map(w => w.trim()).filter(w => w.length > 0);
    if (words.length === 0) return;

    const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedWords.join('|')})`, 'g');

    const nextSegments: { text: string; groupIdx?: number }[] = [];
    segments.forEach(seg => {
      if (seg.groupIdx !== undefined) {
        nextSegments.push(seg);
        return;
      }
      const parts = seg.text.split(regex);
      parts.forEach((part, i) => {
        if (!part) return;
        if (i % 2 === 1) {
          nextSegments.push({ text: part, groupIdx });
        } else {
          nextSegments.push({ text: part });
        }
      });
    });
    segments = nextSegments;
  });

  return (
    <>
      {segments.map((seg, i) => (
        seg.groupIdx !== undefined ? (
          <span
            key={i}
            className={`datagrid-highlight custom-highlight-g${seg.groupIdx + 1}`}
            style={{
              backgroundColor: editorSettings.highlightStyles[seg.groupIdx]?.backgroundColor,
              color: editorSettings.highlightStyles[seg.groupIdx]?.color
            }}
          >
            {seg.text}
          </span>
        ) : (
          seg.text
        )
      ))}
    </>
  );
}

function TableGridView({ think, onSave, onDirtyChange, editorSettings }: TableGridViewProps) {
  const [sections,   setSections]   = useState<TableSection[]>(() => parseTableContent(think.Content));
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [filter,     setFilter]     = useState('');
  const [sortState,  setSortState]  = useState<SortState | null>(null);
  const [editState,  setEditState]  = useState<EditState | null>(null);
  const [isDirty,    setIsDirty]    = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // カラム入れ替え用
  const [columnOrder, setColumnOrder] = useState<number[]>([]);
  const [draggingCol, setDraggingCol] = useState<number | null>(null);
  const [dropTargetCol, setDropTargetCol] = useState<number | null>(null);

  // カラム幅管理
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [resizingCol, setResizingCol] = useState<number | null>(null);

  const section  = sections[Math.min(activeIdx, sections.length - 1)] ?? null;

  // 新規入力行
  const [newRowValues, setNewRowValues] = useState<string[]>(() =>
    Array(section?.columns.length ?? 0).fill('')
  );

  // think 切り替え時、および section のカラム数変更時にリセット
  useEffect(() => {
    setSections(parseTableContent(think.Content));
    setActiveIdx(0);
    setFilter('');
    setSortState(null);
    setEditState(null);
    setIsDirty(false);
  }, [think.ID]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (section) {
      setColumnOrder(Array.from({ length: section.columns.length }, (_, i) => i));
      setColumnWidths(section.columns.map((col, ci) => calcColumnWidth(col, section.rows, ci)));
      setNewRowValues(Array.from({ length: section.columns.length }, () => ''));
    } else {
      setColumnOrder([]);
      setColumnWidths([]);
      setNewRowValues([]);
    }
  }, [section?.columns.length, activeIdx, think.ID]);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const colCount = section?.columns.length ?? 0;
  const innerWidth = ROWNUM_WIDTH + columnWidths.reduce((sum, w) => sum + w, 0);

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (!section) return [];
    const q = filter.trim().toLowerCase();
    let rows: DisplayRow[] = section.rows.map((row, rowIdx) => ({ rowIdx, row }));
    if (q) rows = rows.filter(({ row }) => row.some(cell => cell.toLowerCase().includes(q)));
    if (sortState) {
      const { col, dir } = sortState;
      rows = [...rows].sort((a, b) => {
        const av = a.row[col] ?? '';
        const bv = b.row[col] ?? '';
        const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [section, filter, sortState]);

  const rowVirtualizer = useVirtualizer({
    count:            displayRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     () => 28,
    overscan:         8,
  });

  // ── ハンドラー ─────────────────────────────────────────────────────────

  const isUISettings = think.ID === TTUIStateManager.THINK_ID;

  const handleRefresh = useCallback(() => {
    const content = TTUIStateManager.instance.getLatestContent();
    if (!content) return;
    setSections(parseTableContent(content));
    onSave?.(content);
  }, [onSave]);

  const handleSave = useCallback(() => {
    if (!onSave || !section) return;

    // columnOrder に従って列を物理的に並び替えた section を作成
    const reorderedSection: TableSection = {
      ...section,
      columns: columnOrder.map(i => section.columns[i] ?? ''),
      rows:    section.rows.map(row => columnOrder.map(i => row[i] ?? '')),
      rawLines: section.rawLines,
    };

    // section.title を使う（think.Name は _extractTitle で # が剥ぎ取られる場合があるため）
    onSave(tableSectionToContent(section.title, reorderedSection));

    // state を並び替え後の section で更新し、columnOrder をリセット
    setSections([reorderedSection]);
    setColumnOrder(Array.from({ length: reorderedSection.columns.length }, (_, i) => i));
    setIsDirty(false);
  }, [onSave, section, columnOrder]);

  const handleSortToggle = useCallback((col: number) => {
    setSortState(prev => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;
    });
  }, []);

  const commitEdit = useCallback((rowIdx: number, col: number, value: string) => {
    setSections(prev => prev.map((s, si) => {
      if (si !== activeIdx) return s;
      return {
        ...s,
        rows: s.rows.map((row, ri) => {
          if (ri !== rowIdx) return row;
          const next = [...row];
          next[col] = value;
          return next;
        }),
      };
    }));
    setIsDirty(true);
    setEditState(null);
  }, [activeIdx]);

  const handleCellClick = useCallback((rowIdx: number, col: number, value: string) => {
    setEditState({ rowIdx, col, value });
  }, []);

  const handleNewRowChange = useCallback((colIdx: number, value: string) => {
    setNewRowValues(prev => {
      const next = [...prev];
      next[colIdx] = value;
      return next;
    });
  }, []);

  const handleNewRowCommit = useCallback(() => {
    if (!section || newRowValues.every(v => v === '')) return;
    setSections(prev => prev.map((s, si) => {
      if (si !== activeIdx) return s;
      const newRowIdx = s.rows.length;
      const newRaw: RawLine = { type: 'data', text: '', rowIdx: newRowIdx };
      return {
        ...s,
        rows:     [...s.rows, newRowValues],      // ファイル末尾に追加
        rawLines: [...s.rawLines, newRaw],
      };
    }));
    setNewRowValues(Array(section.columns.length).fill(''));
    setIsDirty(true);
  }, [newRowValues, activeIdx, section]);

  const handleAddRow = useCallback(() => {
    setSections(prev => prev.map((s, si) => {
      if (si !== activeIdx) return s;
      const newRowIdx = s.rows.length;
      const newRaw: RawLine = { type: 'data', text: '', rowIdx: newRowIdx };
      return {
        ...s,
        rows:     [...s.rows, Array(s.columns.length).fill('')],  // ファイル末尾に追加
        rawLines: [...s.rawLines, newRaw],
      };
    }));
    setIsDirty(true);
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 50);
  }, [activeIdx]);

  // ── カラムドラッグ＆ドロップ ──────────────────────────────────────────

  const handleColumnDragStart = (e: React.DragEvent, idx: number) => {
    setDraggingCol(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggingCol === null || draggingCol === idx) return;
    setDropTargetCol(idx);
  };

  const handleColumnDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggingCol === null || draggingCol === targetIdx) {
      setDraggingCol(null);
      setDropTargetCol(null);
      return;
    }

    const nextOrder = [...columnOrder];
    const dragItem = nextOrder[draggingCol];
    nextOrder.splice(draggingCol, 1);
    nextOrder.splice(targetIdx, 0, dragItem);
    
    setColumnOrder(nextOrder);
    setIsDirty(true);
    setDraggingCol(null);
    setDropTargetCol(null);
  };

  // ── カラムリサイズ ──────────────────────────────────────────

  const handleResizeStart = (e: React.MouseEvent, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colIdx);

    const startX = e.pageX;
    const startWidth = columnWidths[colIdx];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.pageX - startX;
      setColumnWidths(prev => {
        const next = [...prev];
        next[colIdx] = Math.max(40, startWidth + delta);
        return next;
      });
    };

    const onMouseUp = () => {
      setResizingCol(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (editState) commitEdit(editState.rowIdx, editState.col, editState.value);
      handleSave();
    }
  }, [editState, commitEdit, handleSave]);

  if (sections.length === 0) {
    return (
      <div className="table-grid__empty-full">
        テーブルデータがありません。TextEditor で以下の形式で入力してください：<br />
        <code>&gt; 列名1,列名2,列名3</code><br />
        <code>値1,値2,値3</code><br />
        <code># コメント行（# または ; で始まる行は保存時も保持）</code>
      </div>
    );
  }

  return (
    <div className="table-grid" onKeyDown={handleKeyDown}>

      {/* セクションタブ */}
      {sections.length > 1 && (
        <div className="table-grid__tabs">
          {sections.map((s, i) => (
            <button
              key={i}
              className={`table-grid__tab${i === activeIdx ? ' table-grid__tab--active' : ''}`}
              onClick={() => setActiveIdx(i)}
            >
              {s.title || `テーブル${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* フィルター */}
      <div className="table-grid__toolbar">
        <input
          className="table-grid__filter"
          type="text"
          placeholder="絞り込み…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {isUISettings && (
          <button className="table-grid__refresh-btn" onClick={handleRefresh} data-tip="UIから更新" data-tip-side="left">
            <RefreshCcw size={12} />
          </button>
        )}
        <span className="table-grid__count">{displayRows.length}/{section?.rows.length ?? 0}</span>
        {isDirty && (
          <button className="table-grid__save-btn" onClick={handleSave} title="保存 (Ctrl+S)">
            保存
          </button>
        )}
      </div>

      {/* スクロール領域 */}
      <div className="table-grid__scroll" ref={scrollRef}>
        <div style={{ minWidth: innerWidth }}>

          {/* 固定ヘッダー */}
          <div className="table-grid__header-row">
            <div className="table-grid__rownum-cell" />
            {columnOrder.map((colIdx, displayIdx) => {
              const col = section?.columns[colIdx];
              const sorted = sortState?.col === colIdx ? sortState.dir : null;
              const isDragging = draggingCol === displayIdx;
              const isDropTarget = dropTargetCol === displayIdx;
              
              // ドラッグ方向に応じてガイドの位置（左か右か）を決める
              const dropSide = isDropTarget 
                ? (displayIdx < (draggingCol ?? 0) ? 'left' : 'right')
                : null;

              return (
                <div
                  key={`${colIdx}-${displayIdx}`}
                  className={[
                    "table-grid__header-cell",
                    "table-grid__header-cell--sortable",
                    isDragging && "table-grid__header-cell--dragging",
                    dropSide === 'left' && "table-grid__header-cell--drop-target",
                    dropSide === 'right' && "table-grid__header-cell--drop-target-right",
                  ].filter(Boolean).join(" ")}
                  style={{ width: columnWidths[colIdx] }}
                  data-tip={col}
                  data-tip-side="bottom"
                  draggable={resizingCol === null}
                  onDragStart={(e) => handleColumnDragStart(e, displayIdx)}
                  onDragOver={(e) => handleColumnDragOver(e, displayIdx)}
                  onDragEnd={() => { setDraggingCol(null); setDropTargetCol(null); }}
                  onDrop={(e) => handleColumnDrop(e, displayIdx)}
                  onClick={() => handleSortToggle(colIdx)}
                >
                  <span className="table-grid__header-text">{col}</span>
                  <span className="table-grid__sort-icon">
                    {sorted === 'asc'  ? <ChevronUp   size={11} /> :
                     sorted === 'desc' ? <ChevronDown size={11} /> :
                                         <ChevronsUpDown size={11} style={{ opacity: 0.3 }} />}
                  </span>
                  <div
                    className={`table-grid__resizer ${resizingCol === colIdx ? 'table-grid__resizer--resizing' : ''}`}
                    onMouseDown={(e) => handleResizeStart(e, colIdx)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })}
          </div>

          {/* 新規入力行 */}
          {colCount > 0 && (
            <div className="table-grid__new-row">
              <div className="table-grid__rownum-cell table-grid__rownum-cell--new">
                <Plus size={12} />
              </div>
              {columnOrder.map((colIdx) => (
                <input
                  key={colIdx}
                  className="table-grid__new-row-cell"
                  style={{ width: columnWidths[colIdx] }}
                  value={newRowValues[colIdx] ?? ''}
                  placeholder={section?.columns[colIdx]}
                  onChange={e => handleNewRowChange(colIdx, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleNewRowCommit();
                    }
                    if (e.key === 'Escape') {
                      setNewRowValues(Array(colCount).fill(''));
                    }
                  }}
                />
              ))}
            </div>
          )}

          {/* 仮想スクロール本体 */}
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map(vRow => {
              const { rowIdx, row } = displayRows[vRow.index];
              return (
                <div
                  key={vRow.key}
                  className="table-grid__data-row"
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '100%', height: vRow.size,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div className="table-grid__rownum-cell">{vRow.index + 1}</div>
                  {columnOrder.map((colIdx) => {
                    const isEditing = editState?.rowIdx === rowIdx && editState?.col === colIdx;
                    const cellVal   = row?.[colIdx] ?? '';
                    return isEditing ? (
                      <input
                        key={colIdx}
                        className="table-grid__cell-input"
                        style={{ width: columnWidths[colIdx] }}
                        value={editState.value}
                        autoFocus
                        onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                        onBlur={() => commitEdit(rowIdx, colIdx, editState.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(rowIdx, colIdx, editState.value); }
                          if (e.key === 'Escape') setEditState(null);
                        }}
                      />
                    ) : (
                      <div
                        key={colIdx}
                        className="table-grid__data-cell"
                        style={{ width: columnWidths[colIdx] }}
                        title={cellVal}
                        onClick={() => handleCellClick(rowIdx, colIdx, cellVal)}
                      >
                        <HighlightedText text={cellVal} editorSettings={editorSettings} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

        </div>

        {displayRows.length === 0 && (
          <div className="table-grid__empty">
            {filter ? '一致する行はありません' : 'データ行がありません'}
          </div>
        )}
      </div>

      {/* フッター：行追加 */}
      <div className="table-grid__footer">
        <button className="table-grid__add-row-btn" onClick={handleAddRow}>
          <Plus size={12} />
          行を追加
        </button>
      </div>

    </div>
  );
}

// ── ThinkListMedia（thought/vault 一覧）────────────────────────────────────

function ThinkListMedia({ think, vault, editorSettings }: MediaProps) {
  const [filter,    setFilter]   = useState('');
  const [selected,  setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const scrollRef                = useRef<HTMLDivElement>(null);
  const { overviewThoughtIds, workoutIds } = useHighlight();

  const [allItems, setAllItems] = useState<TTThink[]>(() => {
    if (think?.ContentType === 'thought') return vault.GetThinksForThought(think.ID);
    return vault.GetThinks().filter(t => t.ContentType !== 'thought');
  });

  useEffect(() => {
    if (think?.ContentType !== 'thought') {
      setAllItems(vault.GetThinks().filter(t => t.ContentType !== 'thought'));
      return;
    }
    vault.GetThinksForThoughtAsync(think.ID).then(setAllItems);
  }, [think?.ID, vault]);

  const filtered = useMemo<TTThink[]>(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(t =>
      t.Name.toLowerCase().includes(q) ||
      t.Keywords.toLowerCase().includes(q)
    );
  }, [allItems, filter]);

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
            const item   = filtered[virtualRow.index];
            const Icon   = CONTENT_ICONS[item.ContentType] ?? FileText;
            const isSelected        = selected.has(item.ID);
            const isFocus           = think?.ID === item.ID;
            const isOverviewThought = overviewThoughtIds.includes(item.ID);
            const isInWorkout       = workoutIds.includes(item.ID);
            const isFocused         = item.ID === focusedId;

            return (
              <div
                key={virtualRow.key}
                className={[
                  'datagrid-media__row',
                  isSelected        ? 'datagrid-media__row--selected'        : '',
                  isFocus           ? 'datagrid-media__row--focus'           : '',
                  isOverviewThought ? 'datagrid-media__row--overview-thought' : '',
                  isInWorkout       ? 'datagrid-media__row--workout'         : '',
                  isFocused         ? 'datagrid-media__row--focused'         : '',
                ].join(' ')}
                onMouseEnter={() => setFocusedId(item.ID)}
                style={{
                  position:  'absolute',
                  top: 0, left: 0,
                  width:     '100%',
                  height:    virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => setSelected(new Set([item.ID]))}
              >
                <div className="datagrid-media__cell datagrid-media__cell--check">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {/* handled by onClick */}}
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

// ── DataGridMedia ──────────────────────────────────────────────────────────

export function DataGridMedia(props: MediaProps) {
  if (props.think?.ContentType === 'table') {
    return (
      <TableGridView
        think={props.think}
        onSave={props.onSave}
        onDirtyChange={props.onDirtyChange}
        editorSettings={props.editorSettings}
      />
    );
  }
  return <ThinkListMedia {...props} />;
}
