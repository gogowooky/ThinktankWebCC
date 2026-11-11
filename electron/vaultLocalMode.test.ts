import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');

interface Meta { thinkid: string; title: string; updatedAt: string; createdAt: string; metadata?: Record<string, unknown> }
interface Snapshot { thinkid: string; title: string; body: string; snapshotAt: string; sourceUpdatedAt: string }
interface Engine {
  saveRecord: (payload: Record<string, unknown>) => Meta;
  deleteRecord: (id: string) => unknown;
  listMeta: () => Meta[];
  getRecord: (id: string) => { meta: Meta; body: string } | null;
  getVaultDir: () => string;
  getTrashDir: () => string;
  getIndexDir: () => string;
  getSnapshotsDir: () => string;
  importNewerRecord: (payload: Record<string, unknown>) => { status: string };
  stashExternalVersion: (record: { meta: Meta; body: string }, reason: string) => void;
  createSnapshot: (id: string) => Snapshot;
  getSnapshot: (id: string) => Snapshot | null;
  listSnapshots: (id: string) => Snapshot[];
  deleteSnapshot: (id: string) => void;
  overlayFilePath: string;
}
const { VaultEngine } = require('./vaultEngine.cjs') as {
  VaultEngine: new (opts: Record<string, unknown>) => Engine;
};
const appMode = require('./appMode.cjs') as {
  loadAppMode: (dir: string) => { storageMode: string; localVaultDir: string };
  saveAppMode: (dir: string, mode: Record<string, unknown>) => unknown;
  validateLocalVaultDir: (dir: string, backup: string) => { ok: boolean; resolved?: string; error?: string };
  prepareLocalVaultDir: (dir: string) => void;
  resolveBackupVaultRoot: (userDataDir: string, defaultVaultDir: string) => string;
};

const ID = '2026-11-03-120000';
let tempRoot: string;
let userDataDir: string;
let localRoot: string;
let engine: Engine;

function newEngine(root = localRoot): Engine {
  return new VaultEngine({
    userDataDir,
    appRootDir: tempRoot,
    defaultVaultDir: join(tempRoot, 'backup', 'vault_ver2'),
    localVaultRoot: root,
  });
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-local-'));
  userDataDir = join(tempRoot, 'userData');
  localRoot = join(tempRoot, 'Dropbox', 'Thinktank');
  fs.mkdirSync(userDataDir, { recursive: true });
  engine = newEngine();
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('ローカル運用の配置', () => {
  it('thinks/ snapshots/ trash/ system/index/ に分けて置く', () => {
    expect(engine.getVaultDir()).toBe(join(localRoot, 'thinks'));
    expect(engine.getTrashDir()).toBe(join(localRoot, 'trash'));
    expect(engine.getSnapshotsDir()).toBe(join(localRoot, 'snapshots'));
    expect(engine.getIndexDir()).toBe(join(localRoot, 'system', 'index'));
    for (const dir of ['thinks', 'trash', 'snapshots', join('system', 'index')]) {
      expect(fs.existsSync(join(localRoot, dir))).toBe(true);
    }
  });

  it('保存した Think を thinks/ の .md として読み書きする', () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: 'タイトル\n本文', keywords: '', relatedIds: '' });
    expect(fs.existsSync(join(localRoot, 'thinks', `${ID}.md`))).toBe(true);
    expect(newEngine().getRecord(ID)?.body).toBe('本文');
    expect(newEngine().listMeta().map(m => m.thinkid)).toEqual([ID]);
  });

  it('一覧の記録はバックアップ先・別フォルダと別のファイルにする', () => {
    const backup = new VaultEngine({ userDataDir, appRootDir: tempRoot, defaultVaultDir: join(tempRoot, 'backup', 'vault_ver2') });
    const other = newEngine(join(tempRoot, 'other'));
    expect(new Set([engine.overlayFilePath, backup.overlayFilePath, other.overlayFilePath]).size).toBe(3);
    expect(engine.overlayFilePath.startsWith(userDataDir)).toBe(true);
  });
});

describe('保存した端末の記録', () => {
  it('savedDeviceId を metadata に記録し、metadata の無い保存でも既存の metadata を残す', () => {
    engine.saveRecord({ thinkid: ID, category: 'links', fullContent: 'T\n本文', keywords: '', relatedIds: '', metadata: { linkTarget: 'https://example.com/' }, savedDeviceId: 'PC1' });
    expect(newEngine().getRecord(ID)?.meta.metadata).toEqual({ linkTarget: 'https://example.com/', savedDeviceId: 'PC1' });

    engine.saveRecord({ thinkid: ID, category: 'links', fullContent: 'T\n本文2', keywords: '', relatedIds: '', savedDeviceId: 'mobile-ios' });
    expect(newEngine().getRecord(ID)?.meta.metadata).toEqual({ linkTarget: 'https://example.com/', savedDeviceId: 'mobile-ios' });
  });

  it('savedDeviceId を渡さない保存では metadata を変えない', () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: 'T', keywords: '', relatedIds: '', metadata: { step: 1 } });
    expect(newEngine().getRecord(ID)?.meta.metadata).toEqual({ step: 1 });
  });
});

