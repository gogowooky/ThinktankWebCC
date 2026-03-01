/**
 * TTPanel.ts
 * パネルのビューモデル（Compositionパターン + Strategyパターン）
 */

import { TTObject } from '../models/TTObject';
import { TTModels } from '../models/TTModels';
import { TTPanelEditorBehavior, EditorHandleInterface } from './TTPanelEditorBehavior';
import { TTPanelTableBehavior } from './TTPanelTableBehavior';
import { TTPanelWebViewBehavior } from './TTPanelWebViewBehavior';
import type { IPanelModeBehavior, RequestInfo } from './IPanelModeBehavior';
import type { ActionContext } from '../types';

export type PanelMode = 'Editor' | 'Table' | 'WebView';
export type PanelTool = 'Main' | 'Keyword';

// EditorHandleInterfaceを再エクスポート
export type { EditorHandleInterface };

export class TTPanel extends TTObject {
    private _mode: PanelMode = 'Editor';
    private _tool: PanelTool = 'Keyword';

    // パネルのサイズ（レイアウトから更新される）
    public Width: number = 0;
    public Height: number = 0;

    // Behavior インスタンス
    public readonly Editor: TTPanelEditorBehavior;
    public readonly Table: TTPanelTableBehavior;
    public readonly WebView: TTPanelWebViewBehavior;

    // キーワードハイライトのカラーモード
    private _keywordColor: string = 'Default';

    // フォントサイズ
    private _fontSize: number = 12;

    public get FontSize(): number {
        return this._fontSize;
    }

    public set FontSize(value: number) {
        if (this._fontSize === value) return;
        this._fontSize = value;
        this.NotifyUpdated();
    }

    // KeywordエディタへのHandle（Reactコンポーネントから設定される）
    public KeywordEditorHandle: EditorHandleInterface | null = null;

    constructor(name: string) {
        super();
        this.ID = name;
        this.Name = name;

        // Behavior インスタンスを作成
        this.Editor = new TTPanelEditorBehavior(this);
        this.Table = new TTPanelTableBehavior(this);
        this.WebView = new TTPanelWebViewBehavior(this);
    }

    public Setup(): void {
        const status = TTModels.Instance?.Status;
        if (status) {
            // Initial Load
            this.SyncFromStatus();

            // Subscribe to Status updates (Async load support)
            const subId = `PanelSync:${this.ID}`;
            status.AddOnUpdate(subId, () => {
                this.SyncFromStatus();
            });
        }
    }

    private SyncFromStatus(): void {
        const status = TTModels.Instance?.Status;
        if (!status) return;

        // Helper to safely get and set
        const sync = (suffix: string, setter: (val: string) => void, validator?: (val: string) => boolean) => {
            const id = `${this.Name}.${suffix}`;
            const val = status.GetValue(id);
            if (val) {
                if (!validator || validator(val)) {
                    setter(val);
                }
            }
        };

        // Panel Core
        sync('Current.Mode', (v) => { if (this.Mode !== v) this.Mode = v as PanelMode; }, (v) => /^(Editor|Table|WebView)$/.test(v));
        sync('Current.Tool', (v) => { if (this.Tool !== v) this.Tool = v as PanelTool; }, (v) => /^(Main|Keyword)$/.test(v));

        // Table Config
        sync('Table.SortDir', (v) => { if (this.Table.SortDir !== v) this.Table.SortDir = v as 'asc' | 'desc'; }, (v) => /^(asc|desc)$/.test(v));
        sync('Table.SortProperty', (v) => { if (this.Table.SortProperty !== v) this.Table.SortProperty = v; });
        sync('Table.Resource', (v) => { if (this.Table.Resource !== v) this.Table.Resource = v; });
        sync('Table.CurrentID', (v) => { if (this.Table.CurrentID !== v) this.Table.CurrentID = v; });

        // Editor Config
        sync('Editor.Resource', (v) => { if (this.Editor.Resource !== v) this.Editor.Resource = v; });
        sync('Editor.Wordwrap', (v) => {
            const val = v === 'on';
            if (this.Editor.WordWrap !== val) this.Editor.WordWrap = val;
        }, (v) => /^(on|off)$/.test(v));
        sync('Editor.Minimap', (v) => {
            const val = v === 'true';
            if (this.Editor.Minimap !== val) this.Editor.Minimap = val;
        }, (v) => /^(true|false)$/.test(v));
        sync('Editor.LineNumber', (v) => {
            const val = v === 'on';
            if (this.Editor.LineNumbers !== val) this.Editor.LineNumbers = val;
        }, (v) => /^(on|off)$/.test(v));

        // Keyword Config (Full Text)
        sync('Editor.Keywords', (v) => { if (this.Editor.Keywords !== v) this.Editor.Keywords = v; });
        sync('Table.Keywords', (v) => { if (this.Table.Keywords !== v) this.Table.Keywords = v; });
        sync('WebView.Keywords', (v) => { if (this.WebView.Keywords !== v) this.WebView.Keywords = v; });

        // Keyword Config (Cursor Line)
        sync('Editor.Keyword', (v) => { if (this.Editor.ActiveKeyword !== v) this.Editor.ActiveKeyword = v; });
        sync('Table.Keyword', (v) => { if (this.Table.ActiveKeyword !== v) this.Table.ActiveKeyword = v; });
        sync('WebView.Keyword', (v) => { if (this.WebView.ActiveKeyword !== v) this.WebView.ActiveKeyword = v; });
        sync('WebView.CurrentLink', (v) => { if (this.WebView.CurrentLink !== v) this.WebView.CurrentLink = v; });
        sync('WebView.ScrollCommand', (v) => { if (this.WebView.ScrollCommand !== v) this.WebView.ScrollCommand = v; });
    }

