import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ChatMessage } from '../../types';
import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { TTApplication } from '../../views/TTApplication';
import { AiChatView, type AiChatViewRef, type AiModelSelectorProps } from '../ThinktankPanel/AiChatView';
import { serializeChat } from '../../utils/thinkFormat';
import { parseManagedChatTitle } from '../../utils/managedChat';
import { streamChat } from '../../services/ChatApiService';
import { aiSpeakerPrefix } from '../../services/aiModels';
import { SUPPORT_POLICY, ROLE_POLICY, supportRecord, supportMessages, parseSupportAnswer, planSupportUpdate, saveSupportTurn, undoSupportChange, isReviewDue, type SupportPanel, type SupportAnswer } from '../../services/thoughtSupport';
import { applySupportEffects } from '../../services/thoughtSupportEffects';
import { StorageManager } from '../../services/storage/StorageManager';
import { openSupportChat } from '../../services/openSupportChat';
import './SupportChat.css';

export interface SupportChatRef extends AiChatViewRef { abortStreaming: () => void; save: () => void }
interface Props {
  vault: TTVault; panelName: SupportPanel; selectedId: string; bundleId?: string;
  onSelected: (id: string) => void;
  onMessages: (messages: ChatMessage[]) => void;
  onWaiting: (waiting: boolean) => void;
  modelSelector: AiModelSelectorProps;
  pane?: boolean;
}

