import { useRef, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import type { ConversationTurn } from '../../services/ConversationService';
import { ThinkSupportService } from '../../services/ThinkSupportService';
import { prepareProposalReview } from '../../services/proposalReview';
import type { ThinkMeta } from '../../services/storage/IStorageBackend';
import { CONTEXT_LABELS } from '../OverviewPanel/ContextSnapshotView';

const service = new ThinkSupportService();
export function ProposalReview({ vault, turn, disabled }: { vault: TTVault; turn: ConversationTurn; disabled: boolean }) {
  const [review, setReview] = useState<ThinkMeta>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  const bundle = vault.GetThink(turn.context.bundleId);
  if (!turn.answer.proposals.length || turn.context.scope !== 'bundle-only' || turn.context.vaultId !== vault.ID || bundle?.ContentType !== 'bundle') return null;
  async function act(save: boolean) {
    if (locked.current || disabled) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      const meta = save && review ? review : await service.read(turn.context.bundleId);
      const next = prepareProposalReview(turn, meta);
      if (next.alreadyApplied) { setSaved(true); setReview(undefined); setMessage('この内容は課題の概要に反映されています。'); return; }
      if (!save) { setReview(meta); return; }
      const result = await service.save(meta.id, meta.updatedAt, next.values, next.sources);
      const live = vault.GetThink(meta.id);
      if (live) {
        const dirty = live.IsMetadataDirty;
        live.Metadata = { ...live.Metadata, thinkSupport: result.metadata?.thinkSupport };
        if (!dirty) live.markMetadataSaved();
        if (live.UpdatedAt === meta.updatedAt) live.UpdatedAt = result.updatedAt;
        vault.NotifyUpdated(false);
      }
      setSaved(true); setReview(undefined); setMessage('課題の概要に反映しました。');
    } catch (error) {
      setReview(undefined);
      setMessage((error as Error).name === 'StorageConflictError'
        ? '別の更新がありました。もう一度内容を確認してください。' : (error as Error).message);
    } finally { locked.current = false; setBusy(false); }
  }
  return <section aria-label="課題の概要への反映">
    {!saved && <button type="button" disabled={disabled || busy} onClick={() => void act(false)}>課題の概要に反映する内容を確認</button>}
    {review && <div>
      <p>{bundle.Name} に反映します。</p>
      {turn.answer.proposals.map(p => <div key={p.field}>
        <strong>{CONTEXT_LABELS[p.field]}</strong>
        <p style={{ whiteSpace: 'pre-wrap' }}>現在：{p.before || '未記録'}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>変更後：{p.after}</p>
        <p>{p.reason}</p>
      </div>)}
      <button type="button" disabled={disabled || busy} onClick={() => void act(true)}>この内容で反映</button>{' '}
      <button type="button" disabled={busy} onClick={() => setReview(undefined)}>キャンセル</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
