// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { TTShortcutManager, DEFAULT_ACTION } from './TTShortcutManager';
import { TTActions } from './TTActions';

const GLOBAL = 'Test.Global.Action';

function load(rows: string) {
  TTShortcutManager.instance.onThinkSaved(TTShortcutManager.THINK_ID,
    `Shortcuts\n> focus,exmode,key,action,description\n${rows}`);
}

function press(): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, cancelable: true });
  Object.defineProperty(e, 'target', { value: document.body });
  TTShortcutManager.instance.handleKeyDown(e);
  return e;
}

afterEach(() => { TTShortcutManager.instance.onFocusChange('None'); });

it('passes the key through to the editor and skips the global binding while the editor is focused', () => {
  const completion = vi.fn();
  TTActions.Register({ ActionID: GLOBAL, Description: '', Completion: completion });
  // グローバル行を先に置いても既定動作が優先されることを確かめる
  load(`*,,Ctrl+B,${GLOBAL},グローバル\n*TextEditor,,Ctrl+B,${DEFAULT_ACTION},既定動作`);

  TTShortcutManager.instance.onFocusChange('Discuss.TextEditor');
  const inEditor = press();
  expect(inEditor.defaultPrevented).toBe(false);
  expect(completion).not.toHaveBeenCalled();

  TTShortcutManager.instance.onFocusChange('Thinktank.Filter');
  const elsewhere = press();
  expect(elsewhere.defaultPrevented).toBe(true);
  expect(completion).toHaveBeenCalledTimes(1);
});
