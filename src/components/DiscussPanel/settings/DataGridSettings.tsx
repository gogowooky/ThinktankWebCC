import { ChevronDown, ChevronRight, FilePlus, FileSpreadsheet, Save } from 'lucide-react';
import type { DiscussSettingsContext } from './types';

type Props = Pick<DiscussSettingsContext,
  'onCreateTable'
  | 'onReadTable'
  | 'onSaveTable'
  | 'firstDatagridRef'
  | 'isTableSettingsOpen'
  | 'setIsTableSettingsOpen'
>;

export function DataGridSettings({
  onCreateTable,
  onReadTable,
  onSaveTable,
  firstDatagridRef,
  isTableSettingsOpen,
  setIsTableSettingsOpen,
}: Props) {
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
  </>);
}
