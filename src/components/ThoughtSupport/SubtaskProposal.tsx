import { useMemo, useRef, useState } from 'react';
import { draftVaultLease } from '../../services/draftStore';
import type { TTVault } from '../../models/TTVault';
import { ConversationClient, type ConversationTurn } from '../../services/ConversationService';
import { canonicalJson } from '../../../shared/contracts/conversationRecord';

const client = new ConversationClient();
export function SubtaskProposal({ vault, turn, chatId, disabled }: {
  vault: TTVault; turn: ConversationTurn; chatId?: string; disabled: boolean;
}) {
  const candidates = turn.answer.subtaskCandidates ?? [];
  if (!chatId || turn.context.scope !== 'bundle-only' || turn.context.vaultId !== vault.ID) return null;
  return candidates.length ? <section aria-label="サブ課題候補の一覧"><p>必要な課題を1件ずつ確認して追加できます。</p>
    {candidates.map(candidate => <SingleSubtaskProposal key={`${vault.ID}:${turn.id}:${candidate.id}`} vault={vault} turn={turn} chatId={chatId} disabled={disabled} candidateId={candidate.id} />)}
  </section> : <SingleSubtaskProposal key={`${vault.ID}:${turn.id}`} vault={vault} turn={turn} chatId={chatId} disabled={disabled} />;
}
function SingleSubtaskProposal({ vault, turn, chatId, disabled, candidateId }: {
  vault: TTVault; turn: ConversationTurn; chatId?: string; disabled: boolean; candidateId?: string;
}) {
  const lifetime = useMemo(() => draftVaultLease(vault), [vault]);
  const candidate = turn.answer.subtaskCandidates?.find(p => p.id === candidateId);
  const proposal = candidate ? { after: candidate.goal } : turn.answer.proposals.find(p => p.field === 'nextAction');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  if (!proposal || !chatId || turn.context.scope !== 'bundle-only' || turn.context.vaultId !== vault.ID) return null;
  async function save() {
    if (!lifetime.isCurrent()) return;
    if (locked.current || disabled || !chatId) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      const history = await client.history(turn.context.bundleId, undefined, chatId, vault.ID);
      if (!lifetime.isCurrent()) return;
      if (canonicalJson(history.at(-1)) !== canonicalJson(turn)) throw new Error('会話が更新されています。最新の提案を確認してください。');
      await vault.CreateSubtaskFromConversation(turn, chatId, title, candidateId, lifetime.isCurrent);
      if (!lifetime.isCurrent()) return;
      setSaved(true); setOpen(false); setMessage('サブ課題を追加しました。');
    } catch (e) { if (lifetime.isCurrent()) setMessage((e as Error).message); }
    finally { locked.current = false; if (lifetime.isCurrent()) setBusy(false); }
  }
  return <section aria-label="サブ課題の追加">
    {!saved && !open && <button type="button" disabled={disabled} onClick={() => {
      setTitle(candidate?.title ?? proposal.after.replace(/[\r\n]+/g, ' ').slice(0, 200)); setOpen(true);
    }}>{candidate ? `候補「${candidate.title}」を確認` : '次の行動をサブ課題にする'}</button>}
    {open && <div>
      <p>「{vault.GetThink(turn.context.bundleId)?.Name}」のサブ課題として追加します。</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{proposal.after}</p>
      <label>課題名<input aria-label="サブ課題名" maxLength={200} value={title} disabled={busy}
        onChange={e => setTitle(e.target.value)} /></label>
      {candidate ? <><p>完了条件：{candidate.completionCriteria || '未整理（追加後に相談できます）'}</p><p>分解理由：{candidate.reason}</p><p>担当：Working</p></>
        : <p>担当：Working。完了条件は、この課題について相談しながら整理します。</p>}
      <button type="button" disabled={disabled || busy || !title.trim()} onClick={() => void save()}>このサブ課題を追加</button>{' '}
      <button type="button" disabled={busy} onClick={() => setOpen(false)}>キャンセル</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
