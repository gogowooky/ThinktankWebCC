// アクションレジストリ、同期/非同期のハイブリッド実行（仕様書04 §2）

export interface TTActionItem {
  ActionID: string;
  Result: string;
  Allow: boolean;
}

export interface TTAction {
  ActionID: string;
  Description?: string;
  Category?: string;
  Completion: (item: TTActionItem) => void | Promise<void>;
}

export class TTActions {
  private _actions = new Map<string, TTAction>();
  /** 実行ステータスの表示先（ステータスバー連携） */
  OnStatus: (actionId: string, status: string) => void = () => {};

  Register(action: TTAction): void {
    this._actions.set(action.ActionID, action);
  }

  Has(actionId: string): boolean {
    return this._actions.has(actionId);
  }

  Get(actionId: string): TTAction | undefined {
    return this._actions.get(actionId);
  }

  List(): TTAction[] {
    return [...this._actions.values()];
  }

  /** ハイブリッド実行（仕様書04 §2.2） */
  Execute(actionId: string): TTActionItem | null {
    const action = this._actions.get(actionId);
    if (!action) return null;
    const item: TTActionItem = { ActionID: actionId, Result: '', Allow: false };
    try {
      const ret = action.Completion(item);
      if (ret instanceof Promise) {
        this.OnStatus(actionId, '[実行中...]');
        ret
          .then(() => this.OnStatus(actionId, item.Result || '完了'))
          .catch((e) => this.OnStatus(actionId, `エラー: ${(e as Error).message}`));
      } else {
        this.OnStatus(actionId, item.Result || actionId);
      }
    } catch (e) {
      this.OnStatus(actionId, `エラー: ${(e as Error).message}`);
    }
    return item;
  }
}
