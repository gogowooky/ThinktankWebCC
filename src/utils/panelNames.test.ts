import { describe, expect, it } from 'vitest';
import { canonicalPanelName, canonicalPanelPrefix, canonicalPanelStatusKey, canonicalPanelStatusList } from './panelNames';

describe('saved panel name compatibility', () => {
  it('maps old owners and settings to their current names', () => {
    expect(canonicalPanelName('Overview')).toBe('Seeds');
    expect(canonicalPanelName('Workout')).toBe('Develop');
    expect(canonicalPanelName('ReThink')).toBe('Harvest');
    expect(canonicalPanelPrefix('WorkoutSettingPanel.Mode.Name')).toBe('DevelopSettingPanel.Mode.Name');
    expect(canonicalPanelPrefix('OverviewPanel.Filter.CursorPos:NextLine')).toBe('SeedsPanel.Filter.CursorPos:NextLine');
    expect(canonicalPanelPrefix('Workout*')).toBe('Develop*');
    expect(canonicalPanelStatusList('OverviewPanel.Mode.Name,WorkoutSettingPanel.Mode.Name'))
      .toBe('SeedsPanel.Mode.Name,DevelopSettingPanel.Mode.Name');
    expect(canonicalPanelStatusKey('OverviewPanel.Mode.IsOpen')).toBe('SeedsPanel.Area.IsOpen');
    expect(canonicalPanelStatusKey('WorkoutPanel.Pane.Count')).toBe('DevelopPanel.Panes.Count');
    expect(canonicalPanelStatusKey('ReThink.Ribbon.BgColor')).toBe('Harvest.Theme.Color');
  });

  it('does not rewrite unrelated or user-authored text', () => {
    expect(canonicalPanelPrefix('TextEditor.WorkoutNotes')).toBe('TextEditor.WorkoutNotes');
    expect(canonicalPanelName('Workout plan')).toBe('Workout plan');
  });
});
