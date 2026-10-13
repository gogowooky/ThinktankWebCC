import { draftVaultLease, createDraftStore, registerDraftWarning, type DraftVaultLease } from '../../services/draftStore';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileJson, X } from 'lucide-react';
import type { TTVault } from '../../models/TTVault';
import { ContextService } from '../../services/ContextService';
import { ConversationClient, chatOnlyConversationContext, conversationContext, type ConversationContext, type ConversationTurn } from '../../services/ConversationService';
import { readConversationLog } from '../../../server/contracts/conversationRecord';
import { conversationPresentation } from '../../../server/contracts/conversationPresentation';
import { StorageManager } from '../../services/storage/StorageManager';
import { parseManagedChatTitle } from '../../utils/managedChat';
import { ProposalReview } from './ProposalReview';
import { ProgressProposal } from './ProgressProposal';
import { SubtaskProposal } from './SubtaskProposal';
import { SubtaskContextView, ProgressContextDetail } from './SubtaskContextView';
import { SUBTASK_REVIEW_QUESTION } from '../../../server/contracts/subtaskContext';
import type { AiModelSelectorProps } from './modelSelectorTypes';
import { modelChoices } from '../../services/aiChatModelStatus';
import { selectionToValue } from '../../services/aiModels';
import '../ThinktankPanel/ColumnSortDialog.css';
import './BundleConversation.css';

