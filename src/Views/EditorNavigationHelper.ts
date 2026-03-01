/**
 * EditorNavigationHelper.ts
 * エディタのカーソルナビゲーションヘルパー関数
 * TTPanelEditorBehavior から分離
 */

import { isLineInCollapsedRegion } from './EditorFoldingHelper';

import type { EditorHandleInterface } from './TTPanelEditorBehavior';

// ────────────────────────────────────────────────────────────────
// CurPos コマンド実行
// ────────────────────────────────────────────────────────────────

/**
 * CurPos setterのコマンドディスパッチ
 * @returns true: 処理済み, false: 座標指定として処理が必要
 */
export function applyCursorCommand(
    handle: EditorHandleInterface | null,
    editor: any,
    value: string
): boolean {
    const val = value.toLowerCase().trim();

    // 基本カーソル移動
    switch (val) {
        case 'nextchar': case 'next':
            handle?.triggerAction('cursorRight'); return true;
        case 'prevchar': case 'prev':
            handle?.triggerAction('cursorLeft'); return true;
        case 'nextline': case 'down':
            handle?.triggerAction('cursorDown'); return true;
        case 'prevline': case 'up':
            handle?.triggerAction('cursorUp'); return true;
        case 'linestart':
            handle?.triggerAction('cursorLineStart'); return true;
        case 'lineend':
            handle?.triggerAction('cursorLineEnd'); return true;
        case 'linestart+': {
            const pos = editor.getPosition();
            if (pos && pos.column === 1) {
                handle?.triggerAction('cursorTop');
            } else {
                handle?.triggerAction('cursorLineStart');
            }
            return true;
        }
        case 'lineend+': {
            const pos = editor.getPosition();
            const model = editor.getModel();
            if (pos && model) {
                const maxCol = model.getLineMaxColumn(pos.lineNumber);
                if (pos.column === maxCol) {
                    handle?.triggerAction('cursorBottom');
                } else {
                    handle?.triggerAction('cursorLineEnd');
                }
            }
            return true;
        }
        case 'firstline':
            handle?.triggerAction('cursorTop'); return true;
        case 'lastline':
            handle?.triggerAction('cursorBottom'); return true;
        case 'pageup':
            handle?.triggerAction('cursorPageUp'); return true;
        case 'pagedown':
            handle?.triggerAction('cursorPageDown'); return true;
    }

    // Folding ナビゲーション
    if (val === 'nextfolding' || val === 'prevfolding' || val === 'firstfolding' || val === 'lastfolding' || val === 'currentfolding') {
        applyFoldingNavigation(editor, val);
        return true;
    }

    // 可視Folding ナビゲーション
    if (val === 'nextvisiblefolding' || val === 'prevvisiblefolding' || val === 'firstvisiblefolding' || val === 'lastvisiblefolding') {
        applyVisibleFoldingNavigation(editor, val);
        return true;
    }

    // 兄弟Folding ナビゲーション
    if (val === 'nextsibfolding' || val === 'prevsibfolding' || val === 'firstsibfolding' || val === 'lastsibfolding') {
        applySiblingFoldingNavigation(editor, val);
        return true;
    }

    // Request ナビゲーション (CurPos内の旧実装 - 正規表現ベース)
    if (val === 'nextrequest' || val === 'prevrequest' || val === 'firstrequest' || val === 'lastrequest') {
        applyRequestNavigation(editor, val);
        return true;
    }

    // 座標指定: 処理しない（呼び出し元で処理）
    return false;
}

/**
 * 座標指定でカーソルを移動
 */
export function applyCursorPosition(editor: any, value: string): void {
    const parts = value.split(',');
    const line = parseInt(parts[0], 10);
    let col = 1;
    if (parts.length > 1) {
        col = parseInt(parts[1], 10);
    }

    if (!isNaN(line)) {
        const model = editor.getModel();
        if (model) {
            const maxLine = model.getLineCount();
            const targetLine = Math.min(Math.max(line, 1), maxLine);
            const maxCol = model.getLineMaxColumn(targetLine);
            const targetCol = Math.min(Math.max(col, 1), maxCol);

            editor.setPosition({ lineNumber: targetLine, column: targetCol });
            editor.revealPositionInCenterIfOutsideViewport({ lineNumber: targetLine, column: targetCol });
        }
    }
}

