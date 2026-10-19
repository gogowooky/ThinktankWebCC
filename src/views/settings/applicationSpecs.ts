import type { TTApplication } from '../TTApplication';
import { getFocusName } from '../../utils/getFocusName';
import { getAppZoom, setAppZoom } from '../../utils/appZoom';
import { StorageManager } from '../../services/storage/StorageManager';
import type { PropSpec } from './types';
import { focusSelector } from './stateHelpers';

export const applicationSpecs: Record<string, PropSpec> = {
  'Application.CheckedItem.IDs': {
    panel: 'Application',
    default: '', type: 'string', candidates: '^(\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6},)*\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6}$|^$',
    description: 'チェックされたアイテムID群',
    get: (app) => app.ThinktankPanel.CheckedThoughtIDs.join(','),
    set: (app, v) => {
      const ids = v ? v.split(',').map(id => id.trim()).filter(Boolean) : [];
      const cur = app.ThinktankPanel.CheckedThoughtIDs;
      if (cur.length !== ids.length || !cur.every((id, idx) => id === ids[idx])) {
        app.ThinktankPanel.CheckedThoughtIDs = ids;
        app.SeedsPanel.CheckedThoughtIDs = ids;
      }
    },
  },
  'Application.FocusedPanel.Name': {
    panel: 'Application',
    default: 'Thinktank', type: 'string',
    candidates: '^(Thinktank|Seeds|DiscussSetting|Discuss|Harvest)$',
    description: 'フォーカスカラム',
    getValues: (_app) => localStorage.getItem('tt-layout-mode') === 'simple'
      ? ['Thinktank', 'DiscussSetting', 'Discuss']
      : ['Thinktank', 'Seeds', 'DiscussSetting', 'Discuss', 'Harvest'],
    get: (app) => app.FocusedColumn,
    set: (app, v) => {
      app.FocusedColumn = v;
      const SELECTORS: Record<string, string> = {
        'Thinktank': '.thinktank-panel, .thinktank-area',
        'Seeds': '.seeds-panel, .seeds-area',
        'DiscussSetting': '.discuss-setting-area',
        'Discuss': '.discuss-area',
        'Harvest': '.harvest-panel, .harvest-area',
      };
      const effectiveSel = (v === 'DiscussSetting' && !app.DiscussPanel.IsAreaOpen)
        ? '.vertical-tab-bar--discuss .vertical-tab-bar__toggle'
        : SELECTORS[v];
      if (effectiveSel) {
        focusSelector(effectiveSel);
      }
    },
  },
  'Application.FocusedArea.Name': {
    panel: 'Application',
    default: 'None', type: 'string', candidates: '.*',
    description: 'キーボードフォーカスエリア名',
    isConst: true,
    getValues: (app) => {
      const list: string[] = [];
      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const isSimple = localStorage.getItem('tt-layout-mode') === 'simple';

      if (app.ThinktankPanel.IsAreaOpen) {
        list.push(`Thinktank.${capitalize(app.ThinktankPanel.ViewMode)}`);
      }
      if (!isSimple && app.SeedsPanel.IsAreaOpen) {
        list.push(`Seeds.${capitalize(app.SeedsPanel.ViewMode)}`);
      }
      if (app.DiscussPanel.IsAreaOpen) {
        list.push(`DiscussSetting.${capitalize(app.DiscussPanel.ViewMode)}`);
      }
      if (app.DiscussPanel.Areas.length > 0) {
        for (const area of app.DiscussPanel.Areas) {
          list.push(`Discuss.${capitalize(area.MediaType)}`);
        }
      }
      if (!isSimple && app.HarvestPanel.IsAreaOpen) {
        list.push(`Harvest.${capitalize(app.HarvestPanel.ViewMode)}`);
      }
      list.push(`ToolBar.${capitalize(app.DiscussPanel.ToolBarMode)}`);

      return Array.from(new Set(list));
    },
    get: (_app) => getFocusName(document.activeElement),
    set: (app, value) => {
      if (!value || value === 'None') {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }
      if (value === 'Application.StatusBarArea') {
        focusSelector('.ApplicationStatusBarArea');
        return;
      }

      const parts = value.split('.');
      const panelName = parts[0];
      const subName = parts[1] || '';

      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const subNameCap = capitalize(subName);

      if (panelName === 'Thinktank') {
        app.ThinktankPanel.IsAreaOpen = true;
        if (subName) {
          app.ThinktankPanel.ViewMode = subName.toLowerCase() as TTApplication['ThinktankPanel']['ViewMode'];
        }
        focusSelector('.thinktank-panel, .thinktank-area');
      } else if (panelName === 'Seeds') {
        app.SeedsPanel.IsAreaOpen = true;
        if (subName) {
          app.SeedsPanel.SetViewMode(subName.toLowerCase() as TTApplication['SeedsPanel']['ViewMode']);
        }
        focusSelector('.seeds-panel, .seeds-area');
      } else if (panelName === 'DiscussSetting') {
        app.DiscussPanel.IsAreaOpen = true;
        if (subName) {
          app.DiscussPanel.SetViewMode(subName.toLowerCase() as TTApplication['DiscussPanel']['ViewMode']);
        }
        focusSelector('.discuss-setting-area');
      } else if (panelName === 'Harvest') {
        app.HarvestPanel.IsAreaOpen = true;
        if (subName) {
          app.HarvestPanel.SetViewMode(subName.toLowerCase() as TTApplication['HarvestPanel']['ViewMode']);
        }
        focusSelector('.harvest-panel, .harvest-area');
      } else if (panelName === 'ToolBar') {
        if (subName) {
          const modeMap: Record<string, string> = {
            'keyaction': 'KeyAction',
          };
          const toolbarMode = modeMap[subName.toLowerCase()] || subNameCap;
          app.DiscussPanel.ToolBarMode = toolbarMode;
        }
        focusSelector('.discuss-toolbar');
      } else if (panelName === 'Discuss') {
        if (subName && subName.toLowerCase() !== 'none') {
          const typeLower = subName.toLowerCase();
          setTimeout(() => {
            const areas = Array.from(document.querySelectorAll<HTMLElement>('.discuss-area'));
            const targetArea = areas.find(area => {
              const content = area.querySelector<HTMLElement>('.discuss-area__content');
              return content?.dataset.mediaType?.toLowerCase() === typeLower;
            }) || areas[0];

            if (targetArea) {
              const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [contenteditable], [tabindex]:not([tabindex="-1"])';
              if (targetArea.matches(FOCUSABLE) && !targetArea.closest('[inert]')) {
                targetArea.focus({ preventScroll: true });
                return;
              }
              const focusable = Array.from(targetArea.querySelectorAll<HTMLElement>(FOCUSABLE))
                .find(el => !el.closest('[inert]'));
              if (focusable) focusable.focus({ preventScroll: true });
              else if (!targetArea.closest('[inert]')) targetArea.focus({ preventScroll: true });
            }
          }, 50);
        } else {
          focusSelector('.discuss-area');
        }
      }
    },
  },
  'Application.PanelDisplay.Mode': {
    panel: 'Application',
    default: 'Think', type: 'string', candidates: '^(Think|Edit)$',
    description: 'パネル表示モード（Think=全表示, Edit=簡易表示）',
    get: () => localStorage.getItem('tt-layout-mode') === 'simple' ? 'Edit' : 'Think',
    set: (_app, v) => { localStorage.setItem('tt-layout-mode', v === 'Edit' ? 'simple' : 'sipoc'); },
  },
  'Application.Display.Zoom': {
    panel: 'Application',
    default: '100', type: 'integer', candidates: '^[0-9]{2,3}$',
    description: '表示文字サイズの倍率（％。50〜200、10刻み）',
    get: () => String(getAppZoom()),
    set: (_app, v) => { setAppZoom(parseInt(v, 10) || 100); },
  },
  'Application.Execution.Status': {
    panel: 'Application',
    default: 'PWA', type: 'string', candidates: '^(PWA|Electron)$',
    description: 'アプリケーションの起動モード',
    isConst: true,
    get: () => {
      const mode = StorageManager.instance.mode;
      if (mode === 'electron') return 'Electron';
      return 'PWA';
    },
    set: () => { },
  },
  'Application.Synchronization.Status': {
    panel: 'Application',
    default: 'synced', type: 'string', candidates: '^(synced|syncing|pending|error|offline)$',
    description: 'アプリケーションの同期状態',
    isConst: true,
    get: (app) => app.Status.SyncState || 'synced',
    set: () => { },
  },
  'Application.Status.ExMode': {
    panel: 'Application',
    default: 'None', type: 'string', candidates: '.*',
    description: '一時拡張ショートカットモード',
    isConst: true,
    get: (app) => app.Status.ExMode || 'None',
    set: () => { },
  },
};
