// 中央右パネル：BSPツリーの再帰描画、エディタ、ツールバー（仕様書02 §2-§5）

import { useCallback, useEffect, useRef, useState } from 'react';
import { app } from '../../views/TTApplication';
import { useNotify } from '../../hooks/useNotify';
import { VerticalTabBar, TabButton } from '../Layout/VerticalTabBar';
import {
  IconPanelLeft, IconColumns, IconRows, IconGrid, IconX, IconSave, IconGrip,
  IconText, IconMarkdown, IconTable, IconCard, IconGraph, IconChat,
} from '../Layout/Icons';
import type { LayoutNode, MediaType } from '../../types';
import { MEDIA_TYPE_MAP } from '../../types';
import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import type { AddEdge, SplitSide } from '../../views/TTWorkoutPanel';
import { TextEditorMedia } from './media/TextEditorMedia';
import { MarkdownMedia } from './media/MarkdownMedia';
import { DataGridMedia } from './media/DataGridMedia';
import { CardMedia } from './media/CardMedia';
import { GraphMedia } from './media/GraphMedia';
import { ChatMedia } from './media/ChatMedia';
import '../Layout/MenuRibbon.css';
import './WorkoutPanel.css';

const OUTER_RATIO = 0.15;
const NEW_PANE_FRAC = 0.35;

const MEDIA_ICONS: Record<MediaType, typeof IconText> = {
  texteditor: IconText,
  markdown: IconMarkdown,
  datagrid: IconTable,
  card: IconCard,
  graph: IconGraph,
  chat: IconChat,
};

const MEDIA_LABELS: Record<MediaType, string> = {
  texteditor: 'テキスト',
  markdown: 'Markdown',
  datagrid: 'グリッド',
  card: 'カード',
  graph: 'グラフ',
  chat: 'チャット',
};

interface DropOverlay {
  type: 'add' | 'split';
  rect: { left: number; top: number; width: number; height: number };
  edge?: AddEdge;
  areaId?: string;
  side?: SplitSide;
}

