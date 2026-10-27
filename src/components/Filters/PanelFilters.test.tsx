// @vitest-environment jsdom
import { act, createRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContentType } from '../../types';
import { loadHistory } from '../../utils/historyUtils';
import { ThinktankSearchBar } from '../ThinktankPanel/ThinktankSearchBar';
import { SeedsSearchBar } from '../SeedsPanel/SeedsSearchBar';
import { ThinktankFilterPanel } from '../ThinktankPanel/ThinktankFilterPanel';
import { SeedsFilterPanel } from '../SeedsPanel/SeedsFilterPanel';
import type { SearchBarRef } from './SearchBar';
import type { FilterPanelRef } from './FilterPanel';

const panels = [
  { name: 'Thinktank', prefix: 'tt-search-bar', SearchBar: ThinktankSearchBar, FilterPanel: ThinktankFilterPanel },
  { name: 'Seeds', prefix: 'seeds-search-bar', SearchBar: SeedsSearchBar, FilterPanel: SeedsFilterPanel },
];
const allTypes: ContentType[] = ['memo', 'project', 'table', 'links', 'chat', 'html'];
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each(panels)('$name keeps search Enter, type selection and the focus ref', async ({ prefix, SearchBar }) => {
  const ref = createRef<SearchBarRef>();
  const onSearch = vi.fn(), onQueryChange = vi.fn(), onToggleType = vi.fn();
  const onSelectAll = vi.fn(), onClearAll = vi.fn();
  async function show(query: string, types: ContentType[]) {
    await act(async () => root.render(<SearchBar ref={ref} searchQuery={query} onSearchQueryChange={onQueryChange}
      onSearch={onSearch} loading={false} visibleTypes={new Set(types)} onToggleType={onToggleType}
      onSelectAllTypes={onSelectAll} onClearAllTypes={onClearAll} />));
  }
  await show(' 検索語 ', ['memo']);
  const input = host.querySelector<HTMLInputElement>('.unified-filter-text-input')!;
  ref.current!.focus();
  expect(document.activeElement).toBe(input);
  expect(host.firstElementChild?.className).toBe(prefix);
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(onSearch).toHaveBeenCalledTimes(1);
  const memo = host.querySelector<HTMLButtonElement>('button[aria-label="メモ"]')!;
  expect(memo.classList.contains(`${prefix}__type-btn--active`)).toBe(true);
  await act(async () => memo.click());
  expect(onToggleType).toHaveBeenCalledWith('memo');
  await act(async () => host.querySelector<HTMLButtonElement>(`.${prefix}__type-all`)!.click());
  expect(onSelectAll).toHaveBeenCalledTimes(1);
  await act(async () => host.querySelector<HTMLButtonElement>('.unified-filter-btn--clear')!.click());
  expect(onQueryChange).toHaveBeenCalledWith('');

  await show(' ', allTypes);
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(onSearch).toHaveBeenCalledTimes(1);
  await act(async () => host.querySelector<HTMLButtonElement>(`.${prefix}__type-all`)!.click());
  expect(onClearAll).toHaveBeenCalledTimes(1);
});

it.each(panels)('$name keeps date conditions, history persistence and the focus ref', async ({ name, FilterPanel }) => {
  const ref = createRef<FilterPanelRef>();
  const onSearch = vi.fn();
  const historyKey = `filter-test-${name}`;
  function Harness() {
    const [text, setText] = useState(' タイトル ');
    const [createdDate, setCreatedDate] = useState('2026-10-13');
    const [createdRange, setCreatedRange] = useState('@7d');
    const [updatedDate, setUpdatedDate] = useState('2026-10-12');
    const [updatedRange, setUpdatedRange] = useState('invalid');
    return <FilterPanel ref={ref} historyKey={historyKey} textValue={text} onTextChange={setText}
      createdDate={createdDate} onCreatedDateChange={setCreatedDate} createdRange={createdRange} onCreatedRangeChange={setCreatedRange}
      updatedDate={updatedDate} onUpdatedDateChange={setUpdatedDate} updatedRange={updatedRange} onUpdatedRangeChange={setUpdatedRange}
      onSearch={onSearch} visibleCount={2} totalCount={3} />;
  }
  await act(async () => root.render(<Harness />));
  const text = host.querySelector<HTMLInputElement>('.unified-filter-text-input')!;
  ref.current!.focus();
  expect(document.activeElement).toBe(text);
  expect(host.querySelector('.unified-filter-count')?.textContent).toBe('2/3');
  const rows = host.querySelectorAll('.unified-filter-row');
  const createdDate = rows[1].querySelector<HTMLInputElement>('input[type="date"]')!;
  expect(createdDate.disabled).toBe(true);
  expect(rows[2].querySelector<HTMLInputElement>('input[type="date"]')!.disabled).toBe(false);
  expect(rows[2].querySelector('.unified-filter-range-input--invalid')).not.toBeNull();
  await act(async () => rows[1].querySelector('button')!.click());
  expect(createdDate.value).toBe('');
  expect(createdDate.disabled).toBe(false);
  expect(rows[1].querySelector<HTMLInputElement>('.unified-filter-range-input')!.value).toBe('');

  await act(async () => { text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(onSearch).toHaveBeenCalledTimes(1);
  expect(loadHistory(historyKey)).toEqual(['タイトル']);
  await act(async () => { host.querySelector('.unified-filter-pulldown-icon')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const historyItem = host.querySelector<HTMLElement>('.filter-history-pulldown__item')!;
  expect(historyItem.textContent).toBe('タイトル');
  await act(async () => historyItem.click());
  expect(text.value).toBe('タイトル');
  expect(host.querySelector('.filter-history-pulldown')).toBeNull();
});
