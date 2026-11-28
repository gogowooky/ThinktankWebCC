// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({
  getTotalSize: () => count * 30,
  getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ key: index, index, start: index * 30, size: 30 })),
  measure: () => {},
  measureElement: () => {},
  scrollToIndex: () => {},
}) }));
vi.mock('../Abstract/AbstractView', () => ({ AbstractView: () => null }));
vi.mock('../AiPanels/AiPanels', () => ({ AiViewPanel: () => null, AiChatPanel: () => null }));
vi.mock('../SeedsPanel/SeedsTabBar', () => ({ SeedsTabBar: () => null }));
import { ThinktankArea } from '../ThinktankPanel/ThinktankArea';
import { ThinktankChatMemoPicker } from '../ThinktankPanel/ThinktankChatMemoPicker';
import { DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import { DEFAULT_FILTER_VISIBILITY } from '../ThinktankPanel/FilterSelectDialog';
import { SeedsPanel } from '../SeedsPanel/SeedsPanel';
import { StorageManager } from '../../services/storage/StorageManager';
import type { ThinkMeta } from '../../services/storage/IStorageBackend';
import { TTApplication } from '../../views/TTApplication';
import { TTThink } from '../../models/TTThink';
import type { ContentType } from '../../types';
import { loadHistory } from '../../utils/historyUtils';
import { toLocalDate } from '../../utils/localDateTime';
import { THINK_DRAG_TYPE, endThinkDrag, thinkDropValue, type ThinkDropField } from '../../utils/thinkDrag';

const PROJECT = '2026-10-31-000001';
const MEMO = '2026-10-20-102734';
const OTHER = '2026-09-01-000000';
// 日本時間では UTC の翌日になる時刻。一覧の表示と同じローカルの日付を入れる
const MEMO_UPDATED = '2026-11-01T16:30:00.000Z';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;

function add(id: string, contentType: ContentType, content: string, updatedAt = '2026-09-02T03:00:00.000Z') {
  const t = new TTThink();
  t.ID = id; t.ContentType = contentType; t.Content = content; t.UpdatedAt = updatedAt; t.markSaved();
  TTApplication.Instance.Models.Vault.AddItem(t);
  return t;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const vault = TTApplication.Instance.Models.Vault;
  vault.IsLoaded = true;
  vault.LoadError = null;
  add(PROJECT, 'project', '親P\n=\n# 対象\n');
  add(MEMO, 'memo', 'ドラッグ対象', MEMO_UPDATED);
  add(OTHER, 'memo', '別のメモ');
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); endThinkDrag(); TTApplication.resetInstance();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

class FakeDataTransfer {
  effectAllowed = 'uninitialized';
  dropEffect = 'none';
  private readonly data = new Map<string, string>();
  get types() { return [...this.data.keys()]; }
  setData(type: string, value: string) { this.data.set(type, value); }
  getData(type: string) { return this.data.get(type) ?? ''; }
}

async function fire(el: Element, type: string, dataTransfer: FakeDataTransfer, relatedTarget: Element | null = null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { dataTransfer: { value: dataTransfer }, relatedTarget: { value: relatedTarget } });
  await act(async () => { el.dispatchEvent(event); });
  return event;
}

const area = (name: 'thinktank' | 'seeds') => host.querySelector(`.${name}-area`)!;
const rowOf = (scope: Element, text: string) =>
  [...scope.querySelectorAll('.thoughts-list__row')].find(r => r.textContent?.includes(text))!;
const rowTexts = (scope: Element) => [...scope.querySelectorAll('.thoughts-list__row')].map(r => r.textContent).join('|');
const fieldOf = (scope: Element, field: ThinkDropField) => scope.querySelector(`[data-think-drop-field="${field}"]`)!;
const valueOf = (scope: Element, field: ThinkDropField) => fieldOf(scope, field).querySelector('input')!.value;
const ghosts = () => [...host.querySelectorAll('.unified-filter-drop-ghost')].map(g => g.textContent);

async function startDrag(scope: Element, text: string) {
  const dt = new FakeDataTransfer();
  await fire(rowOf(scope, text), 'dragstart', dt);
  return dt;
}

async function mountBoth() {
  const app = TTApplication.Instance;
  app.SeedsPanel.SetViewMode('filter');
  app.SeedsPanel.OpenArea();
  await act(async () => root.render(<>
    <ThinktankArea app={app} layoutMode="simple" onLayoutModeChange={() => {}} onRefresh={() => {}} />
    <SeedsPanel app={app} width={300} onResize={() => {}} />
  </>));
  return app;
}

