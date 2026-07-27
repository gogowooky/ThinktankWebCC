Keyboard Shortcuts

# Keyboard Shortcuts
> focus     ,exmode ,key                      ,action                                           ,description

# アプリケーション モード
*           ,       ,Alt+A              ,Application.Status.ExMode:ExApp                ,アプリケーションモード
*           ,ExApp  ,A                  ,Application.FocusedPanel.Name:Prev             ,フォーカスカラム左
*           ,ExApp  ,S                  ,Application.FocusedPanel.Name:Next             ,フォーカスカラム右
*           ,ExApp  ,Z                  ,ToolBar.Mode.Name:Prev                         ,Workoutツールバー左
*           ,ExApp  ,X                  ,ToolBar.Mode.Name:Next                         ,Workoutツールバー右

*           ,ExApp  ,Q                  ,FocusedPanel.Area.IsOpen:Toggle                ,パネル開閉
*           ,ExApp  ,W                  ,FocusedPanel.Mode.Name:Prev                    ,パネルモード上
*           ,ExApp  ,D                  ,FocusedPanel.Mode.Name:Next                    ,パネルモード下

*           ,ExApp  ,ArrowDown          ,WorkoutPanel.FocusedPane.PaneNumber:Next       ,ペインを次に移動
*           ,ExApp  ,ArrowUp            ,WorkoutPanel.FocusedPane.PaneNumber:Prev       ,ペインを前に移動
*           ,ExApp  ,ArrowRight         ,WorkoutPanel.FocusedPane.Mode:Next             ,ペインモードを次に変更
*           ,ExApp  ,ArrowLeft          ,WorkoutPanel.FocusedPane.Mode:Prev             ,ペインモードを前に変更

# Panel>Think一覧 カーソル
Thinktank.Filter,   ,Alt+P                  ,Thinktank.Filter.CursorPos:PrevLine        ,Thinktank>Think一覧のカーソルを上に移動する
Thinktank.Filter,   ,Alt+N                  ,Thinktank.Filter.CursorPos:NextLine        ,Thinktank>Think一覧のカーソルを下に移動する
Thinktank.Filter,   ,Alt+ArrowUp            ,Thinktank.Filter.CursorPos:PrevLine        ,Thinktank>Think一覧のカーソルを上に移動する
Thinktank.Filter,   ,Alt+ArrowDown          ,Thinktank.Filter.CursorPos:NextLine        ,Thinktank>Think一覧のカーソルを下に移動する
Thinktank.Filter,   ,Alt+Enter              ,Thinktank.Filter.Cursor:Action             ,Thinktank>Think一覧のカーソル位置を開く
Thinktank.Filter,   ,Alt+K                  ,Thinktank.Filter.Cursor:ToggleCheck        ,Thinktank>Think一覧のカーソル位置をチェック
Overview.Filter,    ,Alt+P                  ,Overview.Filter.CursorPos:PrevLine         ,Overview>Think一覧のカーソルを上に移動する
Overview.Filter,    ,Alt+N                  ,Overview.Filter.CursorPos:NextLine         ,Overview>Think一覧のカーソルを下に移動する
Overview.Filter,    ,Alt+ArrowUp            ,Overview.Filter.CursorPos:PrevLine         ,Overview>Think一覧のカーソルを上に移動する
Overview.Filter,    ,Alt+ArrowDown          ,Overview.Filter.CursorPos:NextLine         ,Overview>Think一覧のカーソルを下に移動する
Overview.Filter,    ,Alt+Enter              ,Overview.Filter.Cursor:Action              ,Overview>Think一覧のカーソル位置を開く
Overview.Filter,    ,Alt+K                  ,Overview.Filter.Cursor:ToggleCheck         ,Overview>Think一覧のカーソル位置をチェック

