import { useEffect, useState } from 'react';
import type { TTVault } from '../models/TTVault';
import type { TTThink } from '../models/TTThink';
import type { SupportPanel } from '../services/thoughtSupport';
import { parseManagedChatTitle } from '../utils/managedChat';
import { useAppUpdate } from './useAppUpdate';

export function filterSupportChats(items: TTThink[], panel: SupportPanel, bundleId: string, scopeIds: readonly string[]): TTThink[] {
  const ownedChats = items.filter(t => {
    if (t.ContentType !== 'chat') return false;
    const managed = parseManagedChatTitle(t.Name);
    if (managed) return managed.panel === panel;
    return panel === 'Thinktank' && !!t.Metadata.supportOrigin && t.Metadata.supportOrigin !== 'Pane';
  });
  if (panel === 'Thinktank') return ownedChats;
  if (!bundleId) return [];
  const included = new Set(scopeIds);
  return ownedChats.filter(t => included.has(t.ID));
}

export function useSupportChats(vault: TTVault, panel: SupportPanel, bundleId: string, _selectedId: string) {
  useAppUpdate(vault);
  const [scope, setScope] = useState<{ bundle: string; ids: string[] }>({ bundle: '', ids: [] });
  const [error, setError] = useState('');
  const revision = JSON.stringify(vault.GetThinks().map(t => [t.ID, t.Name, t.UpdatedAt]));
  useEffect(() => {
    let cancelled = false;
    setError('');
    if (panel === 'Thinktank' || !bundleId) { setScope({ bundle: bundleId, ids: [] }); return () => { cancelled = true; }; }
    setScope({ bundle: bundleId, ids: [] });
    void vault.GetThinksForBundleAsync(bundleId, true).then(items => {
      if (!cancelled) setScope({ bundle: bundleId, ids: items.map(t => t.ID) });
    }).catch(() => { if (!cancelled) { setScope({ bundle: bundleId, ids: [] }); setError('BundleのChat一覧を読み込めませんでした。再読み込みしてください。'); } });
    return () => { cancelled = true; };
  }, [vault, panel, bundleId, revision]);
  const scopeIds = scope.bundle === bundleId ? scope.ids : [];
  const chats = filterSupportChats(vault.GetThinks(), panel, bundleId, scopeIds);
  return { chats, error };
}
