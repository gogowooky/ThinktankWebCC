/**
 * defaultMenu.ts
 * docs/DefaultMenu.md に定義したメニューを表示し、選ばれた項目の ID を返す汎用ルーチン。
 *
 * DefaultMenu.md の書式（CSV。コメント行の規則は utils/commentLine.ts）:
 *   "MenuTree", ID, Description
 *   MenuTree は ">" 区切りの階層で、先頭がメニュー名（例: "タグ挿入 > Q)検索 > J)Google検索J"）。
 *   各段の "X)ラベル" の X はニーモニック（先頭一文字での選択）。
 *
 * showDefaultMenu('タグ挿入') は MenuTree の先頭が「タグ挿入」の行だけを集め、
 * 2段目以降からメニューを作る。描画・操作は monacoMenu.ts に任せる。
 */
import defaultMenuContent from '../../docs/DefaultMenu.md?raw';
import { isCommentLine } from './commentLine';
import { parseCsvLine } from './tableFormat';
import { buildMenuTree, showMonacoMenu, type MenuNode } from './monacoMenu';

export interface DefaultMenuRow {
  /** MenuTree を ">" で分けた各段（先頭がメニュー名） */
  tree:        string[];
  id:          string;
  description: string;
}

/** DefaultMenu.md 形式のテキストを行に分ける。ID の無い行は捨てる */
export function parseDefaultMenu(text: string): DefaultMenuRow[] {
  const rows: DefaultMenuRow[] = [];
  for (const line of text.split(/\r\n|\n/)) {
    if (!line.trim() || isCommentLine(line)) continue;
    let [treeCell = '', idCell = '', descriptionCell = ''] = parseCsvLine(line.trim());
    // 閉じ引用符とカンマを書き落とした行（"A > B)b      ID）は、空白で区切られた末尾の語を ID とみなして救う
    const unclosed = !idCell && /^"([^"]+?)[\s\u3000]{2,}(\S+)\s*$/.exec(line.trim());
    if (unclosed) [treeCell, idCell, descriptionCell] = [unclosed[1], unclosed[2], ''];
    const tree = treeCell.split('>').map(s => s.trim()).filter(Boolean);
    const id = idCell.trim();
    if (tree.length === 0 || !id) continue;
    rows.push({ tree, id, description: descriptionCell.trim() });
  }
  return rows;
}

/** メニュー名で始まる行から、メニュー名を除いた階層のメニューを作る（ツールチップは ID） */
export function buildDefaultMenuNodes(rows: DefaultMenuRow[], menuName: string): MenuNode[] {
  return buildMenuTree(rows
    .filter(r => r.tree[0] === menuName && r.tree.length > 1)
    .map(r => ({ path: r.tree.slice(1), value: r.id, tip: r.id })));
}

/**
 * docs/DefaultMenu.md のメニュー menuName を表示する。メニュー名がそのままタイトルになる。
 * 項目を選ぶとメニューを閉じてその ID を返し、キャンセル時は null を返す。
 */
export function showDefaultMenu(menuName: string, anchor?: HTMLElement | null): Promise<string | null> {
  return showMonacoMenu({
    title: menuName,
    nodes: buildDefaultMenuNodes(parseDefaultMenu(defaultMenuContent), menuName),
    anchor,
    emptyMessage: `「${menuName}」のメニュー項目がありません（docs/DefaultMenu.md）`,
  });
}
