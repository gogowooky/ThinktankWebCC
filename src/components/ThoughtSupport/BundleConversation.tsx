import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TTVault } from '../../models/TTVault';
import { ContextService } from '../../services/ContextService';
import { ConversationClient, chatOnlyConversationContext, conversationContext, type ConversationContext, type ConversationTurn } from '../../services/ConversationService';
import { mergeConversationTranscript, readConversationLog } from '../../../server/services/conversationRecord';
import { StorageManager } from '../../services/storage/StorageManager';
import { ProposalReview } from './ProposalReview';
import { SubtaskProposal } from './SubtaskProposal';
import './BundleConversation.css';

const client = new ConversationClient();
const PREPARING = '会話履歴・参照資料・AI設定を読み込んでいます…（入力できます）';
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
function turnTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function download(turn: ConversationTurn) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(turn, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `think-conversation-${turn.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** inputHeader は宿主が入力帯の先頭に差し込む操作。ログと一緒に流れると押せないので、ここへ預ける。 */
interface ConversationProps { vault: TTVault; bundleId?: string; chatId?: string; onOpen: (id: string) => void; draftScope?: string; optionalSources?: boolean; inputHeader?: ReactNode }
function cachedChatHistory(vault: TTVault, chatId?: string): ConversationTurn[] {
  if (!chatId) return [];
  try {
    return readConversationLog(vault.GetThink(chatId)?.Metadata?.thinkConversations).turns
      .filter(turn => turn.context.vaultId === vault.ID);
  } catch { return []; }
}
export function BundleConversation(props: ConversationProps) {
  if (!vaultKeys.has(props.vault)) vaultKeys.set(props.vault, ++nextVaultKey);
  return <ConversationPanel key={JSON.stringify([vaultKeys.get(props.vault), props.bundleId, props.chatId, props.draftScope])} {...props} />;
}
function ConversationPanel({ vault, bundleId: selectedBundleId, chatId, onOpen, draftScope = 'overview', optionalSources = false, inputHeader }: ConversationProps) {
  const draft = getDraft(vault, selectedBundleId ?? '', `${draftScope}:${chatId ?? 'bundle'}`);
  const [useBundle, setUseBundle] = useState(() => draft.pending ? draft.pending.context.scope === 'bundle-only' : !optionalSources);
  const bundleId = useBundle ? selectedBundleId : undefined;
  const cachedHistory = cachedChatHistory(vault, chatId);
  const [question, setQuestion] = useState(draft.question);
  const [pending, setPending] = useState(draft.pending);
  const [context, setContext] = useState<ConversationContext>();
  const [history, setHistory] = useState<ConversationTurn[]>(cachedHistory);
  const [status, setStatus] = useState<{ enabled: boolean; provider: string; model: string }>();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);
  const logRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController>();
  const locked = useRef(false);
  const composing = useRef(false);
  const prepareVersion = useRef(0);
  const supported = StorageManager.instance.mode === 'pwa';
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; prepareVersion.current += 1; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draft.question || draft.pending || locked.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  async function prepare() {
    if (!supported) return;
    const version = ++prepareVersion.current;
    controller.current?.abort();
    setBusy(PREPARING); setMessage(''); setContext(undefined); setStatus(undefined); setLoaded(false);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(new Error('準備に時間がかかっています。入力は保持しています。再試行してください。')), 30_000);
    let onAbort: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => reject(abort.signal.reason);
      abort.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const [availability, turns, snapshot] = await Promise.race([Promise.allSettled([
        client.status(abort.signal), client.history(bundleId, abort.signal, chatId, vault.ID),
        bundleId ? new ContextService(vault).getBundleContext(bundleId, { signal: abort.signal, maxSources: 300 })
          : Promise.resolve(chatOnlyConversationContext(vault.ID, chatId!)),
      ]), interrupted]);
      if (!alive.current || abort.signal.aborted || version !== prepareVersion.current) return;
      if (availability.status === 'fulfilled') setStatus(availability.value); else setStatus(undefined);
      if (turns.status === 'fulfilled') {
        const visible = turns.value.filter(t => t.context.vaultId === vault.ID);
        setHistory(visible); setLoaded(true);
        const chat = chatId ? vault.GetThink(chatId) : undefined;
        if (chat) {
          const mergedContent = mergeConversationTranscript(chat.Content, visible);
          const currentIds = readConversationLog(chat.Metadata?.thinkConversations).turns.map(turn => turn.id);
          const nextIds = visible.map(turn => turn.id);
          if (mergedContent !== chat.Content || JSON.stringify(currentIds) !== JSON.stringify(nextIds)) {
            chat.setContentSilent(mergedContent);
            chat.Metadata = { ...chat.Metadata, thinkConversations: { schemaVersion: 1, turns: visible } };
            vault.NotifyUpdated(false);
          }
        }
      }
      const failures = [availability, turns, snapshot].flatMap(result => result.status === 'rejected' ? [(result.reason as Error).message] : []);
      if (snapshot.status === 'fulfilled') {
        try { setContext('consistency' in snapshot.value ? conversationContext(snapshot.value) : snapshot.value); } catch (e) { failures.push((e as Error).message); }
      }
      if (availability.status === 'fulfilled' && !availability.value.enabled) failures.push('AI対話は停止中です。履歴と参照資料は確認できます。');
      setMessage(failures.join('\n'));
    } catch (e) { if (alive.current && version === prepareVersion.current) setMessage((e as Error).message); }
    finally {
      clearTimeout(timeout); abort.signal.removeEventListener('abort', onAbort);
      if (alive.current && version === prepareVersion.current) setBusy('');
    }
  }
  function cancelPreparation() {
    prepareVersion.current += 1;
    controller.current?.abort();
    setBusy(''); setMessage('準備を中断しました。入力は保持しています。再試行できます。');
  }
  useEffect(() => { void prepare(); }, [bundleId, chatId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function persist(turn: ConversationTurn) {
    await client.save(turn, chatId, bundleId);
    // Update only the dialog state: BQ's full-record version remains conservative in the editor.
    if (draft.pending?.id !== turn.id) return;
    draft.pending = undefined; draft.question = '';
    if (alive.current) {
      setPending(undefined); setQuestion(''); setContext(undefined);
      setHistory(old => old.some(t => t.id === turn.id) ? old : [...old, turn]);
      setMessage('');
    }
  }
  async function send() {
    if (locked.current || busy || !status?.enabled || !context || !question.trim() || pending || !loaded) return;
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
  // 入力欄を下端に固定したので、ログは自分で末尾へ寄せないと新しい回答が画面外に積まれる。
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, busy]);
  return <section className="bundle-conversation" aria-label="AIとの会話">
    {!supported ? <p>AIChatはBigQueryモードで利用できます。</p> : <>
      <div className="bundle-conversation-log" ref={logRef}>
        {loaded && !turns.length && <p className="bundle-conversation-empty">まだ会話はありません。</p>}
        {turns.map(turn => <article key={turn.id}>
          <p><strong>本人：</strong>{turn.question}</p>
          <p><strong>AI：</strong>{turn.answer.reply}</p>
          {turn.answer.citations.map((citation, index) => <blockquote key={index}>
            <p>{citation.quote}</p><button type="button" onClick={() => onOpen(citation.thinkId)}>出典 {index + 1}：{turn.context.sources.find(s => s.thinkId === citation.thinkId)?.title || citation.thinkId}</button>
            <small>引用は回答時点の本文です。開いた資料は更新されている場合があります。</small>
          </blockquote>)}
          <ProposalReview vault={vault} turn={turn} disabled={!!busy || !!pending} />
          {turn.id === history.at(-1)?.id && <SubtaskProposal vault={vault} turn={turn} chatId={chatId} disabled={!!busy || !!pending} />}
        </article>)}
      </div>
      {/* 入力とその状態表示（資料範囲・待機・保存失敗）は、履歴をたどっている間も
          同じ位置に見えていないと操作できないので、ログのスクロールから切り離す。 */}
      <div className="bundle-conversation-input">
      {inputHeader}
      {optionalSources && chatId && selectedBundleId && <label className="bundle-conversation-sources"><input type="checkbox" checked={useBundle}
        disabled={(!!busy && busy !== PREPARING) || !!pending} onChange={e => {
          cancelPreparation(); setContext(undefined); setLoaded(false); setUseBundle(e.target.checked);
        }} />Overviewの資料「{vault.GetThink(selectedBundleId)?.Name || selectedBundleId}」を使う</label>}
      {pending && !busy && <div className="bundle-conversation-notice" role="status"><p>回答を保存できませんでした。</p>
        <div className="bundle-conversation-notice-actions">
        <button type="button" disabled={!!busy} onClick={() => void retrySave()}>保存を再試行</button>{' '}
        <button type="button" onClick={() => download(pending)}>回答を書き出す</button></div></div>}
      {message && <div className="bundle-conversation-notice" role="status"><p>{message}</p>
        {!pending && <button type="button" disabled={!!busy} onClick={() => void prepare()}>再試行</button>}
      </div>}
      {busy && <p role="status" className="bundle-conversation-busy"><span className="bundle-conversation-spinner" aria-hidden="true" />{busy}</p>}
      <label className="bundle-conversation-composer"><textarea aria-label="メッセージ" placeholder="メッセージを入力" maxLength={4000} value={question} disabled={(!!busy && busy !== PREPARING) || !!pending}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={e => {
          if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey
            || composing.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
          e.preventDefault(); e.stopPropagation(); void send();
        }}
        onChange={e => { draft.question = e.target.value; setQuestion(e.target.value); }} /></label>
      <div className="bundle-conversation-composer-footer">
      <small className="bundle-conversation-input-hint">Enterで送信 · Shift+Enterで改行</small>
      <div className="bundle-conversation-actions">
        {busy === '回答を生成しています…' && <button type="button" data-conversation-abort onClick={() => controller.current?.abort()}>中断</button>}
        {busy === PREPARING && <button type="button" onClick={cancelPreparation}>準備を中断</button>}
        <button type="button" className="bundle-conversation-send" disabled={!status?.enabled || !context || !loaded || !question.trim() || !!busy || !!pending} onClick={() => void send()}>送信</button>
      </div>
      </div>
      <details className="bundle-conversation-options"><summary>参照情報・その他</summary>
        {status && <p>AI：{status.enabled ? `${status.provider} / ${status.model}` : '停止中'}</p>}
        {context && <div>
          <p>{context.scope === 'chat-only' ? '参照資料なし' : `参照資料 ${context.sources.length}件`}</p>
          {context.issues.length > 0 && <ul>{context.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
          {context.sources.length > 0 && <details><summary>参照資料を確認</summary>
            {context.sources.map(s => <div key={s.thinkId}><button type="button" onClick={() => onOpen(s.thinkId)}>{s.title || s.thinkId}</button><pre>{s.content}</pre></div>)}
          </details>}
        </div>}
        {/* 記憶や時間の余裕を補うための道具なので、生の記録を読ませない。
            どのAIが、資料を見て答えたか、根拠が足りていたかだけを1行で示す。 */}
        {turns.length > 0 && <details><summary>会話記録の確認</summary>
          <ul className="bundle-conversation-record">
            {turns.map(turn => <li key={turn.id}>{turnTime(turn.createdAt)} ／ {turn.provider} / {turn.model}
              {' '}／ {turn.context.sources.length ? '参照資料あり' : '参照資料なし'}
              {' '}／ {turn.answer.insufficientEvidence ? '根拠不足あり' : '根拠不足なし'}</li>)}
          </ul>
        </details>}
        <button type="button" disabled={!!busy || !!pending || !!question.trim()} onClick={() => {
          const reviewQuestion = 'このBundleの目的・完了条件と資料、直近の会話に基づいて進行を見直してください。目的からの逸脱の可能性、同じ検討の繰り返し、不足する根拠を、確認できる事実と推測に分けて示してください。次の一手、保留、終結を検討する候補と理由を提案してください。検討・意思決定・実行・検証の完了を混同せず、本人の完了状態は確定しないでください。';
          draft.question = reviewQuestion; setQuestion(reviewQuestion);
        }}>進行を見直す質問を入力</button>
      </details>
      </div>
    </>}
  </section>;
}
