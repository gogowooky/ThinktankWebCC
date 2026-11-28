/**
 * applicationStateActions.ts
 * 拡張モード（ExMode）、Undo/Redo・文字削除、フォーカスエリア・フォーカスパネルの切替のアクション。
 *
 * registerFocusedPanelActions（views/TTFocusedPanelActions.ts）から登録順どおりに呼ばれる。
 */

import type { TTApplication } from '../TTApplication';
import type { TTActionItem } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { TTUIStateManager } from '../TTUIStateManager';

export function registerApplicationStateActions(app: TTApplication): void {
  // ExMode 関連アクションの登録
  const registerExModeAction = (mode: string): void => {
    TTActions.Register({
      ActionID: `Application.Status.ExMode:${mode}`,
      Description: `拡張モードを${mode}に設定する`,
      Completion: (item: TTActionItem) => {
        app.Status.SetExMode(mode, item.Mods ?? '');
        item.Result = `ExMode→${mode} [${item.Mods ?? ''}]`;
      },
    });
  };
  registerExModeAction('ExApp');
  registerExModeAction('ExOpt');
  registerExModeAction('None');

  // UI状態 (Undo/Redo) アクションの登録
  TTActions.Register({
    ActionID: 'TextEditor.EditText.Undo',
    Description: '編集を元に戻す（Undo）',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'undo', {});
        item.Result = 'Editor Undo';
      } else {
        TTUIStateManager.instance.undo();
        item.Result = 'UI State Undo';
      }
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.EditText.Redo',
    Description: '編集をやり直す（Redo）',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'redo', {});
        item.Result = 'Editor Redo';
      } else {
        TTUIStateManager.instance.redo();
        item.Result = 'UI State Redo';
      }
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.EditText.Delete',
    Description: 'カーソル右の文字を削除する',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'deleteRight', {});
        item.Result = 'Editor Delete';
      }
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.EditText.Backspace',
    Description: 'カーソル左の文字を削除する',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'deleteLeft', {});
        item.Result = 'Editor Backspace';
      }
    },
  });

  // 状態変数 (Property) 変更アクションの登録
  TTActions.Register({
    ActionID: 'Application.FocusedArea.Name:prev',
    Description: 'フォーカスエリアを前に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedArea.Name', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedArea.Name');
    },
  });

  TTActions.Register({
    ActionID: 'Application.FocusedArea.Name:next',
    Description: 'フォーカスエリアを次に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedArea.Name', 'next');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedArea.Name');
    },
  });

  TTActions.Register({
    ActionID: 'Application.FocusedPanel.Name:Prev',
    Description: 'フォーカスカラムを前のパネルに移動する',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedPanel.Name', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedPanel.Name');
    },
  });

  TTActions.Register({
    ActionID: 'Application.FocusedPanel.Name:Next',
    Description: 'フォーカスカラムを次のパネルに移動する',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedPanel.Name', 'next');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedPanel.Name');
    },
  });
}
