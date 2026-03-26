/**
 * ChatActions.ts
 * Phase 11 段124, 段125: AIチャット関連アクション
 *
 * 登録アクション:
 *   Chat.Open          - AIチャット画面を WebView で開く
 *   Chat.New           - 新規チャットセッションで AIチャット画面を開く
 *   Chat.Open.Selected - Tableで選択中のチャットセッションを開く
 *   Chat.SendWithMemoContext - 現在のメモをコンテキストとして AIチャットに送信（段125）
 *
 * UIはすべて /aichat ページ（WebView）経由で提供する。
 * ExDebugモードで起動されるActionとして DefaultEvents.ts に登録する。
 */

import { TTModels } from '../../models/TTModels';
import { TTApplication } from '../../Views/TTApplication';
import type { ActionContext, ActionScript } from '../../types';
import { TTMemo } from '../../models/TTMemo';

export function registerChatActions(
    models: TTModels,
    addAction: (id: string, description: string, script: ActionScript) => void
) {
    // ─────────────────────────────────────────────────────────────
    // Chat.Open: AIチャット画面を WebViewで開く（最新セッションを選択）
    // ─────────────────────────────────────────────────────────────
    addAction('Chat.Open', 'AIチャットを開く', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel || app.ActivePanel;
        if (panel) {
            panel.Mode = 'WebView';
            panel.WebView.ApplyUrl('/aichat');
            app.Focus(panel.Name, 'WebView', 'Main');
        }
    });

    // ─────────────────────────────────────────────────────────────
    // Chat.New: 新規チャットセッションで開く
    // ─────────────────────────────────────────────────────────────
    addAction('Chat.New', '新規AIチャットセッション', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel || app.ActivePanel;
        if (!panel) return;

        // 新規チャットをモデルに追加
        const chat = models.Chats.AddNewChat();

        panel.Mode = 'WebView';
        panel.WebView.ApplyUrl(`/aichat?id=${encodeURIComponent(chat.ID)}`);
        app.Focus(panel.Name, 'WebView', 'Main');
    });

    // ─────────────────────────────────────────────────────────────
    // Chat.Open.Selected: Tableで選択中のチャットセッションを開く
    // ─────────────────────────────────────────────────────────────
    addAction('Chat.Open.Selected', '選択チャットセッションを開く', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel || app.ActivePanel;
        if (!panel) return;

        // TableのCurPos から選択アイテムのIDを取得
        const curPos = models.Status.GetValue(`${panel.Name}.Table.CurPos`) || '';
        if (!curPos) return;

        panel.Mode = 'WebView';
        panel.WebView.ApplyUrl(`/aichat?id=${encodeURIComponent(curPos)}`);
        app.Focus(panel.Name, 'WebView', 'Main');
    });

    // ─────────────────────────────────────────────────────────────
    // 段125: Chat.SendWithMemoContext
    // 現在のEditorに表示中のメモをコンテキストとして AIチャットに送信
    // ─────────────────────────────────────────────────────────────
    addAction('Chat.SendWithMemoContext', 'メモをAIコンテキストとして送信', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel || app.ActivePanel;
        if (!panel) return;

        // 現在のEditorのResourceID（メモID）を取得
        const memoId = models.Status.GetValue(`${panel.Name}.Editor.Resource`) || '';
        if (!memoId) {
            console.warn('[Chat.SendWithMemoContext] メモが選択されていません');
            return;
        }

        // メモのコンテンツを取得
        const memo = models.Memos.GetItem(memoId) as TTMemo | undefined;
        const memoContent = memo?.Content || '';

        // memoContent はサイズが大きいため localStorage 経由で渡す（URLクエリ431回避）
        localStorage.setItem('tt_chat_memo_context', JSON.stringify({
            memoId,
            memoName: memo?.Name || '',
            memoContent: memoContent.substring(0, 8000),
        }));

        panel.Mode = 'WebView';
        panel.WebView.ApplyUrl('/aichat?source=memo');
        app.Focus(panel.Name, 'WebView', 'Main');
    });
}
