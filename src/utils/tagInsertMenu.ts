/**
 * tagInsertMenu.ts
 * TextEditor.CurrentEditor.DoOnCursorPos:Menu が「カーソル位置がurl/filepath/tagのいずれでもない場合」に
 * 表示する「タグ挿入」メニュー。docs/DefaultSearchTag.md の Description（"親)親名 > 子)子名" 形式）を
 * 元に、親アイテムでグルーピングした一覧を ↑↓/Enter/Esc、および先頭一文字での即時選択・決定で操作する。
 */
import { getErrorMessage } from './errorMessage';
import { apiFetch } from '../services/apiClient';

interface TagMenuLeaf {
  id:         string; // DefaultSearchTag.md の ID 列（挿入されるタグの中身）
  key:        string; // 子アイテムの先頭一文字（ニーモニック）
  label:      string;
}

interface TagMenuGroup {
  key:   string; // 親アイテムの先頭一文字（ニーモニック）
  label: string;
  items: TagMenuLeaf[];
}

let _menuGroupsCache: TagMenuGroup[] | null = null;
let _menuLoadError: string | null = null;

// "X)ラベル" 形式から先頭一文字（ニーモニック）とラベル本体を取り出す。
// 形式に合致しない場合はニーモニックなし（先頭一文字選択の対象外）として扱う。
function parseMnemonic(part: string): { key: string; label: string } {
  const trimmed = part.trim();
  const m = /^(.)\)(.*)$/.exec(trimmed);
  if (m) return { key: m[1], label: m[2].trim() };
  return { key: '', label: trimmed };
}

async function loadTagMenuGroups(): Promise<TagMenuGroup[]> {
  if (_menuGroupsCache) return _menuGroupsCache;
  _menuLoadError = null;
  try {
    const res = await apiFetch('/api/system/search-tag-items');
    if (!res.ok) {
      _menuLoadError = `タグ一覧の取得に失敗しました（HTTP ${res.status}）`;
      return [];
    }
    const raw = await res.json() as { id: string; description: string }[];
    const groups = new Map<string, TagMenuGroup>();
    for (const { id, description } of raw) {
      const [parentPart, childPart] = description.split('>');
      if (!parentPart || !childPart) continue; // "親 > 子" 形式でない行はメニュー対象外
      const parent = parseMnemonic(parentPart);
      const child  = parseMnemonic(childPart);
      let group = groups.get(parent.label);
      if (!group) {
        group = { key: parent.key, label: parent.label, items: [] };
        groups.set(parent.label, group);
      }
      group.items.push({ id, key: child.key, label: child.label });
    }
    _menuGroupsCache = Array.from(groups.values());
  } catch (err) {
    _menuLoadError = `タグ一覧の取得に失敗しました（サーバー未起動の可能性）: ${getErrorMessage(err)}`;
  }
  return _menuGroupsCache ?? [];
}

type FlatRow =
  | { type: 'header'; label: string }
  | { type: 'item'; group: TagMenuGroup; item: TagMenuLeaf };

/**
 * 「タグ挿入」メニューを表示し、選択された ID を解決する。
 * キャンセル時は null を返す。
 */
export function showTagInsertMenu(): Promise<string | null> {
  return new Promise((resolve) => {
    const existing = document.getElementById('tag-insert-menu-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'tag-insert-menu-overlay';
    overlay.className = 'action-menu-overlay';

    const container = document.createElement('div');
    container.className = 'action-menu-container tag-insert-menu-container';

    const header = document.createElement('div');
    header.className = 'action-menu-header';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = 'タグ挿入';
    const hintSpan = document.createElement('span');
    hintSpan.style.fontSize = '10px';
    hintSpan.style.color = 'var(--text-muted)';
    hintSpan.style.fontWeight = 'normal';
    hintSpan.textContent = 'ESCで閉じる';
    header.appendChild(titleSpan);
    header.appendChild(hintSpan);
    container.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'action-menu-list';
    container.appendChild(list);

    const loadingLi = document.createElement('li');
    loadingLi.className = 'action-menu-item';
    loadingLi.textContent = '読み込み中...';
    list.appendChild(loadingLi);

    const footer = document.createElement('div');
    footer.className = 'action-menu-footer';
    footer.textContent = '↑↓: 選択 / Enter: 決定 / 先頭文字: 即決定 / Esc: キャンセル';
    container.appendChild(footer);

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    let rows: FlatRow[] = [];
    let itemIndexes: number[] = []; // rows 内で type==='item' な要素のインデックス
    let selectedPos = 0; // itemIndexes 上の位置

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      overlay.remove();
    };

    const confirm = (id: string) => {
      cleanup();
      resolve(id);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    const renderRows = () => {
      list.innerHTML = '';
      rows.forEach((row, idx) => {
        if (row.type === 'header') {
          const li = document.createElement('li');
          li.className = 'action-menu-group-header';
          li.textContent = row.label;
          list.appendChild(li);
          return;
        }
        const itemPos = itemIndexes.indexOf(idx);
        const li = document.createElement('li');
        li.className = `action-menu-item${itemPos === selectedPos ? ' selected' : ''}`;

        const titleSpan2 = document.createElement('span');
        titleSpan2.className = 'action-menu-item-title';
        titleSpan2.textContent = row.item.key ? `[${row.item.key}] ${row.item.label}` : row.item.label;

        const descSpan = document.createElement('span');
        descSpan.className = 'action-menu-item-desc';
        descSpan.textContent = row.item.id;

        li.appendChild(titleSpan2);
        li.appendChild(descSpan);
        li.addEventListener('click', () => confirm(row.item.id));
        list.appendChild(li);
      });
    };

    const moveSelection = (delta: number) => {
      if (itemIndexes.length === 0) return;
      selectedPos = (selectedPos + delta + itemIndexes.length) % itemIndexes.length;
      renderRows();
      const selectedEl = list.querySelector('.action-menu-item.selected') as HTMLElement | null;
      selectedEl?.scrollIntoView({ block: 'nearest' });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (e.key === 'ArrowDown') {
        moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        moveSelection(-1);
      } else if (e.key === 'Enter') {
        const idx = itemIndexes[selectedPos];
        const row = idx !== undefined ? rows[idx] : undefined;
        if (row && row.type === 'item') confirm(row.item.id);
      } else if (e.key === 'Escape') {
        cancel();
      } else if (e.key.length === 1) {
        // 先頭一文字（ニーモニック）に一致する子アイテムを選択と同時に決定する
        const ch = e.key.toLowerCase();
        const found = itemIndexes
          .map(idx => rows[idx])
          .find((row): row is Extract<FlatRow, { type: 'item' }> =>
            row.type === 'item' && row.item.key.toLowerCase() === ch);
        if (found) confirm(found.item.id);
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });

    loadTagMenuGroups().then(groups => {
      rows = [];
      groups.forEach(group => {
        rows.push({ type: 'header', label: group.label });
        group.items.forEach(item => rows.push({ type: 'item', group, item }));
      });
      itemIndexes = rows.reduce<number[]>((acc, row, idx) => {
        if (row.type === 'item') acc.push(idx);
        return acc;
      }, []);

      if (itemIndexes.length === 0) {
        list.innerHTML = '';
        const emptyLi = document.createElement('li');
        emptyLi.className = 'action-menu-item';
        emptyLi.textContent = _menuLoadError ?? 'タグ候補がありません';
        list.appendChild(emptyLi);
        return;
      }

      selectedPos = 0;
      renderRows();
    });
  });
}
