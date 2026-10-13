import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface SaveInput {
  thinkid: string; category: string; fullContent: string; keywords?: string; relatedIds?: string;
  metadata?: Record<string, unknown>; baseUpdatedAt?: string;
}
interface SavedMeta { updatedAt: string; createdAt: string; metadata: Record<string, unknown> }
interface StoredRecord { meta: Record<string, unknown>; body: string }
interface ServerMeta {
  thinkid: string; category: string; title: string; updatedAt: string; createdAt: string;
  keywords: string; relatedIds: string; sizeBytes: number; isDeleted: boolean; metadata: Record<string, unknown>;
}
interface SyncResult { added: number; updated: number; skipped: number; total: number }
const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { saveVaultRecord } = require('../../../electron/vaultSave.cjs') as {
  saveVaultRecord: (directory: string, payload: SaveInput) => SavedMeta;
};
const { deleteVaultRecord } = require('../../../electron/vaultWrite.cjs') as {
  deleteVaultRecord: (directory: string, id: string) => { status: 'missing' | 'deleted' | 'unchanged' };
};
const { syncVaultFromServer } = require('../../../electron/vaultSync.cjs') as {
  syncVaultFromServer: (directory: string, metas: ServerMeta[], fetchContent: (meta: ServerMeta) => Promise<string>) => Promise<SyncResult>;
};
const { parseFrontmatter } = require('../../../electron/mdFormat.cjs') as { parseFrontmatter: (raw: string) => StoredRecord };

const now = '2026-10-13T00:00:00.000Z';
const remoteVersion = '2026-10-14T00:00:00.000Z';
const payload: SaveInput = { thinkid: 'record', category: 'memo', fullContent: 'Local title\nLocal body',
  keywords: 'local', relatedIds: 'related', metadata: { keep: { value: 1 } } };
let directory: string;
const recordPath = (id = payload.thinkid) => join(directory, `${id}.md`);
const stored = (id = payload.thinkid) => parseFrontmatter(fs.readFileSync(recordPath(id), 'utf8'));
function remote(thinkid = payload.thinkid, updatedAt = remoteVersion): ServerMeta {
  return { thinkid, category: 'memo', title: 'Remote title', keywords: 'remote', relatedIds: 'remote-related',
    sizeBytes: 11, isDeleted: false, createdAt: now, updatedAt, metadata: { remote: { keep: true } } };
}
function waitingSync(meta = remote()) {
  let finish!: (content: string) => void;
  const fetchContent = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const pending = syncVaultFromServer(directory, [meta], fetchContent);
  expect(fetchContent).toHaveBeenCalledTimes(1);
  expect(fs.readdirSync(directory).some(file => file.endsWith('.lock'))).toBe(false);
  return { pending, finish };
}

beforeEach(() => {
  directory = fs.mkdtempSync(join(tmpdir(), 'thinktank-vault-write-'));
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(now));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('shared Electron Vault write boundary', () => {
  it('atomically deletes without losing content or metadata and rejects a stale save', () => {
    const first = saveVaultRecord(directory, payload);
    expect(deleteVaultRecord(directory, payload.thinkid)).toEqual({ status: 'deleted' });
    expect(stored()).toMatchObject({ meta: { is_deleted: true, updated_at: '2026-10-13T00:00:00.001Z', keep: { value: 1 } }, body: 'Local body' });
    expect(() => saveVaultRecord(directory, { ...payload, baseUpdatedAt: first.updatedAt })).toThrow('別の場所');
    expect(deleteVaultRecord(directory, payload.thinkid)).toEqual({ status: 'unchanged' });
    expect(deleteVaultRecord(directory, 'missing')).toEqual({ status: 'missing' });
    expect(fs.readdirSync(directory)).toEqual(['record.md']);
  });

  it('uses the same foreign-app lock for save, delete and sync without removing that lock', async () => {
    saveVaultRecord(directory, payload);
    const before = fs.readFileSync(recordPath(), 'utf8');
    const lock = `${recordPath()}.lock`, handle = fs.openSync(lock, 'wx');
    try {
      expect(() => saveVaultRecord(directory, payload)).toThrow('別のアプリ');
      expect(() => deleteVaultRecord(directory, payload.thinkid)).toThrow('別のアプリ');
      await expect(syncVaultFromServer(directory, [remote()], async () => 'remote body')).resolves.toEqual({ added: 0, updated: 0, skipped: 1, total: 1 });
      expect(fs.existsSync(lock)).toBe(true);
      expect(fs.readFileSync(recordPath(), 'utf8')).toBe(before);
    } finally { fs.closeSync(handle); fs.unlinkSync(lock); }
  });

  it('keeps the previous file readable until rename commits the complete new record', () => {
    const first = saveVaultRecord(directory, payload);
    const before = fs.readFileSync(recordPath(), 'utf8');
    const rename = fs.renameSync;
    const observe = vi.spyOn(fs, 'renameSync').mockImplementationOnce((temporary, target) => {
      expect(fs.existsSync(`${recordPath()}.lock`)).toBe(true);
      expect(fs.readFileSync(recordPath(), 'utf8')).toBe(before);
      expect(parseFrontmatter(fs.readFileSync(temporary, 'utf8')).body).toBe('New complete body');
      rename(temporary, target);
    });
    saveVaultRecord(directory, { ...payload, fullContent: 'Title\nNew complete body', baseUpdatedAt: first.updatedAt });
    expect(observe).toHaveBeenCalledTimes(1);
    expect(stored().body).toBe('New complete body');
    expect(fs.readdirSync(directory)).toEqual(['record.md']);
  });

  it.each(['save', 'delete', 'sync'] as const)('preserves the record and cleans temp and lock when %s rename fails', async operation => {
    saveVaultRecord(directory, payload);
    const before = fs.readFileSync(recordPath(), 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('rename failed'); });
    await expect(Promise.resolve().then<unknown>(() => {
      if (operation === 'save') return saveVaultRecord(directory, { ...payload, fullContent: 'Changed\nchanged' });
      if (operation === 'delete') return deleteVaultRecord(directory, payload.thinkid);
      return syncVaultFromServer(directory, [remote()], async () => 'changed');
    })).rejects.toThrow('rename failed');
    expect(fs.readFileSync(recordPath(), 'utf8')).toBe(before);
    expect(fs.readdirSync(directory)).toEqual(['record.md']);
  });

  it('cleans a partially written temp file and releases the lock after a write error', () => {
    saveVaultRecord(directory, payload);
    const before = fs.readFileSync(recordPath(), 'utf8');
    const write = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(file => {
      write(file, 'partial');
      throw new Error('disk write failed');
    });
    expect(() => deleteVaultRecord(directory, payload.thinkid)).toThrow('disk write failed');
    expect(fs.readFileSync(recordPath(), 'utf8')).toBe(before);
    expect(fs.readdirSync(directory)).toEqual(['record.md']);
  });
});

