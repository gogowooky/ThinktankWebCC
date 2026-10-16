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

  public async getBody(thinkid: string): Promise<string | null> {
    const db = await this.openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BODY, 'readonly');
      const req = tx.objectStore(STORE_BODY).get(thinkid);
      req.onsuccess = () => {
        const res = req.result as { thinkid: string; body: string } | undefined;
        resolve(res ? res.body : null);
      };
      req.onerror = () => resolve(null);
    });
  }

  public async putBody(thinkid: string, body: string): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BODY, 'readwrite');
      tx.objectStore(STORE_BODY).put({ thinkid, body });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async putBodies(bodies: Record<string, string>): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    const entries = Object.entries(bodies);
    if (entries.length === 0) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BODY, 'readwrite');
      const store = tx.objectStore(STORE_BODY);
      for (const [thinkid, body] of entries) {
        store.put({ thinkid, body });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async getAllBodies(): Promise<Record<string, string>> {
    const db = await this.openDb();
    if (!db) return {};
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BODY, 'readonly');
      const req = tx.objectStore(STORE_BODY).getAll();
      req.onsuccess = () => {
        const list = (req.result as Array<{ thinkid: string; body: string }>) ?? [];
        const map: Record<string, string> = {};
        for (const item of list) {
          if (item && typeof item.thinkid === 'string' && typeof item.body === 'string') {
            map[item.thinkid] = item.body;
          }
        }
        resolve(map);
      };
      req.onerror = () => resolve({});
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

