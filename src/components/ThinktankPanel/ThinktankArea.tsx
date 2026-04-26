/**
 * ThinktankArea.tsx
 * Phase 6: ThinktankPanel のコンテンツエリア。
 *
 * - ThoughtsFilter（絞り込み）
 * - ThoughtsList（仮想スクロール一覧）
 * を縦並びで表示する。
 */

import { useCallback } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { ThoughtsFilter } from './ThoughtsFilter';
import { ThoughtsList, applyFilter } from './ThoughtsList';

interface Props {
  app: TTApplication;
}

export function ThinktankArea({ app }: Props) {
  const panel  = app.ThinktankPanel;
  const vault  = app.Models.Vault;

  useAppUpdate(panel);
  useAppUpdate(vault);

  // フィルター適用後の Thought 一覧
  const allThoughts = vault.GetThoughts();
  const filtered    = applyFilter(allThoughts, panel.Filter);

  const handleSelect = useCallback((id: string) => {
    app.OpenThought(id);
  }, [app]);

  const handleToggleCheck = useCallback((id: string) => {
    panel.ToggleCheck(id);
  }, [panel]);

  const handleFilterChange = useCallback((value: string) => {
    panel.SetFilter(value);
  }, [panel]);

  return (
    <>
      <ThoughtsFilter
        value={panel.Filter}
        onChange={handleFilterChange}
      />
      <ThoughtsList
        thoughts={filtered}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        onSelect={handleSelect}
        onToggleCheck={handleToggleCheck}
      />
    </>
  );
}
