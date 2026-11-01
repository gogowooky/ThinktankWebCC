// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useProjectStatusFilter } from './useProjectStatusFilter';
import { ProjectListFilters } from '../components/ThinktankPanel/ProjectListFilters';
import { SearchBar } from '../components/Filters/SearchBar';
import { TTThink } from '../models/TTThink';
import type { ContentType } from '../types';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

function think(id: string, contentType: ContentType, title: string, body = ''): TTThink {
  const t = new TTThink(); t.ID = id; t.ContentType = contentType; t.Content = `${title}\n=${body}`; t.markSaved(); return t;
}

const THINKS = [
  think('2026-10-30-000001', 'project', '計画A'),
  think('2026-10-30-000002', 'project', '計画B', '\n# 見通し\nビジョン\n# 状態\n完了'),
  think('2026-10-30-000003', 'project', '計画C', '\n# 見通し\nタスク\n# 状態\n進行中'),
];

// Think一覧と同じ組み方：種別が project だけのときに、種別ボタンの下へ状態・見通しを出して絞り込む
function Harness({ types }: { types: ContentType[] }) {
  const visibleTypes = new Set(types);
  const projectOnly = visibleTypes.size === 1 && visibleTypes.has('project');
  const status = useProjectStatusFilter(THINKS, projectOnly);
  return <>
    <SearchBar classPrefix="tt-search-bar" searchQuery="" onSearchQueryChange={() => {}} onSearch={() => {}} loading={false}
      visibleTypes={visibleTypes} onToggleType={() => {}} onSelectAllTypes={() => {}} onClearAllTypes={() => {}}
      typeSubFilters={projectOnly && <ProjectListFilters states={status.states} outlooks={status.outlooks}
        onStatesChange={status.setStates} onOutlooksChange={status.setOutlooks} />} />
    <ul>{status.filtered.map(t => <li key={t.ID}>{t.Name}</li>)}</ul>
  </>;
}
const names = () => [...host.querySelectorAll('li')].map(li => li.textContent);

it('種別が project だけのとき、種別の下に状態・見通しを出して絞り込む（完了・中止は既定で隠す）', async () => {
  await act(async () => root.render(<Harness types={['project']} />));
  const groups = [...host.querySelectorAll('[role="group"]')].map(g => g.getAttribute('aria-label'));
  expect(groups).toEqual(['Projectの状態フィルター', 'Projectの見通しフィルター']);
  // 種別ボタンの行の後ろに並ぶ
  const types = host.querySelector('.tt-search-bar__types')!;
  expect(types.nextElementSibling?.getAttribute('aria-label')).toBe('Projectの状態フィルター');
  expect(names()).toEqual(['計画A', '計画C']);

  const states = host.querySelector('[aria-label="Projectの状態フィルター"]')!;
  await act(async () => states.querySelector<HTMLButtonElement>('[aria-label="完了"]')!.click());
  expect(names()).toEqual(['計画A', '計画B', '計画C']);

  const outlooks = host.querySelector('[aria-label="Projectの見通しフィルター"]')!;
  await act(async () => outlooks.querySelector<HTMLButtonElement>('[aria-label="全見通しをクリア"]')!.click());
  await act(async () => outlooks.querySelector<HTMLButtonElement>('[aria-label="タスク"]')!.click());
  expect(names()).toEqual(['計画C']);
});

it('種別に project 以外も選んでいるときは出さず、絞り込みもしない', async () => {
  await act(async () => root.render(<Harness types={['project', 'memo']} />));
  expect(host.querySelector('[aria-label="Projectの状態フィルター"]')).toBeNull();
  expect(names()).toEqual(['計画A', '計画B', '計画C']);
});
