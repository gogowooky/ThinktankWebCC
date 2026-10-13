// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { TTApplication } from '../TTApplication';
import { TTUIStateManager } from '../TTUIStateManager';
import { parseTableContent } from '../../utils/tableFormat';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('applies and serializes settings from every registry domain in the existing order', () => {
  vi.useFakeTimers();
  const app = TTApplication.Instance, manager = TTUIStateManager.instance;
  manager.init(app);
  manager.onThinkSaved(TTUIStateManager.THINK_ID, [
    'Settings', '> description,key,current,default,type,candidates',
    'left,ThinktankPanel.Area.IsOpen,false,true,boolean,.*',
    'seeds,SeedsPanel.Area.OpenWidth,user,init,string,.*',
    'discuss,DiscussSettingPanel.Mode.Name,Texteditor,Panes,string,.*',
    'editor,TextEditor.WordWrap.IsVisible,false,true,boolean,.*',
    'toolbar,ToolBar.Mode.Name,Highlighter,Status,string,.*',
    'app,Application.Display.Zoom,125,100,integer,.*',
    'right,HarvestPanel.Area.IsOpen,false,true,boolean,.*',
    'color,TextEditor.Text.Color,#123456,undefined,color,.*',
  ].join('\n'));
  expect(app.ThinktankPanel.IsAreaOpen).toBe(false);
  expect(app.SeedsPanel.AreaWidthMode).toBe('user');
  expect(app.DiscussPanel.ViewMode).toBe('texteditor');
  expect(app.DiscussPanel.TextEditor.WordWrap.IsVisible).toBe(false);
  expect(app.DiscussPanel.ToolBarMode).toBe('Highlighter');
  expect(manager.getProperty('Application.Display.Zoom')).toBe('125');
  expect(app.HarvestPanel.IsAreaOpen).toBe(false);
  expect(app.DiscussPanel.GetColorStatus('TextEditor.Text').Color).toBe('#123456');
  const sections = parseTableContent(manager.serialize(app));
  const rows = sections[0].rows;
  const keyColumn = sections[0].columns.indexOf('key');
  const keys = rows.map(row => row[keyColumn]);
  expect(keys.slice(0, 6)).toEqual(['ThinktankPanel.Area.IsOpen', 'ThinktankPanel.Area.OpenWidth',
    'ThinktankPanel.Mode.Name', 'ThinktankPanel.CurrentItem.ID', 'Application.CheckedItem.IDs', 'SeedsPanel.CurrentItem.ID']);
  expect(keys.indexOf('TextEditor.WordWrap.IsVisible')).toBeLessThan(keys.indexOf('ToolBar.Mode.Name'));
  expect(keys.indexOf('AIChat.ModelNames.Claude')).toBeLessThan(keys.indexOf('ThinktankPanel.AIChat.ModelName'));
});
