/**
 * ThinktankArea.tsx
 * ThinktankPanel のコンテンツエリア。
 * ViewMode に応じて表示を切り替える。
 *
 * thoughts : Thoughtデータのみ表示（デフォルト）
 * filter   : タイトル・日時フィルター
 * search   : 全文検索
 * ai       : AI相談（Phase 14 で接続）
 */

import { useCallback } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { ThoughtsFilter } from './ThoughtsFilter';
import { ThoughtsList, applyFilter } from './ThoughtsList';
import { ThinktankFilterView } from './ThinktankFilterView';
import { ThinktankSearchView } from './ThinktankSearchView';
import { ThinktankAiView } from './ThinktankAiView';
import { ThinktankSettingsView } from './ThinktankSettingsView';

interface Props {
  app: TTApplication;
}

export function ThinktankArea({ app }: Props) {
  const panel = app.ThinktankPanel;
  const vault = app.Models.Vault;

  useAppUpdate(panel);
  useAppUpdate(vault);

  const handleSelect = useCallback((id: string) => {
    app.OpenThought(id);
  }, [app]);

  const handleToggleCheck = useCallback((id: string) => {
    panel.ToggleCheck(id);
  }, [panel]);

  const handleFilterChange = useCallback((value: string) => {
    panel.SetFilter(value);
  }, [panel]);

  // ── モード別レンダリング ─────────────────────────────────────────────

  if (panel.ViewMode === 'filter') {
    return (
      <ThinktankFilterView
        thinks={vault.GetThinks()}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        onSelect={handleSelect}
        onToggleCheck={handleToggleCheck}
      />
    );
  }

  if (panel.ViewMode === 'search') {
    return (
      <ThinktankSearchView
        vault={vault}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        onSelect={handleSelect}
        onToggleCheck={handleToggleCheck}
      />
    );
  }

  if (panel.ViewMode === 'ai') {
    return <ThinktankAiView />;
  }

  if (panel.ViewMode === 'settings') {
    return <ThinktankSettingsView />;
  }

  // デフォルト: thoughts モード（ContentType='thought' のみ）
  const allThoughts = vault.GetThoughts();
  const filtered    = applyFilter(allThoughts, panel.Filter);

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
