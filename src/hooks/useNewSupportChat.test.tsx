// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from '../models/TTVault';
import { NEW_CHAT_SENTINEL_ID } from '../utils/thinkFormat';
import { filterSupportChats } from './useSupportChats';
import { useNewSupportChat } from './useNewSupportChat';

let root: ReturnType<typeof createRoot>, vault: TTVault;
let chat: ReturnType<typeof useNewSupportChat>;
const selected = vi.fn();
function Probe({ source }: { source: TTVault }) { chat = useNewSupportChat(source, selected); return null; }
async function show(source = vault) { await act(async () => root.render(<Probe source={source} />)); }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storage.save.mockResolvedValue({}); vault = new TTVault('vault');
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it('saves a real Thinktank Chat once during concurrent clicks, then selects it', async () => {
  let finish!: (value: object) => void;
  storage.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await show();
  await act(async () => { void chat.select(NEW_CHAT_SENTINEL_ID); void chat.select(NEW_CHAT_SENTINEL_ID); });
  expect(storage.save).toHaveBeenCalledTimes(1);
  expect(selected).not.toHaveBeenCalled(); expect(chat.creating).toBe(true);
  await act(async () => finish({}));
  const created = vault.GetThink(selected.mock.calls[0][0])!;
  expect(created.ContentType).toBe('chat'); expect(created.IsDirty).toBe(false);
  expect(filterSupportChats(vault.GetThinks(), 'Thinktank', '', [])).toEqual([created]);
  expect(chat.creating).toBe(false);
});

it('preserves the prior selection on save failure and allows retry without a phantom Chat', async () => {
  await show();
  storage.save.mockRejectedValueOnce(new Error('保存失敗'));
  await act(async () => { await chat.select(NEW_CHAT_SENTINEL_ID); });
  expect(selected).not.toHaveBeenCalled(); expect(vault.GetThinks()).toHaveLength(0);
  expect(chat.error).toContain('再試行');
  await act(async () => { await chat.select(NEW_CHAT_SENTINEL_ID); });
  expect(selected).toHaveBeenCalledTimes(1); expect(chat.error).toBe('');
});

it('does not replace a later selection when creation finishes', async () => {
  let finish!: (value: object) => void;
  storage.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await show();
  await act(async () => { void chat.select(NEW_CHAT_SENTINEL_ID); await chat.select('existing'); });
  await act(async () => finish({}));
  expect(selected.mock.calls).toEqual([['existing']]);
  expect(vault.GetThinks()).toHaveLength(1);
});

it('does not select a Chat created for a previous Vault', async () => {
  let finish!: (value: object) => void;
  storage.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await show(); await act(async () => { void chat.select(NEW_CHAT_SENTINEL_ID); });
  const other = new TTVault('other'); await show(other);
  await act(async () => finish({}));
  expect(selected).not.toHaveBeenCalled(); expect(other.GetThinks()).toHaveLength(0);
});
