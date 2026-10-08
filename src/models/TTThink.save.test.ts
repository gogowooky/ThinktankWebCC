import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ save: vi.fn(), getBody: vi.fn() }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: backend } }));
import { TTThink } from './TTThink';
import { StorageConflictError, StorageTimeoutError } from '../services/storage/IStorageBackend';
import { failingSaveCount } from '../services/storage/saveStatus';

function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeThink(): TTThink {
  const t = new TTThink();
  t.ID = '2026-10-07-120000'; t.UpdatedAt = 'T0';
  t.setContentSilent('# メモ\n本文'); t.markSaved(); t.markMetadataSaved();
  return t;
}

describe('TTThink.SaveContent', () => {
  beforeEach(() => { backend.save.mockReset(); backend.getBody.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('waits for the in-flight save and sends the next one with the new version, merging queued saves', async () => {
    const t = makeThink();
    const first = deferred<{ updatedAt: string }>();
    backend.save.mockReturnValueOnce(first.promise).mockResolvedValue({ updatedAt: 'T2' });

    t.Content = '# メモ\n本文1';
    const a = t.SaveContent();
    await Promise.resolve();
    t.Content = '# メモ\n本文12';
    const b = t.SaveContent();
    t.Content = '# メモ\n本文123';
    const c = t.SaveContent();
    await Promise.resolve();
    expect(backend.save).toHaveBeenCalledTimes(1);

    first.resolve({ updatedAt: 'T1' });
    await Promise.all([a, b, c]);

    expect(backend.save).toHaveBeenCalledTimes(2);
    expect(backend.save.mock.calls[1][0]).toMatchObject({ baseUpdatedAt: 'T1', fullContent: '# メモ\n本文123' });
    expect(t.UpdatedAt).toBe('T2');
    expect(t.IsDirty).toBe(false);
  });

  it('keeps edits made during a save marked as unsaved', async () => {
    const t = makeThink();
    const first = deferred<{ updatedAt: string }>();
    backend.save.mockReturnValueOnce(first.promise);
    t.Content = '# メモ\n送信分';
    const a = t.SaveContent();
    await Promise.resolve();
    t.Content = '# メモ\n送信分+追記';
    first.resolve({ updatedAt: 'T1' });
    await a;
    expect(t.IsDirty).toBe(true);
  });

  it('does not block later saves after a failure, reports it, and retries automatically', async () => {
    vi.useFakeTimers();
    const t = makeThink();
    backend.save.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ updatedAt: 'T1' });
    t.Content = '# メモ\n本文1';
    await expect(t.SaveContent()).rejects.toThrow('network');
    expect(failingSaveCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(backend.save).toHaveBeenCalledTimes(2);
    expect(t.IsDirty).toBe(false);
    expect(failingSaveCount()).toBe(0);
  });

  it('treats a conflict caused by its own timed-out save as already saved', async () => {
    const t = makeThink();
    backend.save
      .mockRejectedValueOnce(new StorageTimeoutError(t.ID))
      .mockRejectedValueOnce(new StorageConflictError(t.ID, 'T1'))
      .mockResolvedValue({ updatedAt: 'T2' });
    backend.getBody.mockResolvedValue('本文1');

    t.Content = '# メモ\n本文1';
    await expect(t.SaveContent()).rejects.toBeInstanceOf(StorageTimeoutError);
    t.Content = '# メモ\n本文12';
    await t.SaveContent();

    expect(backend.save.mock.calls[2][0]).toMatchObject({ baseUpdatedAt: 'T1', fullContent: '# メモ\n本文12' });
    expect(t.UpdatedAt).toBe('T2');
  });

  it('still surfaces a real conflict after a timeout when the server has different content', async () => {
    const t = makeThink();
    backend.save
      .mockRejectedValueOnce(new StorageTimeoutError(t.ID))
      .mockRejectedValueOnce(new StorageConflictError(t.ID, 'T1'));
    backend.getBody.mockResolvedValue('別の端末の本文');

    t.Content = '# メモ\n本文1';
    await expect(t.SaveContent()).rejects.toBeInstanceOf(StorageTimeoutError);
    t.Content = '# メモ\n本文12';
    await expect(t.SaveContent()).rejects.toBeInstanceOf(StorageConflictError);
    expect(backend.save).toHaveBeenCalledTimes(2);
  });
});
