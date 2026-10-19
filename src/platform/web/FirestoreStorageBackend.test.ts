import { beforeEach, expect, it, vi } from 'vitest';
import { FirestoreStorageBackend, firestoreThinkDocumentBytes } from './FirestoreStorageBackend';
import { StorageConflictError } from '../../services/storage/IStorageBackend';

vi.mock('./FirebaseAuthService', () => ({
  FirebaseAuthService: {
    getAuth: vi.fn(async () => ({ uid: 'user-1', idToken: 'token-1' })),
  },
}));

function storedDocument(updatedAt = '2026-10-19T00:00:00.000Z') {
  return {
    name: 'projects/demo/databases/(default)/documents/users/user-1/vaults/vault_ver2/thinks/a',
    updateTime: '2026-10-19T00:00:00.100Z',
    fields: {
      thinkid: { stringValue: 'a' },
      category: { stringValue: 'memo' },
      title: { stringValue: '題名' },
      body: { stringValue: '本文' },
      keywords: { stringValue: 'key' },
      relatedIds: { stringValue: '' },
      metadataJson: { stringValue: '{}' },
      sizeBytes: { integerValue: '12' },
      isDeleted: { booleanValue: false },
      createdAt: { stringValue: '2026-10-18T00:00:00.000Z' },
      updatedAt: { stringValue: updatedAt },
    },
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  const values = new Map<string, string>([['thinktank.web.firebaseProjectId', 'demo']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
});

it('writes a new Think to the user vault as the canonical Firestore document', async () => {
  let commitFields: Record<string, { stringValue?: string; mapValue?: { fields?: Record<string, unknown> } }> = {};
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/thinks/a') && !init?.method) return new Response('{}', { status: 404 });
    if (url.endsWith('/documents:commit')) {
      const body = JSON.parse(String(init?.body || '{}')) as {
        writes?: Array<{ update?: { fields?: Record<string, { stringValue?: string }> } }>;
      };
      commitFields = body.writes?.[0]?.update?.fields ?? {};
      return new Response('{}', { status: 200 });
    }
    throw new Error(`unexpected request: ${url}`);
  }));

  const saved = await new FirestoreStorageBackend().save({
    thinkid: 'a',
    category: 'memo',
    fullContent: '題名\n本文',
    keywords: 'key',
    relatedIds: '',
    metadata: { source: 'test', state: { done: false, count: 2, ratio: 0.5, empty: null, tags: ['a', { id: 1 }] } },
  });

  expect(saved).toMatchObject({ thinkid: 'a', title: '題名', isDeleted: false });
  expect(commitFields.title.stringValue).toBe('題名');
  expect(commitFields.body.stringValue).toBe('本文');
  expect(commitFields.metadata).toEqual({ mapValue: { fields: {
    source: { stringValue: 'test' },
    state: { mapValue: { fields: {
      done: { booleanValue: false }, count: { integerValue: '2' },
      ratio: { doubleValue: 0.5 }, empty: { nullValue: null },
      tags: { arrayValue: { values: [{ stringValue: 'a' }, { mapValue: { fields: { id: { integerValue: '1' } } } }] } },
    } } },
  } } });
  expect(commitFields.metadataJson).toBeUndefined();
});

it('reads native metadata maps and legacy JSON metadata without losing nested values', async () => {
  const legacy = storedDocument();
  legacy.fields.metadataJson.stringValue = JSON.stringify({ legacy: { enabled: true } });
  const native = {
    ...storedDocument(),
    fields: { ...storedDocument().fields, metadata: { mapValue: { fields: {
      state: { mapValue: { fields: {
        count: { integerValue: '0' }, active: { booleanValue: false },
        items: { arrayValue: { values: [{ doubleValue: 1.5 }, { nullValue: null }] } },
      } } },
    } } } },
  };
  const responses = [legacy, native];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 })));
  const backend = new FirestoreStorageBackend();
  expect((await backend.getRecord('a'))?.meta.metadata).toEqual({ legacy: { enabled: true } });
  expect((await backend.getRecord('a'))?.meta.metadata).toEqual({ state: { count: 0, active: false, items: [1.5, null] } });
});

