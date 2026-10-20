// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { registerTextEditorBulletActions } from './textEditorStyleActions';

class TestRange {
  constructor(
    readonly startLineNumber: number,
    readonly startColumn: number,
    readonly endLineNumber: number,
    readonly endColumn: number,
  ) {}
}

beforeAll(() => {
  Object.defineProperty(window, 'monaco', {
    configurable: true,
    value: { Range: TestRange },
  });
});

afterEach(() => {
  TTShortcutManager.instance.setActiveEditor(null);
});

function runBulletAction(actionId: 'TextEditor.Bullet.NextStyle' | 'TextEditor.Bullet.PrevStyle', lines: string[], line: number): string {
  const executeEdits = vi.fn();
  TTShortcutManager.instance.setActiveEditor({
    getModel: () => ({ getLineContent: (lineNumber: number) => lines[lineNumber - 1] }),
    getSelection: () => ({ startLineNumber: line, endLineNumber: line }),
    executeEdits,
  });
  const app = {
    DiscussPanel: { TextEditor: { Bullet: { Marks: '●,○' } } },
  } as unknown as TTApplication;
  registerTextEditorBulletActions(app);

  void TTActions.Execute(actionId);

  return executeEdits.mock.calls[0][1][0].text as string;
}

describe('TextEditor.Bullet.NextStyle / PrevStyle', () => {
  it.each([
    ['TextEditor.Bullet.NextStyle', '      ● child', '○ child'],
    ['TextEditor.Bullet.PrevStyle', '      ○ child', '● child'],
  ] as const)('%s aligns the bullet with the previous line content', (actionId, currentLine, expectedContent) => {
    expect(runBulletAction(actionId, ['\t\u3000parent', currentLine], 2)).toBe(`\t\u3000${expectedContent}`);
  });

  it('keeps the current indentation when the previous line has no non-whitespace character', () => {
    expect(runBulletAction('TextEditor.Bullet.NextStyle', ['   ', '      child'], 2)).toBe('      ● child');
  });
});