export function WorkoutPanel() {
  useNotify(app, app.Workout);
  const containerRef = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<DropOverlay | null>(null);
  const [swapGhost, setSwapGhost] = useState<{ x: number; y: number; title: string; fromId: string } | null>(null);
  const [swapTarget, setSwapTarget] = useState<string>('');

  // ── ドロップエリア判定（仕様書02 §3.2 computeDropOverlay）──
  const computeDropOverlay = useCallback((clientX: number, clientY: number): DropOverlay | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;

    // ケースA: ペインが空
    if (app.Workout.Layout === null) {
      return { type: 'add', edge: 'right', rect: { left: 0, top: 0, width: rect.width, height: rect.height } };
    }

    // ケースB: 外縁追加（15%以内）
    const edges: Array<[number, AddEdge]> = [
      [px, 'left'], [1 - px, 'right'], [py, 'top'], [1 - py, 'bottom'],
    ];
    edges.sort((a, b) => a[0] - b[0]);
    const [minDist, edge] = edges[0];
    const forceEdge = app.Workout.LeafCount <= 1;

    if (minDist < OUTER_RATIO || forceEdge) {
      let useEdge = edge;
      const w = rect.width * NEW_PANE_FRAC;
      const h = rect.height * NEW_PANE_FRAC;
      let r;
      switch (useEdge) {
        case 'left':   r = { left: 0, top: 0, width: w, height: rect.height }; break;
        case 'right':  r = { left: rect.width - w, top: 0, width: w, height: rect.height }; break;
        case 'top':    r = { left: 0, top: 0, width: rect.width, height: h }; break;
        case 'bottom': r = { left: 0, top: rect.height - h, width: rect.width, height: h }; break;
      }
      return { type: 'add', edge: useEdge, rect: r };
    }

    // ケースC: 内側分割
    const el = document.elementsFromPoint(clientX, clientY)
      .find((n) => n instanceof HTMLElement && n.dataset.areaId) as HTMLElement | undefined;
    if (!el) return null;
    const areaRect = el.getBoundingClientRect();
    const ax = (clientX - areaRect.left) / areaRect.width - 0.5;
    const ay = (clientY - areaRect.top) / areaRect.height - 0.5;
    let side: SplitSide;
    if (Math.abs(ax) > Math.abs(ay)) side = ax < 0 ? 'left' : 'right';
    else side = ay < 0 ? 'up' : 'down';

    const base = {
      left: areaRect.left - rect.left,
      top: areaRect.top - rect.top,
      width: areaRect.width,
      height: areaRect.height,
    };
    let r;
    switch (side) {
      case 'left':  r = { ...base, width: base.width / 2 }; break;
      case 'right': r = { ...base, left: base.left + base.width / 2, width: base.width / 2 }; break;
      case 'up':    r = { ...base, height: base.height / 2 }; break;
      case 'down':  r = { ...base, top: base.top + base.height / 2, height: base.height / 2 }; break;
    }
    return { type: 'split', areaId: el.dataset.areaId, side, rect: r };
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const ov = computeDropOverlay(e.clientX, e.clientY);
    setOverlay(null);
    if (!ov) return;

    let resourceId = e.dataTransfer.getData('application/x-thought-id');

    // 外部ファイル/URLドロップ → リンク用memoを作成
    if (!resourceId && e.dataTransfer.files.length > 0) {
      const names = [...e.dataTransfer.files].map((f) => f.name);
      const think = app.Vault.NewThink('memo', `# ドロップされたファイル\n${names.map((n) => `* ${n}`).join('\n')}\n`);
      await app.Vault.SaveThink(think);
      resourceId = think.ID;
    } else if (!resourceId) {
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (url && /^https?:\/\//.test(url.trim())) {
        const think = app.Vault.NewThink('links', `リンク\n* [${url.trim()}](${url.trim()})`);
        await app.Vault.SaveThink(think);
        resourceId = think.ID;
      }
    }
    if (!resourceId) return;

    const think = await app.Vault.EnsureContent(resourceId);
    if (!think) return;
    const media = MEDIA_TYPE_MAP[think.ContentType]?.initial ?? 'texteditor';

    if (ov.type === 'add' && ov.edge) {
      app.Workout.AddToEdge(ov.edge, resourceId, media);
    } else if (ov.type === 'split' && ov.areaId && ov.side) {
      app.Workout.SplitArea(ov.areaId, ov.side, resourceId, media);
    }
  }, [computeDropOverlay]);

  // ── Swapドラッグ（仕様書02 §4）──
  const startSwapDrag = useCallback((fromAreaId: string, title: string, e: React.MouseEvent) => {
    e.preventDefault();
    setSwapGhost({ x: e.clientX, y: e.clientY, title, fromId: fromAreaId });
    const onMove = (ev: MouseEvent) => {
      setSwapGhost((g) => (g ? { ...g, x: ev.clientX, y: ev.clientY } : g));
      const el = document.elementsFromPoint(ev.clientX, ev.clientY)
        .find((n) => n instanceof HTMLElement && n.dataset.areaId) as HTMLElement | undefined;
      setSwapTarget(el?.dataset.areaId && el.dataset.areaId !== fromAreaId ? el.dataset.areaId : '');
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const el = document.elementsFromPoint(ev.clientX, ev.clientY)
        .find((n) => n instanceof HTMLElement && n.dataset.areaId) as HTMLElement | undefined;
      if (el?.dataset.areaId && el.dataset.areaId !== fromAreaId) {
        app.Workout.SwapAreas(fromAreaId, el.dataset.areaId);
      }
      setSwapGhost(null);
      setSwapTarget('');
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div className="app-panel app-panel--workout" data-focusable="Workout">
      <VerticalTabBar theme="workout" side="left" label="Workout">
        <TabButton tip="設定トレイ開閉" onClick={() => app.Actions.Execute('Panel.WorkoutSetting.Toggle')}>
          <IconPanelLeft size={16} />
        </TabButton>
        <TabButton tip="ペイン幅の均等化" onClick={() => app.Actions.Execute('Workout.Equalize')}>
          <IconGrid size={16} />
        </TabButton>
      </VerticalTabBar>

      {app.WorkoutSettingOpen && <WorkoutSettingArea />}

      <div
        ref={containerRef}
        className="workout-panel-tree"
        onDragOver={(e) => {
          e.preventDefault();
          setOverlay(computeDropOverlay(e.clientX, e.clientY));
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setOverlay(null);
        }}
        onDrop={(e) => void handleDrop(e)}
      >
        {app.Workout.Layout ? (
          <LayoutNodeView node={app.Workout.Layout} swapTarget={swapTarget} onSwapDragStart={startSwapDrag} />
        ) : (
          <div className="workout-empty">
            <div className="workout-empty__title">Workout Panel</div>
            <div className="workout-empty__desc">左のリストから Think をドラッグ＆ドロップして開きます</div>
          </div>
        )}
        {overlay && (
          <div
            className="workout-drop-overlay"
            style={{
              left: overlay.rect.left,
              top: overlay.rect.top,
              width: overlay.rect.width,
              height: overlay.rect.height,
            }}
          />
        )}
      </div>

      {swapGhost && (
        <div className="workout-drag-ghost" style={{ left: swapGhost.x + 8, top: swapGhost.y + 8 }}>
          {swapGhost.title}
        </div>
      )}
    </div>
  );
}

// ── 設定トレイ ──────────────────────────────────────────

function WorkoutSettingArea() {
  useNotify(app.Workout);
  const focused = app.Workout.GetArea(app.Workout.FocusedAreaId);

  const splitFocused = (side: SplitSide) => {
    if (!focused) return;
    app.Workout.SplitArea(focused.ID, side, focused.ResourceID, focused.Media);
  };

  return (
    <div className="workout-setting-area" data-focusable="WorkoutSetting" style={{ width: app.WorkoutSettingWidth }}>
      <div className="workout-setting-area__section">
        <div className="workout-setting-area__section-title">ペイン管理</div>
        <button className="workout-setting-area__btn" disabled={!focused} onClick={() => splitFocused('right')}>
          <IconColumns size={13} /> 左右に分割
        </button>
        <button className="workout-setting-area__btn" disabled={!focused} onClick={() => splitFocused('down')}>
          <IconRows size={13} /> 上下に分割
        </button>
        <button className="workout-setting-area__btn" onClick={() => app.Actions.Execute('Workout.Equalize')}>
          <IconGrid size={13} /> 均等化
        </button>
        <button className="workout-setting-area__btn" disabled={!focused}
          onClick={() => focused && app.Workout.CloseArea(focused.ID)}>
          <IconX size={13} /> ペインを閉じる
        </button>
      </div>
      <div className="workout-setting-area__section">
        <div className="workout-setting-area__section-title">データ管理</div>
        <button className="workout-setting-area__btn" onClick={() => void app.Vault.LoadAll()}>
          再読み込み
        </button>
      </div>
    </div>
  );
}

// ── BSPツリーの再帰レンダリング（仕様書02 §2.2）──────────

function LayoutNodeView({
  node, swapTarget, onSwapDragStart,
}: {
  node: LayoutNode;
  swapTarget: string;
  onSwapDragStart: (areaId: string, title: string, e: React.MouseEvent) => void;
}) {
  useNotify(app.Workout);

  if (node.type === 'leaf') {
    const area = app.Workout.GetArea(node.areaId);
    if (!area) return null;
    return <WorkoutAreaView area={area} isSwapTarget={swapTarget === node.areaId} onSwapDragStart={onSwapDragStart} />;
  }

  const ratio = app.Workout.GetRatio(node.id);
  const isV = node.direction === 'v';

  return (
    <div className={`workout-split workout-split--${node.direction}`}>
      <div className="workout-split__child" style={{ flex: ratio }}>
        <LayoutNodeView node={node.first} swapTarget={swapTarget} onSwapDragStart={onSwapDragStart} />
      </div>
      <BspSplitter nodeId={node.id} direction={node.direction} />
      <div className="workout-split__child" style={{ flex: 1 - ratio }}>
        <LayoutNodeView node={node.second} swapTarget={swapTarget} onSwapDragStart={onSwapDragStart} />
      </div>
    </div>
  );
}

function BspSplitter({ nodeId, direction }: { nodeId: string; direction: 'v' | 'h' }) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const parent = (e.currentTarget as HTMLElement).parentElement!;
    const parentRect = parent.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const ratio = direction === 'v'
        ? (ev.clientX - parentRect.left) / parentRect.width
        : (ev.clientY - parentRect.top) / parentRect.height;
      app.Workout.SetRatio(nodeId, ratio);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = direction === 'v' ? 'col-resize' : 'row-resize';
  };

  return <div className={`workout-bsp-splitter workout-bsp-splitter--${direction}`} onMouseDown={onMouseDown} />;
}

