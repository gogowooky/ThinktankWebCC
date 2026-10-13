import { ChevronDown, ChevronRight, File, FileText, FileClock, DatabaseBackup, Save, Mic, MicOff, Eraser, FilePen, FileX, FileInput } from 'lucide-react';
import { TTActions } from '../../../views/TTActions';
import { TTShortcutManager } from '../../../views/TTShortcutManager';
import { isUnset, parseAttrs, styleStatusId } from '../../../utils/defaultColor';
import type { DiscussSettingsContext } from './types';
import { TEXT_EDITOR_BASE_COLORS, TEXT_EDITOR_TAG_COLORS, ColorStyleRow, MarkStyleRows } from './ColorSettings';
import { DatabaseArrowDown } from './SettingsIcons';
const BINDING_ROWS: { label: string; memo: string; actionPrefix: string; }[] = [
  { label: 'キー設定', memo: 'ThinktankKeyBinding', actionPrefix: 'TextEditor.KeyBinding' },
  { label: '色設定', memo: 'ThinktankColorBinding', actionPrefix: 'TextEditor.ColorBinding' },
  { label: 'タグ設定', memo: 'ThinktankSearchTag', actionPrefix: 'TextEditor.SearchTag' },
];

type Props = Pick<DiscussSettingsContext,
  'panel'
  | 'onCreateMemo'
  | 'onReadMemo'
  | 'onSaveMemo'
  | 'firstTexteditorRef'
  | 'isDisplaySettingsOpen'
  | 'setIsDisplaySettingsOpen'
  | 'isColorSettingsOpen'
  | 'setIsColorSettingsOpen'
  | 'isCommentColorOpen'
  | 'setIsCommentColorOpen'
  | 'isBulletColorOpen'
  | 'setIsBulletColorOpen'
  | 'isSectionColorOpen'
  | 'setIsSectionColorOpen'
  | 'isHighlightColorOpen'
  | 'setIsHighlightColorOpen'
  | 'isMemoSettingsOpen'
  | 'setIsMemoSettingsOpen'
  | 'isEditSettingsOpen'
  | 'setIsEditSettingsOpen'
  | 'isKeySettingsOpen'
  | 'setIsKeySettingsOpen'
  | 'voiceSupported'
  | 'isVoiceListening'
  | 'voiceError'
  | 'handleVoiceMicOn'
  | 'handleVoiceMicOff'
  | 'handleVoiceEraser'
>;

