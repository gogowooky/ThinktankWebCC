/**
 * WorkoutPanel.tsx
 * BSP ツリー型レイアウトで WorkoutArea を再帰的にレンダリングする。
 *
 * レイアウト構造（左→右）:
 *   [WorkoutTabBar 40px] [WorkoutSettingArea? + Splitter] [コンテンツ flex:1]
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { TTShortcutManager } from '../../views/TTShortcutManager';
import { TTActions } from '../../views/TTActions';
import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import type { TTVault } from '../../models/TTVault';
import type { LayoutNode, SplitNodeData, WorkoutViewMode } from '../../views/TTWorkoutPanel';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { Splitter } from '../Layout/Splitter';
import { PanelArea } from '../Layout/PanelArea';
import { WorkoutHSplitter } from './WorkoutHSplitter';
import { WorkoutArea } from './WorkoutArea';
import { WorkoutAreaEmpty } from './WorkoutAreaEmpty';
import { WorkoutTabBar } from './WorkoutTabBar';
import { WorkoutSettingArea } from './WorkoutSettingArea';
import type { WorkoutSettingAreaRef } from './WorkoutSettingArea';
import { extractLinkDrop, shouldAllowLocalDrop } from './WorkoutMenuRibbon';
import { parseTableContent, sectionToCsv, sectionsToTableContent, parseCsvLine } from '../../utils/tableFormat';
import { serializeChat, chatContentTitle, TODO_CHAT_PREFIX_WORKOUT } from '../../utils/thinkFormat';
import type { TTThink } from '../../models/TTThink';
import type { SettingsType } from './WorkoutTabBar';
import type { MediaType, ChatMessage } from '../../types';
import './WorkoutPanel.css';

type DropEdgeDir = 'left' | 'right' | 'up' | 'down';

// 幅均等化: v-split ノードに対して、両サブツリーの「幅スロット数」の比率を計算してセット
// 幅スロット数: v-split は加算、h-split は両側同幅なので max
function countWidthSlots(node: import('../../views/TTWorkoutPanel').LayoutNode): number {
  if (node.type === 'leaf') return 1;
  if (node.direction === 'v') return countWidthSlots(node.first) + countWidthSlots(node.second);
  return Math.max(countWidthSlots(node.first), countWidthSlots(node.second));
}

// 高さ均等化: h-split ノードに対して、両サブツリーの「高さスロット数」の比率を計算してセット
function countHeightSlots(node: import('../../views/TTWorkoutPanel').LayoutNode): number {
  if (node.type === 'leaf') return 1;
  if (node.direction === 'h') return countHeightSlots(node.first) + countHeightSlots(node.second);
  return Math.max(countHeightSlots(node.first), countHeightSlots(node.second));
}

function computeEqualWidthRatios(
  node: import('../../views/TTWorkoutPanel').LayoutNode,
  out: Record<string, number>,
): void {
  if (node.type === 'leaf') return;
  if (node.direction === 'v') {
    const f = countWidthSlots(node.first);
    const s = countWidthSlots(node.second);
    out[node.id] = f / (f + s);
  }
  computeEqualWidthRatios(node.first, out);
  computeEqualWidthRatios(node.second, out);
}

function computeEqualHeightRatios(
  node: import('../../views/TTWorkoutPanel').LayoutNode,
  out: Record<string, number>,
): void {
  if (node.type === 'leaf') return;
  if (node.direction === 'h') {
    const f = countHeightSlots(node.first);
    const s = countHeightSlots(node.second);
    out[node.id] = f / (f + s);
  }
  computeEqualHeightRatios(node.first, out);
  computeEqualHeightRatios(node.second, out);
}


const DEFAULT_SETTINGS_WIDTH = 180;
const MIN_SETTINGS_WIDTH     = 120;
const MAX_SETTINGS_WIDTH     = 400;

/**
 * 画面座標(clientX/clientY)からMonacoエディタ上のモデル位置を求める。
 * editor.getTargetAtClientPoint() を優先するが、環境（ブラウザ/描画パイプライン）依存で
 * ヒットテストが機能しないケースがあるため、スクロール位置・行の高さ・文字幅から
 * 幾何計算で求めるフォールバックを用意する（等幅フォント前提のため厳密ではないが、
 * ドラッグ中のカーソル追従プレビュー用途としては十分な精度）。
 */
