import { useEffect, useRef, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { ensureSubtaskChat } from '../../services/subtaskChat';

export function SubtaskChatButton({ vault, bundleId, overviewId }: { vault: TTVault; bundleId: string; overviewId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const active = useRef(true);
  const version = useRef(0);
  useEffect(() => {
    version.current++; active.current = true; locked.current = false; setBusy(false); setError('');
    return () => { active.current = false; };
  }, [vault, bundleId, overviewId]);
  async function open() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const request = version.current;
    try {
      const { TTApplication } = await import('../../views/TTApplication');
      const app = TTApplication.Instance;
      if (!active.current || request !== version.current || app.Models.Vault !== vault) return;
      const chat = await ensureSubtaskChat(vault, bundleId);
      const { openSupportChat } = await import('../../services/openSupportChat');
      if (active.current && request === version.current && app.Models.Vault === vault && app.OverviewPanel.BundleID === overviewId) openSupportChat(chat.ID);
    } catch (e) { if (active.current && request === version.current) setError((e as Error).message); }
    finally { if (active.current && request === version.current) { locked.current = false; setBusy(false); } }
  }
  return <div>
    <button type="button" disabled={busy} onClick={() => void open()}>{busy ? '相談用Chatを準備しています…' : 'Workoutで相談する'}</button>
    {error && <p role="alert">{error} 同じボタンから再試行できます。</p>}
  </div>;
}
