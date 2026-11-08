/**
 * thinkListCache.ts
 * 前回の Think 一覧を端末に残し、次の起動で通信を待たずに表示するためのキャッシュ。
 * 正本は Firestore のままで、ここが無くても・壊れていても動く（読めなければ通信を待つだけ）。
 */

import type { ThinkMeta } from './IStorageBackend';

const DB_NAME = 'thinktank-think-list';
const STORE_NAME = 'lists';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise<T | null>(resolve => {
    try {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function readThinkListCache(key: string): Promise<ThinkMeta[] | null> {
  const value = await withStore<unknown>('readonly', store => store.get(key));
  return Array.isArray(value) ? value as ThinkMeta[] : null;
}

export async function writeThinkListCache(key: string, metas: ThinkMeta[]): Promise<void> {
  await withStore('readwrite', store => store.put(metas, key));
}

/** ログアウト後の端末に題名やメタデータを残さない */
export async function clearThinkListCache(): Promise<void> {
  await withStore('readwrite', store => store.clear());
}
