/**
 * WorkoutPanelRibbon.tsx
 * WorkoutPanel 上部のリボンバー。
 *
 * 機能:
 *   - 右にエリア追加（フォーカスペインを縦分割）
 *   - 下にエリア追加（フォーカスペインを横分割）
 */

import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import './WorkoutPanelRibbon.css';

// ── 縦分割アイコン（右に追加） ────────────────────────────────────────
function SplitRightIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="currentColor">
      <rect x="0" y="0" width="8"  height="14" rx="1" opacity="0.85" />
      <rect x="12" y="0" width="8" height="14" rx="1" opacity="0.55" />
      {/* 分割線 */}
      <line x1="10" y1="2" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

// ── 横分割アイコン（下に追加） ────────────────────────────────────────
function SplitBelowIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="currentColor">
      <rect x="0" y="0"  width="20" height="5"  rx="1" opacity="0.85" />
      <rect x="0" y="9"  width="20" height="5"  rx="1" opacity="0.55" />
      {/* 分割線 */}
      <line x1="2" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

interface Props {
  panel:       TTWorkoutPanel;
  onAddRight:  () => void;
  onAddBelow:  () => void;
}

export function WorkoutPanelRibbon({ panel, onAddRight, onAddBelow }: Props) {
  const hasFocus = panel.Layout !== null;

  return (
    <div className="workout-panel-ribbon">

      {/* ── 右に追加 ──────────────────────────────────────── */}
      <button
        className="workout-panel-ribbon__add-btn"
        onClick={onAddRight}
        title="右にエリア追加（縦分割）"
        disabled={false}
      >
        <SplitRightIcon />
        <span>右に追加</span>
      </button>

      {/* ── 下に追加 ──────────────────────────────────────── */}
      <button
        className={[
          'workout-panel-ribbon__add-btn',
          !hasFocus ? 'workout-panel-ribbon__add-btn--disabled' : '',
        ].join(' ')}
        onClick={hasFocus ? onAddBelow : undefined}
        title="下にエリア追加（横分割）"
        disabled={!hasFocus}
      >
        <SplitBelowIcon />
        <span>下に追加</span>
      </button>

      {/* ── スペーサー ─────────────────────────────────────── */}
      <div className="workout-panel-ribbon__spacer" />

      {/* ── フォーカス表示 ─────────────────────────────────── */}
      {panel.FocusedAreaId && (
        <span className="workout-panel-ribbon__focus-label">
          {panel.GetArea(panel.FocusedAreaId)?.Title ?? ''}
        </span>
      )}

    </div>
  );
}
