import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');

interface KinakoAuthStatus {
  connected: boolean;
  email: string;
  tokenExpiresAt: string;
  localMode: boolean;
  relayEnabled: boolean;
  tokenFileWritten: boolean;
  problem: string;
}
interface RelayAgentInstance {
  saveConfig: (partial: Record<string, unknown>) => unknown;
  start: () => void;
  stop: () => void;
  setKinakoPassword: (password: string) => Promise<KinakoAuthStatus>;
  getKinakoAuthStatus: () => KinakoAuthStatus;
  signOutKinako: () => Promise<KinakoAuthStatus>;
  _syncKinakoTokenFile: () => Promise<void>;
  kinakoSession: { expiresAtMs: number } | null;
}
const { RelayAgent } = require('./relayAgent.cjs') as {
  RelayAgent: new (opts: {
    userDataDir: string;
    vaultEngine: { config: { deviceId: string } };
    aiCliRunner: { detectAvailableClis: () => Record<string, { available: boolean }> };
    firebaseApiKey?: string;
    isLocalMode?: boolean;
    getKinakoRelayDir?: () => string;
  }) => RelayAgentInstance;
};
const kinakoRelay = require('./kinakoTokenRelay.cjs') as {
  KINAKO_EMAIL: string;
  resolveKinakoRelayDir: (candidates?: string[]) => string;
  tokenFilePath: (dir: string, deviceId: string) => string;
  writeTokenFileAtomic: (filePath: string, content: unknown) => void;
};

const DEVICE_ID = 'pc_test_abc123';
const PASSWORD = 'kinako-test-password';
const aiCliRunner = { detectAvailableClis: () => ({}) };

let tempRoot: string;
let userDataDir: string;
let relayDir: string;
let agent: RelayAgentInstance | null = null;
let signInCalls: Array<{ url: string; body: string }>;
let refreshCount: number;

const configPath = () => join(userDataDir, 'relay-agent-config.json');
const tokenPath = () => kinakoRelay.tokenFilePath(relayDir, DEVICE_ID);
const readConfig = () => JSON.parse(fs.readFileSync(configPath(), 'utf8')) as Record<string, unknown>;

function newAgent(over: { isLocalMode?: boolean } = {}) {
  return new RelayAgent({
    userDataDir,
    vaultEngine: { config: { deviceId: DEVICE_ID } },
    aiCliRunner,
    firebaseApiKey: 'api-key',
    getKinakoRelayDir: () => relayDir,
    ...over,
  });
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-kinako-relay-'));
  userDataDir = join(tempRoot, 'userData');
  relayDir = join(tempRoot, 'Thinktank', 'kinako-relay');
  fs.mkdirSync(userDataDir, { recursive: true });
  signInCalls = [];
  refreshCount = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/relyingparty/verifyPassword')) {
      signInCalls.push({ url, body: String(init?.body) });
      return new Response(JSON.stringify({
        localId: 'uid-kinako', email: kinakoRelay.KINAKO_EMAIL,
        idToken: 'kinako-id-token-1', refreshToken: 'kinako-refresh-1', expiresIn: '3600',
      }), { status: 200 });
    }
    if (url.includes('securetoken.googleapis.com')) {
      refreshCount += 1;
      return new Response(JSON.stringify({
        user_id: 'uid-kinako', id_token: `kinako-id-token-r${refreshCount}`,
        refresh_token: `kinako-refresh-r${refreshCount}`, expires_in: '3600',
      }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }));
});

afterEach(() => {
  agent?.stop();
  agent = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('kinakoTokenRelay helpers', () => {
  it('Drive 上の vault_ver2 の親（Thinktank）直下に kinako-relay を解決する', () => {
    const vault = join(tempRoot, 'Thinktank', 'vault_ver2');
    fs.mkdirSync(vault, { recursive: true });
    expect(kinakoRelay.resolveKinakoRelayDir([join(tempRoot, 'missing', 'vault_ver2'), vault])).toBe(relayDir);
    expect(kinakoRelay.resolveKinakoRelayDir([join(tempRoot, 'missing', 'vault_ver2')])).toBe('');
  });

  it('一時ファイルへ書いてから rename で置き換える', () => {
    const renameSpy = vi.spyOn(fs, 'renameSync');
    const target = tokenPath();
    kinakoRelay.writeTokenFileAtomic(target, { version: 1 });

    expect(renameSpy).toHaveBeenCalledTimes(1);
    const [from, to] = renameSpy.mock.calls[0];
    expect(to).toBe(target);
    expect(String(from)).not.toBe(target);
    expect(String(from).startsWith(target)).toBe(true);
    expect(fs.readdirSync(relayDir)).toEqual([`token-${DEVICE_ID}.json`]);
  });

  it('rename に失敗したら一時ファイルを残さず、既存の内容も壊さない', () => {
    const target = tokenPath();
    kinakoRelay.writeTokenFileAtomic(target, { version: 1, idToken: 'old' });
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EBUSY');
    });
    expect(() => kinakoRelay.writeTokenFileAtomic(target, { version: 1, idToken: 'new' })).toThrow('EBUSY');
    expect(fs.readdirSync(relayDir)).toEqual([`token-${DEVICE_ID}.json`]);
    expect(JSON.parse(fs.readFileSync(target, 'utf8')).idToken).toBe('old');
  });
});

