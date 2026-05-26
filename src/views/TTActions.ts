/**
 * TTActions.ts
 * TTAction のグローバルレジストリ（シングルトンクラス）。
 *
 * 使い方:
 *   // 登録
 *   TTActions.Register({ ActionID: 'SaveFile', Completion: item => { ... item.Result = 'saved'; } });
 *
 *   // 実行（TTShortcutManager から自動呼び出し）
 *   const result = TTActions.Execute('SaveFile');
 */

import type { TTAction, TTActionItem } from './TTAction';

export class TTActions {
  private static readonly _registry = new Map<string, TTAction>();

  /** アクションを登録する */
  static Register(action: TTAction): void {
    this._registry.set(action.ActionID, action);
  }

  /** ActionID でアクションを取得する */
  static Get(actionId: string): TTAction | undefined {
    return this._registry.get(actionId);
  }

  /** 登録済みか確認する */
  static Has(actionId: string): boolean {
    return this._registry.has(actionId);
  }

  /**
   * アクションを同期実行し、TTActionItem を返す。
   * 未登録の ActionID の場合は Result に "[未定義]" メッセージを設定する。
   */
  static Execute(actionId: string): TTActionItem {
    const item: TTActionItem = { ActionID: actionId, Result: '', Allow: false };
    const action = this._registry.get(actionId);
    if (action) {
      action.Completion(item);
    } else {
      item.Result = `[未定義] ${actionId}`;
    }
    return item;
  }
}
