// 旧名はユーザーの指示があるまで削除しない（保存済みUI状態・ショートカット・サブ課題を読むため）
const LEGACY_PANEL_NAMES: Record<string, string> = {
  DiscussSettingPanel: 'WorkingSettingPanel',
  DiscussPanel: 'WorkingPanel',
  DiscussSetting: 'WorkingSetting',
  Discuss: 'Working',
  DevelopSettingPanel: 'WorkingSettingPanel',
  DevelopPanel: 'WorkingPanel',
  DevelopSetting: 'WorkingSetting',
  Develop: 'Working',
  OverviewPanel: 'SeedsPanel',
  WorkoutSettingPanel: 'WorkingSettingPanel',
  WorkoutPanel: 'WorkingPanel',
  ReThinkPanel: 'HarvestPanel',
  Overview: 'Seeds',
  WorkoutSetting: 'WorkingSetting',
  Workout: 'Working',
  ReThink: 'Harvest',
};

// 長い名前を先に照合しないと DiscussSettingPanel が Discuss で切れる
const LEGACY_PREFIX = new RegExp(
  `^(${Object.keys(LEGACY_PANEL_NAMES).sort((a, b) => b.length - a.length).join('|')})(?=\\.|\\*|$)`, 'i');

/** Convert old persisted identifiers at the read boundary, without changing user text. */
export function canonicalPanelName(name: string): string {
  return LEGACY_PANEL_NAMES[name] ?? name;
}

export function canonicalPanelPrefix(value: string): string {
  const match = LEGACY_PREFIX.exec(value);
  if (!match) return value;
  const oldName = Object.keys(LEGACY_PANEL_NAMES).find(name => name.toLowerCase() === match[1].toLowerCase());
  return oldName ? LEGACY_PANEL_NAMES[oldName] + value.slice(match[1].length) : value;
}

export function canonicalPanelStatusList(value: string): string {
  return value.split(',').map(part => canonicalPanelStatusKey(part.trim())).join(',');
}

const LEGACY_STATUS_KEYS: Record<string, string> = {
  'SeedsPanel.Mode.IsOpen': 'SeedsPanel.Area.IsOpen',
  'SeedsPanel.IsAreaOpen': 'SeedsPanel.Area.IsOpen',
  'WorkingSettingPanel.Mode.IsOpen': 'WorkingSettingPanel.Area.IsOpen',
  'WorkingPanel.IsAreaOpen': 'WorkingSettingPanel.Area.IsOpen',
  'HarvestPanel.Mode.IsOpen': 'HarvestPanel.Area.IsOpen',
  'HarvestPanel.IsAreaOpen': 'HarvestPanel.Area.IsOpen',
  'WorkingPanel.Pane.Count': 'WorkingPanel.Panes.Count',
  'WorkingPanel.Pane.Layout': 'WorkingPanel.Panes.Layout',
  'WorkingPanel.Pane.Display': 'WorkingPanel.Panes.Display',
  'Seeds.Bundle.Name': 'SeedsPanel.Project.ID',
  'SeedsPanel.Bundle.Name': 'SeedsPanel.Project.ID',
  'SeedsPanel.Bundle.ID': 'SeedsPanel.Project.ID',
  'Seeds.Ribbon.BgColor': 'Seeds.Theme.Color',
  'Working.Ribbon.BgColor': 'Working.Theme.Color',
  'Harvest.Ribbon.BgColor': 'Harvest.Theme.Color',
};

export function canonicalPanelStatusKey(key: string): string {
  const current = canonicalPanelPrefix(key);
  return LEGACY_STATUS_KEYS[current] ?? current;
}
