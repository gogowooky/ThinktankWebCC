import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronUp, ChevronDown, ChevronsUpDown, Plus, RefreshCcw } from 'lucide-react';
import { TTUIStateManager } from '../../../../views/TTUIStateManager';
import { TTApplication } from '../../../../views/TTApplication';
import { useAppUpdate } from '../../../../hooks/useAppUpdate';
import type { TTThink } from '../../../../models/TTThink';
import type { MediaProps } from '../types';
import type { TableSection, RawLine } from '../../../../utils/tableFormat';
import { parseTableContent, readColHeader, tableSectionToMetadataForm } from '../../../../utils/tableFormat';
import { isColorValue } from './gridColor';
import { ROWNUM_WIDTH, calcColumnWidth } from './gridSizing';
import { ColorSelectorPopup } from './ColorSelectorPopup';
import { HighlightedText } from './HighlightedText';
type SortDir = 'asc' | 'desc';

interface SortState { col: number; dir: SortDir; }

interface EditState { rowIdx: number; col: number; value: string; }

type DisplayRow = { rowIdx: number; row: string[]; };

interface TableGridViewProps {
  think: TTThink;
  onSave?: (content: string, thinkId?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  editorSettings?: MediaProps['editorSettings'];
}

export function TableGridView({ think, onSave, onDirtyChange, editorSettings }: TableGridViewProps) {
  const [sections, setSections] = useState<TableSection[]>(() => parseTableContent(think.Content, readColHeader(think.Metadata)));
  const [activeIdx, setActiveIdx] = useState(0);
  const [filter, setFilter] = useState('');
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [colorPicker, setColorPicker] = useState<{
    rect: DOMRect; value: string; onChange: (c: string) => void;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // カラム入れ替え用
  const [columnOrder, setColumnOrder] = useState<number[]>([]);
  const [draggingCol, setDraggingCol] = useState<number | null>(null);
  const [dropTargetCol, setDropTargetCol] = useState<number | null>(null);

  // カラム幅管理
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [resizingCol, setResizingCol] = useState<number | null>(null);

  const section = sections[Math.min(activeIdx, sections.length - 1)] ?? null;

  // 新規入力行
  const [newRowValues, setNewRowValues] = useState<string[]>(() =>
    Array(section?.columns.length ?? 0).fill('')
  );

  // think 切り替え時、および section のカラム数変更時にリセット
  useEffect(() => {
    const nextSections = parseTableContent(think.Content, readColHeader(think.Metadata));
    setSections(nextSections);

    // metadata から復元
    const dg = think.Metadata?.datagrid;
    const initialActiveIdx = (dg && typeof dg.activeIdx === 'number' && dg.activeIdx < nextSections.length) ? dg.activeIdx : 0;
    setActiveIdx(initialActiveIdx);

    setFilter('');
    setSortState(null);

    if (dg?.selectedCell) {
      const { rowIdx, col } = dg.selectedCell;
      const targetSec = nextSections[initialActiveIdx];
      const val = targetSec?.rows[rowIdx]?.[col] ?? '';
      setEditState({ rowIdx, col, value: val });
    } else {
      setEditState(null);
    }

    setIsDirty(false);

    // スクロール位置の復元
    if (scrollRef.current && dg) {
      if (typeof dg.scrollTop === 'number') {
        scrollRef.current.scrollTop = dg.scrollTop;
      }
      if (typeof dg.scrollLeft === 'number') {
        scrollRef.current.scrollLeft = dg.scrollLeft;
      }
    }
  }, [think.ID]);

  // think.Content が外部からリアルタイム更新された場合の処理
  useEffect(() => {
    if (isDirty) return;
    const nextSections = parseTableContent(think.Content, readColHeader(think.Metadata));
    setSections(nextSections);
  }, [think.Content, think.Metadata, isDirty]);

  // 状態が変わったら think.Metadata に同期する
  useEffect(() => {
    if (think) {
      if (!think.Metadata || typeof think.Metadata !== 'object') think.Metadata = {};
      const prevDg = think.Metadata.datagrid || {};
      think.Metadata.datagrid = {
        ...prevDg,
        activeIdx,
        selectedCell: editState ? { rowIdx: editState.rowIdx, col: editState.col } : null,
      };
    }
  }, [activeIdx, editState, think]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (think) {
      if (!think.Metadata || typeof think.Metadata !== 'object') think.Metadata = {};
      if (!think.Metadata.datagrid) think.Metadata.datagrid = {};
      think.Metadata.datagrid.scrollTop = e.currentTarget.scrollTop;
      think.Metadata.datagrid.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, [think]);

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

  const discussPanel = TTApplication.Instance.DiscussPanel;
  useAppUpdate(discussPanel);
  const { Display: cellDisplay, Position: cellPosition } = discussPanel.Table.CellContent;
  const isWrap = cellDisplay === 'FitToColumn';

  const rowVirtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 8,
  });

  // 折返し表示では行の高さが内容と列幅で変わるので、既測の高さを捨てて測り直させる
  useEffect(() => { rowVirtualizer.measure(); }, [isWrap, columnWidths, rowVirtualizer]);

  // ── ハンドラー ─────────────────────────────────────────────────────────

  const isUISettings = think.ID === TTUIStateManager.THINK_ID;

  const handleRefresh = useCallback(() => {
    const content = TTUIStateManager.instance.getLatestContent();
    if (!content) return;
    // 生成内容は本文の > 行に列ヘッダーを持つので、古い colheader を残すとそちらが優先されてしまう
    if (think.Metadata) delete think.Metadata.colheader;
    setSections(parseTableContent(content));
    onSave?.(content, think.ID);
  }, [onSave, think]);

  const handleSave = useCallback((overrideSection?: TableSection | React.MouseEvent) => {
    if (!onSave) return;
    const activeSection = (overrideSection && 'rows' in overrideSection) ? overrideSection : section;
    if (!activeSection) return;

    // columnOrder に従って列を物理的に並び替えた section を作成
    const reorderedSection: TableSection = {
      ...activeSection,
      columns: columnOrder.map(i => activeSection.columns[i] ?? ''),
      rows: activeSection.rows.map(row => columnOrder.map(i => row[i] ?? '')),
      rawLines: activeSection.rawLines,
    };

    // 旧形式（本文の > 行）もここで colheader へ移す。
    // section.title を使う（think.Name は _extractTitle で # が剥ぎ取られる場合があるため）
    const { content, colheader } = tableSectionToMetadataForm(activeSection.title, reorderedSection);
    if (!think.Metadata || typeof think.Metadata !== 'object') think.Metadata = {};
    think.Metadata.colheader = colheader;
    onSave(content, think.ID);

    // state を並び替え後の section で更新し、columnOrder をリセット
    setSections(parseTableContent(content, colheader));
    setColumnOrder(Array.from({ length: reorderedSection.columns.length }, (_, i) => i));
    setIsDirty(false);
  }, [onSave, section, columnOrder, think.ID]);

  const handleSortToggle = useCallback((col: number) => {
    setSortState(prev => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;
    });
  }, []);

