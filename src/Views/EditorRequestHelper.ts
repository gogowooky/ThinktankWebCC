/**
 * EditorRequestHelper.ts
 * エディタのRequest検出・ナビゲーションヘルパー関数
 * TTPanelEditorBehavior から分離
 */

import { getRequestPatterns, findRequestMatches } from '../services/RequestLinkProvider';
import type { ActionContext } from '../types';
import type { RequestInfo } from './IPanelModeBehavior';

// ────────────────────────────────────────────────────────────────
// Request検出
// ────────────────────────────────────────────────────────────────

/**
 * 現在のアクティブなリクエスト（カーソル位置）を取得
 */
export function getActiveRequest(editor: any, context?: ActionContext): RequestInfo | null {
    let clientX = context?.ClientX;
    let clientY = context?.ClientY;

    if (editor) {
        const position = editor.getPosition();
        const model = editor.getModel();

        if (position && model) {
            const patterns = getRequestPatterns();
            const lineContent = model.getLineContent(position.lineNumber);
            const matches = findRequestMatches(lineContent, patterns);

            const col = position.column;
            for (const m of matches) {
                if (col >= m.startColumn && col <= m.endColumn) {
                    const requestId = m.requestId;
                    const requestTag = m.matchedText;

                    // 座標が未設定の場合に計算
                    if (clientX === undefined || clientY === undefined) {
                        const scrolledVisiblePosition = editor.getScrolledVisiblePosition(position);
                        if (scrolledVisiblePosition) {
                            const editorDom = editor.getDomNode();
                            if (editorDom) {
                                const rect = editorDom.getBoundingClientRect();
                                clientX = rect.left + scrolledVisiblePosition.left;
                                clientY = rect.top + scrolledVisiblePosition.top + scrolledVisiblePosition.height;
                            }
                        }
                    }

                    return { requestId, requestTag, clientX, clientY };
                }
            }
        }
    }
    return null;
}

// ────────────────────────────────────────────────────────────────
// Request ナビゲーション
// ────────────────────────────────────────────────────────────────

/**
 * ドキュメント内の全てのRequestマッチを取得して行番号順にソート
 */
export function getAllRequestMatches(editor: any): { lineNumber: number; startColumn: number; endColumn: number; matchedText: string }[] {
    if (!editor) return [];

    const model = editor.getModel();
    if (!model) return [];

    const patterns = getRequestPatterns();
    const text = model.getValue();
    const matches = findRequestMatches(text, patterns);

    // 行番号、開始列でソート
    matches.sort((a: any, b: any) => {
        if (a.lineNumber !== b.lineNumber) {
            return a.lineNumber - b.lineNumber;
        }
        return a.startColumn - b.startColumn;
    });

    return matches;
}

/**
 * 次のRequestへカーソルを移動
 */
export function gotoNextRequest(editor: any): void {
    if (!editor) return;

    const position = editor.getPosition();
    if (!position) return;

    const matches = getAllRequestMatches(editor);
    if (matches.length === 0) return;

    // 現在位置より後ろの最初のマッチを探す
    for (const m of matches) {
        if (m.lineNumber > position.lineNumber ||
            (m.lineNumber === position.lineNumber && m.startColumn > position.column)) {
            editor.setPosition({ lineNumber: m.lineNumber, column: m.startColumn });
            editor.revealLineNearTop(m.lineNumber, 1);
            return;
        }
    }

    // 見つからない場合、最初のRequestへ（ラップ）
    const first = matches[0];
    editor.setPosition({ lineNumber: first.lineNumber, column: first.startColumn });
    editor.revealLineNearTop(first.lineNumber, 1);
}

/**
 * 前のRequestへカーソルを移動
 */
export function gotoPrevRequest(editor: any): void {
    if (!editor) return;

    const position = editor.getPosition();
    if (!position) return;

    const matches = getAllRequestMatches(editor);
    if (matches.length === 0) return;

    // 現在位置より前の最後のマッチを探す
    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        if (m.lineNumber < position.lineNumber ||
            (m.lineNumber === position.lineNumber && m.endColumn < position.column)) {
            editor.setPosition({ lineNumber: m.lineNumber, column: m.startColumn });
            editor.revealLineNearTop(m.lineNumber, 1);
            return;
        }
    }

    // 見つからない場合、最後のRequestへ（ラップ）
    const last = matches[matches.length - 1];
    editor.setPosition({ lineNumber: last.lineNumber, column: last.startColumn });
    editor.revealLineNearTop(last.lineNumber, 1);
}

/**
 * 最初のRequestへカーソルを移動
 */
export function gotoFirstRequest(editor: any): void {
    if (!editor) return;

    const matches = getAllRequestMatches(editor);
    if (matches.length === 0) return;

    const first = matches[0];
    editor.setPosition({ lineNumber: first.lineNumber, column: first.startColumn });
    editor.revealLineNearTop(first.lineNumber, 1);
}

/**
 * 最後のRequestへカーソルを移動
 */
export function gotoLastRequest(editor: any): void {
    if (!editor) return;

    const matches = getAllRequestMatches(editor);
    if (matches.length === 0) return;

    const last = matches[matches.length - 1];
    editor.setPosition({ lineNumber: last.lineNumber, column: last.startColumn });
    editor.revealLineNearTop(last.lineNumber, 1);
}
