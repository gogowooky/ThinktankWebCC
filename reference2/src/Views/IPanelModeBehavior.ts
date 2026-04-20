/**
 * IPanelModeBehavior.ts
 * パネルモードの共通インターフェース（Strategyパターン）
 */

import type { ActionContext } from '../types';

/**
 * リクエスト情報
 */
export interface RequestInfo {
    requestId: string;
    requestTag: string;
    clientX?: number;
    clientY?: number;
}

/**
 * Editor/Table/WebView の各モードBehaviorが実装する共通インターフェース
 * これにより、TTPanel内でモード毎の分岐ロジックを集約できる
 */
export interface IPanelModeBehavior {
    // リソース（表示対象のID/パス/URL）
    Resource: string;

    // キーワード全文（複数行）
    Keywords: string;

    // アクティブキーワード（カーソル行のキーワード）
    ActiveKeyword: string;

    // キーワードを整形（重複除去、空行除去）
    FormatKeywords(): void;

    /**
     * 現在のアクティブなリクエスト（カーソル位置や選択項目）を取得
     */
    GetActiveRequest(context?: ActionContext): RequestInfo | null;

    /**
     * パネルタイトルに付与するサフィックスを取得
     */
    GetTitleSuffix(): string;
}
