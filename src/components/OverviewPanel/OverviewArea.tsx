/**
 * OverviewArea.tsx
 * Phase 9: OverviewPanel の表示エリア。
 *
 * - 上部: Thought 選択セレクター
 * - 本体: panel.MediaType に応じて MarkdownMedia / DataGridMedia / GraphMedia を描画
 * - 読み取り専用（onSave / onDirtyChange は no-op）
 */

import { useCallback } from 'react';
import { BookOpen } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { OverviewMenuRibbon } from './OverviewMenuRibbon';
import { MarkdownMedia } from '../WorkoutPanel/media/MarkdownMedia';
import { DataGridMedia } from '../WorkoutPanel/media/DataGridMedia';
import { GraphMedia } from '../WorkoutPanel/media/GraphMedia';
import './OverviewArea.css';

// no-op コールバック（読み取り専用）
const noop = () => {};

interface Props {
  app: TTApplication;
}

export function OverviewArea({ app }: Props) {
  const panel = app.OverviewPanel;
  useAppUpdate(panel);

  const vault    = app.Models.Vault;
  const thoughts = vault.GetThoughts();
  const think    = panel.ThoughtID ? vault.GetThink(panel.ThoughtID) ?? null : null;

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id) {
      panel.OpenThought(id, panel.MediaType);
    } else {
      panel.ClearThought();
    }
  }, [panel]);

  return (
    <div className="overview-area">

      {/* ── メニューリボン ─────────────────────────────────────── */}
      <OverviewMenuRibbon />

      {/* ── Thought セレクター ─────────────────────────────────── */}
      <div className="overview-area__selector">
        <BookOpen size={12} className="overview-area__selector-icon" />
        <select
          className="overview-area__select"
          value={panel.ThoughtID}
          onChange={handleSelect}
        >
          <option value="">— Thought を選択 —</option>
          {thoughts.map(t => (
            <option key={t.ID} value={t.ID}>{t.Name || '（無題）'}</option>
          ))}
        </select>
      </div>

      {/* ── 本体 ───────────────────────────────────────────────── */}
      <div className="overview-area__body">
        {!think ? (
          <div className="overview-area__empty">
            <span>Thought を選択してください</span>
          </div>
        ) : panel.MediaType === 'markdown' ? (
          <MarkdownMedia
            think={think}
            vault={vault}
            onSave={noop}
            onDirtyChange={noop}
          />
        ) : panel.MediaType === 'datagrid' ? (
          <DataGridMedia
            think={think}
            vault={vault}
            onSave={noop}
            onDirtyChange={noop}
          />
        ) : panel.MediaType === 'graph' ? (
          <GraphMedia
            think={think}
            vault={vault}
            onSave={noop}
            onDirtyChange={noop}
          />
        ) : null}
      </div>

    </div>
  );
}