export function TextEditorSettings({
  panel,
  onCreateMemo,
  onReadMemo,
  onSaveMemo,
  firstTexteditorRef,
  isDisplaySettingsOpen,
  setIsDisplaySettingsOpen,
  isColorSettingsOpen,
  setIsColorSettingsOpen,
  isCommentColorOpen,
  setIsCommentColorOpen,
  isBulletColorOpen,
  setIsBulletColorOpen,
  isSectionColorOpen,
  setIsSectionColorOpen,
  isHighlightColorOpen,
  setIsHighlightColorOpen,
  isMemoSettingsOpen,
  setIsMemoSettingsOpen,
  isEditSettingsOpen,
  setIsEditSettingsOpen,
  isKeySettingsOpen,
  setIsKeySettingsOpen,
  voiceSupported,
  isVoiceListening,
  voiceError,
  handleVoiceMicOn,
  handleVoiceMicOff,
  handleVoiceEraser,
}: Props) {
  return (<>
    {/* メモ操作 */}
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsMemoSettingsOpen(!isMemoSettingsOpen)}
      >
        {isMemoSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>メモ</span>
      </div>

      {isMemoSettingsOpen && (
        <div className="discuss-setting-area__section-content">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <span className="discuss-setting-area__color-label" style={{ width: '28px', flexShrink: 0 }}>新規</span>
            <div className="discuss-setting-area__icon-row" style={{ flex: 1 }}>
              <button
                ref={firstTexteditorRef}
                className="discuss-setting-area__icon-btn"
                onClick={onCreateMemo}
                data-tip="新規メモファイルを作成"
                data-tip-side="top-start"
              >
                <File size={16} className="ws-icon" />
              </button>
              <button className="discuss-setting-area__icon-btn"
                onClick={onReadMemo}
                data-tip="テキスト・HTMLファイルを読み込む"
                aria-label="テキスト・HTMLファイルを読み込む"
                data-tip-side="top-start"
              >
                <FileText size={16} className="ws-icon" />
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <span className="discuss-setting-area__color-label" style={{ width: '28px', flexShrink: 0 }}>保存</span>
            <div className="discuss-setting-area__icon-row" style={{ flex: 1 }}>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={onSaveMemo}
                data-tip="表示中のメモ・HTML資料をファイルで保存"
                data-tip-side="top-start"
              >
                <Save size={16} className="ws-icon" />
              </button>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={() => TTActions.Execute('Application.Resource.ExportToLocal')}
                data-tip="BQ保存済みThinkファイルをローカルにエクスポート"
                data-tip-side="top-start"
              >
                <DatabaseArrowDown size={16} className="ws-icon" />
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="discuss-setting-area__color-label" style={{ width: '28px', flexShrink: 0 }}>巻戻</span>
            <div className="discuss-setting-area__icon-row" style={{ flex: 1 }}>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={() => TTActions.Execute('Application.Resource.RollbackFocusedThink')}
                data-tip="直前にフォーカスされたThinkファイル1つをBQで1時間前の状態に戻す"
                data-tip-side="top-start"
              >
                <FileClock size={16} className="ws-icon" />
              </button>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={() => TTActions.Execute('Application.Resource.RollbackAll')}
                data-tip="BQ全体を1時間前の状態に戻す"
                data-tip-side="top-start"
              >
                <DatabaseBackup size={16} className="ws-icon" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    {/* 編集 */}
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsEditSettingsOpen(!isEditSettingsOpen)}
      >
        {isEditSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>編集</span>
      </div>

      {isEditSettingsOpen && (
        <div className="discuss-setting-area__section-content">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="discuss-setting-area__color-label" style={{ width: '56px', flexShrink: 0 }}>音声入力</span>
            <div className="discuss-setting-area__icon-row" style={{ flex: 1 }}>
              <button
                className={`discuss-setting-area__icon-btn${isVoiceListening ? ' discuss-setting-area__icon-btn--active' : ''}`}
                onClick={handleVoiceMicOn}
                disabled={!voiceSupported}
                data-tip={voiceSupported ? '音声入力をONにする' : 'このブラウザは音声入力に対応していません'}
                data-tip-side="top-start"
              >
                <Mic size={16} className="ws-icon" />
              </button>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={handleVoiceMicOff}
                disabled={!voiceSupported}
                data-tip="音声入力をOFFにする"
                data-tip-side="top-start"
              >
                <MicOff size={16} className="ws-icon" />
              </button>
              <button
                className="discuss-setting-area__icon-btn"
                onClick={handleVoiceEraser}
                disabled={!voiceSupported}
                data-tip="音声入力したテキストを取り消す"
                data-tip-side="top-start"
              >
                <Eraser size={16} className="ws-icon" />
              </button>
            </div>
          </div>
          {voiceError && (
            <div style={{
              fontSize: 'calc(10px * var(--tt-font-scale, 1))',
              color: 'var(--text-error)',
              marginTop: '4px',
              lineHeight: 1.4,
            }}>
              {voiceError}
            </div>
          )}
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    {/* 設定 */}
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsKeySettingsOpen(!isKeySettingsOpen)}
      >
        {isKeySettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>設定</span>
      </div>

      {isKeySettingsOpen && (
        <div className="discuss-setting-area__section-content">
          {BINDING_ROWS.map(({ label, memo, actionPrefix }) => (
            <div key={actionPrefix} style={{ display: 'flex', alignItems: 'center' }}>
              <span className="discuss-setting-area__color-label" style={{ width: '56px', flexShrink: 0 }}>{label}</span>
              <div className="discuss-setting-area__icon-row" style={{ flex: 1 }}>
                <button
                  className="discuss-setting-area__icon-btn"
                  onClick={() => TTShortcutManager.instance.executeActionDirect(`${actionPrefix}.Load`)}
                  data-tip={`${memo}から読み取る`}
                  data-tip-side="top-start"
                >
                  <FilePen size={16} className="ws-icon" />
                </button>
                <button
                  className="discuss-setting-area__icon-btn"
                  onClick={() => TTShortcutManager.instance.executeActionDirect(`${actionPrefix}.Reset`)}
                  data-tip={`${label}をdefaultに戻す`}
                  data-tip-side="top-start"
                >
                  <FileX size={16} className="ws-icon" />
                </button>
                <button
                  className="discuss-setting-area__icon-btn"
                  onClick={() => TTShortcutManager.instance.executeActionDirect(`${actionPrefix}.Save`)}
                  data-tip={`${memo}に書き戻す`}
                  data-tip-side="top-start"
                >
                  <FileInput size={16} className="ws-icon" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsDisplaySettingsOpen(!isDisplaySettingsOpen)}
      >
        {isDisplaySettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>表示設定</span>
      </div>

      {isDisplaySettingsOpen && (
        <div className="discuss-setting-area__section-content">
          <label className="discuss-setting-area__checkbox-label">
            <input
              type="checkbox"
              checked={panel.TextEditor.LineNumbers.IsVisible}
              onChange={e => panel.SetTextEditorLineNumbersVisible(e.target.checked)}
            />
            <span className="discuss-setting-area__checkbox-text">行番号</span>
          </label>

          <label className="discuss-setting-area__checkbox-label">
            <input
              type="checkbox"
              checked={panel.TextEditor.WordWrap.IsVisible}
              onChange={e => panel.SetTextEditorWordWrapVisible(e.target.checked)}
            />
            <span className="discuss-setting-area__checkbox-text">Wordwrap</span>
          </label>

          <label className="discuss-setting-area__checkbox-label">
            <input
              type="checkbox"
              checked={panel.TextEditor.Minimap.IsVisible}
              onChange={e => panel.SetTextEditorMinimapVisible(e.target.checked)}
            />
            <span className="discuss-setting-area__checkbox-text">ミニマップ</span>
          </label>

          <label className="discuss-setting-area__checkbox-label">
            <input
              type="checkbox"
              checked={panel.TextEditor.FullWidthSpace.IsVisible}
              onChange={e => panel.SetTextEditorFullWidthSpaceVisible(e.target.checked)}
            />
            <span className="discuss-setting-area__checkbox-text">全角スペース</span>
          </label>

          <label className="discuss-setting-area__checkbox-label">
            <input
              type="checkbox"
              checked={panel.TextEditor.UnicodeHighlight.IsVisible}
              onChange={e => panel.SetTextEditorUnicodeHighlightVisible(e.target.checked)}
            />
            <span className="discuss-setting-area__checkbox-text">特殊文字警告</span>
          </label>

          <label className="discuss-setting-area__checkbox-label">
            <input
              type="checkbox"
              checked={panel.TextEditor.BracketPairColorization.IsVisible}
              onChange={e => panel.SetTextEditorBracketPairColorizationVisible(e.target.checked)}
            />
            <span className="discuss-setting-area__checkbox-text">括弧対応</span>
          </label>
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsColorSettingsOpen(!isColorSettingsOpen)}
      >
        {isColorSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>文字色</span>
      </div>

      {isColorSettingsOpen && (
        <div className="discuss-setting-area__section-content">
          {/* エディタの基本色。docs/DefaultColor.md の各StatusIDを直接編集する（Attrs は扱わない）*/}
          {TEXT_EDITOR_BASE_COLORS.map((row, rowIndex) => (
            <div key={rowIndex} className="discuss-setting-area__color-row">
              {row.map(({ statusId, label, hasColor }, cellIndex) => {
                const style = panel.GetColorStatus(statusId);
                return (
                  <div key={statusId} className="discuss-setting-area__color-cell">
                    <span className={`discuss-setting-area__color-label${cellIndex === 0 ? ' discuss-setting-area__swatch-label' : ''}`}>{label}</span>
                    {hasColor && (
                      <input
                        type="color"
                        className="discuss-setting-area__color-picker"
                        value={isUnset(style.Color) ? '#000000' : style.Color.slice(0, 7)}
                        onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.value)}
                        data-tip={`${label}の文字色`}
                      />
                    )}
                    <input
                      type="color"
                      className="discuss-setting-area__color-picker"
                      value={isUnset(style.BgColor) ? '#ffffff' : style.BgColor.slice(0, 7)}
                      onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.value)}
                      data-tip={`${label}の背景色`}
                    />
                  </div>
                );
              })}
            </div>
          ))}

          {/* TextEditor.CurrentEditor.DoOnCursorPos が認識する Url / File / Tag */}
          {TEXT_EDITOR_TAG_COLORS.map(({ statusId, label }) => (
            <ColorStyleRow key={statusId} panel={panel} statusId={statusId} label={label} />
          ))}
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    {/* コメント色（TextEditor.Comment.Marks の各記号 → Comment.StyleN）*/}
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsCommentColorOpen(!isCommentColorOpen)}
      >
        {isCommentColorOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>コメント色</span>
      </div>
      {isCommentColorOpen && (
        <div className="discuss-setting-area__section-content">
          <MarkStyleRows panel={panel} kind="Comment" />
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    {/* 項目色（TextEditor.Bullet.Marks の各記号 → Bullet.StyleN）*/}
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsBulletColorOpen(!isBulletColorOpen)}
      >
        {isBulletColorOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>項目色</span>
      </div>
      {isBulletColorOpen && (
        <div className="discuss-setting-area__section-content">
          <MarkStyleRows panel={panel} kind="Bullet" />
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    {/* セクション（見出し）色設定 */}
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsSectionColorOpen(!isSectionColorOpen)}
      >
        {isSectionColorOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>セクション色</span>
      </div>

      {isSectionColorOpen && (
        <div className="discuss-setting-area__section-content">
          {[1, 2, 3, 4, 5, 6].map(level => {
            const statusId = styleStatusId('Heading', level);
            const style = panel.GetColorStatus(statusId);
            const fw = ['１', '２', '３', '４', '５', '６'][level - 1];
            const attrs = parseAttrs(style.Attrs);
            const hasBg = !isUnset(style.BgColor);
            return (
              <div key={level} className="discuss-setting-area__heading-style-row">
                <span className="discuss-setting-area__heading-style-label">セクション{fw}</span>
                <input
                  type="color"
                  className="discuss-setting-area__color-picker"
                  value={isUnset(style.Color) ? '#000000' : style.Color.slice(0, 7)}
                  onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.value)}
                  data-tip={`セクション${fw}の文字色`}
                />
                <label className="discuss-setting-area__small-checkbox">
                  <input
                    type="checkbox"
                    checked={attrs.has('bold')}
                    onChange={e => panel.ToggleColorStatusAttr(statusId, 'bold', e.target.checked)}
                  />
                  B
                </label>
                <label className="discuss-setting-area__small-checkbox">
                  <input
                    type="checkbox"
                    checked={attrs.has('underline')}
                    onChange={e => panel.ToggleColorStatusAttr(statusId, 'underline', e.target.checked)}
                  />
                  U
                </label>
                <label className="discuss-setting-area__small-checkbox">
                  <input
                    type="checkbox"
                    checked={hasBg}
                    onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.checked ? '#ffffff' : 'undefined')}
                  />
                  BG
                </label>
                {hasBg && (
                  <input
                    type="color"
                    className="discuss-setting-area__color-picker"
                    value={style.BgColor.slice(0, 7)}
                    onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.value)}
                    data-tip={`セクション${fw}の背景色`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    {/* ハイライトグループ色設定 */}
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsHighlightColorOpen(!isHighlightColorOpen)}
      >
        {isHighlightColorOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>ハイライト色</span>
      </div>

      {isHighlightColorOpen && (
        <div className="discuss-setting-area__section-content">
          {[1, 2, 3, 4, 5, 6].map(group => {
            const statusId = styleStatusId('Highlighter', group);
            const style = panel.GetColorStatus(statusId);
            const fw = ['１', '２', '３', '４', '５', '６'][group - 1];
            const attrs = parseAttrs(style.Attrs);
            const hasBg = !isUnset(style.BgColor);
            const hasFg = !isUnset(style.Color);
            return (
              <div key={group} className="discuss-setting-area__color-row" style={{ gap: '4px' }}>
                <span className="discuss-setting-area__color-label" style={{ minWidth: '50px' }}>グループ{fw}</span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  <label className="discuss-setting-area__small-checkbox">
                    <input
                      type="checkbox"
                      checked={hasBg}
                      onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.checked ? '#ffffff' : 'undefined')}
                    />
                    BG
                  </label>
                  {hasBg && (
                    <input
                      type="color"
                      className="discuss-setting-area__color-picker"
                      value={style.BgColor.slice(0, 7)}
                      onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.value)}
                      data-tip={`グループ${fw}の背景色`}
                    />
                  )}

                  <label className="discuss-setting-area__small-checkbox">
                    <input
                      type="checkbox"
                      checked={hasFg}
                      onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.checked ? '#000000' : 'undefined')}
                    />
                    FG
                  </label>
                  {hasFg && (
                    <input
                      type="color"
                      className="discuss-setting-area__color-picker"
                      value={style.Color.slice(0, 7)}
                      onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.value)}
                      data-tip={`グループ${fw}の文字色`}
                    />
                  )}

                  <label className="discuss-setting-area__small-checkbox">
                    <input
                      type="checkbox"
                      checked={attrs.has('bold')}
                      onChange={e => panel.ToggleColorStatusAttr(statusId, 'bold', e.target.checked)}
                    />
                    B
                  </label>
                  <label className="discuss-setting-area__small-checkbox">
                    <input
                      type="checkbox"
                      checked={attrs.has('underline')}
                      onChange={e => panel.ToggleColorStatusAttr(statusId, 'underline', e.target.checked)}
                    />
                    U
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </>);
}
