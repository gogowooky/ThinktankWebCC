import { SquareX, CopyX, LibraryBig, ChevronsLeftRightEllipsis, ChevronDown, ChevronRight } from 'lucide-react';
import { isUnset } from '../../../utils/defaultColor';
import { TTUIStateManager } from '../../../views/TTUIStateManager';
import type { DiscussSettingsContext } from './types';
import { PANEL_COLOR_ROWS } from './ColorSettings';
import { SplitIcon, AddIcon } from './SettingsIcons';
type Props = Pick<DiscussSettingsContext,
  'panel'
  | 'onSplitLeft'
  | 'onSplitRight'
  | 'onSplitAbove'
  | 'onSplitBelow'
  | 'onAddLeft'
  | 'onAddRight'
  | 'onAddTop'
  | 'onAddBottom'
  | 'onRemoveFocused'
  | 'onClearAll'
  | 'onCloseNotInBundle'
  | 'hasBundle'
  | 'onEqualizeWidths'
  | 'onEqualizeHeights'
  | 'firstPanesRef'
  | 'hasFocus'
  | 'isActionSettingsOpen'
  | 'setIsActionSettingsOpen'
  | 'isPanelColorOpen'
  | 'setIsPanelColorOpen'
>;

export function PaneSettings({
  panel,
  onSplitLeft,
  onSplitRight,
  onSplitAbove,
  onSplitBelow,
  onAddLeft,
  onAddRight,
  onAddTop,
  onAddBottom,
  onRemoveFocused,
  onClearAll,
  onCloseNotInBundle,
  hasBundle,
  onEqualizeWidths,
  onEqualizeHeights,
  firstPanesRef,
  hasFocus,
  isActionSettingsOpen,
  setIsActionSettingsOpen,
  isPanelColorOpen,
  setIsPanelColorOpen,
}: Props) {
  return (<>
    {/* アクション管理 */}
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsActionSettingsOpen(!isActionSettingsOpen)}
      >
        {isActionSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>アクション</span>
      </div>

      {isActionSettingsOpen && (
        <div className="discuss-setting-area__section-content">
          {/* 分割 */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: 'calc(10px * var(--tt-font-scale, 1))', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>分割</span>
            <div className="discuss-setting-area__icon-row" style={{ flex: 1 }}>
              <div className="tooltip-wrapper" data-tip="左に分割して新Pane追加">
                <button
                  ref={firstPanesRef}
                  className="discuss-setting-area__icon-btn"
                  onClick={hasFocus ? onSplitLeft : undefined}
                  disabled={!hasFocus}
                >
                  <SplitIcon dir="left" />
                </button>
              </div>
              <div className="tooltip-wrapper" data-tip="右に分割して新Pane追加">
                <button
                  className="discuss-setting-area__icon-btn"
                  onClick={hasFocus ? onSplitRight : undefined}
                  disabled={!hasFocus}
                >
                  <SplitIcon dir="right" />
                </button>
              </div>
              <div className="tooltip-wrapper" data-tip="上に分割して新Pane追加">
                <button
                  className="discuss-setting-area__icon-btn"
                  onClick={hasFocus ? onSplitAbove : undefined}
                  disabled={!hasFocus}
                >
                  <SplitIcon dir="up" />
                </button>
              </div>
              <div className="tooltip-wrapper" data-tip="下に分割して新Pane追加">
                <button
                  className="discuss-setting-area__icon-btn"
                  onClick={hasFocus ? onSplitBelow : undefined}
                  disabled={!hasFocus}
                >
                  <SplitIcon dir="down" />
                </button>
              </div>
            </div>
          </div>

          {/* 追加 */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: 'calc(10px * var(--tt-font-scale, 1))', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>追加</span>
            <div className="discuss-setting-area__icon-row" style={{ flex: 1 }}>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={onAddLeft}
                data-tip="左端に追加"
              >
                <AddIcon dir="left" />
              </button>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={onAddRight}
                data-tip="右端に追加"
              >
                <AddIcon dir="right" />
              </button>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={onAddTop}
                data-tip="上端に追加"
              >
                <AddIcon dir="up" />
              </button>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={onAddBottom}
                data-tip="下端に追加"
              >
                <AddIcon dir="down" />
              </button>
            </div>
          </div>

          {/* 消去 */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: 'calc(10px * var(--tt-font-scale, 1))', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>消去</span>
            <div className="discuss-setting-area__icon-row" style={{ flex: 1 }}>
              <div className="tooltip-wrapper" data-tip="フォーカスペインを消去">
                <button
                  className="discuss-setting-area__icon-btn discuss-setting-area__icon-btn--danger"
                  onClick={hasFocus ? onRemoveFocused : undefined}
                  disabled={!hasFocus}
                >
                  <SquareX size={16} className="ws-icon" />
                </button>
              </div>
              <button
                className="discuss-setting-area__icon-btn discuss-setting-area__icon-btn--danger"
                onClick={onClearAll}
                data-tip="すべてのペインを全消去"
              >
                <CopyX size={16} className="ws-icon" />
              </button>
              <div className="tooltip-wrapper" data-tip="選択中BundleにないPaneをすべて消去">
                <button
                  className="discuss-setting-area__icon-btn discuss-setting-area__icon-btn--danger"
                  onClick={hasBundle ? onCloseNotInBundle : undefined}
                  disabled={!hasBundle}
                >
                  <LibraryBig size={16} className="ws-icon" />
                </button>
              </div>
            </div>
          </div>

          {/* 均等 */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 'calc(10px * var(--tt-font-scale, 1))', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>均等</span>
            <div className="discuss-setting-area__icon-row" style={{ flex: 1 }}>
              <div className="tooltip-wrapper" data-tip="幅を均等化">
                <button
                  className="discuss-setting-area__icon-btn"
                  onClick={hasFocus ? onEqualizeWidths : undefined}
                  disabled={!hasFocus}
                >
                  <ChevronsLeftRightEllipsis size={16} className="ws-icon" />
                </button>
              </div>
              <div className="tooltip-wrapper" data-tip="高さを均等化">
                <button
                  className="discuss-setting-area__icon-btn"
                  onClick={hasFocus ? onEqualizeHeights : undefined}
                  disabled={!hasFocus}
                >
                  <ChevronsLeftRightEllipsis size={16} className="ws-icon" style={{ transform: 'rotate(90deg)' }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    {/* パネル色（各パネルの基礎色。リボン・淡色・ホバー・文字色はここから自動で導かれる）*/}
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsPanelColorOpen(!isPanelColorOpen)}
      >
        {isPanelColorOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>パネル色</span>
      </div>

      {isPanelColorOpen && (
        <div className="discuss-setting-area__section-content">
          {PANEL_COLOR_ROWS.map(({ statusId, label, tip }) => {
            const style = panel.GetColorStatus(statusId);
            return (
              <div key={statusId} className="discuss-setting-area__heading-style-row">
                <span className="discuss-setting-area__heading-style-label discuss-setting-area__swatch-label">{label}</span>
                <input
                  type="color"
                  className="discuss-setting-area__color-picker"
                  value={isUnset(style.Color) ? '#000000' : style.Color.slice(0, 7)}
                  onChange={e => {
                    panel.SetColorStatus(statusId, 'Color', e.target.value);
                    // CSS変数への展開は AppLayout がこのキーの変更通知で行う
                    TTUIStateManager.instance.notifyPropertyChanged(`${statusId}.Color`);
                  }}
                  data-tip={tip}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  </>);
}
