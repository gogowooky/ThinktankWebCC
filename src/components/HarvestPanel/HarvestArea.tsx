/**
 * HarvestArea.tsx
 * HarvestPanel のメインエリア。
 *
 * - AIView / AIChat / 設定
 */

import { useEffect, useRef } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { HarvestMenuRibbon } from './HarvestMenuRibbon';
import type { HarvestViewMode } from './HarvestTabBar';
import { AiViewPanel, AiChatPanel } from '../AiPanels/AiPanels';
import '../../components/Layout/MenuRibbon.css';
import './HarvestArea.css';

const HARVEST_MODE_NAMES: Record<HarvestViewMode, string> = {
  aiview:   'AIView',
  aichat:   'AIChat',
  settings: '設定',
  // 旧値（SetViewMode で読み替えるが、直接代入された場合でも見出しが空にならないようにする）
  chat:     'AIChat',
  project:  'AIView',
};

interface Props {
  app:      TTApplication;
  viewMode: HarvestViewMode;
}

export function HarvestArea({ app, viewMode }: Props) {
  const panel = app.HarvestPanel;
  useAppUpdate(panel);
  useAppUpdate(app.SeedsPanel);

  const vault       = app.Models.Vault;
  useAppUpdate(vault);

  const settingsCheckRef   = useRef<HTMLInputElement>(null);

  // モード切り替え時に対応する入力要素へフォーカス
  useEffect(() => {
    const timer = setTimeout(() => {
      if (viewMode === 'settings') settingsCheckRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode]);

  return (
    <div className="harvest-area">

      {/* ── タイトル行 ────────────────────────────────────────── */}
      <div className="panel-title-row harvest-area__title-row">
        Harvest&gt;{HARVEST_MODE_NAMES[viewMode]}
      </div>

      {/* ── メニューリボン（AIView は自前のリボンを持つ） ───────────── */}
      {viewMode !== 'aiview' && viewMode !== 'project' && <HarvestMenuRibbon />}

      {/* ── コンテンツ ───────────────────────────────────────── */}
      <div className="harvest-area__chat">
        {viewMode === 'settings' ? (
          <div style={{ padding: '16px', fontSize: 'calc(12px * var(--tt-font-scale, 1))', color: 'var(--text-muted)', position: 'relative' }}>
            <input ref={settingsCheckRef} type="checkbox" aria-hidden="true"
              style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
            Harvest設定は今後追加予定です。
          </div>
        ) : viewMode === 'aichat' || viewMode === 'chat' ? (
          <AiChatPanel />
        ) : (
          <AiViewPanel panelKey="harvest" />
        )}
      </div>

    </div>
  );
}