describe('ファイルを消さない', () => {
  it('同じ Think を何度消しても前の退避を上書きしない', () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '1回目', keywords: '', relatedIds: '' });
    engine.deleteRecord(ID);
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '2回目', keywords: '', relatedIds: '' });
    engine.deleteRecord(ID);
    const trashed = fs.readdirSync(engine.getTrashDir()).filter(f => f.endsWith('.md'));
    expect(trashed).toHaveLength(2);
    expect(trashed.every(f => f.startsWith(`${ID}.deleted-`))).toBe(true);
    expect(engine.listMeta()).toEqual([]);
  });

  it('移行では手元より新しい版だけを書き、上書きされる版を trash/ に残す', () => {
    engine.importNewerRecord({
      thinkid: ID, category: 'memo', fullContent: '手元\n古い', keywords: '', relatedIds: '',
      createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
    });
    const older = engine.importNewerRecord({
      thinkid: ID, category: 'memo', fullContent: 'もっと古い', keywords: '', relatedIds: '',
      createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z',
    });
    expect(older.status).toBe('skipped');
    const newer = engine.importNewerRecord({
      thinkid: ID, category: 'memo', fullContent: '移行元\n新しい', keywords: '', relatedIds: '',
      createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z',
    });
    expect(newer.status).toBe('updated');
    const record = engine.getRecord(ID);
    expect(record?.body).toBe('新しい');
    expect(record?.meta.updatedAt).toBe('2026-11-03T00:00:00.000Z');
    expect(record?.meta.createdAt).toBe('2026-11-01T00:00:00.000Z');
    const stashed = fs.readdirSync(engine.getTrashDir()).filter(f => f.startsWith(`${ID}.overwritten-`));
    expect(stashed).toHaveLength(1);
    expect(fs.readFileSync(join(engine.getTrashDir(), stashed[0]), 'utf8')).toContain('古い');
  });

  it('移行元の版も trash/ に書き残せる', () => {
    engine.stashExternalVersion({
      meta: { thinkid: ID, title: 'Firestore側', updatedAt: '2026-11-02T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z' },
      body: '上書きされた本文',
    }, 'firestore-overwritten');
    const files = fs.readdirSync(engine.getTrashDir());
    expect(files.some(f => f.startsWith(`${ID}.firestore-overwritten-`) && f.endsWith('.md'))).toBe(true);
  });
});

describe('ローカルのスナップショット', () => {
  it('作成・取得・一覧・削除が Firestore 版と同じ形で動き、削除しても trash/ に残る', () => {
    engine.saveRecord({ thinkid: ID, category: 'memo', fullContent: '題\n本文A', keywords: '', relatedIds: '' });
    const created = engine.createSnapshot(ID);
    expect(created).toMatchObject({ thinkid: ID, title: '題', body: '本文A' });
    expect(fs.existsSync(join(localRoot, 'snapshots', ID, 'current.json'))).toBe(true);
    expect(engine.getSnapshot(ID)?.body).toBe('本文A');
    expect(engine.listSnapshots(ID)).toHaveLength(1);
    engine.deleteSnapshot(ID);
    expect(engine.getSnapshot(ID)).toBeNull();
    expect(engine.listSnapshots(ID)).toEqual([]);
    expect(fs.readdirSync(engine.getTrashDir()).some(f => f.startsWith(`${ID}.snapshot-`))).toBe(true);
  });

  it('無い Think のスナップショットは作れない', () => {
    expect(() => engine.createSnapshot(ID)).toThrow();
  });
});

describe('モード設定', () => {
  it('保存した設定を読み戻し、不明な値は Firestore にする', () => {
    expect(appMode.loadAppMode(userDataDir)).toEqual({ storageMode: 'firestore', localVaultDir: '' });
    appMode.saveAppMode(userDataDir, { storageMode: 'local', localVaultDir: localRoot });
    expect(appMode.loadAppMode(userDataDir)).toEqual({ storageMode: 'local', localVaultDir: localRoot });
    appMode.saveAppMode(userDataDir, { storageMode: 'cloud' });
    expect(appMode.loadAppMode(userDataDir).storageMode).toBe('firestore');
  });

  it('バックアップ先と同じ・入れ子のフォルダと相対パスを拒否する', () => {
    const backup = join(tempRoot, 'backup');
    expect(appMode.validateLocalVaultDir(backup, backup).ok).toBe(false);
    expect(appMode.validateLocalVaultDir(join(backup, 'sub'), backup).ok).toBe(false);
    expect(appMode.validateLocalVaultDir(tempRoot, backup).ok).toBe(false);
    expect(appMode.validateLocalVaultDir('relative\\dir', backup).ok).toBe(false);
    expect(appMode.validateLocalVaultDir('', backup).ok).toBe(false);
    expect(appMode.validateLocalVaultDir(localRoot, backup)).toMatchObject({ ok: true, resolved: localRoot });
  });

  it('バックアップ先は vault_ver2 の親フォルダとして求める', () => {
    expect(appMode.resolveBackupVaultRoot(userDataDir, join(tempRoot, 'backup', 'vault_ver2'))).toBe(join(tempRoot, 'backup'));
  });

  it('フォルダを用意しても既存のファイルには触れない', () => {
    fs.mkdirSync(localRoot, { recursive: true });
    fs.writeFileSync(join(localRoot, 'memo.txt'), 'keep', 'utf8');
    appMode.prepareLocalVaultDir(localRoot);
    expect(fs.readFileSync(join(localRoot, 'memo.txt'), 'utf8')).toBe('keep');
    expect(fs.existsSync(join(localRoot, 'system', 'index'))).toBe(true);
  });
});
