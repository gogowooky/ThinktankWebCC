// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
vi.mock('./BundleThoughtSupport', () => ({ BundleThoughtSupport: () => null }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: {} } }));
import { BundleStatusView } from './BundleStatusView';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';

const bundleId = '2026-09-14-100000', sourceId = '2026-09-14-100001';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it.each([false, true])('uses the same bounded context for the resource list (explicit membership: %s)', async included => {
  const vault = new TTVault('test'); vault.IsLoaded = true;
  for (const [id, content, type] of [
    [bundleId, `課題${included ? `\n* ${sourceId}` : ''}`, 'bundle'],
    [sourceId, '対象資料のタイトル\n本文', 'memo'],
  ] as const) {
    const think = new TTThink(); think.ID = id; think.ContentType = type;
    think.Content = content; think.markSaved(); vault.AddItem(think);
  }
  await act(async () => {
    root.render(<BundleStatusView vault={vault} bundleId={bundleId} onOpen={vi.fn()} />);
  });
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.querySelector('[aria-busy]')?.getAttribute('aria-busy')).toBe('false');
  });
  expect(host.textContent?.includes('対象資料のタイトル')).toBe(included);
  expect(host.textContent).toContain(`その他の記録 ${included ? 1 : 0}件`);
});
