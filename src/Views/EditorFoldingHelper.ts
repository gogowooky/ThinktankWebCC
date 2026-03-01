/**
 * EditorFoldingHelper.ts
 * エディタのFolding操作ヘルパー関数
 * TTPanelEditorBehavior から分離
 */

// ────────────────────────────────────────────────────────────────
// Folding Model ユーティリティ
// ────────────────────────────────────────────────────────────────

/**
 * FoldingModelを取得するヘルパー（共通パターンの統一）
 */
function getFoldingModel(editor: any): { regions: any } | null {
    const foldingController = editor.getContribution?.('editor.contrib.folding');
    if (!foldingController) return null;

    let foldingModel = foldingController.foldingModel;
    if (!foldingModel && typeof foldingController.getFoldingModel === 'function') {
        foldingModel = foldingController.getFoldingModel();
    }
    if (!foldingModel) return null;

    const regions = foldingModel.regions || foldingModel._regions;
    if (!regions) return null;

    return { regions };
}



/**
 * FoldingModelが準備できているか確認
 */
export function isFoldingReady(editor: any): boolean {
    return !!getFoldingModel(editor);
}

/**
 * Folding領域の数を取得
 */
export function getFoldingRegionCount(editor: any): number {
    const fm = getFoldingModel(editor);
    return fm && fm.regions ? fm.regions.length : 0;
}

// ────────────────────────────────────────────────────────────────
// 折りたたみ状態の取得
// ────────────────────────────────────────────────────────────────

/**
 * 折りたたまれている行の一覧を取得
 */
export function getCollapsedLines(editor: any): number[] {
    const collapsedLines: number[] = [];
    const fm = getFoldingModel(editor);
    if (!fm) return collapsedLines;

    try {
        const { regions } = fm;
        for (let i = 0; i < regions.length; i++) {
            if (regions.isCollapsed(i)) {
                const startLine = regions.getStartLineNumber(i);
                collapsedLines.push(startLine);
            }
        }
        console.log(`[EditorFoldingHelper] getCollapsedLines: Found ${collapsedLines.length} collapsed regions: [${collapsedLines.join(', ')}]`);
    } catch (e) {
        console.warn('[EditorFoldingHelper] getCollapsedLines error:', e);
    }
    return collapsedLines;
}

/**
 * 指定行の折りたたみ領域の終了行を取得（折りたたまれていない場合は-1）
 */
export function getCollapsedRangeEndLine(editor: any, startLineNumber: number): number {
    const fm = getFoldingModel(editor);
    if (!fm) return -1;

    try {
        const { regions } = fm;
        for (let i = 0; i < regions.length; i++) {
            const regionStart = regions.getStartLineNumber(i);
            if (regionStart === startLineNumber) {
                const isCollapsed = regions.isCollapsed(i);
                if (isCollapsed) {
                    return regions.getEndLineNumber(i);
                }
                break;
            }
        }
    } catch (e) {
        console.warn('[EditorFoldingHelper] getCollapsedRangeEndLine error:', e);
    }

    return -1;
}

/**
 * 指定行が折りたたまれた領域内にあるかどうかを判定
 * 親Foldingが閉じている場合、その中の全ての行（子・見出し含む）は表示されていない
 */
export function isLineInCollapsedRegion(editor: any, lineNumber: number): boolean {
    const fm = getFoldingModel(editor);
    if (!fm) return false;

    try {
        return checkRegions(fm.regions, lineNumber);
    } catch (e) {
        console.warn('[EditorFoldingHelper] FoldingModel API unavailable:', e);
    }

    return false;
}

/**
 * 折りたたみ領域内に行があるかチェック
 */
export function checkRegions(regions: any, lineNumber: number): boolean {
    for (let i = 0; i < regions.length; i++) {
        const isCollapsed = regions.isCollapsed(i);
        if (!isCollapsed) continue;

        const startLine = regions.getStartLineNumber(i);
        const endLine = regions.getEndLineNumber(i);

        // 折りたたまれた領域の開始行より後の行は全て非表示
        // (startLine自体は見出し行なので表示されている)
        if (lineNumber > startLine && lineNumber <= endLine) {
            return true;
        }
    }
    return false;
}

// ────────────────────────────────────────────────────────────────
// 見出し操作
// ────────────────────────────────────────────────────────────────

/**
 * 見出しレベルを取得 (0 = 見出しではない)
 */
