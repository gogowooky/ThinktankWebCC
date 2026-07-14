/**
 * DataGridMedia.tsx
 * テーブル形式一覧メディア。
 *
 * - think.ContentType === 'table' → TableGridView でスプレッドシート表示
 * - think が Thought → GetThinksForThought の結果を表示
 * - それ以外 → Vault の全 Think（thought 除く）を表示
 */

import { useRef, useState, useMemo, useCallback, useEffect, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
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
import { applyFilter } from '../../ThinktankPanel/ThoughtsList';
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

const COLOR_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
function isColorValue(v: string): boolean { return COLOR_REGEX.test(v.trim()); }

// ── カラー変換ユーティリティ ──────────────────────────────────────────────────

function hexToHsv(hex: string): { h: number; s: number; v: number; a: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max, a };
}

function hsvToHex(h: number, s: number, v: number, a = 1, withAlpha = false): string {
  const f  = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  const x2 = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${x2(f(5))}${x2(f(3))}${x2(f(1))}${withAlpha ? x2(a) : ''}`;
}

// ── ColorSelectorPopup ───────────────────────────────────────────────────────

function ColorSelectorPopup({ value, rect, onChange, onClose }: {
  value: string; rect: DOMRect;
  onChange: (c: string) => void; onClose: () => void;
}) {
  const hasAlpha  = value.length === 9;
  const [init]    = useState(() => hexToHsv(value));
  const [h, setH] = useState(init.h);
  const [s, setS] = useState(init.s);
  const [v, setV] = useState(init.v);
  const [a, setA] = useState(init.a);
  const [hexInput, setHexInput] = useState(value);

  // drag 中に最新値を参照するためのref
  const hR = useRef(init.h), sR = useRef(init.s), vR = useRef(init.v), aR = useRef(init.a);

  const popupRef  = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const hueRef    = useRef<HTMLDivElement>(null);
  const alphaRef  = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: rect.bottom + 4, left: rect.left });

  useLayoutEffect(() => {
    if (!popupRef.current) return;
    const { height, width } = popupRef.current.getBoundingClientRect();
    setPos({
      top:  rect.bottom + 4 + height > window.innerHeight ? rect.top - height - 4 : rect.bottom + 4,
      left: Math.max(4, Math.min(rect.left, window.innerWidth - width - 4)),
    });
  }, [rect]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const emit = useCallback((nh: number, ns: number, nv: number, na: number) => {
    const c = hsvToHex(nh, ns, nv, na, hasAlpha);
    setHexInput(c);
    onChange(c);
  }, [onChange, hasAlpha]);

  const makeDragger = (fn: (e: MouseEvent) => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn(e.nativeEvent);
    const mv = (ev: MouseEvent) => fn(ev);
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  };

  const onSquare = makeDragger(e => {
    if (!squareRef.current) return;
    const r = squareRef.current.getBoundingClientRect();
    const ns = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const nv = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    sR.current = ns; vR.current = nv; setS(ns); setV(nv);
    emit(hR.current, ns, nv, aR.current);
  });

  const onHue = makeDragger(e => {
    if (!hueRef.current) return;
    const r  = hueRef.current.getBoundingClientRect();
    const nh = Math.max(0, Math.min(360, (e.clientX - r.left) / r.width * 360));
    hR.current = nh; setH(nh);
    emit(nh, sR.current, vR.current, aR.current);
  });

  const onAlpha = makeDragger(e => {
    if (!alphaRef.current) return;
    const r  = alphaRef.current.getBoundingClientRect();
    const na = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    aR.current = na; setA(na);
    emit(hR.current, sR.current, vR.current, na);
  });

  const onHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);
    if (COLOR_REGEX.test(val)) {
      const p = hexToHsv(val);
      hR.current = p.h; sR.current = p.s; vR.current = p.v; aR.current = p.a;
      setH(p.h); setS(p.s); setV(p.v); setA(p.a);
      onChange(val);
    }
  };

  const hueColor     = `hsl(${h}, 100%, 50%)`;
  const previewColor = hsvToHex(h, s, v, a, hasAlpha);

  return (
    <div
      ref={popupRef}
      className="color-selector-popup"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* グラデーション正方形 */}
      <div
        ref={squareRef}
        className="color-selector-popup__square"
        style={{ background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, ${hueColor})` }}
        onMouseDown={onSquare}
      >
        <div className="color-selector-popup__dot" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
      </div>

      {/* 色相スライダー */}
      <div ref={hueRef} className="color-selector-popup__slider" onMouseDown={onHue}>
        <div className="color-selector-popup__hue-track" />
        <div className="color-selector-popup__thumb" style={{ left: `${h / 360 * 100}%` }} />
      </div>

      {/* 透明度スライダー（8桁hexのみ） */}
      {hasAlpha && (
        <div ref={alphaRef} className="color-selector-popup__slider" onMouseDown={onAlpha}>
          <div className="color-selector-popup__checker" />
          <div className="color-selector-popup__alpha-track" style={{ background: `linear-gradient(to right, transparent, ${hsvToHex(h, s, v)})` }} />
          <div className="color-selector-popup__thumb" style={{ left: `${a * 100}%` }} />
        </div>
      )}

      {/* プレビュー + hex入力 */}
      <div className="color-selector-popup__bottom">
        <div className="color-selector-popup__preview" style={{ backgroundColor: previewColor }} />
        <input
          className="color-selector-popup__hex"
          value={hexInput}
          onChange={onHexChange}
          spellCheck={false}
          maxLength={9}
        />
      </div>
    </div>
  );
}

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
  onSave?:        (content: string, thinkId?: string) => void;
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

  const section  = sections[Math.min(activeIdx, sections.length - 1)] ?? null;

  // 新規入力行
  const [newRowValues, setNewRowValues] = useState<string[]>(() =>
    Array(section?.columns.length ?? 0).fill('')
  );

  // think 切り替え時、および section のカラム数変更時にリセット
  useEffect(() => {
    const nextSections = parseTableContent(think.Content);
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
    const nextSections = parseTableContent(think.Content);
    setSections(nextSections);
  }, [think.Content, isDirty]);

  // 状態が変わったら think.Metadata に同期する
  useEffect(() => {
    if (think) {
      if (!think.Metadata) think.Metadata = {};
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
      if (!think.Metadata) think.Metadata = {};
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
    onSave?.(content, think.ID);
  }, [onSave, think.ID]);

  const handleSave = useCallback((overrideSection?: TableSection | React.MouseEvent) => {
    if (!onSave) return;
    const activeSection = (overrideSection && 'rows' in overrideSection) ? overrideSection : section;
    if (!activeSection) return;

    // columnOrder に従って列を物理的に並び替えた section を作成
    const reorderedSection: TableSection = {
      ...activeSection,
      columns: columnOrder.map(i => activeSection.columns[i] ?? ''),
      rows:    activeSection.rows.map(row => columnOrder.map(i => row[i] ?? '')),
      rawLines: activeSection.rawLines,
    };

    // section.title を使う（think.Name は _extractTitle で # が剥ぎ取られる場合があるため）
    onSave(tableSectionToContent(activeSection.title, reorderedSection), think.ID);

    // state を並び替え後の section で更新し、columnOrder をリセット
    setSections([reorderedSection]);
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
      rows:     [...section.rows, newRowValues],
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
    return applyFilter(allItems, filter);
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

export interface DataGridMediaRef { focus: () => void; }

export const DataGridMedia = forwardRef<DataGridMediaRef, MediaProps>(function DataGridMedia(props, ref) {
  const datagridRootRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const input = datagridRootRef.current?.querySelector<HTMLInputElement>(
        '.table-grid__filter, .datagrid-media__filter'
      );
      input?.focus();
    },
  }));

  if (props.think?.ContentType === 'table') {
    return (
      <div ref={datagridRootRef} style={{ display: 'contents' }}>
        <TableGridView
          think={props.think}
          onSave={props.onSave}
          onDirtyChange={props.onDirtyChange}
          editorSettings={props.editorSettings}
        />
      </div>
    );
  }
  return (
    <div ref={datagridRootRef} style={{ display: 'contents' }}>
      <ThinkListMedia {...props} />
    </div>
  );
});
