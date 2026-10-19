/**
 * src/platform/web/driveChanges.ts
 * Google Drive の Changes API（changes.list）が返す変更一覧を、Vault のファイルの更新・削除に振り分ける。
 * Changes API は Drive 全体の変更を返すので、Vault フォルダと trash フォルダのものだけを拾う。
 */

import { parseDriveConflictFilename } from '../../../shared/conflict';

export interface DriveChangeFile {
  id: string;
  name: string;
  parents?: string[];
  trashed?: boolean;
  modifiedTime?: string;
}

export interface DriveChange {
  fileId: string;
  removed?: boolean;
  file?: DriveChangeFile;
}

export interface VaultChangeSet {
  /** 取り寄せ直す .md（Drive のファイル id と thinkid） */
  mdFiles: Array<{ fileId: string; thinkid: string }>;
  /** 取り寄せ直す .support.json */
  supportFiles: Array<{ fileId: string; thinkid: string }>;
  /** 一覧とキャッシュから外す thinkid（trash への移動、Drive のゴミ箱への移動） */
  removedThinkIds: string[];
}

const MD_SUFFIX = '.md';
const SUPPORT_SUFFIX = '.support.json';

/**
 * 同じファイルの変更が複数あれば最後のものを採る。
 * Drive から完全に削除された変更（removed=true）はファイル名が無く thinkid を特定できないので無視する。
 * Thinktank の削除は trash フォルダへの移動なので、通常はファイル名つきの変更として届く。
 */
export function classifyVaultChanges(
  changes: readonly DriveChange[],
  folders: { vaultFolderId: string; trashFolderId: string },
): VaultChangeSet {
  const latestByFile = new Map<string, DriveChangeFile>();
  for (const change of changes) {
    if (change.removed || !change.file) continue;
    latestByFile.set(change.fileId, change.file);
  }

  const md = new Map<string, string>();
  const support = new Map<string, string>();
  const removed = new Set<string>();

  for (const [fileId, file] of latestByFile) {
    if (parseDriveConflictFilename(file.name)) continue;
    const parents = file.parents ?? [];
    const inVault = parents.includes(folders.vaultFolderId);
    const inTrash = parents.includes(folders.trashFolderId);
    if (!inVault && !inTrash) continue;

    if (file.name.endsWith(SUPPORT_SUFFIX)) {
      const thinkid = file.name.slice(0, -SUPPORT_SUFFIX.length);
      if (inVault && !file.trashed) support.set(fileId, thinkid);
      continue;
    }
    if (!file.name.endsWith(MD_SUFFIX)) continue;
    const thinkid = file.name.slice(0, -MD_SUFFIX.length);
    if (inTrash || file.trashed) {
      removed.add(thinkid);
    } else {
      md.set(fileId, thinkid);
    }
  }

  // 同じ一覧の中で「消えた」と「戻った」が両方あれば、戻った（vault にある）ほうを優先する
  for (const thinkid of md.values()) removed.delete(thinkid);

  return {
    mdFiles: [...md].map(([fileId, thinkid]) => ({ fileId, thinkid })),
    supportFiles: [...support].map(([fileId, thinkid]) => ({ fileId, thinkid })),
    removedThinkIds: [...removed],
  };
}
