/**
 * textEditorSearchTagActions.ts
 * TextEditor.SearchTag.* アクション（Vaultメモからのタグ定義読込／サーバー取得分へのリセット／メモへの書き戻し）の登録。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { parseSearchTagContent } from '../../utils/searchTagFormat';
import { applySearchTagItemsOverride, getEffectiveSearchTagItems, resetSearchTagItemsOverride } from '../../utils/tagInsertMenu';
import { applySearchTagUrlOverride, getEffectiveSearchTagUrls, resetSearchTagUrlOverride } from './textEditorCursorContentActions';
import { writeBindingMemo, writeResultMessage } from './bindingMemo';

/** 起動中に検索するVaultメモのタイトル（大文字小文字は区別しない） */
const SEARCH_TAG_THINK_NAME = 'ThinktankSearchTag';

export function registerTextEditorSearchTagActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.SearchTag.Load',
    Description: `Vault内の「${SEARCH_TAG_THINK_NAME}」という名前のMemoを読み込み、タグ定義をDefaultに戻してから適用する（Memoに無いidはDefaultの状態になる）`,
    Completion: async (item) => {
      const think = app.Models.Vault
        .GetThinks()
        .find(t => t.Name.toLowerCase() === SEARCH_TAG_THINK_NAME.toLowerCase());

      if (!think) {
        item.Result = `[未検出] 「${SEARCH_TAG_THINK_NAME}」という名前のMemoが見つかりません`;
        return;
      }

      await think.LoadContent();
      const rows = parseSearchTagContent(think.Content);
      // 前回までの変更を持ち越さないよう、一度Defaultへ戻してから読み込む
      resetSearchTagItemsOverride();
      resetSearchTagUrlOverride();
      applySearchTagItemsOverride(rows);
      applySearchTagUrlOverride(rows);
      item.Result = `タグ定義をDefaultに戻して「${SEARCH_TAG_THINK_NAME}」を読み込みました`;
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.SearchTag.Reset',
    Description: 'タグ定義をDefaultの状態に戻す',
    Completion: (item) => {
      resetSearchTagItemsOverride();
      resetSearchTagUrlOverride();
      item.Result = 'タグ定義をDefaultに戻しました';
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.SearchTag.Save',
    Description: `現在のタグ定義をVault内の「${SEARCH_TAG_THINK_NAME}」という名前のMemoに書き戻す（無ければ作る）`,
    Completion: async (item) => {
      const [items, urls] = await Promise.all([getEffectiveSearchTagItems(), getEffectiveSearchTagUrls()]);
      if (items.length === 0) {
        item.Result = '[未取得] タグ定義を取得できないため書き戻しませんでした';
        return;
      }
      // docs/DefaultSearchTag.md と同じ「ID, "Description", URL」形式（URL が無いタグは NoURL）
      const lines = items.map(t => `${t.id}, "${t.description}", ${urls[t.id.toLowerCase()] || 'NoURL'}`);
      const result = await writeBindingMemo(app, SEARCH_TAG_THINK_NAME, ['# ID, "Description", URL', ...lines].join('\n'));
      item.Result = writeResultMessage('タグ定義', SEARCH_TAG_THINK_NAME, result);
    },
  });
}
