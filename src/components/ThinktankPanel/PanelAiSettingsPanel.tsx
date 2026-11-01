/**
 * PanelAiSettingsPanel.tsx
 * Thinktank>設定>Default AI。パネルごとの会話に使う AI（プロバイダ）をドロップダウンで選ぶ。
 * 値は Status {Panel}.AIChat.ModelName に保存し、送るモデルは AIモデルで入力した CSV の先頭になる。
 */

import { TTApplication } from '../../views/TTApplication';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { AiChatProviderName } from '../../services/aiChatModelStatus';

// Working の会話は WorkingSetting パネル側、Panes は Working の各 Pane の AIChat
const PANELS: Array<{ label: string; key: string }> = [
  { label: 'Thinktank', key: 'ThinktankPanel.AIChat.ModelName' },
  { label: 'Seeds',     key: 'SeedsPanel.AIChat.ModelName' },
  { label: 'Working',   key: 'WorkingSettingPanel.AIChat.ModelName' },
  { label: 'Harvest',   key: 'HarvestPanel.AIChat.ModelName' },
  { label: 'Panes',     key: 'WorkingPanel.AIChat.ModelName' },
];

const PROVIDERS: Array<{ name: AiChatProviderName; label: string }> = [
  { name: 'OpenAI', label: 'ChatGPT' },
  { name: 'Claude', label: 'Claude' },
  { name: 'Gemini', label: 'Gemini' },
  { name: 'GNB',    label: 'GNB' },
  { name: 'Local',  label: 'Local' },
];

export function PanelAiSettingsPanel() {
  const app = TTApplication.Instance;
  useAppUpdate(app);
  const manager = TTUIStateManager.instance;

  return (
    <div className="tt-panel-ai">
      {PANELS.map(({ label, key }) => (
        <label key={key} className="tt-panel-ai__row">
          <span className="tt-panel-ai__label">{label}</span>
          <select
            className="tt-panel-ai__select"
            aria-label={`${label}のAI`}
            value={manager.getProperty(key)}
            onChange={e => manager.applyProperty(key, e.target.value)}
          >
            {PROVIDERS.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
