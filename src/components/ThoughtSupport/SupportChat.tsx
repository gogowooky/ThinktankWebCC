import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ChatMessage } from '../../types';
import type { TTVault } from '../../models/TTVault';
import { AiChatLog, type AiChatViewRef, type AiModelSelectorProps } from '../ThinktankPanel/AiChatView';
import { supportMessages, supportRecord, type SupportPanel } from '../../services/thoughtSupport';
import './SupportChat.css';
import './SupportConversation.css';
import { SupportConversation } from './SupportConversation';

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
  const [choice, setChoice] = useState<{ selectedId: string; view: 'history' | 'conversation' }>();
  const view = choice?.selectedId === props.selectedId ? choice.view : props.selectedId ? 'history' : 'conversation';
  const legacy = useRef<SupportChatRef>(null);
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props); callbacks.current = props;
  useEffect(() => {
    if (view === 'conversation') { callbacks.current.onMessages([]); callbacks.current.onWaiting(false); }
  }, [view]);
  useImperativeHandle(ref, () => ({
    focus: () => view === 'history' ? legacy.current?.focus() : root.current?.querySelector<HTMLElement>('textarea, select')?.focus(),
    scrollToPrevUser: () => { if (view === 'history') legacy.current?.scrollToPrevUser(); },
    scrollToNextUser: () => { if (view === 'history') legacy.current?.scrollToNextUser(); },
    abortStreaming: () => { root.current?.querySelector<HTMLButtonElement>('[data-conversation-abort]')?.click(); },
    save: () => {},
  }), [view]);
  const suggested = supportRecord(props.vault.GetThink(props.selectedId)).bundleId || props.bundleId;
  const scope = `aichat:${props.panelName}:${props.pane ? props.selectedId : 'panel'}`;
  return <div ref={root} className="support-chat-host">
    <nav aria-label="AIChatの表示"><button aria-pressed={view === 'conversation'} onClick={() => setChoice({ selectedId: props.selectedId, view: 'conversation' })}>資料に基づく対話</button>
      <button aria-pressed={view === 'history'} onClick={() => setChoice({ selectedId: props.selectedId, view: 'history' })}>旧会話の履歴</button></nav>
    {view === 'history' ? <LegacySupportChat ref={legacy} {...props} />
      : <SupportConversation key={scope} vault={props.vault} suggestedBundleId={suggested} draftScope={scope} />}
  </div>;
});

/** Keep archived transcripts independent of the new Bundle conversation's writes. */
const LegacySupportChat = forwardRef<SupportChatRef, Props>(function LegacySupportChat(props, ref) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const log = useRef<HTMLDivElement>(null);
  function scrollToUser(direction: -1 | 1) {
    const container = log.current;
    if (!container) return;
    const positions = Array.from(container.querySelectorAll<HTMLElement>('.ai-chat-view__user-block'))
      .map(el => el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop);
    const next = direction < 0
      ? positions.reverse().find(top => top < container.scrollTop - 5)
      : positions.find(top => top > container.scrollTop + 5);
    container.scrollTo({ top: next ?? (direction < 0 ? 0 : container.scrollHeight), behavior: 'smooth' });
  }
  const callbacks = useRef(props); callbacks.current = props;
  const think = props.vault.GetThink(props.selectedId);
  useEffect(() => {
    let active = true;
    setMessages([]); setError('');
    callbacks.current.onMessages([]); callbacks.current.onWaiting(false);
    if (!props.selectedId) return;
    if (!think && !props.vault.IsLoaded) return;
    void (async () => {
      if (!think) throw new Error('会話が見つかりません。');
      await think.LoadContent();
      if (!active) return;
      if (think.IsMetaOnly) throw new Error('会話を読み込めませんでした。');
      const history = supportMessages(think);
      setMessages(history); callbacks.current.onMessages(history);
    })().catch(e => { if (active) setError(String(e.message ?? e)); });
    return () => { active = false; };
  }, [think, props.selectedId, props.vault.IsLoaded, revision]);
  useImperativeHandle(ref, () => ({
    focus: () => log.current?.focus(),
    scrollToPrevUser: () => scrollToUser(-1),
    scrollToNextUser: () => scrollToUser(1),
    abortStreaming: () => {}, save: () => {},
  }), []);
  const record = supportRecord(think);
  const panel = props.panelName.toLowerCase();
  return <div className="support-chat" style={{
    ['--support-panel-color' as string]: `var(--${panel}-base)`,
    ['--support-area-bg' as string]: `var(--${panel}-area-bg)`,
  }}>
    <div className="support-chat__context">
      <span role="status">会話履歴（閲覧専用）— AI実行は停止中です。</span>
      <span>目的：{record.goal || '未記録'} ／ 段階：未記録 ／ 現在：{record.current || '未記録'}</span>
      <span>暫定結論：未記録 ／ 旧AIの提案：{record.proposals || '未記録'}</span>
      <span>決定事項：{record.decisions || '未記録'} ／ 残る論点：{record.undecided || '未記録'}</span>
      <span>次の行動：{record.next || '未記録'} ／ 完了条件：{record.completion || '未記録'}</span>
      {think?.Metadata.supportPendingEffects && <span>未反映の旧AI処理が保存されています。自動実行は停止しています。</span>}
      {error && <><span role="alert">{error}</span><button onClick={() => setRevision(n => n + 1)}>読み込みを再試行</button></>}
    </div>
    <div ref={log} className="support-chat__log" tabIndex={0} style={{ flex: 1, minHeight: 0, overflow: 'auto' }} aria-label="会話履歴">
      <AiChatLog messages={messages} isWaiting={false} emptyText="一覧から過去の会話を選択してください。" />
    </div>
  </div>;
});
