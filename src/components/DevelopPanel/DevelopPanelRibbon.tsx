/**
 * DevelopPanelRibbon.tsx
 * DevelopPanel 上部のリボンバー。
 *
 * 機能:
 *   - 右にエリア追加（フォーカスペインを縦分割）
 *   - 下にエリア追加（フォーカスペインを横分割）
 */

import { LogOut } from 'lucide-react';
import type { TTDevelopPanel } from '../../views/TTDevelopPanel';
import './DevelopPanelRibbon.css';

// ── 縦分割アイコン（右に追加） ────────────────────────────────────────
function SplitRightIcon() {
  return <LogOut size={16} />;
}

// ── 横分割アイコン（下に追加） ────────────────────────────────────────
function SplitBelowIcon() {
  return <LogOut size={16} style={{ transform: 'rotate(90deg)' }} />;
}

interface Props {
  panel:       TTDevelopPanel;
  onAddRight:  () => void;
  onAddBelow:  () => void;
}

export function DevelopPanelRibbon({ panel, onAddRight, onAddBelow }: Props) {
  const hasFocus = panel.Layout !== null;

  return (
    <div className="develop-panel-ribbon">

      {/* ── 右に追加 ──────────────────────────────────────── */}
      <button
        className="develop-panel-ribbon__add-btn"
        onClick={onAddRight}
        data-tip="右にエリア追加（縦分割）"
        data-tip-side="bottom"
        disabled={false}
      >
        <SplitRightIcon />
        <span>右に追加</span>
      </button>

      {/* ── 下に追加 ──────────────────────────────────────── */}
      <button
        className={[
          'develop-panel-ribbon__add-btn',
          !hasFocus ? 'develop-panel-ribbon__add-btn--disabled' : '',
        ].join(' ')}
        onClick={hasFocus ? onAddBelow : undefined}
        data-tip="下にエリア追加（横分割）"
        data-tip-side="bottom"
        disabled={!hasFocus}
      >
        <SplitBelowIcon />
        <span>下に追加</span>
      </button>

      {/* ── スペーサー ─────────────────────────────────────── */}
      <div className="develop-panel-ribbon__spacer" />

      {/* ── フォーカス表示 ─────────────────────────────────── */}
      {panel.FocusedAreaId && (
        <span className="develop-panel-ribbon__focus-label">
          {panel.GetArea(panel.FocusedAreaId)?.Title ?? ''}
        </span>
      )}

    </div>
  );
}
