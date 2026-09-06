/**
 * textEditorColorBindingActions.ts
 * TextEditor.ColorBinding.* アクション（Vaultメモからの色設定読込／Defaultへのリセット）の登録。
 */
import type { TTApplication } from '../TTApplication';
import type { ConfigKey } from '../TTUIStateManager';
import { TTActions } from '../TTActions';
import { TTUIStateManager } from '../TTUIStateManager';
import { parseDefaultColor, DEFAULT_COLOR_ENTRIES, COLOR_PROPS } from '../../utils/defaultColor';
import type { DefaultColorEntry } from '../../utils/defaultColor';

/** 起動中に検索するVaultメモのタイトル（大文字小文字は区別しない） */
const COLOR_BINDING_THINK_NAME = 'ThinktankColorBinding';

/** DefaultColorEntry[] を applyProperties() 向けの [key, value] ペア列に展開する */
function toPropertyEntries(entries: DefaultColorEntry[]): [ConfigKey, string][] {
  const result: [ConfigKey, string][] = [];
  for (const entry of entries) {
    for (const prop of COLOR_PROPS) {
      result.push([`${entry.statusId}.${prop}`, entry.style[prop]]);
    }
  }
  return result;
}

export function registerTextEditorColorBindingActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.ColorBinding.Load',
    Description: `Vault内の「${COLOR_BINDING_THINK_NAME}」という名前のMemoを読み込み、色設定を上書きする`,
    Completion: async (item) => {
      const think = app.Models.Vault
        .GetThinks()
        .find(t => t.Name.toLowerCase() === COLOR_BINDING_THINK_NAME.toLowerCase());

      if (!think) {
        item.Result = `[未検出] 「${COLOR_BINDING_THINK_NAME}」という名前のMemoが見つかりません`;
        return;
      }

      await think.LoadContent();
      const entries = parseDefaultColor(think.Content);
      TTUIStateManager.instance.applyProperties(toPropertyEntries(entries), false);
      item.Result = `色設定を「${COLOR_BINDING_THINK_NAME}」から読み込みました`;
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.ColorBinding.Reset',
    Description: '色設定をDefaultの状態に戻す',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperties(toPropertyEntries(DEFAULT_COLOR_ENTRIES), false);
      item.Result = '色設定をDefaultに戻しました';
    },
  });
}
