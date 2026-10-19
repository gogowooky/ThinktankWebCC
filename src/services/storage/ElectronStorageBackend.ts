/**
 * ElectronStorageBackend.ts
 * Electron IPC 経由でメインプロセスの fs / VaultEngine 操作を呼び出すバックエンド
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';
import type { DomainProfile } from '../../../shared/domainProfile';
import type { ValidatedAiResponse } from '../../../shared/responseValidator';
import type { FirestoreRelayChunkDoc, RelayEnvelopePlaintext, RelayResponsePlaintext } from '../../../shared/relayProtocol';
import type { DriveConflictFileInfo } from '../../../shared/conflict';
import type { IndexShardV1 } from '../../../shared/searchIndex';

export interface ElectronVaultConfig {
  vaultDir: string;
  vaultRootDir: string;
  trashDir: string;
  indexDir: string;
  promptsDir: string;
  deviceId: string;
  preferredCli: 'claude' | 'codex' | 'gemini';
  preferredModel: string;
  activeProfileId: string;
}

export interface ElectronAiStatus {
  availableClis: Record<string, { available: boolean; path: string | null }>;
  preferredCli: 'claude' | 'codex' | 'gemini';
  preferredModel: string;
  activeProfileId: string;
}

export interface ElectronRelayStatus {
  enabled: boolean;
  deviceId: string;
  deviceName: string;
  pairingSecret: string;
  firebaseProjectId: string;
  firebaseSignedIn: boolean;
  firebaseEmail: string;
  /** Firestore への書き込みに最後に成功した時刻。一度も成功していなければ空文字 */
  lastHeartbeatAt: string;
  isAlive: boolean;
  firestoreProblem: string;
  processedCount: number;
}

declare global {
  interface Window {
    electronAPI?: {
      storage: {
        listMeta:       ()                => Promise<ThinkMeta[]>;
        getContent:     (id: string)      => Promise<string | null>;
        getRecord?:     (id: string)      => Promise<{ meta: ThinkMeta; body: string; support: Record<string, unknown>; updatedAt: string } | null>;
        getSupport?:    (id: string)      => Promise<Record<string, unknown> | null>;
        save:           (p: SavePayload)  => Promise<ThinkMeta>;
        saveSupport?:   (id: string, metadata: Record<string, unknown>, expectedVer?: string) => Promise<{ thinkid: string; updatedAt: string; metadata: Record<string, unknown> }>;
        delete:         (id: string)      => Promise<void>;
        search:         (q: string)       => Promise<ThinkMeta[]>;
      };
      vault?: {
        getConfig:     () => Promise<ElectronVaultConfig>;
        setConfig:     (partial: Partial<ElectronVaultConfig>) => Promise<ElectronVaultConfig>;
        selectFolder:  () => Promise<ElectronVaultConfig | null>;
        listConflicts: () => Promise<Array<DriveConflictFileInfo & { sizeBytes: number; mtimeIso: string }>>;
        writeShard:    () => Promise<IndexShardV1>;
      };
      profile?: {
        getActive:     () => Promise<DomainProfile>;
        listAvailable: () => Promise<Array<{ id: string; name: string; subtitle: string; description: string }>>;
        setActive:     (profileId: string) => Promise<DomainProfile>;
        saveCustom:    (profileObj: DomainProfile) => Promise<DomainProfile>;
      };
      ai?: {
        getStatus:    () => Promise<ElectronAiStatus>;
        conversation: (params: Record<string, unknown>) => Promise<ValidatedAiResponse & { executedCli: string; fallbackUsed: boolean; cliError?: string }>;
        agent:        (params: Record<string, unknown>) => Promise<ValidatedAiResponse & { executedCli: string; fallbackUsed: boolean; cliError?: string }>;
      };
      relay?: {
        getStatus:       () => Promise<ElectronRelayStatus>;
        configure:       (partial: Record<string, unknown>) => Promise<ElectronRelayStatus>;
        rotateSecret:    () => Promise<ElectronRelayStatus>;
        setFirebaseSession?: (session: { refreshToken: string; email: string; apiKey: string }) => Promise<ElectronRelayStatus>;
        signOutFirebase?: () => Promise<ElectronRelayStatus>;
        executePlain:    <TReq = unknown, TRes = unknown>(envelope: RelayEnvelopePlaintext<TReq>) => Promise<RelayResponsePlaintext<TRes>>;
        handleEncrypted: (payload: { encryptedRequest: string; chunks?: FirestoreRelayChunkDoc[] }) => Promise<{ encryptedResponse: string; responseChunks: FirestoreRelayChunkDoc[] }>;
      };
      system?: {
        openPath: (target: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      };
      getPathForFile: (file: File) => string;
    };
  }
}

export class ElectronStorageBackend implements IStorageBackend {
  private get api() {
    const api = window.electronAPI?.storage;
    if (!api) throw new Error('[ElectronStorageBackend] electronAPI が見つかりません');
    return api;
  }

  listMeta():                   Promise<ThinkMeta[]>   { return this.api.listMeta(); }
  // preload の storage:getContent は本文のみを返す。IPC のチャンネル名は互換のため据え置く。
  getBody(id: string):          Promise<string | null> { return this.api.getContent(id); }
  save(payload: SavePayload):   Promise<ThinkMeta>     { return this.api.save(payload); }
  delete(id: string):           Promise<void>          { return this.api.delete(id); }
  search(query: string):        Promise<ThinkMeta[]>   { return this.api.search(query); }
}
