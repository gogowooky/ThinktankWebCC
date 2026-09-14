import { useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { BundleConversation } from './BundleConversation';

export function SupportConversation({ vault, suggestedBundleId, draftScope }: { vault: TTVault; suggestedBundleId?: string; draftScope: string }) {
  useAppUpdate(vault);
  const [selection, setSelection] = useState<{ vault: TTVault; id: string }>();
  const bundleId = selection?.vault === vault ? selection.id : '';
  const setBundleId = (id: string) => setSelection({ vault, id });
  const [message, setMessage] = useState('');
  const bundles = vault.GetThinks().filter(t => t.ContentType === 'bundle');
  const valid = bundles.some(t => t.ID === bundleId);
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
    <label>相談するBundle
      <select value={valid ? bundleId : ''} onChange={e => { setBundleId(e.target.value); setMessage(''); }}>
        <option value="">Bundleを選択してください</option>
        {bundles.map(t => <option key={t.ID} value={t.ID}>{t.Name || t.ID}（{t.ID}）</option>)}
      </select>
    </label>
    {suggestedBundleId && bundles.some(t => t.ID === suggestedBundleId) && <button onClick={() => setBundleId(suggestedBundleId)}>表示中・関連するBundleを選ぶ</button>}
    <p>会話は選んだBundleに保存します。旧会話には追記しません。AIの接続先はサーバー設定で決まります。</p>
    {!bundles.length && <p>相談にはBundleが必要です。Bundleを作成し、資料を指定してください。</p>}
    {bundleId && !valid && <p role="status">選択したBundleが一覧にありません。対象を選び直してください。</p>}
    {valid && <BundleConversation vault={vault} bundleId={bundleId} draftScope={draftScope} onOpen={id => void openSource(id)} />}
    {message && <p role="status">{message}</p>}
  </div>;
}
