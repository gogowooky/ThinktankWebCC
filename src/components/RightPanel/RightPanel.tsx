/**
 * RightPanel.tsx
 * 右パネルのコンテナ。
 * TTRightPanel ビューモデルの IsOpen / Width / PanelType を購読して表示制御する。
 *
 * Phase 5: 骨格実装（コンテンツはプレースホルダー）
 * Phase 12 以降: OutlineView / PropertiesView / RelatedView / RightChatView を差し込む
 */

import React from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { RightPanelHeader } from './RightPanelHeader';
import './RightPanel.css';

export function RightPanel() {
  const app = TTApplication.Instance;
  useAppUpdate(app.RightPanel);
  const rp = app.RightPanel;

  return (
    <div
      className="right-panel"
      style={{
        width: rp.IsOpen ? rp.Width : 0,
        minWidth: rp.IsOpen ? rp.Width : 0,
      }}
      aria-hidden={!rp.IsOpen}
    >
      {rp.IsOpen && (
        <>
          <RightPanelHeader
            panelType={rp.PanelType}
            onClose={() => rp.Close()}
          />
          <div className="right-panel__content">
            {/* Phase 12 以降で各ビューに置き換え */}
            <p className="right-panel__placeholder">
              {rp.PanelType === 'outline'    && 'アウトライン（Phase 12 で実装）'}
              {rp.PanelType === 'properties' && 'プロパティ（Phase 12 で実装）'}
              {rp.PanelType === 'related'    && '関連（Phase 12 で実装）'}
              {rp.PanelType === 'chat'       && 'チャット（Phase 12 で実装）'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
