import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { validateOpenPath } = require('./openPath.cjs') as {
  validateOpenPath: (input: unknown) => { ok: true; resolved: string } | { ok: false; reason: string };
};

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'thinktank-open-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

it('opens existing documents and folders by absolute path', () => {
  const doc = join(dir, 'note.pdf'); writeFileSync(doc, '');
  expect(validateOpenPath(` ${doc} `)).toEqual({ ok: true, resolved: doc });
  expect(validateOpenPath(dir)).toEqual({ ok: true, resolved: dir });
});

it('refuses executables, relative, UNC, URL, missing and non-string input', () => {
  const exe = join(dir, 'run.EXE'); writeFileSync(exe, '');
  for (const input of [exe, 'note.pdf', '\\server\share\a.pdf', '//server/share/a.pdf', 'file:///C:/a.pdf', join(dir, 'missing.pdf'), `${dir}\0x`, '', 42]) {
    expect(validateOpenPath(input).ok).toBe(false);
  }
});