export const SupportChat = forwardRef<SupportChatRef, Props>(function SupportChat(props, ref) {
  const { vault, panelName, selectedId, onSelected, modelSelector, pane = false } = props;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadedId, setLoadedId] = useState('');
  const [reload, setReload] = useState(0);
  const [targetId, setTargetId] = useState('');
  const [foundChats, setFoundChats] = useState<Array<{ id: string; title: string }>>([]);
  const [clock, setClock] = useState(() => new Date());
  const [explanation, setExplanation] = useState(() => { try { return localStorage.getItem('thinktank.support.explanation') || '短く、一つずつ'; } catch { return '短く、一つずつ'; } });
  const view = useRef<AiChatViewRef>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const localId = useRef('');
  const loadedThink = useRef<TTThink>();
  const capturedBundle = useRef(props.bundleId || '');
  const currentMessages = useRef<ChatMessage[]>([]);
  const retry = useRef<(() => Promise<void>) | null>(null);
  const callbacks = useRef(props); callbacks.current = props;
  const think = vault.GetThink(selectedId);
  const record = supportRecord(think);
  const info = think ? parseManagedChatTitle(think.Name) : null;
  function showMessages(next: ChatMessage[]) { currentMessages.current = next; setMessages(next); callbacks.current.onMessages(next); }
  function showWaiting(value: boolean) { busy.current = value; setWaiting(value); callbacks.current.onWaiting(value); }
  useEffect(() => {
    if (selectedId === localId.current && selectedId && loadedThink.current === think) return;
    const token = ++generation.current;
    abort.current?.abort(); showWaiting(false); setError(''); setNotice(''); setFoundChats([]); retry.current = null;
    capturedBundle.current = props.bundleId || '';
    setLoadedId('');
    if (!selectedId) { localId.current = ''; showMessages([]); return; }
    if (!think && !vault.IsLoaded) return;
    void (async () => {
      const item = vault.GetThink(selectedId);
      if (!item) throw new Error('相談が見つかりません。');
      await item.LoadContent();
      if (item.IsMetaOnly) throw new Error('相談を読み込めませんでした。');
      if (token !== generation.current) return;
      capturedBundle.current = supportRecord(item).bundleId || capturedBundle.current;
      showMessages(supportMessages(item));
      setLoadedId(item.ID); localId.current = item.ID; loadedThink.current = item;
      if (item.Metadata.supportPendingEffects) setNotice('関連ファイルの保存が途中です。「保存を再試行」で続けられます。');
    })().catch(e => { if (token === generation.current) setError(String(e.message ?? e)); });
  }, [selectedId, vault, think, vault.IsLoaded, reload]);
  useEffect(() => () => { ++generation.current; abort.current?.abort(); }, []);
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 60000); return () => clearInterval(timer); }, []);

  async function retrySave() {
    if (busy.current) return;
    if (selectedId && loadedId !== selectedId) { loadedThink.current = undefined; setReload(n => n + 1); return; }
    showWaiting(true); setError('');
    try {
      if (retry.current) await retry.current();
      else if (think?.Metadata.supportPendingEffects) await applySupportEffects(vault, think);
      retry.current = null; setNotice('保存しました。');
    } catch (e) { setError((e as Error).message); }
    finally { showWaiting(false); }
  }
  useImperativeHandle(ref, () => ({ focus: () => view.current?.focus(), scrollToPrevUser: () => view.current?.scrollToPrevUser(), scrollToNextUser: () => view.current?.scrollToNextUser(), abortStreaming: () => { abort.current?.abort(); ++generation.current; showWaiting(false); }, save: () => { void retrySave(); } }));

  async function send(text: string) {
    if (busy.current || (selectedId && loadedId !== selectedId)) return;
    if (retry.current || think?.Metadata.supportPendingEffects) { setError('先に保存を再試行してください。応答は画面に残っています。'); return; }
    const token = generation.current;
    showWaiting(true); setError(''); setNotice('');
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date().toISOString() };
    const history = [...currentMessages.current, user];
    showMessages(history);
    const controller = new AbortController(); abort.current = controller;
    let item: TTThink | undefined = think;
    try {
      // Persist the user's words before making an external model request.
      if (!item) {
        item = await vault.CreateChatThink(serializeChat(history, text.replace(/[\r\n]/g, ' ').slice(0, 80)));
        item.Metadata.supportOrigin = pane ? 'Pane' : panelName;
        if (token !== generation.current) return;
        localId.current = item.ID; loadedThink.current = item; setLoadedId(item.ID); onSelected(item.ID);
      }
      const start = supportRecord(item);
      const initialBundle = start.bundleId || (!pane ? capturedBundle.current : '') || '';
      if (!start.bundleId && initialBundle) {
        const previous = item.Metadata;
        item.Metadata = { ...previous, thoughtSupport: { ...start, bundleId: initialBundle } };
        try { await item.SaveContent(); } catch (e) { item.Metadata = previous; throw e; }
      }
      const inputContent = item.Content;
      const inputVersion = supportRecord(item).version;
      const inputItem = item;
      retry.current = () => saveSupportTurn(inputItem, history, undefined, inputContent, inputVersion, user.id, '');
      await retry.current(); retry.current = null;
      const fixed = item;
      const expected = item.Content;
      const version = supportRecord(item).version;
      const managed = parseManagedChatTitle(item.Name);
      const owner = (managed?.panel ?? panelName) as SupportPanel;
      const bundleId = supportRecord(item).bundleId;
      const scoped = !pane && bundleId ? await vault.GetThinksForBundleAsync(bundleId, true) : [];
      const available = !pane && owner === 'Thinktank' ? vault.GetThinks().filter(t => !t.ID.startsWith('__')) : scoped;
      const allowed = new Map([item, ...available, ...supportRecord(item).references.map(id => vault.GetThink(id)).filter((t): t is TTThink => !!t)].map(t => [t.ID, t]));
      // A source explicitly named by ID in the user's message is an additional reference, not an implicit Bundle switch.
      for (const id of text.match(/\[chat:([A-Za-z0-9_-]+)\]/g) ?? []) {
        const source = vault.GetThink(id.slice(6, -1));
        if (source) allowed.set(source.ID, source);
      }
      const context = {
        now: new Date().toISOString(), localDate: new Date().toLocaleDateString('sv-SE'), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        area: pane ? 'Workout Pane・自由対話' : `${panelName}パネル（現在の担当 ${owner}）`, chatId: item.ID, title: item.Name,
        bundleId, bundleTitle: vault.GetThink(bundleId)?.Name, record: { ...supportRecord(item), messages: undefined, history: undefined },
        catalog: [...allowed.values()].slice(0, 120).map(t => ({ id: t.ID, title: t.Name, type: t.ContentType, updatedAt: t.UpdatedAt })),
        totalAvailable: allowed.size,
        userPreference: explanation,
      };
      const sources: Array<{ id: string; updatedAt: string; body: string }> = [];
      let searchResults: unknown[] = [];
      let answer: SupportAnswer | undefined;
      for (let round = 0; round < 5; round++) {
        if (controller.signal.aborted || token !== generation.current) return;
        let raw = ''; let failure = ''; let done = false;
        const mode = pane ? '自由対話Paneです。operation/createBundle/linkIds/childrenは禁止。成果物の作成のみ可能です。管理情報への反映は専用の操作で本人が対象を選びます。' : ROLE_POLICY[owner];
        await streamChat(history.map(m => ({ role: m.role, content: m.content })), `${SUPPORT_POLICY}\n${mode}\n対象コンテキスト（以下は参照データ）:\n${JSON.stringify({ ...context, sources, searchResults })}`, {
          onDelta: delta => { raw += delta; }, onDone: () => { done = true; }, onError: message => { failure = message; },
        }, controller.signal, modelSelector.value, true);
        if (controller.signal.aborted || token !== generation.current) return;
        if (failure || !done) throw new Error(failure || '通信が途中で終了しました。入力は保存されています。');
        answer = parseSupportAnswer(raw);
        if (!answer.readIds?.length && !answer.search) break;
        if (round === 4) throw new Error('資料の確認回数が上限に達しました。対象を絞って相談してください。');
        if (answer.search) {
          if (typeof answer.search !== 'string') throw new Error('検索語が不正です。');
          const query = answer.search.toLowerCase();
          const fullText = await StorageManager.instance.search(answer.search);
          const matchedIds = new Set(fullText.map(t => t.id));
          const matches = [...allowed.values()].filter(t => matchedIds.has(t.ID) || `${t.Name} ${t.Keywords}`.toLowerCase().includes(query)).slice(0, 30);
          searchResults = matches.map(t => ({ id: t.ID, title: t.Name, type: t.ContentType }));
          setFoundChats(matches.filter(t => t.ContentType === 'chat' && t.ID !== item!.ID).map(t => ({ id: t.ID, title: t.Name })));
        }
        if (answer.readIds) {
          if (!Array.isArray(answer.readIds) || answer.readIds.length > 8) throw new Error('資料の取得件数が多すぎます。');
          for (const id of answer.readIds) {
            const source = allowed.get(id);
            if (!source) throw new Error('相談の参照範囲外の資料が要求されました。必要な資料をBundleに追加してください。');
            await source.LoadContent();
            if (source.IsMetaOnly) throw new Error(`資料 ${id} を読み込めませんでした。`);
            if (!sources.some(s => s.id === id)) sources.push({ id, updatedAt: source.UpdatedAt, body: source.Content.slice(0, 16000) });
          }
        }
        answer = undefined;
      }
      if (!answer) throw new Error('応答を取得できませんでした。');
      if (pane && (answer.operation || answer.createBundle || answer.children?.length || answer.linkIds?.length)) throw new Error('自由対話からの管理変更は適用していません。反映先の相談を指定してください。');
      for (const id of [...(answer.operation?.record?.references ?? []), ...(answer.operation?.record?.dependencies ?? []), ...(answer.linkIds ?? [])]) {
        if (!allowed.has(id)) throw new Error('参照範囲外のIDを使う変更は保存していません。');
      }
      for (const id of [answer.operation?.record?.parentId, answer.operation?.record?.loopId]) {
        if (id && (!allowed.has(id) || id === item.ID)) throw new Error('親または繰り返し元のIDが不正です。');
      }
      const finalMessages = [...history, { id: crypto.randomUUID(), role: 'assistant' as const, content: aiSpeakerPrefix(modelSelector.value) + answer.reply, timestamp: new Date().toISOString() }];
      showMessages(finalMessages);
      let finalAnswer = answer;
      let managementWarning = '';
      // Validation errors cannot be fixed by retrying the same save. Keep the
      // conversation, but apply none of this response's management or effects.
      try {
        planSupportUpdate(fixed, answer.operation ?? {}, text, new Date().toISOString());
      } catch (e) {
        managementWarning = `会話は保存しました。管理情報の変更は見送りました：${(e as Error).message} このまま相談を続けられます。`;
        finalAnswer = { reply: answer.reply };
      }
      const operationId = crypto.randomUUID();
      const commit = async () => {
        if (vault.GetThink(fixed.ID) !== fixed) throw new Error('相談が再読み込みされました。今回の応答をコピーしてから開き直してください。');
        const effects = finalAnswer.createBundle || finalAnswer.artifact || finalAnswer.children?.length || finalAnswer.linkIds?.length;
        await saveSupportTurn(fixed, finalMessages, finalAnswer.operation, expected, version, operationId, text,
          effects ? { answer: finalAnswer, sources: sources.map(s => ({ id: s.id, updatedAt: s.updatedAt })), operationId } : undefined);
        await applySupportEffects(vault, fixed);
      };
      retry.current = commit;
      await commit(); retry.current = null;
      if (token !== generation.current) return;
      const nextOwner = parseManagedChatTitle(fixed.Name)?.panel;
      setNotice(managementWarning || (nextOwner && nextOwner !== owner ? `担当を${nextOwner}に引き継ぎました。このまま相談を続けられます。` : '相談を保存しました。'));
      if (supportRecord(fixed).bundleId && !props.bundleId && !pane) {
        const overview = TTApplication.Instance.OverviewPanel;
        overview.OpenBundle(supportRecord(fixed).bundleId, overview.MediaType);
      }
    } catch (e) { if (token === generation.current) setError((e as Error).message); }
    finally { if (token === generation.current) showWaiting(false); }
  }

  async function reflect() {
    if (!think || !targetId || busy.current) return;
    showWaiting(true); setError('');
    try {
      const target = vault.GetThink(targetId);
      if (!target || !parseManagedChatTitle(target.Name)) throw new Error('反映先の管理相談を選んでください。');
      await target.LoadContent();
      if (target.IsMetaOnly) throw new Error('反映先を読み込めませんでした。');
      const old = supportRecord(target);
      const id = `pane-${think.ID}-${supportRecord(think).version}`;
      await saveSupportTurn(target, supportMessages(target), { record: { references: [...new Set([...old.references, think.ID])], undecided: `${old.undecided}\n個別相談の成果を確認する [chat:${think.ID}]（本人の決定としては未反映）` } }, target.Content, old.version, id, '');
      setNotice('反映先に参照と確認事項を保存しました。決定事項は変更していません。');
    } catch (e) { setError((e as Error).message); }
    finally { showWaiting(false); }
  }

  return <div className="support-chat">
    <div className="support-chat__context">
      <span>対象：{record.bundleId ? vault.GetThink(record.bundleId)?.Name ?? record.bundleId : '単独の相談'}</span>
      {!!record.handoff && <span>引き継ぎ：{record.handoff}</span>}
      {isReviewDue(record, clock) && !['完了', '中止'].includes(info?.state ?? '') && <strong>再確認・再提示の時期です。今の状況を教えてください。</strong>}
      {(record.resume || record.current || record.next) && <details><summary>前回・現在・次を確認する</summary><p>前回：{record.resume || '未記録'}</p><p>現在：{record.current || '未確認'}</p><p>次：{record.next || '相談して決めましょう'}</p><p>本人の決定：{record.decisions || '未記録'}</p><p>未決定：{record.undecided || '未記録'}</p><p>AIの提案：{record.proposals || '未記録'}</p><p>本人確認：{record.confirmedAt || '未確認'} ／ 要約更新：{record.updatedAt || '未記録'}</p></details>}
      {(record.due || record.scheduled || record.reviewAt || record.redisplayAt || record.repeatRule) && <details><summary>予定・再確認</summary><p>期限：{record.due || '未設定'}</p><p>実施予定：{record.scheduled || '未設定'}</p><p>再確認：{record.reviewAt || '未設定'}</p><p>再提示：{record.redisplayAt || '未設定'}</p><p>繰り返し：{record.repeatRule || 'なし'}</p><p>待機・保留：{record.waiting || 'なし'}</p></details>}
      {!!record.references.length && <details><summary>参照した記録</summary>{record.references.map(id => <button key={id} onClick={() => TTApplication.Instance.OpenThinkInWorkout(id)}>{vault.GetThink(id)?.Name ?? id}</button>)}</details>}
      {(record.startsAt || record.endsAt || record.checklist) && <details><summary>開催日時・手順</summary><p>開始：{record.startsAt || '未設定'} ／ 終了：{record.endsAt || '未設定'}</p><p>{record.checklist}</p></details>}
      {pane && <div><select aria-label="成果の反映先" value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">成果の反映先を選ぶ</option>{vault.GetThinks().filter(t => t.ContentType === 'chat' && t.ID !== selectedId && parseManagedChatTitle(t.Name)).map(t => <option key={t.ID} value={t.ID}>{t.Name}</option>)}</select><button disabled={!targetId || waiting} onClick={() => void reflect()}>結果を相談につなぐ</button></div>}
      {notice && <span role="status">{notice}</span>}
      {foundChats.length > 0 && <details open><summary>見つかった相談</summary>{foundChats.map(t => <button key={t.id} disabled={waiting} onClick={() => onSelected(t.id)}>{t.title}の続きを開く</button>)}</details>}
      {!selectedId && !pane && (panelName === 'Thinktank' || panelName === 'ReThink') && vault.GetThinks().filter(t => t.ContentType === 'chat' && isReviewDue(supportRecord(t), clock) && !['完了', '中止'].includes(parseManagedChatTitle(t.Name)?.state ?? '') && (panelName === 'Thinktank' || !props.bundleId || supportRecord(t).bundleId === props.bundleId)).slice(0, 5).map(t => <button key={t.ID} onClick={() => openSupportChat(t.ID)}>再確認：{t.Name}</button>)}
      {error && <span role="alert">{error}</span>}
      {(retry.current || think?.Metadata.supportPendingEffects || (!!error && !!selectedId && loadedId !== selectedId)) && <button disabled={waiting} onClick={() => void retrySave()}>{selectedId && loadedId !== selectedId ? '読み込みを再試行' : '保存を再試行'}</button>}
      {think?.Metadata.supportPendingEffects && <button disabled={waiting} onClick={() => {
        showWaiting(true); const before = think.Metadata;
        const { supportPendingEffects, ...rest } = before;
        think.Metadata = { ...rest, supportCancelledEffects: [...(rest.supportCancelledEffects ?? []), supportPendingEffects] };
        void think.SaveContent().then(() => { retry.current = null; setError(''); setNotice('残りの関連ファイル作成を中断しました。作成済みの資料は残っています。'); }).catch(e => { think.Metadata = before; setError(e.message); }).finally(() => showWaiting(false));
      }}>関連ファイルの作成を中断して相談を続ける</button>}
    </div>
    <AiChatView ref={view} messages={messages} isWaiting={waiting || (!!selectedId && loadedId !== selectedId)} onSend={text => {
      if (busy.current || (selectedId && loadedId !== selectedId)) return false;
      if (retry.current || think?.Metadata.supportPendingEffects) {
        setError('先に保存を再試行してください。入力した文章は入力欄に残しています。');
        return false;
      }
      void send(text);
      return true;
    }} modelSelector={modelSelector} explanationSelector={{ value: explanation, onChange: value => {
      setExplanation(value); try { localStorage.setItem('thinktank.support.explanation', value); } catch { /* optional preference */ }
    } }} undoManagement={pane ? undefined : {
      disabled: !think || !record.history?.length || waiting || !!retry.current || !!think.Metadata.supportPendingEffects,
      onClick: () => {
        if (!think || busy.current || retry.current || think.Metadata.supportPendingEffects) return;
        showWaiting(true); setError('');
        void undoSupportChange(think).then(() => setNotice('直前の管理変更を戻しました。会話と作成済み資料は残しています。'))
          .catch(e => setError(e.message)).finally(() => showWaiting(false));
      },
    }} />
  </div>;
});
