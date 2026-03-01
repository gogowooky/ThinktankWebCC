/**
 * TTPanelWebViewBehavior.ts
 * TTPanel の WebView モード関連の機能を集約
 */

import type { IPanelModeBehavior, RequestInfo } from './IPanelModeBehavior';
import type { ActionContext } from '../types';
import { TTModels } from '../models/TTModels';

/**
 * TTPanel の WebView モード関連の機能を管理するクラス
 */
export class TTPanelWebViewBehavior implements IPanelModeBehavior {
    private _panel: { ID: string; Name: string; NotifyUpdated: () => void };

    // リソース（表示中のURL）
    private _resource: string = '';

    // キーワード
    private _keywords: string = 'https://www.wikipedia.org';
    private _activeKeyword: string = '';
    private _scrollCommand: string = '';
    private _currentLink: string = '';

    constructor(panel: { ID: string; Name: string; NotifyUpdated: () => void }) {
        this._panel = panel;
    }

    // #region Resource
    public get Resource(): string {
        return this._resource;
    }

    public set Resource(value: string) {
        if (this._resource === value) return;
        this._resource = value;
        this._panel.NotifyUpdated();
    }
    // #endregion

    // #region Keywords
    public get Keywords(): string {
        return this._keywords;
    }

    public set Keywords(value: string) {
        if (this._keywords === value) return;
        this._keywords = value;
        this._panel.NotifyUpdated();
    }

    public get ActiveKeyword(): string {
        return this._activeKeyword;
    }

    public set ActiveKeyword(value: string) {
        if (this._activeKeyword === value) return;
        this._activeKeyword = value;
        this._panel.NotifyUpdated();
    }

    /**
     * キーワードを整形（重複除去、空行除去）
     */
    public FormatKeywords(): void {
        const text = this._keywords;
        if (!text) return;

        const lines = text.split(/\r?\n/);
        const validLines = lines.filter(line => line.trim().length > 0);
        const uniqueLines = Array.from(new Set(validLines));
        const newText = uniqueLines.join('\n');

        if (newText !== text) {
            this.Keywords = newText;
        }
    }
    // #endregion

    // #region CurrentLink
    public get CurrentLink(): string {
        return this._currentLink;
    }

    public set CurrentLink(value: string) {
        if (this._currentLink === value) return;
        this._currentLink = value;
        this._panel.NotifyUpdated();
    }
    // #endregion

    // #region ScrollCommand
    public get ScrollCommand(): string {
        return this._scrollCommand;
    }

    public set ScrollCommand(value: string) {
        if (this._scrollCommand === value) return;
        this._scrollCommand = value;
        this._panel.NotifyUpdated();
    }
    // #endregion

    // #region ApplyUrl
    /**
     * URLをWebViewに適用し、Keywords/Keywordに同期する。
     * Editor.Keywordsと同じ要領：
     *   - Keywords内に同じURLがあれば、その行にカーソルを合わせる（ActiveKeyword設定）
     *   - なければ新規追加し、その行にカーソルを合わせる
     *   - Keyword（ActiveKeyword）にそのURLを設定する
     */
    public ApplyUrl(url: string): void {
        // Resourceを設定（iframe表示用）
        this.Resource = url;

        // Keywords内に同じURLが存在するかチェック（null/undefined対策）
        const currentKeywords = this._keywords || '';
        const lines = currentKeywords.split(/\r?\n/);
        const existingIndex = lines.findIndex(line => line.trim() === url);

        if (existingIndex >= 0) {
            // 既存行が見つかった → その行にカーソルを合わせる
            this.ActiveKeyword = url;
        } else {
            // 見つからない → 新規追加してその行にカーソルを合わせる
            if (currentKeywords.trim()) {
                this.Keywords = currentKeywords + '\n' + url;
            } else {
                this.Keywords = url;
            }
            this.ActiveKeyword = url;
        }

        // Status同期
        const status = TTModels.Instance?.Status;
        if (status) {
            const panelName = this._panel.Name;
            status.SetValue(`${panelName}.WebView.Keywords`, this._keywords);
            status.SetValue(`${panelName}.WebView.Keyword`, this._activeKeyword);
        }

        this._panel.NotifyUpdated();
    }
    // #endregion

    // #region GetActiveRequest
    /**
     * 現在のアクティブなリクエスト（選択リンク）を取得
     */
    public GetActiveRequest(context?: ActionContext): RequestInfo | null {
        const currentLink = this.CurrentLink;
        if (!currentLink) return null;

        return {
            requestId: 'Link',
            requestTag: currentLink,
            clientX: context?.ClientX as number | undefined,
            clientY: context?.ClientY as number | undefined
        };
    }
    // #endregion

    public GetTitleSuffix(): string {
        if (!this.Resource) return '';
        return ` | ${this.Resource}`;
    }
}
