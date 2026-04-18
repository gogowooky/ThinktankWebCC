/**
 * FacilitatorActions.ts
 * Phase 12 段266・段267・段268: AI Facilitator関連アクション
 *
 * 登録アクション:
 *   AI.Suggestion.Open       - 提案のメモをDeskパネルのEditorで開く
 *   AI.Suggestion.Dismiss    - 提案を却下
 *   AI.Suggestion.DismissAll - すべての提案を却下
 *   AI.Suggestion.OpenPanel  - 提案一覧をWebViewで開く（ExDebug登録）
 *   AI.Tag.BatchAll          - 全メモに自動タグ付与（Ctrl+Shift+T）
 *   AI.Tag.OnSave            - メモ保存時自動タグ付与
 *   AI.Facilitator.Toggle    - Facilitatorの有効/無効切替
 *   AI.Facilitator.RunNow    - 記念日リコールを手動実行（ExDebug登録）
 *
 * ※ UI関連の機能はExDebugモードから起動されるActionとして DefaultEvents.ts に登録する。
 */

import { TTModels } from '../../models/TTModels';
import { TTApplication } from '../../Views/TTApplication';
import type { ActionScript } from '../../types';
import { TTSuggestion } from '../../models/TTSuggestion';
import { AutoTagEngine } from '../../services/ai/AutoTagEngine';
import type { TTMemo } from '../../models/TTMemo';

