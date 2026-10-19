/**
 * src/platform/web/IndexedDbVaultCache.ts
 * Web版における IndexedDB キャッシュ（メタデータ・本文・support.json）。
 * ブラウザ再読み込み時の即時表示と、オフライン時のフォールバック読み取りを支える。
 */

import type { ThinkMeta } from '../../services/storage/IStorageBackend';

const DB_NAME = 'thinktank_vault_cache_v1';
const DB_VERSION = 1;
const STORE_META = 'meta';
const STORE_BODY = 'body';
const STORE_SUPPORT = 'support';

interface CachedBody {
  thinkid: string;
  body: string;
  /** この本文の版。古い版のキャッシュには無い */
  updatedAt?: string;
}

export class IndexedDbVaultCache {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private openDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: 'thinkid' });
          }
          if (!db.objectStoreNames.contains(STORE_BODY)) {
            db.createObjectStore(STORE_BODY, { keyPath: 'thinkid' });
          }
          if (!db.objectStoreNames.contains(STORE_SUPPORT)) {
            db.createObjectStore(STORE_SUPPORT, { keyPath: 'thinkid' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  public async getAllMeta(): Promise<ThinkMeta[]> {
    const db = await this.openDb();
    if (!db) return [];
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).getAll();
      req.onsuccess = () => resolve((req.result as ThinkMeta[]) ?? []);
      req.onerror = () => resolve([]);
    });
  }

  public async putMetas(metas: readonly ThinkMeta[]): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      const store = tx.objectStore(STORE_META);
      for (const m of metas) {
        store.put(m);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async removeMeta(thinkid: string): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_META, STORE_BODY, STORE_SUPPORT], 'readwrite');
      tx.objectStore(STORE_META).delete(thinkid);
      tx.objectStore(STORE_BODY).delete(thinkid);
      tx.objectStore(STORE_SUPPORT).delete(thinkid);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async getMeta(thinkid: string): Promise<ThinkMeta | null> {
    const db = await this.openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(thinkid);
      req.onsuccess = () => resolve((req.result as ThinkMeta | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  }

  /**
   * 本文を返す。expectedUpdatedAt を渡すと、その版の本文でなければ null を返す。
   * 一覧の情報だけが新しくなり本文が古いまま表示される（携帯で古い版が見える）のを防ぐため。
   * 版を記録していない古いキャッシュも、版の指定があれば使わない。
   */
  public async getBody(thinkid: string, expectedUpdatedAt?: string): Promise<string | null> {
    const db = await this.openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BODY, 'readonly');
      const req = tx.objectStore(STORE_BODY).get(thinkid);
      req.onsuccess = () => {
        const res = req.result as CachedBody | undefined;
        if (!res) {
          resolve(null);
        } else if (expectedUpdatedAt && res.updatedAt !== expectedUpdatedAt) {
          resolve(null);
        } else {
          resolve(res.body);
        }
      };
      req.onerror = () => resolve(null);
    });
  }

  public async putBody(thinkid: string, body: string, updatedAt?: string): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BODY, 'readwrite');
      tx.objectStore(STORE_BODY).put({ thinkid, body, updatedAt } satisfies CachedBody);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async putBodies(bodies: Record<string, { body: string; updatedAt?: string }>): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    const entries = Object.entries(bodies);
    if (entries.length === 0) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BODY, 'readwrite');
      const store = tx.objectStore(STORE_BODY);
      for (const [thinkid, { body, updatedAt }] of entries) {
        store.put({ thinkid, body, updatedAt } satisfies CachedBody);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async getAllBodies(): Promise<Record<string, { body: string; updatedAt?: string }>> {
    const db = await this.openDb();
    if (!db) return {};
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BODY, 'readonly');
      const req = tx.objectStore(STORE_BODY).getAll();
      req.onsuccess = () => {
        const list = (req.result as CachedBody[]) ?? [];
        const map: Record<string, { body: string; updatedAt?: string }> = {};
        for (const item of list) {
          if (item && typeof item.thinkid === 'string' && typeof item.body === 'string') {
            map[item.thinkid] = { body: item.body, updatedAt: item.updatedAt };
          }
        }
        resolve(map);
      };
      req.onerror = () => resolve({});
    });
  }

  /** メタデータ・本文・support をすべて消す（設定画面の「キャッシュを消して読み直す」用）。 */
  public async clearAll(): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_META, STORE_BODY, STORE_SUPPORT], 'readwrite');
      tx.objectStore(STORE_META).clear();
      tx.objectStore(STORE_BODY).clear();
      tx.objectStore(STORE_SUPPORT).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async getStats(): Promise<{ metaCount: number; bodyCount: number }> {
    const db = await this.openDb();
    if (!db) return { metaCount: 0, bodyCount: 0 };
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_META, STORE_BODY], 'readonly');
      const metaReq = tx.objectStore(STORE_META).count();
      const bodyReq = tx.objectStore(STORE_BODY).count();
      let metaCount = 0;
      let bodyCount = 0;
      metaReq.onsuccess = () => {
        metaCount = metaReq.result ?? 0;
      };
      bodyReq.onsuccess = () => {
        bodyCount = bodyReq.result ?? 0;
      };
      tx.oncomplete = () => resolve({ metaCount, bodyCount });
      tx.onerror = () => resolve({ metaCount: 0, bodyCount: 0 });
    });
  }

  public async getSupport(thinkid: string): Promise<Record<string, unknown> | null> {
    const db = await this.openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SUPPORT, 'readonly');
      const req = tx.objectStore(STORE_SUPPORT).get(thinkid);
      req.onsuccess = () => {
        const res = req.result as { thinkid: string; metadata: Record<string, unknown> } | undefined;
        resolve(res ? res.metadata : null);
      };
      req.onerror = () => resolve(null);
    });
  }

  public async putSupport(thinkid: string, metadata: Record<string, unknown>): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SUPPORT, 'readwrite');
      tx.objectStore(STORE_SUPPORT).put({ thinkid, metadata });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

