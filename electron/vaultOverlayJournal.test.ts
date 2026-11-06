import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');

interface Meta { thinkid: string; title: string }
interface Engine {
  overlayFilePath: string;
  overlayJournalPath: string;
  saveRecord: (payload: Record<string, unknown>) => Meta;
  deleteRecord: (id: string) => unknown;
  listMeta: () => Meta[];
  _loadOverlay: () => { updated: Record<string, Meta>; deleted: Record<string, string> };
  _saveOverlay: (overlay: unknown) => void;
}
const { VaultEngine } = require('./vaultEngine.cjs') as {
  VaultEngine: new (opts: { userDataDir: string; appRootDir: string; defaultVaultDir: string }) => Engine;
};

const ID = '2026-11-06-100000';
const OTHER_ID = '2026-11-06-100001';
let tempRoot: string;
let options: { userDataDir: string; appRootDir: string; defaultVaultDir: string };
let engine: Engine;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-overlay-'));
  options = {
    userDataDir: join(tempRoot, 'userData'),
    appRootDir: process.cwd(),
    defaultVaultDir: join(tempRoot, 'Thinktank', 'vault_ver2'),
  };
  fs.mkdirSync(options.userDataDir, { recursive: true });
  fs.mkdirSync(options.defaultVaultDir, { recursive: true });
  engine = new VaultEngine(options);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('VaultEngine overlay journal', () => {
  it('does not rewrite the whole overlay on each save', () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    engine._saveOverlay(engine._loadOverlay());
    const before = fs.readFileSync(engine.overlayFilePath, 'utf8');

    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '新しい題\n本文' });

    expect(fs.readFileSync(engine.overlayFilePath, 'utf8')).toBe(before);
    expect(fs.readFileSync(engine.overlayJournalPath, 'utf8')).toContain('新しい題');
  });

  it('restores saves from the journal after a restart without a clean exit', () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    engine.saveRecord({ thinkid: OTHER_ID, category: 'memo', fullContent: '消す題\n本文' });
    engine.deleteRecord(OTHER_ID);

    const restarted = new VaultEngine(options)._loadOverlay();

    expect(restarted.updated[ID].title).toBe('題');
    expect(restarted.updated[OTHER_ID]).toBeUndefined();
    expect(restarted.deleted[OTHER_ID]).toBeTruthy();
  });

  it('ignores a line cut off by a crash', () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    fs.appendFileSync(engine.overlayJournalPath, '{"updated":{"thinkid":"2026', 'utf8');

    expect(new VaultEngine(options)._loadOverlay().updated[ID].title).toBe('題');
  });

  it('sees entries another process appended to the same journal', () => {
    const other = new VaultEngine(options);
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    expect(other._loadOverlay().updated[ID].title).toBe('題');

    other.saveRecord({ thinkid: OTHER_ID, category: 'memo', fullContent: '別プロセスの題\n本文' });

    expect(engine._loadOverlay().updated[OTHER_ID].title).toBe('別プロセスの題');
  });

  it('folds the journal into the overlay once it grows large', () => {
    const big = 'あ'.repeat(1024 * 1024);
    const first = engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: `題\n本文`, metadata: { note: big } });
    expect(first.thinkid).toBe(ID);
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: `題2\n本文`, metadata: { note: big } });

    expect(fs.existsSync(engine.overlayJournalPath)).toBe(false);
    expect(new VaultEngine(options)._loadOverlay().updated[ID].title).toBe('題2');
  });

  it('keeps reading an overlay written by an older version', () => {
    const meta = engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '題\n本文' });
    fs.rmSync(engine.overlayJournalPath, { force: true });
    fs.writeFileSync(engine.overlayFilePath, `${JSON.stringify({ updated: { [ID]: meta }, deleted: {}, shardChecked: {} })}\n`, 'utf8');

    expect(new VaultEngine(options).listMeta()[0].title).toBe('題');
  });
});