// ── 個別ペイン（WorkoutArea）────────────────────────────

function WorkoutAreaView({
  area, isSwapTarget, onSwapDragStart,
}: {
  area: TTWorkoutArea;
  isSwapTarget: boolean;
  onSwapDragStart: (areaId: string, title: string, e: React.MouseEvent) => void;
}) {
  useNotify(area, app.Vault);
  const think = area.ResourceID ? app.Vault.GetChild(area.ResourceID) : undefined;
  useNotify(think ?? null);

  useEffect(() => {
    if (area.ResourceID) void app.Vault.EnsureContent(area.ResourceID);
  }, [area.ResourceID]);

  const isFocused = app.Workout.FocusedAreaId === area.ID;
  const mediaList = think ? MEDIA_TYPE_MAP[think.ContentType]?.list ?? ['texteditor'] : [];

  return (
    <div
      className={`workout-area${isFocused ? ' workout-area--focused' : ''}${isSwapTarget ? ' workout-area--swap-target' : ''}`}
      data-area-id={area.ID}
      onMouseDown={() => app.Workout.SetFocusedArea(area.ID)}
    >
      <div className="workout-menu-ribbon">
        <span
          className="workout-menu-ribbon__grip"
          data-tip="ドラッグでペイン入れ替え"
          onMouseDown={(e) => onSwapDragStart(area.ID, think?.Name ?? '', e)}
        >
          <IconGrip size={13} />
        </span>
        <span className="workout-menu-ribbon__title" title={think?.Name}>
          {think?.Name || '(無題)'}
        </span>
        {think?.IsDirty && <span className="workout-menu-ribbon__dirty" data-tip="未保存の変更" />}
        <div className="menu-ribbon__spacer" />
        {mediaList.map((m) => {
          const Icon = MEDIA_ICONS[m];
          return (
            <button
              key={m}
              className={`workout-menu-ribbon__media-tab${area.Media === m ? ' workout-menu-ribbon__media-tab--active' : ''}`}
              data-tip={MEDIA_LABELS[m]}
              onClick={() => area.SetMedia(m)}
            >
              <Icon size={12} />
            </button>
          );
        })}
        <div className="menu-ribbon__sep" />
        <button
          className="workout-menu-ribbon__media-tab"
          data-tip="保存 (Ctrl+S)"
          disabled={!think?.IsDirty}
          onClick={() => think && void app.Vault.SaveThink(think)}
        >
          <IconSave size={12} />
        </button>
        <button
          className="workout-menu-ribbon__media-tab"
          data-tip="ペインを閉じる"
          onClick={() => app.Workout.CloseArea(area.ID)}
        >
          <IconX size={12} />
        </button>
      </div>
      <div className="workout-area-body">
        {!think && <div className="workout-empty__desc">リソースが見つかりません</div>}
        {think && !think.ContentLoaded && <div className="workout-empty__desc">読み込み中…</div>}
        {think && think.ContentLoaded && (
          <>
            {area.Media === 'texteditor' && <TextEditorMedia think={think} areaId={area.ID} />}
            {area.Media === 'markdown' && <MarkdownMedia think={think} />}
            {area.Media === 'datagrid' && <DataGridMedia think={think} areaId={area.ID} />}
            {area.Media === 'card' && <CardMedia think={think} />}
            {area.Media === 'graph' && <GraphMedia think={think} />}
            {area.Media === 'chat' && <ChatMedia think={think} />}
          </>
        )}
      </div>
    </div>
  );
}
