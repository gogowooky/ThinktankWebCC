import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronRight, FilePlus, FileSpreadsheet, Save, WrapText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TTShortcutManager } from '../../../views/TTShortcutManager';
import { useAppUpdate } from '../../../hooks/useAppUpdate';
import type { DiscussSettingsContext } from './types';

// lucide-react 0.474 では text-wrap / text-align-* がまだ旧名（wrap-text / align-*）で提供されている
const TABLE_DISPLAY_ITEMS: { label: string; Icon: LucideIcon; actionId: string; isActive: (p: DiscussSettingsContext['panel']) => boolean; }[] = [
  { label: '折返し', Icon: WrapText,    actionId: 'Table.CellContent.Display:Toggle',  isActive: p => p.Table.CellContent.Display === 'FitToColumn' },
  { label: '左寄',   Icon: AlignLeft,   actionId: 'Table.CellContent.Position:Left',   isActive: p => p.Table.CellContent.Position === 'Left' },
  { label: '中央寄', Icon: AlignCenter, actionId: 'Table.CellContent.Position:Center', isActive: p => p.Table.CellContent.Position === 'Center' },
  { label: '右寄',   Icon: AlignRight,  actionId: 'Table.CellContent.Position:Right',  isActive: p => p.Table.CellContent.Position === 'Right' },
];

type Props = Pick<DiscussSettingsContext,
  'panel'
  | 'onCreateTable'
  | 'onReadTable'
  | 'onSaveTable'
  | 'firstDatagridRef'
  | 'isTableSettingsOpen'
  | 'setIsTableSettingsOpen'
  | 'isTableDisplaySettingsOpen'
  | 'setIsTableDisplaySettingsOpen'
>;

export function DataGridSettings({
  panel,
  onCreateTable,
  onReadTable,
  onSaveTable,
  firstDatagridRef,
  isTableSettingsOpen,
  setIsTableSettingsOpen,
  isTableDisplaySettingsOpen,
  setIsTableDisplaySettingsOpen,
}: Props) {
  useAppUpdate(panel);
  return (<>
    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsTableSettingsOpen(!isTableSettingsOpen)}
      >
        {isTableSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>テーブル</span>
      </div>

      {isTableSettingsOpen && (
        <div className="discuss-setting-area__section-content">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: 'calc(10px * var(--tt-font-scale, 1))', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>新規</span>
            <button
              ref={firstDatagridRef}
              className="discuss-setting-area__icon-btn"
              onClick={onCreateTable}
              data-tip="新規テーブルファイルを作成"
            >
              <FilePlus size={16} className="ws-icon" />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: 'calc(10px * var(--tt-font-scale, 1))', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>読取</span>
            <button
              className="discuss-setting-area__icon-btn"
              onClick={onReadTable}
              data-tip="CSV / XLSX を読み取って新規テーブルを作成"
            >
              <FileSpreadsheet size={16} className="ws-icon" />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 'calc(10px * var(--tt-font-scale, 1))', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>保存</span>
            <button
              className="discuss-setting-area__icon-btn"
              onClick={onSaveTable}
              data-tip="表示中のテーブルデータを CSV で保存"
            >
              <Save size={16} className="ws-icon" />
            </button>
          </div>
        </div>
      )}
    </div>
    <div className="discuss-setting-area__divider" />

    <div className="discuss-setting-area__section">
      <div
        className="discuss-setting-area__section-header"
        onClick={() => setIsTableDisplaySettingsOpen(!isTableDisplaySettingsOpen)}
      >
        {isTableDisplaySettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="discuss-setting-area__section-label" style={{ marginBottom: 0 }}>表示</span>
      </div>

      {isTableDisplaySettingsOpen && (
        <div className="discuss-setting-area__section-content">
          {TABLE_DISPLAY_ITEMS.map(({ label, Icon, actionId, isActive }, i) => (
            <div key={actionId} style={{ display: 'flex', alignItems: 'center', marginBottom: i < TABLE_DISPLAY_ITEMS.length - 1 ? '4px' : 0 }}>
              <span style={{ fontSize: 'calc(10px * var(--tt-font-scale, 1))', color: 'rgba(255,255,255,0.4)', width: '42px', flexShrink: 0 }}>{label}</span>
              <button
                className={`discuss-setting-area__icon-btn${isActive(panel) ? ' discuss-setting-area__icon-btn--active' : ''}`}
                onClick={() => TTShortcutManager.instance.executeActionDirect(actionId)}
                data-tip={actionId}
                aria-label={label}
              >
                <Icon size={16} className="ws-icon" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </>);
}
