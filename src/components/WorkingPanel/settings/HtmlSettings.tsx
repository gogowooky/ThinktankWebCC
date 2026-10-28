import { FilePlus } from 'lucide-react';
import type { WorkingSettingsContext } from './types';

type Props = Pick<WorkingSettingsContext,
  'onCreateHtml'
  | 'firstHtmlRef'
>;

export function HtmlSettings({
  onCreateHtml,
  firstHtmlRef,
}: Props) {
  return (<div className="working-setting-area__section">
    <div className="working-setting-area__section-header">
      <span className="working-setting-area__section-label" style={{ marginBottom: 0 }}>Html</span>
    </div>
    <div className="working-setting-area__section-content">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: 'calc(10px * var(--tt-font-scale, 1))', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>新規</span>
        <button
          ref={firstHtmlRef}
          className="working-setting-area__icon-btn"
          onClick={onCreateHtml}
          aria-label="Htmlファイルを新規作成"
          data-tip="Htmlファイルを新規作成"
        >
          <FilePlus size={16} className="ws-icon" />
        </button>
      </div>
    </div>
  </div>);
}