it('rejects a stale baseUpdatedAt before overwriting another PC change', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith('/thinks/a')) {
      return new Response(JSON.stringify(storedDocument()), { status: 200 });
    }
    throw new Error(`unexpected request: ${url}`);
  }));

  await expect(new FirestoreStorageBackend().save({
    thinkid: 'a', category: 'memo', fullContent: '題名\n変更', keywords: '', relatedIds: '',
    baseUpdatedAt: '2026-10-18T00:00:00.000Z',
  })).rejects.toBeInstanceOf(StorageConflictError);
});

it('excludes soft-deleted documents from the canonical list', async () => {
  const deleted = storedDocument();
  deleted.fields.isDeleted = { booleanValue: true };
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ documents: [storedDocument(), deleted] }), { status: 200 }),
  ));

  const listed = await new FirestoreStorageBackend().listMeta();
  expect(listed).toHaveLength(1);
  expect(listed[0].thinkid).toBe('a');
});

function mockDocumentStore() {
  const documents = new Map<string, { name: string; fields: Record<string, unknown>; updateTime: string }>();
  const writes: string[] = [];
  let rejectParts = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/documents:commit')) {
      const body = JSON.parse(String(init?.body)) as {
        writes: Array<{ update: { name: string; fields: Record<string, unknown> } }>;
      };
      for (const { update } of body.writes) {
        if (rejectParts && update.name.includes('/payloadParts/')) return new Response('{}', { status: 503 });
        documents.set(update.name, { ...update, updateTime: new Date().toISOString() });
        writes.push(update.name);
      }
      return new Response('{}', { status: 200 });
    }
    const name = decodeURIComponent(url.split('/v1/')[1]);
    const document = documents.get(name);
    return new Response(JSON.stringify(document ?? {}), { status: document ? 200 : 404 });
  }));
  return { documents, writes, failParts: () => { rejectParts = true; } };
}

it('measures stored values rather than the escaped REST JSON size', async () => {
  expect(firestoreThinkDocumentBytes('users/u/thinks/a', { body: { stringValue: 'あ' } })).toBe(74);
  const store = mockDocumentStore();
  const body = '"'.repeat(940 * 1024);
  const backend = new FirestoreStorageBackend();
  await backend.save({ thinkid: 'a', category: 'memo', fullContent: `title\n${body}`, keywords: '', relatedIds: '' });
  expect(store.writes).toHaveLength(1);
  expect((await backend.getRecord('a'))?.body).toBe(body);
});

it('round-trips oversized body and nested typed metadata through immutable child documents', async () => {
  const store = mockDocumentStore();
  const body = '日本語😀\n'.repeat(100_000);
  const metadata = {
    state: { done: false, missing: null, ratio: 0.5 },
    history: [{ reply: '長い応答😀'.repeat(60_000), count: 2 }, { empty: [], object: {} }],
  };
  const backend = new FirestoreStorageBackend();
  await backend.save({ thinkid: 'a', category: 'memo', fullContent: `title\n${body}`, keywords: '', relatedIds: '', metadata });
  expect(store.writes.length).toBeGreaterThan(2);
  expect(store.writes.at(-1)).toMatch(/\/thinks\/a$/);
  const restored = await backend.getRecord('a');
  expect(restored?.body).toBe(body);
  expect(restored?.meta.metadata).toEqual(metadata);
  const root = store.documents.get(store.writes.at(-1)!);
  expect(root?.fields.metadata).toEqual({ mapValue: { fields: {} } });
  expect(root?.fields.payloadParts).toBeDefined();

  store.failParts();
  await expect(backend.save({ thinkid: 'a', category: 'memo', fullContent: `new title\n${body}`, keywords: '', relatedIds: '', metadata })).rejects.toThrow('分割データ保存');
  expect((await backend.getRecord('a'))?.meta.title).toBe('title');
});

it('skips legacy system settings before making any Firestore requests', async () => {
  vi.stubGlobal('window', { electronAPI: { storage: {
    listMeta: vi.fn(async () => [{ thinkid: '__tt_ui_state__' }, { thinkid: '__tt_shortcuts__' }]),
  } } });
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const result = await new FirestoreStorageBackend().importElectronMarkdownBackup();
  expect(result).toMatchObject({ imported: 0, skipped: 2, systemSkipped: 2, failedIds: [] });
  expect(fetchMock).not.toHaveBeenCalled();
});
