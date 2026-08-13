/**
 * tagInsertMenu.ts
 * TextEditor.CurrentEditor.DoOnCursorPos:Menu が「カーソル位置がurl/filepath/tagのいずれでもない場合」に
 * 表示する「タグ挿入」メニュー。
 *
 * ツリーは docs/DefaultSearchTag.md の Description（">" 区切り）から組み立てる。
 * 描画・操作は monacoMenu.ts（monaco F1風＋Windowsコンテキストメニュー型）に委ねる。
 */
import { getErrorMessage } from './errorMessage';
import { apiFetch } from '../services/apiClient';
import { showMonacoMenu, type MenuNode } from './monacoMenu';

let _treeCache: MenuNode[] | null = null;
let _loadError: string | null = null;

// "X)ラベル" 形式から先頭一文字（ニーモニック）とラベル本体を取り出す。
// 形式に合致しない場合はニーモニックなし（先頭一文字選択の対象外）として扱う。
function parseMnemonic(part: string): { key: string; label: string } {
  const m = /^(.)\)(.*)$/.exec(part.trim());
  if (m) return { key: m[1], label: m[2].trim() };
  return { key: '', label: part.trim() };
}

/**
 * Description の ">" 区切りをパスとみなしてツリーを構築する。
 * 同じ親（同一ラベル）の枝は1つにまとめられ、階層数は2段に限定しない。
 */
function buildTree(raw: { id: string; description: string }[]): MenuNode[] {
  const roots: MenuNode[] = [];
  for (const { id, description } of raw) {
    const parts = description.split('>').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    let siblings = roots;
    for (let i = 0; i < parts.length; i++) {
      const { key, label } = parseMnemonic(parts[i]);
      if (i === parts.length - 1) {
        siblings.push({ key, label, detail: id, value: id });
      } else {
        let branch = siblings.find(n => n.label === label && n.children);
        if (!branch) {
          branch = { key, label, children: [] };
          siblings.push(branch);
        }
        siblings = branch.children!;
      }
    }
  }
  return roots;
}

async function loadTree(): Promise<MenuNode[]> {
  if (_treeCache) return _treeCache;
  _loadError = null;
  try {
    const res = await apiFetch('/api/system/search-tag-items');
    if (!res.ok) {
      _loadError = `タグ一覧の取得に失敗しました（HTTP ${res.status}）`;
      return [];
    }
    _treeCache = buildTree(await res.json() as { id: string; description: string }[]);
  } catch (err) {
    _loadError = `タグ一覧の取得に失敗しました（サーバー未起動の可能性）: ${getErrorMessage(err)}`;
  }
  return _treeCache ?? [];
}

/**
 * 「タグ挿入」メニューを表示し、決定された葉ノードのタグIDを解決する。
 * キャンセル時は null を返す。
 */
export function showTagInsertMenu(title: string, anchor?: HTMLElement | null): Promise<string | null> {
  return showMonacoMenu({
    title,
    anchor,
    nodes: loadTree,
    // 読み込み失敗時は原因（HTTPステータス／サーバー未起動）をそのまま出す
    emptyMessage: () => _loadError ?? 'タグ候補がありません',
  });
}
