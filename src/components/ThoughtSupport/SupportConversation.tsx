import { useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { SupportPanel } from '../../services/thoughtSupport';
import { BundleConversation } from './BundleConversation';

export function SupportConversation({ vault, panelName, bundleId, chatId, draftScope }: { vault: TTVault; panelName: SupportPanel; bundleId: string; chatId: string; draftScope: string }) {
  useAppUpdate(vault);
  const [message, setMessage] = useState('');
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
  return <div className="support-conversation">
    {valid ? <p className="support-conversation-title"><strong>{chat.Name}</strong></p>
      : <p role="status">{chatValid ? '資料の参照にはOverviewでBundleを選択してください。' : '上部のリストで相談するChatを選択してください。'}</p>}
    {valid && <BundleConversation vault={vault} bundleId={bundleValid ? bundle.ID : undefined} chatId={chat.ID} draftScope={draftScope} onOpen={id => void openSource(id)} />}
    {message && <p role="status">{message}</p>}
  </div>;
}
