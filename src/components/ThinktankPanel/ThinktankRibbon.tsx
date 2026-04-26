/**
 * ThinktankRibbon.tsx
 * Phase 6: ThinktankPanel の Ribbon ボタン群。
 *
 * Phase 6 時点では開閉トグルのみ（PanelRibbon に委譲）。
 * Phase 16 以降で Think 抽出・全文検索などのボタンを追加する。
 */

import { PanelRibbon } from '../Layout/PanelRibbon';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export function ThinktankRibbon({ isOpen, onToggle }: Props) {
  return (
    <PanelRibbon
      panelId="thinktank"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {/* Phase 16 以降: Think 抽出、全文検索ボタンをここに追加 */}
    </PanelRibbon>
  );
}
