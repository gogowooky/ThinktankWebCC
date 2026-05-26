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

  // WorkoutRibbon（設定パネル開閉ボタン群）
  if (el.closest('.workout-ribbon')) return 'WorkoutSetting.Ribbon';

  // WorkoutToolBar
  if (el.closest('.workout-toolbar')) return 'Workout.ToolBar';

  // WorkoutArea (active content pane) — data-media-type 属性でメディアタイプを判別
  const wa = el.closest('.workout-area');
  if (wa) {
    const mt = (wa.querySelector('.workout-area__content') as HTMLElement | null)?.dataset.mediaType;
    switch (mt) {
      case 'workout':
      case 'texteditor': return 'Workout.TextEditor';
      case 'markdown':   return 'Workout.Markdown';
      case 'datagrid':   return 'Workout.DataGrid';
      case 'card':       return 'Workout.Card';
      case 'graph':      return 'Workout.Graph';
      case 'chat':       return 'Workout.Chat';
    }
    return 'Workout.ActivePane';
  }

  // WorkoutSettingPanel
  const ws = el.closest('.workout-setting-panel');
  if (ws) {
    const txt = ws.querySelector('.workout-setting-panel__header')?.textContent?.toLowerCase() ?? '';
    if (txt.includes('texteditor')) return 'WorkoutSetting.TextEditor';
    if (txt.includes('markdown'))   return 'WorkoutSetting.Markdown';
    if (txt.includes('datagrid'))   return 'WorkoutSetting.DataGrid';
    if (txt.includes('card'))       return 'WorkoutSetting.Card';
    if (txt.includes('graph'))      return 'WorkoutSetting.Graph';
    return 'WorkoutSetting.Workout';
  }

  // ThinktankPanel
  const tt = el.closest('.thinktank-panel, .thinktank-area');
  if (tt) {
    const panel = tt.closest('.thinktank-panel') ?? tt.parentElement ?? tt;
    const label = panel.querySelector('.ribbon-icon-btn--active')?.getAttribute('aria-label') ?? '';
    if (label === '検索')        return 'Thinktank.Search';
    if (label === 'Thought一覧') return 'Thinktank.Thoughts';
    if (label === 'AI相談')      return 'Thinktank.Chat';
    if (label === '設定')        return 'Thinktank.Setting';
    return 'Thinktank.Thinks';
  }

  // OverviewPanel — レンダリング済みの子コンポーネントのクラスで判別
  const ov = el.closest('.overview-panel, .overview-area');
  if (ov) {
    const root = ov.closest('.overview-panel') ?? ov;
    if (root.querySelector('.ov-settings-view')) return 'Overview.Setting';
    if (root.querySelector('.ai-chat-view'))      return 'Overview.Chat';
    if (root.querySelector('.graph-media'))        return 'Overview.Analyze';
    return 'Overview.Thinks';
  }

  // ReThinkPanel — .rethink-chat の有無でモードを判別
  const rt = el.closest('.rethink-panel, .rethink-area');
  if (rt) {
    const root = rt.closest('.rethink-panel') ?? rt;
    if (root.querySelector('.rethink-chat')) return 'ReThink.Chat';
    return 'ReThink.Setting';
  }

  return 'None';
}
