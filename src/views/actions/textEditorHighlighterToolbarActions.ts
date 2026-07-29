/**
 * textEditorHighlighterToolbarActions.ts
 * Highlighter検索ヒット間のカーソル移動（CursorPos:*Highlighter）と、
 * ToolBar の Highlighter/Command/CurrentMode 入力欄操作アクションの登録。
 *
 * 元は views/TTFocusedPanelActions.ts の registerTextEditorCursorPosActions に同居していたが、
 * 独立したドメインのため分離した。
 */
import type { TTApplication } from '../TTApplication';
import type { TTActionItem } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { TTUIStateManager, type ConfigKey } from '../TTUIStateManager';
import { getErrorMessage } from '../../utils/errorMessage';

export function registerTextEditorHighlighterToolbarActions(app: TTApplication): void {
  // ── Highlighter 検索移動 ──────────────────────────────────────────────────
  /**
   * Highlighter（ToolBar.HighlighterMode.Text）のヒット位置を昇順で返す。
   * ハイライト表示と同じ規則で、カンマ＝グループ区切り／空白＝単語区切りとして
   * すべての単語を OR 条件で検索する。
   */
  const findHighlighterMatches = (editor: any): any[] => {
    const model = editor.getModel();
    if (!model) return [];
    const words = app.WorkoutPanel.HighlightWord
      .split(/[,\s]+/)
      .map(w => w.trim())
      .filter(w => w.length > 0);
    if (words.length === 0) return [];

    const pattern = words
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    return model.findMatches(pattern, true, true, false, null, false)
      .map((m: any) => m.range)
      .sort((a: any, b: any) =>
        a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn);
  };

  const moveToHighlighter = (item: TTActionItem, pick: (ranges: any[], editor: any) => any | null): void => {
    try {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) {
        item.Result = '[エディタ未選択]';
        return;
      }
      if (!app.WorkoutPanel.HighlightWord.trim()) {
        item.Result = '[Highlighter未設定]';
        return;
      }
      const ranges = findHighlighterMatches(editor);
      if (ranges.length === 0) {
        item.Result = '[ヒットなし]';
        return;
      }
      const target = pick(ranges, editor);
      if (!target) {
        item.Result = '[これ以上ヒットなし]';
        return;
      }
      const newPos = { lineNumber: target.startLineNumber, column: target.startColumn };
      editor.setPosition(newPos);
      editor.revealPositionInCenterIfOutsideViewport(newPos);
      const hitIndex = ranges.findIndex((r: any) =>
        r.startLineNumber === target.startLineNumber && r.startColumn === target.startColumn);
      item.Result = `ヒット${hitIndex + 1}/${ranges.length}（L${newPos.lineNumber}:C${newPos.column}）に移動しました`;
    } catch (err) {
      item.Result = `[エラー] ${getErrorMessage(err)}`;
    }
  };

  const isBefore = (range: any, pos: any): boolean =>
    range.startLineNumber < pos.lineNumber ||
    (range.startLineNumber === pos.lineNumber && range.startColumn < pos.column);

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:PrevHighlighter',
    Description: 'Highlighter検索の前のヒットへ移動する',
    Completion: (item) => moveToHighlighter(item, (ranges, editor) => {
      const pos = editor.getPosition();
      const before = ranges.filter(r => isBefore(r, pos));
      return before.length > 0 ? before[before.length - 1] : null;
    }),
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:NextHighlighter',
    Description: 'Highlighter検索の次のヒットへ移動する',
    Completion: (item) => moveToHighlighter(item, (ranges, editor) => {
      const pos = editor.getPosition();
      return ranges.find(r => !isBefore(r, pos) &&
        !(r.startLineNumber === pos.lineNumber && r.startColumn === pos.column)) ?? null;
    }),
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:FirstHighlighter',
    Description: 'Highlighter検索の先頭ヒットへ移動する',
    Completion: (item) => moveToHighlighter(item, (ranges) => ranges[0]),
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:LastHighlighter',
    Description: 'Highlighter検索の末尾ヒットへ移動する',
    Completion: (item) => moveToHighlighter(item, (ranges) => ranges[ranges.length - 1]),
  });

  // ── ToolBar Highlighter 入力欄 ────────────────────────────────────────────
  const HIGHLIGHTER_INPUT_ID = 'StatusBarTextInput';

  /** :Focus で記憶した、Highlighter入力欄に入る直前のフォーカス要素 */
  let highlighterPrevFocus: HTMLElement | null = null;

  const getHighlighterInput = (): HTMLInputElement | null =>
    document.getElementById(HIGHLIGHTER_INPUT_ID) as HTMLInputElement | null;

  /** FocusedPane の選択テキスト（エディタ優先、なければ通常のDOM選択） */
  const getSelectedTextInFocusedPane = (): string => {
    const editor = TTShortcutManager.instance.activeEditor;
    if (editor) {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (selection && model && !selection.isEmpty()) {
        return model.getValueInRange(selection);
      }
    }
    return window.getSelection()?.toString() ?? '';
  };

  TTActions.Register({
    ActionID: 'ToolBar.HighlighterMode.Text:AddSelected',
    Description: '選択テキストをHighlighter検索語に追加する',
    Completion: (item) => {
      // 改行を含む選択は Highlighter の語として扱えないため1行目のみ採用する
      const selected = getSelectedTextInFocusedPane().split('\n')[0].trim();
      if (!selected) {
        item.Result = '[選択テキストなし]';
        return;
      }

      const current = app.WorkoutPanel.HighlightWord;
      const groups = current.split(',').map(g => g.trim()).filter(g => g.length > 0);
      if (groups.includes(selected)) {
        item.Result = `登録済み: ${selected}`;
        return;
      }

      groups.push(selected);
      TTUIStateManager.instance.applyProperty('ToolBar.HighlighterMode.Text', groups.join(','));
      item.Result = `Highlighterに追加: ${selected}`;
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.HighlighterMode.Text:Clear',
    Description: 'Highlighter検索語をクリアする',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('ToolBar.HighlighterMode.Text', '');
      item.Result = 'Highlighterをクリアしました';
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.HighlighterMode.Text:Focus',
    Description: 'Highlighter入力欄にフォーカスする',
    Completion: (item) => {
      const active = document.activeElement as HTMLElement | null;
      // 入力欄自身にフォーカスがある場合は、戻り先を上書きしない
      if (active && active.id !== HIGHLIGHTER_INPUT_ID) {
        highlighterPrevFocus = active;
      }

      // ToolBar が Highlighter モードでなければ切り替える（入力欄はこの後に描画される）
      if (app.WorkoutPanel.ToolBarMode !== 'Highlighter') {
        TTUIStateManager.instance.applyProperty('ToolBar.Mode.Name', 'Highlighter');
      }
      // 既に描画済みなら即時、モード切替直後で未描画なら次フレームでフォーカスする
      getHighlighterInput()?.focus();
      requestAnimationFrame(() => getHighlighterInput()?.focus());
      item.Result = 'Highlighter入力欄にフォーカスしました';
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.HighlighterMode.Text:Unfocus',
    Description: 'Highlighter入力欄から直前のフォーカス位置に戻る',
    Completion: (item) => {
      const prev = highlighterPrevFocus;
      getHighlighterInput()?.blur();
      if (prev && document.body.contains(prev)) {
        prev.focus();
        highlighterPrevFocus = null;
        item.Result = 'フォーカスを元の位置に戻しました';
        return;
      }
      highlighterPrevFocus = null;
      item.Result = '[戻り先なし] 入力欄のフォーカスを外しました';
    },
  });

  // ── ToolBar Command 入力欄 ────────────────────────────────────────────
  const COMMAND_INPUT_ID = 'StatusBarTextInput';

  /** :Focus で記憶した、Command入力欄に入る直前のフォーカス要素 */
  let commandPrevFocus: HTMLElement | null = null;

  const getCommandInput = (): HTMLInputElement | null =>
    document.getElementById(COMMAND_INPUT_ID) as HTMLInputElement | null;

  TTActions.Register({
    ActionID: 'ToolBar.CommandMode.Text:Clear',
    Description: 'ToolBarのCommandをクリアする',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('ToolBar.CommandMode.Text', '');
      item.Result = 'Commandをクリアしました';
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.CommandMode.Text:Focus',
    Description: 'ToolBarのCommand入力欄にフォーカスする',
    Completion: (item) => {
      const active = document.activeElement as HTMLElement | null;
      // 入力欄自身にフォーカスがある場合は、戻り先を上書きしない
      if (active && active.id !== COMMAND_INPUT_ID) {
        commandPrevFocus = active;
      }

      // ToolBar が Command モードでなければ切り替える（入力欄はこの後に描画される）
      if (app.WorkoutPanel.ToolBarMode !== 'Command') {
        TTUIStateManager.instance.applyProperty('ToolBar.Mode.Name', 'Command');
      }
      // 既に描画済みなら即時、モード切替直後で未描画なら次フレームでフォーカスする
      getCommandInput()?.focus();
      requestAnimationFrame(() => getCommandInput()?.focus());
      item.Result = 'Command入力欄にフォーカスしました';
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.CommandMode.Text:Unfocus',
    Description: 'ToolBarのCommand入力欄から元の位置に戻る',
    Completion: (item) => {
      const prev = commandPrevFocus;
      getCommandInput()?.blur();
      if (prev && document.body.contains(prev)) {
        prev.focus();
        commandPrevFocus = null;
        item.Result = 'フォーカスを元の位置に戻しました';
        return;
      }
      commandPrevFocus = null;
      item.Result = '[戻り先なし] 入力欄のフォーカスを外しました';
    },
  });

  // ── ToolBar 現在モード共通操作（Clear/Copy/Paste） ────────────────────────
  const TOOLBAR_MODE_TEXT_KEY: Record<string, ConfigKey> = {
    Highlighter: 'ToolBar.HighlighterMode.Text',
    Command:     'ToolBar.CommandMode.Text',
    Translate:   'ToolBar.TranslateMode.Text',
    Reminder:    'ToolBar.ReminderMode.Text',
    Status:      'ToolBar.StatusMode.Text',
  };

  TTActions.Register({
    ActionID: 'ToolBar.CurrentMode.Text:Clear',
    Description: 'ToolBarの現在のモードの入力欄のテキストを消去する',
    Completion: (item) => {
      const key = TOOLBAR_MODE_TEXT_KEY[app.WorkoutPanel.ToolBarMode];
      if (!key) { item.Result = '[対象モードなし]'; return; }
      TTUIStateManager.instance.applyProperty(key, '');
      item.Result = `${app.WorkoutPanel.ToolBarMode}をクリアしました`;
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.CurrentMode.Text:Focus',
    Description: 'ToolBarの現在のモードの入力欄にフォーカスする',
    Completion: (item) => {
      const mode = app.WorkoutPanel.ToolBarMode;
      if (!TOOLBAR_MODE_TEXT_KEY[mode]) { item.Result = '[対象モードなし]'; return; }

      // Statusモードは StatusBarStatusPanel を使用しており、他モード共通の
      // #StatusBarTextInput を持たない（未フォーカス時はLabel、フォーカス後にInputへ切替わる）。
      // そのためコンテナ要素を起点に、Input化済みならInputへ、未Input化ならLabel(tabIndex)へフォーカスする。
      if (mode === 'Status') {
        const container = document.querySelector(
          '.ApplicationStatusBarArea__status-panel-container'
        ) as HTMLElement | null;
        if (!container) { item.Result = '[入力欄なし]'; return; }
        const input = container.querySelector('input') as HTMLInputElement | null;
        (input ?? container).focus();
        item.Result = `${mode}入力欄にフォーカスしました`;
        return;
      }

      const input = document.getElementById('StatusBarTextInput') as HTMLInputElement | null;
      if (!input) { item.Result = '[入力欄なし]'; return; }
      input.focus();
      item.Result = `${mode}入力欄にフォーカスしました`;
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.CurrentMode.Text:Copy',
    Description: 'ToolBarの現在のモードの入力欄のテキストをクリップボードにコピーする',
    Completion: async (item) => {
      const key = TOOLBAR_MODE_TEXT_KEY[app.WorkoutPanel.ToolBarMode];
      if (!key) { item.Result = '[対象モードなし]'; return; }
      const value = TTUIStateManager.instance.getProperty(key);
      try {
        await navigator.clipboard.writeText(value);
        item.Result = `コピーしました: ${value}`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.CurrentMode.Text:Paste',
    Description: 'ToolBarの現在のモードの入力欄にクリップボードのテキストをペーストする',
    Completion: async (item) => {
      const key = TOOLBAR_MODE_TEXT_KEY[app.WorkoutPanel.ToolBarMode];
      if (!key) { item.Result = '[対象モードなし]'; return; }
      try {
        const clip = await navigator.clipboard.readText();
        TTUIStateManager.instance.applyProperty(key, clip);
        item.Result = `ペーストしました: ${clip}`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });
}
