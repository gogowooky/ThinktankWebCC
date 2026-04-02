/**
 * EditorSearchHelper.ts
 * エディタの検索ウィジェット状態管理ヘルパー関数
 * TTPanelEditorBehavior から分離
 */

// ────────────────────────────────────────────────────────────────
// SearchMode
// ────────────────────────────────────────────────────────────────

/**
 * 検索ウィジェットの現在の状態を取得 ('Search' | 'Replace' | 'None')
 */
export function getSearchMode(editor: any): string {
    if (!editor) return 'None';

    try {
        const controller = editor.getContribution('editor.contrib.findController');
        if (controller) {
            const state = controller.getState();
            if (!state.isRevealed) return 'None';
            if (state.isReplaceRevealed) return 'Replace';
            return 'Search';
        }
    } catch (e) {
        console.warn('[EditorSearchHelper] Failed to get findController state', e);
    }
    return 'None';
}

/**
 * 検索ウィジェットの状態を設定
 */
export function setSearchMode(editor: any, value: string): void {
    if (!editor) return;

    try {
        const current = getSearchMode(editor);
        if (current === value) return;

        if (value === 'None') {
            editor.trigger('source', 'closeFindWidget', null);
        } else if (value === 'Replace') {
            const controller = editor.getContribution('editor.contrib.findController');
            // @ts-ignore
            const isRevealed = controller?.getState()?.isRevealed;
            // @ts-ignore
            const isReplaceRevealed = controller?.getState()?.isReplaceRevealed;

            if (isRevealed && !isReplaceRevealed) {
                editor.trigger('source', 'closeFindWidget', null);
            }

            editor.trigger('source', 'editor.action.startFindReplaceAction', null);
        } else if (value === 'Search') {
            const controller = editor.getContribution('editor.contrib.findController');
            // @ts-ignore
            const isReplaceRevealed = controller?.getState()?.isReplaceRevealed;

            if (isReplaceRevealed) {
                editor.trigger('source', 'closeFindWidget', null);
            }

            const action = editor.getAction('actions.find');
            if (action) action.run();
        }
    } catch (e) {
        console.warn('[EditorSearchHelper] Failed to set SearchMode', e);
    }
}

// ────────────────────────────────────────────────────────────────
// Search Options (Regex, CaseSensitive, WholeWord)
// ────────────────────────────────────────────────────────────────

/** 正規表現トグルの取得 */
export function getSearchRegex(editor: any): boolean {
    if (!editor) return false;
    try {
        const controller = editor.getContribution('editor.contrib.findController');
        // @ts-ignore
        return controller?.getState()?.isRegex || false;
    } catch (e) { return false; }
}

/** 正規表現トグルの設定 */
export function setSearchRegex(editor: any, value: boolean): void {
    if (getSearchRegex(editor) === value) return;
    if (editor) {
        editor.trigger('source', 'toggleFindRegex', null);
    }
}

/** 大文字小文字区別の取得 */
export function getSearchCaseSensitive(editor: any): boolean {
    if (!editor) return false;
    try {
        const controller = editor.getContribution('editor.contrib.findController');
        // @ts-ignore
        return controller?.getState()?.matchCase || false;
    } catch (e) { return false; }
}

/** 大文字小文字区別の設定 */
export function setSearchCaseSensitive(editor: any, value: boolean): void {
    if (getSearchCaseSensitive(editor) === value) return;
    if (editor) {
        editor.trigger('source', 'toggleFindCaseSensitive', null);
    }
}

/** 単語単位検索の取得 */
export function getSearchWholeWord(editor: any): boolean {
    if (!editor) return false;
    try {
        const controller = editor.getContribution('editor.contrib.findController');
        // @ts-ignore
        return controller?.getState()?.wholeWord || false;
    } catch (e) { return false; }
}

/** 単語単位検索の設定 */
export function setSearchWholeWord(editor: any, value: boolean): void {
    if (getSearchWholeWord(editor) === value) return;
    if (editor) {
        editor.trigger('source', 'toggleFindWholeWord', null);
    }
}

// ────────────────────────────────────────────────────────────────
// Replace Options
// ────────────────────────────────────────────────────────────────

/** 大文字保持の取得 */
export function getReplaceKeepCapitalize(editor: any): boolean {
    if (!editor) return false;
    try {
        const controller = editor.getContribution('editor.contrib.findController');
        // @ts-ignore
        return controller?.getState()?.preserveCase || false;
    } catch (e) { return false; }
}

/** 大文字保持の設定 */
export function setReplaceKeepCapitalize(editor: any, value: boolean): void {
    if (getReplaceKeepCapitalize(editor) === value) return;
    if (editor) {
        editor.trigger('source', 'togglePreserveCase', null);
    }
}

/** 選択範囲内置換の取得 */
export function getReplaceInSelection(editor: any): boolean {
    if (!editor) return false;
    try {
        const controller = editor.getContribution('editor.contrib.findController');
        // @ts-ignore
        return controller?.getState()?.isFindInSelection || false;
    } catch (e) { return false; }
}

/** 選択範囲内置換の設定 */
export function setReplaceInSelection(editor: any, value: boolean): void {
    if (getReplaceInSelection(editor) === value) return;
    if (editor) {
        editor.trigger('source', 'toggleFindInSelection', null);
    }
}
