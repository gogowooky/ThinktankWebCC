import type { DiscussViewMode, TableCellDisplay, TableCellPosition } from '../TTDiscussPanel';
import { collectAreaIds } from '../TTDiscussPanel';
import { TTDiscussArea } from '../TTDiscussArea';
import type { MediaType } from '../../types';
import type { PropSpec } from './types';
import { capitalize, parseBool, getFocusedArea, getFocusedPaneAllowedModes } from './stateHelpers';

export const discussSpecs: Record<string, PropSpec> = {
  'DiscussSettingPanel.Area.IsOpen': {
    panel: 'DiscussPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'ワークアウトパネル表示',
    get: (app) => String(app.DiscussPanel.IsAreaOpen),
    set: (app, v) => { app.DiscussPanel.IsAreaOpen = parseBool(v, app.DiscussPanel.IsAreaOpen); },
  },
  'DiscussSettingPanel.Area.OpenWidth': {
    panel: 'DiscussPanel',
    default: 'init', type: 'string', candidates: '^(init|user|foredit)$',
    description: 'ワークアウトパネルOpen時の幅',
    get: (app) => app.DiscussPanel.AreaWidthMode,
    set: (app, v) => { app.DiscussPanel.AreaWidthMode = v as typeof app.DiscussPanel.AreaWidthMode; },
  },
  'DiscussSettingPanel.Mode.Name': {
    panel: 'DiscussPanel',
    default: 'Panes', type: 'string', candidates: '^(Panes|Texteditor|Markdown|Datagrid|Card|Graph|Html|Chat)$',
    description: 'ワークアウト設定パネルモード',
    get: (app) => capitalize(app.DiscussPanel.ViewMode),
    set: (app, v) => { app.DiscussPanel.SetViewMode((['workout', 'develop', 'discuss'].includes(v.toLowerCase()) ? 'panes' : v.toLowerCase()) as DiscussViewMode); },
  },
  'DiscussPanel.Panes.Count': {
    panel: 'DiscussPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: '表示されているペインの数',
    isConst: true,
    get: (app) => String(app.DiscussPanel.Areas.length),
    set: () => { },
  },
  'DiscussPanel.FocusedPane.ID': {
    panel: 'DiscussPanel',
    default: 'None', type: 'string', candidates: '.*',
    description: 'フォーカスがあるペインのID',
    isConst: true,
    get: (app) => app.DiscussPanel.FocusedAreaId ?? 'None',
    set: () => { },
  },
  'DiscussPanel.FocusedPane.PaneNumber': {
    panel: 'DiscussPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: 'フォーカスがあるペインの番号（1始まり）',
    isConst: true,
    get: (app) => {
      const layout = app.DiscussPanel.Layout;
      if (!layout || !app.DiscussPanel.FocusedAreaId) return '0';
      const order = collectAreaIds(layout);
      const idx = order.indexOf(app.DiscussPanel.FocusedAreaId);
      return idx >= 0 ? String(idx + 1) : '0';
    },
    set: () => { },
  },
  'DiscussPanel.FocusedPane.Mode': {
    panel: 'DiscussPanel',
    default: 'Discuss', type: 'string',
    candidates: '^(Discuss|Texteditor|Markdown|Datagrid|Card|Graph|Html|Chat)$',
    description: 'フォーカスがあるペインの表示モード',
    getValues: (app) => getFocusedPaneAllowedModes(app),
    get: (app) => {
      const area = app.DiscussPanel.FocusedAreaId ? app.DiscussPanel.GetArea(app.DiscussPanel.FocusedAreaId) : null;
      return capitalize(area?.MediaType ?? 'None');
    },
    set: (app, v) => {
      if (app.DiscussPanel.FocusedAreaId) {
        const allowed = getFocusedPaneAllowedModes(app).map(x => x.toLowerCase());
        if (allowed.includes(v.toLowerCase())) {
          app.DiscussPanel.SetMediaType(app.DiscussPanel.FocusedAreaId, v.toLowerCase() as MediaType);
        }
      }
    },
  },
  'DiscussPanel.FocusedPane.FileHistory': {
    panel: 'DiscussPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'フォーカスがあるペインのLoadファイル履歴（古い順・最大30件のCSV）',
    isConst: true,
    get: (app) => getFocusedArea(app)?.FileHistory.map(h => h.id).join(',') ?? '',
    set: () => { },
  },
  'DiscussPanel.FocusedPane.FileHistoryPos': {
    panel: 'DiscussPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: 'フォーカスがあるペインのファイル履歴の現在位置（1始まり。0=履歴なし）',
    isConst: true,
    get: (app) => String(getFocusedArea(app)?.HistoryPos ?? 0),
    set: () => { },
  },
  'DiscussPanel.FocusedPane.FileHistoryMax': {
    panel: 'DiscussPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: 'フォーカスがあるペインのファイル履歴の件数（最大30）',
    isConst: true,
    get: (app) => String(getFocusedArea(app)?.HistoryMax ?? 0),
    set: () => { },
  },
  'DiscussPanel.DroppedFile.ID': {
    panel: 'DiscussPanel',
    default: '', type: 'string', candidates: '.*',
    description: '各パネルのThink一覧のThinkファイルがDiscussパネル内にDropされた際に設定されるファイルID',
    isConst: true,
    get: (app) => app.DiscussPanel.DroppedFileID || '',
    set: () => { },
  },
  'Table.CellContent.Display': {
    panel: 'DiscussPanel',
    default: 'Line', type: 'string', candidates: '^(Line|FitToColumn)$',
    description: 'テーブルのセル表示方法',
    get: (app) => app.DiscussPanel.Table.CellContent.Display,
    set: (app, v) => { app.DiscussPanel.Table.CellContent.Display = v as TableCellDisplay; },
  },
  'Table.CellContent.Position': {
    panel: 'DiscussPanel',
    default: 'Left', type: 'string', candidates: '^(Left|Center|Right)$',
    description: 'テーブルのセル表示位置',
    get: (app) => app.DiscussPanel.Table.CellContent.Position,
    set: (app, v) => { app.DiscussPanel.Table.CellContent.Position = v as TableCellPosition; },
  },
  'DiscussPanel.Panes.Layout': {
    panel: 'DiscussPanel',
    default: 'null', type: 'string', candidates: '.*',
    description: 'Paneレイアウト構造(JSON)',
    get: (app) => app.DiscussPanel.Layout ? JSON.stringify(app.DiscussPanel.Layout) : 'null',
    set: (app, v) => {
      try {
        app.DiscussPanel.Layout = (v && v !== 'null') ? JSON.parse(v) : null;
      } catch (e) {
        console.error('Failed to parse DiscussPanel.Panes.Layout', e);
      }
    },
  },
  'DiscussPanel.Panes.Display': {
    panel: 'DiscussPanel',
    default: '[]', type: 'string', candidates: '.*',
    description: '各Paneのロード状態(JSON)',
    get: (app) => {
      const list = app.DiscussPanel.Areas.map(a => ({
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
        app.DiscussPanel.Areas = [];
        for (const item of list) {
          const area = new TTDiscussArea();
          area.ID = item.id;
          area._parent = app.DiscussPanel;
          area.OpenThink(item.resourceId, item.mediaType, item.title);
          app.DiscussPanel.Areas = [...app.DiscussPanel.Areas, area];
        }
      } catch (e) {
        console.error('Failed to parse DiscussPanel.Panes.Display', e);
      }
    },
  }
};