describe('RelayAgent きなこ連携', () => {
  it('setKinakoPassword はリフレッシュトークンだけを保存し、パスワードをどこにも残さない', async () => {
    agent = newAgent();
    const status = await agent.setKinakoPassword(PASSWORD);

    expect(signInCalls).toHaveLength(1);
    expect(JSON.parse(signInCalls[0].body)).toEqual({
      email: kinakoRelay.KINAKO_EMAIL, password: PASSWORD, returnSecureToken: true,
    });
    expect(status.connected).toBe(true);
    expect(status.email).toBe(kinakoRelay.KINAKO_EMAIL);
    expect(JSON.stringify(status)).not.toContain('kinako-id-token-1');
    expect(JSON.stringify(status)).not.toContain('kinako-refresh-1');

    const rawConfig = fs.readFileSync(configPath(), 'utf8');
    expect(rawConfig).not.toContain(PASSWORD);
    expect(readConfig().kinakoRefreshToken).toBe('kinako-refresh-1');
    expect(readConfig().kinakoEmail).toBe(kinakoRelay.KINAKO_EMAIL);
    // 所有者側のセッションには触れない
    expect(readConfig().firebaseRefreshToken).toBe('');
  });

  it('PC連携が OFF の間はトークンファイルを書かず、ON にすると書き、OFF に戻すと消す', async () => {
    agent = newAgent();
    await agent.setKinakoPassword(PASSWORD);
    expect(fs.existsSync(tokenPath())).toBe(false);

    agent.saveConfig({ enabled: true });
    await agent._syncKinakoTokenFile();
    const file = JSON.parse(fs.readFileSync(tokenPath(), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(file).sort()).toEqual(['expiresAt', 'idToken', 'issuedAt', 'pcId', 'version']);
    expect(file.version).toBe(1);
    expect(file.pcId).toBe(DEVICE_ID);
    expect(file.idToken).toBe('kinako-id-token-1');
    expect(file.expiresAt).toBe(new Date(agent.kinakoSession!.expiresAtMs).toISOString());
    const lifetimeMs = Date.parse(String(file.expiresAt)) - Date.parse(String(file.issuedAt));
    expect(Math.abs(lifetimeMs - 3_600_000)).toBeLessThan(5_000);
    expect(fs.readFileSync(tokenPath(), 'utf8')).not.toContain(PASSWORD);
    expect(agent.getKinakoAuthStatus().tokenFileWritten).toBe(true);

    agent.saveConfig({ enabled: false });
    await agent._syncKinakoTokenFile();
    expect(fs.existsSync(tokenPath())).toBe(false);
  });

  it('再起動後はパスワードなしで更新し、期限が近づいたら書き直す', async () => {
    agent = newAgent();
    await agent.setKinakoPassword(PASSWORD);
    agent.saveConfig({ enabled: true });
    await agent._syncKinakoTokenFile();
    agent.stop();

    agent = newAgent();
    agent.start();
    await agent._syncKinakoTokenFile();
    expect(signInCalls).toHaveLength(1);
    expect(refreshCount).toBe(1);
    expect(agent.getKinakoAuthStatus().connected).toBe(true);
    expect(JSON.parse(fs.readFileSync(tokenPath(), 'utf8')).idToken).toBe('kinako-id-token-r1');
    expect(readConfig().kinakoRefreshToken).toBe('kinako-refresh-r1');

    // 期限内は書き直さない
    await agent._syncKinakoTokenFile();
    expect(refreshCount).toBe(1);

    // 残り5分を切ったら更新して書き直す
    agent.kinakoSession!.expiresAtMs = Date.now() + 60_000;
    await agent._syncKinakoTokenFile();
    expect(refreshCount).toBe(2);
    expect(JSON.parse(fs.readFileSync(tokenPath(), 'utf8')).idToken).toBe('kinako-id-token-r2');
  });

  it('signOutKinako は config のリフレッシュトークンとトークンファイルを消す', async () => {
    agent = newAgent();
    await agent.setKinakoPassword(PASSWORD);
    agent.saveConfig({ enabled: true });
    await agent._syncKinakoTokenFile();
    expect(fs.existsSync(tokenPath())).toBe(true);

    const status = await agent.signOutKinako();
    expect(status.connected).toBe(false);
    expect(status.tokenExpiresAt).toBe('');
    expect(fs.existsSync(tokenPath())).toBe(false);
    expect(readConfig().kinakoRefreshToken).toBe('');
  });

  it('ローカル運用モードではサインインもファイル書き出しもしない', async () => {
    fs.writeFileSync(configPath(), JSON.stringify({ enabled: true, kinakoRefreshToken: 'kinako-refresh-1' }), 'utf8');
    agent = newAgent({ isLocalMode: true });
    await expect(agent.setKinakoPassword(PASSWORD)).rejects.toThrow('ローカル運用モード');
    await agent._syncKinakoTokenFile();

    expect(signInCalls).toHaveLength(0);
    expect(refreshCount).toBe(0);
    expect(fs.existsSync(tokenPath())).toBe(false);
    expect(agent.getKinakoAuthStatus().connected).toBe(false);
  });

  it('サインイン失敗時は何も保存せず、例外にパスワードを含めない', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'INVALID_PASSWORD' } }), { status: 400 })));
    agent = newAgent();
    const error = await agent.setKinakoPassword(PASSWORD).catch((e: Error) => e);
    expect((error as Error).message).toContain('INVALID_PASSWORD');
    expect((error as Error).message).not.toContain(PASSWORD);
    expect(agent.getKinakoAuthStatus().connected).toBe(false);
    expect(fs.existsSync(configPath())).toBe(false);
  });
});
