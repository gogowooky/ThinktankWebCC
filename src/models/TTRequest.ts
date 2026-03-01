import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';
import type { TTAction } from './TTAction';
import type { TTModels } from './TTModels';
import { invalidatePatternCache } from '../services/RequestLinkProvider';

/**
 * リクエスト定義クラス
 * 与えられた文字列に応じてActionを返す
 */
export class TTRequest extends TTObject {
    /** 正規表現パターン（文字列形式） */
    public Determinant: string = '';

    public override get ClassName(): string {
        return 'TTRequest';
    }

    constructor() {
        super();
        this.ID = '';
        this.Name = '';
        this.UpdateDate = this.getNowString();
    }
}

/**
 * リクエストコレクションクラス
 */
export class TTRequests extends TTCollection {
    private _models: TTModels | null = null;

    public override get ClassName(): string {
        return 'TTRequests';
    }

    constructor(models?: TTModels) {
        super();
        this._models = models || null;
        this.ItemSaveProperties = "ID,Name,Determinant,UpdateDate";
        this.ListPropertiesMin = "ID,Name";
        this.ListProperties = "ID,Name,Determinant";
        this.ColumnMapping = "ID:リクエストID,Name:名前,Determinant:判定パターン";
        this.ColumnMaxWidth = "ID:30,Name:40,Determinant:60";
    }

    protected CreateChildInstance(): TTObject {
        return new TTRequest();
    }

    /**
     * アイテム追加時にパターンキャッシュを無効化
     */
    public override AddItem(item: TTObject): TTObject {
        const result = super.AddItem(item);
        invalidatePatternCache();
        return result;
    }

    /**
     * tagとDeterminantがマッチする子アイテムを取得し、
     * TTAction(ID.subID.Default)を返します。
     * @param tag 検索対象の文字列
     * @returns マッチしたTTAction、またはundefined
     */
    public GetDefaultAction(tag: string, requestId?: string): TTAction | undefined {
        if (!this._models) return undefined;

        // requestIdが指定されている場合は、直接アクションを返す
        // (Table/WebViewモードから既にrequestIdが特定されている場合)
        if (requestId) {
            const actionID = `Request.${requestId}.Default`;
            const action = this._models.Actions.GetItem(actionID);
            if (action) {
                return action;
            }
            // アクションが見つからない場合は、フォールバックとして全パターン検索に進む
        }

        for (const item of this.GetItems()) {
            const request = item as TTRequest;
            // requestId指定時はすでにチェック済みなのでスキップ（厳密には不要だが効率のため）
            if (requestId && request.ID === requestId) continue;

            if (!request.Determinant) continue;

            try {
                const regex = new RegExp(request.Determinant);
                const match = tag.match(regex);
                if (match) {
                    // match[1]がある場合は subID として使用可能だが、
                    // アクションIDは常に Request.{requestId}.Default 形式
                    const actionID = `Request.${request.ID}.Default`;
                    return this._models.Actions.GetItem(actionID);
                }
            } catch (e) {
                console.error(`Invalid regex in TTRequest ${request.ID}:`, e);
            }
        }

        return undefined;
    }

    /**
     * tagとDeterminantがマッチする子アイテムを取得し、
     * TTAction(ID.subID.Default以外)の配列を返します。
     * @param tag 検索対象の文字列
     * @returns マッチしたTTActionの配列、またはundefined
     */
    public GetActions(tag: string): TTAction[] | undefined {
        if (!this._models) return undefined;

        const results: TTAction[] = [];

        for (const item of this.GetItems()) {
            const request = item as TTRequest;
            if (!request.Determinant) continue;

            try {
                const regex = new RegExp(request.Determinant);
                const match = tag.match(regex);
                if (match && match.length >= 2) {
                    // match[1]をsubIDとして使用
                    const subID = match[1];
                    const prefix = `${request.ID}.${subID}.`;

                    // Actionsから該当するアクションを検索
                    for (const action of this._models.Actions.GetItems()) {
                        if (action.ID.startsWith(prefix) && !action.ID.endsWith('.Default')) {
                            results.push(action as TTAction);
                        }
                    }
                }
            } catch (e) {
                console.error(`Invalid regex in TTRequest ${request.ID}:`, e);
            }
        }

        return results.length > 0 ? results : undefined;
    }

    public override async LoadCache(): Promise<void> {
        this.IsLoaded = true;
    }
}
