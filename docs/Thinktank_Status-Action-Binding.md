# AIへの指示
・ 本ファイルでは、実装または修正をしてほしいStatusまたはActionについて、以下のフォーマットで記載いたします。記載内容に基づいて対応してください。対象とする記載は空行までとし、空行後の記載は無視してください。完了後はコミットコメントに概要を記入し、commit&pushしてください。
(行頭) ## 実装：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて実装し、日付を変更してください。
(行頭) ## 修正：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて修正し、日付を変更してください。
(行頭) ## 調査：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容について調査・回答を追記し、日付を変更してください。
(行頭) ## 完了：　日付　ID　　⇒　指定IDのStatus/Actionについては変更の必要はありません。

# Status
## 完了：　260614　ToolBar.StatusMode.Text
　ToolBar.StatusのTextBoxには「StatusID1:[値1]」、「StatusID2:[値2]」...「StatusIDn:[値n]」というフォーマットで表示します。

　ToolBarがStatusモードのPanelには、EditBoxとTextBoxを配置し、PanelにフォーカスがあるときはEditBoxが、FocusがはずれるとTextBoxが表示されます。
　EditBoxに入力された値が、このToolBar.StatusMode.Textに保存されます。
　TextBoxのときには、ToolBar.StatusMode.TextをCSV形式のStatusIDとして読み取り、「StatusID1:{値1}」、「StatusID2:{値2}」...「StatusIDn:{値n}」というフォーマットで表示します。

## 完了：　260614　Application.KeyboardFocused.AreaName
　この値が更新された際には、ToolBar.KeyActionのTextBox中の FOCUS部 にこの値を表示します

　各Panelが表示中ではない場合も、ModeNameにはFocusのあるボタンを表示してください。
　WorkoutにPaneが表示されていない場合は、Workout.Noneと表示してください。


　Q：設定値を記載してください。
　A：キーボードフォーカスがあるDOM要素と各パネルの表示モード状態に基づき、動的に以下の値が判定されて設定されます。
　　- Thinktank.{ModeName}
　　- Overview.{ModeName} 
　　- WorkoutSetting.{ModeName}
　　- ToolBar.{ModeName} 
　　- Workout.{MediaType}
　　- ReThink.{ModeName}
　　※フォーカスがどこにもない場合は None、ステータスバーにある場合は Application.StatusBarArea となります。
## 完了：　Application.Focused.ColumnName
　Q：設定値を記載してください。
　A：設定されるすべての値（フォーカス対象となるパネル・エリア名）は以下の5つです。
　　- Thinktank （左パネル：フィルター / チャット / 設定）
　　- Overview （上部パネル：データグリッド / グラフ / チャット / 設定）
　　- WorkoutSetting （ワークアウト設定トレイ / 垂直タブバー）
　　- Workout （ワークアウト編集エリア）
　　- ReThink （右パネル：AIチャット / 設定）
　　※レイアウトモードが 'simple' の場合は、Thinktank, WorkoutSetting, Workout の3つのみが選択肢となります。
## 完了：　ToolBar.Mode.Name
　Q：設定値を記載してください。
　A：設定可能な値は以下の7つです。
　　- Status （ステータス）
　　- Highlighter （ハイライター）
　　- KeyAction （キーアクション）
　　- Command （コマンド）
　　- Translate （翻訳）
　　- Reminder （リマインダー）
　　- Copyright （著作権・コピーライト情報）
## 完了：　ThinktankPanel.Mode.IsOpen
## 完了：　260613　ThinktankPanel.Mode.Name
　設定値の1文字目は大文字にしてください

　Q：設定値を記載してください。
　A：設定可能な値は以下の3つです。
　　- Filter （フィルター / 検索）
　　- Chat （AI相談チャット）
　　- Settings （設定）
## 完了：　OverviewPanel.Mode.IsOpen
## 完了：　260613　OverviewPanel.Mode.Name
　設定値の1文字目は大文字にしてください

　Q：設定値を記載してください。
　A：設定可能な値は以下の4つです。
　　- Datagrid （データグリッド）
　　- Graph （関係性グラフ）
　　- Chat （AIチャット）
　　- Settings （設定）
## 完了：　WorkoutSettingPanel.Mode.IsOpen
## 完了：　260613　WorkoutSettingPanel.Mode.Name
　設定値の1文字目は大文字にしてください

　Q：設定値を記載してください。
　A：設定可能な値は以下の6つです。
　　- Workout （概要設定）
　　- Texteditor （テキストエディタ）
　　- Markdown （マークダウンプレビュー）
　　- Datagrid （データグリッド）
　　- Card （カードビュー）
　　- Graph （グラフビュー）
## 完了：　ReThinkPanel.Mode.IsOpen
## 完了：　260613　ReThinkPanel.Mode.Name
　設定値の1文字目は大文字にしてください

　Q：設定値を記載してください。
　A：設定可能な値は以下の2つです。
　　- Chat （AI対話チャット）
　　- Settings （設定）

## 完了：　WorkoutPanel.Pane.Count
## 完了：　WorkoutPanel.FocusedPane.ID
## 完了：　260613　WorkoutPanel.FocusedPane.MediaType
　設定値の1文字目は大文字にしてください

　Q：設定値を記載してください。
　A：設定可能な値は以下の7つです。
　　- Workout （概要設定）
　　- Texteditor （テキストエディタ）
　　- Markdown （マークダウン）
　　- Datagrid （データグリッド）
　　- Card （カード）
　　- Graph （グラフ）
　　- None （フォーカスされているペインがない場合）

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


