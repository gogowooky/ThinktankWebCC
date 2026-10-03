import { expect, it } from 'vitest';
import { TTShortcutManager } from './TTShortcutManager';

it('loads a saved shortcut with old focus and action names', () => {
  const manager = TTShortcutManager.instance;
  manager.onThinkSaved(TTShortcutManager.THINK_ID,
    'Shortcuts\n> focus,exmode,key,action,description\nOverview.Filter,,Alt+P,OverviewPanel.Filter.CursorPos:PrevLine,旧設定');
  expect(manager.GetShortcuts()).toContainEqual({
    focus: 'Seeds.Filter', exmode: '', key: 'alt+p',
    action: 'SeedsPanel.Filter.CursorPos:PrevLine', description: '旧設定',
  });
});
