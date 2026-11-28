/**
 * textEditorFindActions.ts
 * テキストエディタの default アクションと、検索・置換ダイアログ・検索オプションのアクション。
 *
 * registerFocusedPanelActions（views/TTFocusedPanelActions.ts）から登録順どおりに呼ばれる。
 */

import type { TTApplication } from '../TTApplication';
import type { ActionID } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTShortcutManager, DEFAULT_ACTION } from '../TTShortcutManager';
import { TTUIStateManager, type ConfigKey } from '../TTUIStateManager';

export function registerTextEditorFindActions(app: TTApplication): void {
  // ── Editor 検索・置換 ─────────────────────────────────────────────────────
  /** Monaco既定の検索/置換ウィジェットのコントローラーを取得する */
  const getFindController = (editor: any): any =>
    editor.getContribution?.('editor.contrib.findController') as any;

  /** 現在保存されている検索・置換オプションを、開いているMonaco既定の検索/置換ウィジェットへ反映する */
  const applyFindOptionsToController = (editor: any): void => {
    const state = getFindController(editor)?.getState?.();
    if (!state) return;
    const findOpt = app.WorkingPanel.TextEditor.FindOption;
    const replaceOpt = app.WorkingPanel.TextEditor.ReplaceOption;
    state.change({
      matchCase: findOpt.MatchCase,
      wholeWord: findOpt.MatchWholeWord,
      isRegex: findOpt.UseRexp,
      preserveCase: replaceOpt.PreserveCase,
    }, false);
  };

  // 実体はキーイベントを素通しすること（TTShortcutManager._processEvent が特別扱いする）。
  // コマンド等から直接実行された場合は渡すべきキーが無いので何もしない。
  TTActions.Register({
    ActionID: DEFAULT_ACTION,
    Description: 'テキストエディタのdefaultアクション',
    Completion: (item) => {
      item.Result = '既定動作';
      item.Allow = true;
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.ShowFind',
    Description: '検索ダイアログを表示/非表示トグルする',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) {
        item.Result = '[エディタ未選択]';
        return;
      }
      const controller = getFindController(editor);
      const state = controller?.getState?.();
      // 検索ダイアログ（置換行を伴わない）が表示中なら閉じて終了する
      if (state?.isRevealed && !state.isReplaceRevealed) {
        controller.closeFindWidget();
        item.Result = '検索ダイアログを閉じました';
        return;
      }
      editor.getAction('actions.find')?.run();
      applyFindOptionsToController(editor);
      item.Result = '検索ダイアログを表示しました';
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.ShowReplace',
    Description: '置換ダイアログを表示/非表示トグルする',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) {
        item.Result = '[エディタ未選択]';
        return;
      }
      const controller = getFindController(editor);
      const state = controller?.getState?.();
      // 置換ダイアログ（置換行を伴う）が表示中なら閉じて終了する
      if (state?.isRevealed && state.isReplaceRevealed) {
        controller.closeFindWidget();
        item.Result = '置換ダイアログを閉じました';
        return;
      }
      editor.getAction('editor.action.startFindReplaceAction')?.run();
      applyFindOptionsToController(editor);
      item.Result = '置換ダイアログを表示しました';
    },
  });

  // FindOption / ReplaceOption Toggle（表示中の検索/置換ウィジェットがあれば即時反映する）
  const registerFindOptionToggle = (actionId: ActionID, key: ConfigKey, description: string): void => {
    TTActions.Register({
      ActionID: actionId,
      Description: description,
      Completion: (item) => {
        TTUIStateManager.instance.applyProperty(key, 'toggle');
        const editor = TTShortcutManager.instance.activeEditor;
        if (editor) applyFindOptionsToController(editor);
        item.Result = TTUIStateManager.instance.getProperty(key);
      },
    });
  };
  registerFindOptionToggle('TextEditor.FindOption.MatchCase:Toggle', 'TextEditor.FindOption.MatchCase', '検索オプション「大文字小文字を区別」をトグルする');
  registerFindOptionToggle('TextEditor.FindOption.MatchWholeWord:Toggle', 'TextEditor.FindOption.MatchWholeWord', '検索オプション「単語単位で検索」をトグルする');
  registerFindOptionToggle('TextEditor.FindOption.UseRexp:Toggle', 'TextEditor.FindOption.UseRexp', '検索オプション「正規表現」をトグルする');
  registerFindOptionToggle('TextEditor.ReplaceOption.PreserveCase:Toggle', 'TextEditor.ReplaceOption.PreserveCase', '置換オプション「大文字小文字を保持」をトグルする');
}
