/**
 * TTActions.ts
 * TTAction のグローバルレジストリ（シングルトンクラス）。
 */

import type { TTAction, TTActionItem, ActionID } from './TTAction';

export class TTActions {
  private static readonly _registry = new Map<ActionID, TTAction>();

  /** アクションを登録する */
  static Register(action: TTAction): void {
    this._registry.set(action.ActionID, action);
  }

  /** ActionID でアクションを取得する */
  static Get(actionId: ActionID): TTAction | undefined {
    return this._registry.get(actionId);
  }

  /** 登録済みか確認する */
  static Has(actionId: ActionID): boolean {
    return this._registry.has(actionId);
  }

  /**
   * アクションを実行し、TTActionItem または Promise<TTActionItem> を返す。
   * 未登録の ActionID の場合は Result に "[未定義]" メッセージを設定する。
   */
  static Execute(actionId: ActionID): TTActionItem | Promise<TTActionItem> {
    const item: TTActionItem = { ActionID: actionId, Result: '', Allow: false };
    const action = this._registry.get(actionId);
    
    if (action) {
      try {
        const res = action.Completion(item);
        if (res instanceof Promise) {
          return res.then(() => item).catch(err => {
            item.Result = `[エラー] ${err.message}`;
            return item;
          });
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    } else {
      item.Result = `[未定義] ${actionId}`;
    }
    return item;
  }

  /** 登録されているすべてのアクションを取得する */
  static GetRegisteredActions(): TTAction[] {
    return Array.from(this._registry.values());
  }
}
