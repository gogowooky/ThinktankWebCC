/**
 * ApplicationActions.ts
 * Application系アクション（NoAction, Delegate, Cache, Memo管理等）
 */
import { TTModels } from '../../models/TTModels';
import { TTCollection } from '../../models/TTCollection';
import { TTApplication } from '../../Views/TTApplication';
import { StorageManager } from '../../services/storage';
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
}
