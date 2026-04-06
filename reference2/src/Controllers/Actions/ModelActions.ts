/**
 * ModelActions.ts
 * Memo/TTMemo/TTAction/TTModel/TTCollection/TTObject 系アクション
 */
import { TTModels } from '../../models/TTModels';
import { TTRequest } from '../../models/TTRequest';
import { TTApplication } from '../../Views/TTApplication';
import type { ActionContext, ActionScript } from '../../types';

/**
 * Model/Request系アクションを登録します
 */
export function registerModelActions(
    models: TTModels,
    actions: { GetItem: (id: string) => any },
    addAction: (id: string, description: string, script: ActionScript) => void
) {
    // === Memo ===
    addAction('Request.Memo.Default', 'Memoのデフォルトアクションを実行', (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.Memo.Default]が起動しました： ${requestTag}`);
        actions.GetItem('Request.Memo.Open')?.Invoke(context);
    });
    addAction('Request.Memo.Open', 'Memoを開く', (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.Memo.Open]が起動しました：    ${requestTag}`);

        // TargetPanel（常にActivePanel）でMemoを開く
        // SourcePanel/TargetPanelはUIRequestTriggeredActionで自動設定済み
        const targetPanel = (context.TargetPanel as string) || TTApplication.Instance.ActivePanel?.Name || 'Desk';

        const validRequest = models.Requests.GetItem('Memo') as TTRequest | undefined;
        if (validRequest && validRequest.Determinant) {
            try {
                const regex = new RegExp(validRequest.Determinant);
                const match = requestTag.match(regex);

                if (match && match.groups) {
                    const param1 = match.groups.param1;
                    const param2 = match.groups.param2;

                    if (param1) {
                        models.Status.SetValue(`${targetPanel}.Current.Mode`, 'Editor');
                        models.Status.SetValue(`${targetPanel}.Current.Tool`, 'Main');
                        models.Status.SetValue(`${targetPanel}.Editor.Resource`, param1);

                        if (param2) {
                            models.Status.SetValue(`${targetPanel}.Editor.Keyword`, param2);
                        }

                        // ターゲットパネルをアクティブにする
                        models.Status.SetValue('Application.Current.Panel', targetPanel);

                        console.log(`[Request.Memo.Open] Done. Opened '${param1}' in ${targetPanel} (via Regex)`);
                        return; // 処理完了
                    }
                }
            } catch (e) {
                console.error('[Request.Memo.Open] Parse error:', e);
            }
        }

        // フォールバック: 正規表現にマッチしなかった場合、requestTagからIDを抽出して試行
        // Tableパネルからの呼び出しなどはここに来る
        if (requestTag) {
            // [TTMemo:xxx] 形式からIDを抽出
            const memoMatch = requestTag.match(/\[TTMemo:([^\]]+)\]/);
            const memoId = memoMatch ? memoMatch[1] : requestTag;

            console.log(`[Request.Memo.Open] Fallback: Opening by ID '${memoId}' in ${targetPanel}`);

            models.Status.SetValue(`${targetPanel}.Current.Mode`, 'Editor');
            models.Status.SetValue(`${targetPanel}.Current.Tool`, 'Main');
            models.Status.SetValue(`${targetPanel}.Editor.Resource`, memoId);

            // ターゲットパネルをアクティブにする
            models.Status.SetValue('Application.Current.Panel', targetPanel);
        }
    });
    addAction('Request.Memo.CopyTag', 'Memoタグをコピー', async (context: ActionContext) => {
        const requestTag = context.RequestTag as string;
        if (requestTag) {
            await navigator.clipboard.writeText(requestTag);
            console.log(`[Request.Memo.CopyTag] Copied: ${requestTag}`);
        }
    });
    addAction('Request.Memo.CopyContent', 'Memo内容をコピー', async (context: ActionContext) => {
        const requestTag = context.RequestTag as string;
        console.log(`[Request.Memo.CopyContent] Triggered for: ${requestTag}`);

        const validRequest = models.Requests.GetItem('Memo') as TTRequest | undefined;
        let memoId: string | undefined;

        if (validRequest && validRequest.Determinant) {
            try {
                const regex = new RegExp(validRequest.Determinant);
                const match = requestTag.match(regex);
                if (match && match.groups && match.groups.param1) {
                    memoId = match.groups.param1;
                }
            } catch (e) {
                console.error('[Request.Memo.CopyContent] Parse error:', e);
            }
        }

        // Fallback: use requestTag as ID
        if (!memoId) {
            memoId = requestTag;
        }

        if (memoId) {
            const memo = models.Memos.GetItem(memoId);
            if (memo) {
                const content = (memo as any).Content || (memo as any).Text || (memo as any).Body;
                if (content && typeof content === 'string') {
                    await navigator.clipboard.writeText(content);
                    console.log(`[Request.Memo.CopyContent] Copied content for '${memoId}'`);
                } else {
                    console.warn(`[Request.Memo.CopyContent] Content not found for '${memoId}'`);
                }
            } else {
                console.warn(`[Request.Memo.CopyContent] Memo not found: '${memoId}'`);
            }
        }
    });

    // === TTMemo ===
    addAction('Request.TTMemo.Default', 'TTMemoのデフォルトアクションを実行', (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.TTMemo.Default]が起動しました： ${requestTag}`);
        actions.GetItem('Request.TTMemo.Open')?.Invoke(context);
    });
    addAction('Request.TTMemo.Open', 'Memoを開く', (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.TTMemo.Open]が起動しました：    ${requestTag}`);
        actions.GetItem('Request.Memo.Open')?.Invoke(context);
    });
    addAction('Request.TTMemo.CopyContent', 'Memo内容をコピー', async (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.TTMemo.CopyContent]が起動しました：    ${requestTag}`);
        actions.GetItem('Request.Memo.CopyContent')?.Invoke(context);
    });

    // === TTAction ===
    addAction('Request.TTAction.Default', 'TTActionのデフォルトアクションを実行', (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.TTAction.Default]が起動しました： ${requestTag}`);
        actions.GetItem('Request.TTAction.Invoke')?.Invoke(context);
    });
    addAction('Request.TTAction.Invoke', 'Actionを実行する', (context: ActionContext) => {
        const requestTag = context.RequestTag as string;
        console.log(`[Request.TTAction.Invoke]が起動しました： ${requestTag}`);

        // requestTag から ActionID を抽出 （例: "[TTAction:Application.Font.Size:up]" → "Application.Font.Size:up"）
        let actionId = '';
        const match = requestTag.match(/^\[TTAction:([^\]]+)\]$/);
        if (match) {
            actionId = match[1];
        } else {
            // ブラケットなしの場合はそのまま使用
            actionId = requestTag;
        }

        if (!actionId) {
            console.warn('[Request.TTAction.Invoke] ActionID が取得できませんでした');
            return false;
        }

        // アクションを検索して実行
        const action = actions.GetItem(actionId);
        if (action) {
            console.log(`[Request.TTAction.Invoke] Action実行: ${actionId}`);
            return action.Invoke(context);
        }

        console.warn(`[Request.TTAction.Invoke] Action が見つかりません: ${actionId}`);
        return false;
    });

    // === TTModel ===
    addAction('Request.TTModel.Default', 'TTModelのデフォルトアクションを実行', (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.TTModel.Default]が起動しました： ${requestTag}`);
        actions.GetItem('Request.TTModel.Open')?.Invoke(context);
    });
    addAction('Request.TTModel.Open', 'Collectionを開く', (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.TTModel.Open]が起動しました： ${requestTag}`);

        // requestTagからコレクション名を抽出（例: "[TTModels]" → "TTModels"）
        const validRequest = models.Requests.GetItem('Table') as TTRequest | undefined;
        let collectionName = '';

        if (validRequest && validRequest.Determinant) {
            try {
                const regex = new RegExp(validRequest.Determinant);
                const match = requestTag.match(regex);
                if (match && match.groups && match.groups.tag) {
                    collectionName = match.groups.tag;
                }
            } catch (e) {
                console.error('[Request.TTModel.Open] Parse error:', e);
            }
        }

        // 正規表現でマッチしなかった場合、ブラケットを除去して試行
        if (!collectionName) {
            collectionName = requestTag.replace(/^\[|\]$/g, '');
        }

        if (!collectionName) return;

        // ExCurrentPanelの選択アイテムをActivePanelのTable.Resourceに割り当て
        const app = TTApplication.Instance;
        const activePanel = app.ActivePanel;
        if (!activePanel) return;

        // ActivePanelをTableモードに切り替え、Resourceを設定
        models.Status.SetValue(`${activePanel.Name}.Current.Mode`, 'Table');
        models.Status.SetValue(`${activePanel.Name}.Table.Resource`, collectionName);

        console.log(`[Request.TTModel.Open] Done. Opened collection '${collectionName}' in ${activePanel.Name}`);
    });

    // === TTCollection (Generic) ===
    addAction('Request.TTCollection.Default', 'TTCollectionのデフォルトアクションを実行', (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.TTCollection.Default]が起動しました： ${requestTag}`);
        actions.GetItem('Request.TTCollection.Open')?.Invoke(context);
    });
    addAction('Request.TTCollection.Open', 'CollectionをTableモードで開く', (context: ActionContext) => {
        let requestTag = context.RequestTag as string;
        console.log(`[Request.TTCollection.Open]が起動しました： ${requestTag}`);

        // requestTagからリソース名(クラス名)を抽出（例: "[TTMemos:Memos]" -> "TTMemos", "[TTMemos]" -> "TTMemos"）
        let resourceName = '';

        const match = requestTag.match(/^\[([^:]+)(:.*)?]$/);
        if (match) {
            if (match[2]) {
                // :ID がある場合、ID部分を使用 (:を除去)
                resourceName = match[2].substring(1);
            } else {
                // IDがない場合、クラス名を使用
                resourceName = match[1];
            }
        }

        if (!resourceName) return;

        // ActivePanelをTableモードに切り替え、Resourceを設定
        const app = TTApplication.Instance;
        const activePanel = app.ActivePanel;
        if (!activePanel) return;

        models.Status.SetValue(`${activePanel.Name}.Current.Mode`, 'Table');
        models.Status.SetValue(`${activePanel.Name}.Table.Resource`, resourceName);

        console.log(`[Request.TTCollection.Open] Done. Opened '${resourceName}' in ${activePanel.Name} (Table mode)`);
    });

    // === TTObject (Generic) ===
    addAction('Request.TTObject.Default', 'TTObjectのデフォルトアクションを実行', (_context: ActionContext) => {
        // 基本は何もしないか、何かデフォルトのビューアがあれば開く
        // TTMemoなどの個別クラスで上書きされることを想定
        console.log(`[Request.TTObject.Default] No specific action defined for this object.`);
    });

    // === TTSearch ===
    addAction('Request.TTSearch.Default', 'TTSearchのデフォルトアクション（検索画面を開く）', (context: ActionContext) => {
        const requestTag = context.RequestTag as string;
        if (!requestTag) return;

        // [TTSearch:xxx] からクエリを抽出
        const match = requestTag.match(/\[TTSearch:(.+)\]/);
        if (!match) {
            console.log(`[Request.TTSearch.Default] Invalid RequestTag: ${requestTag}`);
            return;
        }

        const query = match[1];
        // Keywords/タイトルには人間が読めるURLを保持（エンコードはiframe適用時に行う）
        const url = `/ttsearch?q=${query}`;

        console.log(`[Request.TTSearch.Default] Searching: "${query}" → URL: ${url}`);

        // WebViewに検索URLを適用
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel || app.ActivePanel;
        if (!panel) return;

        panel.WebView.ApplyUrl(url);
    });
}
