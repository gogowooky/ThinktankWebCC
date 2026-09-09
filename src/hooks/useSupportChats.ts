import { useEffect, useState } from 'react';
import type { TTVault } from '../models/TTVault';
import type { TTThink } from '../models/TTThink';
import { parseManagedChatTitle } from '../utils/managedChat';
import { supportRecord, type SupportPanel } from '../services/thoughtSupport';
import { useAppUpdate } from './useAppUpdate';

export function useSupportChats(vault: TTVault, panel: SupportPanel, bundleId: string, selectedId: string) {
  useAppUpdate(vault);
  const [scope, setScope] = useState<{ bundle: string; ids: string[] }>({ bundle: '', ids: [] });
  const [error, setError] = useState('');
  const revision = JSON.stringify(vault.GetThinks().map(t => [t.ID, t.Name, t.UpdatedAt]));
  useEffect(() => {
    let cancelled = false;
    setError('');
    if (bundleId) void vault.GetThinksForBundleAsync(bundleId, true).then(items => {
      if (!cancelled) setScope({ bundle: bundleId, ids: items.map(t => t.ID) });
    }).catch(() => { if (!cancelled) { setScope({ bundle: bundleId, ids: [] }); setError('Bundleの相談一覧を読み込めませんでした。再読み込みしてください。'); } });
    return () => { cancelled = true; };
  }, [vault, bundleId, revision]);
  const chats = vault.GetThinks().filter((t: TTThink) => {
    if (t.ContentType !== 'chat') return false;
    if (t.ID === selectedId) return true; // Keep the active conversation across an AI handoff.
    const managed = parseManagedChatTitle(t.Name);
    if (managed?.panel !== panel && !(panel === 'Thinktank' && !managed && t.Metadata.supportOrigin === 'Thinktank')) return false;
    if (panel === 'Thinktank') return true;
    if (bundleId) return scope.bundle === bundleId && scope.ids.includes(t.ID);
    return panel === 'ReThink' || (panel === 'Workout' && !supportRecord(t).bundleId);
  });
  return { chats, error };
}
