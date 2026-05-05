/**
 * WorkoutSettingPanel.tsx
 */

import { useState } from 'react';
import {
  GalleryThumbnails,
  PanelLeftDashed,
  PanelRightDashed,
  PanelTopDashed,
  PanelBottomDashed,
  SquareX,
  CopyX,
  ChevronsLeftRightEllipsis,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import type { SettingsType } from './WorkoutRibbon';
import { WORKOUT_SETTINGS } from './WorkoutRibbon';
import './WorkoutSettingPanel.css';

// ── 方向アイコン ──────────────────────────────────────────────────────────

type Dir = 'right' | 'left' | 'up' | 'down';

function SplitIcon({ dir }: { dir: Dir }) {
  switch (dir) {
    case 'left': return <PanelRightDashed size={16} className="ws-icon" />;
    case 'right': return <PanelLeftDashed size={16} className="ws-icon" />;
    case 'up': return <PanelBottomDashed size={16} className="ws-icon" />;
    case 'down': return <PanelTopDashed size={16} className="ws-icon" />;
  }
}

function AddIcon({ dir }: { dir: Dir }) {
  let transform = '';
  switch (dir) {
    case 'left': transform = 'rotate(-90deg)'; break;
    case 'right': transform = 'rotate(90deg)'; break;
    case 'up': transform = 'none'; break;
    case 'down': transform = 'rotate(180deg)'; break;
  }
  return <GalleryThumbnails size={16} className="ws-icon" style={{ transform }} />;
}

// ── Props ────────────────────────────────────────────────────────────────

interface Props {
  activeSettings:   SettingsType;
  panel:            TTWorkoutPanel;
  width:            number;
  onSplitLeft:      () => void;
  onSplitRight:     () => void;
  onSplitAbove:     () => void;
  onSplitBelow:     () => void;
  onAddLeft:        () => void;
  onAddRight:       () => void;
  onAddTop:         () => void;
  onAddBottom:      () => void;
  onRemoveFocused:  () => void;
  onClearAll:       () => void;
  onEqualizeWidths: () => void;
  onEqualizeHeights:() => void;
}

// ── Component ────────────────────────────────────────────────────────────

export function WorkoutSettingPanel({
  activeSettings, panel, width,
  onSplitLeft, onSplitRight, onSplitAbove, onSplitBelow,
  onAddLeft, onAddRight, onAddTop, onAddBottom,
  onRemoveFocused, onClearAll, onEqualizeWidths, onEqualizeHeights,
}: Props) {
  const hasFocus  = panel.Layout !== null;
  const entry     = WORKOUT_SETTINGS.find(s => s.type === activeSettings);
  const panelName = entry?.name ?? '';

  const [isAreaSettingsOpen,      setIsAreaSettingsOpen]      = useState(true);
  const [isDisplaySettingsOpen,   setIsDisplaySettingsOpen]   = useState(true);
  const [isColorSettingsOpen,     setIsColorSettingsOpen]     = useState(true);
  const [isHighlightColorOpen,    setIsHighlightColorOpen]    = useState(true);

  return (
    <div className="workout-setting-panel" style={{ width }}>

      <div className="workout-setting-panel__header">Workout&gt;{panelName}</div>

      <div className="workout-setting-panel__body">
        {activeSettings === 'workout' ? (
          <>
            {/* エリア管理 */}
            <div className="workout-setting-panel__section">
              <div 
                className="workout-setting-panel__section-header"
                onClick={() => setIsAreaSettingsOpen(!isAreaSettingsOpen)}
              >
                {isAreaSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-panel__section-label" style={{ marginBottom: 0 }}>エリア</span>
              </div>
              
              {isAreaSettingsOpen && (
                <div className="workout-setting-panel__section-content">
                  {/* 分割 */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>分割</span>
                    <div className="workout-setting-panel__icon-row" style={{ flex: 1 }}>
                      <button
                        className="workout-setting-panel__icon-btn"
                        onClick={hasFocus ? onSplitLeft : undefined}
                        disabled={!hasFocus}
                        title="左に分割して新Pane追加"
                      >
                        <SplitIcon dir="left" />
                      </button>
                      <button
                        className="workout-setting-panel__icon-btn"
                        onClick={hasFocus ? onSplitRight : undefined}
                        disabled={!hasFocus}
                        title="右に分割して新Pane追加"
                      >
                        <SplitIcon dir="right" />
                      </button>
                      <button
                        className="workout-setting-panel__icon-btn"
                        onClick={hasFocus ? onSplitAbove : undefined}
                        disabled={!hasFocus}
                        title="上に分割して新Pane追加"
                      >
                        <SplitIcon dir="up" />
                      </button>
                      <button
                        className="workout-setting-panel__icon-btn"
                        onClick={hasFocus ? onSplitBelow : undefined}
                        disabled={!hasFocus}
                        title="下に分割して新Pane追加"
                      >
                        <SplitIcon dir="down" />
                      </button>
                    </div>
                  </div>

                  {/* 追加 */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>追加</span>
                    <div className="workout-setting-panel__icon-row" style={{ flex: 1 }}>
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

                  {/* 消去 */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>消去</span>
                    <div className="workout-setting-panel__icon-row" style={{ flex: 1 }}>
                      <button
                        className="workout-setting-panel__icon-btn workout-setting-panel__icon-btn--danger"
                        onClick={hasFocus ? onRemoveFocused : undefined}
                        disabled={!hasFocus}
                        title="フォーカスペインを消去"
                      >
                        <SquareX size={16} className="ws-icon" />
                      </button>
                      <button
                        className="workout-setting-panel__icon-btn workout-setting-panel__icon-btn--danger"
                        onClick={onClearAll}
                        title="すべてのペインを全消去"
                      >
                        <CopyX size={16} className="ws-icon" />
                      </button>
                    </div>
                  </div>

                  {/* 均等 */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>均等</span>
                    <div className="workout-setting-panel__icon-row" style={{ flex: 1 }}>
                      <button
                        className="workout-setting-panel__icon-btn"
                        onClick={hasFocus ? onEqualizeWidths : undefined}
                        disabled={!hasFocus}
                        title="幅を均等化"
                      >
                        <ChevronsLeftRightEllipsis size={16} className="ws-icon" />
                      </button>
                      <button
                        className="workout-setting-panel__icon-btn"
                        onClick={hasFocus ? onEqualizeHeights : undefined}
                        disabled={!hasFocus}
                        title="高さを均等化"
                      >
                        <ChevronsLeftRightEllipsis size={16} className="ws-icon" style={{ transform: 'rotate(90deg)' }} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : activeSettings === 'texteditor' ? (
          <>
            <div className="workout-setting-panel__section">
              <div 
                className="workout-setting-panel__section-header"
                onClick={() => setIsDisplaySettingsOpen(!isDisplaySettingsOpen)}
              >
                {isDisplaySettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-panel__section-label" style={{ marginBottom: 0 }}>表示設定</span>
              </div>
              
              {isDisplaySettingsOpen && (
                <div className="workout-setting-panel__section-content">
                  <label className="workout-setting-panel__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.EditorLineNumbers}
                      onChange={e => panel.SetEditorLineNumbers(e.target.checked)}
                    />
                    <span className="workout-setting-panel__checkbox-text">行番号</span>
                  </label>

                  <label className="workout-setting-panel__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.EditorWordWrap}
                      onChange={e => panel.SetEditorWordWrap(e.target.checked)}
                    />
                    <span className="workout-setting-panel__checkbox-text">Wordwrap</span>
                  </label>

                  <label className="workout-setting-panel__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.EditorMinimap}
                      onChange={e => panel.SetEditorMinimap(e.target.checked)}
                    />
                    <span className="workout-setting-panel__checkbox-text">ミニマップ</span>
                  </label>

                  <label className="workout-setting-panel__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.EditorShowFullWidthSpace}
                      onChange={e => panel.SetEditorShowFullWidthSpace(e.target.checked)}
                    />
                    <span className="workout-setting-panel__checkbox-text">全角スペース</span>
                  </label>

                  <label className="workout-setting-panel__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.EditorUnicodeHighlight}
                      onChange={e => panel.SetEditorUnicodeHighlight(e.target.checked)}
                    />
                    <span className="workout-setting-panel__checkbox-text">特殊文字警告</span>
                  </label>

                  <label className="workout-setting-panel__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.EditorBracketPairColorization}
                      onChange={e => panel.SetEditorBracketPairColorization(e.target.checked)}
                    />
                    <span className="workout-setting-panel__checkbox-text">括弧対応</span>
                  </label>
                </div>
              )}
            </div>
            <div className="workout-setting-panel__divider" />

            <div className="workout-setting-panel__section">
              <div 
                className="workout-setting-panel__section-header"
                onClick={() => setIsColorSettingsOpen(!isColorSettingsOpen)}
              >
                {isColorSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-panel__section-label" style={{ marginBottom: 0 }}>文字設定</span>
              </div>

              {isColorSettingsOpen && (
                <div className="workout-setting-panel__section-content">
                  <div className="workout-setting-panel__color-row">
                    <span className="workout-setting-panel__color-label">背景</span>
                    <input
                      type="color"
                      className="workout-setting-panel__color-picker"
                      value={panel.EditorBackground}
                      onChange={e => panel.SetEditorBackground(e.target.value)}
                    />
                  </div>

                  <div className="workout-setting-panel__color-row">
                    <span className="workout-setting-panel__color-label">文字</span>
                    <input
                      type="color"
                      className="workout-setting-panel__color-picker"
                      value={panel.EditorForeground}
                      onChange={e => panel.SetEditorForeground(e.target.value)}
                    />
                  </div>

                  {[1, 2, 3, 4, 5].map(level => {
                    const style = panel.EditorHeadingStyles[level - 1];
                    const fw = ['１', '２', '３', '４', '５'][level - 1];
                    return (
                      <div key={level} className="workout-setting-panel__heading-style-row">
                        <span className="workout-setting-panel__heading-style-label">セクション{fw}</span>
                        <input
                          type="color"
                          className="workout-setting-panel__color-picker"
                          value={style.color}
                          onChange={e => panel.SetEditorHeadingStyle(level, { color: e.target.value })}
                          title={`セクション${fw}の文字色`}
                        />
                        <label className="workout-setting-panel__small-checkbox">
                          <input
                            type="checkbox"
                            checked={style.bold}
                            onChange={e => panel.SetEditorHeadingStyle(level, { bold: e.target.checked })}
                          />
                          B
                        </label>
                        <label className="workout-setting-panel__small-checkbox">
                          <input
                            type="checkbox"
                            checked={style.underline}
                            onChange={e => panel.SetEditorHeadingStyle(level, { underline: e.target.checked })}
                          />
                          U
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="workout-setting-panel__divider" />

            {/* ハイライトグループ色設定 */}
            <div className="workout-setting-panel__section">
              <div
                className="workout-setting-panel__section-header"
                onClick={() => setIsHighlightColorOpen(!isHighlightColorOpen)}
              >
                {isHighlightColorOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-panel__section-label" style={{ marginBottom: 0 }}>ハイライト色</span>
              </div>

              {isHighlightColorOpen && (
                <div className="workout-setting-panel__section-content">
                  {[1, 2, 3, 4, 5].map(group => {
                    const style = panel.EditorHighlightStyles[group - 1];
                    const fw = ['１', '２', '３', '４', '５'][group - 1];
                    return (
                      <div key={group} className="workout-setting-panel__color-row" style={{ padding: '2px 0px' }}>
                        <span className="workout-setting-panel__color-label">グループ{fw}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>背景</span>
                          <input
                            type="color"
                            className="workout-setting-panel__color-picker"
                            value={style.backgroundColor}
                            onChange={e => panel.SetEditorHighlightStyle(group - 1, { backgroundColor: e.target.value })}
                            title={`グループ${fw}の背景色`}
                          />
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginLeft: '4px' }}>文字</span>
                          <input
                            type="color"
                            className="workout-setting-panel__color-picker"
                            value={style.color}
                            onChange={e => panel.SetEditorHighlightStyle(group - 1, { color: e.target.value })}
                            title={`グループ${fw}の文字色`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
