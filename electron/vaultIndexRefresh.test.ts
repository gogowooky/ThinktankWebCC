import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');

interface Engine {
  config: { deviceId: string };
  saveRecord: (payload: Record<string, unknown>) => unknown;
  getIndexDir: () => string;
  stopIndexRefresh: () => void;
  whenIndexIdle: () => Promise<unknown>;
}
const { VaultEngine } = require('./vaultEngine.cjs') as {
  VaultEngine: new (opts: {
    userDataDir: string;
    appRootDir: string;
    defaultVaultDir: string;
    autoIndexRefresh?: boolean;
  }) => Engine;
};

let tempRoot: string;
let engine: Engine | null = null;

function newEngine(autoIndexRefresh: boolean): Engine {
  const userDataDir = join(tempRoot, 'userData');
  const vaultDir = join(tempRoot, 'Thinktank', 'vault_ver2');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  return new VaultEngine({ userDataDir, appRootDir: process.cwd(), defaultVaultDir: vaultDir, autoIndexRefresh });
}

function indexFiles(e: Engine): string[] {
  const dir = e.getIndexDir();
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

const save = (e: Engine) =>
  e.saveRecord({ thinkid: '2026-10-19-120000', category: 'memo', fullContent: 'タイトル\n本文' });

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-index-refresh-'));
  vi.useFakeTimers();
});

afterEach(() => {
  engine?.stopIndexRefresh();
  engine = null;
  vi.useRealTimers();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('VaultEngine automatic index refresh', () => {
  it('rewrites the device shard shortly after a save and the body pack later', async () => {
    engine = newEngine(true);
    save(engine);
    const shard = `shard-${engine.config.deviceId}.json`;
    const bodyPack = `body-pack-${engine.config.deviceId}.json`;
    expect(indexFiles(engine)).not.toContain(shard);

    vi.advanceTimersByTime(15_000);
    expect(indexFiles(engine)).toContain(shard);
    expect(indexFiles(engine)).not.toContain(bodyPack);
    const written = JSON.parse(fs.readFileSync(join(engine.getIndexDir(), shard), 'utf8'));
    expect(Object.keys(written.entries)).toEqual(['2026-10-19-120000']);

    vi.advanceTimersByTime(30 * 60_000);
    // 本文パックはアプリを止めないよう非同期で書くので、書き終わるのを待つ
    await engine.whenIndexIdle();
    expect(indexFiles(engine)).toContain(bodyPack);
    const pack = JSON.parse(fs.readFileSync(join(engine.getIndexDir(), bodyPack), 'utf8'));
    expect(pack.entries['2026-10-19-120000'].body).toBe('本文');
  });

  it('does nothing when automatic refresh is off (tests and tools)', () => {
    engine = newEngine(false);
    save(engine);
    vi.advanceTimersByTime(60 * 60_000);
    expect(indexFiles(engine).filter((f) => f.startsWith('shard-') || f.startsWith('body-pack-'))).toEqual([]);
  });
});
