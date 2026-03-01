/**
 * TTPanelTableBehavior.ts
 * TTPanel の Table モード関連の機能を集約
 */

import type { IPanelModeBehavior, RequestInfo } from './IPanelModeBehavior';
import type { ActionContext } from '../types';
import { TTModels } from '../models/TTModels';
import { TTCollection } from '../models/TTCollection';
import { TTObject } from '../models/TTObject';

/**
 * TTPanel の Table モード関連の機能を管理するクラス
 */
export class TTPanelTableBehavior implements IPanelModeBehavior {
    private _panel: { ID: string; Name: string; NotifyUpdated: () => void };

    // リソース（表示中のテーブルID）
    private _resource: string = '';

    // ソート設定
    private _sortDir: 'asc' | 'desc' = 'asc';
    private _sortProperty: string = '';

    // 選択位置（1ベースのインデックス、無選択時は'0'）
    private _currentPosition: string = '0';

    // キーワード
    private _keywords: string = '';
    private _activeKeyword: string = '';

    constructor(panel: { ID: string; Name: string; NotifyUpdated: () => void }) {
        this._panel = panel;
    }

    // #region Resource
    public get Resource(): string {
        return this._resource;
    }

    public set Resource(value: string) {
        if (this._resource === value) return;
        this._resource = value;
        this._panel.NotifyUpdated();
    }
    // #endregion

    // #region Sort
    public get SortDir(): 'asc' | 'desc' {
        return this._sortDir;
    }

    public set SortDir(value: 'asc' | 'desc') {
        if (this._sortDir === value) return;
        this._sortDir = value;
        this._panel.NotifyUpdated();
    }

    public get SortProperty(): string {
        return this._sortProperty;
    }

    public set SortProperty(value: string) {
        if (this._sortProperty === value) return;
        this._sortProperty = value;
        this._panel.NotifyUpdated();
    }
    // #endregion

    // #region Position
    public get CurPos(): string {
        return this._currentPosition;
    }

    public set CurPos(value: string) {
        this._currentPosition = value;
        this._panel.NotifyUpdated();
    }
    // #endregion

    // #region CurrentID
    private _currentID: string = '';

    public get CurrentID(): string {
        return this._currentID;
    }

    public set CurrentID(value: string) {
        if (this._currentID === value) return;
        this._currentID = value;
        this._panel.NotifyUpdated();
    }
    // #endregion

    // #region Keywords
    public get Keywords(): string {
        return this._keywords;
    }

    public set Keywords(value: string) {
        if (this._keywords === value) return;
        this._keywords = value;
        this._panel.NotifyUpdated();
    }

    public get ActiveKeyword(): string {
        return this._activeKeyword;
    }

    public set ActiveKeyword(value: string) {
        if (this._activeKeyword === value) return;
        this._activeKeyword = value;
        this._panel.NotifyUpdated();
    }

    /**
     * キーワードを整形（重複除去、空行除去）
     */
    public FormatKeywords(): void {
        const text = this._keywords;
        if (!text) return;

        const lines = text.split(/\r?\n/);
        const validLines = lines.filter(line => line.trim().length > 0);
        const uniqueLines = Array.from(new Set(validLines));
        const newText = uniqueLines.join('\n');

        if (newText !== text) {
            this.Keywords = newText;
        }
    }
    // #endregion

