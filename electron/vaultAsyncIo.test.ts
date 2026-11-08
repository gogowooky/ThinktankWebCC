import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');

interface Meta { thinkid: string; title: string; updatedAt: string; metadata?: Record<string, unknown> }
interface Engine {
  saveRecord: (payload: Record<string, unknown>) => Meta;
  saveRecordAsync: (payload: Record<string, unknown>) => Promise<Meta>;
  saveBackupSnapshot: (payload: Record<string, unknown>) => Meta;
  saveBackupSnapshotAsync: (payload: Record<string, unknown>) => Promise<Meta>;
  getRecord: (id: string) => { meta: Meta; body: string } | null;
  listMeta: () => Meta[];
  listMetaAsync: () => Promise<Meta[]>;
  deleteRecord: (id: string) => unknown;
  getVaultDir: () => string;
  getIndexDir: () => string;
  whenIndexIdle: () => Promise<unknown>;
  stopIndexRefresh: () => void;
  scheduleIndexRefresh: (options: { shardDelayMs: number; bodyPackDelayMs: number }) => void;
  config: { deviceId: string };
}
const { VaultEngine } = require('./vaultEngine.cjs') as {
  VaultEngine: new (opts: Record<string, unknown>) => Engine;
};

const ID = '2026-11-07-100000';
let tempRoot: string;
let engine: Engine;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-async-io-'));
  const userDataDir = join(tempRoot, 'userData');
  const vaultDir = join(tempRoot, 'Thinktank', 'vault_ver2');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  engine = new VaultEngine({ userDataDir, appRootDir: process.cwd(), defaultVaultDir: vaultDir, autoIndexRefresh: true });
});

afterEach(async () => {
  engine.stopIndexRefresh();
  await engine.whenIndexIdle();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('VaultEngine asynchronous saves', () => {
  it('writes the same record as the synchronous save', async () => {
    const payload = { category: 'memo', fullContent: '題\n本文', metadata: { note: 'メモ' } };
    const sync = engine.saveRecord({ ...payload, thinkid: ID });
    const asyncId = '2026-11-07-100001';
    const saved = await engine.saveRecordAsync({ ...payload, thinkid: asyncId });

    expect(saved.title).toBe(sync.title);
    expect(saved.metadata).toEqual(sync.metadata);
    expect(engine.getRecord(asyncId)?.body).toBe('本文');
    expect(engine.getRecord(asyncId)?.meta.metadata).toEqual({ note: 'メモ' });
  });

  it('rejects a stale version like the synchronous save', async () => {
    const saved = await engine.saveRecordAsync({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    await engine.saveRecordAsync({ thinkid: ID, category: 'memo', fullContent: '題\n新しい本文', baseUpdatedAt: saved.updatedAt });

    await expect(engine.saveRecordAsync({ thinkid: ID, category: 'memo', fullContent: '題\n古い本文', baseUpdatedAt: saved.updatedAt }))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(engine.getRecord(ID)?.body).toBe('新しい本文');
  });

  it('saves one at a time for the same Think, keeping the last content', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      engine.saveRecordAsync({ thinkid: ID, category: 'memo', fullContent: `題\n本文${i}` })));

    const versions = results.map(r => r.updatedAt);
    expect(new Set(versions).size).toBe(5);
    expect(engine.getRecord(ID)?.body).toBe('本文4');
  });

  it('keeps later saves working after one fails', async () => {
    const saved = await engine.saveRecordAsync({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    await expect(engine.saveRecordAsync({ thinkid: ID, category: 'memo', fullContent: '題\n失敗', baseUpdatedAt: '2000-01-01T00:00:00.000Z' }))
      .rejects.toBeTruthy();

    await expect(engine.saveRecordAsync({ thinkid: ID, category: 'memo', fullContent: '題\n成功', baseUpdatedAt: saved.updatedAt }))
      .resolves.toMatchObject({ thinkid: ID });
  });

  it('rejects an unsafe id without touching the file system', () => {
    expect(() => engine.saveRecordAsync({ thinkid: '../escape', category: 'memo', fullContent: '題' })).toThrow();
  });

  it('keeps the canonical version in a backup and removes emptied support metadata', async () => {
    const updatedAt = '2026-11-07T01:00:00.000Z';
    await engine.saveBackupSnapshotAsync({ thinkid: ID, category: 'memo', fullContent: '題\n本文', updatedAt, metadata: { note: 'x' } });
    const supPath = join(engine.getVaultDir(), `${ID}.support.json`);
    expect(fs.existsSync(supPath)).toBe(true);
    expect(engine.getRecord(ID)?.meta.updatedAt).toBe(updatedAt);

    await engine.saveBackupSnapshotAsync({ thinkid: ID, category: 'memo', fullContent: '題\n本文', updatedAt, metadata: {} });
    expect(fs.existsSync(supPath)).toBe(false);
  });
});

describe('VaultEngine asynchronous index', () => {
  it('lists the same records as the synchronous list', async () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    engine.saveRecord({ thinkid: '2026-11-07-100001', category: 'memo', fullContent: '別の題\n本文' });

    expect(await engine.listMetaAsync()).toEqual(engine.listMeta());
  });

  it('reads files it has no record of', async () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    const copied = '2026-11-07-100002';
    const original = fs.readFileSync(join(engine.getVaultDir(), `${ID}.md`), 'utf8');
    fs.writeFileSync(join(engine.getVaultDir(), `${copied}.md`), original.replaceAll(ID, copied), 'utf8');

    expect((await engine.listMetaAsync()).map(m => m.thinkid)).toContain(copied);
  });

  it('returns an empty list when the vault folder is missing', async () => {
    fs.rmSync(engine.getVaultDir(), { recursive: true, force: true });
    expect(await engine.listMetaAsync()).toEqual([]);
  });

  it('records deletions in the refreshed shard', async () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    engine.deleteRecord(ID);

    engine.scheduleIndexRefresh({ shardDelayMs: 0, bodyPackDelayMs: 3_600_000 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await engine.whenIndexIdle();

    const shardPath = join(engine.getIndexDir(), `shard-${engine.config.deviceId}.json`);
    const shard = JSON.parse(fs.readFileSync(shardPath, 'utf8')) as { entries: Record<string, unknown>; deletedIds?: Record<string, string> };
    expect(shard.entries[ID]).toBeUndefined();
    expect(JSON.stringify(shard)).toContain(ID);
  });
});
