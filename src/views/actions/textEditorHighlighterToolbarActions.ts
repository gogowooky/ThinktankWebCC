/**
 * textEditorHighlighterToolbarActions.ts
 * Highlighter検索ヒット間のカーソル移動（CursorPos:*Highlighter）と、
 * ToolBar の Highlighter/Command/Search/CurrentMode 入力欄操作と、Search 入力欄からのキーワード検索アクションの登録。
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
import { findHighlightRanges } from '../../utils/highlightMatches';
import { showDefaultMenu } from '../../utils/defaultMenu';
import { buildKeywordSearchUrl } from './textEditorCursorContentActions';

/** 検索サイトを選ぶメニュー（docs/DefaultMenu.md のメニュー名） */
const KEYWORD_SEARCH_MENU = 'Keyword検索';

export function registerTextEditorHighlighterToolbarActions(app: TTApplication): void {
  // ── Highlighter 検索移動 ──────────────────────────────────────────────────
  /** Highlighter（ToolBar.HighlighterMode.Text）のヒット位置を昇順で返す。 */
  const findHighlighterMatches = (editor: any): any[] =>
    findHighlightRanges(editor, app.WorkingPanel.HighlightWord, {
      matchCase: app.WorkingPanel.HighlightMatchCase,
      isRegex: app.WorkingPanel.HighlightIsRegex,
      matchWidth: app.WorkingPanel.HighlightMatchWidth,
    });

  const moveToHighlighter = (item: TTActionItem, pick: (ranges: any[], editor: any) => any | null): void => {
    try {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) {
        item.Result = '[エディタ未選択]';
        return;
      }
      if (!app.WorkingPanel.HighlightWord.trim()) {
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

  // ── ToolBar 入力欄 ────────────────────────────────────────────────────────
  const TOOLBAR_INPUT_ID = 'StatusBarTextInput';

  const getToolBarInput = (): HTMLInputElement | null =>
    document.getElementById(TOOLBAR_INPUT_ID) as HTMLInputElement | null;

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

      const current = app.WorkingPanel.HighlightWord;
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

  // ── ToolBar Highlighter / Command / Search 入力欄（Clear / Focus / Unfocus）──
  // 3モードとも同じ #StatusBarTextInput を使い、表示中のモードだけが描画される。
  // 戻り先はモードごとに持つ（あるモードの Unfocus が別モードで記憶した位置へ戻らないように）。
  const registerModeInputActions = (mode: 'Highlighter' | 'Command' | 'Search', label: string): void => {
    const textKey = `ToolBar.${mode}Mode.Text` as ConfigKey;
    let prevFocus: HTMLElement | null = null;

    TTActions.Register({
      ActionID: `${textKey}:Clear`,
      Description: `ToolBarの${label}入力欄をクリアする`,
      Completion: (item) => {
        TTUIStateManager.instance.applyProperty(textKey, '');
        item.Result = `${label}をクリアしました`;
      },
    });

    TTActions.Register({
      ActionID: `${textKey}:Focus`,
      Description: `ToolBarの${label}入力欄にフォーカスする`,
      Completion: (item) => {
        const active = document.activeElement as HTMLElement | null;
        // 入力欄自身にフォーカスがある場合は、戻り先を上書きしない
        if (active && active.id !== TOOLBAR_INPUT_ID) prevFocus = active;

        // 対象モードでなければ切り替える（入力欄はこの後に描画される）
        if (app.WorkingPanel.ToolBarMode !== mode) {
          TTUIStateManager.instance.applyProperty('ToolBar.Mode.Name', mode);
        }
        // 既に描画済みなら即時、モード切替直後で未描画なら次フレームでフォーカスする
        getToolBarInput()?.focus();
        requestAnimationFrame(() => getToolBarInput()?.focus());
        item.Result = `${label}入力欄にフォーカスしました`;
      },
    });

    TTActions.Register({
      ActionID: `${textKey}:Unfocus`,
      Description: `ToolBarの${label}入力欄から元の位置に戻る`,
      Completion: (item) => {
        const prev = prevFocus;
        prevFocus = null;
        getToolBarInput()?.blur();
        if (prev && document.body.contains(prev)) {
          prev.focus();
          item.Result = 'フォーカスを元の位置に戻しました';
          return;
        }
        item.Result = '[戻り先なし] 入力欄のフォーカスを外しました';
      },
    });
  };

  registerModeInputActions('Highlighter', 'Highlighter');
  registerModeInputActions('Command', 'Command');
  registerModeInputActions('Search', 'キーワード検索');

  TTActions.Register({
    ActionID: 'ToolBar.HighlighterMode.MatchCase:Toggle',
    Description: 'ハイライターの大文字小文字区別モードを切り替える',
    Completion: (item) => {
      const next = !app.WorkingPanel.HighlightMatchCase;
      TTUIStateManager.instance.applyProperty('ToolBar.HighlighterMode.MatchCase', String(next));
      item.Result = `大文字小文字区別: ${next ? 'ON' : 'OFF'}`;
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.HighlighterMode.IsRegex:Toggle',
    Description: 'ハイライターの正規表現モードを切り替える',
    Completion: (item) => {
      const next = !app.WorkingPanel.HighlightIsRegex;
      TTUIStateManager.instance.applyProperty('ToolBar.HighlighterMode.IsRegex', String(next));
      item.Result = `正規表現モード: ${next ? 'ON' : 'OFF'}`;
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.HighlighterMode.MatchWidth:Toggle',
    Description: 'ハイライターの全角半角区別モードを切り替える',
    Completion: (item) => {
      const next = !app.WorkingPanel.HighlightMatchWidth;
      TTUIStateManager.instance.applyProperty('ToolBar.HighlighterMode.MatchWidth', String(next));
      item.Result = `全角半角区別: ${next ? 'ON' : 'OFF'}`;
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.SearchMode.Text:SetAndFocus',
    Description: '選択テキストがあればキーワード検索入力欄に設定し、キーワード検索入力欄にフォーカスする',
    Completion: async (item) => {
      // 入力欄は1行なので、選択の改行は空白に寄せる
      const selected = getSelectedTextInFocusedPane().replace(/\s*\r?\n\s*/g, ' ').trim();
      if (selected) TTUIStateManager.instance.applyProperty('ToolBar.SearchMode.Text', selected);
      // 戻り先の記憶を Focus と共有するため、Focus アクションを通して入力欄に入る
      await TTActions.Execute('ToolBar.SearchMode.Text:Focus');
      item.Result = selected ? `キーワード検索入力欄に設定: ${selected}` : 'キーワード検索入力欄にフォーカスしました';
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.SearchMode.Text:Search',
    Description: 'キーワード検索入力欄のテキストを、ToolBar.SearchMode.Text:SearchID の検索サイトで外部ブラウザに開く',
    Completion: async (item) => {
      const word = TTUIStateManager.instance.getProperty('ToolBar.SearchMode.Text').trim();
      if (!word) {
        item.Result = '[入力なし] キーワード検索入力欄が空です';
        return;
      }
      const searchId = TTUIStateManager.instance.getProperty('ToolBar.SearchMode.Text:SearchID');
      try {
        const built = await buildKeywordSearchUrl(searchId, word);
        if ('error' in built) { item.Result = built.error; return; }
        window.open(built.url, '_blank');
        item.Result = `${searchId} で検索しました: ${built.label}`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.SearchMode.Text:ShowMenu',
    Description: '「Keyword検索」メニュー（docs/DefaultMenu.md）で検索サイトを選び、SearchID に設定して検索する',
    Completion: async (item) => {
      const searchId = await showDefaultMenu(KEYWORD_SEARCH_MENU, getToolBarInput());
      if (!searchId) {
        item.Result = '[キャンセル] 検索サイトは変更していません';
        return;
      }
      TTUIStateManager.instance.applyProperty('ToolBar.SearchMode.Text:SearchID', searchId);
      const searched = await TTActions.Execute('ToolBar.SearchMode.Text:Search');
      item.Result = `検索サイトを ${searchId} に設定しました。${searched.Result}`;
    },
  });

  // ── ToolBar 現在モード共通操作（Clear/Copy/Paste） ────────────────────────
  const TOOLBAR_MODE_TEXT_KEY: Record<string, ConfigKey> = {
    Highlighter: 'ToolBar.HighlighterMode.Text',
    Command:     'ToolBar.CommandMode.Text',
    Search:      'ToolBar.SearchMode.Text',
    Reminder:    'ToolBar.ReminderMode.Text',
    Status:      'ToolBar.StatusMode.Text',
  };

  TTActions.Register({
    ActionID: 'ToolBar.CurrentMode.Text:Clear',
    Description: 'ToolBarの現在のモードの入力欄のテキストを消去する',
    Completion: (item) => {
      const key = TOOLBAR_MODE_TEXT_KEY[app.WorkingPanel.ToolBarMode];
      if (!key) { item.Result = '[対象モードなし]'; return; }
      TTUIStateManager.instance.applyProperty(key, '');
      item.Result = `${app.WorkingPanel.ToolBarMode}をクリアしました`;
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.CurrentMode.Text:Focus',
    Description: 'ToolBarの現在のモードの入力欄にフォーカスする',
    Completion: (item) => {
      const mode = app.WorkingPanel.ToolBarMode;
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
      const key = TOOLBAR_MODE_TEXT_KEY[app.WorkingPanel.ToolBarMode];
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
      const key = TOOLBAR_MODE_TEXT_KEY[app.WorkingPanel.ToolBarMode];
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
