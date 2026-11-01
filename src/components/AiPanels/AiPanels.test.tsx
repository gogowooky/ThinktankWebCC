// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
// 表示部は Monaco を読み込むため、何を開いたかだけ分かる差し替えにする
vi.mock('../WorkingPanel/media/TextEditorMedia', () => ({
  TextEditorMedia: ({ think, rawYaml }: { think: { ID: string; Content: string } | null; rawYaml?: boolean }) =>
    <div data-testid="texteditor" data-id={think?.ID} data-raw-yaml={String(!!rawYaml)}>{think?.Content}</div>,
}));
const generate = vi.hoisted(() => vi.fn());
vi.mock('../../services/projectSummary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/projectSummary')>()),
  generateProjectSummary: generate,
}));
import { AiViewPanel, resetSummaryJobs } from './AiPanels';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import { TTApplication } from '../../views/TTApplication';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { StorageManager } from '../../services/storage/StorageManager';
import type { SummaryPanelKey } from '../../services/projectSummary';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
const PROJECT = '2026-10-31-000001';
const AIVIEW = '2026-10-31-000002';

function add(id: string, contentType: TTThink['ContentType'], content: string) {
  const t = new TTThink(); t.ID = id; t.ContentType = contentType; t.Content = content; t.markSaved(); vault.AddItem(t);
  return t;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(StorageManager.instance, 'save').mockResolvedValue(undefined as never);
  generate.mockReset();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  const app = TTApplication.Instance;
  TTUIStateManager.instance.init(app);
  vault = app.Models.Vault;
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); resetSummaryJobs();
  TTApplication.resetInstance(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function show(panelKey: SummaryPanelKey) {
  await act(async () => root.render(<AiViewPanel panelKey={panelKey} />));
}
const ribbonTips = () => [...host.querySelector('.ai-view__ribbon')!.children]
  .map(el => el.getAttribute('aria-label') ?? el.getAttribute('data-tip') ?? el.className);

it.each([
  ['thinktank', '現状要約'], ['seeds', '現状要約'], ['working', '進捗要約'], ['harvest', '実績要約'],
] as const)('%s: 左端に cpu-ai の「%s」、右端に TextEditor の表示形式アイコンだけを置く', async (panelKey, label) => {
  await show(panelKey);
  expect(ribbonTips()).toEqual([label, 'menu-ribbon__spacer', 'テキストエディタ']);
  expect(host.querySelector(`[data-tip="${label}"] .lucide-cpu-ai`)).not.toBeNull();
  // projectファイルがロードされていなければ押せない
  expect(host.querySelector<HTMLButtonElement>(`[data-tip="${label}"]`)!.disabled).toBe(true);
  expect(host.textContent).toContain('projectファイルがロードされていません。');
});

it('ロード中の projectファイルの # AIまとめ の先頭の AIViewファイルを表示する', async () => {
  add(AIVIEW, 'aiview', '計画\n# [2026-10-31] 現状要約\n要約本文');
  add(PROJECT, 'project', `計画\n=\n# AIまとめ\n[aiview:${AIVIEW}],[aiview:2026-10-31-000003]`);
  TTApplication.Instance.ThinktankPanel.OpenProject(PROJECT);
  await show('thinktank');
  expect(host.querySelector('[data-testid="texteditor"]')?.getAttribute('data-id')).toBe(AIVIEW);
  expect(host.querySelector('[data-testid="texteditor"]')?.textContent).toContain('要約本文');

  // Pane の TextEditor アイコンと同じく、Shift+クリックで YAML＋本文（読み取り専用のまま）
  const button = host.querySelector<HTMLButtonElement>('[aria-label="テキストエディタ"]')!;
  expect(button.getAttribute('data-tip')).toContain('読み取り専用、Shift+クリック: YAML込みで表示');
  await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); });
  expect(host.querySelector('[data-testid="texteditor"]')?.getAttribute('data-raw-yaml')).toBe('true');
  await act(async () => { button.click(); });
  expect(host.querySelector('[data-testid="texteditor"]')?.getAttribute('data-raw-yaml')).toBe('false');
});

