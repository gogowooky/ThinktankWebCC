// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkingMenuRibbon } from './WorkingMenuRibbon';
import { TTWorkingArea } from '../../views/TTWorkingArea';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

async function mediaTips(contentType: string) {
  const area = new TTWorkingArea();
  await act(async () => root.render(
    <WorkingMenuRibbon area={area} contentType={contentType} isFocused onDragStart={() => {}}
      onMediaTypeChange={() => {}} onClose={() => {}} onResourceDrop={() => {}} />,
  ));
  return [...host.querySelectorAll('.working-menu-ribbon__media-btn')].map(b => b.getAttribute('data-tip')?.split('（')[0]);
}

it('projectファイルの Pane は表示モードのアイコンを TextEditor だけにする', async () => {
  expect(await mediaTips('project')).toEqual(['テキストエディタ']);
  // 他の種別はこれまでどおり
  expect(await mediaTips('memo')).toEqual(['テキストエディタ', 'Markdown']);
  expect(await mediaTips('table')).toEqual(['テキストエディタ', 'テーブル', 'カード']);
});
