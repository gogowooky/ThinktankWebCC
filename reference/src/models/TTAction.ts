import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';
import type { TTModels } from './TTModels';
import type { ActionContext, ActionScript } from '../types';

/**
 * アクション定義クラス
 */
export class TTAction extends TTObject {
    private _script: ActionScript = () => { };

    public override get ClassName(): string {
        return 'TTAction';
    }

    constructor() {
        super();
        this.ID = '';
        this.Name = '';
        this.UpdateDate = this.getNowString();
    }

    public set Script(value: ActionScript) {
        this._script = value;
    }
    public get Script(): ActionScript {
        return this._script;
    }

    public static OnInvoke: ((action: TTAction) => void) | null = null;

    public Invoke(context: ActionContext = {}): boolean {
        if (TTAction.OnInvoke) {
            TTAction.OnInvoke(this);
        }

        try {
            const result = this._script(context);
            // スクリプトの返値を尊重する
            // - 明示的にfalseを返した場合はfalse
            // - undefined/void/trueの場合はtrue（後方互換性）
            return result !== false;
        } catch (e) {
            console.error(`Action ${this.ID} failed:`, e);
            return false;
        }
    }
}

/**
 * アクションコレクションクラス
 */
export class TTActions extends TTCollection {
    private _dynamicResolver: ((id: string) => TTAction | undefined) | null = null;

    public override get ClassName(): string {
        return 'TTActions';
    }

    constructor(_models?: TTModels) {
        super();
        this.ItemSaveProperties = "ID,Name,UpdateDate";
        this.ListPropertiesMin = "ID,Name";
        this.ListProperties = "ID,Name";
        this.ColumnMapping = "ID:アクションID,Name:簡易説明";
        this.ColumnMaxWidth = "ID:30,Name:100";
    }

    /**
     * 動的アクション解決用のリゾルバを設定します（DefaultActions.ts等で定義）
     * @param resolver IDを受け取りTTActionを返す関数
     */
    public SetDynamicResolver(resolver: (id: string) => TTAction | undefined) {
        this._dynamicResolver = resolver;
    }

    public GetItem(id: string): TTAction | undefined {
        const item = super.GetItem(id);
        if (item instanceof TTAction) {
            return item;
        }

        // 動的アクションの解決（外部注入されたロジックを使用）
        if (this._dynamicResolver) {
            const dynamicAction = this._dynamicResolver(id);
            if (dynamicAction) {
                // 生成されたアクションをキャッシュする場合はここでAddItemする
                this.AddItem(dynamicAction);
                return dynamicAction;
            }
        }

        return undefined;
    }

    public override async LoadCache(): Promise<void> {
        this.IsLoaded = true;
    }
}
