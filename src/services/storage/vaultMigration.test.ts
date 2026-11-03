// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyFirestoreToLocal, copyLocalToFirestore } from './vaultMigration';
import type { FirestoreStorageBackend } from '../../platform/web/FirestoreStorageBackend';
import type { ThinkMeta } from './IStorageBackend';

const DIR = 'D:\\Dropbox\\TT';

function meta(thinkid: string, updatedAt: string, extra: Partial<ThinkMeta> = {}): ThinkMeta {
  return {
    thinkid, category: 'memo', title: `題-${thinkid}`, keywords: '', relatedIds: '', sizeBytes: 0,
    isDeleted: false, createdAt: '2026-11-01T00:00:00.000Z', updatedAt, metadata: {}, ...extra,
  };
}

function installLocalVault(api: Record<string, unknown>) {
  (window as unknown as { electronAPI: unknown }).electronAPI = { localVault: api };
}

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('Firestore → ThinkファイルFolder', () => {
  it('作成・更新日時を保って写し、画面状態の Think は写さない', async () => {
    const importNewer = vi.fn()
      .mockResolvedValueOnce({ status: 'created' })
      .mockResolvedValueOnce({ status: 'skipped' });
    installLocalVault({ importNewer });
    const firestore = {
      listRecordsForMigration: vi.fn().mockResolvedValue([
        { meta: meta('a', '2026-11-02T00:00:00.000Z'), body: '本文A' },
        { meta: meta('b', '2026-11-02T00:00:00.000Z'), body: '' },
        { meta: meta('__tt_ui_state__', '2026-11-02T00:00:00.000Z'), body: 'state' },
      ]),
    } as unknown as FirestoreStorageBackend;
    const result = await copyFirestoreToLocal(firestore, DIR);
    expect(result).toEqual({ created: 1, updated: 0, skipped: 1, failedIds: [] });
    expect(importNewer).toHaveBeenCalledTimes(2);
    expect(importNewer.mock.calls[0]).toEqual([DIR, expect.objectContaining({
      thinkid: 'a', fullContent: '題-a\n本文A', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
    })]);
    expect(importNewer.mock.calls[1][1].fullContent).toBe('題-b');
  });
});

describe('ThinkファイルFolder → Firestore', () => {
  it('上書きされる Firestore の版を ThinkファイルFolder に退避し、失敗は件数に数える', async () => {
    const stashVersion = vi.fn().mockResolvedValue(true);
    installLocalVault({
      listMeta: vi.fn().mockResolvedValue([meta('a', '2026-11-03T00:00:00.000Z'), meta('b', '2026-11-03T00:00:00.000Z')]),
      getRecord: vi.fn().mockImplementation(async (_dir: string, id: string) => ({ meta: meta(id, '2026-11-03T00:00:00.000Z'), body: `local-${id}` })),
      stashVersion,
    });
    const replaced = { meta: meta('a', '2026-11-02T00:00:00.000Z'), body: 'firestore-a' };
    const firestore = {
      importNewerRecord: vi.fn().mockImplementation(async (record: { meta: ThinkMeta }, beforeOverwrite: (r: unknown) => Promise<void>) => {
        if (record.meta.thinkid === 'b') throw new Error('network');
        await beforeOverwrite(replaced);
        return 'updated';
      }),
    } as unknown as FirestoreStorageBackend;
    const result = await copyLocalToFirestore(firestore, DIR);
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, failedIds: ['b'] });
    expect(stashVersion).toHaveBeenCalledWith(DIR, replaced, 'firestore-overwritten');
  });
});
