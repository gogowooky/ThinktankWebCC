// @vitest-environment jsdom
// jsdom を使う理由: このモジュールは TTUIStateManager 経由で services/storage/apiClient を
// 読み込み、apiClient がモジュール評価時に `window` を参照する（PROJECT_REVIEW_REPORT.md E-7 の
// テスタビリティ上の課題）。BSP 関数自体は純粋。
import { describe, it, expect } from 'vitest';
import {
  collectAreaIds,
  addToFocused,
  removeLeaf,
  swapLeafs,
  type LayoutNode,
  type LeafNode,
} from './TTWorkoutPanel';

const leaf = (areaId: string): LeafNode => ({ id: `n-${areaId}`, type: 'leaf', areaId });

describe('collectAreaIds', () => {
  it('ツリーを深さ優先で列挙する', () => {
    const tree: LayoutNode = {
      id: 's1',
      type: 'split',
      direction: 'v',
      first: leaf('A'),
      second: { id: 's2', type: 'split', direction: 'h', first: leaf('B'), second: leaf('C') },
    };
    expect(collectAreaIds(tree)).toEqual(['A', 'B', 'C']);
  });
});

describe('addToFocused', () => {
  it('フォーカス中の leaf を split に置き換えて新 leaf を second に足す', () => {
    const tree = leaf('A');
    const next = addToFocused(tree, 'A', 'B', 'v');
    expect(next.type).toBe('split');
    expect(collectAreaIds(next)).toEqual(['A', 'B']);
  });

  it('position=first なら新 leaf を first 側に置く', () => {
    const next = addToFocused(leaf('A'), 'A', 'B', 'h', 'first');
    expect(collectAreaIds(next)).toEqual(['B', 'A']);
  });

  it('フォーカス ID が存在しなければツリーは変化しない（参照等価）', () => {
    const tree = leaf('A');
    expect(addToFocused(tree, 'ZZZ', 'B', 'v')).toBe(tree);
  });
});

describe('removeLeaf', () => {
  it('2 leaf の split から1つ消すと残りの leaf に潰れる', () => {
    const tree = addToFocused(leaf('A'), 'A', 'B', 'v');
    const next = removeLeaf(tree, 'B');
    expect(next).toEqual(leaf('A'));
  });

  it('唯一の leaf を消すと null', () => {
    expect(removeLeaf(leaf('A'), 'A')).toBeNull();
  });

  it('存在しない areaId では変化しない（参照等価）', () => {
    const tree = addToFocused(leaf('A'), 'A', 'B', 'v');
    expect(removeLeaf(tree, 'ZZZ')).toBe(tree);
  });
});

describe('swapLeafs', () => {
  it('2つの leaf の areaId を入れ替える', () => {
    const tree = addToFocused(leaf('A'), 'A', 'B', 'v');
    const swapped = swapLeafs(tree, 'A', 'B');
    expect(collectAreaIds(swapped)).toEqual(['B', 'A']);
  });
});