    // #region Mode
    public get Mode(): PanelMode {
        return this._mode;
    }

    public set Mode(value: PanelMode) {
        if (this._mode === value) return;
        this._mode = value;

        if (TTModels.Instance?.Status) {
            TTModels.Instance.Status.SetValue(`${this.Name}.Current.Mode`, value);
        }

        this.NotifyUpdated();
    }
    // #endregion

    // #region Tool
    public get Tool(): PanelTool {
        return this._tool;
    }

    public set Tool(value: PanelTool) {
        if (this._tool === value) return;
        this._tool = value;

        if (TTModels.Instance?.Status) {
            TTModels.Instance.Status.SetValue(`${this.Name}.Current.Tool`, value);
        }

        this.NotifyUpdated();
    }
    // #endregion

    // #region KeywordColor
    public get KeywordColor(): string {
        return this._keywordColor;
    }

    public set KeywordColor(value: string) {
        if (this._keywordColor === value) return;
        this._keywordColor = value;
        this.NotifyUpdated();
    }
    // #endregion

    // #region Helper Methods
    public GetTitle(): string {
        return `${this.Name}${this.CurrentBehavior.GetTitleSuffix()}`;
    }

    /**
     * 指定したモードに対応するBehaviorを取得（Strategyパターン）
     */
    private GetBehavior(mode: PanelMode): IPanelModeBehavior {
        switch (mode) {
            case 'Editor': return this.Editor;
            case 'Table': return this.Table;
            case 'WebView': return this.WebView;
        }
    }

    /**
     * 現在のモードに対応するBehaviorを取得
     */
    public get CurrentBehavior(): IPanelModeBehavior {
        return this.GetBehavior(this._mode);
    }

    /**
     * 現在のモードに対応するBehaviorを取得（後方互換用）
     */
    public GetCurrentBehavior(): IPanelModeBehavior {
        return this.CurrentBehavior;
    }

    /**
     * 各モードのキーワードをまとめて取得（TTPanel.tsx用）
     */
    public get Keywords(): Record<PanelMode, string> {
        return {
            Editor: this.Editor.Keywords,
            Table: this.Table.Keywords,
            WebView: this.WebView.Keywords
        };
    }

    /**
     * 指定モードのキーワードを取得
     */
    public GetKeyword(mode: PanelMode): string {
        return this.GetBehavior(mode).Keywords;
    }

    /**
     * 指定モードのキーワードを設定
     */
    public SetKeyword(mode: PanelMode, value: string): void {
        this.GetBehavior(mode).Keywords = value;
    }

    /**
     * 指定モードのアクティブキーワードを取得
     */
    public GetActiveKeyword(mode: PanelMode): string {
        return this.GetBehavior(mode).ActiveKeyword;
    }

    /**
     * キーワード全文を設定（Status同期オプション付き）
     */
    public SetKeywordsText(mode: PanelMode, value: string, syncToStatus: boolean = true): void {
        const behavior = this.GetBehavior(mode);
        if (behavior.Keywords !== value) {
            behavior.Keywords = value;
            if (syncToStatus && TTModels.Instance?.Status) {
                TTModels.Instance.Status.SetValue(`${this.Name}.${mode}.Keywords`, value);
            }
        }
    }

    /**
     * アクティブキーワードを設定（Status同期オプション付き）
     */
    public SetActiveKeyword(mode: PanelMode, value: string, syncToStatus: boolean = true): void {
        const behavior = this.GetBehavior(mode);
        if (behavior.ActiveKeyword !== value) {
            behavior.ActiveKeyword = value;
            if (syncToStatus && TTModels.Instance?.Status) {
                TTModels.Instance.Status.SetValue(`${this.Name}.${mode}.Keyword`, value);
            }
        }
    }

    /**
     * キーワードを整形
     */
    public FormatKeywords(mode: PanelMode): void {
        this.GetBehavior(mode).FormatKeywords();
    }

    /**
     * 現在のアクティブなリクエスト情報を取得
     * モード/ツールに応じて適切なBehaviorに委譲
     */
    public GetActiveRequest(context?: ActionContext): RequestInfo | null {
        switch (this.Mode) {
            case 'Editor':
                // Main ツールのみRequestを返す（Keywordエディタは対象外）
                if (this.Tool === 'Main') {
                    return this.Editor.GetActiveRequest(context);
                }
                return null;
            case 'Table':
                return this.Table.GetActiveRequest(context);
            case 'WebView':
                return this.WebView.GetActiveRequest(context);
            default:
                return null;
        }
    }
    // #endregion
}
