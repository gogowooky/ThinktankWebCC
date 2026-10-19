import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');

interface EngineConfig { deviceId: string }
const { VaultEngine } = require('./vaultEngine.cjs') as {
  VaultEngine: new (opts: {
    userDataDir: string;
    appRootDir: string;
    defaultVaultDir: string;
    deviceIdPrefix?: string;
  }) => { config: EngineConfig };
};

interface RelayStatus {
  deviceId: string;
  firebaseSignedIn: boolean;
  isAlive: boolean;
  lastHeartbeatAt: string;
  firestoreProblem: string;
}
interface RelayAgentInstance {
  saveConfig: (partial: Record<string, unknown>) => RelayStatus;
  getStatus: () => RelayStatus;
  setFirebaseRefreshToken: (refreshToken: string, email?: string, apiKey?: string) => Promise<RelayStatus>;
  stop: () => void;
  firebaseApiKey: string;
  _publishHeartbeatToFirestore: () => Promise<void>;
}
const { RelayAgent } = require('./relayAgent.cjs') as {
  RelayAgent: new (opts: {
    userDataDir: string;
    vaultEngine: { config: EngineConfig };
    aiCliRunner: { detectAvailableClis: () => Record<string, { available: boolean }> };
    firebaseApiKey?: string;
  }) => RelayAgentInstance;
};

const legacyId = `pc_${hostname().replace(/[^A-Za-z0-9_-]/g, '_')}`;
const aiCliRunner = { detectAvailableClis: () => ({}) };

let tempRoot: string;
let userDataDir: string;
let vaultDir: string;
let agent: RelayAgentInstance | null = null;

function writeEngineConfig(deviceId: string) {
  fs.writeFileSync(join(userDataDir, 'vault-engine-config.json'), JSON.stringify({ deviceId }), 'utf8');
}

function newEngine(deviceIdPrefix: string) {
  return new VaultEngine({ userDataDir, appRootDir: process.cwd(), defaultVaultDir: vaultDir, deviceIdPrefix });
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-relay-agent-'));
  userDataDir = join(tempRoot, 'userData');
  vaultDir = join(tempRoot, 'vault_ver2');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  vi.stubEnv('VITE_FIREBASE_API_KEY', '');
});

afterEach(() => {
  agent?.stop();
  agent = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('VaultEngine device id', () => {
  it('gives each program kind its own random id and keeps it across restarts', () => {
    const first = newEngine('agent').config.deviceId;
    expect(first).toMatch(new RegExp(`^agent_.+_[0-9a-f]{6}$`));
    expect(newEngine('agent').config.deviceId).toBe(first);
  });

  it('keeps the legacy id for the Electron app but replaces it for the resident agent', () => {
    writeEngineConfig(legacyId);
    expect(newEngine('pc').config.deviceId).toBe(legacyId);

    writeEngineConfig(legacyId);
    const agentId = newEngine('agent').config.deviceId;
    expect(agentId).not.toBe(legacyId);
    expect(agentId.startsWith('agent_')).toBe(true);
  });
});

describe('RelayAgent online status', () => {
  it('follows the VaultEngine device id even when an older relay config stored another one', () => {
    fs.writeFileSync(join(userDataDir, 'relay-agent-config.json'), JSON.stringify({ deviceId: legacyId }), 'utf8');
    const engine = newEngine('agent');
    agent = new RelayAgent({ userDataDir, vaultEngine: engine, aiCliRunner });
    expect(agent.getStatus().deviceId).toBe(engine.config.deviceId);
  });

  it('stays offline while enabled without a Firebase login', async () => {
    agent = new RelayAgent({ userDataDir, vaultEngine: newEngine('pc'), aiCliRunner });
    agent.saveConfig({ enabled: true, firebaseProjectId: 'demo-project' });
    await agent._publishHeartbeatToFirestore();
    const st = agent.getStatus();
    expect(st.firebaseSignedIn).toBe(false);
    expect(st.isAlive).toBe(false);
    expect(st.lastHeartbeatAt).toBe('');
    expect(st.firestoreProblem).toContain('未ログイン');
  });

  it('goes online only after Firestore accepts the heartbeat, and writes the per-device document', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('securetoken.googleapis.com')) {
        return new Response(JSON.stringify({
          id_token: 'id-token', refresh_token: 'refresh-token', user_id: 'uid-1', expires_in: '3600',
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }));
    agent = new RelayAgent({ userDataDir, vaultEngine: newEngine('pc'), aiCliRunner });
    agent.saveConfig({ enabled: false, firebaseProjectId: 'demo-project' });
    const st = await agent.setFirebaseRefreshToken('refresh-token', 'me@example.com', 'api-key-from-renderer');

    expect(agent.firebaseApiKey).toBe('api-key-from-renderer');
    expect(st.firebaseSignedIn).toBe(true);
    expect(calls.some(u => u.includes(`/devices/${encodeURIComponent(st.deviceId)}`))).toBe(true);
    expect(calls.some(u => u.endsWith('/config/activeRelay'))).toBe(true);

    agent.saveConfig({ enabled: true });
    await agent._publishHeartbeatToFirestore();
    expect(agent.getStatus().isAlive).toBe(true);
  });

  it('reports offline when Firestore rejects the heartbeat', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('securetoken.googleapis.com')) {
        return new Response(JSON.stringify({
          id_token: 'id-token', refresh_token: 'refresh-token', user_id: 'uid-1', expires_in: '3600',
        }), { status: 200 });
      }
      return new Response('{}', { status: 403 });
    }));
    agent = new RelayAgent({ userDataDir, vaultEngine: newEngine('pc'), aiCliRunner });
    agent.saveConfig({ enabled: true, firebaseProjectId: 'demo-project' });
    await agent.setFirebaseRefreshToken('refresh-token', '', 'api-key');
    await agent._publishHeartbeatToFirestore();
    const st = agent.getStatus();
    expect(st.isAlive).toBe(false);
    expect(st.firestoreProblem).toContain('403');
  });
});
