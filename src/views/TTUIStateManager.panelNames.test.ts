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
  expect(app.WorkingPanel.ViewMode).toBe('panes');
  expect(app.WorkingPanel.GetColorStatus('Seeds.Theme').Color).toBe('#123456');
  expect(app.WorkingPanel.StatusModeText).toBe('SeedsPanel.Mode.Name');
  expect(app.FocusedColumn).toBe('Seeds');
  const saved = manager.serialize(app);
  expect(saved).toContain('SeedsPanel.Area.OpenWidth');
  expect(saved).not.toContain('OverviewPanel.Area.OpenWidth');
});

it('loads Develop settings and writes Working keys', () => {
  const app = TTApplication.Instance;
  const manager = TTUIStateManager.instance;
  manager.init(app);
  manager.onThinkSaved(TTUIStateManager.THINK_ID, [
    'UI Settings',
    '> description,key,current,default,type,candidates',
    '色,Develop.Theme.Color,#654321,undefined,color,.*',
    '設定,DevelopSettingPanel.Mode.Name,Develop,Develop,string,.*',
    '表示,ToolBar.StatusMode.Text,DevelopPanel.Panes.Count,DevelopPanel.Panes.Count,string,.*',
    '焦点,Application.FocusedPanel.Name,Develop,Thinktank,string,.*',
  ].join('\n'));

  expect(app.WorkingPanel.GetColorStatus('Working.Theme').Color).toBe('#654321');
  expect(app.WorkingPanel.ViewMode).toBe('panes');
  expect(app.WorkingPanel.StatusModeText).toBe('WorkingPanel.Panes.Count');
  expect(app.FocusedColumn).toBe('Working');
  const saved = manager.serialize(app);
  expect(saved).toContain('Working.Theme.Color');
  expect(saved).not.toContain('Develop.Theme.Color');
});

it('loads Discuss settings saved before the Working rename', () => {
  const app = TTApplication.Instance;
  const manager = TTUIStateManager.instance;
  manager.init(app);
  manager.onThinkSaved(TTUIStateManager.THINK_ID, [
    'UI Settings',
    '> description,key,current,default,type,candidates',
    '色,Discuss.Theme.Color,#13579b,undefined,color,.*',
    '設定,DiscussSettingPanel.Mode.Name,Discuss,Discuss,string,.*',
    '表示,ToolBar.StatusMode.Text,DiscussPanel.Pane.Count,DiscussPanel.Pane.Count,string,.*',
    '焦点,Application.FocusedPanel.Name,Discuss,Thinktank,string,.*',
  ].join('\n'));

  expect(app.WorkingPanel.GetColorStatus('Working.Theme').Color).toBe('#13579b');
  expect(app.WorkingPanel.ViewMode).toBe('panes');
  expect(app.WorkingPanel.StatusModeText).toBe('WorkingPanel.Panes.Count');
  expect(app.FocusedColumn).toBe('Working');
  const saved = manager.serialize(app);
  expect(saved).toContain('Working.Theme.Color');
  expect(saved).not.toContain('Discuss');
});
