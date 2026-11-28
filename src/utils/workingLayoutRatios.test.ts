import { describe, expect, it } from 'vitest';
import type { LayoutNode } from '../views/TTWorkingPanel';
import { computeEqualHeightRatios, computeEqualWidthRatios } from './workingLayoutRatios';

const leaf = (areaId: string): LayoutNode => ({ id: `leaf-${areaId}`, type: 'leaf', areaId });
const split = (id: string, direction: 'v' | 'h', first: LayoutNode, second: LayoutNode): LayoutNode =>
  ({ type: 'split', id, direction, first, second });

describe('workingLayoutRatios', () => {
  // [A | [B | C]]: 左右に3つ並ぶので、外側の境界は 1/3 の位置
  const threeColumns = split('outer', 'v', leaf('A'), split('inner', 'v', leaf('B'), leaf('C')));

  it('幅の均等化は左右（v）の分割を、並ぶ Pane の数の比にする', () => {
    const out: Record<string, number> = {};
    computeEqualWidthRatios(threeColumns, out);
    expect(out.outer).toBeCloseTo(1 / 3);
    expect(out.inner).toBeCloseTo(1 / 2);
  });

  it('上下（h）に重ねた側は1列と数える', () => {
    // [[A / B] | C]: 左は上下2段だが幅は1列ぶんなので、境界は中央
    const node = split('outer', 'v', split('stack', 'h', leaf('A'), leaf('B')), leaf('C'));
    const width: Record<string, number> = {};
    computeEqualWidthRatios(node, width);
    expect(width).toEqual({ outer: 0.5 });

    const height: Record<string, number> = {};
    computeEqualHeightRatios(node, height);
    expect(height).toEqual({ stack: 0.5 });
  });

  it('高さの均等化は上下（h）の分割だけを変え、既存の値は残す', () => {
    const node = split('outer', 'h', leaf('A'), split('inner', 'h', leaf('B'), leaf('C')));
    const out: Record<string, number> = { other: 0.7 };
    computeEqualHeightRatios(node, out);
    expect(out.outer).toBeCloseTo(1 / 3);
    expect(out.inner).toBeCloseTo(1 / 2);
    expect(out.other).toBe(0.7);
  });
});
