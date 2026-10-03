// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { TTApplication } from './TTApplication';
import { TTUIStateManager } from './TTUIStateManager';

it('loads old panel settings and serializes the current keys', () => {
  const app = TTApplication.Instance;
  const manager = TTUIStateManager.instance;
  manager.init(app);
  manager.onThinkSaved(TTUIStateManager.THINK_ID, [
    'UI Settings',
    '> description,key,current,default,type,candidates',
    '幅,OverviewPanel.Area.OpenWidth,user,init,string,.*',
    '設定,WorkoutSettingPanel.Mode.Name,Workout,Workout,string,.*',
    '色,Overview.Theme.Color,#123456,undefined,color,.*',
    '表示,ToolBar.StatusMode.Text,OverviewPanel.Mode.Name,OverviewPanel.Mode.Name,string,.*',
    '焦点,Application.FocusedPanel.Name,Overview,Thinktank,string,.*',
  ].join('\n'));

  expect(app.SeedsPanel.AreaWidthMode).toBe('user');
  expect(app.DevelopPanel.ViewMode).toBe('panes');
  expect(app.DevelopPanel.GetColorStatus('Seeds.Theme').Color).toBe('#123456');
  expect(app.DevelopPanel.StatusModeText).toBe('SeedsPanel.Mode.Name');
  expect(app.FocusedColumn).toBe('Seeds');
  const saved = manager.serialize(app);
  expect(saved).toContain('SeedsPanel.Area.OpenWidth');
  expect(saved).not.toContain('OverviewPanel.Area.OpenWidth');
});
