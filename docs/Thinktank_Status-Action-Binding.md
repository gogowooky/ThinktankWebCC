# AIへの指示
・ 本ファイルでは、実装または修正をしてほしいStatusまたはActionについて、以下のフォーマットで記載いたします。　記載に基づいて対応してください。完了後はコミットコメントに概要を記入し、commit&pushしてください。
(行頭) ## 実装：　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて実装してください。
(行頭) ## 修正：　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて修正してください。
(行頭) ## 調査：　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容について調査し、回答を追記してください。
(行頭) ## 完了：　ID　　⇒　指定IDのStatus/Actionについては変更の必要はありません。


# Status
## 完了：　Application.KeyboardFocused.AreaName
　Q：設定される値を記載してください。
　A：キーボードフォーカスがあるDOM要素と各パネルの表示モード状態に基づき、動的に以下の値が判定されて設定されます。
　　- Thinktank.{ModeName} （左パネルフォーカス時。ModeName = filter / chat / settings）
　　- Overview.{ModeName} （上部パネルフォーカス時。ModeName = datagrid / graph / chat / settings）
　　- WorkoutSetting.{ModeName} （ワークアウト設定トレイまたはタブバーフォーカス時。ModeName = workout / texteditor / markdown / datagrid / card / graph）
　　- ToolBar.{ModeName} （ワークアウトツールバーフォーカス時。ModeName = Status / Highlighter / KeyAction / Command / Translate / Reminder / Copyright）
　　- Workout.{MediaType} （ワークアウト編集ペインフォーカス時。MediaType = workout / texteditor / markdown / datagrid / card / graph / chat）
　　- ReThink.{ModeName} （右パネルフォーカス時。ModeName = chat / settings）
　　※フォーカスがどこにもない場合は None、ステータスバーにある場合は Application.StatusBarArea となります。
## 完了：　Application.Focused.AreaName
　Q：設定されるすべての値を記載してください。
　A：設定されるすべての値（フォーカス対象となるパネル・エリア名）は以下の5つです。
　　- Thinktank （左パネル：フィルター / チャット / 設定）
　　- Overview （上部パネル：データグリッド / グラフ / チャット / 設定）
　　- WorkoutSetting （ワークアウト設定トレイ / 垂直タブバー）
　　- Workout （ワークアウト編集エリア）
　　- ReThink （右パネル：AIチャット / 設定）
　　※レイアウトモードが 'simple' の場合は、Thinktank, WorkoutSetting, Workout の3つのみが選択肢となります。
## 完了：　ToolBar.Mode.Name
## 完了：　ThinktankPanel.Mode.IsOpen
## 完了：　ThinktankPanel.Mode.Name
## 完了：　OverviewPanel.Mode.IsOpen
## 完了：　OverviewPanel.Mode.Name
## 完了：　WorkoutSettingPanel.Mode.IsOpen
## 完了：　WorkoutSettingPanel.Mode.Name
## 完了：　ReThinkPanel.Mode.IsOpen
## 完了：　ReThinkPanel.Mode.Name

## 完了：　WorkoutPanel.Pane.Count
## 完了：　WorkoutPanel.FocusedPane.ID
## 完了：　WorkoutPanel.FocusedPane.MediaType

## 完了：　TextEditor.LineNumbers.IsVisible
## 完了：　TextEditor.WordWrap.IsVisible
## 完了：　TextEditor.Minimap.IsVisible
## 完了：　TextEditor.FullWidthSpace.IsVisible
## 完了：　TextEditor.UnicodeHighlight.IsVisible
## 完了：　TextEditor.BracketPairColorization.IsVisible
## 完了：　TextEditor.Color.Background
## 完了：　TextEditor.Color.Text
## 完了：　TextEditor.Color.Selection
## 完了：　TextEditor.Color.Occurrence
## 完了：　TextEditor.Style.Section

# Action
## 完了：　FocusedPanel.ToggleAreaVisibility
## 完了：　FocusedPanel.SetViewModePrev
## 完了：　FocusedPanel.SetViewModeNext
## 完了：　TextEditor.Folding.ForwardVisible　　　
## 完了：　TextEditor.Folding.BackwardVisible　　　
## 完了：　TextEditor.Folding.OpenEachLevel　　　
## 完了：　TextEditor.Folding.CloseEachLevel　　　


