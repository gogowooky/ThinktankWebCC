import { useEffect, useRef, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { ContextService } from '../../services/ContextService';
import { ConversationClient, chatOnlyConversationContext, conversationContext, type ConversationContext, type ConversationTurn } from '../../services/ConversationService';
import { StorageManager } from '../../services/storage/StorageManager';
import { CONTEXT_LABELS } from '../OverviewPanel/ContextSnapshotView';
import './BundleConversation.css';

const client = new ConversationClient();
interface Draft { question: string; pending?: ConversationTurn }
const drafts = new WeakMap<TTVault, Map<string, Draft>>();
const vaultKeys = new WeakMap<TTVault, number>();
let nextVaultKey = 0;
function getDraft(vault: TTVault, bundleId: string, draftScope: string) {
  let map = drafts.get(vault);
  if (!map) {
    map = new Map(); drafts.set(vault, map);
    const records = map;
    window.addEventListener('beforeunload', event => {
      if ([...records.values()].some(d => d.question || d.pending)) { event.preventDefault(); event.returnValue = ''; }
    });
  }
  const key = JSON.stringify([bundleId, draftScope]);
  let draft = map.get(key);
  if (!draft) { draft = { question: '' }; map.set(key, draft); }
  return draft;
}
function download(turn: ConversationTurn) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(turn, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `think-conversation-${turn.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
interface ConversationProps { vault: TTVault; bundleId?: string; chatId?: string; onOpen: (id: string) => void; draftScope?: string }
export function BundleConversation(props: ConversationProps) {
  if (!vaultKeys.has(props.vault)) vaultKeys.set(props.vault, ++nextVaultKey);
  return <ConversationPanel key={JSON.stringify([vaultKeys.get(props.vault), props.bundleId, props.chatId, props.draftScope])} {...props} />;
}
function ConversationPanel({ vault, bundleId, chatId, onOpen, draftScope = 'overview' }: ConversationProps) {
  const draft = getDraft(vault, bundleId ?? '', `${draftScope}:${chatId ?? 'bundle'}`);
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
    if (locked.current || !supported) return;
    locked.current = true; setBusy('参照資料と接続状態を確認しています…'); setMessage(''); setConfirmed(false); setContext(undefined); setLoaded(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const [availability, turns, snapshot] = await Promise.allSettled([
        client.status(abort.signal), client.history(bundleId, abort.signal, chatId),
        bundleId ? new ContextService(vault).getBundleContext(bundleId, { signal: abort.signal })
          : Promise.resolve(chatOnlyConversationContext(vault.ID, chatId!)),
      ]);
      if (!alive.current || abort.signal.aborted) return;
      if (availability.status === 'fulfilled') setStatus(availability.value); else setStatus(undefined);
      if (turns.status === 'fulfilled') { setHistory(turns.value.filter(t => t.context.vaultId === vault.ID)); setLoaded(true); }
      const failures = [availability, turns, snapshot].flatMap(result => result.status === 'rejected' ? [(result.reason as Error).message] : []);
      if (snapshot.status === 'fulfilled') {
        try { setContext('consistency' in snapshot.value ? conversationContext(snapshot.value) : snapshot.value); } catch (e) { failures.push((e as Error).message); }
      }
      if (availability.status === 'fulfilled' && !availability.value.enabled) failures.push('AI対話は停止中です。履歴と参照資料は確認できます。');
      setMessage(failures.join('\n'));
    } catch (e) { if (alive.current) setMessage((e as Error).message); }
    finally { locked.current = false; if (alive.current) setBusy(''); }
  }
  useEffect(() => { void prepare(); }, [bundleId, chatId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function persist(turn: ConversationTurn) {
    await client.save(turn, chatId, bundleId);
    // Update only the dialog state: BQ's full-record version remains conservative in the editor.
    if (draft.pending?.id !== turn.id) return;
    draft.pending = undefined; draft.question = '';
    if (alive.current) {
      setPending(undefined); setQuestion(''); setConfirmed(false); setContext(undefined);
      setHistory(old => old.some(t => t.id === turn.id) ? old : [...old, turn]);
      setMessage('');
    }
  }
  async function send() {
    if (locked.current || !status?.enabled || !context || !confirmed || !question.trim() || pending || !loaded) return;
    locked.current = true; setBusy('回答を生成しています…'); setMessage('');
    const abort = new AbortController(); controller.current = abort;
    let saved = false;
    try {
      const turn = await client.generate(context, question, history.slice(-6).map(t => t.id), abort.signal, chatId);
      if (!alive.current || abort.signal.aborted) return;
      draft.pending = turn; setPending(turn); setBusy('会話を保存しています…');
      await persist(turn);
      saved = true;
    } catch (e) { if (alive.current) setMessage(abort.signal.aborted ? '応答を中断しました。質問は保持しています。' : (e as Error).message); }
    finally {
      locked.current = false;
      if (alive.current) {
        setBusy('');
        if (saved) await prepare();
      }
    }
  }
  async function retrySave() {
    if (!pending || locked.current) return;
    locked.current = true; setBusy('保存を再試行しています…');
    let saved = false;
    try { await persist(pending); saved = true; } catch (e) { if (alive.current) setMessage((e as Error).message); }
    finally {
      locked.current = false;
      if (alive.current) {
        setBusy('');
        if (saved) await prepare();
      }
    }
  }
  const turns = pending && !history.some(t => t.id === pending.id) ? [...history, pending] : history;
  return <section className="bundle-conversation" aria-label="AIとの会話">
    {!supported ? <p>AIChatはBigQueryモードで利用できます。</p> : <>
      {loaded && !turns.length && <p className="bundle-conversation-empty">まだ会話はありません。</p>}
      {turns.map(turn => <article key={turn.id}>
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
          <p>採用する場合はOverviewのBundle状況にある手動入力で内容と出典を確認し、本人の記録として保存してください。</p>
        </section>)}
        <details><summary>参照Snapshotと回答を確認</summary><pre>{JSON.stringify(turn, null, 2)}</pre></details>
        <button type="button" onClick={() => download(turn)}>この会話をJSONで書き出す</button>
      </article>)}
      {pending && <div role="status"><p>回答を保存できませんでした。</p>
        <button type="button" disabled={!!busy} onClick={() => void retrySave()}>保存を再試行</button>{' '}
        <button type="button" onClick={() => download(pending)}>回答を書き出す</button></div>}
      {message && <p role="status">{message}</p>}
      {message && !pending && <button type="button" disabled={!!busy} onClick={() => void prepare()}>再試行</button>}
      {busy && <p role="status">{busy}</p>}
      <label className="bundle-conversation-composer"><textarea aria-label="メッセージ" placeholder="メッセージを入力" maxLength={4000} value={question} disabled={!!busy || !!pending}
        onChange={e => { draft.question = e.target.value; setQuestion(e.target.value); setConfirmed(false); }} /></label>
      <div className="bundle-conversation-actions">
        <button type="button" disabled={!status?.enabled || !context || !loaded || !confirmed || !question.trim() || !!busy || !!pending} onClick={() => void send()}>送信</button>
        {busy === '回答を生成しています…' && <button type="button" data-conversation-abort onClick={() => controller.current?.abort()}>中断</button>}
      </div>
      <label className="bundle-conversation-confirm"><input type="checkbox" checked={confirmed} disabled={!context || !!busy || !status?.enabled || !!pending}
        onChange={e => setConfirmed(e.target.checked)} />このメッセージをAIに送信する</label>
      <details className="bundle-conversation-options"><summary>参照情報・その他</summary>
        {status && <p>AI：{status.enabled ? `${status.provider} / ${status.model}` : '停止中'}</p>}
        {context && <div>
          <p>{context.scope === 'chat-only' ? '参照資料なし' : `参照資料 ${context.sources.length}件`}</p>
          {context.issues.length > 0 && <ul>{context.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
          {context.sources.length > 0 && <details><summary>参照資料を確認</summary>
            {context.sources.map(s => <div key={s.thinkId}><button type="button" onClick={() => onOpen(s.thinkId)}>{s.title || s.thinkId}</button><pre>{s.content}</pre></div>)}
          </details>}
        </div>}
        <button type="button" disabled={!!busy || !!pending || !!question.trim()} onClick={() => {
          const reviewQuestion = 'このBundleの目的・完了条件と資料、直近の会話に基づいて進行を見直してください。目的からの逸脱の可能性、同じ検討の繰り返し、不足する根拠を、確認できる事実と推測に分けて示してください。次の一手、保留、終結を検討する候補と理由を提案してください。検討・意思決定・実行・検証の完了を混同せず、本人の完了状態は確定しないでください。';
          draft.question = reviewQuestion; setQuestion(reviewQuestion); setConfirmed(false);
        }}>進行を見直す質問を入力</button>
      </details>
    </>}
  </section>;
}
