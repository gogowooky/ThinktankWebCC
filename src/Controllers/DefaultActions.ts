/**
 * DefaultActions.ts
 * アクション初期化の統合エントリポイント
 *
 * 各カテゴリのアクション登録は Actions/ 配下のファイルに分離されています。
 * どのカテゴリにも該当しないアクションはこのファイルに直接追加してください。
 */
import { TTModels } from '../models/TTModels';
import { TTAction, TTActions } from '../models/TTAction';
import { TTApplication } from '../Views/TTApplication';
import type { ActionContext, ActionScript } from '../types';

// 各カテゴリの登録関数
import { registerApplicationActions } from './Actions/ApplicationActions';
import { registerEditorActions } from './Actions/EditorActions';
import { registerRequestActions } from './Actions/RequestActions';
import { registerModelActions } from './Actions/ModelActions';
import { registerTableActions } from './Actions/TableActions';

export function InitializeDefaultActions(models: TTModels) {
    const actions = models.Actions;

    // ヘルパー関数: アクションの追加
    function AddAction(id: string, description: string, script: ActionScript) {
        const action = new TTAction();
        action.ID = id;
        action.Name = description;
        action.Script = script;
        actions.AddItem(action);
    }

    // 動的アクションリゾルバの設定 (StateID:Value パターン用)
    if (actions instanceof TTActions) {
        actions.SetDynamicResolver((id: string) => {
            // パターンチェック: "StateID:Value"
            const parts = id.split(':');
            if (parts.length === 2 && parts[1]) {
                const stateID = parts[0];
                const val = parts[1];

                const action = new TTAction();
                action.ID = id;
                action.Name = `${stateID} に ${val} を設定`;
                action.Script = (_context: ActionContext) => {
                    const app = TTApplication.Instance;

                    let targetStateID = stateID;
                    // (Panel) or [Panels] or (ExPanel) の置換
                    // ExCurrentPanel を使用して、ExMode時はターゲットパネル、通常時はActivePanelを取得
                    if (targetStateID.includes('(Panel)') || targetStateID.includes('(ExPanel)') || targetStateID.includes('(Tool)')) {
                        const panel = app.ExCurrentPanel;
                        if (panel) {
                            targetStateID = targetStateID.replace('(Panel)', panel.Name);
                            targetStateID = targetStateID.replace('(ExPanel)', panel.Name);
                            targetStateID = targetStateID.replace('(Mode)', panel.Mode);
                        }
                    }

                    models.Status.ApplyValue(targetStateID, val);
                };
                return action;
            }
            return undefined;
        });
    }

    // === 各カテゴリのアクションを登録 ===
    registerApplicationActions(models, AddAction);
    registerEditorActions(models, actions, AddAction);
    registerRequestActions(models, actions, AddAction);
    registerModelActions(models, actions, AddAction);
    registerTableActions(models, AddAction);

    // === 未分類アクション ===
    // どのカテゴリにも該当しないアクションはここに追加してください。
    // カテゴリが明確になった時点で適切なファイルへ移動してください。

    AddAction('WebView.OpenSearch', '検索画面を開く', (_context) => {
        const app = TTApplication.Instance;
        const panel = app.ActivePanel;
        if (panel) {
            panel.Mode = 'WebView';
            panel.WebView.ApplyUrl('/ttsearch');
            app.Focus(panel.Name, 'WebView', 'Keyword');
        }
    });

    AddAction('WebView.Action.Search', 'WebViewで全文検索画面を表示', (_context) => {
        const app = TTApplication.Instance;
        const panel = app.ActivePanel;
        if (panel) {
            panel.WebView.ApplyUrl('/ttsearch');
            app.Focus(panel.Name, 'WebView', 'Keyword');
        }
    });

    AddAction('WebView.Keyword.Query', 'WebViewキーワード欄の入力を実行', (_context) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel || app.ActivePanel;
        if (!panel) return;

        // KeywordEditorHandleからカーソル行のテキストを取得
        const keywordHandle = panel.KeywordEditorHandle;
        let queryText = '';
        if (keywordHandle) {
            // Monaco Editorインスタンスを取得してカーソル行のテキストを取得
            const editor = keywordHandle.getEditor?.();
            if (editor) {
                const model = editor.getModel?.();
                const position = editor.getPosition?.();
                if (model && position) {
                    const lineContent = model.getLineContent(position.lineNumber);
                    queryText = lineContent?.trim() || '';
                }
            }
        }
        // KeywordEditorHandleが取得できない場合はActiveKeywordを使用
        if (!queryText) {
            queryText = panel.WebView.ActiveKeyword?.trim() || '';
        }

        if (!queryText) {
            console.log('[WebView.Keyword.Query] 入力テキストが空です');
            return;
        }

        console.log(`[WebView.Keyword.Query] Query: "${queryText}"`);

        // 絶対URL (http://, https://) または相対URL (/ で始まる) かどうか判定
        const isAbsoluteUrl = /^https?:\/\//i.test(queryText);
        const isRelativeUrl = queryText.startsWith('/');

        if (isAbsoluteUrl || isRelativeUrl) {
            // URLとしてWebViewに適用
            panel.WebView.ApplyUrl(queryText);
        } else {
            // その他の文字列 → UIRequestTriggeredAction で検索
            app.UIRequestTriggeredAction({
                Key: 'ENTER',
                Mods: [],
                RequestID: 'TTObject',
                RequestTag: `[TTSearch:${queryText}]`
            });
        }
    });
}