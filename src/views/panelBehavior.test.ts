// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./TTUIStateManager', () => ({ TTUIStateManager: { instance: { notifyPropertyChanged: vi.fn() } } }));
import { TTNotifyBase } from '../models/TTNotifyBase';
import { setModelNames } from '../services/aiChatModelStatus';
import { TTUIStateManager } from './TTUIStateManager';
import { TTThinktankPanel } from './TTThinktankPanel';
import { TTSeedsPanel } from './TTSeedsPanel';
import { TTDiscussPanel } from './TTDiscussPanel';
import { TTHarvestPanel } from './TTHarvestPanel';

const names = ['ThinktankPanel', 'SeedsPanel', 'DiscussPanel', 'HarvestPanel'] as const;

function setup() {
  const panels = {
    ThinktankPanel: new TTThinktankPanel(),
    SeedsPanel: new TTSeedsPanel(),
    DiscussPanel: new TTDiscussPanel(),
    HarvestPanel: new TTHarvestPanel(),
  };
  const parent = Object.assign(new TTNotifyBase(), panels);
  const shared = { checkedIds: [] as string[] };
  const events: string[] = [];
  for (const name of names) {
    panels[name]._parent = parent;
    panels[name].SharedState = shared;
    panels[name].AddOnUpdate('test', () => events.push(name));
  }
  parent.AddOnUpdate('test', () => events.push('parent'));
  vi.mocked(TTUIStateManager.instance.notifyPropertyChanged).mockImplementation(key => events.push(key));
  return { panels, shared, events };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe.each(names)('%s shared behavior', owner => {
  it('shares the assigned IDs and preserves sibling, Status, then caller notification order', () => {
    const { panels, shared, events } = setup();
    const panel = panels[owner];
    const ids = ['A', 'B'];
    panel.CheckedThoughtIDs = ids;
    expect(shared.checkedIds).toBe(ids);
    for (const name of names) expect(panels[name].CheckedThoughtIDs).toBe(ids);
    const siblings = names.filter(name => name !== owner).flatMap(name => [name, 'parent']);
    expect(events).toEqual([...siblings, 'Application.CheckedItem.IDs']);

    events.length = 0;
    panel.ToggleCheck(['B', 'C', 'C']);
    expect(shared.checkedIds).toEqual(['A']);
    expect(events).toEqual([...siblings, 'Application.CheckedItem.IDs', owner, 'parent']);
    panel.ToggleCheck(['B', 'B', 'C'], true);
    expect(shared.checkedIds).toEqual(['A', 'B', 'C']);
    panel.ToggleCheck('A', false);
    expect(shared.checkedIds).toEqual(['B', 'C']);
  });

  it('notifies only when open state changes and leaves width and mode alone', () => {
    const { panels, events } = setup();
    const panel = panels[owner];
    const mode = panel.ViewMode;
    panel.AreaWidthMode = 'foredit';
    panel.AreaUserWidth = 321;
    panel.OpenArea();
    expect(events).toEqual([]);
    panel.CloseArea();
    panel.CloseArea();
    panel.ToggleArea();
    expect(panel.IsAreaOpen).toBe(true);
    expect(events).toEqual([owner, 'parent', owner, 'parent']);
    expect(panel.AreaWidthMode).toBe('foredit');
    expect(panel.AreaUserWidth).toBe(321);
    expect(panel.ViewMode).toBe(mode);
  });
});

it('keeps CheckAll copying and Seeds bundle opening behavior', () => {
  const { panels, events } = setup();
  const ids = ['A'];
  panels.ThinktankPanel.CheckAll(ids);
  expect(panels.ThinktankPanel.CheckedThoughtIDs).toEqual(ids);
  expect(panels.ThinktankPanel.CheckedThoughtIDs).not.toBe(ids);
  panels.SeedsPanel.IsAreaOpen = false;
  events.length = 0;
  panels.SeedsPanel.OpenBundle('bundle-A', 'datagrid');
  expect(panels.SeedsPanel.BundleID).toBe('bundle-A');
  expect(panels.SeedsPanel.IsAreaOpen).toBe(true);
  expect(panels.SeedsPanel.ViewMode).toBe('filter');
  expect(panels.HarvestPanel.CheckedThoughtIDs).toEqual([]);
  expect(events).toEqual([
    'ThinktankPanel', 'parent', 'DiscussPanel', 'parent', 'HarvestPanel', 'parent',
    'Application.CheckedItem.IDs', 'SeedsPanel', 'parent', 'SeedsPanel.Project.ID',
  ]);
});

it('keeps provider choices separate, models shared, and selection notifications in the same order', () => {
  setModelNames('Gemini', 'model-before');
  const { panels, events } = setup();
  panels.HarvestPanel.AIChatProviderName = 'Gemini';
  panels.DiscussPanel.SettingAIChatProviderName = 'OpenAI';
  panels.SeedsPanel.SetAIChatModel({ provider: 'gemini', model: 'model-after' });
  expect(events).toEqual([
    ...names.flatMap(name => [name, 'parent']), 'SeedsPanel', 'parent',
  ]);
  expect(panels.SeedsPanel.AIChatProviderName).toBe('Gemini');
  expect(panels.HarvestPanel.AIChatModel).toBe('model-after');
  expect(panels.ThinktankPanel.AIChatProviderName).toBe('Claude');
  expect(panels.DiscussPanel.SettingAIChatProviderName).toBe('OpenAI');

  panels.DiscussPanel.SetSettingAIChatModel({ provider: 'anthropic', model: 'settings-model' });
  expect(panels.DiscussPanel.SettingAIChatProvider).toBe('anthropic');
  expect(panels.DiscussPanel.SettingAIChatModel).toBe('settings-model');
  expect(panels.DiscussPanel.AIChatProviderName).toBe('Claude');
});
