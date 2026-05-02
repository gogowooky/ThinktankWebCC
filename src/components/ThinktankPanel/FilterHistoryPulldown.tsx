import React from 'react';
import { History, Trash2, X } from 'lucide-react';
import { loadHistory, removeHistoryItem, clearHistory } from '../../utils/historyUtils';
import './FilterHistoryPulldown.css';

interface Props {
  historyKey: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function FilterHistoryPulldown({ historyKey, onSelect, onClose }: Props) {
  const history = React.useMemo(() => loadHistory(historyKey), [historyKey]);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (history.length === 0) return null;

  return (
    <div className="filter-history-pulldown" ref={containerRef} onClick={e => e.stopPropagation()}>
      <ul className="filter-history-pulldown__list">
        {history.map((h, i) => (
          <li key={`${h}-${i}`} className="filter-history-pulldown__item" onClick={() => { onSelect(h); onClose(); }}>
            <History size={10} className="filter-history-pulldown__item-icon" />
            <span className="filter-history-pulldown__item-text">{h}</span>
            <button 
              className="filter-history-pulldown__item-delete" 
              onClick={(e) => {
                e.stopPropagation();
                removeHistoryItem(historyKey, h);
                onClose();
              }}
              title="削除"
            >
              <Trash2 size={10} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
