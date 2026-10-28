import type { WorkingViewMode, TableCellDisplay, TableCellPosition } from '../TTWorkingPanel';
import { collectAreaIds } from '../TTWorkingPanel';
import { TTWorkingArea } from '../TTWorkingArea';
import type { MediaType } from '../../types';
import type { PropSpec } from './types';
import { capitalize, parseBool, getFocusedArea, getFocusedPaneAllowedModes } from './stateHelpers';

export const workingSpecs: Record<string, PropSpec> = {
  'WorkingSettingPanel.Area.IsOpen': {
    panel: 'WorkingPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'Workingパネル表示',
    get: (app) => String(app.WorkingPanel.IsAreaOpen),
    set: (app, v) => { app.WorkingPanel.IsAreaOpen = parseBool(v, app.WorkingPanel.IsAreaOpen); },
  },
  'WorkingSettingPanel.Area.OpenWidth': {
    panel: 'WorkingPanel',
    default: 'init', type: 'string', candidates: '^(init|user|foredit)$',
    description: 'WorkingパネルOpen時の幅',
    get: (app) => app.WorkingPanel.AreaWidthMode,
    set: (app, v) => { app.WorkingPanel.AreaWidthMode = v as typeof app.WorkingPanel.AreaWidthMode; },
  },
  'WorkingSettingPanel.Mode.Name': {
    panel: 'WorkingPanel',
    default: 'Panes', type: 'string', candidates: '^(Panes|Texteditor|Markdown|Datagrid|Card|Graph|Html|Chat|Project)$',
    description: 'Working設定パネルモード',
    get: (app) => capitalize(app.WorkingPanel.ViewMode),
    set: (app, v) => { app.WorkingPanel.SetViewMode((['workout', 'develop', 'discuss', 'working'].includes(v.toLowerCase()) ? 'panes' : v.toLowerCase()) as WorkingViewMode); },
  },
  'WorkingPanel.Panes.Count': {
    panel: 'WorkingPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: '表示されているペインの数',
    isConst: true,
    get: (app) => String(app.WorkingPanel.Areas.length),
    set: () => { },
  },
  'WorkingPanel.FocusedPane.ID': {
    panel: 'WorkingPanel',
    default: 'None', type: 'string', candidates: '.*',
    description: 'フォーカスがあるペインのID',
    isConst: true,
    get: (app) => app.WorkingPanel.FocusedAreaId ?? 'None',
    set: () => { },
  },
  'WorkingPanel.FocusedPane.PaneNumber': {
    panel: 'WorkingPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: 'フォーカスがあるペインの番号（1始まり）',
    isConst: true,
    get: (app) => {
      const layout = app.WorkingPanel.Layout;
      if (!layout || !app.WorkingPanel.FocusedAreaId) return '0';
      const order = collectAreaIds(layout);
      const idx = order.indexOf(app.WorkingPanel.FocusedAreaId);
      return idx >= 0 ? String(idx + 1) : '0';
    },
    set: () => { },
  },
  'WorkingPanel.FocusedPane.Mode': {
    panel: 'WorkingPanel',
    default: 'Working', type: 'string',
    candidates: '^(Working|Texteditor|Markdown|Datagrid|Card|Graph|Html|Chat)$',
    description: 'フォーカスがあるペインの表示モード',
    getValues: (app) => getFocusedPaneAllowedModes(app),
    get: (app) => {
      const area = app.WorkingPanel.FocusedAreaId ? app.WorkingPanel.GetArea(app.WorkingPanel.FocusedAreaId) : null;
      return capitalize(area?.MediaType ?? 'None');
    },
    set: (app, v) => {
      if (app.WorkingPanel.FocusedAreaId) {
        const allowed = getFocusedPaneAllowedModes(app).map(x => x.toLowerCase());
        if (allowed.includes(v.toLowerCase())) {
          app.WorkingPanel.SetMediaType(app.WorkingPanel.FocusedAreaId, v.toLowerCase() as MediaType);
        }
      }
    },
  },
  'WorkingPanel.FocusedPane.FileHistory': {
    panel: 'WorkingPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'フォーカスがあるペインのLoadファイル履歴（古い順・最大30件のCSV）',
    isConst: true,
    get: (app) => getFocusedArea(app)?.FileHistory.map(h => h.id).join(',') ?? '',
    set: () => { },
  },
  'WorkingPanel.FocusedPane.FileHistoryPos': {
    panel: 'WorkingPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: 'フォーカスがあるペインのファイル履歴の現在位置（1始まり。0=履歴なし）',
    isConst: true,
    get: (app) => String(getFocusedArea(app)?.HistoryPos ?? 0),
    set: () => { },
  },
  'WorkingPanel.FocusedPane.FileHistoryMax': {
    panel: 'WorkingPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: 'フォーカスがあるペインのファイル履歴の件数（最大30）',
    isConst: true,
    get: (app) => String(getFocusedArea(app)?.HistoryMax ?? 0),
    set: () => { },
  },
  'WorkingPanel.DroppedFile.ID': {
    panel: 'WorkingPanel',
    default: '', type: 'string', candidates: '.*',
    description: '各パネルのThink一覧のThinkファイルがWorkingパネル内にDropされた際に設定されるファイルID',
    isConst: true,
    get: (app) => app.WorkingPanel.DroppedFileID || '',
    set: () => { },
  },
  'Table.CellContent.Display': {
    panel: 'WorkingPanel',
    default: 'Line', type: 'string', candidates: '^(Line|FitToColumn)$',
    description: 'テーブルのセル表示方法',
    get: (app) => app.WorkingPanel.Table.CellContent.Display,
    set: (app, v) => { app.WorkingPanel.Table.CellContent.Display = v as TableCellDisplay; },
  },
  'Table.CellContent.Position': {
    panel: 'WorkingPanel',
    default: 'Left', type: 'string', candidates: '^(Left|Center|Right)$',
    description: 'テーブルのセル表示位置',
    get: (app) => app.WorkingPanel.Table.CellContent.Position,
    set: (app, v) => { app.WorkingPanel.Table.CellContent.Position = v as TableCellPosition; },
  },
  'WorkingPanel.Panes.Layout': {
    panel: 'WorkingPanel',
    default: 'null', type: 'string', candidates: '.*',
    description: 'Paneレイアウト構造(JSON)',
    get: (app) => app.WorkingPanel.Layout ? JSON.stringify(app.WorkingPanel.Layout) : 'null',
    set: (app, v) => {
      try {
        app.WorkingPanel.Layout = (v && v !== 'null') ? JSON.parse(v) : null;
      } catch (e) {
        console.error('Failed to parse WorkingPanel.Panes.Layout', e);
      }
    },
  },
  'WorkingPanel.Panes.Display': {
    panel: 'WorkingPanel',
    default: '[]', type: 'string', candidates: '.*',
    description: '各Paneのロード状態(JSON)',
    get: (app) => {
      const list = app.WorkingPanel.Areas.map(a => ({
        id: a.ID,
        resourceId: a.ResourceID,
        mediaType: a.MediaType,
        title: a.Title
      }));
      return JSON.stringify(list);
    },
    set: (app, v) => {
      try {
        const list = v ? JSON.parse(v) : [];
        if (!Array.isArray(list)) return;

        // 既存の Areas を一度クリアし、ID情報を保持したまま再構築
        app.WorkingPanel.Areas = [];
        for (const item of list) {
          const area = new TTWorkingArea();
          area.ID = item.id;
          area._parent = app.WorkingPanel;
          area.OpenThink(item.resourceId, item.mediaType, item.title);
          app.WorkingPanel.Areas = [...app.WorkingPanel.Areas, area];
        }
      } catch (e) {
        console.error('Failed to parse WorkingPanel.Panes.Display', e);
      }
    },
  }
};
