/**
 * WorkoutSettingPanel.tsx
 */

import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import type { SettingsType } from './WorkoutRibbon';
import { WORKOUT_SETTINGS } from './WorkoutRibbon';
import './WorkoutSettingPanel.css';

// ── 方向アイコン ──────────────────────────────────────────────────────────

type Dir = 'right' | 'left' | 'up' | 'down';

const DIR_DEG: Record<Dir, number> = { right: 0, left: 180, up: -90, down: 90 };

/** ⏩ を回転して分割方向を示す */
function SplitIcon({ dir }: { dir: Dir }) {
  return (
    <span className="ws-icon" style={{ transform: `rotate(${DIR_DEG[dir]}deg)` }}>
      ⏩
    </span>
  );
}

/** ⏯ を回転して追加方向を示す */
function AddIcon({ dir }: { dir: Dir }) {
  return (
    <span className="ws-icon" style={{ transform: `rotate(${DIR_DEG[dir]}deg)` }}>
      ⏯
    </span>
  );
}

// ── Props ────────────────────────────────────────────────────────────────

interface Props {
  activeSettings: SettingsType;
  panel:          TTWorkoutPanel;
  width:          number;
  onSplitLeft:    () => void;
  onSplitRight:   () => void;
  onSplitAbove:   () => void;
  onSplitBelow:   () => void;
  onAddLeft:      () => void;
  onAddRight:     () => void;
  onAddTop:       () => void;
  onAddBottom:    () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export function WorkoutSettingPanel({
  activeSettings, panel, width,
  onSplitLeft, onSplitRight, onSplitAbove, onSplitBelow,
  onAddLeft, onAddRight, onAddTop, onAddBottom,
}: Props) {
  const hasFocus  = panel.Layout !== null;
  const entry     = WORKOUT_SETTINGS.find(s => s.type === activeSettings);
  const panelName = entry?.name ?? '';

  return (
    <div className="workout-setting-panel" style={{ width }}>

      <div className="workout-setting-panel__header">{panelName}</div>

      <div className="workout-setting-panel__body">
        {activeSettings === 'workout' ? (
          <>
            {/* エリア分割 */}
            <div className="workout-setting-panel__section">
              <span className="workout-setting-panel__section-label">エリア分割</span>
              <div className="workout-setting-panel__icon-row">
                <button
                  className="workout-setting-panel__icon-btn"
                  onClick={hasFocus ? onSplitLeft : undefined}
                  disabled={!hasFocus}
                  title="左に分割"
                >
                  <SplitIcon dir="left" />
                </button>
                <button
                  className="workout-setting-panel__icon-btn"
                  onClick={hasFocus ? onSplitRight : undefined}
                  disabled={!hasFocus}
                  title="右に分割"
                >
                  <SplitIcon dir="right" />
                </button>
                <button
                  className="workout-setting-panel__icon-btn"
                  onClick={hasFocus ? onSplitAbove : undefined}
                  disabled={!hasFocus}
                  title="上に分割"
                >
                  <SplitIcon dir="up" />
                </button>
                <button
                  className="workout-setting-panel__icon-btn"
                  onClick={hasFocus ? onSplitBelow : undefined}
                  disabled={!hasFocus}
                  title="下に分割"
                >
                  <SplitIcon dir="down" />
                </button>
              </div>
            </div>

            <div className="workout-setting-panel__divider" />

            {/* エリア追加 */}
            <div className="workout-setting-panel__section">
              <span className="workout-setting-panel__section-label">エリア追加</span>
              <div className="workout-setting-panel__icon-row">
                <button
                  className="workout-setting-panel__icon-btn"
                  onClick={onAddLeft}
                  title="左端に追加"
                >
                  <AddIcon dir="left" />
                </button>
                <button
                  className="workout-setting-panel__icon-btn"
                  onClick={onAddRight}
                  title="右端に追加"
                >
                  <AddIcon dir="right" />
                </button>
                <button
                  className="workout-setting-panel__icon-btn"
                  onClick={onAddTop}
                  title="上端に追加"
                >
                  <AddIcon dir="up" />
                </button>
                <button
                  className="workout-setting-panel__icon-btn"
                  onClick={onAddBottom}
                  title="下端に追加"
                >
                  <AddIcon dir="down" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="workout-setting-panel__placeholder">
            {panelName} の設定は今後追加予定です。
          </div>
        )}
      </div>

    </div>
  );
}
