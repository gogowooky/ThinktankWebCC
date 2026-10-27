import type { ThinktankViewMode } from '../TTThinktankPanel';
import type { SeedsViewMode } from '../TTSeedsPanel';
import type { HarvestViewMode } from '../TTHarvestPanel';
import type { PropSpec } from './types';
import { capitalize, parseBool } from './stateHelpers';

export const panelSpecs: Record<string, PropSpec> = {
  'ThinktankPanel.Area.IsOpen': {
    panel: 'ThinktankPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '左パネル表示',
    get: (app) => String(app.ThinktankPanel.IsAreaOpen),
    set: (app, v) => { app.ThinktankPanel.IsAreaOpen = parseBool(v, app.ThinktankPanel.IsAreaOpen); },
  },
  'ThinktankPanel.Area.OpenWidth': {
    panel: 'ThinktankPanel',
    default: 'init', type: 'string', candidates: '^(init|user|foredit)$',
    description: 'ThinktankパネルOpen時の幅',
    get: (app) => app.ThinktankPanel.AreaWidthMode,
    set: (app, v) => { app.ThinktankPanel.AreaWidthMode = v as typeof app.ThinktankPanel.AreaWidthMode; },
  },
  'ThinktankPanel.Mode.Name': {
    panel: 'ThinktankPanel',
    default: 'Filter', type: 'string', candidates: '^(Filter|Chat|Project|Settings)$',
    description: '左パネルモード',
    get: (app) => capitalize(app.ThinktankPanel.ViewMode),
    set: (app, v) => { app.ThinktankPanel.ViewMode = v.toLowerCase() as ThinktankViewMode; },
  },
  'ThinktankPanel.CurrentItem.ID': {
    panel: 'ThinktankPanel',
    default: '', type: 'string', candidates: '^(\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6})?$',
    description: '左パネル現在フォーカス項目ID',
    get: (app) => app.ThinktankPanel.CurrentItemID || '',
    set: (app, v) => { app.ThinktankPanel.CurrentItemID = v; },
  },
  'SeedsPanel.CurrentItem.ID': {
    panel: 'SeedsPanel',
    default: '', type: 'string', candidates: '^(\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6})?$',
    description: '上部パネル現在フォーカス項目ID',
    get: (app) => app.SeedsPanel.CurrentItemID || '',
    set: (app, v) => { app.SeedsPanel.CurrentItemID = v; },
  },
  'SeedsPanel.Area.IsOpen': {
    panel: 'SeedsPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '上部パネル表示',
    get: (app) => String(app.SeedsPanel.IsAreaOpen),
    set: (app, v) => { app.SeedsPanel.IsAreaOpen = parseBool(v, app.SeedsPanel.IsAreaOpen); },
  },
  'SeedsPanel.Area.OpenWidth': {
    panel: 'SeedsPanel',
    default: 'init', type: 'string', candidates: '^(init|user|foredit)$',
    description: 'SeedsパネルOpen時の幅',
    get: (app) => app.SeedsPanel.AreaWidthMode,
    set: (app, v) => { app.SeedsPanel.AreaWidthMode = v as typeof app.SeedsPanel.AreaWidthMode; },
  },
  'SeedsPanel.Mode.Name': {
    panel: 'SeedsPanel',
    default: 'Filter', type: 'string', candidates: '^(Filter|Chat|Project|Settings)$',
    description: '上部パネル表示モード',
    get: (app) => capitalize(app.SeedsPanel.ViewMode),
    set: (app, v) => { app.SeedsPanel.SetViewMode(v.toLowerCase() as SeedsViewMode); },
  },
  'SeedsPanel.Project.ID': {
    panel: 'SeedsPanel',
    default: 'none', type: 'string', candidates: '.*',
    description: 'SeedsパネルのprojectファイルID',
    get: (app) => app.SeedsPanel.ProjectID || 'none',
    set: (app, v) => {
      if (v === 'none') {
        app.SeedsPanel.ClearProject();
      } else {
        app.SeedsPanel.OpenProject(v);
      }
    },
  },
  'ThinktankPanel.Filter.CursorPos': {
    panel: 'ThinktankPanel',
    default: '0', type: 'string', candidates: '.*',
    description: 'Thinktank>Think一覧のカーソル位置',
    isConst: true,
    get: (app) => {
      const list = app.ThinktankPanel.FilteredThoughts;
      const curId = app.ThinktankPanel.CurrentItemID;
      if (!curId || list.length === 0) return '0';
      const idx = list.findIndex(t => t.ID === curId);
      return idx >= 0 ? String(idx + 1) : '0';
    },
    set: (app, v) => {
      const pos = parseInt(v, 10);
      if (isNaN(pos) || pos <= 0) {
        app.ThinktankPanel.CurrentItemID = '';
        return;
      }
      const list = app.ThinktankPanel.FilteredThoughts;
      const idx = pos - 1;
      if (idx < list.length) {
        app.ThinktankPanel.CurrentItemID = list[idx].ID;
      }
    },
  },
  'SeedsPanel.Filter.CursorPos': {
    panel: 'SeedsPanel',
    default: '0', type: 'string', candidates: '.*',
    description: 'Seeds>Think一覧のカーソル位置',
    isConst: true,
    get: (app) => {
      const list = app.SeedsPanel.FilteredThoughts;
      const curId = app.SeedsPanel.CurrentItemID;
      if (!curId || list.length === 0) return '0';
      const idx = list.findIndex(t => t.ID === curId);
      return idx >= 0 ? String(idx + 1) : '0';
    },
    set: (app, v) => {
      const pos = parseInt(v, 10);
      if (isNaN(pos) || pos <= 0) {
        app.SeedsPanel.CurrentItemID = '';
        return;
      }
      const list = app.SeedsPanel.FilteredThoughts;
      const idx = pos - 1;
      if (idx < list.length) {
        app.SeedsPanel.CurrentItemID = list[idx].ID;
      }
    },
  },
  'ThinktankPanel.Filter.CursorPosID': {
    panel: 'ThinktankPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'Thinktank>Think一覧のカーソル位置のID',
    isConst: true,
    get: (app) => {
      const curId = app.ThinktankPanel.CurrentItemID;
      // 一覧に存在しないID（フィルタ変更で消えた等）はカーソルなしとみなす
      return app.ThinktankPanel.FilteredThoughts.some(t => t.ID === curId) ? curId : '';
    },
    set: (app, v) => {
      if (!v || app.ThinktankPanel.FilteredThoughts.some(t => t.ID === v)) {
        app.ThinktankPanel.CurrentItemID = v;
      }
    },
  },
  'SeedsPanel.Filter.CursorPosID': {
    panel: 'SeedsPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'Seeds>Think一覧のカーソル位置のID',
    isConst: true,
    get: (app) => {
      const curId = app.SeedsPanel.CurrentItemID;
      return app.SeedsPanel.FilteredThoughts.some(t => t.ID === curId) ? curId : '';
    },
    set: (app, v) => {
      if (!v || app.SeedsPanel.FilteredThoughts.some(t => t.ID === v)) {
        app.SeedsPanel.CurrentItemID = v;
      }
    },
  },
  'HarvestPanel.Area.IsOpen': {
    panel: 'HarvestPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '右パネル表示',
    get: (app) => String(app.HarvestPanel.IsAreaOpen),
    set: (app, v) => { app.HarvestPanel.IsAreaOpen = parseBool(v, app.HarvestPanel.IsAreaOpen); },
  },
  'HarvestPanel.Area.OpenWidth': {
    panel: 'HarvestPanel',
    default: 'init', type: 'string', candidates: '^(init|user|foredit)$',
    description: 'HarvestパネルOpen時の幅',
    get: (app) => app.HarvestPanel.AreaWidthMode,
    set: (app, v) => { app.HarvestPanel.AreaWidthMode = v as typeof app.HarvestPanel.AreaWidthMode; },
  },
  'HarvestPanel.Mode.Name': {
    panel: 'HarvestPanel',
    default: 'Chat', type: 'string', candidates: '^(Chat|Project|Settings)$',
    description: '右パネル表示モード',
    get: (app) => capitalize(app.HarvestPanel.ViewMode),
    set: (app, v) => { app.HarvestPanel.SetViewMode(v.toLowerCase() as HarvestViewMode); },
  }
};
