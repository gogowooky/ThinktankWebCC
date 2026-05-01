/**
 * WorkoutPanelRibbon.tsx
 * WorkoutPanel 上部のリボンバー。
 *
 * 機能:
 *   - 右にエリア追加（フォーカスペインを縦分割）
 *   - 下にエリア追加（フォーカスペインを横分割）
 */

import { LogOut } from 'lucide-react';
import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import './WorkoutPanelRibbon.css';

// ── 縦分割アイコン（右に追加） ────────────────────────────────────────
function SplitRightIcon() {
  return <LogOut size={16} />;
}

// ── 横分割アイコン（下に追加） ────────────────────────────────────────
function SplitBelowIcon() {
  return <LogOut size={16} style={{ transform: 'rotate(90deg)' }} />;
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
