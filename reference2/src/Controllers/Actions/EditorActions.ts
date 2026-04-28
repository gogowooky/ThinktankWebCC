/**
 * EditorActions.ts
 * Editor系アクション（Folding, Edit, Select, AutoComplete, Date/DateTime）
 */
import { TTModels } from '../../models/TTModels';
import { TTApplication } from '../../Views/TTApplication';
import { DateHelper } from '../helpers/DateHelper';
import { EditorHelper } from '../helpers/EditorHelper';
import type { ActionContext, ActionScript } from '../../types';

/**
 * Editor系アクションを登録します
 */
export function registerEditorActions(
    models: TTModels,
    actions: { GetItem: (id: string) => any },
    addAction: (id: string, description: string, script: ActionScript) => void
) {
    // === Editor.Editing ===
    addAction('Editor.Editing.Save', 'エディタの内容を保存', async (_context: ActionContext) => {
        const app = TTApplication.Instance;
        // ExCurrentPanel が設定されている場合はそちらを使い、なければ ActivePanel を使う
        const panel = app.ExCurrentPanel;
        if (panel?.Editor) {
            console.log(`[Editor.Editing.Save] 保存開始: panel=${panel.Name}, mode=${panel.Mode}, tool=${panel.Tool}`);
            await panel.Editor.Save();
            console.log(`[Editor.Editing.Save] 保存完了: panel=${panel.Name}`);
        } else {
            console.warn(`[Editor.Editing.Save] 対象パネルが見つかりません`);
        }
    });

    // === ヘルパー関数: アクティブパネルのエディタでMonacoアクションを実行 ===
    // ExFoldモードは維持され、ESCや他のキー操作でリセットされるまで継続する
    function triggerEditorAction(actionId: string): void {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        if (panel?.Editor.Handle) {
            panel.Editor.Handle.triggerAction(actionId);
        } else {
            console.warn(`[Editor.Folding] エディタハンドルが見つかりません`);
        }
    }

    // === Editor.Folding open/close ===
    addAction('Editor.Folding.Open', 'カーソル位置を展開', (_context: ActionContext) => {
        triggerEditorAction('editor.unfold');
    });
    addAction('Editor.Folding.Close', 'カーソル位置を折りたたむ(既に閉じていれば同レベルをすべて閉じる)', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        if (panel?.Editor) {
            panel.Editor.FoldOrCloseSiblings();
        } else {
            triggerEditorAction('editor.fold');
        }
    });
    addAction('Editor.Folding.OpenAll', 'すべての折りたたみを展開', (_context: ActionContext) => {
        triggerEditorAction('editor.unfoldAll');
    });
    addAction('Editor.Folding.CloseAll', 'すべて折りたたむ', (_context: ActionContext) => {
        triggerEditorAction('editor.foldAll');
    });
    addAction('Editor.Folding.OpenAllSibling', '同レベルの折りたたみをすべて展開', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        panel?.Editor.OpenAllSiblingHeading();
    });
    addAction('Editor.Folding.CloseAllSibling', '同レベルの折りたたみをすべて閉じる', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        panel?.Editor.CloseAllSiblingHeading();
    });
    addAction('Editor.Folding.OpenLevel1', 'レベル1まで展開', (_context: ActionContext) => { triggerEditorAction('editor.foldLevel1'); });
    addAction('Editor.Folding.OpenLevel2', 'レベル2まで展開', (_context: ActionContext) => { triggerEditorAction('editor.foldLevel2'); });
    addAction('Editor.Folding.OpenLevel3', 'レベル3まで展開', (_context: ActionContext) => { triggerEditorAction('editor.foldLevel3'); });
    addAction('Editor.Folding.OpenLevel4', 'レベル4まで展開', (_context: ActionContext) => { triggerEditorAction('editor.foldLevel4'); });
    addAction('Editor.Folding.OpenLevel5', 'レベル5まで展開', (_context: ActionContext) => { triggerEditorAction('editor.foldLevel5'); });

    // === Editor.Edit ===
    addAction('Editor.Memo.Create', '新規メモを作成', async (context: ActionContext) => {
        console.log('[Request.Memo.Create] 新規メモ作成を開始します...');

        // 1. 新規メモ作成
        const memo = models.Memos.AddNewMemo();

        // 2. タイムスタンプ生成 (yyyy-mm-dd-HHMMSS)
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const HH = String(now.getHours()).padStart(2, '0');
        const MM = String(now.getMinutes()).padStart(2, '0');
        const SS = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${yyyy}-${mm}-${dd}-${HH}${MM}${SS}`;

        // 3. コンテンツ設定
        const separator = '='.repeat(50);
        const content = `No Title - ${timestamp}\n${separator}\n\n`;

        // LoadContentによる上書き防止（既にコンテンツがあるのでロード済みとみなす）
        memo.IsLoaded = true;
        // setContentSilentではなく、通常のContent設定で更新通知を行う（未保存状態＝Dirtyになる）
        memo.Content = content;

        console.log(`[Request.Memo.Create] Created memo: ${memo.ID}`);

        // 4. 作成したメモを開く
        // Request.Memo.Open アクションを再利用
        // RequestTag に ID を指定して呼び出す
        actions.GetItem('Request.Memo.Open')?.Invoke({
            ...context,
            RequestTag: `[TTMemo:${memo.ID}]`
        });
    });

    addAction('Editor.Date.Action', 'ExDateTimeモードまたは現在日付挿入', (context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        if (!panel) return;

        // Contextから座標などが渡されていなければ、現在のカーソル位置で判定
        const req = panel.GetActiveRequest(context);
        if (req && ['DateTag', 'Date', 'GDate', 'JDate'].includes(req.requestId)) {
            // 日付タグ上なら ExDateTime モードへ
            app.ExMode = 'ExDateTime';
            models.Status.SetValue('Application.Current.ExMode', 'ExDateTime');

            // Initialize Session Time
            const parseResult = DateHelper.parseDate(req.requestTag, req.requestId);
            if (parseResult) {
                if (parseResult.components.hasTime) {
                    DateHelper.resetSessionTime(parseResult.date);
                } else {
                    DateHelper.resetSessionTime(); // Use current time
                }
            } else {
                DateHelper.resetSessionTime();
            }

            console.log(`[Editor.Date.Action] Switched to ExDateTime mode (Request: ${req.requestId})`);
        } else if (!req) {
            // タグがなければ現在日付を挿入
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const dateStr = `[${yyyy}-${mm}-${dd}]`; // DateTag format

            // エディタに挿入
            const editor = panel.Editor.Handle?.getEditor();
            if (editor) {
                // typeコマンドで入力（Undoスタックなどが整合する）
                editor.trigger('keyboard', 'type', { text: dateStr });
                console.log(`[Editor.Date.Action] Inserted date: ${dateStr}`);

                // ExDateTime モードへ
                app.ExMode = 'ExDateTime';
                models.Status.SetValue('Application.Current.ExMode', 'ExDateTime');
            }
        } else {
            // 日付以外のタグ上では何もしない
            console.log(`[Editor.Date.Action] Ignored request: ${req.requestId}`);
        }
    });

    // === DateTime Shift Actions ===
    // performDateShift ロジックは DateHelper.ts に移動済み
    addAction('DateTime.Shift.Prev1y', '1年前へ', (ctx) => DateHelper.performDateShift(ctx, -1, 'year'));
    addAction('DateTime.Shift.Next1y', '1年後へ', (ctx) => DateHelper.performDateShift(ctx, 1, 'year'));
    addAction('DateTime.Shift.Prev1m', '1ヶ月前へ', (ctx) => DateHelper.performDateShift(ctx, -1, 'month'));
    addAction('DateTime.Shift.Next1m', '1ヶ月後へ', (ctx) => DateHelper.performDateShift(ctx, 1, 'month'));
    addAction('DateTime.Shift.Prev1d', '1日前へ', (ctx) => DateHelper.performDateShift(ctx, -1, 'day'));
    addAction('DateTime.Shift.Next1d', '1日後へ', (ctx) => DateHelper.performDateShift(ctx, 1, 'day'));
    addAction('DateTime.Shift.Prev1w', '1週間前へ', (ctx) => DateHelper.performDateShift(ctx, -1, 'week'));
    addAction('DateTime.Shift.Next1w', '1週間後へ', (ctx) => DateHelper.performDateShift(ctx, 1, 'week'));

    // DateTime Detail Actions
    addAction('DateTime.Detail.WithWeekday', '曜日を追加', (ctx) => DateHelper.performDateDetailUpdate(ctx, 'weekday', true));
    addAction('DateTime.Detail.WithoutWeekday', '曜日を除外', (ctx) => DateHelper.performDateDetailUpdate(ctx, 'weekday', false));
    addAction('DateTime.Detail.WithTime', '時刻を追加', (ctx) => DateHelper.performDateDetailUpdate(ctx, 'time', true));
    addAction('DateTime.Detail.WithoutTime', '時刻を除外', (ctx) => DateHelper.performDateDetailUpdate(ctx, 'time', false));

    // DateTime ChangeDetail (Toggle) Actions
    addAction('DateTime.ChangeDetail.Weekday', '曜日トグル', (ctx) => DateHelper.performDateDetailToggle(ctx, 'weekday'));
    addAction('DateTime.ChangeDetail.Time', '時刻トグル', (ctx) => DateHelper.performDateDetailToggle(ctx, 'time'));

    // DateTime ChangeFormat Actions
    addAction('DateTime.ChangeFormat.Date', 'Date形式へ', (ctx) => DateHelper.performDateFormatChange(ctx, 'Date'));
    addAction('DateTime.ChangeFormat.DateTag', 'DateTag形式へ', (ctx) => DateHelper.performDateFormatChange(ctx, 'DateTag'));
    addAction('DateTime.ChangeFormat.JDate', 'JDate形式へ', (ctx) => DateHelper.performDateFormatChange(ctx, 'JDate'));
    addAction('DateTime.ChangeFormat.GDate', 'GDate形式へ', (ctx) => DateHelper.performDateFormatChange(ctx, 'GDate'));
    addAction('DateTime.ChangeFormat.Next', '次のフォーマットへ', (ctx) => DateHelper.performDateFormatChange(ctx, 'Next'));
    addAction('DateTime.ChangeFormat.Prev', '前のフォーマットへ', (ctx) => DateHelper.performDateFormatChange(ctx, 'Prev'));

    // === Editor.Edit (Folding/Bullet/Tab/Comment) ===
    addAction('Editor.Edit.FoldingInit', 'Foldingを追加', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        panel?.Editor.FoldingInit();
    });
    addAction('Editor.Edit.FoldingUp', 'Foldingレベルを上げる', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        panel?.Editor.FoldingUp();
    });
    addAction('Editor.Edit.FoldingDown', 'Foldingレベルを下げる', (_context: ActionContext) => {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        panel?.Editor.FoldingDown();
    });

    // Bullet Actions Helper
    addAction('Editor.Edit.NextBullet', '次の行頭文字へ', (_context: ActionContext) => EditorHelper.performBulletChange('next'));
    addAction('Editor.Edit.PrevBullet', '前の行頭文字へ', (_context: ActionContext) => EditorHelper.performBulletChange('prev'));

    // Tab Actions Helper
    addAction('Editor.Edit.AddTAB', 'インデントを追加', (_context: ActionContext) => EditorHelper.performTabChange('add'));
    addAction('Editor.Edit.RemoveTAB', 'インデントを削除', (_context: ActionContext) => EditorHelper.performTabChange('remove'));

    // Comment Actions Helper
    addAction('Editor.Edit.NextComment', '次のコメント形式へ', (_context: ActionContext) => EditorHelper.performCommentChange('next'));
    addAction('Editor.Edit.PrevComment', '前のコメント形式へ', (_context: ActionContext) => EditorHelper.performCommentChange('prev'));

    // === Editor.Select ===
    addAction('Editor.Select.Up', '上を選択', (_context: ActionContext) => { triggerEditorAction('cursorUpSelect'); });
    addAction('Editor.Select.Down', '下を選択', (_context: ActionContext) => { triggerEditorAction('cursorDownSelect'); });
    addAction('Editor.Select.Prev', '左(前)を選択', (_context: ActionContext) => { triggerEditorAction('cursorLeftSelect'); });
    addAction('Editor.Select.Next', '右(次)を選択', (_context: ActionContext) => { triggerEditorAction('cursorRightSelect'); });
    addAction('Editor.Select.FirstLine', '最初の行へ選択', (_context: ActionContext) => { triggerEditorAction('cursorTopSelect'); });
    addAction('Editor.Select.LastLine', '最後の行へ選択', (_context: ActionContext) => { triggerEditorAction('cursorBottomSelect'); });

    // === Editor.AutoComplete ===
    addAction('Editor.AutoComplete.Suggest', 'Suggestを起動', (_context: ActionContext) => { triggerEditorAction('editor.action.triggerSuggest'); });
}
