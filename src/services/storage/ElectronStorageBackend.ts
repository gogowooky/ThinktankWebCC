/**
 * ElectronStorageBackend.ts
 * Electron IPC 経由でメインプロセスの fs / VaultEngine 操作を呼び出すバックエンド
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';
import type { DomainProfile } from '../../../shared/domainProfile';
import type { ValidatedAiResponse } from '../../../shared/responseValidator';
import type { FirestoreRelayChunkDoc } from '../../../shared/relayProtocol';

export interface ElectronVaultConfig {
  vaultDir: string;
  vaultRootDir: string;
  trashDir: string;
  indexDir: string;
  promptsDir: string;
  deviceId: string;
  preferredCli: 'claude' | 'codex' | 'antigravity';
  preferredModel: string;
  activeProfileId: string;
}

export interface ElectronAiStatus {
  availableClis: Record<string, { available: boolean; path: string | null }>;
  preferredCli: 'claude' | 'codex' | 'antigravity';
  preferredModel: string;
  activeProfileId: string;
}

export type ElectronAiAuthProvider = 'OpenAI' | 'Gemini' | 'Claude' | 'GNB' | 'Local';

export interface ElectronAiProviderAuthStatus {
  available: boolean;
  loggedIn: boolean;
  loginUrl: string;
}

export type ElectronAiAuthStatus = Record<ElectronAiAuthProvider, ElectronAiProviderAuthStatus>;

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
  isProcessing?: boolean;
}

export interface ElectronMcpMutatedRecord {
  meta: ThinkMeta;
  body: string;
  support?: Record<string, unknown>;
  updatedAt: string;
}

export interface ElectronMcpMutationPayload {
  action: 'create' | 'update' | 'promotion_candidate';
  thinkid: string;
  projectId?: string;
  candidateId?: string;
  record?: ElectronMcpMutatedRecord | null;
  projectRecord?: ElectronMcpMutatedRecord | null;
}

export interface ElectronAppModeSetting {
  storageMode: 'firestore' | 'local';
  localVaultDir: string;
}

export interface ElectronAppModeInfo {
  /** 今回の起動で使っているモード */
  running: ElectronAppModeSetting;
  /** 次回起動で使う保存済みの設定 */
  saved: ElectronAppModeSetting;
  /** Firestore モードの Markdown バックアップ先。ThinkファイルFolder と重ねられない */
  backupVaultRoot: string;
  /** ローカル運用で起動できず Firestore で起動したときの理由 */
  startupProblem: string;
}

export interface ElectronSnapshotRecord {
  thinkid: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  sourceUpdatedAt: string;
  snapshotAt: string;
}

export interface ElectronLocalRecord {
  meta: ThinkMeta;
  body: string;
  support: Record<string, unknown>;
  updatedAt: string;
}

declare global {
  interface Window {
    electronAPI?: {
      perfEnabled?: boolean;
      appMode?: {
        storageMode: 'firestore' | 'local';
        get:          () => Promise<ElectronAppModeInfo>;
        selectFolder: (currentDir?: string) => Promise<string | null>;
        apply:        (next: ElectronAppModeSetting) => Promise<{ ok: true } | { ok: false; error: string }>;
      };
      snapshot?: {
        create: (id: string) => Promise<ElectronSnapshotRecord>;
        get:    (id: string) => Promise<ElectronSnapshotRecord | null>;
        list:   (id: string) => Promise<ElectronSnapshotRecord[]>;
        delete: (id: string) => Promise<void>;
      };
      localVault?: {
        listMeta:     (dir: string) => Promise<ThinkMeta[]>;
        getRecord:    (dir: string, id: string) => Promise<ElectronLocalRecord | null>;
        importNewer:  (dir: string, payload: SavePayload & { createdAt: string; updatedAt: string }) => Promise<{ thinkid: string; status: 'created' | 'updated' | 'skipped'; updatedAt: string }>;
        stashVersion: (dir: string, record: { meta: ThinkMeta; body: string }, reason: 'firestore-overwritten') => Promise<boolean>;
      };
      storage: {
        listMeta:       ()                => Promise<ThinkMeta[]>;
        getContent:     (id: string)      => Promise<string | null>;
        getRecord?:     (id: string)      => Promise<{ meta: ThinkMeta; body: string; support: Record<string, unknown>; updatedAt: string } | null>;
        save:           (p: SavePayload)  => Promise<ThinkMeta>;
        writeBackup?:   (p: SavePayload & { createdAt: string; updatedAt: string }) => Promise<ThinkMeta>;
        saveSupport?:   (id: string, metadata: Record<string, unknown>, expectedVer?: string) => Promise<{ thinkid: string; updatedAt: string; metadata: Record<string, unknown> }>;
        delete:         (id: string)      => Promise<void>;
        search:         (q: string)       => Promise<ThinkMeta[]>;
      };
      vault?: {
        getConfig:     () => Promise<ElectronVaultConfig>;
        setConfig:     (partial: Partial<ElectronVaultConfig>) => Promise<ElectronVaultConfig>;
        selectFolder:  () => Promise<ElectronVaultConfig | null>;
        onMcpMutated?: (callback: (payload: ElectronMcpMutationPayload) => void) => () => void;
      };
      profile?: {
        getActive:     () => Promise<DomainProfile>;
        listAvailable: () => Promise<Array<{ id: string; name: string; subtitle: string; description: string }>>;
        setActive:     (profileId: string) => Promise<DomainProfile>;
      };
      ai?: {
        getStatus:    () => Promise<ElectronAiStatus>;
        getAuthStatus?: () => Promise<ElectronAiAuthStatus>;
        login?:        (provider: ElectronAiAuthProvider) => Promise<{ started: boolean; loginUrl: string }>;
        getGnbNotebookTitle?: (notebookId: string) => Promise<string>;
        onAuthChanged?: (callback: (payload: { provider?: ElectronAiAuthProvider }) => void) => () => void;
        conversation: (params: Record<string, unknown>) => Promise<ValidatedAiResponse & { executedCli: string }>;
        agent:        (params: Record<string, unknown>) => Promise<ValidatedAiResponse & { executedCli: string }>;
        /** 実行中の AI CLI を止める（requestId は conversation に渡したもの） */
        cancel?:      (requestId: string) => Promise<boolean>;
      };
      relay?: {
        getStatus:       () => Promise<ElectronRelayStatus>;
        getFirebaseSession?: () => Promise<{ uid: string; email: string; refreshToken: string; apiKey: string } | null>;
        configure:       (partial: Record<string, unknown>) => Promise<ElectronRelayStatus>;
        rotateSecret:    () => Promise<ElectronRelayStatus>;
        setFirebaseSession?: (session: { refreshToken: string; email: string; apiKey: string }) => Promise<ElectronRelayStatus>;
        signOutFirebase?: () => Promise<ElectronRelayStatus>;
        signInWithGoogle?: (options: { apiKey: string; firebaseProjectId: string }) => Promise<ElectronRelayStatus>;
        handleEncrypted: (payload: { encryptedRequest: string; chunks?: FirestoreRelayChunkDoc[] }) => Promise<{ encryptedResponse: string; responseChunks: FirestoreRelayChunkDoc[] }>;
      };
      system?: {
        openPath: (target: string) => Promise<{ ok: true } | { ok: false; error: string }>;
        readShortcutLink?: (target: string) => Promise<{ ok: true; target: string } | { ok: false; error: string }>;
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
