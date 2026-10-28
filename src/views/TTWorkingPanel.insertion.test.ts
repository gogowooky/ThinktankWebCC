// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { TTThink } from '../models/TTThink';
import { TTWorkingPanel, collectAreaIds } from './TTWorkingPanel';
import { duplicateWorkingPane } from './insertWorkingPane';

const placements = [
  { method: 'AddLeft', dir: 'left', placement: 'split', direction: 'v', before: true },
  { method: 'AddRight', dir: 'right', placement: 'split', direction: 'v', before: false },
  { method: 'AddAbove', dir: 'up', placement: 'split', direction: 'h', before: true },
  { method: 'AddBelow', dir: 'down', placement: 'split', direction: 'h', before: false },
  { method: 'AddToLeft', dir: 'left', placement: 'add', direction: 'v', before: true },
  { method: 'AddToRight', dir: 'right', placement: 'add', direction: 'v', before: false },
  { method: 'AddToTop', dir: 'up', placement: 'add', direction: 'h', before: true },
  { method: 'AddToBottom', dir: 'down', placement: 'add', direction: 'h', before: false },
] as const;

describe.each(placements)('$method', ({ method, dir, placement, direction, before }) => {
  it('preserves insertion scope, ordering, focus, and creation notifications', () => {
    const panel = new TTWorkingPanel();
    const first = panel.AddFirst('A', 'texteditor', 'first');
    const focused = panel.AddRight('B', 'markdown', 'focused')!;
    const previousLayout = panel.Layout!;
    const notifications: (string | null)[] = [];
    panel.AddOnUpdate('test', () => notifications.push(panel.FocusedAreaId));

    const inserted = panel[method]('C', 'html', 'inserted')!;
    expect(inserted.ResourceID).toBe('C');
    expect(inserted.MediaType).toBe('html');
    expect(inserted.Title).toBe('inserted');
    expect(inserted._parent).toBe(panel);
    expect(inserted.FileHistory).toEqual([{ id: 'C', mediaType: 'html', title: 'inserted' }]);
    expect(panel.Areas).toEqual([first, focused, inserted]);
    expect(panel.FocusedAreaId).toBe(inserted.ID);
    expect(notifications).toEqual([focused.ID, inserted.ID]);

    const layout = panel.Layout!;
    expect(layout.type).toBe('split');
    if (layout.type !== 'split') throw new Error('split expected');
    const target = placement === 'add' ? layout : layout.second;
    expect(target.type).toBe('split');
    if (target.type !== 'split') throw new Error('target split expected');
    expect(target.direction).toBe(direction);
    if (placement === 'add') {
      expect(before ? target.second : target.first).toBe(previousLayout);
      expect(collectAreaIds(layout)).toEqual(before
        ? [inserted.ID, first.ID, focused.ID]
        : [first.ID, focused.ID, inserted.ID]);
    } else {
      expect(layout.direction).toBe('v');
      expect(collectAreaIds(layout)).toEqual(before
        ? [first.ID, inserted.ID, focused.ID]
        : [first.ID, focused.ID, inserted.ID]);
    }
  });

  it('preserves the empty-panel result and the default title', () => {
    const panel = new TTWorkingPanel();
    const updated = vi.fn();
    panel.AddOnUpdate('test', updated);
    const area = panel[method]('A', 'texteditor');
    if (placement === 'split') {
      expect(area).toBeNull();
      expect(panel.Layout).toBeNull();
      expect(panel.Areas).toEqual([]);
      expect(updated).not.toHaveBeenCalled();
    } else {
      expect(area?.Title).toBe('');
      expect(panel.Layout?.type).toBe('leaf');
      expect(collectAreaIds(panel.Layout!)).toEqual([area!.ID]);
      expect(panel.FocusedAreaId).toBe(area!.ID);
      expect(updated).toHaveBeenCalledTimes(2);
    }
  });

  it('duplicates the focused pane through the caller helper without creating a Think', async () => {
    const panel = new TTWorkingPanel();
    const first = panel.AddFirst('A', 'texteditor', 'first');
    const source = panel.AddRight('B', 'markdown', 'source')!;
    const vault = { CreateBlankThink: vi.fn<() => Promise<TTThink>>() };
    await duplicateWorkingPane(panel, vault, dir, placement);
    expect(vault.CreateBlankThink).not.toHaveBeenCalled();
    const inserted = panel.Areas[2];
    expect([inserted.ResourceID, inserted.MediaType, inserted.Title]).toEqual(['B', 'markdown', 'source']);
    expect(panel.FocusedAreaId).toBe(inserted.ID);
    expect(collectAreaIds(panel.Layout!)).toEqual(placement === 'add' && before
      ? [inserted.ID, first.ID, source.ID]
      : before ? [first.ID, inserted.ID, source.ID] : [first.ID, source.ID, inserted.ID]);
  });
});

it('uses the first leaf only for the model API when there is no focused ID', async () => {
  const panel = new TTWorkingPanel();
  const first = panel.AddFirst('A', 'texteditor');
  const second = panel.AddRight('B', 'texteditor')!;
  panel.FocusedAreaId = null;
  const vault = { CreateBlankThink: vi.fn<() => Promise<TTThink>>() };
  await duplicateWorkingPane(panel, vault, 'left', 'split');
  expect(panel.Areas).toHaveLength(2);
  expect(vault.CreateBlankThink).not.toHaveBeenCalled();
  const inserted = panel.AddAbove('C', 'markdown')!;
  expect(collectAreaIds(panel.Layout!)).toEqual([inserted.ID, first.ID, second.ID]);
});

it.each(['add', 'split'] as const)('waits for the first Think before inserting an empty %s pane', async placement => {
  const panel = new TTWorkingPanel();
  const think = new TTThink();
  think.ID = 'new-memo';
  think.Name = '新規メモ';
  let finish!: (value: TTThink) => void;
  const vault = { CreateBlankThink: vi.fn(() => new Promise<TTThink>(resolve => { finish = resolve; })) };
  const pending = duplicateWorkingPane(panel, vault, 'left', placement);
  expect(vault.CreateBlankThink).toHaveBeenCalledWith('memo', '新規メモ');
  expect(panel.Layout).toBeNull();
  finish(think);
  await pending;
  expect(panel.Areas).toHaveLength(1);
  expect(panel.Layout?.type).toBe('leaf');
  expect(panel.Areas[0].ResourceID).toBe('new-memo');
  expect(panel.Areas[0].MediaType).toBe('texteditor');
  expect(panel.FocusedAreaId).toBe(panel.Areas[0].ID);
});

it('leaves the panel empty when initial Think creation fails', async () => {
  const panel = new TTWorkingPanel();
  const vault = { CreateBlankThink: vi.fn().mockRejectedValue(new Error('offline')) };
  await expect(duplicateWorkingPane(panel, vault, 'right', 'add')).rejects.toThrow('offline');
  expect(panel.Layout).toBeNull();
  expect(panel.Areas).toEqual([]);
  expect(panel.FocusedAreaId).toBeNull();
});
