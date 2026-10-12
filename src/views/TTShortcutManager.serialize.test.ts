// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { TTShortcutManager } from './TTShortcutManager';
import content from '../../docs/DefaultShortcut.md?raw';

it('writes the current shortcuts so that loading them back restores the same table', () => {
  const m = TTShortcutManager.instance;
  m.onThinkSaved(TTShortcutManager.THINK_ID, content);
  // "," や '"' を含むキー、複数キーの区切りと紛らわしい "|" を含むキーも往復させる
  m.mergeContent('t\n> focus,exmode,key,action,description\n*TextEditor,,"Alt+,",Test.Comma,"説明, カンマ入り"\n*TextEditor,,Ctrl+\\|,Test.Pipe,縦線');
  const before = m.GetShortcuts();
  expect(before.some(s => s.key === 'alt+,')).toBe(true);
  expect(before.some(s => s.key === 'ctrl+|')).toBe(true);

  m.onThinkSaved(TTShortcutManager.THINK_ID, `ThinktankKeyBinding\n${m.serializeTable()}`);
  expect(m.GetShortcuts()).toEqual(before);
});