const EXPECTED: [ThinkDropField, string][] = [
  ['title', 'ドラッグ対象'],
  ['createdDate', '2026-10-20'],
  ['updatedDate', toLocalDate(MEMO_UPDATED)],
  ['content', MEMO],
];
const ROUTES = [
  ['thinktank', 'thinktank'], ['seeds', 'seeds'],
  ['thinktank', 'seeds'], ['seeds', 'thinktank'],
] as const;
const CASES = ROUTES.flatMap(([from, to]) => EXPECTED.map(([field, value]) => ({ from, to, field, value })));

it.each(CASES)('$from の行を $to の $field 欄へ落とすとゴーストの値が入り、絞り込まれる', async ({ from, to, field, value }) => {
  const found: ThinkMeta[] = [{ thinkid: MEMO, category: 'memo', title: 'ドラッグ対象', updatedAt: MEMO_UPDATED } as ThinkMeta];
  const search = vi.spyOn(StorageManager.instance, 'search').mockResolvedValue(found);
  const app = await mountBoth();
  const openProject = vi.spyOn(app.SeedsPanel, 'OpenProject');
  expect(rowTexts(area(to))).toContain('別のメモ');

  const dt = await startDrag(area(from), 'ドラッグ対象');
  expect(dt.getData(THINK_DRAG_TYPE)).toBe(MEMO);
  const target = fieldOf(area(to), field);
  const over = await fire(target.querySelector('input')!, 'dragover', dt);
  expect(over.defaultPrevented).toBe(true);
  expect(dt.dropEffect).toBe('copy');
  expect(ghosts()).toEqual([value]);
  expect(target.querySelector('.unified-filter-drop-ghost')).not.toBeNull();
  // ゴーストの段階では入力値を変えない
  expect(valueOf(area(to), field)).toBe('');

  await fire(target.querySelector('input')!, 'drop', dt);
  expect(ghosts()).toEqual([]);
  expect(valueOf(area(to), field)).toBe(value);
  await vi.waitFor(() => expect(rowTexts(area(to))).not.toContain('別のメモ'));
  expect(rowTexts(area(to))).toContain('ドラッグ対象');
  expect(openProject).not.toHaveBeenCalled();

  const historyKey = to === 'seeds' ? 'seeds-filter' : 'tt-filter';
  expect(loadHistory(historyKey)).toEqual(field === 'title' ? [value] : []);
  expect(search.mock.calls).toEqual(field === 'content' ? [[MEMO]] : []);
});

it('欄を移る・離れる・ドラッグを中止するとゴーストが消え、値は入らない', async () => {
  await mountBoth();
  const tt = area('thinktank');
  const dt = await startDrag(tt, 'ドラッグ対象');
  const title = fieldOf(tt, 'title'), created = fieldOf(tt, 'createdDate');

  await fire(title, 'dragover', dt);
  expect(ghosts()).toEqual(['ドラッグ対象']);
  // 同じ欄の中の移動では消さない
  await fire(title, 'dragleave', dt, title.querySelector('input'));
  expect(ghosts()).toEqual(['ドラッグ対象']);
  await fire(title, 'dragleave', dt, created);
  expect(ghosts()).toEqual([]);

  await fire(created, 'dragover', dt);
  expect(ghosts()).toEqual(['2026-10-20']);
  await fire(rowOf(tt, 'ドラッグ対象'), 'dragend', dt);
  await vi.waitFor(() => expect(ghosts()).toEqual([]));
  expect([valueOf(tt, 'title'), valueOf(tt, 'createdDate')]).toEqual(['', '']);
});

it('dragend が届かなくても、D&D 後の最初の mousemove でゴーストが消える', async () => {
  await mountBoth();
  const dt = await startDrag(area('thinktank'), 'ドラッグ対象');
  await fire(fieldOf(area('seeds'), 'content'), 'dragover', dt);
  expect(ghosts()).toEqual([MEMO]);
  await act(async () => { document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); });
  expect(ghosts()).toEqual([]);
});

it('Think 以外（文字列）の D&D は input の既定動作に任せる', async () => {
  await mountBoth();
  const dt = new FakeDataTransfer();
  dt.setData('text/plain', '文字列');
  for (const [field] of EXPECTED) {
    const input = fieldOf(area('thinktank'), field).querySelector('input')!;
    expect((await fire(input, 'dragover', dt)).defaultPrevented).toBe(false);
    expect((await fire(input, 'drop', dt)).defaultPrevented).toBe(false);
  }
  expect(ghosts()).toEqual([]);
});

