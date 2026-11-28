/**
 * workingLayoutRatios.ts
 * WorkingPanel の Pane 分割（BSP ツリー）の幅・高さを均等にする比率の計算。
 */
import type { LayoutNode } from '../views/TTWorkingPanel';

// 幅均等化: v-split ノードに対して、両サブツリーの「幅スロット数」の比率を計算してセット
// 幅スロット数: v-split は加算、h-split は両側同幅なので max
function countWidthSlots(node: LayoutNode): number {
  if (node.type === 'leaf') return 1;
  if (node.direction === 'v') return countWidthSlots(node.first) + countWidthSlots(node.second);
  return Math.max(countWidthSlots(node.first), countWidthSlots(node.second));
}

// 高さ均等化: h-split ノードに対して、両サブツリーの「高さスロット数」の比率を計算してセット
function countHeightSlots(node: LayoutNode): number {
  if (node.type === 'leaf') return 1;
  if (node.direction === 'h') return countHeightSlots(node.first) + countHeightSlots(node.second);
  return Math.max(countHeightSlots(node.first), countHeightSlots(node.second));
}

export function computeEqualWidthRatios(
  node: LayoutNode,
  out: Record<string, number>,
): void {
  if (node.type === 'leaf') return;
  if (node.direction === 'v') {
    const f = countWidthSlots(node.first);
    const s = countWidthSlots(node.second);
    out[node.id] = f / (f + s);
  }
  computeEqualWidthRatios(node.first, out);
  computeEqualWidthRatios(node.second, out);
}

export function computeEqualHeightRatios(
  node: LayoutNode,
  out: Record<string, number>,
): void {
  if (node.type === 'leaf') return;
  if (node.direction === 'h') {
    const f = countHeightSlots(node.first);
    const s = countHeightSlots(node.second);
    out[node.id] = f / (f + s);
  }
  computeEqualHeightRatios(node.first, out);
  computeEqualHeightRatios(node.second, out);
}
