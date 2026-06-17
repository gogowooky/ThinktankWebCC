Keyboard Shortcuts

# Keyboard Shortcuts

## アクション書式: Panel.Property:value（value: true/false/toggle/文字列） 

## 特殊コマンド: ui:undo  /  ui:redo

## コード入力（2段）: Ctrl+K L のようにスペース区切り

> focus ,exmode ,key    ,action     ,description
; 以下が設定データ
; [AI] ; で始まるテキストは薄い灰色にしてください。

# Columns


*     ,       ,Alt+A                         ,Application.Status.ExMode:ExApp        ,アプリケーションモード
*     ,ExApp  ,ArrowLeft|A,Application.FocusedArea.Name:prev         ,フォーカスカラム左
*     ,ExApp  ,ArrowRight|S,Application.FocusedArea.Name:next         ,フォーカスカラム右
*     ,ExApp  ,Shift+Z|X|Shift+ArrowRight     ,ToolBar.Mode.Name:Next          ,Workoutツールバー右
*     ,ExApp  ,Z|Shift+ArrowLeft              ,ToolBar.Mode.Name:Prev          ,Workoutツールバー左

*     ,ExApp  ,O|Q    ,FocusedPanel.ToggleAreaVisibility,パネル開閉
*     ,ExApp  ,W|P|ArrowUp,FocusedPanel.SetViewModePrev,パネルモード上
*     ,ExApp  ,D|N|ArrowDown,FocusedPanel.SetViewModeNext,パネルモード下


# Editor
*TextEditor,       ,Alt+ArrowUp,TextEditor.Folding.ForwardVisible,現表示範囲の折畳タイトル行を前方向に探索してカーソル移動
*TextEditor,       ,Alt+ArrowDown,TextEditor.Folding.BackwardVisible,現表示範囲の折畳タイトル行を後方向に探索してカーソル移動
*TextEditor,       ,Alt+ArrowRight,TextEditor.Folding.OpenEachLevel,カーソル位置が折畳タイトル行の場合、自Folding→子Folding→孫Foldingと順にOpen状態にしてゆく
*TextEditor,       ,Alt+ArrowLeft,TextEditor.Folding.CloseEachLevel,カーソル位置が折畳タイトル行の場合、表示されている子孫Folding→→→子Folding→自Foldingと順にClose状態にしてゆく


# Editor Option モード
*     ,       ,Alt+O  ,Application.Status.ExMode:ExOpt,モード切替

Workout*,ExOpt  ,L      ,TextEditor.LineNumbers.IsVisible:toggle ,行番号切り替え
Workout*,ExOpt  ,W      ,TextEditor.WordWrap.IsVisible:toggle,折り返し切り替え
Workout*,ExOpt  ,M      ,TextEditor.Minimap.IsVisible:toggle,ミニマップ切り替え

*     ,       ,Ctrl+Shift+Z,ui:undo    ,UI設定を元に戻す
*     ,       ,Ctrl+Shift+Y,ui:redo    ,UI設定をやり直す
;
;
;
;
;
;