/**
 * LeftPanel.tsx
 * 左パネルのコンテナ。
 * TTLeftPanel ビューモデルの IsOpen / Width / PanelType を購読して表示制御する。
 *
 * Phase 5: 骨格実装
 * Phase 9Ex1: 左端ツールバー5ボタンに対応した5種類のパネルを表示
 */

import React from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { LeftPanelHeader } from './LeftPanelHeader';
import { PickupSettingsPanel } from './panels/PickupSettingsPanel';
import { MediaSettingsPanel }  from './panels/MediaSettingsPanel';
import { HistoryPanel }        from './panels/HistoryPanel';
import { FilterPanel }         from './panels/FilterPanel';
import { FulltextSearchPanel } from './panels/FulltextSearchPanel';
import './LeftPanel.css';
import './panels/panels.css';

export function LeftPanel() {
  const app = TTApplication.Instance;
  useAppUpdate(app.LeftPanel);
  const lp = app.LeftPanel;

  return (
    <div
      className="left-panel"
      style={{
        width: lp.IsOpen ? lp.Width : 0,
        minWidth: lp.IsOpen ? lp.Width : 0,
      }}
      aria-hidden={!lp.IsOpen}
    >
      {lp.IsOpen && (
        <>
          <LeftPanelHeader
            panelType={lp.PanelType}
            onClose={() => lp.Close()}
          />
          <div className="left-panel__content">
            {lp.PanelType === 'pickup-settings'  && <PickupSettingsPanel />}
            {lp.PanelType === 'media-settings'   && <MediaSettingsPanel />}
            {lp.PanelType === 'history'           && <HistoryPanel />}
            {lp.PanelType === 'filter'            && <FilterPanel />}
            {lp.PanelType === 'fulltext-search'   && <FulltextSearchPanel />}
          </div>
        </>
      )}
    </div>
  );
}
