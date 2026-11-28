import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { registerIpcHandlers } = require('./index.cjs') as {
  registerIpcHandlers: (ipcMain: FakeIpcMain, ctx: Record<string, unknown>) => void;
};
const { desktopClientPaths } = require('./relayIpc.cjs') as {
  desktopClientPaths: (userDataDir: string) => string[];
};

type Handler = (event: unknown, ...args: unknown[]) => unknown;
interface FakeIpcMain { handle: (channel: string, fn: Handler) => void; on: (channel: string, fn: Handler) => void }

function setup(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, Handler>();
  const duplicates: string[] = [];
  const add = (channel: string, fn: Handler) => {
    if (handlers.has(channel)) duplicates.push(channel);
    handlers.set(channel, fn);
  };
  const vaultEngine = {
    config: { preferredCli: 'codex', preferredModel: 'm1', deviceId: 'pc-1' },
    listMeta: vi.fn(() => ['meta']),
    getActiveDomainProfile: vi.fn(() => ({ id: 'default' })),
  };
  const ctx = {
    app: { getPath: () => '/userData' },
    BrowserWindow: { getAllWindows: () => [] },
    dialog: {},
    shell: {},
    vaultEngine,
    relayAgent: { getStatus: vi.fn(() => 'relay-status') },
    mcpHttpServer: { getStatus: vi.fn(() => 'mcp-status') },
    aiCliRunner: { detectAvailableClis: vi.fn(() => ['claude', 'codex']) },
    STARTUP_MODE: { storageMode: 'firestore', localVaultDir: '', startupProblem: '' },
    isLocalMode: false,
    DEFAULT_VAULT_DIR: '/vault',
    appRoot: () => '/app',
    ...overrides,
  };
  registerIpcHandlers({ handle: add, on: add }, ctx);
  const invoke = (channel: string, ...args: unknown[]) => {
    const fn = handlers.get(channel);
    if (!fn) throw new Error(`未登録: ${channel}`);
    return fn({}, ...args);
  };
  return { handlers, duplicates, invoke, vaultEngine, ctx };
}

/** 画面（preload.cjs）が ipcRenderer.invoke で呼ぶチャンネル */
function preloadInvokeChannels(): string[] {
  const preload = readFileSync(join(__dirname, '..', 'preload.cjs'), 'utf8');
  return [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m => m[1]);
}

describe('electron/ipc の登録', () => {
  it('画面が呼ぶチャンネルがすべて登録され、余分な登録もない', () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual([...new Set(preloadInvokeChannels())].sort());
  });

  it('同じチャンネルを二重に登録しない（ipcMain.handle は二重登録で例外になる）', () => {
    expect(setup().duplicates).toEqual([]);
  });

  it('各窓口は ctx で渡した部品を使う', async () => {
    const { invoke, vaultEngine } = setup();
    expect(invoke('storage:listMeta')).toEqual(['meta']);
    expect(vaultEngine.listMeta).toHaveBeenCalledTimes(1);
    expect(invoke('relay:getStatus')).toBe('relay-status');
    expect(invoke('mcpHttp:getStatus')).toBe('mcp-status');
    expect(invoke('ai:getStatus')).toEqual({
      availableClis: ['claude', 'codex'], preferredCli: 'codex', preferredModel: 'm1', activeProfileId: 'default',
    });
    expect(invoke('appMode:get')).toMatchObject({ running: { storageMode: 'firestore', localVaultDir: '' }, startupProblem: '' });
    await expect(invoke('system:isDirectory', 'relative/path')).resolves.toEqual({ ok: false, error: 'path must be absolute' });
  });

  it('ローカル運用モードでは移行・上書きコピーを断る', () => {
    const { invoke } = setup({ isLocalMode: true });
    expect(() => invoke('localVault:listMeta', '/somewhere')).toThrow('Firestore で使う');
    expect(() => invoke('overwriteImport:listIds', '/somewhere')).toThrow('Firestore で使う');
  });

  it('デスクトップ用 OAuth クライアントは userData と electron/ 直下で探す', () => {
    expect(desktopClientPaths('/userData')).toEqual([
      join('/userData', 'google-oauth-desktop.json'),
      join(__dirname, '..', 'google-oauth-desktop.json'),
    ]);
  });
});
