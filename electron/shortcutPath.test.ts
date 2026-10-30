import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateShortcutPath } = require('./shortcutPath.cjs') as {
  validateShortcutPath: (input: unknown, fileSystem?: { existsSync: (path: string) => boolean; statSync: (path: string) => { isFile: () => boolean } }) =>
    | { ok: true; resolved: string }
    | { ok: false; reason: string };
};

const existingFile = { existsSync: vi.fn(() => true), statSync: vi.fn(() => ({ isFile: () => true })) };
const localShortcut = resolve('target.lnk');
const localUrlFile = resolve('target.url');

describe('validateShortcutPath', () => {
  it('ローカルの絶対.lnkファイルだけを許可する', () => {
    const result = validateShortcutPath(localShortcut, existingFile);
    expect(result.ok).toBe(true);
  });

  it.each([
    ['相対パス', 'target.lnk'],
    ['別拡張子', localUrlFile],
    ['UNC', '\\\\server\\share\\target.lnk'],
  ])('%sを拒否する', (_label, path) => {
    expect(validateShortcutPath(path, existingFile).ok).toBe(false);
  });

  it('存在しないファイルを拒否する', () => {
    expect(validateShortcutPath(localShortcut, { ...existingFile, existsSync: () => false }).ok).toBe(false);
  });

  it('ファイル情報を読めない場合も例外を外へ漏らさない', () => {
    expect(validateShortcutPath(localShortcut, { existsSync: () => true, statSync: () => { throw new Error('denied'); } }).ok).toBe(false);
  });
});