it('SeedsPanel の欄の上ではパネル全体のゴーストを消し、欄の外への project の Drop は従来どおり開く', async () => {
  const app = await mountBoth();
  const openProject = vi.spyOn(app.SeedsPanel, 'OpenProject');
  const panel = host.querySelector('.seeds-panel')!;
  const isHighlighted = () => panel.classList.contains('seeds-panel--drag-over');
  const dt = await startDrag(area('seeds'), '親P');
  const body = host.querySelector('.seeds-area__body')!;

  await fire(body, 'dragover', dt);
  expect(isHighlighted()).toBe(true);
  await fire(fieldOf(area('seeds'), 'title'), 'dragover', dt);
  expect(isHighlighted()).toBe(false);
  await fire(fieldOf(area('seeds'), 'title'), 'drop', dt);
  expect(openProject).not.toHaveBeenCalled();

  const again = await startDrag(area('seeds'), '親P');
  await fire(body, 'dragover', again);
  await fire(body, 'drop', again);
  expect(openProject).toHaveBeenCalledWith(PROJECT, 'datagrid');
  expect(isHighlighted()).toBe(false);
});

it('「@N」の範囲は Drop した日付が効くように消し、それ以外の範囲は残して日付を置き換える', async () => {
  await mountBoth();
  const tt = area('thinktank');
  const created = fieldOf(tt, 'createdDate');
  const [date, range] = [...created.querySelectorAll('input')];
  const setRange = async (value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, value);
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await setRange('@7d');
  expect(date.disabled).toBe(true);
  const dt = await startDrag(area('seeds'), 'ドラッグ対象');
  await fire(created, 'drop', dt);
  expect([date.value, range.value, date.disabled]).toEqual(['2026-10-20', '', false]);

  await setRange('+3d');
  const other = await startDrag(area('seeds'), '別のメモ');
  await fire(created, 'drop', other);
  expect([date.value, range.value]).toEqual(['2026-09-01', '+3d']);
});

it('同じ ID をもう一度コンテンツ欄へ落としても検索し直す', async () => {
  const search = vi.spyOn(StorageManager.instance, 'search').mockResolvedValue([]);
  await mountBoth();
  for (let i = 0; i < 2; i++) {
    const dt = await startDrag(area('seeds'), 'ドラッグ対象');
    await fire(fieldOf(area('thinktank'), 'content'), 'drop', dt);
  }
  expect(search.mock.calls).toEqual([[MEMO], [MEMO]]);
});

it('チェックした複数の行をドラッグしても、掴んだ行の値だけが入る', async () => {
  const app = await mountBoth();
  await act(async () => app.ThinktankPanel.CheckAll([MEMO, OTHER]));
  const dt = await startDrag(area('thinktank'), 'ドラッグ対象');
  await fire(fieldOf(area('thinktank'), 'title'), 'drop', dt);
  expect(valueOf(area('thinktank'), 'title')).toBe('ドラッグ対象');
});

it('chat 選択欄の検索条件でも同じ値が入る', async () => {
  const chat = add('2026-10-25-120000', 'chat', '相談\n本文 2026-10-25-120000');
  await act(async () => root.render(
    <ThinktankChatMemoPicker thinks={[chat]} vault={TTApplication.Instance.Models.Vault} columns={DEFAULT_COLUMNS}
      sort={DEFAULT_SORT} filterVisibility={DEFAULT_FILTER_VISIBILITY} selectedId={chat.ID} onSelect={() => {}}
      checkedIds={[]} onToggleCheck={() => {}} />));
  const dt = await startDrag(host, '相談');
  await fire(fieldOf(host, 'content'), 'drop', dt);
  expect(valueOf(host, 'content')).toBe(chat.ID);
});

it('日付にならない ID・タイトルの無い Think は、その欄の条件にしない', () => {
  const think = { id: 'legacy-id', title: ' ', updatedAt: '' };
  expect(thinkDropValue('createdDate', think)).toBe('');
  expect(thinkDropValue('updatedDate', think)).toBe('');
  expect(thinkDropValue('title', think)).toBe('');
  expect(thinkDropValue('content', think)).toBe('legacy-id');
});
