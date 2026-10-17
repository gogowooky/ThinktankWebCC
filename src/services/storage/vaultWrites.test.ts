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
const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { saveVaultRecord } = require('../../../electron/vaultSave.cjs') as {
  saveVaultRecord: (directory: string, payload: SaveInput) => SavedMeta;
};
const { deleteVaultRecord } = require('../../../electron/vaultWrite.cjs') as {
  deleteVaultRecord: (directory: string, id: string) => { status: 'missing' | 'deleted' | 'unchanged' };
};
const { parseFrontmatter } = require('../../../electron/mdFormat.cjs') as { parseFrontmatter: (raw: string) => StoredRecord };

const now = '2026-10-13T00:00:00.000Z';
const payload: SaveInput = { thinkid: 'record', category: 'memo', fullContent: 'Local title\nLocal body',
  keywords: 'local', relatedIds: 'related', metadata: { keep: { value: 1 } } };
let directory: string;
const recordPath = (id = payload.thinkid) => join(directory, `${id}.md`);
const stored = (id = payload.thinkid) => parseFrontmatter(fs.readFileSync(recordPath(id), 'utf8'));
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

  it('uses the same foreign-app lock for save and delete without removing that lock', () => {
    saveVaultRecord(directory, payload);
    const before = fs.readFileSync(recordPath(), 'utf8');
    const lock = `${recordPath()}.lock`, handle = fs.openSync(lock, 'wx');
    try {
      expect(() => saveVaultRecord(directory, payload)).toThrow('別のアプリ');
      expect(() => deleteVaultRecord(directory, payload.thinkid)).toThrow('別のアプリ');
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

  it.each(['save', 'delete'] as const)('preserves the record and cleans temp and lock when %s rename fails', async operation => {
    saveVaultRecord(directory, payload);
    const before = fs.readFileSync(recordPath(), 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('rename failed'); });
    await expect(Promise.resolve().then<unknown>(() => {
      if (operation === 'save') return saveVaultRecord(directory, { ...payload, fullContent: 'Changed\nchanged' });
      return deleteVaultRecord(directory, payload.thinkid);
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
