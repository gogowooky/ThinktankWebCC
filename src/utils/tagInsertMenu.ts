/**
 * tagInsertMenu.ts
 * TextEditor.CurrentEditor.DoOnCursorPos:Menu が「カーソル位置がurl/filepath/tagのいずれでもない場合」に
 * 表示する「タグ挿入」メニュー。
 *
 * スタイルは monaco editor の F1（Quick Input）ウィジェットに寄せ、操作体系は Windows の
 * コンテキストメニューと同じ menutree 型（親アイテムを選ぶと子メニューが右側にフライアウトする）。
 * ツリーは docs/DefaultSearchTag.md の Description（">" 区切り）から組み立てる。
 */
import { getErrorMessage } from './errorMessage';
import { apiFetch } from '../services/apiClient';

interface TagMenuNode {
  key:       string;        // ニーモニック（"X)ラベル" の X）。無い場合は空文字
  label:     string;
  id?:       string;        // 葉ノードのみ：挿入するタグのID
  children?: TagMenuNode[]; // 枝ノードのみ
}

let _treeCache: TagMenuNode[] | null = null;
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
function buildTree(raw: { id: string; description: string }[]): TagMenuNode[] {
  const roots: TagMenuNode[] = [];
  for (const { id, description } of raw) {
    const parts = description.split('>').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    let siblings = roots;
    for (let i = 0; i < parts.length; i++) {
      const { key, label } = parseMnemonic(parts[i]);
      if (i === parts.length - 1) {
        siblings.push({ key, label, id });
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

async function loadTree(): Promise<TagMenuNode[]> {
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

interface MenuPanel {
  el:       HTMLElement;
  listEl:   HTMLElement;
  nodes:    TagMenuNode[];
  selected: number;
}

const PANEL_WIDTH = 300;

/**
 * 「タグ挿入」メニューを表示し、決定された葉ノードのIDを解決する。
 * キャンセル時は null を返す。
 * @param title  メニュー最上部に表示するタイトル
 * @param anchor メニューの基準となる要素（省略時はビューポート中央上部）
 */
export function showTagInsertMenu(title: string, anchor?: HTMLElement | null): Promise<string | null> {
  return new Promise((resolve) => {
    document.getElementById('tag-menu-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'tag-menu-overlay';
    overlay.className = 'tag-menu-overlay';
    document.body.appendChild(overlay);

    const panels: MenuPanel[] = [];

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      overlay.remove();
    };
    const confirmLeaf = (id: string) => { cleanup(); resolve(id); };
    const cancel      = ()           => { cleanup(); resolve(null); };

    // ── パネル生成 ───────────────────────────────────────────────────────
    const createPanel = (nodes: TagMenuNode[], titleText: string | null): MenuPanel => {
      const el = document.createElement('div');
      el.className = 'tag-menu-panel';

      if (titleText) {
        const titleEl = document.createElement('div');
        titleEl.className = 'tag-menu-title';
        titleEl.textContent = titleText;
        el.appendChild(titleEl);
      }

      const listEl = document.createElement('div');
      listEl.className = 'tag-menu-list';
      el.appendChild(listEl);

      overlay.appendChild(el);
      const panel: MenuPanel = { el, listEl, nodes, selected: 0 };
      renderPanel(panel);
      return panel;
    };

    const renderPanel = (panel: MenuPanel) => {
      panel.listEl.innerHTML = '';
      panel.nodes.forEach((node, idx) => {
        const row = document.createElement('div');
        row.className = `tag-menu-row${idx === panel.selected ? ' is-selected' : ''}`;

        const keyEl = document.createElement('span');
        keyEl.className = 'tag-menu-row__key';
        keyEl.textContent = node.key;
        row.appendChild(keyEl);

        const labelEl = document.createElement('span');
        labelEl.className = 'tag-menu-row__label';
        labelEl.textContent = node.label;
        row.appendChild(labelEl);

        const tailEl = document.createElement('span');
        if (node.children) {
          tailEl.className = 'tag-menu-row__arrow';
          tailEl.textContent = '›';
        } else {
          tailEl.className = 'tag-menu-row__id';
          tailEl.textContent = node.id ?? '';
        }
        row.appendChild(tailEl);

        const panelIdx = panels.indexOf(panel);
        // マウス操作でも、キーボードでの選択位置・開いている階層を同じ状態に保つ
        row.addEventListener('mouseenter', () => {
          closePanelsAfter(panelIdx);
          panel.selected = idx;
          renderPanel(panel);
          if (node.children) openSubmenu(panel, idx);
        });
        row.addEventListener('click', () => {
          panel.selected = idx;
          activate(panel, idx);
        });

        panel.listEl.appendChild(row);
      });
    };

    // ── 配置 ────────────────────────────────────────────────────────────
    const placeRoot = (panel: MenuPanel) => {
      // monaco の Quick Input と同じく、対象エディタ上端の中央に寄せる。
      // エディタ本体がまだレイアウトされておらず実寸を持たない場合は、
      // 実寸を持つ最も近い祖先（ペインのコンテンツ領域）を基準にする。
      let anchorEl: HTMLElement | null = anchor ?? null;
      while (anchorEl && anchorEl.getBoundingClientRect().width < 40) {
        anchorEl = anchorEl.parentElement;
      }
      const rect = (anchorEl ?? anchor)?.getBoundingClientRect();
      const left = rect
        ? rect.left + (rect.width - PANEL_WIDTH) / 2
        : (window.innerWidth - PANEL_WIDTH) / 2;
      const top = rect ? rect.top + 6 : 60;
      panel.el.style.left = `${clamp(left, 4, window.innerWidth - PANEL_WIDTH - 4)}px`;
      panel.el.style.top  = `${clamp(top, 4, window.innerHeight - 40)}px`;
    };

    const placeSubmenu = (panel: MenuPanel, parent: MenuPanel, rowIdx: number) => {
      const parentRect = parent.el.getBoundingClientRect();
      const rowRect    = (parent.listEl.children[rowIdx] as HTMLElement).getBoundingClientRect();

      let left = parentRect.right - 2;
      // 右端に収まらない場合は親パネルの左側へ反転させる
      if (left + PANEL_WIDTH > window.innerWidth - 4) left = parentRect.left - PANEL_WIDTH + 2;

      const height = panel.el.getBoundingClientRect().height;
      const top    = clamp(rowRect.top - 4, 4, Math.max(4, window.innerHeight - height - 4));

      panel.el.style.left = `${clamp(left, 4, window.innerWidth - PANEL_WIDTH - 4)}px`;
      panel.el.style.top  = `${top}px`;
    };

    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

    // ── 階層操作 ────────────────────────────────────────────────────────
    const closePanelsAfter = (idx: number) => {
      while (panels.length > idx + 1) panels.pop()!.el.remove();
    };

    const openSubmenu = (parent: MenuPanel, rowIdx: number) => {
      const node = parent.nodes[rowIdx];
      if (!node?.children?.length) return null;
      const child = createPanel(node.children, null);
      panels.push(child);
      placeSubmenu(child, parent, rowIdx);
      return child;
    };

    const activate = (panel: MenuPanel, idx: number) => {
      const node = panel.nodes[idx];
      if (!node) return;
      if (node.children) {
        closePanelsAfter(panels.indexOf(panel));
        openSubmenu(panel, idx);
      } else if (node.id) {
        confirmLeaf(node.id);
      }
    };

    const activePanel = () => panels[panels.length - 1];

    const moveSelection = (delta: number) => {
      const panel = activePanel();
      if (!panel || panel.nodes.length === 0) return;
      closePanelsAfter(panels.indexOf(panel));
      panel.selected = (panel.selected + delta + panel.nodes.length) % panel.nodes.length;
      renderPanel(panel);
      (panel.listEl.children[panel.selected] as HTMLElement)?.scrollIntoView({ block: 'nearest' });
    };

    // ── キーボード ──────────────────────────────────────────────────────
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const panel = activePanel();
      if (!panel) return;

      switch (e.key) {
        case 'ArrowDown': moveSelection(1);  return;
        case 'ArrowUp':   moveSelection(-1); return;
        case 'ArrowRight': {
          if (panel.nodes[panel.selected]?.children) activate(panel, panel.selected);
          return;
        }
        case 'ArrowLeft': {
          if (panels.length > 1) closePanelsAfter(panels.length - 2);
          return;
        }
        case 'Enter': activate(panel, panel.selected); return;
        case 'Escape': {
          // 子メニューが開いていれば1階層戻り、ルートのみならキャンセルする
          if (panels.length > 1) closePanelsAfter(panels.length - 2);
          else cancel();
          return;
        }
      }

      if (e.key.length !== 1) return;

      // 先頭一文字（ニーモニック）：一致が1件なら選択と同時に決定（枝なら展開）、
      // 複数一致する場合は Windows のメニューと同様に候補間を巡回するだけに留める
      const ch = e.key.toLowerCase();
      const matches = panel.nodes
        .map((node, idx) => ({ node, idx }))
        .filter(({ node }) => node.key.toLowerCase() === ch);
      if (matches.length === 0) return;

      if (matches.length === 1) {
        panel.selected = matches[0].idx;
        renderPanel(panel);
        activate(panel, matches[0].idx);
        return;
      }
      const next = matches.find(({ idx }) => idx > panel.selected) ?? matches[0];
      closePanelsAfter(panels.indexOf(panel));
      panel.selected = next.idx;
      renderPanel(panel);
    };

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cancel(); });
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    // ── 読み込み ────────────────────────────────────────────────────────
    const root = createPanel([], title);
    placeRoot(root);
    panels.push(root);

    const placeholder = document.createElement('div');
    placeholder.className = 'tag-menu-message';
    placeholder.textContent = '読み込み中...';
    root.listEl.appendChild(placeholder);

    loadTree().then(nodes => {
      if (!overlay.isConnected) return;
      if (nodes.length === 0) {
        root.listEl.innerHTML = '';
        const msg = document.createElement('div');
        msg.className = 'tag-menu-message';
        msg.textContent = _loadError ?? 'タグ候補がありません';
        root.listEl.appendChild(msg);
        return;
      }
      root.nodes = nodes;
      root.selected = 0;
      renderPanel(root);
      placeRoot(root);
    });
  });
}
