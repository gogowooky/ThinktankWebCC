import { describe, expect, it } from 'vitest';
import { canonicalPanelName, canonicalPanelPrefix, canonicalPanelStatusKey, canonicalPanelStatusList } from './panelNames';

describe('saved panel name compatibility', () => {
  it('maps old owners and settings to their current names', () => {
    expect(canonicalPanelName('Overview')).toBe('Seeds');
    expect(canonicalPanelName('Workout')).toBe('Discuss');
    expect(canonicalPanelName('Develop')).toBe('Discuss');
    expect(canonicalPanelName('ReThink')).toBe('Harvest');
    expect(canonicalPanelPrefix('WorkoutSettingPanel.Mode.Name')).toBe('DiscussSettingPanel.Mode.Name');
    expect(canonicalPanelPrefix('OverviewPanel.Filter.CursorPos:NextLine')).toBe('SeedsPanel.Filter.CursorPos:NextLine');
    expect(canonicalPanelPrefix('Workout*')).toBe('Discuss*');
    expect(canonicalPanelPrefix('Develop*')).toBe('Discuss*');
    expect(canonicalPanelPrefix('DevelopSettingPanel.Mode.Name')).toBe('DiscussSettingPanel.Mode.Name');
    expect(canonicalPanelStatusKey('Develop.Theme.Color')).toBe('Discuss.Theme.Color');
    expect(canonicalPanelStatusKey('DevelopPanel.Pane.Count')).toBe('DiscussPanel.Panes.Count');
    expect(canonicalPanelStatusList('OverviewPanel.Mode.Name,WorkoutSettingPanel.Mode.Name'))
      .toBe('SeedsPanel.Mode.Name,DiscussSettingPanel.Mode.Name');
    expect(canonicalPanelStatusKey('OverviewPanel.Mode.IsOpen')).toBe('SeedsPanel.Area.IsOpen');
    expect(canonicalPanelStatusKey('WorkoutPanel.Pane.Count')).toBe('DiscussPanel.Panes.Count');
    expect(canonicalPanelStatusKey('ReThink.Ribbon.BgColor')).toBe('Harvest.Theme.Color');
  });

  it('does not rewrite unrelated or user-authored text', () => {
    expect(canonicalPanelPrefix('TextEditor.WorkoutNotes')).toBe('TextEditor.WorkoutNotes');
    expect(canonicalPanelName('Workout plan')).toBe('Workout plan');
  });
});
