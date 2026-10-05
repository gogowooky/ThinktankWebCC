const LEGACY_PANEL_NAMES: Record<string, string> = {
  DevelopSettingPanel: 'DiscussSettingPanel',
  DevelopPanel: 'DiscussPanel',
  DevelopSetting: 'DiscussSetting',
  Develop: 'Discuss',
  OverviewPanel: 'SeedsPanel',
  WorkoutSettingPanel: 'DiscussSettingPanel',
  WorkoutPanel: 'DiscussPanel',
  ReThinkPanel: 'HarvestPanel',
  Overview: 'Seeds',
  WorkoutSetting: 'DiscussSetting',
  Workout: 'Discuss',
  ReThink: 'Harvest',
};

/** Convert old persisted identifiers at the read boundary, without changing user text. */
export function canonicalPanelName(name: string): string {
  return LEGACY_PANEL_NAMES[name] ?? name;
}

export function canonicalPanelPrefix(value: string): string {
  const match = /^(DevelopSettingPanel|DevelopPanel|OverviewPanel|WorkoutSettingPanel|WorkoutPanel|ReThinkPanel|DevelopSetting|Develop|Overview|WorkoutSetting|Workout|ReThink)(?=\.|\*|$)/i.exec(value);
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
  'DiscussSettingPanel.Mode.IsOpen': 'DiscussSettingPanel.Area.IsOpen',
  'DiscussPanel.IsAreaOpen': 'DiscussSettingPanel.Area.IsOpen',
  'HarvestPanel.Mode.IsOpen': 'HarvestPanel.Area.IsOpen',
  'HarvestPanel.IsAreaOpen': 'HarvestPanel.Area.IsOpen',
  'DiscussPanel.Pane.Count': 'DiscussPanel.Panes.Count',
  'DiscussPanel.Pane.Layout': 'DiscussPanel.Panes.Layout',
  'DiscussPanel.Pane.Display': 'DiscussPanel.Panes.Display',
  'Seeds.Bundle.Name': 'SeedsPanel.Bundle.ID',
  'SeedsPanel.Bundle.Name': 'SeedsPanel.Bundle.ID',
  'Seeds.Ribbon.BgColor': 'Seeds.Theme.Color',
  'Discuss.Ribbon.BgColor': 'Discuss.Theme.Color',
  'Harvest.Ribbon.BgColor': 'Harvest.Theme.Color',
};

export function canonicalPanelStatusKey(key: string): string {
  const current = canonicalPanelPrefix(key);
  return LEGACY_STATUS_KEYS[current] ?? current;
}
