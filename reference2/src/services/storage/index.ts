/**
 * storage/index.ts
 * ストレージサービスのエクスポート
 */

export type { IStorageService, IStorageManager, StorageType, StorageResult } from './IStorageService';
export { BigQueryStorageService } from './BigQueryStorageService';
export { IndexedDBStorageService } from './IndexedDBStorageService';
export { StorageManager } from './StorageManager';
export type { ConnectionStatus } from './StorageManager';

