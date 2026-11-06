// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({
  getTotalSize: () => count * 30,
  getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ key: index, index, start: index * 30, size: 30 })),
  measure: () => {},
  measureElement: () => {},
  scrollToIndex: () => {},
}) }));
vi.mock('../Abstract/AbstractView', () => ({ AbstractView: () => null }));
vi.mock('../AiPanels/AiPanels', () => ({ AiViewPanel: () => null, AiChatPanel: () => null }));
import { ThinktankArea } from './ThinktankArea';
import { TTApplication } from '../../views/TTApplication';
import { TTThink } from '../../models/TTThink';
import type { ContentType } from '../../types';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const PROJECT = '2026-10-31-000001';
const CHILD = '2026-10-31-000002';
const MEMO_IN = '2026-10-31-000003';
const OTHER = '2026-10-31-000004';

function add(id: string, contentType: ContentType, content: string) {
  const t = new TTThink(); t.ID = id; t.ContentType = contentType; t.Content = content; t.markSaved();
  TTApplication.Instance.Models.Vault.AddItem(t);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  const vault = TTApplication.Instance.Models.Vault;
  vault.IsLoaded = true;
  vault.LoadError = null;
  add(PROJECT, 'project', `親P\n=\n# 対象\n[project:${CHILD}]\n[memo:${MEMO_IN}]`);
  add(CHILD, 'project', '子P\n=');
  add(MEMO_IN, 'memo', '配下メモ');
  add(OTHER, 'project', '無関係P\n=');
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); TTApplication.resetInstance(); vi.unstubAllGlobals(); });

const rowTexts = () => [...host.querySelectorAll('.thoughts-list__row')].map(r => r.textContent ?? '').join('|');

it('Think一覧でprojectを開くとプロジェクトにロードし、一覧はその配下だけになる', async () => {
  const app = TTApplication.Instance;
  await act(async () => root.render(<ThinktankArea app={app} layoutMode="sipoc" onLayoutModeChange={() => {}} onRefresh={() => {}} />));
  expect(rowTexts()).toContain('親P');
  expect(rowTexts()).toContain('無関係P');

  const row = [...host.querySelectorAll<HTMLElement>('.thoughts-list__row')].find(r => r.textContent?.includes('親P'))!;
  await act(async () => { row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  expect(app.ThinktankPanel.ProjectID).toBe(PROJECT);
  expect(app.ThinktankPanel.ProjectView.ThinkID).toBe(PROJECT);

  // 種別は既定の project だけなので、配下の project（子P）だけが残る
  await vi.waitFor(() => expect(rowTexts()).toContain('子P'));
  expect(rowTexts()).not.toContain('無関係P');
  expect(rowTexts()).not.toContain('親P');

  // 種別に memo を足すと、配下のメモも出る
  await act(async () => host.querySelector<HTMLButtonElement>('.tt-search-bar__type-btn[aria-label="メモ"]')!.click());
  expect(rowTexts()).toContain('配下メモ');

  // ロードを外すと全体に戻る
  await act(async () => app.ThinktankPanel.ClearProject());
  await vi.waitFor(() => expect(rowTexts()).toContain('無関係P'));
});
