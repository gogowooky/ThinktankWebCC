import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { VaultEngine } = require('../../../electron/vaultEngine.cjs') as {
  VaultEngine: new (opts: {
    userDataDir: string;
    appRootDir: string;
    defaultVaultDir: string;
  }) => {
    saveRecord: (payload: Record<string, unknown>) => {
      thinkid: string;
      title: string;
      updatedAt: string;
      metadata?: Record<string, unknown>;
    };
    saveSupportMetadata: (
      thinkid: string,
      metadata: Record<string, unknown>,
      expectedVersion?: string,
    ) => { thinkid: string; updatedAt: string; metadata: Record<string, unknown> };
    deleteRecord: (thinkid: string) => { thinkid: string; deletedAt: string };
    listMeta: () => Array<{
      thinkid: string;
      title: string;
      updatedAt: string;
      metadata?: Record<string, unknown>;
    }>;
    getContent: (thinkid: string) => string | null;
    search: (query: string) => Array<{ thinkid: string; title: string }>;
    getTrashDir: () => string;
  };
};

let tempRoot: string;
let userDataDir: string;
let vaultDir: string;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-vault-engine-'));
  userDataDir = join(tempRoot, 'userData');
  vaultDir = join(tempRoot, 'vault_ver2');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('VaultEngine storage operations', () => {
  it('saves .md and .support.json, enforces optimistic locking, and moves deleted files to trash', () => {
    const engine = new VaultEngine({
      userDataDir,
      appRootDir: process.cwd(),
      defaultVaultDir: vaultDir,
    });

    const first = engine.saveRecord({
      thinkid: '2026-10-18-100000',
      category: 'memo',
      fullContent: 'Local title\nLocal body',
      keywords: 'local',
      relatedIds: 'related',
      metadata: { keep: { value: 1 } },
    });

    expect(first.title).toBe('Local title');
    expect(first.metadata).toEqual({ keep: { value: 1 } });
    expect(engine.getContent('2026-10-18-100000')).toBe('Local body');

    const second = engine.saveRecord({
      thinkid: '2026-10-18-100000',
      category: 'memo',
      fullContent: 'Updated title\nUpdated body',
      expectedVersion: first.updatedAt,
    });
    expect(second.updatedAt > first.updatedAt).toBe(true);

    expect(() =>
      engine.saveRecord({
        thinkid: '2026-10-18-100000',
        category: 'memo',
        fullContent: 'Stale write\nBody',
        expectedVersion: first.updatedAt,
      }),
    ).toThrow(/競合/);

    expect(engine.search('Updated body').map((m) => m.thinkid)).toEqual(['2026-10-18-100000']);

    engine.deleteRecord('2026-10-18-100000');
    expect(engine.listMeta()).toEqual([]);
    expect(fs.existsSync(join(engine.getTrashDir(), '2026-10-18-100000.md'))).toBe(true);
    expect(fs.existsSync(join(engine.getTrashDir(), '2026-10-18-100000.support.json'))).toBe(true);
  });

  it('persists support metadata updates and keeps listMeta cache synchronized across restarts', () => {
    const engine1 = new VaultEngine({
      userDataDir,
      appRootDir: process.cwd(),
      defaultVaultDir: vaultDir,
    });

    const saved = engine1.saveRecord({
      thinkid: '2026-10-18-120000',
      category: 'chat',
      fullContent: 'ASK:Discuss｜質問\n## 続きを教えて',
      metadata: { thoughtSupport: { version: 1, resume: '候補を比較中' } },
    });

    const supUpdated = engine1.saveSupportMetadata(
      '2026-10-18-120000',
      { thoughtSupport: { version: 2, resume: '決定済み' } },
      saved.updatedAt,
    );
    expect(supUpdated.updatedAt > saved.updatedAt).toBe(true);

    const engine2 = new VaultEngine({
      userDataDir,
      appRootDir: process.cwd(),
      defaultVaultDir: vaultDir,
    });
    const metas = engine2.listMeta();
    expect(metas).toHaveLength(1);
    expect(metas[0].metadata).toEqual({
      thoughtSupport: { version: 2, resume: '決定済み' },
    });
  });
});
