/**
 * TableActions.ts
 * Table系アクション（列幅自動調整、PanelTitle, StatusBar）
 */
import { TTModels } from '../../models/TTModels';
import { TTCollection } from '../../models/TTCollection';
import { TTApplication } from '../../Views/TTApplication';
import type { ActionContext, ActionScript } from '../../types';

/**
 * Table系アクションを登録します
 */
export function registerTableActions(
    _models: TTModels,
    addAction: (id: string, description: string, script: ActionScript) => void
) {
    addAction('Request.TableTitle.AdjustColumnWidth', 'Tableの列幅を自動調整する', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        let collection: TTCollection | undefined;

        // ActivePanelからコレクション特定 (常にこれを使用)
        const panel = app.ExCurrentPanel;
        if (panel && panel.Mode === 'Table') {
            const resourceName = panel.Table.Resource;
            let item = TTModels.Instance.GetItem(resourceName);
            if (item && item instanceof TTCollection) {
                collection = item;
            }
        }

        if (!collection) {
            console.warn('[Table.Style.AdjustColumnWidth] Collection not found.');
            return;
        }

        // 計算ロジック
        const getWidth = (str: string) => {
            let width = 0;
            for (let i = 0; i < str.length; i++) {
                // 半角: 0.85, 全角: 1.5 (ユーザー要望のため詰め気味に設定)
                width += str.charCodeAt(i) <= 255 ? 0.85 : 1.5;
            }
            return Math.ceil(width);
        };

        // プロパティリスト
        const listProps = collection.ListProperties
            ? collection.ListProperties.split(',').map(s => s.trim()).filter(s => s)
            : (collection.ListPropertiesMin ? collection.ListPropertiesMin.split(',').map(s => s.trim()).filter(s => s) : ['ID', 'Name']);

        // ヘッダーマッピング
        const mapping = new Map<string, string>();
        if (collection.ColumnMapping) {
            collection.ColumnMapping.split(',').forEach(pair => {
                const [k, v] = pair.split(':').map(s => s.trim());
                if (k) mapping.set(k, v || k);
            });
        }

        const newWidths: string[] = [];

        listProps.forEach(p => {
            // ヘッダー幅
            let maxW = getWidth(mapping.get(p) || p);

            // データ幅 (全量走査)
            for (const it of collection!.GetItems()) {
                const val = String((it as any)[p] || '');
                const w = getWidth(val);
                if (w > maxW) maxW = w;
                // 安全弁（50文字リミット）
                if (maxW > 50) { maxW = 50; break; }
            }

            // +1文字分の余裕
            newWidths.push(`${p}:${maxW + 1}`);
        });

        // 設定更新
        if (newWidths.length > 0) {
            collection.ColumnMaxWidth = newWidths.join(',');
            collection.NotifyUpdated();
            console.log(`[Table.Style.AdjustColumnWidth] Updated column widths for ${collection.Name}: ${collection.ColumnMaxWidth}`);
        }
    });
    addAction('Request.PanelTitle.AdjustColumnWidth', 'Tableの列幅を自動調整する', (_context: ActionContext) => {
    });
    addAction('Request.StatusBar.AdjustColumnWidth', 'Tableの列幅を自動調整する', (_context: ActionContext) => {
    });

    // Table.SortCol(1-5).(Asc/Desc/Rev) — 指定列でソート
    for (let col = 1; col <= 5; col++) {
        for (const dir of ['Asc', 'Desc', 'Rev'] as const) {
            const actionId = `Table.SortCol${col}.${dir}`;
            const desc = dir === 'Asc' ? '昇順' : dir === 'Desc' ? '降順' : '反転';
            addAction(actionId, `Table ${col}列目を${desc}ソート`, (_context: ActionContext) => {
                const app = TTApplication.Instance;
                const panel = app.ActivePanel;
                if (!panel || panel.Mode !== 'Table') return;

                // コレクションからプロパティリストを取得
                const resourceName = panel.Table.Resource;
                const item = TTModels.Instance.GetItem(resourceName);
                if (!item || !(item instanceof TTCollection)) return;

                // コレクションからプロパティリストを取得
                let listProps: string[] = [];

                // 優先: 現在表示中のプロパティリスト（Status経由でViewから取得）
                const visibleProps = TTModels.Instance.Status.GetValue(`${panel.Name}.Table.VisibleProperties`);
                if (visibleProps) {
                    listProps = visibleProps.split(',').map(s => s.trim()).filter(s => s);
                }

                // フォールバック: コレクション定義
                if (listProps.length === 0) {
                    const collection = item as TTCollection;
                    listProps = collection.ListProperties
                        ? collection.ListProperties.split(',').map(s => s.trim()).filter(s => s)
                        : (collection.ListPropertiesMin
                            ? collection.ListPropertiesMin.split(',').map(s => s.trim()).filter(s => s)
                            : ['ID', 'Name']);
                }

                // 列番号(1ベース)からプロパティ名を取得
                if (col > listProps.length) return;
                const propName = listProps[col - 1];

                // SortDirを決定（Revの場合は指定列が現在のSortPropertyなら反転、そうでなければAsc）
                let sortDir: string;
                if (dir === 'Rev') {
                    if (panel.Table.SortProperty === propName) {
                        sortDir = panel.Table.SortDir === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortDir = 'asc';
                    }
                } else {
                    sortDir = dir === 'Asc' ? 'asc' : 'desc';
                }

                // SortPropertyとSortDirを設定
                const models = TTModels.Instance;
                models.Status.ApplyValue(`${panel.Name}.Table.SortProperty`, propName);
                models.Status.ApplyValue(`${panel.Name}.Table.SortDir`, sortDir);
            });
        }
    }

    // Table.SortProp(1-5).(Asc/Desc/Rev) — 指定プロパティ（ListProperties順）でソート
    // 現状はSortColと同じだが、将来的に列入れ替え機能が入った場合に区別される可能性がある
    for (let col = 1; col <= 5; col++) {
        for (const dir of ['Asc', 'Desc', 'Rev'] as const) {
            const actionId = `Table.SortProp${col}.${dir}`;
            const desc = dir === 'Asc' ? '昇順' : dir === 'Desc' ? '降順' : '反転';
            addAction(actionId, `Table Property ${col}番目を${desc}ソート`, (_context: ActionContext) => {
                const app = TTApplication.Instance;
                const panel = app.ActivePanel;
                if (!panel || panel.Mode !== 'Table') return;

                // コレクションからプロパティリストを取得
                const resourceName = panel.Table.Resource;
                const item = TTModels.Instance.GetItem(resourceName);
                if (!item || !(item instanceof TTCollection)) return;

                const collection = item as TTCollection;
                // SortPropはItemSavePropertiesの定義順序を使用
                let listProps: string[] = [];
                if (collection.ItemSaveProperties) {
                    listProps = collection.ItemSaveProperties.split(',').map(s => s.trim()).filter(s => s);
                }

                // フォールバック
                if (listProps.length === 0) {
                    listProps = collection.ListProperties
                        ? collection.ListProperties.split(',').map(s => s.trim()).filter(s => s)
                        : (collection.ListPropertiesMin
                            ? collection.ListPropertiesMin.split(',').map(s => s.trim()).filter(s => s)
                            : ['ID', 'Name']);
                }

                // 番号(1ベース)からプロパティ名を取得
                if (col > listProps.length) return;
                const propName = listProps[col - 1];

                // SortDirを決定（Revの場合は指定プロパティが現在のSortPropertyなら反転、そうでなければAsc）
                let sortDir: string;
                if (dir === 'Rev') {
                    if (panel.Table.SortProperty === propName) {
                        sortDir = panel.Table.SortDir === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortDir = 'asc';
                    }
                } else {
                    sortDir = dir === 'Asc' ? 'asc' : 'desc';
                }

                // SortPropertyとSortDirを設定
                const models = TTModels.Instance;
                models.Status.ApplyValue(`${panel.Name}.Table.SortProperty`, propName);
                models.Status.ApplyValue(`${panel.Name}.Table.SortDir`, sortDir);
            });
        }
    }
}