it('Working / Harvest は Seeds にロードした projectファイルを使う', async () => {
  add(PROJECT, 'project', '計画\n=\n# AIまとめ');
  const app = TTApplication.Instance;
  app.ThinktankPanel.OpenProject(PROJECT);
  app.SeedsPanel.ClearProject();
  await show('working');
  expect(host.textContent).toContain('projectファイルがロードされていません。');

  await act(async () => app.SeedsPanel.OpenProject(PROJECT));
  expect(host.textContent).toContain('進捗要約はまだありません。');
  expect(host.querySelector<HTMLButtonElement>('[data-tip="進捗要約"]')!.disabled).toBe(false);
});

it('ボタンで要約を作り、AIViewファイルを表示する。アプリが追記したときと失敗はメッセージで知らせる', async () => {
  add(PROJECT, 'project', '計画\n=\n# AIまとめ');
  TTApplication.Instance.SeedsPanel.OpenProject(PROJECT);
  generate.mockImplementationOnce(async () => {
    const aiView = add(AIVIEW, 'aiview', '計画\n# [2026-10-31] 実績要約\nできたこと');
    vault.GetThink(PROJECT)!.Content = `計画\n=\n# AIまとめ\n[aiview:${AIVIEW}]`;
    return { aiView, writtenBy: 'ai' };
  });
  await show('harvest');
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="実績要約"]')!.click(); });
  expect(generate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'result', panelKey: 'harvest', projectId: PROJECT }));
  expect(host.querySelector('[data-testid="texteditor"]')?.textContent).toContain('できたこと');
  expect(host.querySelector('.ai-view__status--done')?.textContent).toMatch(/実績要約を AI CLI が書き込みました（\d+秒）。/);

  generate.mockImplementationOnce(async () => ({ aiView: vault.GetThink(AIVIEW), writtenBy: 'app' }));
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="実績要約"]')!.click(); });
  expect(host.querySelector('.ai-view__status--app')?.textContent).toContain('アプリが追記しました');

  generate.mockRejectedValueOnce(new Error('AI CLI が見つかりません'));
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="実績要約"]')!.click(); });
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('実績要約を作成できませんでした: AI CLI が見つかりません');
});

it('作成中はリボンの下に段階と経過秒数を出し、サブパネルを切り替えて戻っても続きを表示する', async () => {
  add(PROJECT, 'project', '計画\n=\n# AIまとめ');
  TTApplication.Instance.ThinktankPanel.OpenProject(PROJECT);
  let finish: (value: unknown) => void = () => {};
  generate.mockImplementationOnce(async (options: { onProgress: (p: unknown) => void }) => {
    options.onProgress({ stage: 'ai', targetCount: 3 });
    return new Promise(resolve => { finish = resolve; });
  });
  await show('thinktank');
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="現状要約"]')!.click(); });
  const running = () => host.querySelector('.ai-view__status--running');
  expect(running()?.textContent).toMatch(/現状要約: AI CLI が対象ファイル 3 件を要約し、AIViewファイルへ書き込んでいます…\d+秒/);
  expect(host.querySelector<HTMLButtonElement>('[data-tip="現状要約"]')!.disabled).toBe(true);

  // サブパネルを切り替えた（アンマウント）後に戻っても、作成中のまま
  await act(async () => root.unmount());
  root = createRoot(host);
  await show('thinktank');
  expect(running()).not.toBeNull();

  await act(async () => { finish({ aiView: add(AIVIEW, 'aiview', '計画\n# [2026-10-31] 現状要約\nできた'), writtenBy: 'ai' }); });
  expect(running()).toBeNull();
  expect(host.querySelector('.ai-view__status--done')).not.toBeNull();
});
