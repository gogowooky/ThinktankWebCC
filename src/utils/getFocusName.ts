/**
 * getFocusName.ts
 * フォーカス中の要素からコンポーネント名を返す共有ユーティリティ。
 *
 * WorkoutToolBar の KeyAction 表示および TTShortcutManager の
 * フォーカスパターンマッチングで共用する。
 */

/** フォーカス中の DOM 要素からコンポーネント名を返す */
export function getFocusName(el: Element | null): string {
  if (!el || el === document.body || el === document.documentElement) return 'None';

  // 循環参照を避けるため、window オブジェクトから TTApplication インスタンスを遅延取得
  const app = (window as any).ttApp;

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // 1. WorkoutTabBar (WorkoutSetting.{ModeName})
  const vtbWorkout = el.closest('.vertical-tab-bar--workout');
  if (vtbWorkout) {
    const btn = el.closest('button');
    if (btn) {
      const id = btn.id || btn.getAttribute('aria-label') || '';
      if (id === 'Workout') return 'WorkoutSetting.Workout';
      if (id === 'TextEditor') return 'WorkoutSetting.Texteditor';
      if (id === 'Markdown') return 'WorkoutSetting.Markdown';
      if (id === 'DataGrid') return 'WorkoutSetting.Datagrid';
      if (id === 'Card') return 'WorkoutSetting.Card';
      if (id === 'Graph') return 'WorkoutSetting.Graph';
    }
    const mode = app?.WorkoutPanel?.ViewMode ?? 'workout';
    return `WorkoutSetting.${capitalize(mode)}`;
  }

  // 2. ToolBar.{ModeName}
  if (el.closest('.workout-toolbar')) {
    const mode = app?.WorkoutPanel?.ToolBarMode ?? 'Copyright';
    return `ToolBar.${capitalize(mode)}`;
  }

  // 3. WorkoutArea (Workout.{MediaType})
  const wa = el.closest('.workout-area');
  if (wa) {
    const areasCount = app?.WorkoutPanel?.Areas?.length ?? 0;
    if (areasCount === 0) return 'Workout.None';

    const mt = (wa.querySelector('.workout-area__content') as HTMLElement | null)?.dataset.mediaType ?? 'texteditor';
    return `Workout.${capitalize(mt)}`;
  }

  // 4. WorkoutSettingArea (WorkoutSetting.{ModeName})
  const ws = el.closest('.workout-setting-area');
  if (ws) {
    const mode = app?.WorkoutPanel?.ViewMode ?? 'workout';
    return `WorkoutSetting.${capitalize(mode)}`;
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

  // 6. OverviewPanel (Overview.{ModeName})
  const ov = el.closest('.overview-panel, .overview-area');
  if (ov) {
    const mode = app?.OverviewPanel?.ViewMode ?? 'filter';
    return `Overview.${capitalize(mode)}`;
  }

  // OverviewTabBar (パネル非表示中対応)
  const vtbOverview = el.closest('.vertical-tab-bar--overview');
  if (vtbOverview) {
    const btn = el.closest('button');
    if (btn) {
      const id = btn.id || btn.getAttribute('aria-label') || '';
      if (id.includes('ThinkList')) return 'Overview.Filter';
      if (id.includes('Research') || id.includes('Graph')) return 'Overview.Graph';
      if (id.includes('AI') || id.includes('Chat')) return 'Overview.Chat';
      if (id.includes('Setting')) return 'Overview.Settings';
    }
    const mode = app?.OverviewPanel?.ViewMode ?? 'filter';
    return `Overview.${capitalize(mode)}`;
  }

  // 7. ReThinkPanel (ReThink.{ModeName})
  const rt = el.closest('.rethink-panel, .rethink-area');
  if (rt) {
    const mode = app?.ReThinkPanel?.ViewMode ?? 'chat';
    return `ReThink.${capitalize(mode)}`;
  }

  // ReThinkTabBar (パネル非表示中対応)
  const vtbReThink = el.closest('.vertical-tab-bar--rethink');
  if (vtbReThink) {
    const btn = el.closest('button');
    if (btn) {
      const id = btn.id || btn.getAttribute('aria-label') || '';
      if (id.includes('AI') || id.includes('Chat')) return 'ReThink.Chat';
      if (id.includes('Setting')) return 'ReThink.Settings';
    }
    const mode = app?.ReThinkPanel?.ViewMode ?? 'chat';
    return `ReThink.${capitalize(mode)}`;
  }

  // 8. Application.StatusBarArea 等、その他のフォールバック
  if (el.closest('.ApplicationStatusBarArea')) {
    return 'Application.StatusBarArea';
  }

  return 'None';
}
