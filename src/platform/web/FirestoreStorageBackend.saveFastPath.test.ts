import { beforeEach, expect, it, vi } from 'vitest';
import { FirestoreStorageBackend } from './FirestoreStorageBackend';
import { StorageConflictError } from '../../services/storage/IStorageBackend';

vi.mock('./FirebaseAuthService', () => ({
  FirebaseAuthService: {
    getAuth: vi.fn(async () => ({ uid: 'user-1', idToken: 'token-1' })),
    getCurrentUser: vi.fn(() => ({ uid: 'user-1', email: '' })),
  },
}));

const BASE = '2026-11-01T00:00:00.000Z';

function storedDocument(updatedAt = BASE, updateTime = '2026-11-01T00:00:00.100Z') {
  return {
    name: 'projects/demo/databases/(default)/documents/users/user-1/vaults/vault_ver2/thinks/a',
    updateTime,
    fields: {
      thinkid: { stringValue: 'a' }, category: { stringValue: 'memo' }, title: { stringValue: '題名' },
      body: { stringValue: '本文' }, keywords: { stringValue: '' }, relatedIds: { stringValue: '' },
      metadataJson: { stringValue: '{}' }, sizeBytes: { integerValue: '12' }, isDeleted: { booleanValue: false },
      createdAt: { stringValue: '2026-10-18T00:00:00.000Z' }, updatedAt: { stringValue: updatedAt },
    },
  };
}

interface Commit { writes: Array<{ currentDocument?: { updateTime?: string } }> }

function server({ document = storedDocument(), rejectCommits = 0 } = {}) {
  const commits: Commit[] = [];
  const reads: string[] = [];
  let remaining = rejectCommits;
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/documents:commit')) {
      commits.push(JSON.parse(String(init?.body)) as Commit);
      if (remaining > 0) {
        remaining--;
        return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: 'stale' } }), { status: 400 });
      }
      return new Response(JSON.stringify({ writeResults: [{ updateTime: `2026-11-02T00:00:0${commits.length}.000Z` }] }), { status: 200 });
    }
    reads.push(url);
    return new Response(JSON.stringify(document), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { commits, reads };
}

const payload = (baseUpdatedAt: string | undefined, text = '変更') => ({
  thinkid: 'a', category: 'memo', fullContent: `題名\n${text}`, keywords: '', relatedIds: '', baseUpdatedAt,
});

beforeEach(() => {
  vi.unstubAllGlobals();
  const values = new Map<string, string>([['thinktank.web.firebaseProjectId', 'demo']]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: () => {}, removeItem: () => {} });
});

it('saves without re-reading the body when it knows the current version', async () => {
  const { commits, reads } = server();
  const backend = new FirestoreStorageBackend();
  await backend.getBody('a');
  reads.length = 0;

  const saved = await backend.save(payload(BASE));

  expect(reads).toEqual([]);
  expect(commits).toHaveLength(1);
  expect(commits[0].writes[0].currentDocument).toEqual({ updateTime: '2026-11-01T00:00:00.100Z' });
  expect(saved.createdAt).toBe('2026-10-18T00:00:00.000Z');
});

it('chains consecutive saves on the update time Firestore returned', async () => {
  const { commits, reads } = server();
  const backend = new FirestoreStorageBackend();
  await backend.getBody('a');
  reads.length = 0;

  const first = await backend.save(payload(BASE, '一回目'));
  await backend.save(payload(first.updatedAt, '二回目'));

  expect(reads).toEqual([]);
  expect(commits[1].writes[0].currentDocument).toEqual({ updateTime: '2026-11-02T00:00:01.000Z' });
});

it('reports a conflict when another device changed the Think', async () => {
  const newer = '2026-11-03T00:00:00.000Z';
  const { commits } = server({ rejectCommits: 1 });
  const backend = new FirestoreStorageBackend();
  await backend.getBody('a');
  vi.stubGlobal('fetch', (() => {
    const original = fetch;
    return vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).endsWith('/documents:commit')) return original(input, init);
      return new Response(JSON.stringify(storedDocument(newer, '2026-11-03T00:00:00.100Z')), { status: 200 });
    });
  })());

  await expect(backend.save(payload(BASE))).rejects.toBeInstanceOf(StorageConflictError);
  expect(commits).toHaveLength(1);
});

it('retries with a fresh read when only the Firestore update time was stale', async () => {
  const { commits } = server({ rejectCommits: 1, document: storedDocument(BASE, '2026-11-01T00:00:00.100Z') });
  const backend = new FirestoreStorageBackend();
  await backend.getBody('a');

  await expect(backend.save(payload(BASE))).resolves.toMatchObject({ thinkid: 'a' });
  expect(commits).toHaveLength(2);
});

it('reads first when it has no record of the Think', async () => {
  const { reads } = server();

  await new FirestoreStorageBackend().save(payload(BASE));

  expect(reads).toHaveLength(1);
});

it('reads first for a forced overwrite', async () => {
  const { commits, reads } = server();
  const backend = new FirestoreStorageBackend();
  await backend.getBody('a');
  reads.length = 0;

  await backend.save(payload(undefined));

  expect(reads).toHaveLength(1);
  expect(commits[0].writes[0].currentDocument).toBeUndefined();
});

it('fetches the full list only once when requests overlap', async () => {
  const { reads } = server();
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    reads.push(String(input));
    return new Response(JSON.stringify({ documents: [storedDocument()] }), { status: 200 });
  }));
  const backend = new FirestoreStorageBackend();

  await Promise.all([backend.listMeta(), backend.listMeta(), backend.search('本文')]);

  expect(reads).toHaveLength(1);
});
