import { useEffect, useRef, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { SupportPanel } from '../../services/thoughtSupport';
import { parseManagedChatTitle } from '../../utils/managedChat';
import { BundleConversation } from './BundleConversation';
import { ConversationClient } from '../../services/ConversationService';
import { taskSeedFromConversation, type TaskSeed } from '../../services/taskSeed';

const taskClient = new ConversationClient();

interface Props {
  vault: TTVault;
  panelName: SupportPanel;
  bundleId: string;
  chatId: string;
  draftScope: string;
  pane?: boolean;
  onStartTask?: (chatId: string, title: string, seed?: TaskSeed) => Promise<void>;
}

export function SupportConversation({ vault, panelName, bundleId, chatId, draftScope, pane, onStartTask }: Props) {
  useAppUpdate(vault);
  const [message, setMessage] = useState('');
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskSeed, setTaskSeed] = useState<TaskSeed>();
  const taskLock = useRef(false);
  const taskVersion = useRef(0);
  useEffect(() => {
    taskVersion.current += 1;
    setTaskEditorOpen(false); setTaskSeed(undefined); setMessage(''); setTaskBusy(false); taskLock.current = false;
    return () => { taskVersion.current += 1; };
  }, [vault, chatId]);
  const chat = vault.GetThink(chatId);
  const bundle = vault.GetThink(bundleId);
  const chatValid = chat?.ContentType === 'chat';
  const bundleValid = bundle?.ContentType === 'bundle';
  const chatOnly = panelName === 'Thinktank' || !!pane;
  const valid = chatValid && (bundleValid || chatOnly);
  async function openSource(id: string) {
    try {
      const { TTApplication } = await import('../../views/TTApplication');
      const app = TTApplication.Instance;
      if (app.Models.Vault !== vault) return;
      const source = vault.GetThink(id);
      if (!source) { setMessage('出典がVault一覧にありません。'); return; }
      if (!app.WorkoutPanel.FocusExistingResource(id)) app.WorkoutPanel.AddToRight(id, 'texteditor', source.Name);
    } catch { setMessage('出典を開けませんでした。'); }
  }
  async function openTaskEditor() {
    if (!chatValid || taskLock.current) return;
    const version = taskVersion.current;
    taskLock.current = true; setTaskBusy(true);
    setTaskTitle(parseManagedChatTitle(chat.Name)?.title || chat.Name);
    setMessage('');
    try {
      const turns = await taskClient.history(undefined, undefined, chatId, vault.ID);
      if (version !== taskVersion.current) return;
      setTaskSeed(taskSeedFromConversation(turns, vault.ID, chatId));
      setTaskEditorOpen(true);
    } catch { if (version === taskVersion.current) setMessage('会話を確認できませんでした。もう一度お試しください。'); }
    finally { if (version === taskVersion.current) { taskLock.current = false; setTaskBusy(false); } }
  }
  async function startTask() {
    const title = taskTitle.replace(/[\r\n]+/g, ' ').trim();
    if (!onStartTask || !chatValid || taskLock.current) return;
    if (!title) { setMessage('課題名を入力してください。'); return; }
    const version = taskVersion.current;
    taskLock.current = true; setTaskBusy(true); setMessage('');
    try {
      const turns = await taskClient.history(undefined, undefined, chatId, vault.ID);
      if (version !== taskVersion.current) return;
      const latest = taskSeedFromConversation(turns, vault.ID, chatId);
      if (JSON.stringify(latest) !== JSON.stringify(taskSeed)) {
        setTaskSeed(latest); setMessage('会話が更新されました。内容をもう一度確認してください。'); return;
      }
      if (taskSeed) await onStartTask(chat.ID, title, taskSeed);
      else await onStartTask(chat.ID, title);
      if (version !== taskVersion.current) return;
      setTaskEditorOpen(false);
      setMessage('Overviewで課題を開きました。');
    } catch (error) { if (version === taskVersion.current) setMessage((error as Error).message || '課題を作成できませんでした。'); }
    finally { if (version === taskVersion.current) { taskLock.current = false; setTaskBusy(false); } }
  }
  // 課題化は会話全体に対する操作なので、履歴と一緒に流れないよう入力帯へ預ける。
  const taskStart = valid && panelName === 'Thinktank' && onStartTask ? <div className="support-task-start">
    {!taskEditorOpen ? <button type="button" disabled={taskBusy} onClick={() => void openTaskEditor()}>この相談を課題として始める</button> : <>
      <label>課題名<input aria-label="課題名" maxLength={200} value={taskTitle} disabled={taskBusy}
        onChange={event => setTaskTitle(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) void startTask();
        }} /></label>
      <div className="support-task-start__actions">
        <button type="button" disabled={taskBusy || !taskTitle.trim()} onClick={() => void startTask()}>{taskBusy ? '作成中…' : '作成してOverviewで開く'}</button>
        <button type="button" disabled={taskBusy} onClick={() => setTaskEditorOpen(false)}>キャンセル</button>
      </div>
      {taskSeed ? <div className="support-task-start__summary">
        <p>会話で整理した次の内容も保存します。修正したいときはキャンセルして、会話で伝えてください。</p>
        <p><strong>目的</strong><br />{taskSeed.goal}</p>
        <p><strong>完了条件</strong><br />{taskSeed.completionCriteria}</p>
      </div> : <p>目的・完了条件は、課題を開いたあともAIと相談して整理できます。</p>}
    </>}
  </div> : undefined;
  // Chat名はここでは出さない。会話ログの1行目に見出しとして流す（BundleConversation）。
  return <div className="support-conversation">
    {!valid && <p role="status">{chatValid ? '資料の参照にはOverviewでBundleを選択してください。' : '上部のリストで相談するChatを選択してください。'}</p>}
    {valid && <BundleConversation vault={vault} bundleId={bundleValid ? bundle.ID : undefined} chatId={chat.ID} draftScope={draftScope} optionalSources={panelName === 'Thinktank'} onOpen={id => void openSource(id)} inputHeader={taskStart} />}
    {message && <p role="status">{message}</p>}
  </div>;
}
