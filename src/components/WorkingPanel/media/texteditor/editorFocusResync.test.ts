// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installTextFocusResync, type TextFocusEditor } from './editorFocusResync';

let node: HTMLDivElement;
let inputArea: HTMLTextAreaElement;

beforeEach(() => {
  node = document.createElement('div');
  inputArea = document.createElement('textarea');
  inputArea.className = 'inputarea monaco-mouse-cursor-text';
  node.append(inputArea);
  document.body.append(node);
});

afterEach(() => {
  node.remove();
});

function fakeEditor(hasTextFocus: boolean) {
  const editor = { getDomNode: () => node, hasTextFocus: () => hasTextFocus, focus: vi.fn<() => void>() };
  return editor satisfies TextFocusEditor;
}

function pressKey(target: HTMLElement) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', bubbles: true }));
}

it('refocuses the editor when the input area has DOM focus but Monaco lost track of it', () => {
  const editor = fakeEditor(false);
  installTextFocusResync(editor);
  inputArea.focus();

  pressKey(inputArea);

  expect(editor.focus).toHaveBeenCalledTimes(1);
});

it('leaves the editor alone when Monaco already knows it has text focus', () => {
  const editor = fakeEditor(true);
  installTextFocusResync(editor);
  inputArea.focus();

  pressKey(inputArea);

  expect(editor.focus).not.toHaveBeenCalled();
});

it('ignores other textareas inside the editor such as the find widget', () => {
  const findInput = document.createElement('textarea');
  node.append(findInput);
  const editor = fakeEditor(false);
  installTextFocusResync(editor);
  findInput.focus();

  pressKey(findInput);

  expect(editor.focus).not.toHaveBeenCalled();
});

it('stops watching after dispose', () => {
  const editor = fakeEditor(false);
  installTextFocusResync(editor).dispose();
  inputArea.focus();

  pressKey(inputArea);

  expect(editor.focus).not.toHaveBeenCalled();
});