// ────────────────────────────────────────────────────────────────
// Folding ナビゲーション サブ関数
// ────────────────────────────────────────────────────────────────

function applyFoldingNavigation(editor: any, val: string): void {
    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const currentLine = editor.getPosition()?.lineNumber || 1;
    let targetLine = -1;

    if (val === 'firstfolding') {
        for (let i = 1; i <= lineCount; i++) {
            if (/^#+\s/.test(model.getLineContent(i))) {
                targetLine = i;
                break;
            }
        }
    } else if (val === 'lastfolding') {
        for (let i = lineCount; i >= 1; i--) {
            if (/^#+\s/.test(model.getLineContent(i))) {
                targetLine = i;
                break;
            }
        }
    } else if (val === 'nextfolding') {
        for (let i = currentLine + 1; i <= lineCount; i++) {
            if (/^#+\s/.test(model.getLineContent(i))) {
                targetLine = i;
                break;
            }
        }
    } else if (val === 'prevfolding') {
        for (let i = currentLine - 1; i >= 1; i--) {
            if (/^#+\s/.test(model.getLineContent(i))) {
                targetLine = i;
                break;
            }
        }
    } else if (val === 'currentfolding') {
        for (let i = currentLine; i >= 1; i--) {
            if (/^#+\s/.test(model.getLineContent(i))) {
                targetLine = i;
                break;
            }
        }
    }

    if (targetLine > 0) {
        editor.setPosition({ lineNumber: targetLine, column: 1 });
    }
}

function applyVisibleFoldingNavigation(editor: any, val: string): void {
    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const currentLine = editor.getPosition()?.lineNumber || 1;
    let targetLine = -1;

    const isVisible = (lineNumber: number) => !isLineInCollapsedRegion(editor, lineNumber);

    if (val === 'firstvisiblefolding') {
        for (let i = 1; i <= lineCount; i++) {
            if (/^#+\s/.test(model.getLineContent(i)) && isVisible(i)) {
                targetLine = i;
                break;
            }
        }
    } else if (val === 'lastvisiblefolding') {
        for (let i = lineCount; i >= 1; i--) {
            if (/^#+\s/.test(model.getLineContent(i)) && isVisible(i)) {
                targetLine = i;
                break;
            }
        }
    } else if (val === 'nextvisiblefolding') {
        for (let i = currentLine + 1; i <= lineCount; i++) {
            if (/^#+\s/.test(model.getLineContent(i)) && isVisible(i)) {
                targetLine = i;
                break;
            }
        }
    } else if (val === 'prevvisiblefolding') {
        for (let i = currentLine - 1; i >= 1; i--) {
            if (/^#+\s/.test(model.getLineContent(i)) && isVisible(i)) {
                targetLine = i;
                break;
            }
        }
    }

    if (targetLine > 0) {
        editor.setPosition({ lineNumber: targetLine, column: 1 });
    }
}

