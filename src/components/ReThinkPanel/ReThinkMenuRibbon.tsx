/**
 * ReThinkMenuRibbon.tsx
 * ReThinkArea 上部の横向きリボン
 */

import { Save, MonitorUp, MonitorDown } from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './ReThinkMenuRibbon.css';

interface Props {
  viewMode:     string;
  canSaveChat:  boolean;
  onSaveChat:   () => void;
  onScrollPrev: () => void;
  onScrollNext: () => void;
}

export function ReThinkMenuRibbon({ viewMode, canSaveChat, onSaveChat, onScrollPrev, onScrollNext }: Props) {
  if (viewMode === 'settings') {
    return <div className="menu-ribbon rethink-menu-ribbon" />;
  }

  return (
    <div className="menu-ribbon rethink-menu-ribbon">
      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon"
        onClick={onScrollPrev}
        data-tip="前のユーザーメッセージへ"
      >
        <MonitorUp size={14} />
      </button>
      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon"
        onClick={onScrollNext}
        data-tip="次のユーザーメッセージへ"
      >
        <MonitorDown size={14} />
      </button>
      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon"
        onClick={onSaveChat}
        data-tip="Chatを保管庫に保存"
        disabled={!canSaveChat}
      >
        <Save size={14} />
      </button>
    </div>
  );
}
