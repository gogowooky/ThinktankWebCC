import { useEffect, useState } from 'react';
import type { TTVault } from '../models/TTVault';
import type { SupportPanel } from '../services/thoughtSupport';

export function useSupportSelection(vault: TTVault, panel: SupportPanel) {
  const key = `thinktank.support.selection:${vault.VaultName}:${panel}`;
  const [id, setId] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  useEffect(() => { try { localStorage.setItem(key, id); } catch { /* unavailable browser storage must not block conversation */ } }, [key, id]);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ panel: SupportPanel; id: string }>).detail;
      if (detail?.panel === panel) setId(detail.id);
    };
    window.addEventListener('thinktank-support-open', listener);
    return () => window.removeEventListener('thinktank-support-open', listener);
  }, [panel]);
  return [id, setId] as const;
}
