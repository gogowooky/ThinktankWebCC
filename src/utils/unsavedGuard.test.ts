import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  registerPaneFlush,
  unregisterPaneFlush,
  flushAllPanes,
  paneFlushCount,
} from './unsavedGuard';

afterEach(() => {
  // レジストリはモジュールスコープなので各テスト後に掃除する
  for (const k of ['a', 'b', 'c']) unregisterPaneFlush(k);
});

describe('unsavedGuard', () => {
  it('register / unregister で件数が増減する', () => {
    expect(paneFlushCount()).toBe(0);
    registerPaneFlush('a', () => {});
    registerPaneFlush('b', () => {});
    expect(paneFlushCount()).toBe(2);
    unregisterPaneFlush('a');
    expect(paneFlushCount()).toBe(1);
  });

  it('flushAllPanes は登録済みの全関数を呼ぶ', async () => {
    const fa = vi.fn();
    const fb = vi.fn();
    registerPaneFlush('a', fa);
    registerPaneFlush('b', fb);
    await flushAllPanes();
    expect(fa).toHaveBeenCalledOnce();
    expect(fb).toHaveBeenCalledOnce();
  });

  it('flushAllPanes は各フラッシュの Promise 完了を待つ', async () => {
    let resolved = false;
    registerPaneFlush('a', () => new Promise((r) => setTimeout(() => { resolved = true; r(undefined); }, 10)));
    await flushAllPanes();
    expect(resolved).toBe(true);
  });

  it('1 ペインが例外を投げても他のフラッシュは実行される', async () => {
    const fb = vi.fn();
    registerPaneFlush('a', () => { throw new Error('boom'); });
    registerPaneFlush('b', fb);
    await expect(flushAllPanes()).resolves.toBeUndefined();
    expect(fb).toHaveBeenCalledOnce();
  });

  it('1 ペインの Promise が reject しても flushAllPanes は解決する', async () => {
    registerPaneFlush('a', () => Promise.reject(new Error('save failed')));
    await expect(flushAllPanes()).resolves.toBeUndefined();
  });
});
