/**
 * ApplicationStatus.ts
 * Application系の状態管理（Product, Appearance, Voice, Current, Panels共通）
 */
import { TTModels } from '../../models/TTModels';
import { TTApplication } from '../../Views/TTApplication';
import { PanelModes, PanelTools, PanelNames } from '../../types';
// @ts-ignore
import commitLogRaw from '../../../commit_log.csv?raw';
import { GetPanelName, GetPanel, ResolveValue, BindPanelWatch } from '../helpers/StateHelpers';

/**
 * Application系の状態を登録します
 */
export function registerApplicationStatus(models: TTModels) {
    const status = models.Status;

    // #region Application.Product.* (製品情報 - 読み取り専用)
    status.RegisterState('Application.Product.Name', 'アプリ名', 'Thinktank');
    status.RegisterState('Application.Product.Author', '制作者', 'Shinichiro Egashira');
    status.RegisterState('Application.Product.Mail', '連絡先', 'gogowooky@gmail.com');
    status.RegisterState('Application.Product.Site', '開発サイト', 'https://github.com/gogowooky');
    status.RegisterState('Application.Product.Version', 'バージョン', {
        Default: (_id: string) => {
            try {
                const lines = commitLogRaw.split(/\r?\n/).filter((line: string) => line.trim() !== '');
                if (lines.length > 1) {
                    const lastLine = lines[lines.length - 1];
                    const parts = lastLine.split('","');
                    if (parts.length >= 4) {
                        const dateStr = parts[0].replace(/^"/, '');
                        const repo = parts[1];
                        const pcName = parts[3].replace(/"$/, '');
                        const dateFormatted = dateStr.replace(/:/g, '').replace(' ', '-');
                        return `${repo} ver.${dateFormatted}(${pcName})`;
                    }
                }
            } catch (e) {
                console.error('Failed to parse commit_log.csv', e);
            }
            return 'ver.Unknown';
        },
        Apply: (_id: string, _value: string) => { /* 読み取り専用 */ }
    });
    // #endregion
    // #region Application.Appearance.* (外観設定)
    status.RegisterState('Application.Appearance.ColorMode', 'カラーモード', {
        Default: () => TTApplication.Instance.ColorMode || 'DefaultOriginal',
        Test: (_id: string, val: string) => /^(DefaultDark|DefaultOriginal)$/.test(val),
        Apply: (id: string, val: string) => {
            const modes = ['DefaultDark', 'DefaultOriginal'] as const;
            const current = TTApplication.Instance.ColorMode || 'DefaultOriginal';
            const resolvedMode = ResolveValue(current, modes, val);

            if (resolvedMode) {
                TTApplication.Instance.ColorMode = resolvedMode;
                status.SetValue(id, resolvedMode);
            }
        },
        Watch: (id: string) => {
            TTApplication.Instance.AddOnUpdate('State:Application.Appearance.ColorMode', () => {
                if (status.GetValue(id) !== TTApplication.Instance.ColorMode) {
                    status.SetValue(id, TTApplication.Instance.ColorMode);
                }
            });
        }
    });
    status.RegisterState('Application.Font.Size', 'フォントサイズ', {
        Default: () => {
            let max = 12;
            TTApplication.Instance.Panels.forEach(p => {
                if (p.FontSize > max) max = p.FontSize;
            });
            return max.toString();
        },
        Apply: (id: string, val: string) => {
            const panels = TTApplication.Instance.Panels;
            if (val === 'reset') {
                panels.forEach(p => p.FontSize = 12);
                status.SetValue(id, '12');
            } else if (val === 'up') {
                panels.forEach(p => p.FontSize = Math.min(72, p.FontSize + 1));
            } else if (val === 'down') {
                panels.forEach(p => p.FontSize = Math.max(8, p.FontSize - 1));
            } else {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 0) {
                    panels.forEach(p => p.FontSize = num);
                    status.SetValue(id, num.toString());
                }
            }
        },
        Watch: (id: string) => {
            TTApplication.Instance.AddOnUpdate('State:Application.Font.Size', () => {
                const currentVal = status.GetValue(id);
                let max = 12;
                TTApplication.Instance.Panels.forEach(p => {
                    if (p.FontSize > max) max = p.FontSize;
                });
                const newVal = max.toString();
                if (currentVal !== newVal) {
                    status.SetValue(id, newVal);
                }
            });
        }
    });
    status.RegisterState('Application.Style.PanelRatio', 'パネルの表示比', {
        Default: () => {
            return TTApplication.Instance.GetPanelLayoutAsString();
        },
        Apply: (id: string, val: string) => {
            TTApplication.Instance.SetPanelLayoutByCommand(val);
            status.SetValue(id, TTApplication.Instance.GetPanelLayoutAsString());
        },
        Watch: (id: string) => {
            TTApplication.Instance.AddOnUpdate('State:Application.Style.PanelRatio', () => {
                const newVal = TTApplication.Instance.GetPanelLayoutAsString();
                const currentVal = status.GetValue(id);
                if (currentVal !== newVal) {
                    status.SetValue(id, newVal);
                }
            });
        }
    });

    // #endregion
    // #region Application.Voice.* (音声入力)
    status.RegisterState('Application.Voice.Input', '音声入力のON/OFF', {
        Default: () => TTApplication.Instance.VoiceInput ? 'true' : 'false',
        Test: (_id: string, val: string) => /^(true|false|next|prev|toggle)$/.test(val),
        Apply: (id: string, val: string) => {
            const options = ['true', 'false'] as const;
            const current = TTApplication.Instance.VoiceInput ? 'true' : 'false';
            const input = val === 'toggle' ? 'next' : val;
            const resolvedVal = ResolveValue(current, options, input);

            if (resolvedVal === 'true' || resolvedVal === 'false') {
                TTApplication.Instance.VoiceInput = (resolvedVal === 'true');
                if (val !== resolvedVal) status.SetValue(id, resolvedVal);
            }
        },
        Watch: (id: string) => {
            TTApplication.Instance.AddOnUpdate('State:Application.Voice.Input', () => {
                const currentVal = status.GetValue(id);
                const newVal = TTApplication.Instance.VoiceInput ? 'true' : 'false';
                if (currentVal !== newVal) {
                    status.SetValue(id, newVal);
                }
            });
        }
    });
    // #endregion
    // #region Application.Current.* (アプリケーション状態)
    status.RegisterState('Application.Current.ExMode', 'Exモード', {
        Default: () => TTApplication.Instance.ExMode || '',
        Test: (_id: string, val: string) => /(Ex.+|)/.test(val),
        Apply: (id: string, val: string) => {
            let nextVal = val;
            if (val === 'Panel') {
                const active = TTApplication.Instance.ActivePanel;
                if (active) {
                    nextVal = `Ex${active.Name}`;
                }
            }
            TTApplication.Instance.ExMode = nextVal;
            status.SetValue(id, nextVal);
        },
        Watch: (id: string) => {
            TTApplication.Instance.AddOnUpdate('State:Application.Current.ExMode', () => {
                if (status.GetValue(id) !== TTApplication.Instance.ExMode) {
                    status.SetValue(id, TTApplication.Instance.ExMode);
                }
            });
        }
    });
    status.RegisterState('Application.Current.Panel', 'フォーカスパネル', {
        Default: () => 'Desk',
        Apply: (_id: string, val: string) => {
            const visiblePanelNames = PanelNames.filter(name => {
                const panel = TTApplication.Instance.GetPanel(name);
                if (!panel) return false;
                return (panel.Width ?? 0) > 0 && (panel.Height ?? 0) > 0;
            });

            const targetPanelNames = visiblePanelNames.length > 0 ? visiblePanelNames : [...PanelNames];

            let targetPanel = val;

            if (val === 'next' || val === 'prev') {
                const currentPanel = TTApplication.Instance.ActivePanel?.Name || 'Desk';
                const currentIdx = targetPanelNames.indexOf(currentPanel as typeof PanelNames[number]);

                if (currentIdx !== -1) {
                    if (val === 'next') {
                        targetPanel = targetPanelNames[(currentIdx + 1) % targetPanelNames.length];
                    } else {
                        targetPanel = targetPanelNames[(currentIdx - 1 + targetPanelNames.length) % targetPanelNames.length];
                    }
                } else {
                    targetPanel = targetPanelNames[0] || 'Desk';
                }
            }

            if (!PanelNames.includes(targetPanel as typeof PanelNames[number])) {
                const exMode = TTApplication.Instance.ExMode;
                if (exMode && exMode.startsWith('Ex')) {
                    targetPanel = exMode.substring(2);
                } else {
                    targetPanel = 'Desk';
                }
                if (!PanelNames.includes(targetPanel as typeof PanelNames[number])) {
                    targetPanel = 'Desk';
                }
            }

            const panel = TTApplication.Instance.GetPanel(targetPanel);
            if (panel) {
                TTApplication.Instance.Focus(panel.Name, panel.Mode, panel.Tool);
            }
        },
        Watch: (id: string) => {
            TTApplication.Instance.AddOnUpdate('State:Application.Current.Panel', () => {
                const currentVal = status.GetValue(id);
                const activePanelName = TTApplication.Instance.ActivePanel?.Name || '';
                if (activePanelName && currentVal !== activePanelName) {
                    status.SetValue(id, activePanelName);
                }
            });
        }
    });
    status.RegisterState('Application.Current.Mode', 'フォーカスパネルのMode', {
        Calculate: (_id: string) => {
            const activePanel = TTApplication.Instance.ActivePanel;
            return activePanel?.Mode || 'Table';
        },
        Apply: (_id: string, val: string) => {
            const activePanel = TTApplication.Instance.ActivePanel;
            if (activePanel) {
                const targetId = `${activePanel.Name}.Current.Mode`;
                status.ApplyValue(targetId, val);
            }
        }
    });
    status.RegisterState('Application.Current.Tool', 'フォーカスパネルのTool', {
        Calculate: (_id: string) => {
            const activePanel = TTApplication.Instance.ActivePanel;
            return activePanel?.Tool || 'Main';
        },
        Apply: (_id: string, val: string) => {
            const activePanel = TTApplication.Instance.ActivePanel;
            if (activePanel) {
                const targetId = `${activePanel.Name}.Current.Tool`;
                status.ApplyValue(targetId, val);
            }
        }
    });
    // #endregion
    // #region [Panels].Current.* (パネル共通状態)
    status.RegisterState('[Panels].Current.Mode', '[Panels]のモード', {
        Default: (id: string) => {
            const panelName = GetPanelName(id);
            const defaultModes: Record<string, string> = {
                'Library': 'Table',
                'Index': 'Table',
                'Shelf': 'Table',
                'Desk': 'Editor',
                'System': 'Editor',
                'Chat': 'Table',
                'Log': 'Table'
            };
            return defaultModes[panelName] || 'Table';
        },
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const modes = PanelModes;
            const resolvedMode = ResolveValue(panel.Mode, modes, val);

            if (resolvedMode) {
                panel.Mode = resolvedMode as import('../../Views/TTPanel').PanelMode;
                status.SetValue(id, resolvedMode);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Mode);
        }
    });
    status.RegisterState('[Panels].Current.Tool', '[Panels]のツール', {
        Default: () => 'Main',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            const tools = PanelTools;
            const resolvedTool = ResolveValue(panel.Tool, tools, val);

            if (resolvedTool) {
                panel.Tool = resolvedTool as import('../../Views/TTPanel').PanelTool;
                status.SetValue(id, resolvedTool);
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.Tool);
        }
    });

    status.RegisterState('[Panels].Font.Size', '[Panels]のフォントサイズ', {
        Default: () => '12',
        Apply: (id: string, val: string) => {
            const panel = GetPanel(id);
            if (!panel) return;

            if (val === 'reset') {
                panel.FontSize = 12;
            } else if (val === 'up') {
                panel.FontSize = Math.min(72, panel.FontSize + 1);
            } else if (val === 'down') {
                panel.FontSize = Math.max(8, panel.FontSize - 1);
            } else {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 0) {
                    panel.FontSize = num;
                    status.SetValue(id, num.toString());
                }
            }
        },
        Watch: (id: string) => {
            BindPanelWatch(status, id, (panel) => panel.FontSize.toString());
        }
    });
    // #endregion
}
