import type { TTModels } from '../models/TTModels';
import { TTEvent } from '../models/TTEvent';
// import { TTAction } from './TTAction';
// import { TTApplication } from '../View/TTApplication';

export function InitializeDefaultEvents(models: TTModels) {
    const events = models.Events;

    function AddEvent(context: string, mods: string, key: string, actionId: string) {
        // カンマ区切りキーの展開 (PSロジック互換)
        if (key.includes(',')) {
            key.split(',').forEach(k => AddEvent(context, mods, k.trim(), actionId));
            return;
        }

        const ev = new TTEvent();
        ev.Context = context;
        ev.Mods = mods;
        ev.Key = key;
        ev.Name = actionId;
        ev.ID = `${context}|${mods}|${key}`;
        events.AddItem(ev);

        // StatusID:val パターンの確認と動的アクション登録 (DefaultActionsでのリゾルバ設定以前のLegacyロジックの補完)
        // リファクタリングにより DefaultActions.ts 側で動的解決されるようになりましたが、
        // イベント登録時にアクションが存在しない場合、ここで明示的に登録する必要があるか？
        // TTActions.GetItem() は動的解決を行いますが、Eventsから参照する際に ActionID が存在するかチェックしています。
        // ここでの登録ロジックは、動的リゾルバが機能するなら不要ですが、
        // イベント定義として「このIDのアクションを使う」と宣言するためのプレースホルダーとして残すか、
        // 完全に削除して GetItem 依存にするか。
        // ※現状のコードフローでは、ここでアクションを追加しないと、Actionsコレクションに登録されません。
        // 動的解決は GetItem 時に行われるため、ここで AddItem しなくても GetItem すれば取得できます。
        // しかし、InitializeDefaultEvents は InitializeDefaultActions の後に呼ばれるため、
        // models.Actions はインスタンス化済み。

        // 結論: ここでの動的生成は本来不要（GetItemで解決されるため）。
        // ただし、明示的に登録しておくと一覧性が良くなるため、既存ロジックを維持しつつコメントのみ更新します。
        // ※実際の生成ロジックは DefaultActions に移譲すべきですが、ここは簡易的な登録のみ行います。 

        if (actionId.includes(':')) {
            const match = actionId.match(/^([^:]+):(.*)$/);
            if (match) {
                // アクションが未登録なら、動的生成を試みる (GetItemを呼ぶだけで生成・登録される)
                if (!models.Actions.GetItem(actionId)) {
                    // GetItem内部でDynamicResolverが呼ばれ、生成・登録されるはずです。
                    // 明示的な処理は不要になりました。
                }
            }
        }
    }

    // #region Editor MASK
    AddEvent('*-Editor-Main-*', 'Alt', 'R', 'Application.Command.NoAction');        // Search RegEx
    AddEvent('*-Editor-Main-*', 'Alt', 'C', 'Application.Command.NoAction');        // Search Captalize
    AddEvent('*-Editor-Main-*', 'Alt', 'P', 'Application.Command.NoAction');        // Replace with Keeping Capitalize
    AddEvent('*-Editor-Main-*', 'Control', 'H', 'Application.Command.NoAction');    // x Replace
    AddEvent('*-*-Keyword-*', 'Control', 'F', 'Application.Command.NoAction');      // x Search
    AddEvent('*-*-Keyword-*', 'Alt', 'R', 'Application.Command.NoAction');          // x Search RegEx
    AddEvent('*-*-Keyword-*', 'Alt', 'C', 'Application.Command.NoAction');          // x Search Captalize
    AddEvent('*-*-Keyword-*', 'Control', 'H', 'Application.Command.NoAction');      // x Replace
    AddEvent('*-*-Keyword-*', 'Alt', 'P', 'Application.Command.NoAction');          // x Replace with Keeping Capitalize
    // AddEvent('*-*-Keyword-*', 'Alt', 'W', 'Application.Command.NoAction');          // x Search Word
    // AddEvent('*-Editor-Main-*', 'Alt', 'W', 'Application.Command.NoAction');        // Search Word
    // AddEvent('*-Editor-Main-*', 'Alt', 'L', 'Application.Command.NoAction');        // Replace In Selection
    // AddEvent('*-*-Keyword-*', 'Alt', 'L', 'Application.Command.NoAction');          // x Replace In Selection
    //AddEvent('*-*-*-*', 'Control', 'S', 'Application.Command.NoAction');            // x Disable Browser Save Dialog
    // #endregion
    // #region Application app          Delegate:   [ F5,F11,F12 ]
    AddEvent('*-*-*-*', '', 'F5', 'Application.Command.Delegate');                  // reload
    AddEvent('*-*-*-*', 'Control+Shift', 'R', 'Application.Command.Delegate');      // reload
    AddEvent('*-*-*-*', '', 'F12', 'Application.Command.Delegate');                 // development panel
    AddEvent('*-*-*-*', '', 'F11', 'Application.Command.Delegate');                 // fullscreen
    // #endregion
    // #region Application font         Status:     (^|^+)[ ;- ]
    AddEvent('*-*-*-*', 'Control+Shift', '+', 'Application.Command.Delegate');      // font up
    AddEvent('*-*-*-*', 'Control+Shift', '=', 'Application.Command.Delegate');      // font down
    AddEvent('*-*-*-*', 'Control', ';', 'Application.Command.Delegate');            // font up
    AddEvent('*-*-*-*', 'Control', '-', 'Application.Command.Delegate');            // font down
    // #endregion
    // #region Application exapp        Status:     ![ A LSID/[] ]
    AddEvent('*-*-*-*', 'Alt', 'A', 'Application.Current.ExMode:ExApp');            // ExApp

    AddEvent('*-*-*-*', 'Alt', 'L', 'Application.Current.ExMode:ExLibrary');        // ExLibrary
    AddEvent('*-*-*-*', 'Alt', 'I', 'Application.Current.ExMode:ExIndex');          // ExIndex
    AddEvent('*-*-*-*', 'Alt', 'S', 'Application.Current.ExMode:ExShelf');          // ExShelf
    AddEvent('*-*-*-*', 'Alt', 'D', 'Application.Current.ExMode:ExDesk');           // ExDesk
    AddEvent('*-*-*-*', 'Alt', '/', 'Application.Current.ExMode:ExSystem');         // ExSystem
    AddEvent('*-*-*-*', 'Alt', '[', 'Application.Current.ExMode:ExChat');           // ExChat
    AddEvent('*-*-*-*', 'Alt', ']', 'Application.Current.ExMode:ExLog');            // ExLog
    // #endregion
    // #region Application panel        Status:     ![ \ ] !+[ LISD?{} ]
    AddEvent('*-*-*-*', 'Alt', '\\', 'Application.Current.Panel:next');             // Panel
    AddEvent('*-*-*-*', 'Alt+Shift', '_', 'Application.Current.Panel:prev');        // Panel

    AddEvent('*-*-*-*', 'Alt+Shift', 'L', 'Application.Current.Panel:Library');     // library
    AddEvent('*-*-*-*', 'Alt+Shift', 'I', 'Application.Current.Panel:Index');       // index
    AddEvent('*-*-*-*', 'Alt+Shift', 'S', 'Application.Current.Panel:Shelf');       // shelf
    AddEvent('*-*-*-*', 'Alt+Shift', 'D', 'Application.Current.Panel:Desk');        // desk
    AddEvent('*-*-*-*', 'Alt+Shift', '?', 'Application.Current.Panel:System');      // system
    AddEvent('*-*-*-*', 'Alt+Shift', '{', 'Application.Current.Panel:Chat');        // chat
    AddEvent('*-*-*-*', 'Alt+Shift', '}', 'Application.Current.Panel:Log');         // log
    // #endregion
    // #region Application mode         Status:     ![ QWE ] (!|!+)[ M ]
    AddEvent('*-*-*-*', 'Alt', 'Q', 'Application.Current.Mode:Table');              // Mode:Table
    AddEvent('*-*-*-*', 'Alt', 'W', 'Application.Current.Mode:WebView');            // Mode:WebView
    AddEvent('*-*-*-*', 'Alt', 'E', 'Application.Current.Mode:Editor');             // Mode:Editor
    AddEvent('*-*-*-*', 'Alt', 'M', 'Application.Current.Mode:next');               // Mode
    AddEvent('*-*-*-*', 'Alt+Shift', 'M', 'Application.Current.Mode:prev');         // Mode
    // #endregion
    // #region Application tool         Status:     ![ H ]
    AddEvent('*-Table-*-*', 'Alt', 'H', 'Application.Current.Tool:Main');           // Tool
    AddEvent('*-WebView-*-*', 'Alt', 'H', 'Application.Current.Tool:next');         // Tool
    AddEvent('*-Editor-*-*', 'Alt', 'H', 'Application.Current.Tool:next');          // Tool
    // #endregion

    // #region ExApp style              Status:     ExApp > [ ZSR V ]
    AddEvent('*-*-*-ExApp', '', 'Z', 'Application.Style.PanelRatio:zen');           // style zen
    AddEvent('*-*-*-ExApp', '', 'S', 'Application.Style.PanelRatio:standard');      // style standard
    AddEvent('*-*-*-ExApp', '', 'R', 'Application.Style.PanelRatio:reset');         // style reset

    AddEvent('*-*-*-ExApp', '', 'V', 'Application.Voice.Input:next');               // voice input

    // #endregion
    // #region ExApp editor option      Status:     ExApp > [ MFX ] 
    AddEvent('*-Editor-Main-ExApp', '', 'M', '(ExPanel).Editor.Minimap:next');
    AddEvent('*-Editor-Main-ExApp', '', 'X', '(ExPanel).Editor.Wordwrap:next');
    AddEvent('*-Editor-Main-ExApp', '', 'N', '(ExPanel).Editor.LineNumber:next');
    // #endregion
    // #region ExApp editor find        Status:     ExApp > (^|^+)[ F ] [ RWCPL ]
    AddEvent('*-Editor-Main-ExApp', '', 'F', '(Panel).Editor.SearchMode:next');          // find,replace
    AddEvent('*-Editor-Main-ExApp', 'Shift', 'F', '(Panel).Editor.SearchMode:prev');    // find,replace
    AddEvent('*-Editor-Main-ExApp', '', 'R', '(Panel).Editor.SearchRegex:next');            // Search RegEx
    AddEvent('*-Editor-Main-ExApp', '', 'W', '(Panel).Editor.SearchWholeWord:next');        // Search Word
    AddEvent('*-Editor-Main-ExApp', '', 'C', '(Panel).Editor.SearchCaseSensitive:next');    // Search Word
    AddEvent('*-Editor-Main-ExApp', '', 'P', '(Panel).Editor.ReplaceKeepCapitalize:next');  // Replace with Keeping Capitalize
    AddEvent('*-Editor-Main-ExApp', '', 'L', '(Panel).Editor.ReplaceInSelection:next');     // Replace In Selection  
    // #endregion
    // #region ExApp reset              Actions:    ExApp > (+/+^)[ R ]
    AddEvent('*-*-*-ExApp', 'Shift', 'R', 'Application.Memo.Renew');
    AddEvent('*-*-*-ExApp', 'Shift+Control', 'R', 'Application.AllCollection.Save');
    // AddEvent('*-*-*-*', 'Control', 'R', 'Application.Command.Delegate');         // reload
    // #endregion

    // #region ExPanel mode             Status:     ExPanel > [ QWE ] (non|+)[ M ]
    AddEvent('*-*-*-ExPanel', '', 'Q', '(ExPanel).Current.Mode:Table');          // Mode:Table
    AddEvent('*-*-*-ExPanel', '', 'W', '(ExPanel).Current.Mode:WebView');        // Mode:WebView
    AddEvent('*-*-*-ExPanel', '', 'E', '(ExPanel).Current.Mode:Editor');         // Mode:Editor
    AddEvent('*-*-*-ExPanel', '', 'M', '(ExPanel).Current.Mode:next');           // Mode
    AddEvent('*-*-*-ExPanel', 'Shift', 'M', '(ExPanel).Current.Mode:prev');     // Mode
    // #endregion
    // #region ExPanel Table move       Status:     ExPanel > (non|+|^+)[ PN↑↓ ]
    AddEvent('*-Table-*-ExPanel', '', 'P', '(ExPanel).Table.CurPos:prev');
    AddEvent('*-Table-*-ExPanel', '', 'N', '(ExPanel).Table.CurPos:next');
    AddEvent('*-Table-*-ExPanel', 'Shift', 'P', '(ExPanel).Table.CurPos:prev10');
    AddEvent('*-Table-*-ExPanel', 'Shift', 'N', '(ExPanel).Table.CurPos:next10');
    AddEvent('*-Table-*-ExPanel', 'Shift+Control', 'P', '(ExPanel).Table.CurPos:first');
    AddEvent('*-Table-*-ExPanel', 'Shift+Control', 'N', '(ExPanel).Table.CurPos:last');

    AddEvent('*-Table-*-ExPanel', '', 'UP', '(ExPanel).Table.CurPos:prev');
    AddEvent('*-Table-*-ExPanel', '', 'DOWN', '(ExPanel).Table.CurPos:next');
    AddEvent('*-Table-*-ExPanel', 'Shift', 'UP', '(ExPanel).Table.CurPos:prev10');
    AddEvent('*-Table-*-ExPanel', 'Shift', 'DOWN', '(ExPanel).Table.CurPos:next10');
    AddEvent('*-Table-*-ExPanel', 'Shift+Control', 'UP', '(ExPanel).Table.CurPos:first');
    AddEvent('*-Table-*-ExPanel', 'Shift+Control', 'DOWN', '(ExPanel).Table.CurPos:last');
    // #endregion
    // #region ExPanel Table font       Status:     ExPanel > [ ;- ]
    AddEvent('*-*-*-ExPanel', '', ';', '(ExPanel).Font.Size:up');
    AddEvent('*-*-*-ExPanel', '', '-', '(ExPanel).Font.Size:down');
    // #endregion
    // #region ExPanel Editor request   Action:     ExPanel > (non|+)[ G ] [ sel_LEFT2/RIGHT1 ]
    AddEvent('*-Editor-Main-ExPanel', '', 'G', 'Request.Invoke.Default');
    AddEvent('*-Editor-Main-ExPanel', 'Shift', 'G', 'Request.Show.ContextMenu');
    AddEvent('*-Editor-Main-ExPanel', '', 'Selection_LEFT2', 'Request.Invoke.Default');
    AddEvent('*-Editor-Main-ExPanel', '', 'RIGHT1', 'Request.Show.ContextMenu');
    // #endregion
    // #region ExDateTime               Actions:    ExDateTime > (non|+)[ YMDKTWJ ] ![ T ]
    AddEvent('*-*-*-*', 'Alt', 'T', 'Editor.Date.Action');
    AddEvent('*-*-*-ExDateTime', '', 'Y', 'DateTime.Shift.Next1y');
    AddEvent('*-*-*-ExDateTime', 'Shift', 'Y', 'DateTime.Shift.Prev1y');
    AddEvent('*-*-*-ExDateTime', '', 'M', 'DateTime.Shift.Next1m');
    AddEvent('*-*-*-ExDateTime', 'Shift', 'M', 'DateTime.Shift.Prev1m');
    AddEvent('*-*-*-ExDateTime', '', 'D', 'DateTime.Shift.Next1d');
    AddEvent('*-*-*-ExDateTime', 'Shift', 'D', 'DateTime.Shift.Prev1d');
    AddEvent('*-*-*-ExDateTime', '', 'K', 'DateTime.Shift.Next1w');
    AddEvent('*-*-*-ExDateTime', 'Shift', 'K', 'DateTime.Shift.Prev1w');
    AddEvent('*-*-*-ExDateTime', '', 'T', 'DateTime.ChangeFormat.Next');
    AddEvent('*-*-*-ExDateTime', 'Shift', 'T', 'DateTime.ChangeFormat.Prev');
    AddEvent('*-*-*-ExDateTime', '', 'W', 'DateTime.ChangeDetail.Weekday');
    AddEvent('*-*-*-ExDateTime', '', 'J', 'DateTime.ChangeDetail.Time');
    // #endregion

    // #region Panel menu               Actions:
    AddEvent('*-*-*-*', '', 'PanelTitle_RIGHT1', 'Request.Show.ContextMenu');
    AddEvent('*-*-*-*', '', 'StatusBar_RIGHT1', 'Request.Show.ContextMenu');
    // #endregion

    // #region Common(Mode) move        Actions:    (!/!+)[ PNG ] [ sel_Left2/RIGHT1 ] 
    AddEvent('*-Editor-Main-*', 'Alt', 'P', '(Panel).Editor.CurPos:prevvisiblefolding');
    AddEvent('*-Editor-Main-*', 'Alt', 'N', '(Panel).Editor.CurPos:nextvisiblefolding');
    AddEvent('*-Editor-Main-*', 'Alt+Shift', 'P', 'Editor.Folding.Close');
    AddEvent('*-Editor-Main-*', 'Alt+Shift', 'N', 'Editor.Folding.Open');
    AddEvent('*-Editor-Main-*', 'Alt', 'G', 'Request.Invoke.Default');
    AddEvent('*-Editor-Main-*', 'Alt+Shift', 'G', 'Request.Show.ContextMenu');
    AddEvent('*-Editor-Main-*', '', 'sel_LEFT2', 'Request.Invoke.Default');
    AddEvent('*-Editor-Main-*', '', 'RIGHT1', 'Request.Show.ContextMenu');

    AddEvent('*-Table-*-*', 'Alt', 'P', '(ExPanel).Table.CurPos:prev');
    AddEvent('*-Table-*-*', 'Alt', 'N', '(ExPanel).Table.CurPos:next');
    AddEvent('*-Table-*-*', 'Alt+Shift', 'P', '(ExPanel).Table.CurPos:prev10');
    AddEvent('*-Table-*-*', 'Alt+Shift', 'N', '(ExPanel).Table.CurPos:next10');
    AddEvent('*-Table-*-*', 'Alt', 'G', 'Request.Invoke.Default');
    AddEvent('*-Table-*-*', 'Alt+Shift', 'G', 'Request.Show.ContextMenu');
    AddEvent('*-Table-*-*', '', 'Selection_LEFT2', 'Request.Invoke.Default');
    AddEvent('*-Table-*-*', '', 'RIGHT1', 'Request.Show.ContextMenu');

    AddEvent('*-WebView-*-*', 'Alt', 'P', '(ExPanel).WebView.CurPos:prev');
    AddEvent('*-WebView-*-*', 'Alt', 'N', '(ExPanel).WebView.CurPos:next');
    AddEvent('*-WebView-*-*', 'Alt+Shift', 'P', '(ExPanel).WebView.CurPos:first');
    AddEvent('*-WebView-*-*', 'Alt+Shift', 'N', '(ExPanel).WebView.CurPos:last');
    AddEvent('*-WebView-*-*', 'Alt', 'G', 'Request.Invoke.Default');
    AddEvent('*-WebView-*-*', 'Alt+Shift', 'G', 'Request.Show.ContextMenu');
    AddEvent('*-WebView-*-*', '', 'Selection_LEFT2', 'Request.Invoke.Default');
    AddEvent('*-WebView-*-*', '', 'RIGHT1', 'Request.Show.ContextMenu');
    // #endregion
    // #region Common(Tool) edit        Delegate:   ^[ ZYXCV ]
    AddEvent('*-Editor-Main-*', 'Control', 'Z', 'Application.Command.Delegate');    // Undo
    AddEvent('*-Editor-Main-*', 'Control', 'Y', 'Application.Command.Delegate');    // Redo
    AddEvent('*-Editor-Main-*', 'Control', 'X', 'Application.Command.Delegate');    // Cut
    AddEvent('*-Editor-Main-*', 'Control', 'C', 'Application.Command.Delegate');    // Copy
    AddEvent('*-Editor-Main-*', 'Control', 'V', 'Application.Command.Delegate');    // Paste

    AddEvent('*-*-Keyword-*', 'Control', 'Z', 'Application.Command.Delegate');      // Undo
    AddEvent('*-*-Keyword-*', 'Control', 'Y', 'Application.Command.Delegate');      // Redo
    AddEvent('*-*-Keyword-*', 'Control', 'X', 'Application.Command.Delegate');      // Cut
    AddEvent('*-*-Keyword-*', 'Control', 'C', 'Application.Command.Delegate');      // Copy
    AddEvent('*-*-Keyword-*', 'Control', 'V', 'Application.Command.Delegate');      // Paste
    // #endregion
    // #region Common(Tool) move        Status:     [ ↑↓←→ ] ^[ PNFBAE ]
    AddEvent('*-Editor-Main-*', '', 'UP', '(Panel).Editor.CurPos:prevline');
    AddEvent('*-Editor-Main-*', '', 'DOWN', '(Panel).Editor.CurPos:nextline');
    AddEvent('*-Editor-Main-*', '', 'LEFT', '(Panel).Editor.CurPos:prevchar');
    AddEvent('*-Editor-Main-*', '', 'RIGHT', '(Panel).Editor.CurPos:nextchar');
    AddEvent('*-Editor-Main-*', 'Control', 'P', '(Panel).Editor.CurPos:prevline');
    AddEvent('*-Editor-Main-*', 'Control', 'N', '(Panel).Editor.CurPos:nextline');
    AddEvent('*-Editor-Main-*', 'Control', 'F', '(Panel).Editor.CurPos:nextchar');
    AddEvent('*-Editor-Main-*', 'Control', 'B', '(Panel).Editor.CurPos:prevchar');
    AddEvent('*-Editor-Main-*', 'Control', 'A', '(Panel).Editor.CurPos:linestart+');
    AddEvent('*-Editor-Main-*', 'Control', 'E', '(Panel).Editor.CurPos:lineend+');

    AddEvent('*-*-Keyword-*', '', 'UP', '(Panel).Keyword.CurPos:prevline');
    AddEvent('*-*-Keyword-*', '', 'DOWN', '(Panel).Keyword.CurPos:nextline');
    AddEvent('*-*-Keyword-*', '', 'LEFT', '(Panel).Keyword.CurPos:prevchar');
    AddEvent('*-*-Keyword-*', '', 'RIGHT', '(Panel).Keyword.CurPos:nextchar');
    AddEvent('*-*-Keyword-*', 'Control', 'P', '(Panel).Keyword.CurPos:prevline');
    AddEvent('*-*-Keyword-*', 'Control', 'N', '(Panel).Keyword.CurPos:nextline');
    AddEvent('*-*-Keyword-*', 'Control', 'F', '(Panel).Keyword.CurPos:nextchar');
    AddEvent('*-*-Keyword-*', 'Control', 'B', '(Panel).Keyword.CurPos:prevchar');
    AddEvent('*-*-Keyword-*', 'Control', 'A', '(Panel).Keyword.CurPos:linestart+');
    AddEvent('*-*-Keyword-*', 'Control', 'E', '(Panel).Keyword.CurPos:lineend+');
    // #endregion
    // #region Common(Tool) select      Status:     +[ ↑↓←→ ] ^+[ PNFBAE ]
    AddEvent('*-Editor-Main-*', 'Shift', 'UP', '(Panel).Editor.SelPos:prevline');
    AddEvent('*-Editor-Main-*', 'Shift', 'DOWN', '(Panel).Editor.SelPos:nextline');
    AddEvent('*-Editor-Main-*', 'Shift', 'LEFT', '(Panel).Editor.SelPos:prevchar');
    AddEvent('*-Editor-Main-*', 'Shift', 'RIGHT', '(Panel).Editor.SelPos:nextchar');
    AddEvent('*-Editor-Main-*', 'Control+Shift', 'P', '(Panel).Editor.SelPos:prevline');
    AddEvent('*-Editor-Main-*', 'Control+Shift', 'N', '(Panel).Editor.SelPos:nextline');
    AddEvent('*-Editor-Main-*', 'Control+Shift', 'B', '(Panel).Editor.SelPos:prevchar');
    AddEvent('*-Editor-Main-*', 'Control+Shift', 'F', '(Panel).Editor.SelPos:nextchar');
    AddEvent('*-Editor-Main-*', 'Control+Shift', 'A', '(Panel).Editor.SelPos:linestart+');
    AddEvent('*-Editor-Main-*', 'Control+Shift', 'E', '(Panel).Editor.SelPos:lineend+');

    AddEvent('*-*-Keyword-*', 'Shift', 'UP', '(Panel).Keyword.SelPos:prevline');
    AddEvent('*-*-Keyword-*', 'Shift', 'DOWN', '(Panel).Keyword.SelPos:nextline');
    AddEvent('*-*-Keyword-*', 'Shift', 'LEFT', '(Panel).Keyword.SelPos:prevchar');
    AddEvent('*-*-Keyword-*', 'Shift', 'RIGHT', '(Panel).Keyword.SelPos:nextchar');
    AddEvent('*-*-Keyword-*', 'Control+Shift', 'P', '(Panel).Keyword.SelPos:prevline');
    AddEvent('*-*-Keyword-*', 'Control+Shift', 'N', '(Panel).Keyword.SelPos:nextline');
    AddEvent('*-*-Keyword-*', 'Control+Shift', 'B', '(Panel).Keyword.SelPos:prevchar');
    AddEvent('*-*-Keyword-*', 'Control+Shift', 'F', '(Panel).Keyword.SelPos:nextchar');
    AddEvent('*-*-Keyword-*', 'Control+Shift', 'A', '(Panel).Keyword.SelPos:linestart+');
    AddEvent('*-*-Keyword-*', 'Control+Shift', 'E', '(Panel).Keyword.SelPos:lineend+');
    // #endregion

    // #region Editor multicursor       Default:    !^[ ↑↓ ] ^[ D ] ![ LEFT1 ] 
    AddEvent('*-Editor-Main-*', 'Control+Alt', 'UP', 'Request.Invoke.Default');
    AddEvent('*-Editor-Main-*', 'Control+Alt', 'DOWN', 'Request.Invoke.Default');
    AddEvent('*-Editor-Main-*', 'Alt', 'LEFT1', 'Request.Invoke.Default');
    AddEvent('*-Editor-Main-*', 'Control', 'D', 'Request.Invoke.Default');
    // #endregion
    // #region Editor editing           Actions:    ^[ S ]
    AddEvent('*-Editor-Main-*', 'Control', 'S', 'Editor.Editing.Save');
    // #endregion 
    // #region Editor edit              Actions:    ^[ I :/ TAB ] ^+[ I *? TAB ] !^+[ I ]
    AddEvent('*-Editor-Main-*', 'Control+Shift+Alt', 'I', 'Editor.Edit.FoldingInit');
    AddEvent('*-Editor-Main-*', 'Control+Shift', 'I', 'Editor.Edit.FoldingUp');
    AddEvent('*-Editor-Main-*', 'Control', 'I', 'Editor.Edit.FoldingDown');

    AddEvent('*-Editor-Main-*', 'Control', ':', 'Editor.Edit.NextBullet');
    AddEvent('*-Editor-Main-*', 'Control+Shift', '*', 'Editor.Edit.PrevBullet');
    AddEvent('*-Editor-Main-*', 'Control', '/', 'Editor.Edit.NextComment');
    AddEvent('*-Editor-Main-*', 'Control+Shift', '?', 'Editor.Edit.PrevComment');
    AddEvent('*-Editor-Main-*', 'Control', 'TAB', 'Application.Command.Delegate');
    AddEvent('*-Editor-Main-*', 'Control+Shift', 'TAB', 'Application.Command.Delegate');
    // #endregion
    // #region Editor folding           Actions:    ![ ↑↓←→ ]  !+[ ↑↓←→ PNFB ]  ^+[ {} ]
    AddEvent('*-Editor-Main-*', 'Alt', 'RIGHT', 'Editor.Folding.Open');
    AddEvent('*-Editor-Main-*', 'Alt', 'LEFT', 'Editor.Folding.Close');
    AddEvent('*-Editor-Main-*', 'Alt+Shift', 'RIGHT', 'Editor.Folding.OpenAllSibling');
    AddEvent('*-Editor-Main-*', 'Alt+Shift', 'LEFT', 'Editor.Folding.CloseAllSibling');
    AddEvent('*-Editor-Main-*', 'Alt', 'F', 'Editor.Folding.Open');
    AddEvent('*-Editor-Main-*', 'Alt', 'B', 'Editor.Folding.Close');
    AddEvent('*-Editor-Main-*', 'Control+Shift', '}', 'Editor.Folding.Open');
    AddEvent('*-Editor-Main-*', 'Control+Shift', '{', 'Editor.Folding.Close');

    AddEvent('*-Editor-Main-*', 'Alt', 'UP', '(Panel).Editor.CurPos:prevvisiblefolding');
    AddEvent('*-Editor-Main-*', 'Alt', 'DOWN', '(Panel).Editor.CurPos:nextvisiblefolding');
    AddEvent('*-Editor-Main-*', 'Alt+Shift', 'UP', '(Panel).Editor.CurPos:prevsibfolding');
    AddEvent('*-Editor-Main-*', 'Alt+Shift', 'DOWN', '(Panel).Editor.CurPos:nextsibfolding');
    AddEvent('*-Editor-Main-*', 'Alt+Shift', 'F', '(Panel).Editor.CurPos:firstsibfolding');
    AddEvent('*-Editor-Main-*', 'Alt+Shift', 'B', '(Panel).Editor.CurPos:lastsibfolding');

    // #endregion
    // #region Editor folding           Actions:    ExFold > ^[ K ] [ ←→ OC12345 PN ] +[ ←→　PN　] 
    AddEvent('*-Editor-Main-*', 'Control', 'K', 'Application.Current.ExMode:ExFold');
    AddEvent('*-*-*-ExFold', '', 'RIGHT', 'Editor.Folding.Open');
    AddEvent('*-*-*-ExFold', '', 'LEFT', 'Editor.Folding.Close');
    AddEvent('*-*-*-ExFold', '', 'O', 'Editor.Folding.OpenAll');
    AddEvent('*-*-*-ExFold', '', 'C', 'Editor.Folding.CloseAll');
    AddEvent('*-*-*-ExFold', '', '1', 'Editor.Folding.CloseAll');
    AddEvent('*-*-*-ExFold', '', '2', 'Editor.Folding.OpenLevel2');
    AddEvent('*-*-*-ExFold', '', '3', 'Editor.Folding.OpenLevel3');
    AddEvent('*-*-*-ExFold', '', '4', 'Editor.Folding.OpenLevel4');
    AddEvent('*-*-*-ExFold', '', '5', 'Editor.Folding.OpenLevel5');
    AddEvent('*-*-*-ExFold', '', 'P', '(Panel).Editor.CurPos:prevfolding');
    AddEvent('*-*-*-ExFold', '', 'N', '(Panel).Editor.CurPos:nextfolding');
    AddEvent('*-*-*-ExFold', 'Shift', 'RIGHT', 'Editor.Folding.OpenAllSibling');
    AddEvent('*-*-*-ExFold', 'Shift', 'LEFT', 'Editor.Folding.CloseAllSibling');
    // #endregion
    // #region Editor menu              Delegate:   [ F1 ]  ^[ SPACE/G ]
    AddEvent('*-Editor-Main-*', '', 'F1', 'Application.Command.Delegate');
    AddEvent('*-Editor-Main-*', 'Control', 'SPACE', 'Application.Command.Delegate');
    AddEvent('*-Editor-Main-*', 'Control', 'G', 'Application.Command.Delegate');
    // #endregion
    // #region Editor auto complete     Action:     ^[ SPACE ]
    AddEvent('*-Editor-Main-*', 'Control', 'SPACE', 'Editor.AutoComplete.Suggest');
    // #endregion

    // #region Table move               Status: [ ↑↓ ] +[ ↑↓ ] ^+[ ↑↓ ]
    AddEvent('*-Table-*-*', '', 'UP', '(Panel).Table.CurPos:prev');
    AddEvent('*-Table-*-*', '', 'DOWN', '(Panel).Table.CurPos:next');
    AddEvent('*-Table-*-*', 'Shift', 'UP', '(Panel).Table.CurPos:-10');
    AddEvent('*-Table-*-*', 'Shift', 'DOWN', '(Panel).Table.CurPos:+10');
    AddEvent('*-Table-*-*', 'Shift+Control', 'UP', '(Panel).Table.CurPos:first');
    AddEvent('*-Table-*-*', 'Shift+Control', 'DOWN', '(Panel).Table.CurPos:last');
    // #endregion
    // #region Table sort               Actions: [F1,F2,F3,F4,F5 ] +[F1,F2,F3,F4,F5 ]
    AddEvent('*-Table-*-*', '', 'F1', 'Table.SortCol1.Rev');
    AddEvent('*-Table-*-*', '', 'F2', 'Table.SortCol2.Rev');
    AddEvent('*-Table-*-*', '', 'F3', 'Table.SortCol3.Rev');
    AddEvent('*-Table-*-*', '', 'F4', 'Table.SortCol4.Rev');
    AddEvent('*-Table-*-*', '', 'F5', 'Table.SortCol5.Rev');
    AddEvent('*-Table-*-*', 'Shift', 'F1', 'Table.SortProp1.Rev');
    AddEvent('*-Table-*-*', 'Shift', 'F2', 'Table.SortProp2.Rev');
    AddEvent('*-Table-*-*', 'Shift', 'F3', 'Table.SortProp3.Rev');
    AddEvent('*-Table-*-*', 'Shift', 'F4', 'Table.SortProp4.Rev');
    AddEvent('*-Table-*-*', 'Shift', 'F5', 'Table.SortProp5.Rev');

    // #endregion
    // #region Table resource           Status: ![ R ]
    AddEvent('*-Table-*-*', 'Alt', 'R', '(Panel).Table.Resource:Thinktank');
    // #endregion

    // #region WebView keyword query     [ ENTER ]
    AddEvent('*-WebView-Keyword-*', '', 'ENTER', 'WebView.Keyword.Query');
    // #endregion
    // #region Global Function
    AddEvent('*-*-*-*', 'Control', 'G', 'Editor.Memo.Create');      // Memo Create
    AddEvent('*-WebView-*-*', 'Alt', 'S', 'WebView.Action.Search');                 // WebView内検索 (Alt+S:Shelfより優先)
    // #endregion
    // #region WebView cursor           ![ PN ]  !+[ PN ]  [ ↑↓ ]  ^+[ ↑↓ ]
    AddEvent('*-WebView-*-*', '', 'UP', '(Panel).WebView.CurPos:prev');
    AddEvent('*-WebView-*-*', '', 'DOWN', '(Panel).WebView.CurPos:next');
    AddEvent('*-WebView-*-*', 'Shift+Control', 'UP', '(Panel).WebView.CurPos:first');
    AddEvent('*-WebView-*-*', 'Shift+Control', 'DOWN', '(Panel).WebView.CurPos:last');
    // #endregion

}

// === 将来実装予定（メモ） ===
// ExPanel: C → Panel.Keyword.Clear (Status形式に変更予定)
// ExDate: Up/Down/Return → Memo.Move.PrevDate/NextDate, Memo.Select.CurrentKeyword
// ExMenu: P/N/F/B/Space/Q → ExMenu操作
