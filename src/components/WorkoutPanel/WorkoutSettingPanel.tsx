/**
 * WorkoutSettingPanel.tsx
 * WorkoutRibbon の各設定ボタンに対応する設定パネル。
 *
 * - 上部: 設定名ヘッダー
 * - 本体: activeSettings タイプ別コンテンツ
 *   - workout   : エリア追加ボタン（右に追加 / 下に追加）
 *   - その他    : 将来の設定 UI 用プレースホルダー
 */

import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import type { SettingsType } from './WorkoutRibbon';
import { WORKOUT_SETTINGS } from './WorkoutRibbon';
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
  activeSettings: SettingsType;
  panel:          TTWorkoutPanel;
  width:          number;
  onAddRight:     () => void;
  onAddBelow:     () => void;
}

export function WorkoutSettingPanel({ activeSettings, panel, width, onAddRight, onAddBelow }: Props) {
  const hasFocus  = panel.Layout !== null;
  const entry     = WORKOUT_SETTINGS.find(s => s.type === activeSettings);
  const panelName = entry?.name ?? '';

  return (
    <div className="workout-setting-panel" style={{ width }}>

      {/* ヘッダー */}
      <div className="workout-setting-panel__header">
        {panelName}
      </div>

      {/* コンテンツ */}
      <div className="workout-setting-panel__body">
        {activeSettings === 'workout' ? (
          <div className="workout-setting-panel__section">
            <span className="workout-setting-panel__section-label">エリア追加</span>
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
        ) : (
          <div className="workout-setting-panel__placeholder">
            {panelName} の設定は今後追加予定です。
          </div>
        )}
      </div>

    </div>
  );
}