  const commitEdit = useCallback((rowIdx: number, col: number, value: string) => {
    const currentSection = sections[activeIdx];
    if (!currentSection) return;
    const oldVal = currentSection.rows[rowIdx]?.[col];

    if (oldVal !== value) {
      const updatedRows = currentSection.rows.map((row, ri) => {
        if (ri !== rowIdx) return row;
        const next = [...row];
        next[col] = value;
        return next;
      });
      const overrideSection = {
        ...currentSection,
        rows: updatedRows,
      };
      handleSave(overrideSection);
    }
    setEditState(null);
  }, [activeIdx, sections, handleSave]);

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
    const newRowIdx = section.rows.length;
    const newRaw: RawLine = { type: 'data', text: '', rowIdx: newRowIdx };
    const overrideSection = {
      ...section,
      rows: [...section.rows, newRowValues],
      rawLines: [...section.rawLines, newRaw],
    };

    setNewRowValues(Array(section.columns.length).fill(''));
    handleSave(overrideSection);
  }, [newRowValues, section, handleSave]);

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
      if (editState) {
        commitEdit(editState.rowIdx, editState.col, editState.value);
        if (section) {
          const updatedRows = section.rows.map((row, ri) => {
            if (ri !== editState.rowIdx) return row;
            const next = [...row];
            next[editState.col] = editState.value;
            return next;
          });
          const overrideSection = {
            ...section,
            rows: updatedRows,
          };
          handleSave(overrideSection);
          return;
        }
      }
      handleSave();
    }
  }, [editState, commitEdit, handleSave, section]);

  if (sections.length === 0) {
    return (
      <div className="table-grid__empty-full">
        テーブルデータがありません。TextEditor で以下の形式で入力してください：<br />
        <code>&gt; 列名1,列名2,列名3</code>（DataGridで保存すると列ヘッダーとして colheader へ移ります）<br />
        <code>値1,値2,値3</code><br />
        <code># コメント行（# ; &gt; | で始まる行は保存時も保持）</code>
      </div>
    );
  }

  return (
    <div
      className={`table-grid table-grid--align-${cellPosition.toLowerCase()}${isWrap ? ' table-grid--wrap' : ''}`}
      onKeyDown={handleKeyDown}
    >

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
          autoComplete="off"
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
      <div className="table-grid__scroll" ref={scrollRef} onScroll={handleScroll}>
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
                    {sorted === 'asc' ? <ChevronUp size={11} /> :
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
                    if (e.key === 'Enter') { e.preventDefault(); handleNewRowCommit(); }
                    if (e.key === 'Escape') setNewRowValues(Array(colCount).fill(''));
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
                  data-index={vRow.index}
                  ref={isWrap ? rowVirtualizer.measureElement : undefined}
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '100%', height: isWrap ? undefined : vRow.size,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div className="table-grid__rownum-cell">{vRow.index + 1}</div>
                  {columnOrder.map((colIdx) => {
                    const isEditing = editState?.rowIdx === rowIdx && editState?.col === colIdx;
                    const cellVal = row?.[colIdx] ?? '';
                    if (isEditing && isColorValue(editState.value)) {
                      const alpha = editState.value.length === 9 ? editState.value.slice(7) : '';
                      return (
                        <div key={colIdx} className="table-grid__cell-color-wrap" style={{ width: columnWidths[colIdx] }}>
                          <button
                            type="button"
                            className="table-grid__cell-color-btn"
                            style={{ backgroundColor: editState.value.slice(0, 7) }}
                            onMouseDown={e => e.preventDefault()}
                            onClick={e => setColorPicker({
                              rect: e.currentTarget.getBoundingClientRect(),
                              value: editState.value,
                              onChange: c => setEditState(prev => prev ? { ...prev, value: c + alpha } : null),
                            })}
                          />
                          <input
                            type="text"
                            className="table-grid__cell-color-text"
                            autoFocus
                            autoComplete="off"
                            value={editState.value}
                            onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                            onBlur={() => commitEdit(rowIdx, colIdx, editState.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); commitEdit(rowIdx, colIdx, editState.value); }
                              if (e.key === 'Escape') setEditState(null);
                            }}
                          />
                        </div>
                      );
                    }
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
                        {isColorValue(cellVal) && (
                          <button
                            type="button"
                            className="table-grid__color-swatch table-grid__color-swatch--btn"
                            style={{ backgroundColor: cellVal }}
                            onClick={e => {
                              e.stopPropagation();
                              const alpha = cellVal.length === 9 ? cellVal.slice(7) : '';
                              setColorPicker({
                                rect: e.currentTarget.getBoundingClientRect(),
                                value: cellVal,
                                onChange: c => commitEdit(rowIdx, colIdx, c + alpha),
                              });
                            }}
                          />
                        )}
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

      {colorPicker && (
        <ColorSelectorPopup
          value={colorPicker.value}
          rect={colorPicker.rect}
          onChange={colorPicker.onChange}
          onClose={() => setColorPicker(null)}
        />
      )}

    </div>
  );
}
