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

  // 1. WorkoutTabBar (WorkoutSetting.{ModeName})
  if (el.closest('.vertical-tab-bar--workout')) {
    const mode = app?.WorkoutPanel?.ViewMode ?? 'workout';
    return `WorkoutSetting.${mode}`;
  }

  // 2. ToolBar.{ModeName}
  if (el.closest('.workout-toolbar')) {
    const mode = app?.WorkoutPanel?.ToolBarMode ?? 'Copyright';
    return `ToolBar.${mode}`;
  }

  // 3. WorkoutArea (Workout.{MediaType})
  const wa = el.closest('.workout-area');
  if (wa) {
    const mt = (wa.querySelector('.workout-area__content') as HTMLElement | null)?.dataset.mediaType ?? 'texteditor';
    return `Workout.${mt}`;
  }

  // 4. WorkoutSettingArea (WorkoutSetting.{ModeName})
  const ws = el.closest('.workout-setting-area');
  if (ws) {
    const mode = app?.WorkoutPanel?.ViewMode ?? 'workout';
    return `WorkoutSetting.${mode}`;
  }

  // 5. ThinktankPanel (Thinktank.{ModeName})
  const tt = el.closest('.thinktank-panel, .thinktank-area');
  if (tt) {
    const mode = app?.ThinktankPanel?.ViewMode ?? 'filter';
    return `Thinktank.${mode}`;
  }

  // 6. OverviewPanel (Overview.{ModeName})
  const ov = el.closest('.overview-panel, .overview-area');
  if (ov) {
    const mode = app?.OverviewPanel?.ViewMode ?? 'datagrid';
    return `Overview.${mode}`;
  }

  // 7. ReThinkPanel (ReThink.{ModeName})
  const rt = el.closest('.rethink-panel, .rethink-area');
  if (rt) {
    const mode = app?.ReThinkPanel?.ViewMode ?? 'chat';
    return `ReThink.${mode}`;
  }

  // 8. Application.StatusBarArea 等、その他のフォールバック
  if (el.closest('.ApplicationStatusBarArea')) {
    return 'Application.StatusBarArea';
  }

  return 'None';
}
