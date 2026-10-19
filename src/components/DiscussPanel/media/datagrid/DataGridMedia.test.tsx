// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({
  getTotalSize: () => count * 30,
  getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ key: index, index, start: index * 30, size: 30 })),
  measure: () => {},
  measureElement: () => {},
}) }));
import { TTThink } from '../../../../models/TTThink';
import { TTVault } from '../../../../models/TTVault';
import { DataGridMedia, type DataGridMediaRef } from '../DataGridMedia';
import { parseTableContent } from '../../../../utils/tableFormat';
import { TTApplication } from '../../../../views/TTApplication';
import { TTUIStateManager } from '../../../../views/TTUIStateManager';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('keeps the public focus ref and saves edits to the original table and metadata columns', async () => {
  const think = new TTThink(); think.ID = 'table-id'; think.ContentType = 'table'; think.setContentSilent('Table\n> Name,Value\nold,1');
  const save = vi.fn<(content: string, thinkId?: string) => Promise<void>>(async () => {}), dirty = vi.fn();
  const ref = createRef<DataGridMediaRef>();
  await act(async () => root.render(<DataGridMedia ref={ref} think={think} vault={new TTVault()} onSave={save} onDirtyChange={dirty} />));
  ref.current!.focus();
  expect(document.activeElement).toBe(host.querySelector('.table-grid__filter'));
  await act(async () => host.querySelector<HTMLElement>('.table-grid__data-cell[title="old"]')!.click());
  const input = host.querySelector<HTMLInputElement>('.table-grid__cell-input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'updated');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(save).toHaveBeenCalledTimes(1);
  const saved = save.mock.calls[0];
  expect(saved[1]).toBe('table-id');
  expect(parseTableContent(saved[0], String(think.Metadata.colheader))[0].rows).toEqual([['updated', '1']]);
  expect(dirty).toHaveBeenLastCalledWith(false);
});

it('reflects the Table.CellContent statuses in the cell display', async () => {
  const app = TTApplication.Instance, manager = TTUIStateManager.instance;
  manager.init(app);
  manager.applyProperty('Table.CellContent.Display', 'Line');
  manager.applyProperty('Table.CellContent.Position', 'Left');
  const think = new TTThink(); think.ID = 'table-display'; think.ContentType = 'table'; think.setContentSilent('Table\n> Name\nlong text');
  await act(async () => root.render(<DataGridMedia think={think} vault={new TTVault()} onSave={vi.fn()} onDirtyChange={vi.fn()} />));
  const grid = () => host.querySelector<HTMLElement>('.table-grid')!;
  const row = () => host.querySelector<HTMLElement>('.table-grid__data-row')!;
  expect(grid().className).toContain('table-grid--align-left');
  expect(grid().className).not.toContain('table-grid--wrap');
  expect(row().style.height).toBe('30px');

  await act(async () => manager.applyProperty('Table.CellContent.Position', 'Right'));
  expect(grid().className).toContain('table-grid--align-right');
  await act(async () => manager.applyProperty('Table.CellContent.Display', 'next'));
  expect(app.DiscussPanel.Table.CellContent.Display).toBe('FitToColumn');
  expect(grid().className).toContain('table-grid--wrap');
  expect(row().style.height).toBe('');
});
