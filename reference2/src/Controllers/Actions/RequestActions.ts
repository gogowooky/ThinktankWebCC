/**
 * RequestActions.ts
 * Request統合アクション（Request.Invoke.Default, Request.Show.ContextMenu）
 */
import { TTModels } from '../../models/TTModels';
import { TTAction } from '../../models/TTAction';
import { TTApplication, CommandPaletteItem } from '../../Views/TTApplication';
import type { ActionContext, ActionScript } from '../../types';

/**
 * Request統合アクションを登録します
 */
export function registerRequestActions(
    models: TTModels,
    actions: { GetItem: (id: string) => any; GetItems: () => any[] },
    addAction: (id: string, description: string, script: ActionScript) => void
) {
    addAction('Request.Invoke.Default', 'Requestタグのデフォルトアクションを実行', (context: ActionContext) => {
        // RequestInfo は TTPanelTableBehavior.GetActiveRequest() で事前解決済み
        const requestId = context.RequestID as string;
        const requestTag = context.RequestTag as string;

        if (!requestId || !requestTag) {
            console.warn('[Request.Invoke.Default] RequestID or RequestTag is missing');
            return false;
        }

        console.log(`[Request.Invoke.Default] Invoking: ID=${requestId}, Tag=${requestTag}`);

        // Tagからクラス名を抽出: [ClassName:ID] or [ClassName]
        let className = '';
        const match = requestTag.match(/^\[([^:]+)(:.*)?]$/);
        if (match) {
            className = match[1];
        }

        // 検索順序:
        // 1. クラス固有のアクション (Request.{ClassName}.Default)
        // 2. 汎用アクション (Request.{requestId}.Default) -> requestId は TTCollection or TTObject

        let actionFn: TTAction | undefined;

        if (className) {
            actionFn = actions.GetItem(`Request.${className}.Default`); // e.g. Request.TTMemo.Default
        }

        if (!actionFn) {
            actionFn = actions.GetItem(`Request.${requestId}.Default`); // e.g. Request.TTObject.Default
        }

        // 互換性維持: Request.Memos.Default などの旧式IDも考慮する場合
        // requestId がクラス名そのものである場合もある (TTPanelTableBehaviorのフォールバック参照)
        if (!actionFn && requestId !== className && requestId !== 'TTCollection' && requestId !== 'TTObject') {
            actionFn = actions.GetItem(`Request.${requestId}.Default`);
        }

        // 最後の手段: TTRequests から取得 (Legacy)
        if (!actionFn) {
            const legacyAction = models.Requests.GetDefaultAction(requestTag, requestId);
            if (legacyAction) {
                return legacyAction.Invoke({ ...context, RequestID: requestId, RequestTag: requestTag });
            }
        }

        if (actionFn) {
            return actionFn.Invoke({ ...context, RequestID: requestId, RequestTag: requestTag });
        }

        console.log(`[Request.Invoke.Default] No action found for: ${requestTag} (${requestId})`);
        return false;
    });

    addAction('Request.Show.ContextMenu', 'Requestタグのコンテキストメニューを表示', (context: ActionContext) => {
        const requestId = context.RequestID as string;
        const requestTag = context.RequestTag as string;
        const clientX = context.ClientX as number | undefined;
        const clientY = context.ClientY as number | undefined;

        console.log(`[Request.ContextMenu] Triggered: ID=${requestId}, Tag=${requestTag}, Coords=(${clientX}, ${clientY})`);

        if (!requestId || !requestTag) {
            console.warn('[Request.Show.ContextMenu] RequestID or RequestTag is missing');
            return false;
        }

        // Tagからクラス名を抽出
        let className = '';
        const match = requestTag.match(/^\[([^:]+)(:.*)?]$/);
        if (match) {
            className = match[1];
        }

        const availableActions: TTAction[] = [];
        const allActions = actions.GetItems() as TTAction[];

        // 収集対象のプレフィックス
        // 1. Request.{ClassName}.
        // 2. Request.{requestId}. (TTCollection / TTObject)
        const prefixes: string[] = [];
        if (className) prefixes.push(`Request.${className}.`);
        prefixes.push(`Request.${requestId}.`);

        // 重複排除用セット
        const addedActionIds = new Set<string>();

        // 全アクションを走査してマッチするものを追加
        for (const action of allActions) {
            // Defaultアクションはメニューに表示しない
            if (action.ID.endsWith('.Default')) continue;

            for (const prefix of prefixes) {
                if (action.ID.startsWith(prefix)) {
                    if (!addedActionIds.has(action.ID)) {
                        availableActions.push(action);
                        addedActionIds.add(action.ID);
                    }
                }
            }
        }

        // TTRequests (Legacy)
        if (availableActions.length === 0) {
            const requestActions = models.Requests.GetActions(requestTag);
            if (requestActions) {
                availableActions.push(...requestActions);
            }
        }

        if (availableActions.length > 0) {
            const paletteItems: CommandPaletteItem[] = availableActions.map(action => ({
                id: action.ID,
                label: action.Name,
                description: action.ID,
                onClick: () => {
                    console.log(`[CommandPalette] Selected: ${action.ID}`);
                    action.Invoke({ ...context, RequestID: requestId, RequestTag: requestTag });
                }
            }));

            TTApplication.Instance.ShowCommandPalette(paletteItems, `Request: ${requestTag} ...`);
            return true;
        }
        console.log(`[Request.Show.ContextMenu] No actions found for: ${requestTag} (${requestId})`);
        return false;
    });
}
