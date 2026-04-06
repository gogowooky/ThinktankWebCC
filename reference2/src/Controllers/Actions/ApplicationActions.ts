/**
 * ApplicationActions.ts
 * Application系アクション（NoAction, Delegate, Cache, Memo管理等）
 */
import { TTModels } from '../../models/TTModels';
import { TTCollection } from '../../models/TTCollection';
import { TTApplication } from '../../Views/TTApplication';
import { StorageManager } from '../../services/storage';
import { TTMemo } from '../../models/TTMemo';
import type { ActionContext, ActionScript } from '../../types';

/**
 * Application系アクションを登録します
 */
export function registerApplicationActions(
    models: TTModels,
    addAction: (id: string, description: string, script: ActionScript) => void
) {
    addAction('Application.Command.NoAction', '何もしない', (_context: ActionContext) => {
        return true;
    });
    addAction('Application.Command.Delegate', '委任', (_context: ActionContext) => {
        return false;
    });
    addAction('Panel.Keyword.Clear', 'パネルキーワードクリア', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        if (panel) {
            const mode = panel.Mode;
            models.Status.ApplyValue(`${panel.Name}.${mode}.Keyword`, '');
        }
    });
    addAction('Application.Memo.Renew', 'メモキャッシュを更新', async (_context: ActionContext) => {
        console.log('[Application.Memo.Renew] スキャンを開始します...');

        const memos = models.Memos;

        // 既存アイテムをクリア
        memos.ClearItems();

        // BigQueryから同期
        await memos.SyncWithBigQuery();

        console.log(`[Application.Memo.Renew] 完了: ${memos.Count} 件のメモを読み込みました`);
    });
    addAction('Application.AllCollection.Save', 'すべてのキャッシュを保存', async (_context: ActionContext) => {
        const root = models; // TTModels instance
        const collections = root.GetItems();

        console.log('[Application.AllCollection.Save] すべてのコレクションを同期中...');
        const savePromises = collections.map(async (item) => {
            if (item instanceof TTCollection) {
                await item.FlushCache();
            } else if (typeof (item as any).FlushCache === 'function') {
                await (item as any).FlushCache();
            }
        });

        await Promise.all(savePromises);
        console.log('[Application.AllCollection.Save] すべてのコレクションの同期が完了しました');
        return true;
    });
    addAction('Application.Memos.Save', 'メモを保存', async (_context: ActionContext) => {
        console.log('[Application.Memos.Save] メモを同期中...');
        await models.Memos.FlushCache();
        console.log('[Application.Memos.Save] メモの同期が完了しました');
        return true;
    });
    addAction('Application.Cache.Clear', 'ローカルキャッシュをクリア', async (_context: ActionContext) => {
        console.log('[Application.Cache.Clear] ローカルキャッシュをクリア中...');
        await StorageManager.clearCache();
        console.log('[Application.Cache.Clear] ローカルキャッシュをクリアしました');
        return true;
    });
    addAction('Application.Cache.Rebuild', 'キャッシュを再構築', async (_context: ActionContext) => {
        console.log('[Application.Cache.Rebuild] キャッシュを再構築中...');
        await StorageManager.rebuildCache();
        console.log('[Application.Cache.Rebuild] キャッシュを再構築しました');
        return true;
    });

    // 段113: メモ削除（論理削除）
    addAction('Application.Memo.Delete', 'メモを削除', async (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel ?? app.ActivePanel;
        if (!panel) return false;

        const memoId = panel.Editor.Resource;
        if (!memoId) {
            console.warn('[Application.Memo.Delete] 削除対象のメモが選択されていません');
            return false;
        }

        // 確認ダイアログ
        const memo = models.Memos.GetItem(memoId) as TTMemo | undefined;
        const memoTitle = memo?.Name ?? memoId;
        const confirmed = window.confirm(`メモ「${memoTitle}」を削除しますか？\nこの操作は取り消せません。`);
        if (!confirmed) return false;

        try {
            // BQから削除（DELETE API: 物理削除）
            const response = await fetch(`/api/bq/files/${encodeURIComponent(memoId)}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            // TTMemosコレクションからも削除
            models.Memos.DeleteItem(memoId);

            // エディタのリソースをクリア（次のメモへ）
            const remaining = models.Memos.GetItems();
            const nextMemo = remaining[0] as TTMemo | undefined;
            if (nextMemo) {
                panel.Editor.Resource = nextMemo.ID;
            } else {
                panel.Editor.Resource = '';
            }

            console.log(`[Application.Memo.Delete] 削除完了: ${memoId}`);
            return true;
        } catch (e) {
            console.error('[Application.Memo.Delete] 削除失敗:', e);
            window.alert(`削除に失敗しました: ${e}`);
            return false;
        }
    });

    // 段116: テキストからメモ作成（インポート）
    addAction('Application.Memo.ImportFromText', 'テキストからメモ作成', async (context: ActionContext) => {
        let text = '';

        // DroppedDataからテキストを取得
        if (context.DroppedData) {
            const d = context.DroppedData as any;
            if (typeof d === 'string') {
                text = d;
            } else if (typeof d.text === 'string') {
                text = d.text;
            }
        }

        // クリップボードにフォールバック
        if (!text) {
            try {
                text = await navigator.clipboard.readText();
            } catch {
                // クリップボード読み取り失敗時は空文字
            }
        }

        if (!text.trim()) {
            console.warn('[Application.Memo.ImportFromText] インポートするテキストがありません');
            return false;
        }

        // 新規メモを作成してテキストを設定
        const memo = models.Memos.AddNewMemo();
        memo.Content = text;
        await memo.SaveContent();

        // 作成したメモをアクティブパネルのエディタで開く
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel ?? app.ActivePanel;
        if (panel) {
            panel.Editor.Resource = memo.ID;
        }

        console.log(`[Application.Memo.ImportFromText] インポート完了: ${memo.ID}`);
        return true;
    });
}
