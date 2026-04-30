/**
 * WorkoutSettingPanel.tsx
 * WorkoutPanel の設定パネル（WorkoutRibbon の開閉ボタンで表示/非表示）。
 *
 * 内容:
 *   - 右にエリア追加（縦分割）
 *   - 下にエリア追加（横分割）
 */

import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import './WorkoutSettingPanel.css';

function SplitRightIcon() {
  return (
    <svg width="18" height="13" viewBox="0 0 20 14" fill="currentColor">
      <rect x="0"  y="0" width="8"  height="14" rx="1" opacity="0.85" />
      <rect x="12" y="0" width="8"  height="14" rx="1" opacity="0.55" />
      <line x1="10" y1="2" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function SplitBelowIcon() {
  return (
    <svg width="18" height="13" viewBox="0 0 20 14" fill="currentColor">
      <rect x="0" y="0"  width="20" height="5"  rx="1" opacity="0.85" />
      <rect x="0" y="9"  width="20" height="5"  rx="1" opacity="0.55" />
      <line x1="2" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

interface Props {
  panel:      TTWorkoutPanel;
  onAddRight: () => void;
  onAddBelow: () => void;
}

export function WorkoutSettingPanel({ panel, onAddRight, onAddBelow }: Props) {
  const hasFocus = panel.Layout !== null;

  return (
    <div className="workout-setting-panel">
      <div className="workout-setting-panel__section">
        <span className="workout-setting-panel__label">エリア追加</span>
        <button
          className="workout-setting-panel__btn"
          onClick={onAddRight}
          title="右にエリア追加（縦分割）"
        >
          <SplitRightIcon />
          <span>右に追加</span>
        </button>
        <button
          className={[
            'workout-setting-panel__btn',
            !hasFocus ? 'workout-setting-panel__btn--disabled' : '',
          ].join(' ')}
          onClick={hasFocus ? onAddBelow : undefined}
          disabled={!hasFocus}
          title="下にエリア追加（横分割）"
        >
          <SplitBelowIcon />
          <span>下に追加</span>
        </button>
      </div>
    </div>
  );
}
