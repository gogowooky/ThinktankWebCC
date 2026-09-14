import { useEffect, useRef, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { ContextService } from '../../services/ContextService';
import { ConversationClient, conversationContext, type ConversationContext, type ConversationTurn } from '../../services/ConversationService';
import { StorageManager } from '../../services/storage/StorageManager';
import { CONTEXT_LABELS } from '../OverviewPanel/ContextSnapshotView';
import './BundleConversation.css';

const client = new ConversationClient();
interface Draft { question: string; pending?: ConversationTurn }
const drafts = new WeakMap<TTVault, Map<string, Draft>>();
const vaultKeys = new WeakMap<TTVault, number>();
let nextVaultKey = 0;
function getDraft(vault: TTVault, bundleId: string) {
  let map = drafts.get(vault);
  if (!map) {
    map = new Map(); drafts.set(vault, map);
    const records = map;
    window.addEventListener('beforeunload', event => {
      if ([...records.values()].some(d => d.question || d.pending)) { event.preventDefault(); event.returnValue = ''; }
    });
  }
  let draft = map.get(bundleId);
  if (!draft) { draft = { question: '' }; map.set(bundleId, draft); }
  return draft;
}
function download(turn: ConversationTurn) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(turn, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `think-conversation-${turn.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BundleConversation(props: { vault: TTVault; bundleId: string; onOpen: (id: string) => void }) {
  if (!vaultKeys.has(props.vault)) vaultKeys.set(props.vault, ++nextVaultKey);
  return <ConversationPanel key={`${vaultKeys.get(props.vault)}:${props.bundleId}`} {...props} />;
}
function ConversationPanel({ vault, bundleId, onOpen }: { vault: TTVault; bundleId: string; onOpen: (id: string) => void }) {
  const draft = getDraft(vault, bundleId);
  const [question, setQuestion] = useState(draft.question);
  const [pending, setPending] = useState(draft.pending);
  const [context, setContext] = useState<ConversationContext>();
  const [history, setHistory] = useState<ConversationTurn[]>([]);
  const [status, setStatus] = useState<{ enabled: boolean; provider: string; model: string }>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);
  const controller = useRef<AbortController>();
  const locked = useRef(false);
  const supported = StorageManager.instance.mode === 'pwa';
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draft.question || draft.pending || locked.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  async function prepare() {
    if (locked.current) return;
    locked.current = true; setBusy('参照資料と接続状態を確認しています…'); setMessage(''); setConfirmed(false); setContext(undefined); setLoaded(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const [availability, turns, snapshot] = await Promise.allSettled([
        client.status(abort.signal), client.history(bundleId, abort.signal),
        new ContextService(vault).getBundleContext(bundleId, { signal: abort.signal }),
      ]);
      if (!alive.current || abort.signal.aborted) return;
      if (availability.status === 'fulfilled') setStatus(availability.value); else setStatus(undefined);
      if (turns.status === 'fulfilled') { setHistory(turns.value.filter(t => t.context.vaultId === vault.ID)); setLoaded(true); }
      const failures = [availability, turns, snapshot].flatMap(result => result.status === 'rejected' ? [(result.reason as Error).message] : []);
      if (snapshot.status === 'fulfilled') {
        try { setContext(conversationContext(snapshot.value)); } catch (e) { failures.push((e as Error).message); }
      }
      if (availability.status === 'fulfilled' && !availability.value.enabled) failures.push('AI対話は停止中です。履歴と参照資料は確認できます。');
      setMessage(failures.join('\n'));
    } catch (e) { if (alive.current) setMessage((e as Error).message); }
    finally { locked.current = false; if (alive.current) setBusy(''); }
  }
  async function persist(turn: ConversationTurn) {
    await client.save(turn);
    // Update only the dialog state: BQ's full-record version remains conservative in the editor.
    draft.pending = undefined; draft.question = '';
    if (alive.current) {
      setPending(undefined); setQuestion(''); setConfirmed(false); setContext(undefined);
      setHistory(old => old.some(t => t.id === turn.id) ? old : [...old, turn]);
      setMessage('会話を保存しました。次の質問の前に資料を再取得してください。');
    }
  }
  async function send() {
    if (locked.current || !status?.enabled || !context || !confirmed || !question.trim() || pending || !loaded) return;
    locked.current = true; setBusy('回答を生成しています…'); setMessage('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const turn = await client.generate(context, question, history.slice(-6).map(t => t.id), abort.signal);
      if (!alive.current || abort.signal.aborted) return;
      draft.pending = turn; setPending(turn); setBusy('会話を保存しています…');
      await persist(turn);
    } catch (e) { if (alive.current) setMessage(abort.signal.aborted ? '応答を中断しました。質問は保持しています。' : (e as Error).message); }
    finally { locked.current = false; if (alive.current) setBusy(''); }
  }
  async function retrySave() {
    if (!pending || locked.current) return;
    locked.current = true; setBusy('保存を再試行しています…');
    try { await persist(pending); } catch (e) { if (alive.current) setMessage((e as Error).message); }
    finally { locked.current = false; if (alive.current) setBusy(''); }
  }
  const turns = pending && !history.some(t => t.id === pending.id) ? [...history, pending] : history;
  return <section className="bundle-conversation" aria-label="資料に基づく対話">
    <h3>資料に基づく対話</h3>
    <p>Bundle内の資料を根拠に相談します。AIの提案は手動記録へ自動反映しません。</p>
    {!supported ? <p>対話と会話保存はBigQueryモードで利用できます。</p> : <>
      <button type="button" disabled={!!busy} onClick={() => void prepare()}>資料・履歴・接続状態を確認</button>
      {status && <p>接続先：{status.enabled ? `${status.provider} / ${status.model}` : '停止中'}</p>}
      {context && <div>
        <p>送信範囲：このBundleの資料 {context.sources.length}件、保存済みの手動記録、質問、同じBundle・Vaultの直近6往復の会話。</p>
        <p>参照取得：{context.capturedAt} ／ {context.quality === 'partial' ? '資料に不足・未確認事項があります' : '取得時点の資料'}。取得後の編集は再取得するまで含みません。</p>
        <ul>{context.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
        <details><summary>送信する資料本文と手動記録を確認</summary>
          {context.sources.map(s => <div key={s.thinkId}><button type="button" onClick={() => onOpen(s.thinkId)}>{s.title || s.thinkId}</button><pre>{s.content}</pre></div>)}
          <pre>{JSON.stringify(context.manualState?.values ?? {}, null, 2)}</pre>
        </details>
      </div>}
      <label>今回の質問<textarea maxLength={4000} value={question} disabled={!!busy || !!pending}
        onChange={e => { draft.question = e.target.value; setQuestion(e.target.value); setConfirmed(false); }} /></label>
      <label><input type="checkbox" checked={confirmed} disabled={!context || !!busy || !status?.enabled || !!pending}
        onChange={e => setConfirmed(e.target.checked)} />表示した範囲をAIへ送信することを確認しました</label>
      <p><button type="button" disabled={!status?.enabled || !context || !loaded || !confirmed || !question.trim() || !!busy || !!pending} onClick={() => void send()}>質問を送信</button>{' '}
        {busy === '回答を生成しています…' && <button type="button" onClick={() => controller.current?.abort()}>応答を中断</button>}</p>
      {busy && <p role="status">{busy}</p>}
      {message && <p role="status">{message}</p>}
      {pending && <div role="status"><p>回答は未保存です。保存の再試行はAIを再実行しません。</p>
        <button type="button" disabled={!!busy} onClick={() => void retrySave()}>保存だけ再試行</button>{' '}
        <button type="button" onClick={() => download(pending)}>未保存の回答をJSONで書き出す</button></div>}
      {loaded && !turns.length && <p>このBundleの新しい対話履歴はありません。</p>}
      {turns.map(turn => <article key={turn.id}>
        <h4>{turn.createdAt} · {turn.id === pending?.id ? '未保存' : '保存済み'}</h4>
        <p><strong>本人：</strong>{turn.question}</p>
        <p><strong>AI：</strong>{turn.answer.reply}</p>
        {turn.answer.insufficientEvidence && <p>根拠不足・未確認事項を含みます。</p>}
        {turn.answer.citations.map((citation, index) => <blockquote key={index}>
          <p>{citation.quote}</p><button type="button" onClick={() => onOpen(citation.thinkId)}>出典 {index + 1}：{turn.context.sources.find(s => s.thinkId === citation.thinkId)?.title || citation.thinkId}</button>
          <small>引用は回答時点の本文です。開いた資料は更新されている場合があります。</small>
        </blockquote>)}
        {turn.answer.proposals.map(p => <section key={p.field} aria-label={`${CONTEXT_LABELS[p.field]}の変更提案`}>
          <h4>AIの変更提案：{CONTEXT_LABELS[p.field]}（未採用）</h4><p>理由：{p.reason}</p>
          <p>参照時点の記録：{p.before || '未記録'}</p><p>提案：{p.after}</p>
          <p>採用する場合は上の手動入力で内容と出典を確認し、本人の記録として保存してください。</p>
        </section>)}
        <details><summary>参照Snapshotと回答を確認</summary><pre>{JSON.stringify(turn, null, 2)}</pre></details>
        <button type="button" onClick={() => download(turn)}>この会話をJSONで書き出す</button>
      </article>)}
    </>}
  </section>;
}
