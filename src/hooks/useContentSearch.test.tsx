// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ThinkMeta } from '../services/storage/IStorageBackend';
const mocks = vi.hoisted(() => ({ search: vi.fn(), highlight: vi.fn() }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: { search: mocks.search } } }));
vi.mock('../utils/highlighterKeyword', () => ({ addContentSearchKeywordToHighlighter: mocks.highlight }));
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { useContentSearch } from './useContentSearch';

let root: ReturnType<typeof createRoot>;
let vault: TTVault;
let search: ReturnType<typeof useContentSearch>;
function Probe() { search = useContentSearch(vault, 'ThinktankArea'); return null; }
function meta(thinkid: string): ThinkMeta {
  return { thinkid, category: 'memo', title: `結果 ${thinkid}`, keywords: 'keyword', relatedIds: 'related',
    sizeBytes: 0, isDeleted: false, createdAt: '', updatedAt: '' };
}
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.search.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vault = new TTVault('vault');
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('searches the trimmed query, keeps existing Thinks and builds missing metadata-only results', async () => {
  const existing = new TTThink(); existing.ID = 'existing'; existing.Content = '手元の本文';
  vi.spyOn(vault, 'GetThink').mockImplementation(id => id === existing.ID ? existing : undefined);
  let finish!: (items: ThinkMeta[]) => void;
  mocks.search.mockImplementationOnce(() => new Promise<ThinkMeta[]>(resolve => { finish = resolve; }));
  await act(async () => search.handleSearchQueryChange(' 検索語 '));
  let pending!: Promise<void>;
  await act(async () => { pending = search.handleSearch(); });
  expect(search.searchLoading).toBe(true);
  expect(search.searchSearched).toBe(false);
  expect(mocks.search).toHaveBeenCalledWith('検索語');
  expect(mocks.highlight).toHaveBeenCalledWith('検索語');
  await act(async () => { finish([meta('existing'), meta('missing')]); await pending; });
  expect(search.searchResults[0]).toBe(existing);
  expect(existing.Content).toBe('手元の本文');
  expect(search.searchResults[1]).toMatchObject({ ID: 'missing', VaultID: vault.ID, ContentType: 'memo',
    Keywords: 'keyword', RelatedIDs: 'related', IsMetaOnly: true, Content: '結果 missing' });
  expect(search.searchLoading).toBe(false);
  expect(search.searchSearched).toBe(true);
  await act(async () => search.handleSearchQueryChange('次の語'));
  expect(search.searchSearched).toBe(false);
});

it('ignores an empty query and finishes a failed search with an empty result', async () => {
  await act(async () => search.handleSearchQueryChange(' '));
  await act(async () => search.handleSearch());
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.highlight).not.toHaveBeenCalled();
  const error = new Error('検索失敗');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.search.mockRejectedValueOnce(error);
  await act(async () => {
    search.setSearchResults([new TTThink()]);
    search.handleSearchQueryChange('失敗する検索');
  });
  await act(async () => search.handleSearch());
  expect(log).toHaveBeenCalledWith('[ThinktankArea] search failed:', error);
  expect(search.searchResults).toEqual([]);
  expect(search.searchLoading).toBe(false);
  expect(search.searchSearched).toBe(true);
});

function deferred() {
  let resolve!: (items: ThinkMeta[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ThinkMeta[]>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

it('keeps the newer search when responses finish in reverse order', async () => {
  const first = deferred(), second = deferred();
  mocks.search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await act(async () => search.handleSearchQueryChange('最初'));
  let a!: Promise<void>, b!: Promise<void>;
  await act(async () => { a = search.handleSearch(); });
  await act(async () => search.handleSearchQueryChange('次'));
  await act(async () => { b = search.handleSearch(); });
  await act(async () => { second.resolve([meta('new')]); await b; });
  await act(async () => { first.resolve([meta('old')]); await a; });
  expect(search.searchResults.map(t => t.ID)).toEqual(['new']);
  expect(search.searchLoading).toBe(false);
  expect(search.searchSearched).toBe(true);
});

it('does not finish the active loading state when an older request fails', async () => {
  const first = deferred(), second = deferred();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await act(async () => search.handleSearchQueryChange('同じ語'));
  let a!: Promise<void>, b!: Promise<void>;
  await act(async () => { a = search.handleSearch(); b = search.handleSearch(); });
  await act(async () => { first.reject(new Error('古い失敗')); await a; });
  expect(search.searchLoading).toBe(true);
  expect(search.searchSearched).toBe(false);
  expect(log).not.toHaveBeenCalled();
  await act(async () => { second.resolve([meta('current')]); await b; });
  expect(search.searchResults.map(t => t.ID)).toEqual(['current']);
});

it.each(['入力変更', ''])('invalidates a request immediately when the query becomes %j', async value => {
  const pending = deferred(); mocks.search.mockReturnValueOnce(pending.promise);
  await act(async () => search.handleSearchQueryChange('検索中'));
  let request!: Promise<void>;
  await act(async () => { request = search.handleSearch(); });
  await act(async () => {
    search.setSearchQuery(value);
    pending.resolve([meta('stale')]);
    await request;
  });
  expect(search.searchResults).toEqual([]);
  expect(search.searchLoading).toBe(false);
  expect(search.searchSearched).toBe(false);
});

it('isolates requests when another Vault object with the same ID is displayed', async () => {
  const pending = deferred(); mocks.search.mockReturnValueOnce(pending.promise);
  const oldVault = vault;
  const oldGet = vi.spyOn(oldVault, 'GetThink');
  await act(async () => search.handleSearchQueryChange('検索語'));
  let request!: Promise<void>;
  await act(async () => { request = search.handleSearch(); });
  const oldSearch = search.handleSearch;
  vault = new TTVault(oldVault.ID);
  await act(async () => root.render(<Probe />));
  await act(async () => { await oldSearch(); pending.resolve([meta('old')]); await request; });
  expect(oldGet).not.toHaveBeenCalled();
  expect(search.searchResults).toEqual([]);
  expect(search.searchSearched).toBe(false);
  expect(search.searchLoading).toBe(false);
  expect(mocks.search).toHaveBeenCalledTimes(1);
});

it('ignores completion after the consumer has unmounted', async () => {
  const pending = deferred(); mocks.search.mockReturnValueOnce(pending.promise);
  const get = vi.spyOn(vault, 'GetThink');
  await act(async () => search.handleSearchQueryChange('検索語'));
  let request!: Promise<void>;
  await act(async () => { request = search.handleSearch(); });
  await act(async () => root.render(null));
  await act(async () => { pending.resolve([meta('stale')]); await request; });
  expect(get).not.toHaveBeenCalled();
  await act(async () => root.render(<Probe />));
  expect(search.searchResults).toEqual([]);
  expect(search.searchSearched).toBe(false);
});
