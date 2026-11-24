/**
 * thinkTree.ts
 * Think一覧の Tree 表示（Project の下に、それが含む Project を字下げして並べる）。
 *
 * 一覧は仮想スクロールで行の高さが固定なので、Tree は「開いている分だけ1列に展開した行」として持つ。
 * 同じ Project が複数の親の下や最上位に出ることがあるため、行は ID ではなく経路（key）で区別する。
 */

import { PARENT_PROJECT_ID_KEY, parseProject, targetsAllThinks } from './thinkFormat';

interface ProjectLike {
  ID: string;
  ContentType: string;
  Content: string;
}

export interface TreeRootCandidate {
  ID: string;
  Metadata?: Record<string, unknown>;
}

export interface ThinkTreeRow {
  /** 経路（祖先の ID を含む）。同じ Think が複数の場所に出ても行ごとに一意 */
  key: string;
  /** 最上位が 0 */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

export interface FlatThinkTree<T> {
  thinks: T[];
  rows: ThinkTreeRow[];
}

/**
 * Project が本文で含んでいる Project の ID（記載順・重複なし）。
 * 「# 対象 = *」（全ファイル対象）は全 Project が子になり Tree の意味を失うので子なしとする。
 */
export function childProjectIds(project: ProjectLike, isProject: (id: string) => boolean): string[] {
  if (project.ContentType !== 'project' || targetsAllThinks(project.Content)) return [];
  const ids: string[] = [];
  for (const id of parseProject(project.Content).ids) {
    if (id !== project.ID && !ids.includes(id) && isProject(id)) ids.push(id);
  }
  return ids;
}

/**
 * Tree 表示の最上位（ルート）に並べる Think を選ぶ。
 * Metadata.parentProjectid が設定されていて、その親が一覧内にあり実際に子として展開されるものは
 * 親の下に表示されるため最上位から省く。
 * 親が一覧にいない場合（親をロード中・検索中・親が状態フィルターで非表示等）や循環参照で
 * どこからも辿れなくなる場合は最上位に残す。
 */
export function selectTreeRoots<T extends TreeRootCandidate>(
  items: readonly T[],
  childrenOf: (id: string) => readonly T[],
): T[] {
  const byId = new Set(items.map(t => t.ID));
  const hasVisibleParent = (item: T): boolean => {
    const raw = item.Metadata?.[PARENT_PROJECT_ID_KEY];
    const parentId = typeof raw === 'string' ? raw.trim() : '';
    if (!parentId || parentId === item.ID || !byId.has(parentId)) return false;
    return childrenOf(parentId).some(child => child.ID === item.ID);
  };

  const roots = items.filter(item => !hasVisibleParent(item));

  // 循環参照（A の親が B、B の親が A）などでどのルートからも到達できない項目が消えないよう補完する
  const reachable = new Set<string>();
  const mark = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const child of childrenOf(id)) mark(child.ID);
  };
  for (const root of roots) mark(root.ID);
  for (const item of items) {
    if (!reachable.has(item.ID)) {
      roots.push(item);
      mark(item.ID);
    }
  }
  return roots;
}

/**
 * 最上位の行の下に子を再帰的に展開する。collapsed に key がある行の子は出さない。
 * 祖先と同じ Think は子にしない（Project 同士が互いを含む循環で無限に展開しないように）。
 */
export function flattenThinkTree<T extends { ID: string }>(
  tops: T[],
  childrenOf: (id: string) => T[],
  collapsed: ReadonlySet<string>,
): FlatThinkTree<T> {
  const thinks: T[] = [];
  const rows: ThinkTreeRow[] = [];
  const visit = (think: T, depth: number, parentKey: string, ancestors: ReadonlySet<string>) => {
    const key = parentKey ? `${parentKey}/${think.ID}` : think.ID;
    const nextAncestors = new Set(ancestors).add(think.ID);
    const children = childrenOf(think.ID).filter(c => !nextAncestors.has(c.ID));
    const expanded = children.length > 0 && !collapsed.has(key);
    thinks.push(think);
    rows.push({ key, depth, hasChildren: children.length > 0, expanded });
    if (expanded) for (const child of children) visit(child, depth + 1, key, nextAncestors);
  };
  for (const top of tops) visit(top, 0, '', new Set());
  return { thinks, rows };
}

/**
 * カーソル行の位置。Tree 表示では同じ ID の行が複数あるため、ID だけでは行が決まらない。
 * rowHint（最後にカーソルを置いた行）がその ID の行なら優先し、違えば最初に現れる行にする。
 */
export function cursorRowIndex(list: readonly { ID: string }[], id: string | null | undefined, rowHint?: number): number {
  if (!id) return -1;
  if (rowHint !== undefined && rowHint >= 0 && list[rowHint]?.ID === id) return rowHint;
  return list.findIndex(t => t.ID === id);
}
