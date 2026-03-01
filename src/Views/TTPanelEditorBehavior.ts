/**
 * TTPanelEditorBehavior.ts
 * TTPanel の Editor モード関連の機能を集約
 *
 * ヘルパー関数群:
 *   - EditorSearchHelper.ts     検索ウィジェット状態管理
 *   - EditorFoldingHelper.ts    Folding操作
 *   - EditorNavigationHelper.ts カーソルナビゲーション
 *   - EditorRequestHelper.ts    Request検出・ナビゲーション
 */

import { TTModels } from '../models/TTModels';
import type { TTMemo } from '../models/TTMemo';
import type { TTEditing } from '../models/TTEditing';

import type { IPanelModeBehavior, RequestInfo } from './IPanelModeBehavior';
import type { ActionContext } from '../types';

// ヘルパー関数のインポート
import * as SearchHelper from './EditorSearchHelper';
import * as FoldingHelper from './EditorFoldingHelper';
import * as NavigationHelper from './EditorNavigationHelper';
import * as RequestHelper from './EditorRequestHelper';

// エディタへのハンドルインターフェース（CodeEditorHandleと互換）
export interface EditorHandleInterface {
    focus: () => void;
    triggerAction: (actionId: string) => void;
    getEditor: () => any | null;
}

// TTPanel の Editor モード関連の機能を管理するクラス
export class TTPanelEditorBehavior implements IPanelModeBehavior {

    // #region Private Fields
    private _panel: { ID: string; Name: string; NotifyUpdated: () => void };

    // エディタへのハンドル
    public Handle: EditorHandleInterface | null = null;

    // リソース（表示中のメモID）
    private _resource: string = '';

    // エディタのテキスト内容
    private _text: string = '';

    // 自分で編集（ローカル変更）中かどうかを追跡
    private _isEditingLocally: boolean = false;

    // 保存関連
    private _saveTimerId: ReturnType<typeof setTimeout> | null = null;
    private _restoreTimerId: ReturnType<typeof setTimeout> | null = null;
    private _isSaving: boolean = false;
    private _isRestoring: boolean = false;


    // エディタオプション
    private _wordWrap: boolean = false;
    private _minimap: boolean = true;
    private _lineNumbers: boolean = true;

    // キーワード
    private _keywords: string = '';
    private _activeKeyword: string = '';

    constructor(panel: { ID: string; Name: string; NotifyUpdated: () => void }) {
        this._panel = panel;
    }
    // #endregion

    // #region Resource
    public get Resource(): string {
        return this._resource;
    }
    public set Resource(value: string) {
        if (this._resource === value) return;

        // 以前のメモのサブスクリプションを解除
        this.unsubscribeFromMemo();

        this._resource = value;
        this._isEditingLocally = false;
        this._text = '';
        this._panel.NotifyUpdated();
        this.ReloadContent();
    }
    // #endregion

    // #region Text
    public get Text(): string {
        return this._text;
    }

    public set Text(value: string) {
        if (this._text === value) return;
        this._text = value;
        this._isEditingLocally = true;
        this._panel.NotifyUpdated();

        // デバウンス付き保存ルーチン
        this.scheduleSave();
    }

    /**
     * 外部からテキストを設定（NotifyUpdatedを呼ぶが保存はしない）
     */
    public setTextSilent(value: string): void {
        if (this._text === value) return;
        this._text = value;
    }
    // #endregion

    // #region Editor Options
    public get WordWrap(): boolean {
        return this._wordWrap;
    }
    public set WordWrap(value: boolean) {
        if (this._wordWrap === value) return;
        this._wordWrap = value;
        this._panel.NotifyUpdated();
    }

    public get Minimap(): boolean {
        return this._minimap;
    }
    public set Minimap(value: boolean) {
        if (this._minimap === value) return;
        this._minimap = value;
        this._panel.NotifyUpdated();
    }

