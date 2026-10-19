import { describe, expect, it } from 'vitest';
import { classifyVaultChanges, type DriveChange } from './driveChanges';

const folders = { vaultFolderId: 'VAULT', trashFolderId: 'TRASH' };
const md = (fileId: string, name: string, parents: string[], extra: Partial<{ trashed: boolean }> = {}): DriveChange => ({
  fileId,
  file: { id: fileId, name, parents, ...extra },
});

describe('classifyVaultChanges', () => {
  it('picks up .md and .support.json in the Vault folder and ignores other folders', () => {
    const result = classifyVaultChanges(
      [
        md('f1', '2026-10-19-100000.md', ['VAULT']),
        md('f2', '2026-10-19-100000.support.json', ['VAULT']),
        md('f3', 'unrelated.md', ['OTHER']),
        md('f4', 'notes.txt', ['VAULT']),
      ],
      folders,
    );
    expect(result.mdFiles).toEqual([{ fileId: 'f1', thinkid: '2026-10-19-100000' }]);
    expect(result.supportFiles).toEqual([{ fileId: 'f2', thinkid: '2026-10-19-100000' }]);
    expect(result.removedThinkIds).toEqual([]);
  });

  it('treats moves to the trash folder and Drive trash as removals', () => {
    const result = classifyVaultChanges(
      [
        md('f1', '2026-10-19-100000.md', ['TRASH']),
        md('f2', '2026-10-19-110000.md', ['VAULT'], { trashed: true }),
        { fileId: 'f3', removed: true },
      ],
      folders,
    );
    expect(result.mdFiles).toEqual([]);
    expect(result.removedThinkIds.sort()).toEqual(['2026-10-19-100000', '2026-10-19-110000']);
  });

  it('uses the latest change per file and skips Drive conflict copies', () => {
    const result = classifyVaultChanges(
      [
        md('f1', '2026-10-19-100000.md', ['TRASH']),
        md('f1', '2026-10-19-100000.md', ['VAULT']),
        md('f9', '2026-10-19-100000 (1).md', ['VAULT']),
      ],
      folders,
    );
    expect(result.mdFiles).toEqual([{ fileId: 'f1', thinkid: '2026-10-19-100000' }]);
    expect(result.removedThinkIds).toEqual([]);
  });
});
