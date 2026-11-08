import { expect, it } from 'vitest';
import { findTextOnCursor } from './textOnCursor';

it('finds a URL, a file path and a tag under the cursor', () => {
  const line = 'see https://example.test/a C:\\tmp\\f.txt [memo:1] end';
  expect(findTextOnCursor(line, 6)).toBe('https://example.test/a');
  expect(findTextOnCursor(line, 30)).toBe('C:\\tmp\\f.txt');
  expect(findTextOnCursor(line, 44)).toBe('[memo:1]');
});

it('returns nothing away from any link', () => {
  expect(findTextOnCursor('see https://example.test/a end', 2)).toBe('');
  expect(findTextOnCursor('', 1)).toBe('');
});

it('counts the column just after the match as on it', () => {
  expect(findTextOnCursor('[tag] x', 6)).toBe('[tag]');
  expect(findTextOnCursor('[tag] x', 7)).toBe('');
});

it('prefers a quoted path, which may contain spaces', () => {
  const line = 'open "C:\\Program Files\\app.exe" now';
  expect(findTextOnCursor(line, 20)).toBe('C:\\Program Files\\app.exe');
  expect(findTextOnCursor('"https://example.test/a b"', 10)).toBe('https://example.test/a b');
  expect(findTextOnCursor('"file:///c/a"', 5)).toBe('file:///c/a');
  expect(findTextOnCursor('"\\\\server\\share"', 5)).toBe('\\\\server\\share');
});

it('falls back to other matches inside quotes that are not links', () => {
  expect(findTextOnCursor('"see [tag] here"', 8)).toBe('[tag]');
});

it('finds the second of two links on a line', () => {
  expect(findTextOnCursor('https://a.test https://b.test', 20)).toBe('https://b.test');
});
