import { afterEach, describe, expect, it, vi } from 'vitest';
import { signInWithEmailPassword } from './firebaseAuth';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('signInWithEmailPassword', () => {
  it('legacy v3 の verifyPassword を JSON で呼び、セッションへ変換する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T00:00:00.000Z'));
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          localId: 'uid-kinako',
          email: 'kinako@example.com',
          idToken: 'id-token',
          refreshToken: 'refresh-token',
          expiresIn: '3600',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = await signInWithEmailPassword('api key/1', 'kinako@example.com', 'test-password');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://identitytoolkit.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=api%20key%2F1',
    );
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'kinako@example.com',
      password: 'test-password',
      returnSecureToken: true,
    });
    expect(session).toEqual({
      uid: 'uid-kinako',
      email: 'kinako@example.com',
      idToken: 'id-token',
      refreshToken: 'refresh-token',
      expiresAtMs: Date.parse('2026-11-12T01:00:00.000Z'),
    });
  });

  it('失敗時は Firebase のエラーコードを含む例外を投げ、パスワードは含めない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'INVALID_PASSWORD' } }), { status: 400 })),
    );
    const error = await signInWithEmailPassword('k', 'kinako@example.com', 'test-password').catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('INVALID_PASSWORD');
    expect((error as Error).message).not.toContain('test-password');
  });

  it('JSON でない応答（404 の HTML など）でも HTTP ステータスで失敗を伝える', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Not Found</html>', { status: 404 })));
    await expect(signInWithEmailPassword('k', 'kinako@example.com', 'test-password')).rejects.toThrow('HTTP 404');
  });
});
