import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { loadDesktopClient, signInWithGoogleLoopback } = require('./googleLoopbackAuth.cjs') as {
  loadDesktopClient: (paths: string[]) => { clientId: string; clientSecret: string } | null;
  signInWithGoogleLoopback: (o: {
    clientId: string;
    clientSecret: string;
    openExternal: (url: string) => Promise<void> | void;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  }) => Promise<{ accessToken: string; idToken: string }>;
};

let tempRoot: string;
beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'thinktank-google-auth-'));
});
afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

/** ブラウザの代わりに、ログイン後の戻り（redirect）を自分で送る */
function browserThatReturns(params: (authUrl: URL) => Record<string, string>) {
  return async (url: string) => {
    const authUrl = new URL(url);
    const back = new URL(authUrl.searchParams.get('redirect_uri')!);
    for (const [k, v] of Object.entries(params(authUrl))) back.searchParams.set(k, v);
    await fetch(back);
  };
}

describe('loadDesktopClient', () => {
  it('reads the JSON downloaded from Google Cloud and skips missing files', () => {
    const file = join(tempRoot, 'client.json');
    fs.writeFileSync(file, JSON.stringify({ installed: { client_id: 'cid.apps.googleusercontent.com', client_secret: 'sec' } }));
    expect(loadDesktopClient([join(tempRoot, 'missing.json'), file])).toEqual({
      clientId: 'cid.apps.googleusercontent.com',
      clientSecret: 'sec',
    });
    expect(loadDesktopClient([join(tempRoot, 'missing.json')])).toBeNull();
  });
});

describe('signInWithGoogleLoopback', () => {
  it('opens a PKCE login on a 127.0.0.1 redirect and exchanges the returned code', async () => {
    const tokenFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('code')).toBe('the-code');
      expect(body.get('code_verifier')).toBeTruthy();
      expect(body.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      return new Response(JSON.stringify({ access_token: 'g-access', id_token: 'g-id' }), { status: 200 });
    });
    let opened: URL | null = null;
    const result = await signInWithGoogleLoopback({
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl: tokenFetch as unknown as typeof fetch,
      openExternal: browserThatReturns((authUrl) => {
        opened = authUrl;
        return { code: 'the-code', state: authUrl.searchParams.get('state')! };
      }),
    });
    expect(result).toEqual({ accessToken: 'g-access', idToken: 'g-id' });
    expect(opened!.searchParams.get('code_challenge_method')).toBe('S256');
    expect(opened!.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('rejects a redirect whose state does not match', async () => {
    await expect(
      signInWithGoogleLoopback({
        clientId: 'cid',
        clientSecret: 'sec',
        fetchImpl: vi.fn() as unknown as typeof fetch,
        openExternal: browserThatReturns(() => ({ code: 'x', state: 'forged' })),
      }),
    ).rejects.toThrow('state');
  });

  it('reports when the user cancels on the Google page', async () => {
    await expect(
      signInWithGoogleLoopback({
        clientId: 'cid',
        clientSecret: 'sec',
        fetchImpl: vi.fn() as unknown as typeof fetch,
        openExternal: browserThatReturns((authUrl) => ({ error: 'access_denied', state: authUrl.searchParams.get('state')! })),
      }),
    ).rejects.toThrow('access_denied');
  });
});
