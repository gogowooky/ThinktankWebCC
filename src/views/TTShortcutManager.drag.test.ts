import { describe, expect, it } from 'vitest';
import { TTShortcutManager } from './TTShortcutManager';

describe('外部リソースD&Dの既定ショートカット', () => {
  it('LocalFileDrag/LocalDirDragをDDInsert Actionへ解決する', async () => {
    const manager = TTShortcutManager.instance;
    await manager.ensureThinkExists({} as never);
    expect(manager.GetShortcuts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'localfiledrag', action: 'TextEditor.CurrentEditor.DDInsert:Menu' }),
      expect.objectContaining({ key: 'localdirdrag', action: 'TextEditor.CurrentEditor.DDInsert:Menu' }),
      expect.objectContaining({ key: 'alt+localfiledrag', action: 'TextEditor.CurrentEditor.DDInsert:Tag' }),
      expect.objectContaining({ key: 'alt+localdirdrag', action: 'TextEditor.CurrentEditor.DDInsert:Tag' }),
    ]));
  });
});