Thinktank.Filter    ,ExApp  ,Alt+P          ,Thinktank.Filter.CursorPos:PrevLine        ,Thinktank>Think一覧のカーソルを上に移動する
Thinktank.Filter    ,ExApp  ,Alt+P          ,Thinktank.Filter.CursorPos:PrevLine        ,Thinktank>Think一覧のカーソルを上に移動する
Thinktank.Filter    ,ExApp  ,Alt+N          ,Thinktank.Filter.CursorPos:NextLine        ,Thinktank>Think一覧のカーソルを下に移動する
Thinktank.Filter    ,ExApp  ,Alt+ArrowUP    ,Thinktank.Filter.CursorPos:PrevLine        ,Thinktank>Think一覧のカーソルを上に移動する
Thinktank.Filter    ,ExApp  ,Alt+ArrowDown  ,Thinktank.Filter.CursorPos:NextLine        ,Thinktank>Think一覧のカーソルを下に移動する
Thinktank.Filter    ,ExApp  ,Alt+Enter      ,Thinktank.Filter.Cursor:Action             ,Thinktank>Think一覧のカーソル位置を開く
Thinktank.Filter    ,ExApp  ,Alt+K          ,Thinktank.Filter.Cursor:ToggleCheck        ,Thinktank>Think一覧のカーソル位置をチェック
Overview.Filter     ,ExApp  ,Alt+P          ,Overview.Filter.CursorPos:PrevLine         ,Overview>Think一覧のカーソルを上に移動する
Overview.Filter     ,ExApp  ,Alt+N          ,Overview.Filter.CursorPos:NextLine         ,Overview>Think一覧のカーソルを下に移動する
Overview.Filter     ,ExApp  ,Alt+ArrowUP    ,Overview.Filter.CursorPos:PrevLine         ,Overview>Think一覧のカーソルを上に移動する
Overview.Filter     ,ExApp  ,Alt+ArrowDown  ,Overview.Filter.CursorPos:NextLine         ,Overview>Think一覧のカーソルを下に移動する
Overview.Filter     ,ExApp  ,Alt+Enter      ,Overview.Filter.Cursor:Action              ,Overview>Think一覧のカーソル位置を開く
Overview.Filter     ,ExApp  ,Alt+K          ,Overview.Filter.Cursor:ToggleCheck         ,Overview>Think一覧のカーソル位置をチェック

# Editor Drop
*,   ,ThinkFileDrag       ,WorkoutPanel.DroppedFile.ID:Load   ,DropされたThinkファイルをPaneにLoadする
*,   ,Alt+ThinkFileDrag   ,WorkoutPanel.DroppedFile.ID:Insert ,DropされたThinkファイルをコンテンツ内に挿入する

# Editor Editor ローカルファイルシステム D&D
*,   ,LocalFileDrag       ,WorkoutPanel.Load.DroppedLink   ,ローカルファイルDropで既定動作（Links Think作成）を行う
*,   ,LocalDirDrag        ,WorkoutPanel.Load.DroppedLink   ,ローカルディレクトリDropで既定動作（Links Think作成）を行う
*,   ,Alt+LocalFileDrag   ,WorkoutPanel.Insert.DroppedLink ,ローカルファイルDropをコンテンツ内カーソル位置に挿入する
*,   ,Alt+LocalDirDrag    ,WorkoutPanel.Insert.DroppedLink ,ローカルディレクトリDropをコンテンツ内カーソル位置に挿入する


# Editor Editor　検索
*TextEditor ,       ,Shift+Ctrl+F           ,TextEditor.CurrentEditor.ShowFind          ,検索ダイアログを表示する
*TextEditor ,       ,Shift+Ctrl+H           ,TextEditor.CurrentEditor.ShowReplace       ,置換ダイアログを表示する

# Editor カーソル　ハイライト
*TextEditor ,       ,Alt+W                  ,TextEditor.CurrentEditor.CursorPos:PrevHighlighter     ,Highlighterの前のヒットに移動する
*TextEditor ,       ,Alt+D                  ,TextEditor.CurrentEditor.CursorPos:NextHighlighter     ,Highlighterの次のヒットに移動する
*TextEditor ,       ,Shift+Alt+W            ,TextEditor.CurrentEditor.CursorPos:FirstHighlighter    ,Highlighterの先頭ヒットに移動する
*TextEditor ,       ,Shift+Alt+D            ,TextEditor.CurrentEditor.CursorPos:LastHighlighter     ,Highlighterの末尾ヒットに移動する
*HighLighter,       ,Alt+X                  ,ToolBar.HighlighterMode.Text:Unfocus                   ,Highlighter入力欄から元の位置に戻る
*TextEditor ,       ,Alt+X                  ,ToolBar.HighlighterMode.Text:Focus                     ,Highlighter入力欄にフォーカスする
*TextEditor ,       ,Alt+S                  ,ToolBar.HighlighterMode.Text:AddSelected               ,選択テキストをHighlighterに追加する
*TextEditor ,       ,Alt+Q                  ,ToolBar.HighlighterMode.Text:Clear                     ,Highlighterをクリアする

