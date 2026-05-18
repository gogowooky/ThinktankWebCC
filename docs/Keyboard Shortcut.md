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

Thinktank*,ExOpt,Ctrl+O,ThinktankPanel.IsAreaOpen:toggle,Thinktankパネル開閉
Thinktank*,ExOpt,P,ThinktankPanel.ViewMode:prev,Thinktankパネルモード前
Thinktank*,ExOpt,N,ThinktankPanel.ViewMode:next,Thinktankパネルモード次
Overview*,ExOpt,Ctrl+O,OverviewPanel.IsAreaOpen:toggle,Overviewパネル開閉
Overview*,ExOpt,P,OverviewPanel.ViewMode:prev,Overviewパネルモード前
Overview*,ExOpt,N,OverviewPanel.ViewMode:next,Overviewパネルモード次
ReThink*,ExOpt,Ctrl+O,ReThinkPanel.IsAreaOpen:toggle,ReThinkパネル開閉
ReThink*,ExOpt,P,ReThinkPanel.ViewMode:prev,ReThinkパネルモード前
ReThink*,ExOpt,N,ReThinkPanel.ViewMode:next,ReThinkパネルモード次
Workout*,ExOpt,Ctrl+O,WorkoutPanel.IsAreaOpen:toggle,WorkoutSettingパネル開閉
Workout*,ExOpt,P,WorkoutPanel.ViewMode:prev,WorkoutSettingパネルモード前
Workout*,ExOpt,N,WorkoutPanel.ViewMode:next,WorkoutSettingパネルモード次

*,ExOpt,T,Application.FocusedColumn:Thinktank,Thinktankカラム
*,ExOpt,O,Application.FocusedColumn:Overview,Overviewカラム
*,ExOpt,W,Application.FocusedColumn:WorkoutSetting,WorkoutSettingカラム
*,ExOpt,E,Application.FocusedColumn:Workout,Workoutカラム
*,ExOpt,R,Application.FocusedColumn:ReThink,ReThinkカラム

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
