import { describe, it, expect } from 'vitest';
import {
  isValidFileId,
  isValidCategory,
  validateVaultKey,
  normalizeThinkId,
  stripBracketedIdsInBundleContent,
} from './vaultKey';

describe('isValidFileId', () => {
  it.each([
    '2026-07-01-232001',
    '2026-07-01-232001-memo',
    '2026-07-01-232001-a3f9',
    '__tt_ui_state__',
  ])('OK: %s', (id) => expect(isValidFileId(id)).toBe(true));

  it.each([
    '',
    '../etc/passwd',
    'a/b',
    'a b',
    'メモ',
    'a'.repeat(201),
    123,
    null,
  ])('NG: %s', (id) => expect(isValidFileId(id as unknown)).toBe(false));
});

describe('isValidCategory', () => {
  it.each(['memo', 'bundle', 'table', 'links', 'chat', 'nettext'])('OK: %s', (c) =>
    expect(isValidCategory(c)).toBe(true),
  );
  it.each(['', 'md', 'MEMO', 'tables', 'note', undefined])('NG: %s', (c) =>
    expect(isValidCategory(c as unknown)).toBe(false),
  );
});

describe('validateVaultKey', () => {
  it('正常系', () => {
    expect(validateVaultKey('2026-07-01-232001-memo', 'memo')).toEqual({ ok: true });
  });
  it('不正な file_id は error', () => {
    const r = validateVaultKey('a b', 'memo');
    expect(r.ok).toBe(false);
  });
  it('不正な category は error', () => {
    const r = validateVaultKey('2026-07-01-232001', 'note');
    expect(r.ok).toBe(false);
  });
  it('isDeleted なら空 category を通す（tombstone）', () => {
    expect(validateVaultKey('2026-07-01-232001', '', { isDeleted: true })).toEqual({ ok: true });
  });
});

describe('normalizeThinkId', () => {
  it.each([
    ['  2026-07-01-232001-memo  ', '2026-07-01-232001-memo'],
    ['[2026-07-01-232001-bundle]', '2026-07-01-232001-bundle'],
    ['[[2026-07-01-232001]]', '2026-07-01-232001'],
  ])('%s → %s', (raw, expected) => expect(normalizeThinkId(raw)).toBe(expected));
});

describe('stripBracketedIdsInBundleContent', () => {
  it('ID らしい [..] だけ角括弧を外す', () => {
    const input = '# 妻の誕生日\n* [2026-07-01-232001-memo]\n* [2026-07-01-232002-links]\n* [参考メモ]';
    expect(stripBracketedIdsInBundleContent(input)).toBe(
      '# 妻の誕生日\n* 2026-07-01-232001-memo\n* 2026-07-01-232002-links\n* [参考メモ]',
    );
  });
});
