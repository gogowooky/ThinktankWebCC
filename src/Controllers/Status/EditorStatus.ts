/**
 * EditorStatus.ts
 * [Panels].Editor.* の状態管理
 */
import { TTModels } from '../../models/TTModels';
import { GetPanel, ResolveValue, BindPanelWatch } from '../helpers/StateHelpers';

/**
 * Editor系の状態を登録します
 */
export function registerEditorStatus(models: TTModels) {
    const status = models.Status;

    // #region [Panels].Editor.* (Editorの状態)
    status.RegisterState('[Panels].Editor.Keyword', '[Panels]EditorのKeyword', {
        Default: () => '',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.SetActiveKeyword('Editor', val);
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.GetActiveKeyword('Editor'));
        }
    });
    status.RegisterState('[Panels].Editor.Keywords', '[Panels]EditorのKeywords', {
        Default: () => '',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) panel.SetKeywordsText('Editor', val);
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Keywords['Editor'] || '');
        }
    });
    status.RegisterState('[Panels].Editor.Resource', '[Panels]EditorのResource', {
        Default: () => 'thinktank',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (panel) {
                panel.Editor.Resource = val;
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.Resource);
        }
    });
    status.RegisterState('[Panels].Editor.KeywordColor', '[Panels]EditorのKeywordColor', {
        Default: () => 'Default',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const modes = ['Default', 'Subtle', 'None'] as const;
            const resolvedMode = ResolveValue(panel.KeywordColor, modes, val);

            if (resolvedMode) {
                panel.KeywordColor = resolvedMode;
                status.SetValue(id, resolvedMode);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.KeywordColor);
        }
    });
    status.RegisterState('[Panels].Editor.Wordwrap', '[Panels]のEditorWordwrap', {
        Default: () => 'off',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const options = ['on', 'off'] as const;
            const current = panel.Editor.WordWrap ? 'on' : 'off';
            const resolvedVal = ResolveValue(current, options, val);

            if (resolvedVal === 'on' || resolvedVal === 'off') {
                panel.Editor.WordWrap = (resolvedVal === 'on');
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.WordWrap ? 'on' : 'off');
        }
    });
    status.RegisterState('[Panels].Editor.Minimap', '[Panels]のEditorMinimap', {
        Default: () => 'false',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const options = ['true', 'false'] as const;
            const current = panel.Editor.Minimap ? 'true' : 'false';
            const resolvedVal = ResolveValue(current, options, val);

            if (resolvedVal === 'true' || resolvedVal === 'false') {
                panel.Editor.Minimap = (resolvedVal === 'true');
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.Minimap ? 'true' : 'false');
        }
    });
    status.RegisterState('[Panels].Editor.LineNumber', '[Panels]のEditorLineNumber', {
        Default: () => 'off',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const options = ['on', 'off'] as const;
            const current = panel.Editor.LineNumbers ? 'on' : 'off';
            const resolvedVal = ResolveValue(current, options, val);

            if (resolvedVal === 'on' || resolvedVal === 'off') {
                panel.Editor.LineNumbers = (resolvedVal === 'on');
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.LineNumbers ? 'on' : 'off');
        }
    });
    status.RegisterState('[Panels].Editor.SearchRegex', '[Panels]のEditorSearchRegex', {
        Default: () => 'false',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const options = ['true', 'false'] as const;
            const current = panel.Editor.SearchRegex ? 'true' : 'false';
            const resolvedVal = ResolveValue(current, options, val);

            if (resolvedVal === 'true' || resolvedVal === 'false') {
                panel.Editor.SearchRegex = (resolvedVal === 'true');
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.SearchRegex ? 'true' : 'false');
        }
    });
    status.RegisterState('[Panels].Editor.SearchCaseSensitive', '[Panels]のSearchCaseSensitive', {
        Default: () => 'false',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const options = ['true', 'false'] as const;
            const current = panel.Editor.SearchCaseSensitive ? 'true' : 'false';
            const resolvedVal = ResolveValue(current, options, val);

            if (resolvedVal === 'true' || resolvedVal === 'false') {
                panel.Editor.SearchCaseSensitive = (resolvedVal === 'true');
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.SearchCaseSensitive ? 'true' : 'false');
        }
    });
    status.RegisterState('[Panels].Editor.SearchWholeWord', '[Panels]のSearchWholeWord', {
        Default: () => 'false',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const options = ['true', 'false'] as const;
            const current = panel.Editor.SearchWholeWord ? 'true' : 'false';
            const resolvedVal = ResolveValue(current, options, val);

            if (resolvedVal === 'true' || resolvedVal === 'false') {
                panel.Editor.SearchWholeWord = (resolvedVal === 'true');
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.SearchWholeWord ? 'true' : 'false');
        }
    });
    status.RegisterState('[Panels].Editor.ReplaceKeepCapitalize', '[Panels]のReplaceKeepCapitalize', {
        Default: () => 'false',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const options = ['true', 'false'] as const;
            const current = panel.Editor.ReplaceKeepCapitalize ? 'true' : 'false';
            const resolvedVal = ResolveValue(current, options, val);

            if (resolvedVal === 'true' || resolvedVal === 'false') {
                panel.Editor.ReplaceKeepCapitalize = (resolvedVal === 'true');
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.ReplaceKeepCapitalize ? 'true' : 'false');
        }
    });
    status.RegisterState('[Panels].Editor.ReplaceInSelection', '[Panels]のReplaceInSelection', {
        Default: () => 'false',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const options = ['true', 'false'] as const;
            const current = panel.Editor.ReplaceInSelection ? 'true' : 'false';
            const resolvedVal = ResolveValue(current, options, val);

            if (resolvedVal === 'true' || resolvedVal === 'false') {
                panel.Editor.ReplaceInSelection = (resolvedVal === 'true');
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.ReplaceInSelection ? 'true' : 'false');
        }
    });
    status.RegisterState('[Panels].Editor.CurPos', '[Panels]のEditorCurPos', {
        Default: () => '1,1',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;
            panel.Editor.CurPos = val;
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.CurPos);
        }
    });
    status.RegisterState('[Panels].Editor.SelPos', '[Panels]のEditorSelPos', {
        Default: () => '1,1,1,1',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;
            panel.Editor.SelPos = val;
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.SelPos);
        }
    });
    status.RegisterState('[Panels].Editor.SearchMode', '[Panels]のSearchMode', {
        Default: () => 'None',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const options = ['Search', 'Replace', 'None'] as const;
            let current = status.GetValue(id) as typeof options[number];
            if (!options.includes(current)) {
                current = panel.Editor.SearchMode as typeof options[number] || 'None';
            }

            const resolvedVal = ResolveValue(current, options, val);

            if (resolvedVal) {
                panel.Editor.SearchMode = resolvedVal;
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Editor.SearchMode);
        }
    });
    // #endregion
}
