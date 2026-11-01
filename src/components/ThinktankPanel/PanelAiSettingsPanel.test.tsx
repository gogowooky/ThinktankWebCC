// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ vault: undefined as unknown }));
vi.mock('../../models/TTModels', () => ({ TTModels: { get Instance() { return { Vault: mocks.vault }; } } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { TTVault } from '../../models/TTVault';
import { TTApplication } from '../../views/TTApplication';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { PanelAiSettingsPanel } from './PanelAiSettingsPanel';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  TTApplication.resetInstance(); localStorage.clear(); mocks.vault = new TTVault('test');
  TTUIStateManager.instance.init(TTApplication.Instance);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); TTApplication.resetInstance(); vi.unstubAllGlobals(); });

const select = (label: string) => host.querySelector<HTMLSelectElement>(`select[aria-label="${label}のAI"]`)!;

it('lists GNB directly below Gemini for every panel', async () => {
  await act(async () => root.render(<PanelAiSettingsPanel />));
  expect([...host.querySelectorAll('.tt-panel-ai__label')].map(e => e.textContent)).toEqual(['Thinktank', 'Seeds', 'Working', 'Harvest', 'Panes']);
  expect([...select('Thinktank').options].map(o => o.textContent)).toEqual(['ChatGPT', 'Claude', 'Gemini', 'GNB', 'Local']);
});

it.each([
  ['Thinktank', 'ThinktankPanel.AIChat.ModelName'],
  ['Seeds', 'SeedsPanel.AIChat.ModelName'],
  ['Working', 'WorkingSettingPanel.AIChat.ModelName'],
  ['Harvest', 'HarvestPanel.AIChat.ModelName'],
  ['Panes', 'WorkingPanel.AIChat.ModelName'],
])('saves the %s choice to %s', async (label, key) => {
  await act(async () => root.render(<PanelAiSettingsPanel />));
  await act(async () => {
    select(label).value = 'GNB';
    select(label).dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(TTUIStateManager.instance.getProperty(key)).toBe('GNB');
  expect(select(label).value).toBe('GNB');
});
