// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../hooks/useSupportChats', () => ({ useSupportChats: () => ({ chats: [], error: '' }) }));
import { TTApplication } from '../../../views/TTApplication';
import { DiscussSettingArea, type DiscussSettingAreaRef } from '../DiscussSettingArea';
import { broadcastPanelSectionsSetAll } from '../../../hooks/usePanelSectionsSetAll';
import type { DiscussSettingAreaProps } from './types';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const ref = createRef<DiscussSettingAreaRef>();
let props: DiscussSettingAreaProps;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const app = TTApplication.Instance;
  props = {
    activeSettings: 'texteditor', panel: app.DiscussPanel, vault: app.Models.Vault, width: 280,
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
async function show(activeSettings: DiscussSettingAreaProps['activeSettings']) {
  await act(async () => root.render(<DiscussSettingArea {...props} activeSettings={activeSettings} ref={ref} />));
}

it('keeps section state across settings switches and forwards focus and actions', async () => {
  await show('texteditor');
  ref.current!.focus();
  expect(document.activeElement?.getAttribute('data-tip')).toBe('新規メモファイルを作成');
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(props.onCreateMemo).toHaveBeenCalledTimes(1);
  const memoHeader = [...host.querySelectorAll<HTMLElement>('.discuss-setting-area__section-header')]
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
  await act(async () => broadcastPanelSectionsSetAll('discuss', true));
  expect(host.querySelector('[data-tip="新規メモファイルを作成"]')).not.toBeNull();
  expect(host.querySelector<HTMLElement>('.discuss-setting-area')!.style.maxWidth).toBe('280px');
});

it('keeps the table section state while it is hidden by another settings view', async () => {
  await show('datagrid');
  ref.current!.focus();
  expect(document.activeElement?.getAttribute('data-tip')).toBe('新規テーブルファイルを作成');
  await act(async () => broadcastPanelSectionsSetAll('discuss', false));
  await show('html');
  await show('datagrid');
  expect(host.querySelector('[data-tip="新規テーブルファイルを作成"]')).toBeNull();
  await act(async () => broadcastPanelSectionsSetAll('discuss', true));
  expect(host.querySelector('[data-tip="新規テーブルファイルを作成"]')).not.toBeNull();
});
