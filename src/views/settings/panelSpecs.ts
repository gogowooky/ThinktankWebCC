import type { ThinktankViewMode } from '../TTThinktankPanel';
import type { SeedsViewMode } from '../TTSeedsPanel';
import type { HarvestViewMode } from '../TTHarvestPanel';
import type { PropSpec } from './types';
import { capitalize, parseBool } from './stateHelpers';
import type { TTThink } from '../../models/TTThink';
import { cursorRowIndex } from '../../utils/thinkTree';

interface CursorListPanel {
  CurrentItemID: string;
  CurrentItemRow: number;
  FilteredThoughts: TTThink[];
}

/** Think一覧のカーソル行（1始まり、なしは '0'）。Tree 表示で同じ ID の行が複数あっても行で決める */
function cursorPosOf(panel: CursorListPanel): string {
  const idx = cursorRowIndex(panel.FilteredThoughts, panel.CurrentItemID, panel.CurrentItemRow);
  return idx >= 0 ? String(idx + 1) : '0';
}

function setCursorPos(panel: CursorListPanel, v: string): void {
  const pos = parseInt(v, 10);
  if (isNaN(pos) || pos <= 0) {
    panel.CurrentItemID = '';
    panel.CurrentItemRow = -1;
    return;
  }
  const idx = pos - 1;
  if (idx < panel.FilteredThoughts.length) {
    panel.CurrentItemID = panel.FilteredThoughts[idx].ID;
    panel.CurrentItemRow = idx;
  }
}

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
    default: 'Filter', type: 'string', candidates: '^(Filter|Chat|Project|Aiview|Aichat|Settings)$',
    description: '左パネルモード',
    get: (app) => capitalize(app.ThinktankPanel.ViewMode),
    set: (app, v) => { app.ThinktankPanel.SetViewMode(v.toLowerCase() as ThinktankViewMode); },
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
    default: 'Filter', type: 'string', candidates: '^(Filter|Chat|Project|Aiview|Aichat|Settings)$',
    description: '上部パネル表示モード',
    get: (app) => capitalize(app.SeedsPanel.ViewMode),
    set: (app, v) => { app.SeedsPanel.SetViewMode(v.toLowerCase() as SeedsViewMode); },
  },
  'ThinktankPanel.Project.ID': {
    panel: 'ThinktankPanel',
    default: 'none', type: 'string', candidates: '.*',
    description: 'ThinktankパネルのprojectファイルID',
    get: (app) => app.ThinktankPanel.ProjectID || 'none',
    set: (app, v) => {
      if (v === 'none' || !v) {
        if (app.ThinktankPanel.ProjectID || app.ThinktankPanel.ProjectView.ThinkID) {
          app.ThinktankPanel.ClearProject();
        }
      } else {
        app.ThinktankPanel.OpenProject(v);
      }
    },
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
    get: (app) => cursorPosOf(app.ThinktankPanel),
    set: (app, v) => setCursorPos(app.ThinktankPanel, v),
  },
  'SeedsPanel.Filter.CursorPos': {
    panel: 'SeedsPanel',
    default: '0', type: 'string', candidates: '.*',
    description: 'Seeds>Think一覧のカーソル位置',
    isConst: true,
    get: (app) => cursorPosOf(app.SeedsPanel),
    set: (app, v) => setCursorPos(app.SeedsPanel, v),
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
    default: 'Aiview', type: 'string', candidates: '^(Chat|Project|Aiview|Aichat|Settings)$',
    description: '右パネル表示モード',
    get: (app) => capitalize(app.HarvestPanel.ViewMode),
    set: (app, v) => { app.HarvestPanel.SetViewMode(v.toLowerCase() as HarvestViewMode); },
  }
};
