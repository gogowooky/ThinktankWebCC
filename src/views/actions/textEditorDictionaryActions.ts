/**
 * textEditorDictionaryActions.ts
 * TextEditor.Dictionary.* アクション（Vaultメモからの辞書読込／Defaultへのリセット／メモへの書き戻し）の登録。
 * 既定値は docs/DefaultDictionary.yaml（utils/defaultDictionary.ts）。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { getErrorMessage } from '../../utils/errorMessage';
import {
  applyDictionaryOverride,
  getDictionary,
  parseDictionary,
  resetDictionaryOverride,
  serializeDictionary,
} from '../../utils/defaultDictionary';
import { findBindingMemo, writeBindingMemo, writeResultMessage } from './bindingMemo';

/** 起動中に検索するVaultメモのタイトル（大文字小文字は区別しない） */
const DICTIONARY_THINK_NAME = 'ThinktankDictionary';

/** メモ本文（1行目のタイトルを除く）。YAML として読むのはこの部分 */
function memoBody(content: string): string {
  const nl = content.indexOf('\n');
  return nl < 0 ? '' : content.slice(nl + 1);
}

export function registerTextEditorDictionaryActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.Dictionary.Load',
    Description: `Vault内の「${DICTIONARY_THINK_NAME}」という名前のMemoを読み込み、辞書をDefaultに戻してから適用する（Memoに無いキーはDefaultの状態になる）`,
    Completion: async (item) => {
      const think = findBindingMemo(app, DICTIONARY_THINK_NAME);
      if (!think) {
        item.Result = `[未検出] 「${DICTIONARY_THINK_NAME}」という名前のMemoが見つかりません`;
        return;
      }
      await think.LoadContent();
      let dict;
      try {
        dict = parseDictionary(memoBody(think.Content));
      } catch (err) {
        // 壊れたYAMLで既存の辞書を消さない
        item.Result = `[エラー] 「${DICTIONARY_THINK_NAME}」をYAMLとして読めません: ${getErrorMessage(err)}`;
        return;
      }
      // 前回までの変更を持ち越さないよう、Defaultに上書き分だけを重ねる
      applyDictionaryOverride(dict);
      item.Result = `辞書をDefaultに戻して「${DICTIONARY_THINK_NAME}」を読み込みました（${Object.keys(dict).length}件）`;
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.Dictionary.Reset',
    Description: '辞書をDefaultの状態に戻す',
    Completion: (item) => {
      resetDictionaryOverride();
      item.Result = '辞書をDefaultに戻しました';
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.Dictionary.Save',
    Description: `現在の辞書をVault内の「${DICTIONARY_THINK_NAME}」という名前のMemoに書き戻す（無ければ作る）`,
    Completion: async (item) => {
      // docs/DefaultDictionary.yaml と同じ YAML 形式。Load で読み直すと同じ状態に戻る
      const body = `# DefaultDictionary.yaml と同じ YAML 形式\n${serializeDictionary({ ...getDictionary() })}`;
      const result = await writeBindingMemo(app, DICTIONARY_THINK_NAME, body);
      item.Result = writeResultMessage('辞書', DICTIONARY_THINK_NAME, result);
    },
  });
}
