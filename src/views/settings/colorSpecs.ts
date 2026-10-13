import type { TTApplication } from '../TTApplication';
import { COLOR_PROPS, DEFAULT_COLOR_ENTRIES, isUnset } from '../../utils/defaultColor';
import type { ColorProp } from '../../utils/defaultColor';
import type { PropSpec, PropDef, PanelKey } from './types';

const COLOR_PROP_TYPE: Record<ColorProp, PropDef['type']> = {
  Color: 'color',
  BgColor: 'color',
  Attrs: 'string',
};

const COLOR_VALUE_PATTERN = '^(#[0-9a-fA-F]{3,8}|undefined|none)$';
const ATTR_NAMES = 'bold|italic|underline|strikethrough';

const COLOR_PROP_CANDIDATES: Record<ColorProp, string> = {
  Color: COLOR_VALUE_PATTERN,
  BgColor: COLOR_VALUE_PATTERN,
  Attrs: `^(undefined|none|(${ATTR_NAMES})(\\|(${ATTR_NAMES}))*)$`,
};

const COLOR_PROP_LABEL: Record<ColorProp, string> = {
  Color: '文字色',
  BgColor: '背景色',
  Attrs: `表示属性 (${ATTR_NAMES})`,
};

function colorStatusPanel(statusId: string): PanelKey {
  const prefix = statusId.split('.')[0];
  if (prefix === 'Thinktank') return 'ThinktankPanel';
  if (prefix === 'Seeds') return 'SeedsPanel';
  if (prefix === 'Harvest') return 'HarvestPanel';
  if (prefix === 'Application') return 'Application';
  if (prefix === 'FocusingBorder') return 'Application';
  return 'DiscussPanel';
}

export function registerColorStatusSpecs(PROP_SPECS: Record<string, PropSpec>): void {
  for (const entry of DEFAULT_COLOR_ENTRIES) {
    for (const prop of COLOR_PROPS) {
      const key = `${entry.statusId}.${prop}`;
      const defValue = entry.style[prop];
      const existing = (PROP_SPECS as Record<string, PropSpec | undefined>)[key];

      if (existing) {
        if (!isUnset(defValue)) existing.default = defValue;
        continue;
      }

      (PROP_SPECS as Record<string, PropSpec>)[key] = {
        panel: colorStatusPanel(entry.statusId),
        default: defValue,
        type: COLOR_PROP_TYPE[prop],
        candidates: COLOR_PROP_CANDIDATES[prop],
        description: `${entry.statusId} の${COLOR_PROP_LABEL[prop]}`,
        get: (app: TTApplication) => app.DiscussPanel.GetColorStatus(entry.statusId)[prop],
        set: (app: TTApplication, v: string) => { app.DiscussPanel.SetColorStatus(entry.statusId, prop, v, false); },
      };
    }
  }
}
