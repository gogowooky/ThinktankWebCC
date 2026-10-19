import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const shared = require('./shared-dist/index.js') as {
  serializeMdRecord: (r: Record<string, unknown>) => string;
  createIndexShard: (deviceId: string, metas: Array<Record<string, unknown>>) => unknown;
};

interface Meta { thinkid: string; title: string; updatedAt: string }
interface Engine {
  saveRecord: (payload: Record<string, unknown>) => Meta;
  listMeta: () => Meta[];
  getIndexDir: () => string;
  getVaultDir: () => string;
}
const { VaultEngine } = require('./vaultEngine.cjs') as {
  VaultEngine: new (opts: { userDataDir: string; appRootDir: string; defaultVaultDir: string }) => Engine;
};

const ID = '2026-10-19-100000';
let tempRoot: string;
let engine: Engine;

/** 携帯の Web 版などが Drive API で書き換え、自分の索引シャードも置いた状態を作る */
function simulateEditElsewhere(updatedAt: string, title: string, writeShard: boolean) {
  const md = shared.serializeMdRecord({
    thinkid: ID, category: 'memo', title, keywords: null, relatedIds: null,
    createdAt: '2026-10-19T01:00:00.000Z', updatedAt, body: '別の端末で書いた本文',
  });
  fs.writeFileSync(join(engine.getVaultDir(), `${ID}.md`), md, 'utf8');
  if (writeShard) {
    fs.mkdirSync(engine.getIndexDir(), { recursive: true });
    const shard = shared.createIndexShard('web-phone', [
      { thinkid: ID, category: 'memo', title, keywords: null, relatedIds: null, sizeBytes: 0,
        isDeleted: false, createdAt: '2026-10-19T01:00:00.000Z', updatedAt },
    ]);
    fs.writeFileSync(join(engine.getIndexDir(), 'shard-web-phone.json'), JSON.stringify(shard), 'utf8');
  }
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-listmeta-'));
  const userDataDir = join(tempRoot, 'userData');
  const vaultDir = join(tempRoot, 'Thinktank', 'vault_ver2');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  engine = new VaultEngine({ userDataDir, appRootDir: process.cwd(), defaultVaultDir: vaultDir });
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('VaultEngine.listMeta with edits made on other devices', () => {
  it('re-reads a file when another device\'s index shard has a newer version', () => {
    const saved = engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: 'PCで書いた題\n本文' });
    expect(engine.listMeta()[0].updatedAt).toBe(saved.updatedAt);

    const later = new Date(Date.parse(saved.updatedAt) + 60_000).toISOString();
    simulateEditElsewhere(later, '携帯で直した題', true);

    const [meta] = engine.listMeta();
    expect(meta.updatedAt).toBe(later);
    expect(meta.title).toBe('携帯で直した題');
  });

  it('keeps its own newer version when the other shard is older', () => {
    const saved = engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: 'PCで書いた題\n本文' });
    const earlier = new Date(Date.parse(saved.updatedAt) - 60_000).toISOString();
    fs.mkdirSync(engine.getIndexDir(), { recursive: true });
    fs.writeFileSync(
      join(engine.getIndexDir(), 'shard-web-phone.json'),
      JSON.stringify(shared.createIndexShard('web-phone', [
        { thinkid: ID, category: 'memo', title: '古い題', keywords: null, relatedIds: null, sizeBytes: 0,
          isDeleted: false, createdAt: earlier, updatedAt: earlier },
      ])),
      'utf8',
    );
    const [meta] = engine.listMeta();
    expect(meta.updatedAt).toBe(saved.updatedAt);
    expect(meta.title).toBe('PCで書いた題');
  });
});
