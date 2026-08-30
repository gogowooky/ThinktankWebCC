/**
 * monacoMenu.ts
 * monaco editor の F1（Quick Input）風の見た目と、Windows のコンテキストメニューと同じ
 * menutree 型の操作（親アイテムを選ぶと子メニューが右側にフライアウトする）を持つメニュー。
 *
 * TextEditor.CurrentEditor.DoOnCursorPos:Menu の2系統
 * （カーソル位置のアクション選択 / タグ挿入）で共通して使う描画・操作エンジン。
 */

export interface MenuNode {
  /** 先頭一文字での選択・決定に使うニーモニック。無い場合は空文字 */
  key:       string;
  label:     string;
  /** 行の右端に薄く表示する補助情報（タグID・アクション名など） */
  detail?:   string;
  /** 葉ノードのみ：決定時に解決される値 */
  value?:    string;
  /** 枝ノードのみ */
  children?: MenuNode[];
}

interface MenuPanel {
  el:       HTMLElement;
  listEl:   HTMLElement;
  nodes:    MenuNode[];
  selected: number;
}

const PANEL_WIDTH = 300;
const OVERLAY_ID  = 'tt-menu-overlay';

export interface MonacoMenuOptions {
  /** メニュー最上部に表示するタイトル */
  title:         string;
  /** 表示するノード。関数を渡すと非同期に読み込み、その間は読み込み中を表示する */
  nodes:         MenuNode[] | (() => Promise<MenuNode[]>);
  /** メニューの基準となる要素（省略時はビューポート中央上部） */
  anchor?:       HTMLElement | null;
  /**
   * ノードが空だった場合に表示する文言。
   * 読み込み結果（失敗理由など）に応じて変えたい場合は関数を渡す
   * （表示直前に評価されるため、非同期読み込みの結果を反映できる）。
   */
  emptyMessage?: string | (() => string);
}

/**
 * メニューを表示し、決定された葉ノードの value を解決する。
 * キャンセル時は null を返す。
 */
export function showMonacoMenu(options: MonacoMenuOptions): Promise<string | null> {
  const { title, nodes: source, anchor, emptyMessage = '選択できる項目がありません' } = options;

  return new Promise((resolve) => {
    document.getElementById(OVERLAY_ID)?.remove();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'tt-menu-overlay';
    document.body.appendChild(overlay);

    const panels: MenuPanel[] = [];

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      overlay.remove();
    };
    const confirmLeaf = (value: string) => { cleanup(); resolve(value); };
    const cancel      = ()              => { cleanup(); resolve(null); };

    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

    // ── パネル生成 ───────────────────────────────────────────────────────
    const createPanel = (panelNodes: MenuNode[], titleText: string | null): MenuPanel => {
      const el = document.createElement('div');
      el.className = 'tt-menu-panel';

      if (titleText) {
        const titleEl = document.createElement('div');
        titleEl.className = 'tt-menu-title';
        titleEl.textContent = titleText;
        el.appendChild(titleEl);
      }

      const listEl = document.createElement('div');
      listEl.className = 'tt-menu-list';
      el.appendChild(listEl);

      overlay.appendChild(el);
      const panel: MenuPanel = { el, listEl, nodes: panelNodes, selected: 0 };
      renderPanel(panel);
      return panel;
    };

    const renderPanel = (panel: MenuPanel) => {
      panel.listEl.innerHTML = '';
      panel.nodes.forEach((node, idx) => {
        const row = document.createElement('div');
        row.className = `tt-menu-row${idx === panel.selected ? ' is-selected' : ''}`;

        const keyEl = document.createElement('span');
        keyEl.className = 'tt-menu-row__key';
        keyEl.textContent = node.key;
        row.appendChild(keyEl);

        const labelEl = document.createElement('span');
        labelEl.className = 'tt-menu-row__label';
        labelEl.textContent = node.label;
        row.appendChild(labelEl);

        const tailEl = document.createElement('span');
        if (node.children) {
          tailEl.className = 'tt-menu-row__arrow';
          tailEl.textContent = '›';
        } else {
          tailEl.className = 'tt-menu-row__detail';
          tailEl.textContent = node.detail ?? '';
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
      } else if (node.value !== undefined) {
        confirmLeaf(node.value);
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

    // ── 初期表示 ────────────────────────────────────────────────────────
    const root = createPanel([], title);
    placeRoot(root);
    panels.push(root);

    const showMessage = (text: string) => {
      root.listEl.innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'tt-menu-message';
      msg.textContent = text;
      root.listEl.appendChild(msg);
    };

    const applyNodes = (loaded: MenuNode[]) => {
      if (loaded.length === 0) {
        showMessage(typeof emptyMessage === 'function' ? emptyMessage() : emptyMessage);
        return;
      }
      root.nodes = loaded;
      root.selected = 0;
      renderPanel(root);
      placeRoot(root);
    };

    if (typeof source === 'function') {
      showMessage('読み込み中...');
      void source().then(loaded => {
        if (!overlay.isConnected) return;
        applyNodes(loaded);
      });
    } else {
      applyNodes(source);
    }
  });
}
