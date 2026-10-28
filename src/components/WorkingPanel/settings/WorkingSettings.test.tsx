// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../hooks/useSupportChats', () => ({ useSupportChats: () => ({ chats: [], error: '' }) }));
import { TTApplication } from '../../../views/TTApplication';
import { WorkingSettingArea, type WorkingSettingAreaRef } from '../WorkingSettingArea';
import { broadcastPanelSectionsSetAll } from '../../../hooks/usePanelSectionsSetAll';
import type { WorkingSettingAreaProps } from './types';
import { UNAVAILABLE_ACTIONS } from '../../../views/unavailableActions';
import { TTUIStateManager } from '../../../views/TTUIStateManager';
import { registerFocusedPanelActions } from '../../../views/TTFocusedPanelActions';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const ref = createRef<WorkingSettingAreaRef>();
let props: WorkingSettingAreaProps;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const app = TTApplication.Instance;
  props = {
    activeSettings: 'texteditor', panel: app.WorkingPanel, vault: app.Models.Vault, width: 280,
    onSplitLeft: vi.fn(), onSplitRight: vi.fn(), onSplitAbove: vi.fn(), onSplitBelow: vi.fn(),
    onAddLeft: vi.fn(), onAddRight: vi.fn(), onAddTop: vi.fn(), onAddBottom: vi.fn(),
    onRemoveFocused: vi.fn(), onClearAll: vi.fn(), onCloseNotInBundle: vi.fn(), hasBundle: false,
    onEqualizeWidths: vi.fn(), onEqualizeHeights: vi.fn(), onCreateHtml: vi.fn(),
    onCreateMemo: vi.fn(), onReadMemo: vi.fn(), onSaveMemo: vi.fn(),
    onCreateTable: vi.fn(), onReadTable: vi.fn(), onSaveTable: vi.fn(), onRefresh: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
async function show(activeSettings: WorkingSettingAreaProps['activeSettings']) {
  await act(async () => root.render(<WorkingSettingArea {...props} activeSettings={activeSettings} ref={ref} />));
}

it('keeps section state across settings switches and forwards focus and actions', async () => {
  await show('texteditor');
  ref.current!.focus();
  expect(document.activeElement?.getAttribute('data-tip')).toBe('新規メモファイルを作成');
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(props.onCreateMemo).toHaveBeenCalledTimes(1);
  const memoHeader = [...host.querySelectorAll<HTMLElement>('.working-setting-area__section-header')]
    .find(element => element.textContent === 'メモ')!;
  await act(async () => memoHeader.click());
  expect(host.querySelector('[data-tip="新規メモファイルを作成"]')).toBeNull();

  await show('html');
  ref.current!.focus();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Htmlファイルを新規作成');
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(props.onCreateHtml).toHaveBeenCalledTimes(1);
  await show('texteditor');
  expect(host.querySelector('[data-tip="新規メモファイルを作成"]')).toBeNull();
  await act(async () => broadcastPanelSectionsSetAll('working', true));
  expect(host.querySelector('[data-tip="新規メモファイルを作成"]')).not.toBeNull();
  expect(host.querySelector<HTMLElement>('.working-setting-area')!.style.maxWidth).toBe('280px');
});

it('keeps the table section state while it is hidden by another settings view', async () => {
  await show('datagrid');
  ref.current!.focus();
  expect(document.activeElement?.getAttribute('data-tip')).toBe('新規テーブルファイルを作成');
  await act(async () => broadcastPanelSectionsSetAll('working', false));
  await show('html');
  await show('datagrid');
  expect(host.querySelector('[data-tip="新規テーブルファイルを作成"]')).toBeNull();
  await act(async () => broadcastPanelSectionsSetAll('working', true));
  expect(host.querySelector('[data-tip="新規テーブルファイルを作成"]')).not.toBeNull();
});

it('shows the table display section and runs the action named in each tooltip', async () => {
  const app = TTApplication.Instance;
  TTUIStateManager.instance.init(app);
  registerFocusedPanelActions(app);
  await show('datagrid');
  const header = [...host.querySelectorAll<HTMLElement>('.working-setting-area__section-header')]
    .find(element => element.textContent === '表示');
  expect(header).toBeDefined();
  const click = (actionId: string) => act(async () => host.querySelector<HTMLButtonElement>(`button[data-tip="${actionId}"]`)!.click());
  const cell = app.WorkingPanel.Table.CellContent;

  await click('Table.CellContent.Position:Right');
  expect(cell.Position).toBe('Right');
  expect(host.querySelector('button[data-tip="Table.CellContent.Position:Right"]')!.className).toContain('--active');
  await click('Table.CellContent.Position:Center');
  expect(cell.Position).toBe('Center');
  await click('Table.CellContent.Position:Left');
  expect(cell.Position).toBe('Left');

  const before = cell.Display;
  await click('Table.CellContent.Display:Toggle');
  expect(cell.Display).toBe(before === 'Line' ? 'FitToColumn' : 'Line');
  await click('Table.CellContent.Display:Toggle');
  expect(cell.Display).toBe(before);
});

it('marks rollback controls unavailable without offering a destructive operation', async () => {
  await show('texteditor');
  for (const action of [UNAVAILABLE_ACTIONS.rollbackThink, UNAVAILABLE_ACTIONS.rollbackAll]) {
    const button = host.querySelector<HTMLButtonElement>(`button[title="${action.UnavailableReason}"]`)!;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);
    expect(button.dataset.tip).toContain('未実装');
  }
});
