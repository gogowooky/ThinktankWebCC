/**
 * textEditorKeyBindingActions.ts
 * TextEditor.KeyBinding.* アクション（Vaultメモからのキー設定読込／Defaultへのリセット／メモへの書き戻し）の登録。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { writeBindingMemo, writeResultMessage } from './bindingMemo';

/** 起動中に検索するVaultメモのタイトル（大文字小文字は区別しない） */
const KEY_BINDING_THINK_NAME = 'ThinktankKeyBinding';

export function registerTextEditorKeyBindingActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.KeyBinding.Load',
    Description: `Vault内の「${KEY_BINDING_THINK_NAME}」という名前のMemoを読み込み、キー設定をDefaultに戻してから適用する（Memoに無いキーはDefaultの状態になる）`,
    Completion: async (item) => {
      const think = app.Models.Vault
        .GetThinks()
        .find(t => t.Name.toLowerCase() === KEY_BINDING_THINK_NAME.toLowerCase());

      if (!think) {
        item.Result = `[未検出] 「${KEY_BINDING_THINK_NAME}」という名前のMemoが見つかりません`;
        return;
      }

      await think.LoadContent();
      // 前回までの変更を持ち越さないよう、一度Defaultへ戻してから読み込む
      TTShortcutManager.instance.resetToDefault();
      TTShortcutManager.instance.mergeContent(think.Content);
      item.Result = `キー設定をDefaultに戻して「${KEY_BINDING_THINK_NAME}」を読み込みました`;
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.KeyBinding.Reset',
    Description: 'キー設定をDefaultの状態に戻す',
    Completion: (item) => {
      TTShortcutManager.instance.resetToDefault();
      item.Result = 'キー設定をDefaultに戻しました';
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.KeyBinding.Save',
    Description: `現在のキー設定をVault内の「${KEY_BINDING_THINK_NAME}」という名前のMemoに書き戻す（無ければ作る）`,
    Completion: async (item) => {
      const result = await writeBindingMemo(app, KEY_BINDING_THINK_NAME, TTShortcutManager.instance.serializeTable());
      item.Result = writeResultMessage('キー設定', KEY_BINDING_THINK_NAME, result);
    },
  });
}
