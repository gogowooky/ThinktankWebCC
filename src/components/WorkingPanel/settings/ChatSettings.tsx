import { useState } from 'react';
import { ChevronDown, ChevronRight, MessagesSquare } from 'lucide-react';
import type { WorkingSettingsContext } from './types';

type Props = Pick<WorkingSettingsContext, 'onCreateChat'>;

/** Working>Chat設定 */
export function ChatSettings({ onCreateChat }: Props) {
  const [isChatOpen, setIsChatOpen] = useState(true);
  return (
    <div className="working-setting-area__section">
      <div
        className="working-setting-area__section-header"
        onClick={() => setIsChatOpen(!isChatOpen)}
      >
        {isChatOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="working-setting-area__section-label" style={{ marginBottom: 0 }}>Chat</span>
      </div>

      {isChatOpen && (
        <div className="working-setting-area__section-content">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <span className="working-setting-area__color-label" style={{ width: '28px', flexShrink: 0 }}>新規</span>
            <div className="working-setting-area__icon-row" style={{ flex: 1 }}>
              <button
                className="working-setting-area__icon-btn"
                onClick={onCreateChat}
                data-tip="新規chatファイルを作成"
                aria-label="新規chatファイルを作成"
                data-tip-side="top-start"
              >
                <MessagesSquare size={16} className="ws-icon" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
