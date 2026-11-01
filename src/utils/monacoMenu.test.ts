// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { showMonacoMenu, type MenuNode } from './monacoMenu';

// jsdom には scrollIntoView が無い
beforeEach(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => { document.body.innerHTML = ''; });

const NODES: MenuNode[] = [
  { key: 'A', label: 'りんご', value: 'apple' },
  { key: 'B', label: '果物', children: [
    { key: 'C', label: 'みかん', value: 'orange' },
    { key: 'D', label: 'ぶどう', value: 'grape' },
  ] },
];

const panels = () => [...document.querySelectorAll<HTMLElement>('.tt-menu-panel')];
const rows = (panelIdx: number) => [...panels()[panelIdx].querySelectorAll<HTMLElement>('.tt-menu-row')];
const hover = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseenter'));

it('マウスを載せても行を作り直さず、そのままクリックで葉を選べる', async () => {
  const result = showMonacoMenu({ title: 'メニュー', nodes: NODES });
  const apple = rows(0)[0];
  hover(apple);
  // 作り直すと、クリックの mousedown と mouseup が別の要素になり click が起きない
  expect(apple.isConnected).toBe(true);
  expect(apple.classList.contains('is-selected')).toBe(true);
  apple.click();
  await expect(result).resolves.toBe('apple');
  expect(panels()).toHaveLength(0);
});

it('サブメニューの葉も、マウスを載せてからクリックで選べる', async () => {
  const result = showMonacoMenu({ title: 'メニュー', nodes: NODES });
  const fruit = rows(0)[1];
  hover(fruit);
  expect(panels()).toHaveLength(2);
  const submenu = panels()[1];
  // 同じ枝に載せ直してもサブメニューを作り直さない
  hover(fruit);
  expect(panels()[1]).toBe(submenu);

  const grape = rows(1)[1];
  hover(grape);
  expect(grape.isConnected).toBe(true);
  expect(rows(1).map(r => r.classList.contains('is-selected'))).toEqual([false, true]);
  // サブメニューに入っても、親メニューは閉じない
  expect(panels()).toHaveLength(2);
  grape.click();
  await expect(result).resolves.toBe('grape');
});

it('別の行に載せ替えると、開いていたサブメニューを閉じて強調を移す', async () => {
  const result = showMonacoMenu({ title: 'メニュー', nodes: NODES });
  hover(rows(0)[1]);
  expect(panels()).toHaveLength(2);
  hover(rows(0)[0]);
  expect(panels()).toHaveLength(1);
  expect(rows(0).map(r => r.classList.contains('is-selected'))).toEqual([true, false]);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await expect(result).resolves.toBeNull();
});

it('キーボードでの移動と決定も従来どおり', async () => {
  const result = showMonacoMenu({ title: 'メニュー', nodes: NODES });
  const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  key('ArrowDown');
  expect(rows(0).map(r => r.classList.contains('is-selected'))).toEqual([false, true]);
  key('ArrowRight');
  key('ArrowDown');
  key('Enter');
  await expect(result).resolves.toBe('grape');
});
