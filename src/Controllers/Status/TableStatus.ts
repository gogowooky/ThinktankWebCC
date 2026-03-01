/**
 * TableStatus.ts
 * [Panels].Table.* / [Panels].WebView.* / [Panels].Keyword.* の状態管理
 */
import { TTModels } from '../../models/TTModels';
import { GetPanelName, GetPanel, ResolveValue, BindPanelWatch, BindPanelWatchWithRetry } from '../helpers/StateHelpers';

/**
 * Table/WebView/Keyword系の状態を登録します
 */
export function registerTableStatus(models: TTModels) {
    const status = models.Status;

    // #region [Panels].Table.* (Tableの状態)
    status.RegisterState('[Panels].Table.Keyword', '[Panels]TableのKeyword', {
        Default: (id: string) => {
            const panelName = GetPanelName(id);
            if (panelName === 'Index') return '@7d';
            return '';
        },
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.SetActiveKeyword('Table', val);
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.GetActiveKeyword('Table'));
        }
    });
    status.RegisterState('[Panels].Table.Keywords', '[Panels]TableのKeywords', {
        Default: () => '',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.SetKeywordsText('Table', val);
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Keywords['Table'] || '');
        }
    });
    status.RegisterState('[Panels].Table.Resource', '[Panels]のTableResource', {
        Default: (id: string) => {
            const panelName = GetPanelName(id);
            const resources: Record<string, string> = {
                'Library': 'Thinktank', 'Index': 'Memos', 'Shelf': 'Memos',
                'Desk': 'Memos', 'System': 'Actions',
                'Chat': 'Events', 'Log': 'Status'
            };
            return resources[panelName] || 'Thinktank';
        },
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.Table.Resource = val;
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Table.Resource);
        }
    });
    status.RegisterState('[Panels].Table.SortDir', '[Panels]のTableSortDir', {
        Default: () => 'asc',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const dirs = ['asc', 'desc'] as const;
            const resolvedDir = ResolveValue(panel.Table.SortDir, dirs, val);

            if (resolvedDir === 'asc' || resolvedDir === 'desc') {
                panel.Table.SortDir = resolvedDir;
                if (val !== resolvedDir) status.SetValue(id, resolvedDir);
            }
        },
        Watch: (id: string) => {
            BindPanelWatchWithRetry(status, id, (panel) => panel.Table.SortDir);
        }
    });
    status.RegisterState('[Panels].Table.SortProperty', '[Panels]のTableSortProperty', {
        Default: () => '',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.Table.SortProperty = val;
        },
        Watch: (id: string) => {
            BindPanelWatchWithRetry(status, id, (panel) => panel.Table.SortProperty);
        }
    });
    status.RegisterState('[Panels].Table.CurPos', '[Panels]のTable選択位置', {
        Default: () => '0',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            // View側で相対移動やアイテム数を解決するため、
            // ここでは値をそのまま渡す（next, prev, +10, -10, first, last 等もそのまま）
            panel.Table.CurPos = val;
        },
        Watch: (id: string) => {
            BindPanelWatchWithRetry(status, id, (panel) => panel.Table.CurPos);
        }
    });
    status.RegisterState('[Panels].Table.CurrentID', '[Panels]のTable選択ID', {
        Default: () => '',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.Table.CurrentID = val;
        },
        Watch: (id: string) => {
            BindPanelWatchWithRetry(status, id, (panel) => panel.Table.CurrentID);
        }
    });
    status.RegisterState('[Panels].Table.VisibleProperties', '[Panels]のTable表示列', {
        Default: () => '',
        Apply: (id: string, val: string) => {
            // ReadOnly (Viewから書き込まれる前提だが、Apply経由で書き込むため定義は必要)
            // Model側には保存せず、Status上の一時的な値として扱う
            status.SetValue(id, val);
        },
        // Watchは不要（Viewが自発的に書き込むため）
    });
    // #endregion

    // #region [Panels].WebView.* (WebViewの状態)
    status.RegisterState('[Panels].WebView.Keyword', '[Panels]WebViewのKeyword', {
        Default: () => '',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.SetActiveKeyword('WebView', val);
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.GetActiveKeyword('WebView'));
        }
    });
    status.RegisterState('[Panels].WebView.Keywords', '[Panels]WebViewのKeywords', {
        Default: () => '',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.SetKeywordsText('WebView', val);
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Keywords['WebView'] || '');
        }
    });
    status.RegisterState('[Panels].WebView.CurPos', '[Panels]WebViewのリンク位置', {
        Default: () => '',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.WebView.CurPos = val;
        },
        Watch: (id: string) => {
            BindPanelWatchWithRetry(status, id, (panel) => panel.WebView.CurPos);
        }
    });
    // #endregion

    // #region [Panels].Keyword.* (Keywordカーソル・選択)
    status.RegisterState('[Panels].Keyword.CurPos', '[Panels]Keywordのカーソル位置', {
        Default: () => '0,0',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel || !panel.KeywordEditorHandle) return;

            const handle = panel.KeywordEditorHandle;

            switch (val) {
                case 'nextline': handle.triggerAction('cursorDown'); break;
                case 'prevline': handle.triggerAction('cursorUp'); break;
                case 'nextchar': handle.triggerAction('cursorRight'); break;
                case 'prevchar': handle.triggerAction('cursorLeft'); break;
                case 'linestart': handle.triggerAction('cursorHome'); break;
                case 'lineend': handle.triggerAction('cursorEnd'); break;
                case 'firstline': handle.triggerAction('cursorTop'); break;
                case 'lastline': handle.triggerAction('cursorBottom'); break;
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (_) => '0,0');
        }
    });

    status.RegisterState('[Panels].Keyword.SelPos', '[Panels]Keywordの選択位置', {
        Default: () => '0,0,0,0',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel || !panel.KeywordEditorHandle) return;

            const handle = panel.KeywordEditorHandle;

            switch (val) {
                case 'nextline': handle.triggerAction('cursorDownSelect'); break;
                case 'prevline': handle.triggerAction('cursorUpSelect'); break;
                case 'nextchar': handle.triggerAction('cursorRightSelect'); break;
                case 'prevchar': handle.triggerAction('cursorLeftSelect'); break;
                case 'linestart': handle.triggerAction('cursorHomeSelect'); break;
                case 'lineend': handle.triggerAction('cursorEndSelect'); break;
                case 'firstline': handle.triggerAction('cursorTopSelect'); break;
                case 'lastline': handle.triggerAction('cursorBottomSelect'); break;
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (_) => '0,0,0,0');
        }
    });
    // #endregion
}
