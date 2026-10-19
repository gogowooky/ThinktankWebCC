import { beforeEach, expect, it, vi } from 'vitest';
import { encryptRelayPayload } from '../../../shared/relayCrypto';

const unsubscribe = vi.fn();
let snapshotHandler: ((snapshot: { exists: () => boolean; data: () => unknown }) => void) | null = null;

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'request-ref' })),
  collection: vi.fn(() => ({ path: 'chunks-ref' })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  onSnapshot: vi.fn((_ref, next) => {
    snapshotHandler = next;
    return unsubscribe;
  }),
}));

vi.mock('./firebaseClient', () => ({
  getFirebaseClient: vi.fn(async () => ({ app: {}, auth: {}, db: {} })),
}));

vi.mock('./FirebaseAuthService', () => ({
  FirebaseAuthService: {
    getAuth: vi.fn(async () => ({ uid: 'user-1', idToken: 'token-1' })),
    ensureSdkAuth: vi.fn(async () => ({ uid: 'user-1' })),
  },
}));

import { FirestoreRelayClient } from './FirestoreRelayClient';

beforeEach(() => {
  snapshotHandler = null;
  unsubscribe.mockClear();
  vi.unstubAllGlobals();
  const values = new Map<string, string>([
    ['thinktank.web.pcLinkEnabled', 'true'],
    ['thinktank.web.relayDeviceId', 'pc-home'],
    ['thinktank.web.relayPairingSecret', 'correct horse battery staple'],
    ['thinktank.web.firebaseProjectId', 'demo'],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

it('waits for the PC response with onSnapshot instead of periodic document GETs', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    calls.push({ url, method });
    if (url.includes('/devices/pc-home')) {
      return new Response(JSON.stringify({
        fields: { lastHeartbeatAt: { stringValue: new Date().toISOString() } },
      }), { status: 200 });
    }
    if (url.includes('/relayRequests?documentId=')) return new Response('{}', { status: 200 });
    throw new Error(`unexpected request: ${method} ${url}`);
  }));

  const pending = FirestoreRelayClient.request('ping', {});
  await vi.waitFor(() => expect(snapshotHandler).not.toBeNull());
  const response = {
    requestId: 'response-id',
    kind: 'ping' as const,
    completedAt: new Date().toISOString(),
    ok: true as const,
    result: { pong: true },
  };
  const cipher = await encryptRelayPayload(response, 'correct horse battery staple');
  snapshotHandler?.({
    exists: () => true,
    data: () => ({ status: 'succeeded', encryptedResponse: cipher, responseChunkCount: 1 }),
  });

  await expect(pending).resolves.toMatchObject({ ok: true, result: { pong: true } });
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  expect(calls[0].url).toContain('/devices/pc-home');
});

it('does not configure remote AI when PC link mode is off', () => {
  localStorage.setItem('thinktank.web.pcLinkEnabled', 'false');
  expect(FirestoreRelayClient.isConfigured()).toBe(false);
});

it('reports an offline Electron provider without trying the retired localhost agent', async () => {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 404 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(FirestoreRelayClient.request('ping', {})).rejects.toThrow('Electron版');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('firestore.googleapis.com/'), expect.any(Object),
  );
});
