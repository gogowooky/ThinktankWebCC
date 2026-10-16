/**
 * src/platform/index.ts
 * PC版（Electron）と Web版（PCブラウザ・携帯ブラウザ）の共通プラットフォーム抽象化エントリ。
 */

export * from './capabilities';
export * from './DomainProfileManager';
export * from './web/GoogleAuthService';
export * from './web/IndexedDbVaultCache';
export * from './web/FirestoreRelayClient';
export * from './web/DriveApiStorageBackend';
