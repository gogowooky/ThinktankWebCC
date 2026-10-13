import type { TTNotifyBase } from '../models/TTNotifyBase';
import { applySelection, onModelNamesChange, type AiChatProviderName } from '../services/aiChatModelStatus';
import type { AiModelSelection } from '../services/aiModels';
import { TTUIStateManager } from './TTUIStateManager';

interface Notifiable { NotifyUpdated(): void }
interface CheckedPanel extends Notifiable {
  _parent: TTNotifyBase | null;
  SharedState: { checkedIds: string[] };
  CheckedThoughtIDs: string[];
}
type PanelName = 'ThinktankPanel' | 'SeedsPanel' | 'DiscussPanel' | 'HarvestPanel';
const PANEL_NAMES: readonly PanelName[] = ['ThinktankPanel', 'SeedsPanel', 'DiscussPanel', 'HarvestPanel'];

export function setPanelCheckedIds(panel: CheckedPanel, owner: PanelName, ids: string[]): void {
  panel.SharedState.checkedIds = ids;
  const app = panel._parent as (TTNotifyBase & Partial<Record<PanelName, Notifiable>>) | null;
  // 兄弟の描画通知を Status 通知より先に届ける既存の順序を保つ。
  for (const name of PANEL_NAMES) {
    if (name !== owner) app?.[name]?.NotifyUpdated();
  }
  TTUIStateManager.instance.notifyPropertyChanged('Application.CheckedItem.IDs');
}

export function togglePanelChecks(panel: CheckedPanel, id: string | string[], forceChecked?: boolean): void {
  const current = new Set(panel.CheckedThoughtIDs);
  for (const targetId of Array.isArray(id) ? id : [id]) {
    const nextChecked = forceChecked !== undefined ? forceChecked : !current.has(targetId);
    if (nextChecked) current.add(targetId); else current.delete(targetId);
  }
  panel.CheckedThoughtIDs = Array.from(current);
  panel.NotifyUpdated();
}

export function setPanelAreaOpen(panel: Notifiable & { IsAreaOpen: boolean }, open: boolean): void {
  if (panel.IsAreaOpen === open) return;
  panel.IsAreaOpen = open;
  panel.NotifyUpdated();
}

export function setPanelAiModel(
  panel: Notifiable & { AIChatProviderName: AiChatProviderName; SettingAIChatProviderName?: AiChatProviderName },
  selection: AiModelSelection,
  key: 'AIChatProviderName' | 'SettingAIChatProviderName' = 'AIChatProviderName',
): void {
  panel[key] = applySelection(selection);
  panel.NotifyUpdated();
}

export function subscribePanelAiModel(panel: Notifiable): () => void {
  return onModelNamesChange(() => panel.NotifyUpdated());
}
