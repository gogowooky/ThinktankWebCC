import { describe, expect, it } from 'vitest';
import { TTShortcutManager } from './TTShortcutManager';

describe('外部リソースD&Dの既定ショートカット', () => {
  it('LocalFileDragをDDInsert Actionへ解決し、LocalDirDragは定義しない', async () => {
    const manager = TTShortcutManager.instance;
    await manager.ensureThinkExists({} as never);
    const shortcuts = manager.GetShortcuts();
    expect(shortcuts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'localfiledrag', action: 'TextEditor.CurrentEditor.DDInsert:Menu' }),
      expect.objectContaining({ key: 'alt+localfiledrag', action: 'TextEditor.CurrentEditor.DDInsert:Tag' }),
    ]));
    expect(shortcuts.some(s => s.key.includes('localdirdrag'))).toBe(false);
  });
});
