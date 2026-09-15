import { useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { SupportPanel } from '../../services/thoughtSupport';
import { parseManagedChatTitle } from '../../utils/managedChat';
import { BundleConversation } from './BundleConversation';

interface Props {
  vault: TTVault;
  panelName: SupportPanel;
  bundleId: string;
  chatId: string;
  draftScope: string;
  onStartTask?: (chatId: string, title: string) => Promise<void>;
}

export function SupportConversation({ vault, panelName, bundleId, chatId, draftScope, onStartTask }: Props) {
  useAppUpdate(vault);
  const [message, setMessage] = useState('');
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);
  const chat = vault.GetThink(chatId);
  const bundle = vault.GetThink(bundleId);
  const chatValid = chat?.ContentType === 'chat';
  const bundleValid = bundle?.ContentType === 'bundle';
  const valid = chatValid && (bundleValid || panelName === 'Thinktank');
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
  function openTaskEditor() {
    if (!chatValid) return;
    setTaskTitle(parseManagedChatTitle(chat.Name)?.title || chat.Name);
    setTaskEditorOpen(true);
    setMessage('');
  }
  async function startTask() {
    const title = taskTitle.replace(/[\r\n]+/g, ' ').trim();
    if (!onStartTask || !chatValid || taskBusy) return;
    if (!title) { setMessage('課題名を入力してください。'); return; }
    setTaskBusy(true); setMessage('');
    try {
      await onStartTask(chat.ID, title);
      setTaskEditorOpen(false);
      setMessage('Overviewで課題を開きました。');
    } catch (error) { setMessage((error as Error).message || '課題を作成できませんでした。'); }
    finally { setTaskBusy(false); }
  }
  return <div className="support-conversation">
    {valid ? <p className="support-conversation-title"><strong>{chat.Name}</strong></p>
      : <p role="status">{chatValid ? '資料の参照にはOverviewでBundleを選択してください。' : '上部のリストで相談するChatを選択してください。'}</p>}
    {valid && panelName === 'Thinktank' && onStartTask && <div className="support-task-start">
      {!taskEditorOpen ? <button type="button" onClick={openTaskEditor}>この相談を課題として始める</button> : <>
        <label>課題名<input aria-label="課題名" maxLength={200} value={taskTitle} disabled={taskBusy}
          onChange={event => setTaskTitle(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) void startTask();
          }} /></label>
        <div className="support-task-start__actions">
          <button type="button" disabled={taskBusy || !taskTitle.trim()} onClick={() => void startTask()}>{taskBusy ? '作成中…' : '作成してOverviewで開く'}</button>
          <button type="button" disabled={taskBusy} onClick={() => setTaskEditorOpen(false)}>キャンセル</button>
        </div>
      </>}
    </div>}
    {valid && <BundleConversation vault={vault} bundleId={bundleValid ? bundle.ID : undefined} chatId={chat.ID} draftScope={draftScope} onOpen={id => void openSource(id)} />}
    {message && <p role="status">{message}</p>}
  </div>;
}
