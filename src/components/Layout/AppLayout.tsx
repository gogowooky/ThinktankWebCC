/**
 * AppLayout.tsx
 * アプリ全体のレイアウト。
 * [Ribbon][LeftPanel][Splitter][MainPanel][Splitter][RightPanel]
 *
 * Phase 5: 骨格実装
 * Phase 41 以降: パネル幅・開閉状態を localStorage に永続化
 */

import React from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { Ribbon } from './Ribbon';
import { Splitter } from './Splitter';
import { LeftPanel } from '../LeftPanel/LeftPanel';
import { RightPanel } from '../RightPanel/RightPanel';
import { MainPanel } from '../MainPanel/MainPanel';
import './AppLayout.css';

export function AppLayout() {
  const app = TTApplication.Instance;
  useAppUpdate(app.LeftPanel);
  useAppUpdate(app.RightPanel);

  const handleLeftResize = (delta: number) => {
    if (app.LeftPanel.IsOpen) {
      app.LeftPanel.SetWidth(app.LeftPanel.Width + delta);
    }
  };

  const handleRightResize = (delta: number) => {
    if (app.RightPanel.IsOpen) {
      // 右パネルは右端固定なのでドラッグ方向が逆
      app.RightPanel.SetWidth(app.RightPanel.Width - delta);
    }
  };

  return (
    <div className="app-layout">
      <Ribbon />
      <LeftPanel />
      {app.LeftPanel.IsOpen && (
        <Splitter onResize={handleLeftResize} />
      )}
      <MainPanel />
      {app.RightPanel.IsOpen && (
        <Splitter onResize={handleRightResize} />
      )}
      <RightPanel />
    </div>
  );
}