function clientPointToPosition(editor: any, clientX: number, clientY: number): { lineNumber: number; column: number } | null {
  const viaApi = editor.getTargetAtClientPoint?.(clientX, clientY)?.position;
  if (viaApi) return viaApi;

  const domNode = editor.getDomNode?.();
  const model = editor.getModel?.();
  const monacoNs = (window as any).monaco;
  if (!domNode || !model || !monacoNs) return null;

  const rect = domNode.getBoundingClientRect();
  const layoutInfo = editor.getLayoutInfo();
  const lineHeight = editor.getOption(monacoNs.editor.EditorOption.lineHeight) || 20;
  const fontInfo = editor.getOption(monacoNs.editor.EditorOption.fontInfo);
  const charWidth = fontInfo?.typicalHalfwidthCharacterWidth || 7;

  const relY = clientY - rect.top + editor.getScrollTop();
  const lineNumber = Math.min(model.getLineCount(), Math.max(1, Math.floor(relY / lineHeight) + 1));

  const relX = clientX - rect.left - layoutInfo.contentLeft + editor.getScrollLeft();
  const lineLength = model.getLineContent(lineNumber).length;
  const column = Math.min(lineLength + 1, Math.max(1, Math.round(relX / charWidth) + 1));

  return { lineNumber, column };
}

/**
 * 画面座標(clientX/clientY)の直下にある WorkoutArea の ID を返す（無ければ null）。
 * computeDropOverlay() の isOuter（パネル外縁判定）とは独立したヒットテスト。
 * Alt+ThinkFileDrag（Insert）の対象判定は、パネル端に近いPane（よくあるレイアウト）でも
 * 常にそのPaneをInsert対象にできるよう、isOuterによる新規Pane追加ゾーン判定より
 * 優先してこちらを使う必要がある。
 */
function findWorkoutAreaIdAtPoint(clientX: number, clientY: number, excludeAreaId?: string): string | null {
  const els = document.elementsFromPoint(clientX, clientY);
  const areaEl = els.find(el =>
    el.classList.contains('workout-area') &&
    el.getAttribute('data-area-id') !== excludeAreaId,
  ) as HTMLElement | undefined;
  return areaEl?.getAttribute('data-area-id') ?? null;
}

// ── shared props（再帰コンポーネントに引き回す）───────────────────────

interface SharedProps {
  areas:            Map<string, TTWorkoutArea>;
  vault:            TTVault;
  focusedAreaId:    string | null;
  dragId:           string | null;
  overAreaId:       string | null;
  splitRatios:      Record<string, number>;
  isExternalDrag:   boolean;
  onFocus:          (areaId: string) => void;
  onDragStart:      (e: React.MouseEvent, areaId: string) => void;
  onDragEnter:      (areaId: string) => void;
  onDragLeave:      () => void;
  onMediaType:      (areaId: string, type: MediaType) => void;
  onClose:          (areaId: string) => void;
  onSplitRatio:     (nodeId: string, ratio: number) => void;
}

// ── LayoutView（再帰）───────────────────────────────────────────────────

function LayoutView({ node, shared }: { node: LayoutNode; shared: SharedProps }) {
  if (node.type === 'leaf') {
    const area = shared.areas.get(node.areaId);
    if (!area) return null;
    return (
      <div className="workout-panel__leaf">
        <WorkoutArea
          area={area}
          vault={shared.vault}
          isFocused={shared.focusedAreaId === area.ID}
          isDragging={shared.dragId === area.ID}
          isDropTarget={shared.overAreaId === area.ID}
          isExternalDrag={shared.isExternalDrag}
          onFocus={() => shared.onFocus(area.ID)}
          onDragStart={shared.onDragStart}
          onDragEnter={shared.onDragEnter}
          onDragLeave={shared.onDragLeave}
          onMediaTypeChange={shared.onMediaType}
          onClose={shared.onClose}
        />
      </div>
    );
  }
  return <SplitView node={node} shared={shared} />;
}

// ── SplitView ─────────────────────────────────────────────────────────

function SplitView({ node, shared }: { node: SplitNodeData; shared: SharedProps }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ratio        = shared.splitRatios[node.id] ?? 0.5;
  const isVertical   = node.direction === 'v';

  const handleResize = useCallback((delta: number) => {
    const el   = containerRef.current;
    if (!el) return;
    const size = isVertical ? el.offsetWidth : el.offsetHeight;
    if (size === 0) return;
    const next = Math.max(0.1, Math.min(0.9, ratio + delta / size));
    shared.onSplitRatio(node.id, next);
  }, [isVertical, ratio, node.id, shared]);

  return (
    <div
      ref={containerRef}
      className={`workout-panel__split workout-panel__split--${node.direction}`}
    >
      <div className="workout-panel__split-pane" style={{ flex: ratio }}>
        <LayoutView node={node.first} shared={shared} />
      </div>

      {isVertical
        ? <Splitter onResize={handleResize} />
        : <WorkoutHSplitter onResize={handleResize} />
      }

      <div className="workout-panel__split-pane" style={{ flex: 1 - ratio }}>
        <LayoutView node={node.second} shared={shared} />
      </div>
    </div>
  );
}

