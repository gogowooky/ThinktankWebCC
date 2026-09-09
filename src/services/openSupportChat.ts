import { TTApplication } from '../views/TTApplication';
import { parseManagedChatTitle } from '../utils/managedChat';
import { supportRecord } from './thoughtSupport';

export function openSupportChat(id: string) {
  const app = TTApplication.Instance;
  const think = app.Models.Vault.GetThink(id);
  if (!think) return;
  const owner = parseManagedChatTitle(think.Name)?.panel ?? 'Thinktank';
  const bundleId = supportRecord(think).bundleId;
  if (bundleId && app.OverviewPanel.BundleID !== bundleId) app.OverviewPanel.OpenBundle(bundleId, 'graph');
  const panels = { Thinktank: app.ThinktankPanel, Overview: app.OverviewPanel, Workout: app.WorkoutPanel, ReThink: app.ReThinkPanel };
  panels[owner as keyof typeof panels].SetViewMode('chat');
  // Persist first: a previously unmounted settings area reads this on mount.
  try { localStorage.setItem(`thinktank.support.selection:${app.Models.Vault.VaultName}:${owner}`, id); } catch { /* optional UI persistence */ }
  window.dispatchEvent(new CustomEvent('thinktank-support-open', { detail: { panel: owner, id } }));
}
