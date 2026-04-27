/**
 * ThinktankArea.tsx
 * ThinktankPanel のコンテンツエリア。
 * ViewMode に応じて表示を切り替える。
 *
 * thoughts : Thoughtデータのみ表示（デフォルト）
 * filter   : タイトル・日時フィルター
 * search   : 全文検索
 * ai       : AI相談（Phase 14 で接続）
 * settings : 保管庫設定
 */

import { useCallback } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { ThinktankMenuRibbon } from './ThinktankMenuRibbon';
import { ThoughtsFilter } from './ThoughtsFilter';
import { ThoughtsList, applyFilter } from './ThoughtsList';
import { ThinktankFilterView } from './ThinktankFilterView';
import { ThinktankSearchView } from './ThinktankSearchView';
import { ThinktankAiView } from './ThinktankAiView';
import { ThinktankSettingsView } from './ThinktankSettingsView';
import './ThinktankArea.css';

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

  // ── モード別コンテンツ ───────────────────────────────────────────────

  let content: React.ReactNode;

  if (panel.ViewMode === 'filter') {
    content = (
      <ThinktankFilterView
        thinks={vault.GetThinks()}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        onSelect={handleSelect}
        onToggleCheck={handleToggleCheck}
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
    // デフォルト: thoughts モード（ContentType='thought' のみ）
    const allThoughts = vault.GetThoughts();
    const filtered    = applyFilter(allThoughts, panel.Filter);
    content = (
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

  return (
    <div className="thinktank-area">
      <ThinktankMenuRibbon />
      <div className="thinktank-area__body">
        {content}
      </div>
    </div>
  );
}
