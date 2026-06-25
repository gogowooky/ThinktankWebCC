Keyboard Shortcuts

# Keyboard Shortcuts

> focus     ,exmode ,key                ,action                                         ,description

# Editor カーソル
*TextEditor ,       ,Alt+ArrowRight         ,TextEditor.CurrentFolding.Heading:OpenStepwise     ,折畳行をStepOpen
*TextEditor ,       ,Alt+ArrowLeft          ,TextEditor.CurrentFolding.Heading:CloseStepwise    ,折畳行をStepClose
*TextEditor ,       ,Alt+ArrowUp            ,TextEditor.CurrentFolding.Heading:VisibleForward   ,折畳行を前移動
*TextEditor ,       ,Alt+ArrowDown          ,TextEditor.CurrentFolding.Heading:VisibleBackward  ,折畳行を後移動
*TextEditor ,       ,Alt+Shift+ArrowUp      ,TextEditor.CurrentFolding.Heading:SiblingBackward  ,兄弟折畳行を前後移動
*TextEditor ,       ,Alt+Shift+ArrowDown    ,TextEditor.CurrentFolding.Heading:SiblingForward   ,兄弟折畳行を後移動

# アプリケーション モード
*           ,       ,Alt+A              ,Application.Status.ExMode:ExApp                ,アプリケーションモード
*           ,ExApp  ,A                  ,Application.FocusedPanel.Name:Prev             ,フォーカスカラム左
*           ,ExApp  ,S                  ,Application.FocusedPanel.Name:Next             ,フォーカスカラム右
*           ,ExApp  ,Z                  ,ToolBar.Mode.Name:Prev                         ,Workoutツールバー左
*           ,ExApp  ,X                  ,ToolBar.Mode.Name:Next                         ,Workoutツールバー右

*           ,ExApp  ,Q|O                ,FocusedPanel.Area.IsOpen:Toggle                ,パネル開閉
*           ,ExApp  ,W|P                ,FocusedPanel.Mode.Name:Prev                    ,パネルモード上
*           ,ExApp  ,D|N                ,FocusedPanel.Mode.Name:Next                    ,パネルモード下

*           ,ExApp  ,ArrowDown          ,WorkoutPanel.FocusedPane.PaneNumber:Next       ,ペインを次に移動
*           ,ExApp  ,ArrowUp            ,WorkoutPanel.FocusedPane.PaneNumber:Prev       ,ペインを前に移動
*           ,ExApp  ,ArrowRight         ,WorkoutPanel.FocusedPane.Mode:Next             ,ペインモードを次に変更
*           ,ExApp  ,ArrowLeft          ,WorkoutPanel.FocusedPane.Mode:Prev             ,ペインモードを前に変更

# Editor オプション　モード
*           ,       ,Alt+O              ,Application.Status.ExMode:ExOpt                ,エディタオプションモード
*           ,ExOpt  ,L                  ,TextEditor.LineNumbers.IsVisible:Toggle        ,行番号On/Off
*           ,ExOpt  ,W                  ,TextEditor.WordWrap.IsVisible:Toggle           ,折返しOn/Off
*           ,ExOpt  ,M                  ,TextEditor.Minimap.IsVisible:Toggle            ,ミニマップOn/Off
*           ,ExOpt  ,F                  ,TextEditor.FullWidthSpace.IsVisible:Toggle     ,全角スペース表示On/Off
*           ,ExOpt  ,U                  ,TextEditor.UnicodeHighlight.IsVisible:Toggle   ,エラー文字強調On/Off
*           ,ExOpt  ,B                  ,TextEditor.BracketPairColorization.IsVisible:Toggle ,括弧強調On/Off

# Editor 編集
*           ,       ,Ctrl+Z             ,TextEditor.EditText.Undo    ,編集を元に戻す
*           ,       ,Ctrl+Y             ,TextEditor.EditText.Redo    ,編集をやり直す

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



