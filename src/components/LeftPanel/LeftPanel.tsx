/**
 * LeftPanel.tsx
 * 左パネルのコンテナ。
 * TTLeftPanel ビューモデルの IsOpen / Width / PanelType を購読して表示制御する。
 *
 * Phase 5: 骨格実装（コンテンツはプレースホルダー）
 * Phase 6 以降: NavigatorView / SearchView 等を差し込む
 */

import React from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { LeftPanelHeader } from './LeftPanelHeader';
import { NavigatorView } from './NavigatorView';
import './LeftPanel.css';

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
            {lp.PanelType === 'navigator' && <NavigatorView />}
            {lp.PanelType === 'search' && (
              <p className="left-panel__placeholder">検索（Phase 28 で実装）</p>
            )}
            {lp.PanelType === 'tags' && (
              <p className="left-panel__placeholder">タグ（Phase 33 で実装）</p>
            )}
            {lp.PanelType === 'recent' && (
              <p className="left-panel__placeholder">最近（Phase 33 で実装）</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