// ── WorkoutPanel ──────────────────────────────────────────────────────

interface Props {
  app: TTApplication;
}

export function WorkoutPanel({ app }: Props) {
  const panel = app.WorkoutPanel;
  const vault = app.Models.Vault;
  useAppUpdate(panel);
  useAppUpdate(vault);
  useAppUpdate(app.OverviewPanel);

  // 設定パネル: 開閉は panel.IsAreaOpen
  const [settingsPanelWidth, setSettingsPanelWidth] = useState(DEFAULT_SETTINGS_WIDTH);
  const settingPanelRef = useRef<WorkoutSettingAreaRef>(null);

  // 設定パネルが開いた時・モード切替時に対応要素へフォーカス
  useEffect(() => {
    if (!panel.IsAreaOpen) return;
    const timer = setTimeout(() => settingPanelRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [panel.IsAreaOpen, panel.ViewMode]);

  // split 比率（node.id → 0〜1）
  const [splitRatios, setSplitRatios] = useState<Record<string, number>>({});

  // ドラッグ状態
  const [dragId,      setDragId]     = useState<string | null>(null);
  const [overAreaId,  setOverAreaId] = useState<string | null>(null);
  const overAreaIdRef                = useRef<string | null>(null);

  // Ghost アニメーション
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  const [dragPos,   setDragPos]   = useState<{ x: number; y: number } | null>(null);

  // 外部D&D中フラグ（Monaco のイベント横取りを防ぐドラッグシールド用）
  const [isExternalDrag, setIsExternalDrag] = useState(false);

  // D&D オーバーレイ（アイテムドロップ時の新Paneプレビュー）
  const bodyRef = useRef<HTMLDivElement>(null);

  // dragend / drop が body 外で終了したときのクリーンアップ
  useEffect(() => {
    const cleanup = () => {
      setDropOverlay(null);
      setInsertCaret(null);
      setIsExternalDrag(false);
    };
    document.addEventListener('dragend', cleanup);
    document.addEventListener('drop',    cleanup);
    return () => {
      document.removeEventListener('dragend', cleanup);
      document.removeEventListener('drop',    cleanup);
    };
  }, []);

  interface DropOverlay {
    type:   'add' | 'split';
    dir:    DropEdgeDir;
    style:  React.CSSProperties;
    areaId?: string;
  }
  const [dropOverlay, setDropOverlay] = useState<DropOverlay | null>(null);

  // Alt+ThinkFileDrag（Insert）中の挿入位置プレビュー用カスタムCaret。
  // ネイティブD&D中はブラウザがフォーカス移動を抑制するため editor.focus() で
  // Monaco自身のカーソル描画に頼れず、独自にオーバーレイを描画して追随させる。
  interface InsertCaret { left: number; top: number; height: number }
  const [insertCaret, setInsertCaret] = useState<InsertCaret | null>(null);

  // ── フォーカスペインの Think タイトル ──────────────────────────────
  const focusedArea   = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
  const focusedThinkTitle = focusedArea
    ? (vault.GetThink(focusedArea.ResourceID)?.Name ?? '')
    : '';

  // ── ハンドラー ──────────────────────────────────────────────────────

  const handleSetActiveSettings = useCallback((type: SettingsType | null) => {
    if (type !== null) {
      panel.SetViewMode(type as WorkoutViewMode);
      panel.OpenArea();
    } else {
      panel.CloseArea();
    }
  }, [panel]);

  const handleToggle = useCallback(() => {
    panel.ToggleArea();
  }, [panel]);

  const handleSettingsResize = useCallback((delta: number) => {
    setSettingsPanelWidth(prev =>
      Math.max(MIN_SETTINGS_WIDTH, Math.min(MAX_SETTINGS_WIDTH, prev + delta))
    );
  }, []);

  const handleFocus = useCallback((areaId: string) => {
    panel.FocusArea(areaId);
  }, [panel]);

  const handleSplitRatio = useCallback((nodeId: string, ratio: number) => {
    setSplitRatios(prev => ({ ...prev, [nodeId]: ratio }));
  }, []);

  // ── エリア分割（FocusPaneと同じ内容）────────────────────────────────

  const handleSplitRight = useCallback(async () => {
    if (panel.Layout === null) {
      const t = await vault.CreateBlankThink('memo', '新規メモ');
      panel.AddFirst(t.ID, 'texteditor', t.Name);
    } else {
      const f = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
      if (f) panel.AddRight(f.ResourceID, f.MediaType, f.Title);
    }
  }, [vault, panel]);

  const handleSplitBelow = useCallback(async () => {
    if (panel.Layout === null) {
      const t = await vault.CreateBlankThink('memo', '新規メモ');
      panel.AddFirst(t.ID, 'texteditor', t.Name);
    } else {
      const f = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
      if (f) panel.AddBelow(f.ResourceID, f.MediaType, f.Title);
    }
  }, [vault, panel]);

  const handleSplitLeft = useCallback(async () => {
    if (panel.Layout === null) {
      const t = await vault.CreateBlankThink('memo', '新規メモ');
      panel.AddFirst(t.ID, 'texteditor', t.Name);
    } else {
      const f = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
      if (f) panel.AddLeft(f.ResourceID, f.MediaType, f.Title);
    }
  }, [vault, panel]);

  const handleSplitAbove = useCallback(async () => {
    if (panel.Layout === null) {
      const t = await vault.CreateBlankThink('memo', '新規メモ');
      panel.AddFirst(t.ID, 'texteditor', t.Name);
    } else {
      const f = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
      if (f) panel.AddAbove(f.ResourceID, f.MediaType, f.Title);
    }
  }, [vault, panel]);

  // ── エリア追加（FocusPaneと同じ内容、空のとき新規）────────────────────

  const handleAddRight = useCallback(async () => {
    if (panel.Layout === null) {
      const t = await vault.CreateBlankThink('memo', '新規メモ');
      panel.AddToRight(t.ID, 'texteditor', t.Name);
    } else {
      const f = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
      if (f) panel.AddToRight(f.ResourceID, f.MediaType, f.Title);
    }
  }, [vault, panel]);

  const handleAddBelow = useCallback(async () => {
    if (panel.Layout === null) {
      const t = await vault.CreateBlankThink('memo', '新規メモ');
      panel.AddToBottom(t.ID, 'texteditor', t.Name);
    } else {
      const f = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
      if (f) panel.AddToBottom(f.ResourceID, f.MediaType, f.Title);
    }
  }, [vault, panel]);

  const handleAddLeft = useCallback(async () => {
    if (panel.Layout === null) {
      const t = await vault.CreateBlankThink('memo', '新規メモ');
      panel.AddToLeft(t.ID, 'texteditor', t.Name);
    } else {
      const f = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
      if (f) panel.AddToLeft(f.ResourceID, f.MediaType, f.Title);
    }
  }, [vault, panel]);

  const handleAddTop = useCallback(async () => {
    if (panel.Layout === null) {
      const t = await vault.CreateBlankThink('memo', '新規メモ');
      panel.AddToTop(t.ID, 'texteditor', t.Name);
    } else {
      const f = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
      if (f) panel.AddToTop(f.ResourceID, f.MediaType, f.Title);
    }
  }, [vault, panel]);

  const handleRemoveFocused = useCallback(() => {
    if (panel.FocusedAreaId) panel.RemoveArea(panel.FocusedAreaId);
  }, [panel]);

  const handleCreateMemo = useCallback(async () => {
    const t = await vault.CreateBlankThink('memo', '新規メモ');
    panel.AddToRight(t.ID, 'texteditor', t.Name);
  }, [vault, panel]);

  const handleReadMemo = useCallback(() => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.txt,.md,.xdoc';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const title   = file.name.replace(/\.[^/.]+$/, '');
      const text    = await file.text();
      const content = `${title}\n${text}`;
      const t = await vault.CreateBlankThink('memo', title);
      t.Content = content;
      await t.SaveContent();
      panel.AddToRight(t.ID, 'markdown', t.Name);
    };
    input.click();
  }, [vault, panel]);

  const handleSaveMemo = useCallback(() => {
    const focusedArea = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
    if (!focusedArea) return;
    const think = vault.GetThink(focusedArea.ResourceID);
    if (!think || think.ContentType !== 'memo') return;
    const blob = new Blob([think.Content], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${think.Name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [panel, vault]);

  const handleCreateTable = useCallback(async () => {
    const t = await vault.CreateBlankThink('table', '新規テーブル');
    panel.AddToRight(t.ID, 'texteditor', t.Name);
  }, [vault, panel]);

  const handleReadTable = useCallback(() => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const title = file.name.replace(/\.[^/.]+$/, '');

      let sections: import('../../utils/tableFormat').TableSection[] = [];

      if (file.name.toLowerCase().endsWith('.csv')) {
        const text  = await file.text();
        const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
        if (lines.length > 0) {
          const columns = parseCsvLine(lines[0]);
          const rows    = lines.slice(1).map(parseCsvLine);
          sections      = [{ title: 'データ', columns, rows, rawLines: [] }];
        }
      } else {
        // XLSX / XLS: SheetJS で読み取り
        const XLSX    = await import('xlsx');
        const buffer  = await file.arrayBuffer();
        const wb      = XLSX.read(buffer, { type: 'array' });
        for (const sheetName of wb.SheetNames) {
          const ws   = wb.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
          if (data.length > 0) {
            const columns = data[0].map(String);
            const rows    = data.slice(1).map(r => r.map(String));
            sections.push({ title: sheetName, columns, rows, rawLines: [] });
          }
        }
      }

      if (sections.length === 0) return;
      const fullContent = sectionsToTableContent(title, sections);
      const t = await vault.CreateBlankThink('table', title);
      t.Content = fullContent;
      await t.SaveContent();
      panel.AddToRight(t.ID, 'datagrid', t.Name);
    };
    input.click();
  }, [vault, panel]);

  const handleSaveTable = useCallback(() => {
    const focusedArea = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
    if (!focusedArea) return;
    const think = vault.GetThink(focusedArea.ResourceID);
    if (!think || think.ContentType !== 'table') return;

    const sections = parseTableContent(think.Content);
    if (sections.length === 0) return;

    for (const section of sections) {
      const csv  = '﻿' + sectionToCsv(section);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = sections.length > 1
        ? `${think.Name}_${section.title}.csv`
        : `${think.Name}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [panel, vault]);

  // chatファイル未選択時の保存: チャット内容から想定されるタイトルで新規の chat Think を作る
  // （Overviewの選択中Bundleへリンク）。作成した Think を返し、以降はそれを選択中として続けられるようにする
  const handleSaveChat = useCallback(async (messages: ChatMessage[]): Promise<TTThink | undefined> => {
    if (messages.length === 0) return undefined;
    const title = chatContentTitle(TODO_CHAT_PREFIX_WORKOUT, messages);
    const body = serializeChat(messages);
    return vault.CreateChatThink(`${title}\n${body}`, app.OverviewPanel.BundleID || undefined);
  }, [vault, app]);

  const handleSettingsRefresh = useCallback(() => {
    app.RefreshAll().catch(e => console.error('[WorkoutPanel] RefreshAll failed:', e));
  }, [app]);

  const handleClearAll = useCallback(() => {
    panel.ClearAll();
  }, [panel]);

  const handleEqualizeWidths = useCallback(() => {
    if (!panel.Layout) return;
    setSplitRatios(prev => {
      const next = { ...prev };
      computeEqualWidthRatios(panel.Layout!, next);
      return next;
    });
  }, [panel]);

  const handleEqualizeHeights = useCallback(() => {
    if (!panel.Layout) return;
    setSplitRatios(prev => {
      const next = { ...prev };
      computeEqualHeightRatios(panel.Layout!, next);
      return next;
    });
  }, [panel]);

  // ── D&D オーバーレイ計算（ドロップ後の新Pane位置をプレビュー）──────────

  const OUTER_RATIO   = 0.15; // パネル外縁15%以内 → エリア追加
  const NEW_PANE_FRAC = 0.35; // 追加時の新ペイン幅/高さ比率

  const computeDropOverlay = useCallback((
    e: { clientX: number; clientY: number },
    opts: { skipRibbonCheck?: boolean; excludeAreaId?: string } = {},
  ) => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return null;

    // タイトルバー（WorkoutAreaRibbon）上にいる場合はオーバーレイを表示しない
    if (!opts.skipRibbonCheck) {
      const elemsUnderCursor = document.elementsFromPoint(e.clientX, e.clientY);
      if (elemsUnderCursor.some(el => el.classList.contains('workout-area-ribbon'))) {
        return null;
      }
    }

    const br   = bodyEl.getBoundingClientRect();

    // ── エリアが1つも無い場合：全面を緑オーバーレイ ──
    if (panel.Layout === null) {
      return {
        type: 'add' as const,
        dir: 'right' as DropEdgeDir,
        style: { left: 0, top: 0, width: br.width, height: br.height } as React.CSSProperties,
      };
    }

    const px   = (e.clientX - br.left) / br.width;
    const py   = (e.clientY - br.top)  / br.height;
    const dl   = px;
    const dr   = 1 - px;
    const du   = py;
    const dd   = 1 - py;
    const min  = Math.min(dl, dr, du, dd);
    const dir: DropEdgeDir =
      min === dl ? 'left' : min === dr ? 'right' : min === du ? 'up' : 'down';
    const isOuter = min < OUTER_RATIO;

    if (isOuter) {
      const fw = br.width  * NEW_PANE_FRAC;
      const fh = br.height * NEW_PANE_FRAC;
      const s: React.CSSProperties =
        dir === 'left'  ? { left: 0,   top: 0, width: fw, height: br.height } :
        dir === 'right' ? { right: 0,  top: 0, width: fw, height: br.height } :
        dir === 'up'    ? { left: 0,   top: 0, width: br.width, height: fh } :
                          { left: 0, bottom: 0, width: br.width, height: fh };
      return { type: 'add' as const, dir, style: s };
    }

    // 内側 → 各ペインで分割
    const els    = document.elementsFromPoint(e.clientX, e.clientY);
    const areaEl = els.find(el =>
      el.classList.contains('workout-area') &&
      el.getAttribute('data-area-id') !== opts.excludeAreaId,
    ) as HTMLElement | undefined;
    if (!areaEl) return null;
    const areaId = areaEl.getAttribute('data-area-id');
    if (!areaId) return null;

    const ar  = areaEl.getBoundingClientRect();
    const ax  = (e.clientX - ar.left) / ar.width  - 0.5;
    const ay  = (e.clientY - ar.top)  / ar.height - 0.5;
    const splitDir: DropEdgeDir =
      Math.abs(ax) > Math.abs(ay)
        ? (ax < 0 ? 'left' : 'right')
        : (ay < 0 ? 'up'   : 'down');

    const aLeft = ar.left - br.left;
    const aTop  = ar.top  - br.top;
    const aW    = ar.width;
    const aH    = ar.height;
    const s: React.CSSProperties =
      splitDir === 'left'  ? { left: aLeft,        top: aTop, width: aW/2, height: aH } :
      splitDir === 'right' ? { left: aLeft + aW/2,  top: aTop, width: aW/2, height: aH } :
      splitDir === 'up'    ? { left: aLeft,          top: aTop, width: aW,   height: aH/2 } :
                              { left: aLeft, top: aTop + aH/2,  width: aW,   height: aH/2 };

    // ── エリアが1つだけのとき：split→addに統一（緑オーバーレイ）──
    const overlayType = panel.Areas.length <= 1 ? 'add' as const : 'split' as const;
    return { type: overlayType, dir: splitDir, areaId, style: s };
  }, [panel]);

  const handleBodyDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    const hasThink = types.includes('application/x-thought-id');
    const hasLink  = types.includes('text/uri-list') || types.includes('Files') || types.includes('text/plain');
    if (!hasThink && !hasLink) return;
    e.preventDefault();

    // Alt+ThinkFileDrag（Insert）は、computeDropOverlay()のisOuter（パネル外縁15%は
    // 新規Pane追加ゾーン）判定より優先してカーソル直下の既存Paneを直接ヒットテストする。
    // isOuter判定はパネル本体の端からの距離だけで決まるため、パネル端に近い既存Pane
    // （よくあるレイアウト）の上にいても isOuter=true になり areaId が付かず、Insertが
    // 一切成立しない不具合があった。Alt押下時は「マウス直下にPaneがあるか」だけで判定する。
    const altHeld = hasThink && TTShortcutManager.instance.isDragAltHeld(e.nativeEvent);
    const hoveredAreaId = altHeld ? findWorkoutAreaIdAtPoint(e.clientX, e.clientY) : null;
    const targetEditor = hoveredAreaId ? TTShortcutManager.instance.getAreaEditor(hoveredAreaId) : null;
    const canInsert = !!targetEditor;
    e.dataTransfer.dropEffect = canInsert ? 'link' : 'copy';
    setIsExternalDrag(true);

    if (canInsert) {
      // Alt+ThinkFileDrag: Pane配置のゴーストは表示せず、代わりにマウス直下の位置へ
      // 対象エディタのカーソルを追従させ、挿入位置をその場でプレビューする。
      // editor.focus() はネイティブD&D中はブラウザがフォーカス移動そのものを
      // 抑制するため、Monaco自身のCaret描画（DOMフォーカス依存）はあてにならない。
      // 代わりに getScrolledVisiblePosition() でピクセル座標を求め、
      // 独自のCaretオーバーレイ（insertCaret）をbodyRef基準で描画する。
      setDropOverlay(null);
      const pos = clientPointToPosition(targetEditor, e.clientX, e.clientY);
      if (pos) {
        targetEditor.setPosition(pos);
        const coords = targetEditor.getScrolledVisiblePosition(pos);
        const domRect = targetEditor.getDomNode()?.getBoundingClientRect();
        const br = bodyRef.current?.getBoundingClientRect();
        if (coords && domRect && br) {
          setInsertCaret({
            left:   domRect.left - br.left + coords.left,
            top:    domRect.top  - br.top  + coords.top,
            height: coords.height,
          });
        } else {
          setInsertCaret(null);
        }
      } else {
        setInsertCaret(null);
      }
      if (TTShortcutManager.instance.activeEditor !== targetEditor) {
        targetEditor.focus();
        TTShortcutManager.instance.setActiveEditor(targetEditor);
      }
    } else {
      setInsertCaret(null);
      setDropOverlay(computeDropOverlay(e));
    }
  }, [computeDropOverlay]);

  const handleBodyDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropOverlay(null);
      setInsertCaret(null);
      setIsExternalDrag(false);
    }
  }, []);

  const handleBodyDrop = useCallback(async (e: React.DragEvent) => {
    const overlay = computeDropOverlay(e);
    setDropOverlay(null);
    setInsertCaret(null);
    setIsExternalDrag(false);
    if (!overlay) return;
    e.preventDefault();

    // Think D&D（WorkoutPanel.DroppedFile.ID:Load / WorkoutPanel.DroppedFile.ID:Insert、
    // docs/Shortcut.md参照）。コンテンツ領域へのThinkドロップはLoad/Insertいずれも
    // ここで一元的に判定する（各Paneのコンポーネント側では消費しない）。個別コンポーネントの
    // dragover/dropハンドラーとタイミング・判定がずれてAlt判定を取りこぼす問題を避けるため。
    const thinkId = e.dataTransfer.getData('application/x-thought-id');
    if (thinkId) {
      // Insertは、computeDropOverlay()のisOuter（パネル外縁は新規Pane追加ゾーン）判定より
      // 優先してカーソル直下の既存Paneを直接ヒットテストする（handleBodyDragOverと同じ理由。
      // isOuter判定に引きずられるとパネル端に近い既存Pane上でもLoadにフォールバックしてしまう）。
      const actionId = TTShortcutManager.instance.resolveDragAction('ThinkFileDrag', e.nativeEvent);
      const hoveredAreaId = actionId === 'WorkoutPanel.DroppedFile.ID:Insert'
        ? findWorkoutAreaIdAtPoint(e.clientX, e.clientY)
        : null;
      const editor = hoveredAreaId ? TTShortcutManager.instance.getAreaEditor(hoveredAreaId) : null;
      if (editor) {
        TTShortcutManager.instance.setActiveEditor(editor);
        TTShortcutManager.instance.setPendingThinkDrop({ thinkId, kind: 'insert' });
        TTActions.Execute('WorkoutPanel.DroppedFile.ID:Insert');
        return;
      }
      // ドロップ位置に応じたPane配置（overlay）は、ゴースト表示のためにここで既に計算済みの
      // ものをそのままActionへ渡す（ジオメトリ計算はUI層の責務のためActionでは再計算しない）。
      TTShortcutManager.instance.setPendingThinkDrop(
        overlay.type === 'add'
          ? { thinkId, kind: 'load-place', overlayType: 'add', dir: overlay.dir }
          : { thinkId, kind: 'load-place', overlayType: 'split', dir: overlay.dir, areaId: overlay.areaId }
      );
      TTActions.Execute('WorkoutPanel.DroppedFile.ID:Load');
      return;
    }

    // URL / path D&D → links Think を新規作成
    const link = extractLinkDrop(e);
    if (link && shouldAllowLocalDrop(e)) {
      const newThink = await vault.CreateLinksThink(link.title, link.url);
      const id    = newThink.ID;
      const title = newThink.Name;
      if (overlay.type === 'add') {
        if (overlay.dir === 'left')       panel.AddToLeft(id,   'texteditor', title);
        else if (overlay.dir === 'right') panel.AddToRight(id,  'texteditor', title);
        else if (overlay.dir === 'up')    panel.AddToTop(id,    'texteditor', title);
        else                              panel.AddToBottom(id, 'texteditor', title);
      } else {
        if (overlay.areaId) panel.FocusArea(overlay.areaId);
        if (overlay.dir === 'left')       panel.AddLeft(id,  'texteditor', title);
        else if (overlay.dir === 'right') panel.AddRight(id, 'texteditor', title);
        else if (overlay.dir === 'up')    panel.AddAbove(id, 'texteditor', title);
        else                              panel.AddBelow(id, 'texteditor', title);
      }
    }
  }, [computeDropOverlay, panel, vault]);

  const handleDragStart = useCallback((e: React.MouseEvent, areaId: string) => {
    e.preventDefault();
    const area  = panel.GetArea(areaId);
    const title = area?.Title || '（無題）';

    setDragId(areaId);
    setDragTitle(title);
    setDragPos({ x: e.clientX, y: e.clientY });

    const onMouseMove = (ev: MouseEvent) => {
      setDragPos({ x: ev.clientX, y: ev.clientY });
      const overlay = computeDropOverlay(ev, { skipRibbonCheck: true, excludeAreaId: areaId });
      setDropOverlay(overlay);
    };
    const onMouseUp = (ev: MouseEvent) => {
      const overlay = computeDropOverlay(ev, { skipRibbonCheck: true, excludeAreaId: areaId });
      setDropOverlay(null);
      if (overlay) {
        panel.MoveArea(areaId, overlay.areaId ?? null, overlay.dir, overlay.type);
      }
      overAreaIdRef.current = null;
      setDragId(null);
      setOverAreaId(null);
      setDragTitle(null);
      setDragPos(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  }, [panel, computeDropOverlay]);

  const handleDragEnter = useCallback((areaId: string) => {
    if (dragId && dragId !== areaId) {
      overAreaIdRef.current = areaId;
      setOverAreaId(areaId);
    }
  }, [dragId]);

  const handleDragLeave = useCallback(() => {
    overAreaIdRef.current = null;
    setOverAreaId(null);
  }, []);

  const handleMediaType = useCallback((areaId: string, type: MediaType) => {
    panel.SetMediaType(areaId, type);
  }, [panel]);

  const handleClose = useCallback((areaId: string) => {
    panel.RemoveArea(areaId);
  }, [panel]);

  // ── エリアマップ構築 ──────────────────────────────────────────────

  const areaMap = new Map<string, TTWorkoutArea>(panel.Areas.map(a => [a.ID, a]));

  const shared: SharedProps = {
    areas:           areaMap,
    vault,
    focusedAreaId:   panel.FocusedAreaId,
    dragId,
    overAreaId,
    splitRatios,
    isExternalDrag,
    onFocus:         handleFocus,
    onDragStart:     handleDragStart,
    onDragEnter:     handleDragEnter,
    onDragLeave:     handleDragLeave,
    onMediaType:     handleMediaType,
    onClose:         handleClose,
    onSplitRatio:    handleSplitRatio,
  };

  // ── レンダリング ──────────────────────────────────────────────────

  return (
    <div className="workout-panel">

      {/* ── 左縦リボン ───────────────────────────────────────── */}
      <WorkoutTabBar
        activeSettings={panel.ViewMode}
        isOpen={panel.IsAreaOpen}
        thinkTitle={focusedThinkTitle}
        onToggle={handleToggle}
        onSetActiveSettings={handleSetActiveSettings}
      />

      {/* ── 設定パネル + Splitter ────────────────────────────── */}
      <PanelArea
        panelId="workout"
        isOpen={panel.IsAreaOpen}
        width={settingsPanelWidth}
      >
        <WorkoutSettingArea
          ref={settingPanelRef}
          activeSettings={panel.ViewMode}
          panel={panel}
          vault={vault}
          width={settingsPanelWidth}
          onSplitLeft={handleSplitLeft}
          onSplitRight={handleSplitRight}
          onSplitAbove={handleSplitAbove}
          onSplitBelow={handleSplitBelow}
          onAddLeft={handleAddLeft}
          onAddRight={handleAddRight}
          onAddTop={handleAddTop}
          onAddBottom={handleAddBelow}
          onRemoveFocused={handleRemoveFocused}
          onClearAll={handleClearAll}
          onEqualizeWidths={handleEqualizeWidths}
          onEqualizeHeights={handleEqualizeHeights}
          onCreateMemo={handleCreateMemo}
          onReadMemo={handleReadMemo}
          onSaveMemo={handleSaveMemo}
          onCreateTable={handleCreateTable}
          onReadTable={handleReadTable}
          onSaveTable={handleSaveTable}
          onSaveChat={handleSaveChat}
          onRefresh={handleSettingsRefresh}
        />
      </PanelArea>
      {panel.IsAreaOpen && (
        <Splitter onResize={handleSettingsResize} />
      )}

      {/* ── コンテンツ領域 ────────────────────────────────────── */}
      <div
        ref={bodyRef}
        className="ContentsArea"
        onDragOver={handleBodyDragOver}
        onDragLeave={handleBodyDragLeave}
        onDrop={handleBodyDrop}
      >
        {panel.Layout === null ? (
          <WorkoutAreaEmpty isFullPanel onAdd={handleAddRight} />
        ) : (
          <div className="workout-panel__tree">
            <LayoutView node={panel.Layout} shared={shared} />
          </div>
        )}

        {/* D&D ドロップ位置プレビューオーバーレイ */}
        {dropOverlay && (
          <div
            className={`workout-panel__drop-overlay workout-panel__drop-overlay--${dropOverlay.type}`}
            style={{ position: 'absolute', pointerEvents: 'none', ...dropOverlay.style }}
          />
        )}

        {/* Alt+ThinkFileDrag（Insert）挿入位置プレビューCaret */}
        {insertCaret && (
          <div
            className="workout-panel__insert-caret"
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              left: insertCaret.left,
              top: insertCaret.top,
              height: insertCaret.height,
            }}
          />
        )}

      </div>

      {/* ── ドラッグ Ghost ────────────────────────────────────── */}
      {dragId && dragTitle && dragPos && (
        <div
          className="workout-drag-ghost"
          style={{ left: dragPos.x + 14, top: dragPos.y - 10 }}
        >
          <GripVertical size={12} />
          <span>{dragTitle}</span>
        </div>
      )}

    </div>
  );
}