export function getHeadingLevel(content: string): number {
    const match = content.match(/^(#+)\s/);
    return match ? match[1].length : 0;
}

/**
 * 兄弟見出し行の一覧を取得
 */
export function getSiblingHeadings(editor: any): number[] {
    if (!editor) return [];
    const model = editor.getModel();
    if (!model) return [];
    const position = editor.getPosition();
    if (!position) return [];

    let currentLine = position.lineNumber;
    let headingLevel = 0;

    // 現在行が見出しでなければ、直近の上位見出しを探す
    let content = model.getLineContent(currentLine);
    headingLevel = getHeadingLevel(content);

    if (headingLevel === 0) {
        let l = currentLine - 1;
        while (l >= 1) {
            const c = model.getLineContent(l);
            const h = getHeadingLevel(c);
            if (h > 0) {
                headingLevel = h;
                currentLine = l;
                break;
            }
            l--;
        }
    }

    if (headingLevel === 0) return [];

    const siblings: number[] = [];
    const lineCount = model.getLineCount();

    console.log(`[EditorFoldingHelper] getSiblingHeadings BaseLine: ${currentLine}, Level: ${headingLevel}`);

    // 上方向探索
    for (let l = currentLine - 1; l >= 1; l--) {
        const c = model.getLineContent(l);
        const h = getHeadingLevel(c);
        if (h > 0) {
            if (h === headingLevel) {
                siblings.unshift(l);
            } else if (h < headingLevel) {
                break;
            }
        }
    }

    siblings.push(currentLine);

    // 下方向探索
    for (let l = currentLine + 1; l <= lineCount; l++) {
        const c = model.getLineContent(l);
        const h = getHeadingLevel(c);
        if (h > 0) {
            if (h === headingLevel) {
                siblings.push(l);
            } else if (h < headingLevel) {
                break;
            }
        }
    }

    console.log(`[EditorFoldingHelper] getSiblingHeadings Found siblings: ${siblings.join(', ')}`);
    return siblings;
}

// ────────────────────────────────────────────────────────────────
// 見出しナビゲーション
// ────────────────────────────────────────────────────────────────

/**
 * 指定行に移動してスクロール
 */
export function revealLine(editor: any, lineNumber: number): void {
    if (editor) {
        editor.setPosition({ lineNumber, column: 1 });
        editor.revealLineNearTop(lineNumber, 1);
    }
}

/**
 * 前の見出し行に移動（表示されている見出しのみ対象）
 */
export function gotoPrevHeading(editor: any): void {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const position = editor.getPosition();
    if (!position) return;

    let line = position.lineNumber - 1;
    while (line >= 1) {
        if (isLineInCollapsedRegion(editor, line)) {
            line--;
            continue;
        }
        const lineContent = model.getLineContent(line);
        if (/^#+\s/.test(lineContent)) {
            editor.setPosition({ lineNumber: line, column: 1 });
            editor.revealLineNearTop(line, 1);
            return;
        }
        line--;
    }
}

/**
 * 次の見出し行に移動（表示されている見出しのみ対象）
 * カーソル位置の見出しが閉じた折りたたみである場合、その子はスキップする
 */
export function gotoNextHeading(editor: any): void {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const position = editor.getPosition();
    if (!position) return;

    const lineCount = model.getLineCount();
    let line = position.lineNumber + 1;

    // 現在の位置が折りたたまれた見出しの場合、その終了行までスキップ
    const currentLineContent = model.getLineContent(position.lineNumber);
    if (/^# +\s /.test(currentLineContent)) {
        const collapsedEndLine = getCollapsedRangeEndLine(editor, position.lineNumber);
        if (collapsedEndLine > 0) {
            line = collapsedEndLine + 1;
        }
    }

    while (line <= lineCount) {
        const lineContent = model.getLineContent(line);
        if (/^#+\s/.test(lineContent)) {
            if (isLineInCollapsedRegion(editor, line)) {
                const endLine = getCollapsedRangeEndLine(editor, line);
                if (endLine > 0) {
                    line = endLine + 1;
                } else {
                    line++;
                }
                continue;
            }

            editor.setPosition({ lineNumber: line, column: 1 });
            editor.revealLineNearTop(line, 1);
            return;
        }
        line++;
    }
}

/** 最初の兄弟見出しに移動 */
export function gotoFirstSiblingHeading(editor: any): void {
    const siblings = getSiblingHeadings(editor);
    if (siblings.length > 0) {
        revealLine(editor, siblings[0]);
    }
}

/** 最後の兄弟見出しに移動 */
export function gotoLastSiblingHeading(editor: any): void {
    const siblings = getSiblingHeadings(editor);
    if (siblings.length > 0) {
        revealLine(editor, siblings[siblings.length - 1]);
    }
}

// ────────────────────────────────────────────────────────────────
// Folding開閉操作
// ────────────────────────────────────────────────────────────────

/** 全兄弟見出しを展開 */
export async function openAllSiblingHeading(editor: any): Promise<void> {
    const siblings = getSiblingHeadings(editor);
    await toggleFoldings(editor, siblings, false);
}

/** 全兄弟見出しを折りたたみ */
export async function closeAllSiblingHeading(editor: any): Promise<void> {
    const siblings = getSiblingHeadings(editor);
    await toggleFoldings(editor, siblings, true);
}

/**
 * 指定行のFoldingを一括トグル
 */
export async function toggleFoldings(editor: any, lines: number[], doFold: boolean): Promise<void> {
    if (!editor) return;

    const fm = getFoldingModel(editor);
    if (!fm) return;
    const { regions } = fm;

    const originalPosition = editor.getPosition();
    const originalSelections = editor.getSelections();

    const targetLines: number[] = [];

    for (const line of lines) {
        let regionIndex = -1;
        for (let i = 0; i < regions.length; i++) {
            if (regions.getStartLineNumber(i) === line) {
                regionIndex = i;
                break;
            }
        }

        if (regionIndex === -1) continue;

        const isCollapsed = regions.isCollapsed(regionIndex);

        if (doFold && !isCollapsed) {
            targetLines.push(line);
        } else if (!doFold && isCollapsed) {
            targetLines.push(line);
        }
    }

    if (targetLines.length === 0) return;

    const actionId = doFold ? 'editor.fold' : 'editor.unfold';
    const action = editor.getAction(actionId);

    if (!action) {
        console.warn(`[EditorFoldingHelper] Action ${actionId} not found`);
        return;
    }

    for (const line of targetLines) {
        editor.setPosition({ lineNumber: line, column: 1 });
        await action.run();
    }

    if (originalSelections) {
        editor.setSelections(originalSelections);
    }
    if (originalPosition) {
        editor.setPosition(originalPosition);
        editor.revealLine(originalPosition.lineNumber);
    }
}

// ────────────────────────────────────────────────────────────────
// Folding編集
// ────────────────────────────────────────────────────────────────

/**
 * カーソル行に空行を挿入してFoldingを追加
 */
export function foldingInit(editor: any): void {
    if (!editor) return;
    const position = editor.getPosition();
    if (!position) return;

    const lineNumber = position.lineNumber;
    const textToInsert = '#\n';
    const range = {
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: 1
    };

    editor.executeEdits('FoldingInit', [{
        range: range,
        text: textToInsert,
        forceMoveMarkers: true
    }]);

    // カーソル移動: 挿入した行の末尾へ("#"の後ろへ)
    editor.setPosition({ lineNumber: lineNumber, column: 2 });
    editor.revealLine(lineNumber);

    // スペースを入力
    editor.trigger('keyboard', 'type', { text: ' ' });
}

/**
 * 選択範囲に含まれる行のすべてのFolding行のレベルを上げる
 */
export function foldingUp(editor: any): void {
    changeFoldingLevel(editor, -1);
}

/**
 * 選択範囲に含まれる行のすべてのFolding行のレベルを下げる
 * カーソル行が選択状態ではなくFolding行でもない場合、FoldingInitを実行
 */
export function foldingDown(editor: any): void {
    if (!editor) return;

    const selection = editor.getSelection();
    if (selection && selection.isEmpty()) {
        const model = editor.getModel();
        if (model) {
            const lineContent = model.getLineContent(selection.startLineNumber);
            const isHeading = /^(#+)(\s.*)?$/.test(lineContent);
            if (!isHeading) {
                foldingInit(editor);
                return;
            }
        }
    }

    changeFoldingLevel(editor, 1);
}

/**
 * Foldingレベルを変更
 */
export function changeFoldingLevel(editor: any, delta: number): void {
    if (!editor) return;

    const selections = editor.getSelections();
    if (!selections || selections.length === 0) return;

    const model = editor.getModel();
    if (!model) return;

    const edits: any[] = [];

    for (const selection of selections) {
        const startLine = selection.startLineNumber;
        const endLine = selection.endLineNumber;

        for (let i = startLine; i <= endLine; i++) {
            const lineContent = model.getLineContent(i);
            const match = lineContent.match(/^(#+)(\s.*)?$/);

            if (match) {
                const currentHashes = match[1];
                const rest = match[2] || '';
                let newHashes = currentHashes;

                if (delta > 0) {
                    newHashes = '#' + currentHashes;
                } else {
                    if (currentHashes.length > 1) {
                        newHashes = currentHashes.substring(1);
                    } else {
                        newHashes = '';
                    }
                }

                if (newHashes !== currentHashes) {
                    let newText = '';
                    if (newHashes === '') {
                        newText = rest.replace(/^\s+/, '');
                    } else {
                        newText = newHashes + rest;
                    }

                    edits.push({
                        range: {
                            startLineNumber: i,
                            startColumn: 1,
                            endLineNumber: i,
                            endColumn: lineContent.length + 1
                        },
                        text: newText
                    });
                }
            }
        }
    }

    if (edits.length > 0) {
        editor.pushUndoStop();
        editor.executeEdits('FoldingLevelChange', edits);
        editor.pushUndoStop();
    }
}

/**
 * カーソル位置のFoldingを折りたたむか、既に折りたたまれていれば兄弟を全て折りたたむ
 */
export function foldOrCloseSiblings(editor: any): void {
    if (!editor) return;

    const position = editor.getPosition();
    if (!position) return;

    const line = position.lineNumber;
    const collapsedEndLine = getCollapsedRangeEndLine(editor, line);
    const isCollapsed = collapsedEndLine > 0;

    if (isCollapsed) {
        closeAllSiblingHeading(editor);
    } else {
        editor.trigger('source', 'editor.fold', null);
    }
}
