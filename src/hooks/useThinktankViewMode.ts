import { useEffect } from 'react';
import type { TTThinktankPanel } from '../views/TTThinktankPanel';
import type { LayoutMode } from '../components/Layout/AppLayout';

export function useThinktankViewMode(panel: TTThinktankPanel, layoutMode: LayoutMode) {
  const mode = panel.ViewMode;
  const visibleMode = layoutMode === 'simple' && mode === 'chat' ? 'filter' : mode;
  useEffect(() => {
    // Observerへの通知は描画の確定後に行い、他の描画中コンポーネントを更新しない。
    if (layoutMode === 'simple' && panel.ViewMode === 'chat') panel.SetViewMode('filter');
  }, [panel, layoutMode, mode]);
  return visibleMode;
}