describe('sync commits against its pre-fetch local snapshot', () => {
  it('counts added, updated and already-current records without changing the result contract', async () => {
    saveVaultRecord(directory, payload);
    const current = saveVaultRecord(directory, { ...payload, thinkid: 'current' });
    const fetchContent = vi.fn(async (meta: ServerMeta) => `body ${meta.thinkid}`);
    await expect(syncVaultFromServer(directory, [remote(), remote('new'), remote('current', current.updatedAt)], fetchContent))
      .resolves.toEqual({ added: 1, updated: 1, skipped: 1, total: 3 });
    expect(fetchContent).toHaveBeenCalledTimes(2);
    expect(stored()).toMatchObject({ meta: { title: 'Remote title', remote: { keep: true }, updated_at: remoteVersion }, body: 'body record' });
    expect(fs.readdirSync(directory).sort()).toEqual(['current.md', 'new.md', 'record.md']);
    fetchContent.mockClear();
    await expect(syncVaultFromServer(directory, [remote()], fetchContent)).resolves.toEqual({ added: 0, updated: 0, skipped: 1, total: 1 });
    expect(fetchContent).not.toHaveBeenCalled();
  });

  it('keeps a save made while fetching, even when the remote timestamp is still newer', async () => {
    const first = saveVaultRecord(directory, payload);
    const { pending, finish } = waitingSync();
    const changed = saveVaultRecord(directory, { ...payload, fullContent: 'New local\nUnsynced edit', baseUpdatedAt: first.updatedAt });
    expect(Date.parse(changed.updatedAt)).toBeLessThan(Date.parse(remoteVersion));
    finish('remote body');
    await expect(pending).resolves.toEqual({ added: 0, updated: 0, skipped: 1, total: 1 });
    expect(stored().body).toBe('Unsynced edit');
  });

  it('does not revive a record deleted while fetching', async () => {
    saveVaultRecord(directory, payload);
    const { pending, finish } = waitingSync();
    deleteVaultRecord(directory, payload.thinkid);
    finish('remote body');
    await expect(pending).resolves.toEqual({ added: 0, updated: 0, skipped: 1, total: 1 });
    expect(stored()).toMatchObject({ meta: { is_deleted: true }, body: 'Local body' });
  });

  it('does not overwrite a new local file created while its remote body is fetched', async () => {
    const { pending, finish } = waitingSync();
    saveVaultRecord(directory, payload);
    finish('remote body');
    await expect(pending).resolves.toEqual({ added: 0, updated: 0, skipped: 1, total: 1 });
    expect(stored().body).toBe('Local body');
  });

  it('does not recreate a file removed while fetching', async () => {
    saveVaultRecord(directory, payload);
    const { pending, finish } = waitingSync();
    fs.unlinkSync(recordPath());
    finish('remote body');
    await expect(pending).resolves.toEqual({ added: 0, updated: 0, skipped: 1, total: 1 });
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it('detects an external edit that leaves updated_at unchanged', async () => {
    saveVaultRecord(directory, payload);
    const { pending, finish } = waitingSync();
    fs.writeFileSync(recordPath(), fs.readFileSync(recordPath(), 'utf8').replace('Local body', 'External edit'), 'utf8');
    finish('remote body');
    await expect(pending).resolves.toEqual({ added: 0, updated: 0, skipped: 1, total: 1 });
    expect(stored().body).toBe('External edit');
  });

  it('does not write any planned records when a body fetch fails', async () => {
    saveVaultRecord(directory, payload);
    const before = fs.readFileSync(recordPath(), 'utf8');
    await expect(syncVaultFromServer(directory, [remote(), remote('new')], async meta => {
      if (meta.thinkid === 'new') throw new Error('fetch failed');
      return 'remote body';
    })).rejects.toThrow('fetch failed');
    expect(fs.readFileSync(recordPath(), 'utf8')).toBe(before);
    expect(fs.readdirSync(directory)).toEqual(['record.md']);
  });
});
