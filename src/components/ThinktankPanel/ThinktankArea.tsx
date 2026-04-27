/**
 * ThinktankArea.tsx
 * ThinktankPanel のコンテンツエリア。
 * ViewMode に応じて表示を切り替える。
 */

import { useCallback, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { ThinktankMenuRibbon } from './ThinktankMenuRibbon';
import { ThoughtsFilter } from './ThoughtsFilter';
import { ThoughtsList, applyFilter } from './ThoughtsList';
import { ThinktankFilterView } from './ThinktankFilterView';
import { ThinktankSearchView } from './ThinktankSearchView';
import { ThinktankAiView } from './ThinktankAiView';
import { ThinktankSettingsView } from './ThinktankSettingsView';
import type { TTThink } from '../../models/TTThink';
import './ThinktankArea.css';

interface Props {
  app: TTApplication;
}

export function ThinktankArea({ app }: Props) {
  const panel = app.ThinktankPanel;
  const vault = app.Models.Vault;

  useAppUpdate(panel);
  useAppUpdate(vault);

  // filter/search モードの可視アイテムはコールバックで受け取る
  const [filterVisible, setFilterVisible] = useState<TTThink[]>([]);
  const [searchVisible, setSearchVisible] = useState<TTThink[]>([]);

  // thoughts モードの可視アイテムはレンダー時に直接計算（setState不要）
  const allThoughts   = vault.GetThoughts();
  const thoughtsBase  = applyFilter(allThoughts, panel.Filter);
  const thoughtsVisible = panel.ShowCheckedOnly
    ? thoughtsBase.filter(t => panel.CheckedThoughtIDs.includes(t.ID))
    : thoughtsBase;

  const visibleThinks =
    panel.ViewMode === 'thoughts' ? thoughtsVisible :
    panel.ViewMode === 'filter'   ? filterVisible   :
    panel.ViewMode === 'search'   ? searchVisible   : [];

  // ── ハンドラ ─────────────────────────────────────────────────────────

  const handleSelect = useCallback((id: string) => {
    app.OpenThought(id);
  }, [app]);

  const handleToggleCheck = useCallback((id: string) => {
    panel.ToggleCheck(id);
  }, [panel]);

  const handleFilterChange = useCallback((value: string) => {
    panel.SetFilter(value);
  }, [panel]);

  const handleCheckAll = useCallback(() => {
    panel.CheckAll(visibleThinks.map(t => t.ID));
  }, [panel, visibleThinks]);

  const handleClearChecks = useCallback(() => {
    panel.ClearChecks();
  }, [panel]);

  const handleDeleteChecked = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0) return;
    if (!window.confirm(`${panel.CheckedThoughtIDs.length} 件を削除しますか？`)) return;
    await vault.DeleteThinks(panel.CheckedThoughtIDs);
    panel.ClearChecks();
  }, [panel, vault]);

  const handleToggleCheckedOnly = useCallback(() => {
    panel.ToggleShowCheckedOnly();
  }, [panel]);

  const handleCreateThought = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0) return;
    const think = await vault.CreateThoughtFromIds(panel.CheckedThoughtIDs, panel.Filter);
    panel.ClearChecks();
    app.OpenThought(think.ID);
  }, [panel, vault, app]);

  // ── モード別コンテンツ ───────────────────────────────────────────────

  let content: React.ReactNode;

  if (panel.ViewMode === 'filter') {
    content = (
      <ThinktankFilterView
        thinks={vault.GetThinks()}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        checkedOnly={panel.ShowCheckedOnly}
        onSelect={handleSelect}
        onToggleCheck={handleToggleCheck}
        onVisibleChange={setFilterVisible}
      />
    );
  } else if (panel.ViewMode === 'search') {
    content = (
      <ThinktankSearchView
        vault={vault}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        onSelect={handleSelect}
        onToggleCheck={handleToggleCheck}
      />
    );
  } else if (panel.ViewMode === 'ai') {
    content = <ThinktankAiView />;
  } else if (panel.ViewMode === 'settings') {
    content = <ThinktankSettingsView />;
  } else {
    // デフォルト: thoughts モード
    const displayed = thoughtsVisible;
    content = (
      <>
        <ThoughtsFilter
          value={panel.Filter}
          onChange={handleFilterChange}
        />
        <ThoughtsList
          thoughts={displayed}
          selectedId={panel.SelectedThoughtID}
          checkedIds={panel.CheckedThoughtIDs}
          onSelect={handleSelect}
          onToggleCheck={handleToggleCheck}
        />
      </>
    );
  }

  return (
    <div className="thinktank-area">
      <ThinktankMenuRibbon
        visibleIds={visibleThinks.map(t => t.ID)}
        checkedIds={panel.CheckedThoughtIDs}
        showCheckedOnly={panel.ShowCheckedOnly}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onDeleteChecked={handleDeleteChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onCreateThought={handleCreateThought}
      />
      <div className="thinktank-area__body">
        {content}
      </div>
    </div>
  );
}