    public get LineNumbers(): boolean {
        return this._lineNumbers;
    }
    public set LineNumbers(value: boolean) {
        if (this._lineNumbers === value) return;
        this._lineNumbers = value;
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
    // #endregion

    // #region SearchMode — EditorSearchHelper へ委譲
    public get SearchMode(): string {
        return SearchHelper.getSearchMode(this.Handle?.getEditor());
    }
    public set SearchMode(value: string) {
        SearchHelper.setSearchMode(this.Handle?.getEditor(), value);
        this._panel.NotifyUpdated();
    }

    public get SearchRegex(): boolean {
        return SearchHelper.getSearchRegex(this.Handle?.getEditor());
    }
    public set SearchRegex(value: boolean) {
        SearchHelper.setSearchRegex(this.Handle?.getEditor(), value);
        this._panel.NotifyUpdated();
    }

    public get SearchCaseSensitive(): boolean {
        return SearchHelper.getSearchCaseSensitive(this.Handle?.getEditor());
    }
    public set SearchCaseSensitive(value: boolean) {
        SearchHelper.setSearchCaseSensitive(this.Handle?.getEditor(), value);
        this._panel.NotifyUpdated();
    }

    public get SearchWholeWord(): boolean {
        return SearchHelper.getSearchWholeWord(this.Handle?.getEditor());
    }
    public set SearchWholeWord(value: boolean) {
        SearchHelper.setSearchWholeWord(this.Handle?.getEditor(), value);
        this._panel.NotifyUpdated();
    }

    public get ReplaceKeepCapitalize(): boolean {
        return SearchHelper.getReplaceKeepCapitalize(this.Handle?.getEditor());
    }
    public set ReplaceKeepCapitalize(value: boolean) {
        SearchHelper.setReplaceKeepCapitalize(this.Handle?.getEditor(), value);
        this._panel.NotifyUpdated();
    }

    public get ReplaceInSelection(): boolean {
        return SearchHelper.getReplaceInSelection(this.Handle?.getEditor());
    }
    public set ReplaceInSelection(value: boolean) {
        SearchHelper.setReplaceInSelection(this.Handle?.getEditor(), value);
        this._panel.NotifyUpdated();
    }
    // #endregion

    // キーワードを整形（重複除去、空行除去）
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

    // #region Save
    public async Save(): Promise<void> {
        await this.saveContent();
    }

    private scheduleSave(): void {
        if (this._saveTimerId !== null) {
            clearTimeout(this._saveTimerId);
        }

        this._saveTimerId = setTimeout(() => {
            this._saveTimerId = null;
            this.saveContent();
        }, 100);
    }

    private async saveContent(): Promise<void> {
        console.log(`[TTPanelEditorBehavior.${this._panel.Name}] saveContent called, resource: ${this._resource}, isSaving: ${this._isSaving}`);

        if (this._isSaving) return;
        if (this._isRestoring) {
            console.log(`[TTPanelEditorBehavior.${this._panel.Name}] Restoring中のため保存スキップ: ${this._resource}`);
            return;
        }
        if (!this._resource) {
            console.log(`[TTPanelEditorBehavior.${this._panel.Name}] Resourceが未設定のため保存スキップ`);
            return;
        }

        this._isSaving = true;
        try {
            const models = TTModels.Instance;
            if (!models) {
                console.log(`[TTPanelEditorBehavior.${this._panel.Name}] Modelsが未初期化のため保存スキップ`);
                return;
            }

            // 1. Memo Content Saving
            let memo = models.Memos.GetItem(this._resource) as TTMemo;
            if (memo) {
                // Check if content is effectively changed (ignoring line endings)
                const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                if (normalize(this._text) === normalize(memo.Content)) {
                    console.log(`[TTPanelEditorBehavior.${this._panel.Name}] Content effectively unchanged, skipping memo save: ${this._resource}`);
                } else {
                    console.log(`[TTPanelEditorBehavior] Saving Memo: ID=${memo.ID}, Title='${memo.Name}'`);
                    memo.setContentSilent(this._text);
                    await memo.SaveContent();
                    memo.NotifyUpdated();
                    console.log(`[TTPanelEditorBehavior.${this._panel.Name}] 自動保存完了: ${this._resource}`);
                }
            } else {
                console.log(`[TTPanelEditorBehavior.${this._panel.Name}] メモが見つかりません: ${this._resource}`);
            }

            // 2. Editing State Saving — FoldingHelper を使用
            const editor = this.Handle?.getEditor();
            if (editor) {
                const position = editor.getPosition();
                const caretPos = position ? position.lineNumber : 1;
                const caretColumn = position ? position.column : 1;
                const foldings = FoldingHelper.getCollapsedLines(editor).join(',');

                models.Editings.UpdateEditing(this._resource, {
                    caretPos: caretPos,
                    caretColumn: caretColumn,
                    wordWrap: this.WordWrap,
                    foldings: foldings,
                    keywords: this.Keywords
                });

                // Persist Editings collection
                await models.Editings.FlushCache();
                console.log(`[TTPanelEditorBehavior.${this._panel.Name}] 編集設定保存完了: ${this._resource} (Line:${caretPos})`);
            }

        } catch (e) {
            console.error(`[TTPanelEditorBehavior.${this._panel.Name}] 自動保存失敗: ${this._resource}`, e);
        } finally {
            this._isSaving = false;
            this._isEditingLocally = false;
        }
    }
    // #endregion

    // #region Memo Subscription
    private unsubscribeFromMemo(): void {
        if (this._resource) {
            const memos = TTModels.Instance?.Memos;
            if (memos) {
                const memo = memos.GetItem(this._resource);
                if (memo) {
                    memo.RemoveOnUpdate(`Panel:${this._panel.ID}`);
                }
            }
        }
    }

    private subscribeToMemo(memo: TTMemo): void {
        console.log(`[TTPanelEditorBehavior.${this._panel.Name}] subscribeToMemo called for: ${memo.ID}`);
        memo.AddOnUpdate(`Panel:${this._panel.ID}`, () => {
            console.log(`[TTPanelEditorBehavior.${this._panel.Name}] Memo update callback triggered`);
            if (!this._isEditingLocally && this._text !== memo.Content) {
                console.log(`[TTPanelEditorBehavior.${this._panel.Name}] 外部からのメモ変更を受信: ${memo.ID}`);
                this._text = memo.Content;
                this._panel.NotifyUpdated();
            }
        });
    }

    private async ReloadContent(): Promise<void> {
        console.log(`[TTPanelEditorBehavior.${this._panel.Name}] ReloadContent called, resource: ${this._resource}`);
        if (!this._resource) {
            this._text = '';
            this._panel.NotifyUpdated();
            return;
        }

        try {
            const memos = TTModels.Instance.Memos;
            const memo = await memos.getOrCreateMemo(this._resource);
            console.log(`[TTPanelEditorBehavior.${this._panel.Name}] Got memo: ${memo.ID}`);

            this.subscribeToMemo(memo);
            this._text = memo.Content;

            console.log(`[TTPanelEditorBehavior.${this._panel.Name}] Reloaded content logic: ID=${memo.ID}, ContentLength=${memo.Content.length}, IsEmpty=${!memo.Content}`);

            // Restore Editing State
            const editing = TTModels.Instance.Editings.GetOrCreate(this._resource);
            if (editing) {
                console.log(`[TTPanelEditorBehavior.${this._panel.Name}] Found existing editing state for ${this._resource}: Foldings='${editing.Foldings}'`);
                this.WordWrap = editing.WordWrap;
                this.Keywords = editing.Keywords;
                this._isRestoring = true; // State復元開始
            } else {
                console.log(`[TTPanelEditorBehavior.${this._panel.Name}] No existing editing state for ${this._resource}`);
            }

            this._panel.NotifyUpdated();

            this._panel.NotifyUpdated();

            // Attempt to restore cursor/folding after UI update
            if (editing) {
                // 以前の復元予約があればキャンセル
                if (this._restoreTimerId) {
                    clearTimeout(this._restoreTimerId);
                    this._restoreTimerId = null;
                }

                console.log(`[TTPanelEditorBehavior.${this._panel.Name}] Scheduling restoreEditorState for ${this._resource} (Timer Set)`);
                this._restoreTimerId = setTimeout(() => {
                    this._restoreTimerId = null;
                    this.restoreEditorState(editing);
                }, 200);
            } else {
                this._isRestoring = false;
            }

        } catch (e) {
            console.error(`Failed to reload content for ${this._resource}`, e);
            this._text = '';
            this._isRestoring = false;
            this._panel.NotifyUpdated();
        }
    }

    private restoreEditorState(editing: TTEditing, retryCount: number = 0): void {
        // Wait for Editings collection to be fully loaded
        if (!TTModels.Instance?.Editings?.IsLoaded) {
            if (retryCount > 60) { // 60 * 100ms = 6 seconds (timeout extended)
                console.warn(`[TTPanelEditorBehavior] Editings collection not loaded after timeout. Proceeding with current state.`);
            } else {
                console.log(`[TTPanelEditorBehavior] Editings not loaded yet. Retrying... (${retryCount})`);
                this._restoreTimerId = setTimeout(() => {
                    this._restoreTimerId = null;
                    this.restoreEditorState(editing, retryCount + 1);
                }, 100);
                return;
            }
        }

        // Check if editing object matches current resource (sanity check)
        if (editing.ID !== this._resource) {
            console.warn(`[TTPanelEditorBehavior] Restore target mismatch: EditingID=${editing.ID}, Resource=${this._resource}`);
            return;
        }

        console.log(`[TTPanelEditorBehavior] restoreEditorState: ID=${editing.ID}, Foldings='${editing.Foldings}', Keywords='${editing.Keywords}', HandlePresent=${!!this.Handle}, Retry=${retryCount}`);

        const editor = this.Handle?.getEditor();
        if (!editor) {
            if (retryCount > 40) { // 40 * 500ms = 20秒 で打ち切り
                console.warn(`[TTPanelEditorBehavior] Editor handle not available after timeout. Aborting restore: ${this._resource}`);
                this._isRestoring = false;
                return;
            }
            if (retryCount % 5 === 0) {
                console.warn(`[TTPanelEditorBehavior] Editor handle not available for restore: ${this._resource} (Retry: ${retryCount})`);
            }
            this._restoreTimerId = setTimeout(() => {
                this._restoreTimerId = null;
                this.restoreEditorState(editing, retryCount + 1);
            }, 500); // Wait longer for editor mount
            return;
        }

        const model = editor.getModel();
        if (!model) {
            console.warn(`[TTPanelEditorBehavior] Editor model not available for restore: ${this._resource}`);
            this._isRestoring = false;
            return;
        }

        console.log(`[TTPanelEditorBehavior] Editor Ready. LineCount=${model.getLineCount()}. Checking Folding Model...`);

        // Check if content is loaded (LineCount > 1) if we expect foldings
        if (editing.Foldings && editing.Foldings.length > 0) {
            const currentLineCount = model.getLineCount();
            if (currentLineCount <= 1) {
                if (retryCount > 60) { // 60 * 100ms = 6 seconds (timeout extended)
                    console.warn(`[TTPanelEditorBehavior] Line count is 1 after timeout. Proceeding (maybe actual 1-line content).`);
                } else {
                    // ログが大量に出過ぎてブラウザがフリーズするのを防ぐため、一部のみ出力
                    if (retryCount % 20 === 0) {
                        console.log(`[TTPanelEditorBehavior] Editor content not loaded yet (LineCount=${currentLineCount}). Retrying... (${retryCount})`);
                    }
                    this._restoreTimerId = setTimeout(() => {
                        this._restoreTimerId = null;
                        this.restoreEditorState(editing, retryCount + 1);
                    }, 100);
                    return;
                }
            }
        }

        // Wait for Folding Model to be ready
        if (!FoldingHelper.isFoldingReady(editor)) {
            if (retryCount > 40) { // 40 * 100ms = 4 seconds (timeout extended)
                console.warn(`[TTPanelEditorBehavior] Folding model object not found. Timeout.`);
            } else {
                // console.log(`[TTPanelEditorBehavior] Folding model not ready. Retrying... (${retryCount})`);
                this._restoreTimerId = setTimeout(() => {
                    this._restoreTimerId = null;
                    this.restoreEditorState(editing, retryCount + 1);
                }, 100);
                return;
            }
        }

        // If we expect foldings, wait until regions are actually computed
        if (editing.Foldings && editing.Foldings.length > 0) {
            const regionCount = FoldingHelper.getFoldingRegionCount(editor);
            if (regionCount === 0) {
                // Editor has content but 0 regions computed yet?
                const model = editor.getModel();
                if (model && model.getLineCount() > 10) { // arbitrary threshold for "should have regions" check
                    if (retryCount > 100) { // 100 * 100ms = 10 seconds max (cumulative with previous check)
                        console.warn(`[TTPanelEditorBehavior] Folding regions count is 0 after timeout (10s). Proceeding.`);
                    } else {
                        if (retryCount % 10 === 0) console.log(`[TTPanelEditorBehavior] Folding regions not computed yet (0). Retrying... (${retryCount})`);
                        this._restoreTimerId = setTimeout(() => {
                            this._restoreTimerId = null;
                            this.restoreEditorState(editing, retryCount + 1);
                        }, 100);
                        return;
                    }
                }
            }
        }

        try {
            // Restore Foldings FIRST
            if (editing.Foldings) {
                console.log(`[TTPanelEditorBehavior] Restore Foldings: Raw '${editing.Foldings}'`);

                editor.trigger('source', 'editor.unfoldAll', null);

                setTimeout(() => {
                    const linesToFold = editing.Foldings.split(',')
                        .map(s => parseInt(s.trim(), 10))
                        .filter(n => !isNaN(n) && n > 0 && n <= model.getLineCount());

                    console.log(`[TTPanelEditorBehavior] Lines to fold parsed: ${linesToFold.length} lines.`);

                    if (linesToFold.length > 0) {
                        console.log(`[TTPanelEditorBehavior] Folding lines (descending): ${linesToFold.join(', ')}`);
                        linesToFold.sort((a, b) => b - a);

                        const selections = linesToFold.map(line => ({
                            selectionStartLineNumber: line,
                            selectionStartColumn: 1,
                            positionLineNumber: line,
                            positionColumn: 1
                        }));

                        editor.setSelections(selections);
                        editor.trigger('source', 'editor.fold', null);
                    }
                }, 100);
            }

            // Restore Caret Position SECOND — FoldingHelper を使用
            setTimeout(() => {
                let caretPos = editing.CaretPos || 1;
                let caretColumn = editing.CaretColumn || 1;

                const lineCount = model.getLineCount();
                caretPos = Math.min(Math.max(caretPos, 1), lineCount);

                const maxColumn = model.getLineMaxColumn(caretPos);
                caretColumn = Math.min(Math.max(caretColumn, 1), maxColumn);

                if (FoldingHelper.isLineInCollapsedRegion(editor, caretPos)) {
                    console.log(`[TTPanelEditorBehavior] Caret ${caretPos} is inside a collapsed region. Adjusting to visible parent.`);
                    let newCaretPos = caretPos;
                    while (newCaretPos > 1 && FoldingHelper.isLineInCollapsedRegion(editor, newCaretPos)) {
                        newCaretPos--;
                    }
                    caretPos = newCaretPos;
                    caretColumn = 1;
                    console.log(`[TTPanelEditorBehavior] Adjusted Caret to: ${caretPos}`);
                }

                editor.setPosition({ lineNumber: caretPos, column: caretColumn });
                editor.revealLineNearTop(caretPos, 1);
                console.log(`[TTPanelEditorBehavior] Restored Caret: Line=${caretPos}, Col=${caretColumn}`);

                // 復元完了
                this._isRestoring = false;
            }, 300);

        } catch (e) {
            console.warn(`[TTPanelEditorBehavior] Failed to restore state for ${this._resource}`, e);
            this._isRestoring = false;
        }
    }
    // #endregion

    // #region Navigation — EditorNavigationHelper へ委譲
    public get CurPos(): string {
        const editor = this.Handle?.getEditor();
        if (!editor) return '1,1';

        const pos = editor.getPosition();
        if (!pos) return '1,1';

        return `${pos.lineNumber},${pos.column}`;
    }

    public set CurPos(value: string) {
        const editor = this.Handle?.getEditor();
        if (!editor) return;

        const handled = NavigationHelper.applyCursorCommand(this.Handle, editor, value);
        if (!handled) {
            // 座標指定として処理
            NavigationHelper.applyCursorPosition(editor, value);
        }

        // 最後に必ずカーソル位置が見えるようにスクロール
        const finalPos = editor.getPosition();
        if (finalPos) {
            editor.revealPositionInCenter(finalPos);
        }

        this._panel.NotifyUpdated();
    }

    // 選択付きカーソル移動
    public get SelPos(): string {
        const editor = this.Handle?.getEditor();
        if (!editor) return '1,1,1,1';

        const sel = editor.getSelection();
        if (!sel) return '1,1,1,1';

        return `${sel.selectionStartLineNumber},${sel.selectionStartColumn},${sel.positionLineNumber},${sel.positionColumn}`;
    }

    public set SelPos(value: string) {
        const editor = this.Handle?.getEditor();
        if (!editor) return;

        NavigationHelper.applySelectionCommand(this.Handle, editor, value);
        this._panel.NotifyUpdated();
    }
    // #endregion

    // #region Folding — EditorFoldingHelper へ委譲
    public GotoPrevHeading(): void {
        FoldingHelper.gotoPrevHeading(this.Handle?.getEditor());
    }

    public GotoNextHeading(): void {
        FoldingHelper.gotoNextHeading(this.Handle?.getEditor());
    }

    public GotoFirstSiblingHeading(): void {
        FoldingHelper.gotoFirstSiblingHeading(this.Handle?.getEditor());
    }

    public GotoLastSiblingHeading(): void {
        FoldingHelper.gotoLastSiblingHeading(this.Handle?.getEditor());
    }

    public async OpenAllSiblingHeading(): Promise<void> {
        await FoldingHelper.openAllSiblingHeading(this.Handle?.getEditor());
    }

    public async CloseAllSiblingHeading(): Promise<void> {
        await FoldingHelper.closeAllSiblingHeading(this.Handle?.getEditor());
    }

    public FoldingInit(): void {
        FoldingHelper.foldingInit(this.Handle?.getEditor());
    }

    public FoldingUp(): void {
        FoldingHelper.foldingUp(this.Handle?.getEditor());
    }

    public FoldingDown(): void {
        FoldingHelper.foldingDown(this.Handle?.getEditor());
    }

    public FoldOrCloseSiblings(): void {
        FoldingHelper.foldOrCloseSiblings(this.Handle?.getEditor());
    }
    // #endregion

    // #region Request — EditorRequestHelper へ委譲
    public GetActiveRequest(context?: ActionContext): RequestInfo | null {
        return RequestHelper.getActiveRequest(this.Handle?.getEditor(), context);
    }

    public GotoNextRequest(): void {
        RequestHelper.gotoNextRequest(this.Handle?.getEditor());
    }

    public GotoPrevRequest(): void {
        RequestHelper.gotoPrevRequest(this.Handle?.getEditor());
    }

    public GotoFirstRequest(): void {
        RequestHelper.gotoFirstRequest(this.Handle?.getEditor());
    }

    public GotoLastRequest(): void {
        RequestHelper.gotoLastRequest(this.Handle?.getEditor());
    }
    // #endregion

    public OnKeyDown(e: KeyboardEvent, modifiers: string[], triggerAction: (context: any) => boolean): boolean {
        // キーマッピング
        let mappedKey = e.key.toUpperCase();
        if (e.key === 'ArrowLeft') mappedKey = 'LEFT';
        else if (e.key === 'ArrowRight') mappedKey = 'RIGHT';
        else if (e.key === 'ArrowUp') mappedKey = 'UP';
        else if (e.key === 'ArrowDown') mappedKey = 'DOWN';
        else if (e.key === ' ') mappedKey = 'SPACE';

        const context = {
            Key: mappedKey,
            Mods: modifiers
        };

        const processed = triggerAction(context);

        if (processed) {
            e.preventDefault();
            e.stopPropagation();
        }

        return processed;
    }

    public GetTitleSuffix(): string {
        if (!this.Resource) return '';

        // メモを取得してタイトルを表示
        const memo = TTModels.Instance?.Memos?.GetItem(this.Resource);
        const title = memo?.Name || '';

        // タイトルからID部分 [ID] を除去して表示（重複するため）
        const cleanTitle = title.replace(/^\[.*?\]\s*/, '');

        return ` | ${this.Resource} | ${cleanTitle}`;
    }

}
