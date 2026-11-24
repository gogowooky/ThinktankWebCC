import { describe, expect, it } from 'vitest';
import { childProjectIds, cursorRowIndex, flattenThinkTree, selectTreeRoots } from './thinkTree';

const project = (ID: string, targets: string[]) => ({
  ID,
  ContentType: 'project',
  Content: ['タイトル', '# 対象', ...targets.map(id => `[project:${id}]`)].join('\n'),
});

describe('childProjectIds', () => {
  const P1 = '2026-01-01-000001';
  const P2 = '2026-01-01-000002';
  const P3 = '2026-01-01-000003';
  const M1 = '2026-01-01-000009';
  const isProject = (id: string) => id !== M1;

  it('本文が含む Project だけを記載順・重複なしで返す（自分自身は除く）', () => {
    const p = { ID: P1, ContentType: 'project', Content: ['P1', '# 対象', `[project:${P3}]`, `[memo:${M1}]`, `[project:${P2}]`, `[project:${P3}]`, `[project:${P1}]`].join('\n') };
    expect(childProjectIds(p, isProject)).toEqual([P3, P2]);
  });

  it('# 対象 が * の Project は子なし', () => {
    const p = { ID: P1, ContentType: 'project', Content: ['P1', '# 対象', '*'].join('\n') };
    expect(childProjectIds(p, () => true)).toEqual([]);
  });

  it('Project 以外は子なし', () => {
    expect(childProjectIds({ ...project(M1, [P2]), ContentType: 'memo' }, isProject)).toEqual([]);
  });
});

describe('flattenThinkTree', () => {
  const t = (ID: string) => ({ ID });
  const children: Record<string, string[]> = { A: ['B'], B: ['C', 'A'], C: [], D: [] };
  const childrenOf = (id: string) => (children[id] ?? []).map(t);

  it('子を字下げして展開し、祖先と同じものは子にしない', () => {
    const tree = flattenThinkTree([t('A'), t('D')], childrenOf, new Set());
    expect(tree.thinks.map(x => x.ID)).toEqual(['A', 'B', 'C', 'D']);
    expect(tree.rows).toEqual([
      { key: 'A', depth: 0, hasChildren: true, expanded: true },
      { key: 'A/B', depth: 1, hasChildren: true, expanded: true },
      { key: 'A/B/C', depth: 2, hasChildren: false, expanded: false },
      { key: 'D', depth: 0, hasChildren: false, expanded: false },
    ]);
  });

  it('閉じた行の子は出さない', () => {
    const tree = flattenThinkTree([t('A'), t('B')], childrenOf, new Set(['A']));
    expect(tree.rows.map(r => r.key)).toEqual(['A', 'B', 'B/C', 'B/A']);
  });
});

describe('selectTreeRoots', () => {
  const item = (ID: string, parentProjectid?: string) => ({
    ID,
    Metadata: parentProjectid ? { parentProjectid } : {},
  });

  it('parentProjectid を持ち親が一覧内で展開される project はルートから省く（3階層含む）', () => {
    const A = item('A');
    const B = item('B', 'A');
    const C = item('C', 'B');
    const D = item('D');
    const map: Record<string, typeof A[]> = { A: [B], B: [C], C: [], D: [] };
    const childrenOf = (id: string) => map[id] ?? [];

    const roots = selectTreeRoots([A, B, C, D], childrenOf);
    expect(roots.map(x => x.ID)).toEqual(['A', 'D']);

    const tree = flattenThinkTree(roots, childrenOf, new Set());
    expect(tree.rows.map(r => `${r.key}@${r.depth}`)).toEqual(['A@0', 'A/B@1', 'A/B/C@2', 'D@0']);
  });

  it('parentProjectid の親が一覧にいない場合や親の子として展開されない場合はルートに残す', () => {
    const B = item('B', 'A');
    const C = item('C', 'B');
    const E = item('E'); // 例: # 対象 = * で子なし
    const F = item('F', 'E');
    const map: Record<string, typeof B[]> = { B: [C], C: [], E: [], F: [] };
    const childrenOf = (id: string) => map[id] ?? [];

    const roots = selectTreeRoots([B, C, E, F], childrenOf);
    expect(roots.map(x => x.ID)).toEqual(['B', 'E', 'F']);
  });

  it('循環参照で全件がルートから落ちる場合も到達不能な項目を補完して消さない', () => {
    const A = item('A', 'B');
    const B = item('B', 'A');
    const map: Record<string, typeof A[]> = { A: [B], B: [A] };
    const childrenOf = (id: string) => map[id] ?? [];

    const roots = selectTreeRoots([A, B], childrenOf);
    expect(roots.map(x => x.ID)).toEqual(['A']);
    const tree = flattenThinkTree(roots, childrenOf, new Set());
    expect(tree.rows.map(r => `${r.key}@${r.depth}`)).toEqual(['A@0', 'A/B@1']);
  });
});

describe('cursorRowIndex', () => {
  const list = [{ ID: 'A' }, { ID: 'B' }, { ID: 'A' }];

  it('行のヒントがその ID の行なら優先し、違えば最初の行', () => {
    expect(cursorRowIndex(list, 'A', 2)).toBe(2);
    expect(cursorRowIndex(list, 'A', 1)).toBe(0);
    expect(cursorRowIndex(list, 'A')).toBe(0);
    expect(cursorRowIndex(list, '', 0)).toBe(-1);
  });
});