export function registerFacilitatorActions(
    models: TTModels,
    addAction: (id: string, description: string, script: ActionScript) => void
) {
    // ─────────────────────────────────────────────────────────────
    // 段266: AI.Suggestion.Open - 提案のメモを開く
    // ─────────────────────────────────────────────────────────────
    addAction('AI.Suggestion.Open', '提案のメモを開く', (_context) => {
        const app = TTApplication.Instance;
        const suggestions = models.Suggestions.getActiveSuggestions();
        if (suggestions.length === 0) return;

        const top = suggestions[0];
        const memoId = top.RelatedMemoIds.split(',')[0].trim();
        if (!memoId) return;

        // DeskパネルのEditorで対象メモを開く
        const desk = app.GetPanel('Desk');
        if (desk) {
            desk.Mode = 'Editor';
            models.Status.ApplyValue('Desk.Editor.Resource', memoId);
            app.Focus('Desk', 'Editor', 'Main');
        }

        // 提案をアクション済みにする
        top.ActedOn = true;
        top.NotifyUpdated();
    });

    // ─────────────────────────────────────────────────────────────
    // 段266: AI.Suggestion.Dismiss - 提案を却下
    // ─────────────────────────────────────────────────────────────
    addAction('AI.Suggestion.Dismiss', '提案を却下', (_context) => {
        const suggestions = models.Suggestions.getActiveSuggestions();
        if (suggestions.length === 0) return;

        const top = suggestions[0];
        top.Dismissed = true;
        top.NotifyUpdated();
    });

    // ─────────────────────────────────────────────────────────────
    // 段266: AI.Suggestion.DismissAll - すべての提案を却下
    // ─────────────────────────────────────────────────────────────
    addAction('AI.Suggestion.DismissAll', 'すべての提案を却下', (_context) => {
        const suggestions = models.Suggestions.getActiveSuggestions();
        for (const s of suggestions) {
            (s as TTSuggestion).Dismissed = true;
            s.NotifyUpdated();
        }
        console.log(`[AI.Suggestion.DismissAll] ${suggestions.length}件却下`);
    });

    // ─────────────────────────────────────────────────────────────
    // 段266: AI.Suggestion.OpenPanel - AI提案パネルをWebViewで開く
    // ExDebug モードから 'F' キーで起動
    // ─────────────────────────────────────────────────────────────
    addAction('AI.Suggestion.OpenPanel', 'AI提案パネルを開く', (_context) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel || app.GetPanel('Chat');
        if (panel) {
            // 提案データを localStorage 経由で WebView に渡す
            const suggestions = models.Suggestions.getActiveSuggestions();
            localStorage.setItem('tt_suggestions', JSON.stringify(suggestions));
            panel.Mode = 'WebView';
            panel.WebView.ApplyUrl('/aisuggestions');
            app.Focus(panel.Name, 'WebView', 'Main');
        }
    });

    // ─────────────────────────────────────────────────────────────
    // 段267: AI.Tag.BatchAll - 全メモに自動タグ付与（バッチ処理）
    // ─────────────────────────────────────────────────────────────
    addAction('AI.Tag.BatchAll', '全メモに自動タグ付与', async (_context) => {
        const memos = models.Memos.GetItems() as TTMemo[];
        const engine = new AutoTagEngine();
        let processed = 0;
        const total = memos.length;

        for (const memo of memos) {
            if (memo.Keywords) continue; // 既にタグがあるメモはスキップ

            // コンテンツがなければロードを試みる
            if (!memo.IsLoaded && !memo.Content) {
                // LoadContent は TTMemo に定義されている場合のみ呼ぶ
                if (typeof (memo as any).LoadContent === 'function') {
                    try { await (memo as any).LoadContent(); } catch { continue; }
                }
            }

            if (!memo.Content || memo.Content.length < 50) continue;

            await engine.tagOnSave(memo);
            processed++;

            // 進捗をStatusBarに表示
            models.Status.SetValue('Application.StatusMessage',
                `自動タグ付与中: ${processed}/${total}`);

            // APIレート制限対策: 1秒間隔
            await new Promise(r => setTimeout(r, 1000));
        }

        models.Status.SetValue('Application.StatusMessage',
            `自動タグ付与完了: ${processed}件処理`);
        console.log(`[AI.Tag.BatchAll] ${processed}件処理完了`);
    });

    // ─────────────────────────────────────────────────────────────
    // 段267: AI.Tag.OnSave - メモ保存時自動タグ付与
    // ─────────────────────────────────────────────────────────────
    addAction('AI.Tag.OnSave', 'メモ保存時自動タグ付与', async (context) => {
        const memo = context?.Sender as TTMemo | undefined;
        if (!memo || memo.Keywords) return; // 既にタグがあればスキップ

        const engine = new AutoTagEngine();
        await engine.tagOnSave(memo);
    });

    // ─────────────────────────────────────────────────────────────
    // 段268: AI.Facilitator.Toggle - Facilitatorの有効/無効切替
    // ─────────────────────────────────────────────────────────────
    addAction('AI.Facilitator.Toggle', 'Facilitatorの有効/無効切替', (_context) => {
        const app = TTApplication.Instance;
        const current = models.Status.GetValue('AI.Facilitator.Enabled');
        if (current === 'true') {
            models.Status.SetValue('AI.Facilitator.Enabled', 'false');
            app.stopFacilitator();
            models.Status.SetValue('Application.StatusMessage', 'AI Facilitator: 無効');
        } else {
            models.Status.SetValue('AI.Facilitator.Enabled', 'true');
            app.startFacilitator(models);
            models.Status.SetValue('Application.StatusMessage', 'AI Facilitator: 有効');
        }
    });

    // ─────────────────────────────────────────────────────────────
    // 段268: AI.Facilitator.RunNow - 記念日リコールを手動実行
    // ExDebug モードから 'R' キーで起動
    // ─────────────────────────────────────────────────────────────
    addAction('AI.Facilitator.RunNow', '記念日リコールを今すぐ実行', async (_context) => {
        const app = TTApplication.Instance;
        models.Status.SetValue('Application.StatusMessage', 'AI Facilitator: リコール実行中...');
        await app._runAnniversaryRecall(models);
        await app._runRelatedRecall(models);
        models.Status.SetValue('Application.StatusMessage',
            `AI Facilitator: リコール完了 (${models.Suggestions.getActiveSuggestions().length}件)`);
    });
}
