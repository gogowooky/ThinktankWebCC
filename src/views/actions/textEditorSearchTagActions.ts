/**
 * textEditorSearchTagActions.ts
 * TextEditor.SearchTag.* アクション（Vaultメモからのタグ定義読込／サーバー取得分へのリセット）の登録。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { parseSearchTagContent } from '../../utils/searchTagFormat';
import { applySearchTagItemsOverride, resetSearchTagItemsOverride } from '../../utils/tagInsertMenu';
import { applySearchTagUrlOverride, resetSearchTagUrlOverride } from './textEditorCursorContentActions';

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
}