function applySiblingFoldingNavigation(editor: any, val: string): void {
    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const currentLine = editor.getPosition()?.lineNumber || 1;
    let targetLine = -1;

    const getLevel = (lineNumber: number) => {
        const content = model.getLineContent(lineNumber);
        const match = content.match(/^(#+)\s/);
        return match ? match[1].length : 0;
    };

    // 現在のレベルを確定
    let currentLevel = getLevel(currentLine);
    if (currentLevel === 0) {
        for (let i = currentLine - 1; i >= 1; i--) {
            const l = getLevel(i);
            if (l > 0) {
                currentLevel = l;
                break;
            }
        }
    }

    if (currentLevel <= 0) return;

    if (val === 'nextsibfolding') {
        for (let i = currentLine + 1; i <= lineCount; i++) {
            const l = getLevel(i);
            if (l > 0) {
                if (l < currentLevel) break;
                if (l === currentLevel) { targetLine = i; break; }
            }
        }
    } else if (val === 'prevsibfolding') {
        for (let i = currentLine - 1; i >= 1; i--) {
            const l = getLevel(i);
            if (l > 0) {
                if (l < currentLevel) break;
                if (l === currentLevel) { targetLine = i; break; }
            }
        }
    } else if (val === 'firstsibfolding' || val === 'lastsibfolding') {
        // スコープの開始を特定
        let scopeStart = 1;
        for (let i = currentLine - 1; i >= 1; i--) {
            const l = getLevel(i);
            if (l > 0 && l < currentLevel) {
                scopeStart = i + 1;
                break;
            }
        }

        if (val === 'firstsibfolding') {
            for (let i = scopeStart; i <= lineCount; i++) {
                const l = getLevel(i);
                if (l > 0) {
                    if (l < currentLevel) break;
                    if (l === currentLevel) { targetLine = i; break; }
                }
            }
        } else {
            // lastsibfolding
            for (let i = scopeStart; i <= lineCount; i++) {
                const l = getLevel(i);
                if (l > 0) {
                    if (l < currentLevel) break;
                    if (l === currentLevel) { targetLine = i; }
                }
            }
        }
    }

    if (targetLine > 0) {
        editor.setPosition({ lineNumber: targetLine, column: 1 });
    }
}

function applyRequestNavigation(editor: any, val: string): void {
    const model = editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const regex = /\[(.*?)\]/g;
    let match;
    const ranges: { startLine: number, startColumn: number, endLine: number, endColumn: number }[] = [];

    while ((match = regex.exec(text)) !== null) {
        const startPos = model.getPositionAt(match.index);
        const endPos = model.getPositionAt(match.index + match[0].length);
        ranges.push({
            startLine: startPos.lineNumber,
            startColumn: startPos.column,
            endLine: endPos.lineNumber,
            endColumn: endPos.column
        });
    }

    if (ranges.length === 0) return;

    const currentPos = editor.getPosition();
    let targetRange: typeof ranges[0] | null = null;

    if (val === 'firstrequest') {
        targetRange = ranges[0];
    } else if (val === 'lastrequest') {
        targetRange = ranges[ranges.length - 1];
    } else if (val === 'nextrequest') {
        for (const range of ranges) {
            if (range.startLine > currentPos.lineNumber || (range.startLine === currentPos.lineNumber && range.startColumn > currentPos.column)) {
                targetRange = range;
                break;
            }
        }
    } else if (val === 'prevrequest') {
        for (let i = ranges.length - 1; i >= 0; i--) {
            const range = ranges[i];
            if (range.startLine < currentPos.lineNumber || (range.startLine === currentPos.lineNumber && range.startColumn < currentPos.column)) {
                targetRange = range;
                break;
            }
        }
    }

    if (targetRange) {
        editor.setPosition({ lineNumber: targetRange.startLine, column: targetRange.startColumn });
    }
}

// ────────────────────────────────────────────────────────────────
// SelPos コマンド実行
// ────────────────────────────────────────────────────────────────

/**
 * SelPos setterのコマンドディスパッチ
 */
export function applySelectionCommand(
    handle: EditorHandleInterface | null,
    editor: any,
    value: string
): void {
    const val = value.toLowerCase().trim();

    switch (val) {
        case 'nextchar': case 'next':
            handle?.triggerAction('cursorRightSelect'); break;
        case 'prevchar': case 'prev':
            handle?.triggerAction('cursorLeftSelect'); break;
        case 'nextline': case 'down':
            handle?.triggerAction('cursorDownSelect'); break;
        case 'prevline': case 'up':
            handle?.triggerAction('cursorUpSelect'); break;
        case 'linestart':
            handle?.triggerAction('cursorLineStartSelect'); break;
        case 'lineend':
            handle?.triggerAction('cursorLineEndSelect'); break;
        case 'linestart+': {
            const pos = editor.getPosition();
            if (pos && pos.column === 1) {
                handle?.triggerAction('cursorTopSelect');
            } else {
                handle?.triggerAction('cursorLineStartSelect');
            }
            break;
        }
        case 'lineend+': {
            const pos = editor.getPosition();
            const model = editor.getModel();
            if (pos && model) {
                const maxCol = model.getLineMaxColumn(pos.lineNumber);
                if (pos.column === maxCol) {
                    handle?.triggerAction('cursorBottomSelect');
                } else {
                    handle?.triggerAction('cursorLineEndSelect');
                }
            }
            break;
        }
        case 'firstline':
            handle?.triggerAction('cursorTopSelect'); break;
        case 'lastline':
            handle?.triggerAction('cursorBottomSelect'); break;
        case 'pageup':
            handle?.triggerAction('cursorPageUpSelect'); break;
        case 'pagedown':
            handle?.triggerAction('cursorPageDownSelect'); break;
    }
}
