import { describe, expect, it } from 'vitest';
import { canonicalPanelName, canonicalPanelPrefix, canonicalPanelStatusKey, canonicalPanelStatusList } from './panelNames';

describe('saved panel name compatibility', () => {
  it('maps old owners and settings to their current names', () => {
    expect(canonicalPanelName('Overview')).toBe('Seeds');
    expect(canonicalPanelName('Workout')).toBe('Working');
    expect(canonicalPanelName('Develop')).toBe('Working');
    expect(canonicalPanelName('ReThink')).toBe('Harvest');
    expect(canonicalPanelPrefix('WorkoutSettingPanel.Mode.Name')).toBe('WorkingSettingPanel.Mode.Name');
    expect(canonicalPanelPrefix('OverviewPanel.Filter.CursorPos:NextLine')).toBe('SeedsPanel.Filter.CursorPos:NextLine');
    expect(canonicalPanelPrefix('Workout*')).toBe('Working*');
    expect(canonicalPanelPrefix('Develop*')).toBe('Working*');
    expect(canonicalPanelPrefix('DevelopSettingPanel.Mode.Name')).toBe('WorkingSettingPanel.Mode.Name');
    expect(canonicalPanelStatusKey('Develop.Theme.Color')).toBe('Working.Theme.Color');
    expect(canonicalPanelStatusKey('DevelopPanel.Pane.Count')).toBe('WorkingPanel.Panes.Count');
    expect(canonicalPanelStatusList('OverviewPanel.Mode.Name,WorkoutSettingPanel.Mode.Name'))
      .toBe('SeedsPanel.Mode.Name,WorkingSettingPanel.Mode.Name');
    expect(canonicalPanelStatusKey('OverviewPanel.Mode.IsOpen')).toBe('SeedsPanel.Area.IsOpen');
    expect(canonicalPanelStatusKey('WorkoutPanel.Pane.Count')).toBe('WorkingPanel.Panes.Count');
    expect(canonicalPanelStatusKey('ReThink.Ribbon.BgColor')).toBe('Harvest.Theme.Color');
  });

  it('maps Discuss names saved before the Working rename', () => {
    expect(canonicalPanelName('Discuss')).toBe('Working');
    expect(canonicalPanelName('DiscussSetting')).toBe('WorkingSetting');
    expect(canonicalPanelPrefix('DiscussSettingPanel.Mode.Name')).toBe('WorkingSettingPanel.Mode.Name');
    expect(canonicalPanelPrefix('DiscussPanel.Area.Open')).toBe('WorkingPanel.Area.Open');
    expect(canonicalPanelPrefix('Discuss*')).toBe('Working*');
    expect(canonicalPanelStatusKey('Discuss.Theme.Color')).toBe('Working.Theme.Color');
    expect(canonicalPanelStatusKey('Discuss.Ribbon.BgColor')).toBe('Working.Theme.Color');
    expect(canonicalPanelStatusKey('DiscussPanel.Pane.Count')).toBe('WorkingPanel.Panes.Count');
    expect(canonicalPanelStatusKey('DiscussSettingPanel.Mode.IsOpen')).toBe('WorkingSettingPanel.Area.IsOpen');
    expect(canonicalPanelStatusList('DiscussPanel.Panes.Count,SeedsPanel.Mode.Name'))
      .toBe('WorkingPanel.Panes.Count,SeedsPanel.Mode.Name');
  });

  it('does not rewrite unrelated or user-authored text', () => {
    expect(canonicalPanelPrefix('TextEditor.WorkoutNotes')).toBe('TextEditor.WorkoutNotes');
    expect(canonicalPanelName('Workout plan')).toBe('Workout plan');
    expect(canonicalPanelPrefix('TextEditor.DiscussNotes')).toBe('TextEditor.DiscussNotes');
    expect(canonicalPanelPrefix('Discussion.Theme')).toBe('Discussion.Theme');
    expect(canonicalPanelName('Working')).toBe('Working');
  });
});
