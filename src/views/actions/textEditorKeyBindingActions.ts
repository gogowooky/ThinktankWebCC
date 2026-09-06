/**
 * textEditorKeyBindingActions.ts
 * TextEditor.KeyBinding.* アクション（Vaultメモからのキー設定読込／Defaultへのリセット）の登録。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';

/** 起動中に検索するVaultメモのタイトル（大文字小文字は区別しない） */
const KEY_BINDING_THINK_NAME = 'ThinktankKeyBinding';

export function registerTextEditorKeyBindingActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.KeyBinding.Load',
    Description: `Vault内の「${KEY_BINDING_THINK_NAME}」という名前のMemoを読み込み、キー設定を上書きする`,
    Completion: async (item) => {
      const think = app.Models.Vault
        .GetThinks()
        .find(t => t.Name.toLowerCase() === KEY_BINDING_THINK_NAME.toLowerCase());

      if (!think) {
        item.Result = `[未検出] 「${KEY_BINDING_THINK_NAME}」という名前のMemoが見つかりません`;
        return;
      }

      await think.LoadContent();
      TTShortcutManager.instance.applyContent(think.Content);
      item.Result = `キー設定を「${KEY_BINDING_THINK_NAME}」から読み込みました`;
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
}