# Editor カーソル
*TextEditor ,       ,Ctrl+P                 ,TextEditor.CurrentEditor.CursorPos:PrevLine            ,カーソルを一つ上の行に移動する（ArrowUp相当）
*TextEditor ,       ,Ctrl+N                 ,TextEditor.CurrentEditor.CursorPos:NextLine            ,カーソルを一つ下の行に移動する（ArrowDown相当）
*TextEditor ,       ,Ctrl+B                 ,TextEditor.CurrentEditor.CursorPos:PrevWord            ,カーソルを１ワード前に移動する
*TextEditor ,       ,Ctrl+F                 ,TextEditor.CurrentEditor.CursorPos:NextWord            ,カーソルを１ワード後に移動する
*TextEditor ,       ,Ctrl+ArrowLeft         ,TextEditor.CurrentEditor.CursorPos:PrevWord            ,カーソルを１ワード前に移動する
*TextEditor ,       ,Ctrl+ArrowRight        ,TextEditor.CurrentEditor.CursorPos:NextWord            ,カーソルを１ワード後に移動する

*TextEditor ,       ,Ctrl+A                 ,TextEditor.CurrentEditor.CursorPos:LineStart+      ,行頭に移動→全選択
*TextEditor ,       ,Ctrl+E                 ,TextEditor.CurrentEditor.CursorPos:LineEnd+        ,行末尾に移動→全選択

# Editor カーソル アクション文字
*TextEditor ,       ,Alt+Enter              ,TextEditor.CurrentEditor.DoOnCursorPos             ,URL・パス・タグの起動
*TextEditor ,       ,Alt+Shift+Enter        ,TextEditor.CurrentEditor.DoOnCursorPos:Menu        ,URL・パス・タグのメニュー表示
*TextEditor ,       ,Left2                  ,TextEditor.CurrentEditor.DoOnCursorPos             ,URL・パス・タグの起動
*TextEditor ,       ,Right1                 ,TextEditor.CurrentEditor.DoOnCursorPos:Menu        ,URL・パス・タグのメニュー表示

# Editor カーソル 折畳行
*TextEditor ,       ,Alt+ArrowRight         ,TextEditor.CurrentFolding.Heading:OpenStepwise     ,折畳行をStepOpen
*TextEditor ,       ,Alt+ArrowLeft          ,TextEditor.CurrentFolding.Heading:CloseStepwise    ,折畳行をStepClose
*TextEditor ,       ,Alt+ArrowUp            ,TextEditor.CurrentFolding.Heading:VisibleForward   ,折畳行を前移動
*TextEditor ,       ,Alt+ArrowDown          ,TextEditor.CurrentFolding.Heading:VisibleBackward  ,折畳行を後移動
*TextEditor ,       ,Alt+Shift+ArrowUp      ,TextEditor.CurrentFolding.Heading:SiblingFirst     ,最初の兄弟折畳行へ移動
*TextEditor ,       ,Alt+Shift+ArrowDown    ,TextEditor.CurrentFolding.Heading:SiblingLast      ,最後の兄弟折畳行へ移動
*TextEditor ,       ,Alt+Shift+B            ,TextEditor.CurrentFolding.Heading:OpenStepwise     ,折畳行をStepOpen
*TextEditor ,       ,Alt+B                  ,TextEditor.CurrentFolding.Heading:CloseStepwise    ,折畳行をStepClose
*TextEditor ,       ,Alt+P                  ,TextEditor.CurrentFolding.Heading:VisibleForward   ,折畳行を前移動
*TextEditor ,       ,Alt+N                  ,TextEditor.CurrentFolding.Heading:VisibleBackward  ,折畳行を後移動
*TextEditor ,       ,Alt+Shift+P            ,TextEditor.CurrentFolding.Heading:SiblingFirst     ,最初の兄弟折畳行へ移動
*TextEditor ,       ,Alt+Shift+N            ,TextEditor.CurrentFolding.Heading:SiblingLast      ,最後の兄弟折畳行へ移動

