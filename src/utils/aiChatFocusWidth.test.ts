// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAiChatPanelWidth, type AiChatPanel } from './aiChatFocusWidth';
import * as deviceInfo from './deviceInfo';

const APP_WIDTH = 1280;
const CHROME = 43; // 縦タブバー40px + Splitter 3px
const HALF = APP_WIDTH / 2 - CHROME;

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;

/** フックの戻り値を DOM に出すだけの覗き窓 */
function Probe({ panel, width, open }: { panel: AiChatPanel; width: number; open: boolean }) {
  return createElement('output', null, String(useAiChatPanelWidth(panel, width, open)));
}
const shown = () => Number(host.querySelector('output')!.textContent);
function render(panel: AiChatPanel, width: number, open: boolean) {
  act(() => { root.render(createElement(Probe, { panel, width, open })); });
}
/** App.tsx がフォーカス追跡で書く列名を模す。MutationObserver はマイクロタスクで届くので待つ。 */
async function focusColumn(name: string | null) {
  if (name === null) delete document.body.dataset.focusColumn;
  else document.body.dataset.focusColumn = name;
  await act(async () => {});
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(window, 'innerWidth', { value: APP_WIDTH, configurable: true });
  delete document.body.dataset.focusColumn;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => {
  act(() => { root.unmount(); }); host.remove();
  delete document.body.dataset.focusColumn;
  vi.restoreAllMocks();
});

it('親パネルにフォーカスがあり AIChat が開いていれば、アプリ幅の半分まで広げる', async () => {
  render('Thinktank', 280, true);
  expect(shown()).toBe(280);
  await focusColumn('Thinktank');
  expect(shown()).toBe(HALF);
});

it('フォーカスが他の列へ移れば元の幅に戻る', async () => {
  render('Thinktank', 280, true);
  await focusColumn('Thinktank');
  expect(shown()).toBe(HALF);
  await focusColumn('Overview');
  expect(shown()).toBe(280);
});

it('ウィンドウがフォーカスを失って列の指定が消えても元に戻る', async () => {
  render('Thinktank', 280, true);
  await focusColumn('Thinktank');
  await focusColumn(null);
  expect(shown()).toBe(280);
});

it('AIChat が開いていなければ、親パネルにフォーカスがあっても広げない', async () => {
  render('Thinktank', 280, false);
  await focusColumn('Thinktank');
  expect(shown()).toBe(280);
});

it('AIChat を閉じた時点で元の幅に戻る', async () => {
  render('Overview', 280, true);
  await focusColumn('Overview');
  expect(shown()).toBe(HALF);
  render('Overview', 280, false);
  expect(shown()).toBe(280);
});

it('Workout の AIChat は設定パネル列（WorkoutSetting）のフォーカスで広がる', async () => {
  render('Workout', 220, true);
  await focusColumn('WorkoutSetting');
  expect(shown()).toBe(HALF);
});

it('AIChat Pane 側の列（Workout）にフォーカスしても設定パネルは広げない', async () => {
  render('Workout', 220, true);
  await focusColumn('Workout');
  expect(shown()).toBe(220);
});

it('iPhone ではアプリ全幅まで広げる', async () => {
  vi.spyOn(deviceInfo, 'isIPhone').mockReturnValue(true);
  render('Workout', 220, true);
  await focusColumn('WorkoutSetting');
  expect(shown()).toBe(APP_WIDTH - CHROME);
});

it('既に半分より広ければ縮めない（広げる操作なので）', async () => {
  render('ReThink', 900, true);
  await focusColumn('ReThink');
  expect(shown()).toBe(900);
});
