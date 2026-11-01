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
import { SeedsArea } from './SeedsArea';
import { TTApplication } from '../../views/TTApplication';
import { TTThink } from '../../models/TTThink';
import type { ContentType } from '../../types';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const PROJECT = '2026-10-31-000001';
const MEMO_IN = '2026-10-31-000002';
const MEMO_OUT = '2026-10-31-000003';
const CHILD_PROJECT = '2026-10-31-000004';
const NESTED_MEMO = '2026-10-31-000005';
const AI_VIEW = '2026-10-31-000006';

function add(id: string, contentType: ContentType, content: string) {
  const t = new TTThink(); t.ID = id; t.ContentType = contentType; t.Content = content; t.markSaved();
  TTApplication.Instance.Models.Vault.AddItem(t);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  add(PROJECT, 'project', [
    '親P', '=', '', '# 見通し', 'ビジョン', '', '見通しの自由記載', '',
    '# 対象', `[memo:${MEMO_IN}]`, `[project:${CHILD_PROJECT}]`, '', '注意：ここは自由記載', '',
    '# 条件', 'AI種別: Claude', '', '# AIまとめ', `[aiview:${AI_VIEW}]`,
  ].join('\n'));
  add(MEMO_IN, 'memo', '配下メモ');
  add(MEMO_OUT, 'memo', '無関係メモ');
  add(CHILD_PROJECT, 'project', `子P\n=\n# 対象\n[memo:${NESTED_MEMO}]`);
  add(NESTED_MEMO, 'memo', '子Projectの対象');
  add(AI_VIEW, 'aiview', 'AIまとめ');
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); TTApplication.resetInstance(); vi.unstubAllGlobals(); });

const rowTexts = () => [...host.querySelectorAll('.thoughts-list__row')].map(r => r.textContent ?? '').join('|');

it('projectが設定されていないときは全ファイルを出し、設定するとその配下だけ、解除すると全ファイルに戻る', async () => {
  const app = TTApplication.Instance;
  await act(async () => root.render(<SeedsArea app={app} showSettings={false} />));
  expect(host.textContent).not.toContain('Project をドロップして選択してください');
  expect(rowTexts()).toContain('親P');
  expect(rowTexts()).toContain('配下メモ');
  expect(rowTexts()).toContain('無関係メモ');

  await act(async () => app.SeedsPanel.OpenProject(PROJECT, 'datagrid'));
  await vi.waitFor(() => expect(rowTexts()).not.toContain('無関係メモ'));
  expect(rowTexts()).toContain('配下メモ');
  expect(rowTexts()).toContain('子P');
  expect(rowTexts()).not.toContain('子Projectの対象');
  expect(rowTexts()).not.toContain('AIまとめ');
  expect(rowTexts()).not.toContain('親P');

  await act(async () => app.SeedsPanel.ClearProject());
  await vi.waitFor(() => expect(rowTexts()).toContain('無関係メモ'));
});
