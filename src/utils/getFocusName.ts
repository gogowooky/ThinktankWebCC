/**
 * getFocusName.ts
 * フォーカス中の要素からコンポーネント名を返す共有ユーティリティ。
 *
 * DevelopToolBar の KeyAction 表示および TTShortcutManager の
 * フォーカスパターンマッチングで共用する。
 */

/** フォーカス中の DOM 要素からコンポーネント名を返す */
export function getFocusName(el: Element | null): string {
  if (!el || el === document.body || el === document.documentElement) return 'None';

  // 循環参照を避けるため、window オブジェクトから TTApplication インスタンスを遅延取得
  const app = (window as any).ttApp;

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // 1. DevelopTabBar (DevelopSetting.{ModeName})
  const vtbDevelop = el.closest('.vertical-tab-bar--develop');
  if (vtbDevelop) {
    const btn = el.closest('button');
    if (btn) {
      const id = btn.id || btn.getAttribute('aria-label') || '';
      if (id === 'Panes') return 'DevelopSetting.Panes';
      if (id === 'TextEditor') return 'DevelopSetting.Texteditor';
      if (id === 'Markdown') return 'DevelopSetting.Markdown';
      if (id === 'DataGrid') return 'DevelopSetting.Datagrid';
      if (id === 'Card') return 'DevelopSetting.Card';
      if (id === 'Graph') return 'DevelopSetting.Graph';
    }
    const mode = app?.DevelopPanel?.ViewMode ?? 'panes';
    return `DevelopSetting.${capitalize(mode)}`;
  }

  // 2. ToolBar.{ModeName}
  // 実際のツールバー（Highlighter/Command/...入力欄を含む）は .ApplicationStatusBarArea
  // として描画される。.develop-toolbar は該当するDOM要素が存在しない廃止済みクラス名。
  if (el.closest('.ApplicationStatusBarArea')) {
    const mode = app?.DevelopPanel?.ToolBarMode ?? 'Copyright';
    return `ToolBar.${capitalize(mode)}`;
  }

  // 3. DevelopArea (Develop.{MediaType})
  const wa = el.closest('.develop-area');
  if (wa) {
    const areasCount = app?.DevelopPanel?.Areas?.length ?? 0;
    if (areasCount === 0) return 'Develop.None';

    const mt = (wa.querySelector('.develop-area__content') as HTMLElement | null)?.dataset.mediaType ?? 'texteditor';
    return `Develop.${capitalize(mt)}`;
  }

  // 4. DevelopSettingArea (DevelopSetting.{ModeName})
  const ws = el.closest('.develop-setting-area');
  if (ws) {
    const mode = app?.DevelopPanel?.ViewMode ?? 'panes';
    return `DevelopSetting.${capitalize(mode)}`;
  }

  // 5. ThinktankPanel (Thinktank.{ModeName})
  const tt = el.closest('.thinktank-panel, .thinktank-area');
  if (tt) {
    const mode = app?.ThinktankPanel?.ViewMode ?? 'filter';
    return `Thinktank.${capitalize(mode)}`;
  }

  // ThinktankTabBar (パネル非表示中対応)
  const vtbThinktank = el.closest('.vertical-tab-bar--thinktank');
  if (vtbThinktank) {
    const btn = el.closest('button');
    if (btn) {
      const id = btn.id || btn.getAttribute('aria-label') || '';
      if (id.includes('ThinkList')) return 'Thinktank.Filter';
      if (id.includes('AI') || id.includes('Chat')) return 'Thinktank.Chat';
      if (id.includes('Setting')) return 'Thinktank.Settings';
    }
    const mode = app?.ThinktankPanel?.ViewMode ?? 'filter';
    return `Thinktank.${capitalize(mode)}`;
  }

  // 6. SeedsPanel (Seeds.{ModeName})
  const ov = el.closest('.seeds-panel, .seeds-area');
  if (ov) {
    const mode = app?.SeedsPanel?.ViewMode ?? 'filter';
    return `Seeds.${capitalize(mode)}`;
  }

  // SeedsTabBar (パネル非表示中対応)
  const vtbSeeds = el.closest('.vertical-tab-bar--seeds');
  if (vtbSeeds) {
    const btn = el.closest('button');
    if (btn) {
      const id = btn.id || btn.getAttribute('aria-label') || '';
      if (id.includes('ThinkList')) return 'Seeds.Filter';
      if (id.includes('Research') || id.includes('Graph')) return 'Seeds.Graph';
      if (id.includes('AI') || id.includes('Chat')) return 'Seeds.Chat';
      if (id.includes('Setting')) return 'Seeds.Settings';
    }
    const mode = app?.SeedsPanel?.ViewMode ?? 'filter';
    return `Seeds.${capitalize(mode)}`;
  }

  // 7. HarvestPanel (Harvest.{ModeName})
  const rt = el.closest('.harvest-panel, .harvest-area');
  if (rt) {
    const mode = app?.HarvestPanel?.ViewMode ?? 'chat';
    return `Harvest.${capitalize(mode)}`;
  }

  // HarvestTabBar (パネル非表示中対応)
  const vtbHarvest = el.closest('.vertical-tab-bar--harvest');
  if (vtbHarvest) {
    const btn = el.closest('button');
    if (btn) {
      const id = btn.id || btn.getAttribute('aria-label') || '';
      if (id.includes('AI') || id.includes('Chat')) return 'Harvest.Chat';
      if (id.includes('Setting')) return 'Harvest.Settings';
    }
    const mode = app?.HarvestPanel?.ViewMode ?? 'chat';
    return `Harvest.${capitalize(mode)}`;
  }

  return 'None';
}