    // #region GetActiveRequest
    /**
     * 現在のアクティブなリクエスト（選択行）を取得
     */
    public GetActiveRequest(context?: ActionContext): RequestInfo | null {
        const currentID = this.CurrentID;
        let resource = this.Resource; //letに変更

        // Resource のバリデーション（不正な値による誤動作防止）
        if (resource && resource !== 'Thinktank') {
            // IDで検索
            let collection = TTModels.Instance.GetItem(resource);
            // IDで見つからなければクラス名で検索
            if (!collection) {
                for (const item of TTModels.Instance.GetItems()) {
                    if (item.ClassName === resource) {
                        collection = item;
                        break;
                    }
                }
            }

            // コレクションとして解決できないリソース名は無視（誤設定と判断）
            if (!collection || !(collection instanceof TTCollection)) {
                console.warn(`[TTPanelTableBehavior.GetActiveRequest] Invalid Resource '${resource}' found in ${this._panel.Name}. Treating as empty.`);
                resource = '';
            }
        }

        console.log(`[TTPanelTableBehavior.GetActiveRequest] Panel=${this._panel.Name}, CurrentID='${currentID}', Resource='${resource}'`);

        if (!currentID) return null;

        let requestTag = '';
        let requestId = '';

        // アイテム特定ロジック
        let item: TTObject | undefined;

        if (resource && resource !== 'Thinktank') {
            // Resource指定あり (e.g. 'Memos', 'TTMemos', etc.)
            let collection = TTModels.Instance.GetItem(resource);
            if (!collection) {
                // IDで見つからなければクラス名で検索
                for (const col of TTModels.Instance.GetItems()) {
                    if (col.ClassName === resource) {
                        collection = col;
                        break;
                    }
                }
            }

            if (collection instanceof TTCollection) {
                item = collection.GetItem(currentID);
            }
        } else {
            // Resourceなし or Thinktank (ルート検索)
            item = TTModels.Instance.GetItem(currentID);
            if (!item) {
                // Memosフォールバック (従来の挙動維持のため)
                item = TTModels.Instance.Memos.GetItem(currentID);
            }
        }

        if (item) {
            const className = item.ClassName;
            // ClassName を優先したアクション検索を行うためのTag
            // Tagには具体的なクラス名とIDを含める: [ClassName:ID]
            requestTag = `[${className}:${item.ID}]`;

            if (item instanceof TTCollection) {
                // コレクションの場合の基底ID
                requestId = 'TTCollection';
            } else if (item instanceof TTObject) {
                // 通常オブジェクトの場合の基底ID
                requestId = 'TTObject';
            } else {
                // 万が一 TTObject 以外が混入した場合 (現状の型定義ではありえないが念のため)
                requestId = className;
            }
        } else {
            // アイテムが見つからない場合 (Memosなどの特殊ケース互換)
            if (resource === 'Memos') {
                requestId = 'Memo';
                requestTag = `[Memo:${currentID}]`;
            } else {
                // 特定不能
                return null;
            }
        }

        // 座標計算（必要に応じて）
        let clientX = context?.ClientX as number | undefined;
        let clientY = context?.ClientY as number | undefined;

        if (clientX === undefined || clientY === undefined) {
            const selector = `[data-item-id="${currentID}"]`;
            const element = document.querySelector(selector);
            if (element) {
                const rect = element.getBoundingClientRect();
                clientX = rect.left + 20;
                clientY = rect.bottom;
            }
        }

        return { requestId, requestTag, clientX, clientY };
    }
    // #endregion

    public GetTitleSuffix(): string {
        const resource = this.Resource || 'Thinktank'; // デフォルトはThinktankとするか、空の場合は空にするか。ここではResource名を表示

        let visibleCount = 0;
        let totalCount = 0;

        let collection = TTModels.Instance?.GetItem(resource);
        // IDで見つからなければクラス名で検索
        if (!collection && TTModels.Instance) {
            for (const item of TTModels.Instance.GetItems()) {
                if (item.ClassName === resource) {
                    collection = item;
                    break;
                }
            }
        }
        // それでも見つからず、TTModels自身がリソースの場合はTTModels.Instanceを使う
        if (!collection && TTModels.Instance?.ID === resource) {
            collection = TTModels.Instance;
        }

        if (collection instanceof TTCollection) {
            totalCount = collection.Count;
            // 現状、Behavior側でフィルタリング後の件数を知る術がないため、全件数を表示
            // 将来的にはView側からVisibleCountをセットしてもらう仕組みが必要かもしれない
            visibleCount = totalCount;
        }

        const currentId = this.CurrentID ? ` | ${this.CurrentID}` : '';

        return ` | ${resource} (${visibleCount}/${totalCount})${currentId}`;
    }
}