const client = new ConversationClient();
const PREPARING = '会話履歴・参照資料・AI設定を読み込んでいます…（入力できます）';
const PLACEHOLDER = 'メッセージを入力、Enterで送信 · Shift+Enterで改行';
/** 送信に必要な材料。state の反映を待たずに準備結果をそのまま送信へ渡すために使う。 */
interface Ready { context: ConversationContext; history: ConversationTurn[] }
interface Draft { question: string; pending?: ConversationTurn }
const drafts = createDraftStore<Draft>(d => !!(d.question || d.pending));
function getDraft(vault: TTVault, bundleId: string, draftScope: string, lifetime: DraftVaultLease) {
  return drafts.get(vault, JSON.stringify([bundleId, draftScope]), () => ({ question: '' }), lifetime);
}
function download(turn: ConversationTurn) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(turn, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `think-conversation-${turn.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** after は回答文の直後（同じ行）に続けて置く要素。記録を開くアイコン用 */
function Answer({ presentation, onOpen, after }: { presentation: ReturnType<typeof conversationPresentation>; onOpen: (id: string) => void; after?: ReactNode }) {
  const { reply, links } = presentation;
  return <p><strong>AI：</strong>{reply.split(/(\[Think:[A-Za-z0-9_-]+,\d+\])/g).map((part, index) => {
    const link = links.find(link => link.marker === part);
    return link ? <button key={index} type="button" onClick={() => onOpen(link.thinkId)}>{part}</button> : part;
  })}{after}</p>;
}
/**
 * 会話に使うモデルの選択。選択肢は Status AIChat.ModelNames.*（各社の今使える主要モデル）。
 * 選び直すとそのモデルがそのプロバイダの先頭（選択中）になり、このパネルのプロバイダも切り替わる。
 */
function ModelSelect({ selector, disabled }: { selector: AiModelSelectorProps; disabled: boolean }) {
  const choices = modelChoices();
  const value = selectionToValue(selector.value);
  const known = choices.some(c => selectionToValue(c.selection) === value);
  return <p>AI：<select aria-label="AIモデル" value={value} disabled={disabled} onChange={e => {
    const picked = choices.find(c => selectionToValue(c.selection) === e.target.value);
    if (picked) selector.onChange(picked.selection);
  }}>
    {!known && <option value={value}>{selector.value.provider} / {selector.value.model}（使えません）</option>}
    {choices.map(c => <option key={selectionToValue(c.selection)} value={selectionToValue(c.selection)}>{c.name} / {c.selection.model}</option>)}
  </select></p>;
}
/** 入力欄の高さを中身ちょうどに合わせる。いったん auto に戻さないと、行を減らしても
    scrollHeight が縮まず（今の高さが下限になる）、欄が伸びたきり戻らない。
    空のときは高さを書かない。Chromium の scrollHeight は placeholder の折り返し行数まで
    数えるので、それに合わせると未入力の欄が数行ぶんに膨らむ（rows=1 の丈に任せる）。 */
function fitToText(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = el.value ? `${el.scrollHeight}px` : '';
}
/** inputHeader は宿主が入力帯の先頭に差し込む操作。ログと一緒に流れると押せないので、ここへ預ける。 */
interface ConversationProps {
  vault: TTVault; bundleId?: string; chatId?: string; onOpen: (id: string) => void; draftScope?: string; inputHeader?: ReactNode; consultation?: boolean;
  /** 送信に使うモデル。省略時はサーバー既定のモデルと会話する */
  modelSelector?: AiModelSelectorProps
}
function cachedChatHistory(vault: TTVault, chatId?: string): ConversationTurn[] {
  if (!chatId) return [];
  try {
    return readConversationLog(vault.GetThink(chatId)?.Metadata?.thinkConversations).turns
      .filter(turn => turn.context.vaultId === vault.ID);
  } catch { return []; }
}
export function BundleConversation(props: ConversationProps) {
  const lifetime = useMemo(() => draftVaultLease(props.vault), [props.vault]);
  return <ConversationPanel key={JSON.stringify([lifetime.identity, props.bundleId, props.chatId, props.draftScope])} {...props} lifetime={lifetime} />;
}
function ConversationPanel({ vault, bundleId: selectedBundleId, chatId, onOpen, draftScope = 'seeds', inputHeader, consultation = false, modelSelector, lifetime }: ConversationProps & { lifetime: DraftVaultLease }) {
  const draft = getDraft(vault, selectedBundleId ?? '', `${draftScope}:${chatId ?? 'bundle'}`, lifetime);
  const bundleId = selectedBundleId;
  const cachedHistory = cachedChatHistory(vault, chatId);
  const [question, setQuestion] = useState(draft.question);
  const [pending, setPending] = useState(draft.pending);
  const [context, setContext] = useState<ConversationContext>();
  const [history, setHistory] = useState<ConversationTurn[]>(cachedHistory);
  const [status, setStatus] = useState<{ enabled: boolean; provider: string; model: string }>();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [record, setRecord] = useState<ConversationTurn>();
  const alive = useRef(true);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDetailsElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // 見出しを押した時のShiftの有無。toggle イベントは修飾キーを持たないので、click で拾って預ける。
  const collapseChildren = useRef(false);
  const controller = useRef<AbortController>();
  const locked = useRef(false);
  const composing = useRef(false);
  const prepareVersion = useRef(0);
  const supported = StorageManager.instance.mode === 'pwa';
  useEffect(() => {
    if (!lifetime.isCurrent()) return;
    alive.current = true;
    return () => {
      alive.current = false; prepareVersion.current += 1; controller.current?.abort();
    };
  }, [lifetime]);
  useEffect(() => {
    if (!lifetime.isCurrent()) return;
    return registerDraftWarning(vault, () => locked.current, lifetime);
  }, [vault, draft, lifetime]);
  useEffect(() => {
    if (!lifetime.isCurrent()) return;
    if (composerRef.current) fitToText(composerRef.current);
  }, [question, lifetime]);
  useEffect(() => {
    if (!lifetime.isCurrent()) return;
    const el = composerRef.current;
    // jsdom には ResizeObserver が無い。幅が変わらない環境では行数も変わらないので、
    // 追従しなくても入力欄の高さは正しいまま。
    if (!el || typeof ResizeObserver === 'undefined') return;
    // 幅が変われば折り返しの行数も変わる。自分で高さを書き換えたぶんの通知は幅で弾く（無限ループ防止）。
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (!lifetime.isCurrent()) return;
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fitToText(el);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [lifetime]);
  /** 準備できた資料と接続状態を返す。中断・失敗時は undefined。送信が続けて使うので state 待ちにしない。 */
  async function prepare(): Promise<Ready | undefined> {
    if (!lifetime.isCurrent()) return;
    if (!supported) return undefined;
    let ready: Ready | undefined;
    const version = ++prepareVersion.current;
    controller.current?.abort();
    setBusy(PREPARING); setMessage(''); setContext(undefined); setStatus(undefined); setLoaded(false);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(new Error('準備に時間がかかっています。入力は保持しています。再試行してください。')), 30_000);
    let onAbort: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      if (!lifetime.isCurrent()) return;
      onAbort = () => reject(abort.signal.reason);
      abort.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const historyRequest = client.history(bundleId, abort.signal, chatId, vault.ID, vault, lifetime.isCurrent);
      const [availability, turns, snapshot] = await Promise.race([Promise.allSettled([
        client.status(abort.signal), historyRequest,
        // Saved Chat synchronization must finish before capturing a stable Bundle snapshot.
        historyRequest.then(async () => {
          if (!lifetime.isCurrent()) throw new Error('アプリの処理期間が終了しました。');
          const value = bundleId ? await new ContextService(vault).getBundleContext(bundleId, { signal: abort.signal, maxSources: 300, includeSubtasks: true })
            : chatOnlyConversationContext(vault.ID, chatId!);
          if (!lifetime.isCurrent()) throw new Error('アプリの処理期間が終了しました。');
          return value;
        }),
      ]), interrupted]);
      if (!lifetime.isCurrent()) return;
      if (!alive.current || abort.signal.aborted || version !== prepareVersion.current) return undefined;
      if (availability.status === 'fulfilled') setStatus(availability.value); else setStatus(undefined);
      let loadedTurns: ConversationTurn[] | undefined;
      if (turns.status === 'fulfilled') {
        const visible = turns.value.filter(t => t.context.vaultId === vault.ID);
        loadedTurns = visible;
        setHistory(visible); setLoaded(true);
      }
      const failures = [availability, turns, snapshot].flatMap(result => result.status === 'rejected' ? [(result.reason as Error).message] : []);
      let nextContext: ConversationContext | undefined;
      if (snapshot.status === 'fulfilled') {
        try {
          nextContext = 'consistency' in snapshot.value ? conversationContext(snapshot.value) : snapshot.value;
          setContext(nextContext);
        } catch (e) {
          if (!lifetime.isCurrent()) return;
          nextContext = undefined; failures.push((e as Error).message);
        }
      }
      if (availability.status === 'fulfilled' && !availability.value.enabled) failures.push('AI対話は停止中です。履歴と参照資料は確認できます。');
      setMessage(failures.join('\n'));
      if (nextContext && loadedTurns && availability.status === 'fulfilled' && availability.value.enabled) {
        ready = { context: nextContext, history: loadedTurns };
      }
    } catch (e) {
      if (!lifetime.isCurrent()) return;
      if (lifetime.isCurrent() && alive.current && version === prepareVersion.current) setMessage((e as Error).message);
    }
    finally {
      clearTimeout(timeout); abort.signal.removeEventListener('abort', onAbort);
      if (lifetime.isCurrent() && alive.current && version === prepareVersion.current) setBusy('');
    }
    return ready;
  }
  function cancelPreparation() {
    if (!lifetime.isCurrent()) return;
    prepareVersion.current += 1;
    controller.current?.abort();
    setBusy(''); setMessage('準備を中断しました。入力は保持しています。再試行できます。');
  }
  useEffect(() => {
    if (!lifetime.isCurrent()) return;
    void prepare();
  }, [bundleId, chatId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function persist(turn: ConversationTurn) {
    if (!lifetime.isCurrent()) return;
    // A pending answer retains its original scope even if the reference policy changes.
    await client.save(turn, chatId, turn.context.scope === 'chat-only' ? undefined : turn.context.bundleId);
    if (!lifetime.isCurrent()) return;
    // Update only the dialog state: BQ's full-record version remains conservative in the editor.
    if (draft.pending?.id !== turn.id) return;
    draft.pending = undefined; draft.question = '';
    if (lifetime.isCurrent() && alive.current) {
      setPending(undefined); setQuestion(''); setContext(undefined);
      setHistory(old => old.some(t => t.id === turn.id) ? old : [...old, turn]);
      setMessage('');
    }
  }
  /**
   * 「送信」は1つで、準備が済んでいなければ先に取り直してから送る。
   * 失敗のたびに「再試行」と「送信」を押し分けさせない（押し分けても結果は同じ）。
   */
  async function submit() {
    if (!lifetime.isCurrent()) return;
    if (locked.current || busy || !question.trim() || pending) return;
    // Child progress may have changed in Discuss since this conversation was opened.
    const current: Ready | undefined = status?.enabled && context && loaded && !context.subtasks ? { context, history } : undefined;
    const ready = current ?? await prepare();
    if (!lifetime.isCurrent()) return;
    if (!ready || !alive.current) return;
    await send(ready);
    if (!lifetime.isCurrent()) return;
  }
  async function send(ready: Ready) {
    if (!lifetime.isCurrent()) return;
    if (locked.current || !question.trim() || pending) return;
    locked.current = true; setBusy('回答を生成しています…'); setMessage('');
    const abort = new AbortController(); controller.current = abort;
    let saved = false;
    try {
      const turn = await client.generate(ready.context, question, ready.history.slice(-6).map(t => t.id), abort.signal, chatId, modelSelector?.value);
      if (!lifetime.isCurrent()) return;
      if (!alive.current || abort.signal.aborted) return;
      draft.pending = turn; setPending(turn); setBusy('会話を保存しています…');
      await persist(turn);
      if (!lifetime.isCurrent()) return;
      saved = true;
    } catch (e) {
      if (!lifetime.isCurrent()) return;
      if (lifetime.isCurrent() && alive.current) setMessage(abort.signal.aborted ? '応答を中断しました。質問は保持しています。' : (e as Error).message);
    }
    finally {
      locked.current = false;
      if (lifetime.isCurrent() && alive.current) {
        setBusy('');
        if (saved) await prepare();
      }
    }
  }
  async function retrySave() {
    if (!lifetime.isCurrent()) return;
    if (!pending || locked.current) return;
    locked.current = true; setBusy('保存を再試行しています…');
    let saved = false;
    try {
      await persist(pending);
      if (!lifetime.isCurrent()) return;
      saved = true;
    } catch (e) {
      if (!lifetime.isCurrent()) return;
      if (lifetime.isCurrent() && alive.current) setMessage((e as Error).message);
    }
    finally {
      locked.current = false;
      if (lifetime.isCurrent() && alive.current) {
        setBusy('');
        if (saved) await prepare();
      }
    }
  }
  /**
   * 折りたたみを開いたら、中身が全部見える位置まで入力帯を送る。
   * 開いた先が枠の下にはみ出したままだと、何が増えたのか分からない。
   * 枠より背が高くて収まらないときは、代わりに先頭を上端へ寄せる。
   */
  function revealOptions(event: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!lifetime.isCurrent()) return;
    // 中の区分を開閉しただけのときに、区分を開き直したりスクロールし直したりしない
    if (event.target !== event.currentTarget) return;
    const panel = optionsRef.current;
    if (!panel) return;
    // 見出しを押した時のShiftは、開く・閉じるのどちらでも読み捨てる。持ち越すと
    // 次の通常の開閉まで畳んでしまう。
    const collapse = collapseChildren.current;
    collapseChildren.current = false;
    const groups = panel.querySelectorAll<HTMLDetailsElement>(':scope > details');
    // 通常は開けたときに3区分も開く。ひとつずつ開かせると、何がどこにあるか覚える負担が増える。
    // Shift付きは畳む。どこに何があるかは分かっていて、目的の区分だけを開きたいとき用。
    // 閉じるときにも畳むので、次に開き直しても畳まれたまま出る。
    if (collapse) groups.forEach(group => {
      if (!lifetime.isCurrent()) return;
      group.open = false;
    });
    else if (event.currentTarget.open) groups.forEach(group => {
      if (!lifetime.isCurrent()) return;
      group.open = true;
    });

    const band = inputRef.current;
    if (!band || !event.currentTarget.open) return;
    // getBoundingClientRect が同期でレイアウトを確定させるので、開いた直後の寸法で測れる。
    // requestAnimationFrame は描画されていないウィンドウでは呼ばれず、送りそこねる。
    const bandRect = band.getBoundingClientRect(), panelRect = panel.getBoundingClientRect();
    const top = panelRect.top - bandRect.top + band.scrollTop;
    const target = panelRect.height >= band.clientHeight ? top : top + panelRect.height - band.clientHeight;
    band.scrollTop = Math.max(0, Math.min(target, band.scrollHeight - band.clientHeight));
  }
  const turns = pending && !history.some(t => t.id === pending.id) ? [...history, pending] : history;
  const presentations = turns.map(turn => conversationPresentation(turn));
  // 管理用の接頭辞（ASK:Thinktank｜…）は一覧で読める。会話の見出しには表題だけを出す。
  const chat = chatId ? vault.GetThink(chatId) : undefined;
  const chatTitle = chat ? parseManagedChatTitle(chat.Name)?.title || chat.Name : '';
  // 入力欄を下端に固定したので、ログは自分で末尾へ寄せないと新しい回答が画面外に積まれる。
  useEffect(() => {
    if (!lifetime.isCurrent()) return;
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, busy, lifetime]);
  return <section className="bundle-conversation" aria-label="AIとの会話">
    {!supported ? <p>AIChatはBigQueryモードで利用できます。</p> : <>
      <div className="bundle-conversation-log" ref={logRef}>
        {/* Chat名はログの1行目として履歴と一緒に流す。専用の帯にすると、その分だけ読める行が減る。 */}
        {chatTitle && <h3 className="bundle-conversation-title">{chatTitle}</h3>}
        {loaded && !turns.length && <p className="bundle-conversation-empty">まだ会話はありません。</p>}
        {turns.map((turn, index) => <article key={turn.id}>
          <p><strong>You：</strong>{turn.question}</p>
          {/* 記録そのものは普段読むものではないので、回答の直後にアイコンだけ置いて別画面へ送る */}
          <Answer presentation={presentations[index]} onOpen={onOpen} after={
            <button type="button" className="bundle-conversation-record-open" onClick={() => setRecord(turn)}
              aria-label="この会話の記録を表示" title="この会話の記録を表示"><FileJson size={14} /></button>} />
          <ProposalReview vault={vault} turn={turn} disabled={!!busy || !!pending} />
          {turn.id === history.at(-1)?.id && <ProgressProposal key={`${vault.ID}:${turn.context.bundleId}:${turn.id}`} vault={vault} turn={turn} disabled={!!busy || !!pending} />}
          {turn.id === history.at(-1)?.id && <SubtaskProposal vault={vault} turn={turn} chatId={chatId} disabled={!!busy || !!pending} />}
        </article>)}
      </div>
      {/* 入力とその状態表示（資料範囲・待機・保存失敗）は、履歴をたどっている間も
          同じ位置に見えていないと操作できないので、ログのスクロールから切り離す。 */}
      <div className="bundle-conversation-input" ref={inputRef}>
        {pending && !busy && <div className="bundle-conversation-notice" role="status"><p>回答を保存できませんでした。</p>
          <div className="bundle-conversation-notice-actions">
            <button type="button" disabled={!!busy} onClick={() => void retrySave()}>保存を再試行</button>{' '}
            <button type="button" onClick={() => download(pending)}>回答を書き出す</button></div></div>}
        {/* label ではなく div。中に送信・中断のボタンを置くので、label だと「ラベル対象の
          コントロール」が曖昧になる（textarea の名前は aria-label が与えている）。 */}
        <div className="bundle-conversation-composer"><textarea ref={composerRef} rows={1} aria-label="メッセージ" placeholder={PLACEHOLDER} maxLength={4000} value={question} disabled={(!!busy && busy !== PREPARING) || !!pending}
          onCompositionStart={() => {
            if (!lifetime.isCurrent()) return;
            composing.current = true;
          }} onCompositionEnd={() => {
            if (!lifetime.isCurrent()) return;
            composing.current = false;
          }}
          onKeyDown={e => {
            if (!lifetime.isCurrent()) return;
            if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey
              || composing.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
            e.preventDefault(); e.stopPropagation(); void submit();
          }}
          onChange={e => {
            if (!lifetime.isCurrent()) return;
            draft.question = e.target.value; setQuestion(e.target.value);
          }} />
          {/* 待機表示もエラーも送信行に置く。入力欄の上下に帯が増えるほど、押す場所が遠くなる。
          行は入力欄の中（最下行）に置く。外に出すと、その下に畳んである
          「条件・機能・参照情報」が入力欄から一段離れてしまう。
          送信を先に置くのは、待機・失敗の文言の長さで押す位置が動かないようにするため。 */}
          <div className="bundle-conversation-composer-footer">
            <div className="bundle-conversation-actions">
              {busy === '回答を生成しています…' && <button type="button" data-conversation-abort onClick={() => controller.current?.abort()}>中断</button>}
              {busy === PREPARING && <button type="button" onClick={cancelPreparation}>準備を中断</button>}
              <button type="button" className="bundle-conversation-send" disabled={!question.trim() || !!busy || !!pending || (!!status && !status.enabled)} onClick={() => void submit()}>送信</button>
            </div>
            <p className="bundle-conversation-status" role="status">
              {busy && <span className="bundle-conversation-spinner" aria-hidden="true" />}
              {busy || (pending ? '' : message)}
            </p>
          </div>
        </div>
        {/* 会話のたびには触らない設定・操作はここへ畳む。開いている間だけ入力帯が伸びる。 */}
        <details className="bundle-conversation-options" ref={optionsRef} onToggle={revealOptions}>
          <summary onClick={e => {
            if (!lifetime.isCurrent()) return;
            collapseChildren.current = e.shiftKey;
          }}
            onKeyDown={e => {
              if (!lifetime.isCurrent()) return;
              if (e.key === 'Enter' || e.key === ' ') collapseChildren.current = e.shiftKey;
            }}>条件・機能・参照情報</summary>

          {(inputHeader || (!consultation && bundleId)) && <details>
            <summary>{consultation ? '相談のアクション' : '課題を作成する'}</summary>
            {inputHeader}
            {!consultation && bundleId && <button type="button" disabled={!!busy || !!pending || !!question.trim()} onClick={() => {
              if (!lifetime.isCurrent()) return;
              const value = 'この課題の目的と完了条件に向けて、個別に進められるサブ課題候補を最大5件に分解してください。各候補の目的・完了条件・分解理由を示し、既存の子課題と重複させないでください。候補の作成や採用はまだ行わないでください。';
              draft.question = value; setQuestion(value); setContext(undefined);
            }}>サブ課題への分解を相談する質問を入力</button>}
          </details>}
          {!consultation && <details>
            <summary>進行を見直す</summary>
            <button type="button" disabled={!!busy || !!pending || !!question.trim()} onClick={() => {
              if (!lifetime.isCurrent()) return;
              const reviewQuestion = 'このBundleの目的・完了条件と資料、直近の会話に基づいて進行を見直してください。目的からの逸脱の可能性、同じ検討の繰り返し、不足する根拠を、確認できる事実と推測に分けて示してください。次の一手、保留、終結を検討する候補と理由を提案してください。検討・意思決定・実行・検証の完了を混同せず、本人の完了状態は確定しないでください。';
              draft.question = reviewQuestion; setQuestion(reviewQuestion);
            }}>進行を見直す質問を入力</button>
            {bundleId && <button type="button" disabled={!!busy || !!pending || !!question.trim()} onClick={() => {
              if (!lifetime.isCurrent()) return;
              draft.question = SUBTASK_REVIEW_QUESTION; setQuestion(SUBTASK_REVIEW_QUESTION); setContext(undefined);
            }}>子課題を含めて次の行動を整理する質問を入力</button>}
            {bundleId && <button type="button" disabled={!!busy || !!pending || !!question.trim()} onClick={() => {
              if (!lifetime.isCurrent()) return;
              const value = 'この課題の本人確認済みの到達状態・残課題・保留条件・再開メモを確認して、続きから取り組むための要約と次の一手を示してください。条件が満たされたか不明なら本人に確認してください。この質問だけでは保留の解除や完了を確定しないでください。';
              draft.question = value; setQuestion(value); setContext(undefined);
            }}>続きから相談する質問を入力</button>}
          </details>}
          {(status || context) && <details>
            <summary>参照情報</summary>
            {status && (status.enabled && modelSelector
              ? <ModelSelect selector={modelSelector} disabled={!!busy || !!pending} />
              : <p>AI：{status.enabled ? `${status.provider} / ${status.model}` : '停止中'}</p>)}
            {context && <>
              <p>相談の対象：{context.scope === 'chat-only' ? '課題化前の相談' : vault.GetThink(context.bundleId)?.Name || context.bundleId}</p>
              <p>参照資料：{context.scope === 'chat-only' ? 'なし' : `${context.sources.length}件`}</p>
              {context.bundleProgress && <details><summary>この課題の到達状態・再開メモ</summary>
                <p>読み込み済みの記録です。送信時に取り直しますが、別端末の最新変更は保証しません。</p>
                <ProgressContextDetail item={context.bundleProgress} />
              </details>}
              {context.subtasks && <SubtaskContextView value={context.subtasks} onOpen={onOpen} />}
              {context.issues.length > 0 && <ul>{context.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
              {context.sources.length > 0 && <details><summary>参照資料を確認</summary>
                {context.sources.map(s => <div key={s.thinkId}><button type="button" onClick={() => onOpen(s.thinkId)}>{s.title || s.thinkId}</button><pre>{s.content}</pre></div>)}
              </details>}
            </>}
          </details>}
        </details>
      </div>
      {record && <div className="col-sort-dialog__backdrop" onClick={() => setRecord(undefined)}>
        <div className="col-sort-dialog bundle-conversation-record" role="dialog" aria-label="会話の記録" onClick={e => e.stopPropagation()}>
          <table className="col-sort-dialog__table"><thead><tr>
            <th className="col-sort-dialog__th col-sort-dialog__th--grip">
              <button type="button" className="col-sort-dialog__close-in-table" aria-label="閉じる" onClick={() => setRecord(undefined)}><X size={10} /></button>
            </th>
            <th className="col-sort-dialog__th col-sort-dialog__th--field">会話の記録</th>
          </tr></thead></table>
          <pre className="bundle-conversation-record__body">{JSON.stringify(record, null, 2)}</pre>
          <div className="bundle-conversation-record__actions">
            <button type="button" onClick={() => download(record)}>保存する</button>
          </div>
        </div>
      </div>}
    </>}
  </section>;
}
