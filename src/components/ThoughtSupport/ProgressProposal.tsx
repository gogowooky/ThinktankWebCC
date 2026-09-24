import { useRef, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import type { ConversationTurn } from '../../services/ConversationService';
import { ProgressService, type ProgressState } from '../../services/ProgressService';
import { emptyProgress, validateProgress, MILESTONE_LABELS, REACH_LABELS, type ProgressInput } from '../../../server/services/progressRecord';

const service = new ProgressService();
export function ProgressProposal({ vault, turn, disabled }: { vault: TTVault; turn: ConversationTurn; disabled: boolean }) {
  const [review, setReview] = useState<{ state: ProgressState; input: ProgressInput }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  const proposals = turn.answer.progressProposals ?? [];
  const pause = turn.answer.pauseCandidates?.[0];
  const reviewLabel = pause ? '到達状態・保留・再開の候補を確認' : '到達状態の候補を確認';
  const bundle = vault.GetThink(turn.context.bundleId);
  if ((!proposals.length && !pause) || turn.context.scope !== 'bundle-only' || turn.context.vaultId !== vault.ID || bundle?.ContentType !== 'bundle') return null;

  async function act(save: boolean) {
    if (locked.current || disabled) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      if (!save) {
        const state = await service.read(turn.context.bundleId);
        if (state.log.events.some(e => e.id === turn.id)) {
          setSaved(true); setReview(undefined); setMessage('この会話からの到達状態は記録済みです。'); return;
        }
        const input = structuredClone(state.log.events.at(-1)?.input ?? emptyProgress());
        for (const p of proposals) input.milestones[p.milestone] = p.reach;
        if (pause) {
          input.paused = pause.paused;
          input.resumeCondition = pause.paused ? pause.resumeCondition : '';
          input.resumeSummary = pause.resumeSummary;
          // The former reminder belongs to the former pause; never silently reuse it.
          input.reviewAt = '';
        }
        // The candidate is grounded in the user's statement, not the prior event's documents.
        input.sources = [];
        input.evidence = `会話 ${turn.id}（${turn.createdAt}）\n` + proposals.map(p => `本人の発言：${p.userQuote}\n${MILESTONE_LABELS[p.milestone]}：${p.reason}`).join('\n');
        if (pause) input.evidence += `\n本人の発言：${pause.userQuote}\n${pause.paused ? '保留' : '再開'}：${pause.reason}`;
        if (review) {
          input.evidence = review.input.evidence; input.remaining = review.input.remaining;
          if (pause) { input.resumeCondition = review.input.resumeCondition; input.resumeSummary = review.input.resumeSummary; }
        }
        setReview({ state, input }); return;
      }
      if (!review) return;
      validateProgress(review.input);
      const result = await service.save(turn.context.bundleId, review.state.version, turn.id, review.input);
      const live = vault.GetThink(turn.context.bundleId);
      if (live) {
        const dirty = live.IsMetadataDirty;
        live.Metadata = { ...live.Metadata, thinkProgress: result.log };
        if (!dirty) live.markMetadataSaved();
        vault.NotifyUpdated(false);
      }
      setSaved(true); setReview(undefined); setMessage('本人確認済みの到達状態を記録しました。');
    } catch (error) {
      setMessage((error as Error).message);
    } finally { locked.current = false; setBusy(false); }
  }
  const previous = review?.state.log.events.at(-1)?.input ?? emptyProgress();
  return <section aria-label="会話から到達状態を記録">
    {!saved && <button type="button" disabled={disabled || busy} onClick={() => void act(false)}>{reviewLabel}</button>}
    {review && <div>
      <p>{bundle.Name} の到達状態を確認します。課題全体の完了は確定しません。</p>
      <p>目的：{review.state.review.goal || '未記録'} ／ 完了条件：{review.state.review.completionCriteria || '未記録'}</p>
      <p>保存済みの確認根拠：{previous.evidence || '未記録'}</p>
      {proposals.map(p => <div key={p.milestone}>
        <p>{MILESTONE_LABELS[p.milestone]}：{REACH_LABELS[previous.milestones[p.milestone]]} → {REACH_LABELS[p.reach]}</p>
        <p>本人の発言：{p.userQuote}</p><p>AIの整理：{p.reason}</p>
      </div>)}
      <p>{Object.entries(previous.milestones).filter(([key]) => !proposals.some(p => p.milestone === key)).map(([key, value]) => `${MILESTONE_LABELS[key as keyof typeof MILESTONE_LABELS]}：${REACH_LABELS[value]}`).join(' ／ ')}</p>
      <p>進め方：{previous.paused ? '保留' : '保留していない'} ／ 再開条件：{previous.resumeCondition || '未記録'}（{pause ? '変更前の記録' : '現在の記録を引き継ぎます'}）</p>
      <p>再開時の要約：{previous.resumeSummary || '未記録'} ／ 再確認日：{previous.reviewAt || '未記録'}</p>
      {pause && <>
        <p>進め方の変更：{previous.paused ? '保留' : '保留していない'} → {pause.paused ? '保留' : '再開'}</p>
        <p>本人の発言：{pause.userQuote}</p><p>AIの整理：{pause.reason}</p>
        {pause.paused && <label>再開条件（必須）<textarea maxLength={4000} disabled={disabled || busy} value={review.input.resumeCondition}
          onChange={e => setReview({ ...review, input: { ...review.input, resumeCondition: e.target.value } })} /></label>}
        <label>再開時の要約<textarea maxLength={4000} disabled={disabled || busy} value={review.input.resumeSummary}
          onChange={e => setReview({ ...review, input: { ...review.input, resumeSummary: e.target.value } })} /></label>
        <p>再確認日は解除します。必要な場合は課題の到達状態から設定できます。</p>
      </>}
      <label>確認根拠<textarea maxLength={4000} disabled={disabled || busy} value={review.input.evidence}
        onChange={e => setReview({ ...review, input: { ...review.input, evidence: e.target.value } })} /></label>
      <label>残課題とその扱い（なければ「なし」）<textarea maxLength={4000} disabled={disabled || busy} value={review.input.remaining}
        onChange={e => setReview({ ...review, input: { ...review.input, remaining: e.target.value } })} /></label>
      <button type="button" disabled={disabled || busy || !review.input.evidence.trim() || !review.input.remaining.trim() || (review.input.paused && !review.input.resumeCondition.trim())} onClick={() => void act(true)}>本人の判断として確認して記録</button>{' '}
      <button type="button" disabled={busy} onClick={() => setReview(undefined)}>キャンセル</button>
      <p>保存競合時は「{reviewLabel}」で最新記録を取得し直して確認してください。</p>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