# Editor 編集
*TextEditor ,       ,Ctrl+Z             ,TextEditor.EditText.Undo                       ,編集を元に戻す
*TextEditor ,       ,Ctrl+Y             ,TextEditor.EditText.Redo                       ,編集をやり直す
*TextEditor ,       ,Delete             ,TextEditor.EditText.Delete                     ,カーソル右の文字を削除
*TextEditor ,       ,Backspace          ,TextEditor.EditText.Backspace                  ,カーソル左の文字を削除
*TextEditor ,       ,Ctrl+D             ,TextEditor.EditText.Delete                     ,カーソル右の文字を削除
*TextEditor ,       ,Ctrl+H             ,TextEditor.EditText.Backspace                  ,カーソル左の文字を削除

*TextEditor ,       ,Ctrl+I             ,TextEditor.FoldingHeading.IncLevel             ,折り畳みレベルを上げる
*TextEditor ,       ,Shift+Ctrl+I       ,TextEditor.FoldingHeading.DecLevel             ,折り畳みレベルを下げる

*TextEditor ,       ,Ctrl+/             ,TextEditor.Bullet.NextStyle                    ,行頭文字を次に変更
*TextEditor ,       ,Shift+Ctrl+?       ,TextEditor.Bullet.PrevStyle                    ,行頭文字を前に変更

*TextEditor ,       ,Ctrl+.             ,TextEditor.Comment.NextStyle                   ,コメント文字を次に変更
*TextEditor ,       ,Shift+Ctrl+>       ,TextEditor.Comment.PrevStyle                   ,コメント文字を前に変更

# Editor 日付 編集モード
*TextEditor ,       ,Alt+T              ,TextEditor.EditDate.InsertExDate               ,日付編集モード開始
*TextEditor ,ExDate ,Y                  ,TextEditor.EditDate.IncYear                    ,年を増やす
*TextEditor ,ExDate ,Shift+Y            ,TextEditor.EditDate.DecYear                    ,年を減らす
*TextEditor ,ExDate ,M                  ,TextEditor.EditDate.IncMonth                   ,月を増やす
*TextEditor ,ExDate ,Shift+M            ,TextEditor.EditDate.DecMonth                   ,月を減らす
*TextEditor ,ExDate ,D                  ,TextEditor.EditDate.IncDay                     ,日を増やす
*TextEditor ,ExDate ,Shift+D            ,TextEditor.EditDate.DecDay                     ,日を減らす
*TextEditor ,ExDate ,7                  ,TextEditor.EditDate.IncWeek                    ,週を増やす
*TextEditor ,ExDate ,Shift+'            ,TextEditor.EditDate.DecWeek                    ,週を減らす
*TextEditor ,ExDate ,T                  ,TextEditor.EditDate.ChangeFormat               ,日時フォーマット切替
*TextEditor ,ExDate ,Shift+T            ,TextEditor.EditDate.ChangeFormat               ,日時フォーマット切替・逆
*TextEditor ,ExDate ,W                  ,TextEditor.EditDate.ToggleWeekday              ,曜日表示On/Off
*TextEditor ,ExDate ,H                  ,TextEditor.EditDate.ToggleTime                 ,時間表示On/Off
*TextEditor ,ExDate ,N                  ,TextEditor.EditDate.SetNow                     ,現在日時に設定
*TextEditor ,ExDate ,Q                  ,TextEditor.EditDate.Reset                      ,元に戻す

# Editor オプション　モード
*           ,       ,Alt+O              ,Application.Status.ExMode:ExOpt                ,エディタオプションモード
*           ,ExOpt  ,L                  ,TextEditor.LineNumbers.IsVisible:Toggle        ,行番号On/Off
*           ,ExOpt  ,W                  ,TextEditor.WordWrap.IsVisible:Toggle           ,折返しOn/Off
*           ,ExOpt  ,M                  ,TextEditor.Minimap.IsVisible:Toggle            ,ミニマップOn/Off
*           ,ExOpt  ,F                  ,TextEditor.FullWidthSpace.IsVisible:Toggle     ,全角スペース表示On/Off
*           ,ExOpt  ,U                  ,TextEditor.UnicodeHighlight.IsVisible:Toggle   ,エラー文字強調On/Off
*           ,ExOpt  ,B                  ,TextEditor.BracketPairColorization.IsVisible:Toggle ,括弧強調On/Off


