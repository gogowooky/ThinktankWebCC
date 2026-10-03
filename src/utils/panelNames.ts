const LEGACY_PANEL_NAMES: Record<string, string> = {
  OverviewPanel: 'SeedsPanel',
  WorkoutSettingPanel: 'DevelopSettingPanel',
  WorkoutPanel: 'DevelopPanel',
  ReThinkPanel: 'HarvestPanel',
  Overview: 'Seeds',
  WorkoutSetting: 'DevelopSetting',
  Workout: 'Develop',
  ReThink: 'Harvest',
};

/** Convert old persisted identifiers at the read boundary, without changing user text. */
export function canonicalPanelName(name: string): string {
  return LEGACY_PANEL_NAMES[name] ?? name;
}

export function canonicalPanelPrefix(value: string): string {
  const match = /^(OverviewPanel|WorkoutSettingPanel|WorkoutPanel|ReThinkPanel|Overview|WorkoutSetting|Workout|ReThink)(?=\.|\*|$)/i.exec(value);
  if (!match) return value;
  const oldName = Object.keys(LEGACY_PANEL_NAMES).find(name => name.toLowerCase() === match[1].toLowerCase());
  return oldName ? LEGACY_PANEL_NAMES[oldName] + value.slice(match[1].length) : value;
}

export function canonicalPanelStatusList(value: string): string {
  return value.split(',').map(part => canonicalPanelPrefix(part.trim())).join(',');
}

const LEGACY_STATUS_KEYS: Record<string, string> = {
  'SeedsPanel.Mode.IsOpen': 'SeedsPanel.Area.IsOpen',
  'SeedsPanel.IsAreaOpen': 'SeedsPanel.Area.IsOpen',
  'DevelopSettingPanel.Mode.IsOpen': 'DevelopSettingPanel.Area.IsOpen',
  'DevelopPanel.IsAreaOpen': 'DevelopSettingPanel.Area.IsOpen',
  'HarvestPanel.Mode.IsOpen': 'HarvestPanel.Area.IsOpen',
  'HarvestPanel.IsAreaOpen': 'HarvestPanel.Area.IsOpen',
  'DevelopPanel.Pane.Count': 'DevelopPanel.Panes.Count',
  'DevelopPanel.Pane.Layout': 'DevelopPanel.Panes.Layout',
  'DevelopPanel.Pane.Display': 'DevelopPanel.Panes.Display',
  'Seeds.Bundle.Name': 'SeedsPanel.Bundle.ID',
  'SeedsPanel.Bundle.Name': 'SeedsPanel.Bundle.ID',
  'Seeds.Ribbon.BgColor': 'Seeds.Theme.Color',
  'Develop.Ribbon.BgColor': 'Develop.Theme.Color',
  'Harvest.Ribbon.BgColor': 'Harvest.Theme.Color',
};

export function canonicalPanelStatusKey(key: string): string {
  const current = canonicalPanelPrefix(key);
  return LEGACY_STATUS_KEYS[current] ?? current;
}
