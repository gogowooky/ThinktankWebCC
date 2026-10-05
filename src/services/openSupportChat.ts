import { TTApplication } from '../views/TTApplication';
import { parseManagedChatTitle } from '../utils/managedChat';
import { supportRecord } from './thoughtSupport';
import { readSubtaskChat } from './subtaskChat';

export function openSupportChat(id: string) {
  const app = TTApplication.Instance;
  const think = app.Models.Vault.GetThink(id);
  if (!think) return;
  const subtask = readSubtaskChat(think.Metadata.subtaskChat);
  const owner = subtask ? 'Discuss' : parseManagedChatTitle(think.Name)?.panel ?? 'Thinktank';
  const bundleId = subtask?.bundleId ?? (typeof think.Metadata.taskContext?.bundleId === 'string' ? think.Metadata.taskContext.bundleId : supportRecord(think).bundleId);
  if (bundleId && app.SeedsPanel.BundleID !== bundleId) app.SeedsPanel.OpenBundle(bundleId, 'graph');
  const panels = { Thinktank: app.ThinktankPanel, Seeds: app.SeedsPanel, Discuss: app.DiscussPanel, Harvest: app.HarvestPanel };
  panels[owner as keyof typeof panels].SetViewMode('chat');
  if (subtask) app.DiscussPanel.OpenArea();
  // Persist first: a previously unmounted settings area reads this on mount.
  try { localStorage.setItem(`thinktank.support.selection:${app.Models.Vault.VaultName}:${owner}`, id); } catch { /* optional UI persistence */ }
  window.dispatchEvent(new CustomEvent('thinktank-support-open', { detail: { panel: owner, id } }));
}
