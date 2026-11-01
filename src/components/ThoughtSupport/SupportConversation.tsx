import { draftVaultLease } from '../../services/draftStore';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { SupportPanel } from '../../services/thoughtSupport';
import { bindChatToTask, resolveChatTask } from '../../services/chatTask';
import { BundleConversation } from './BundleConversation';
import type { AiModelSelectorProps } from './modelSelectorTypes';

interface Props {
  vault: TTVault;
  panelName: SupportPanel;
  bundleId: string;
  chatId: string;
  draftScope: string;
  pane?: boolean;
  /** パネルの AIChat モデル（Status {Panel}.AIChat.ModelName と AIChat.ModelNames.*）*/
  modelSelector?: AiModelSelectorProps;
  /** 送信の右に、待機・失敗の文言が無い間だけ出すもの */
  idleStatus?: React.ReactNode;
}

export function SupportConversation({ vault, panelName, chatId, draftScope, pane, modelSelector, idleStatus }: Props) {
  const lifetime = useMemo(() => draftVaultLease(vault), [vault]);
  useAppUpdate(vault);
  const [message, setMessage] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);
  const taskLock = useRef(false);
  const taskVersion = useRef(0);
  useEffect(() => {
    if (!lifetime.isCurrent()) return;
    taskVersion.current += 1;
    setMessage(''); setTaskBusy(false); taskLock.current = false;
    return () => {
      taskVersion.current += 1;
    };
  }, [vault, chatId, lifetime]);
  const chat = vault.GetThink(chatId);
  const association = resolveChatTask(vault, chat);
  const bundle = association.bundle;
  const chatValid = chat?.ContentType === 'chat';
  const bundleValid = bundle?.ContentType === 'project';
  const chatOnly = panelName === 'Thinktank' || !!pane;
  const valid = lifetime.isCurrent() && chatValid && !association.error && (bundleValid || chatOnly);
  async function openSource(id: string) {
    if (!lifetime.isCurrent()) return;
    try {
      const { TTApplication } = await import('../../views/TTApplication');
      if (!lifetime.isCurrent()) return;
      const app = TTApplication.Instance;
      if (app.Models.Vault !== vault) return;
      const source = vault.GetThink(id);
      if (!source) { setMessage('出典がVault一覧にありません。'); return; }
      if (!app.WorkingPanel.FocusExistingResource(id)) app.WorkingPanel.AddToRight(id, 'texteditor', source.Name);
    } catch {
      if (!lifetime.isCurrent()) return;
      setMessage('出典を開けませんでした。');
    }
  }
  async function chooseTask(id: string) {
    if (!lifetime.isCurrent()) return;
    if (!chat || taskLock.current) return;
    const target = vault.GetThink(id);
    if (!target || !association.candidates.includes(target)) return;
    const version = taskVersion.current;
    taskLock.current = true; setTaskBusy(true);
    try {
      await bindChatToTask(vault, chat, target, lifetime.isCurrent);
      if (!lifetime.isCurrent()) return;
      if (version === taskVersion.current) setMessage('相談の対象を設定しました。');
    }
    catch (e) {
      if (!lifetime.isCurrent()) return;
      if (version === taskVersion.current) setMessage((e as Error).message);
    }
    finally {
      if (lifetime.isCurrent()) {
        if (version === taskVersion.current) { taskLock.current = false; setTaskBusy(false); }
      }
    }
  }
  // Chat名はここでは出さない。会話ログの1行目に見出しとして流す（BundleConversation）。
  return <div className="support-conversation">
    {association.error && <div role="status"><p>{association.error}</p>{association.candidates.map(candidate => <button key={candidate.ID} type="button" disabled={taskBusy} onClick={() => void chooseTask(candidate.ID)}>「{candidate.Name}」を相談の対象にする</button>)}</div>}
    {!valid && !association.error && <p role="status">{chatValid ? 'このChatに対応する課題が未設定です。関連付けを確認してください。' : '上部のリストで相談するChatを選択してください。'}</p>}
    {valid && <BundleConversation vault={vault} bundleId={bundleValid ? bundle.ID : undefined} chatId={chat.ID} draftScope={draftScope} onOpen={id => void openSource(id)} modelSelector={modelSelector} idleStatus={idleStatus} />}
    {message && <p role="status">{message}</p>}
  </div>;
}
