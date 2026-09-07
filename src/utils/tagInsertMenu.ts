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
import type { SearchTagRow } from './searchTagFormat';

type TagItem = { id: string; description: string };

/** サーバー（docs/DefaultSearchTag.md）から取得した基礎データ */
let _baseItems: TagItem[] | null = null;
/** Vaultメモ（ThinktankSearchTag）由来の上書き分。id一致分のみ _baseItems を置換する */
let _overrideItems: TagItem[] | null = null;
let _treeCache: MenuNode[] | null = null;
let _loadError: string | null = null;

/** _baseItems に _overrideItems を id 一致で上書きマージした一覧を返す */
function mergedItems(): TagItem[] {
  if (!_overrideItems || _overrideItems.length === 0) return _baseItems ?? [];
  const map = new Map((_baseItems ?? []).map(item => [item.id, item]));
  for (const item of _overrideItems) map.set(item.id, item);
  return [...map.values()];
}

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

  if (!_baseItems) {
    try {
      const res = await apiFetch('/api/system/search-tag-items');
      if (!res.ok) {
        _loadError = `タグ一覧の取得に失敗しました（HTTP ${res.status}）`;
        return [];
      }
      _baseItems = await res.json() as TagItem[];
    } catch (err) {
      _loadError = `タグ一覧の取得に失敗しました（サーバー未起動の可能性）: ${getErrorMessage(err)}`;
      return [];
    }
  }

  _treeCache = buildTree(mergedItems());
  return _treeCache;
}

/**
 * Vaultメモ（ThinktankSearchTag）由来の行でタグ挿入メニューを上書きマージする
 * （idが一致する項目だけ置換し、それ以外はサーバー取得分のまま維持する）。
 */
export function applySearchTagItemsOverride(rows: SearchTagRow[]): void {
  _overrideItems = rows.map(r => ({ id: r.id, description: r.description }));
  _treeCache = null;
}

/** 上書きを解除し、サーバー取得分（docs/DefaultSearchTag.md）に戻す */
export function resetSearchTagItemsOverride(): void {
  _overrideItems = null;
  _treeCache = null;
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
