import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');

interface Engine {
  config: { preferredCli: string };
  saveConfig: (partial: Record<string, unknown>) => { preferredCli: string };
}

const { VaultEngine } = require('./vaultEngine.cjs') as {
  VaultEngine: new (opts: {
    userDataDir: string;
    appRootDir: string;
    defaultVaultDir: string;
  }) => Engine;
};

let tempRoot: string;
let userDataDir: string;
let vaultDir: string;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-vault-config-'));
  userDataDir = join(tempRoot, 'userData');
  vaultDir = join(tempRoot, 'vault_ver2');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('VaultEngine AI CLI config migration', () => {
  it('migrates a saved Gemini CLI preference to Antigravity', () => {
    const configPath = join(userDataDir, 'vault-engine-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ preferredCli: 'gemini' }), 'utf8');

    const engine = new VaultEngine({
      userDataDir,
      appRootDir: process.cwd(),
      defaultVaultDir: vaultDir,
    });

    expect(engine.config.preferredCli).toBe('antigravity');
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).preferredCli).toBe('antigravity');
  });

  it('also normalizes stale Gemini values received through IPC', () => {
    const engine = new VaultEngine({
      userDataDir,
      appRootDir: process.cwd(),
      defaultVaultDir: vaultDir,
    });

    expect(engine.saveConfig({ preferredCli: 'gemini' }).preferredCli).toBe('antigravity');
  });
});
