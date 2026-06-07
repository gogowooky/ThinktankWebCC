Keyboard Shortcuts

# Keyboard Shortcuts

## アクション書式: Panel.Property:value（value: true/false/toggle/文字列）

## 特殊コマンド: ui:undo  /  ui:redo

## コード入力（2段）: Ctrl+K L のようにスペース区切り

> focus, exmode, key, action, description
; 以下が設定データ

# Columns

*,,Alt+O,Application.Status.ExMode:ExOpt,オプションモード
*,ExOpt,Shift+O,Application.FocusedColumn:prev,フォーカスカラム前
*,ExOpt,O,Application.FocusedColumn:next,フォーカスカラム次

*,ExOpt,ENTER,FocusedPanel.ToggleAreaVisibility,パネル開閉
*,ExOpt,P,FocusedPanel.SetViewModePrev,パネルモード前
*,ExOpt,N,FocusedPanel.SetViewModeNext,パネルモード次

*,ExOpt,L,WorkoutPanel.ToolBarMode:next,Workoutツールバー次
*,ExOpt,Shift+L,WorkoutPanel.ToolBarMode:prev,Workoutツールバー前

# Editor

Workout*,ExOpt,H,TextEditor.LineNumbers.IsVisible:toggle ,行番号切り替え
Workout*,ExOpt,W,TextEditor.WordWrap.IsVisible:toggle,折り返し切り替え
Workout*,ExOpt,M,TextEditor.Minimap.IsVisible:toggle,ミニマップ切り替え

*,,Ctrl+Shift+Z,ui:undo,UI設定を元に戻す
*,,Ctrl+Shift+Y,ui:redo,UI設定をやり直す

;
;
;
;
;
;