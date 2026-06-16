# IDの命名規則および設計ルール
<!--
本アプリの Action と Status の ID ルール：
1. Action/Statusはともに、*.*.* 形式のIDを基本とします。
2. Statusは読み取り専用とします。
3. Status値の変更はActionで行い、そのActionのIDは、{Status ID}.*形式のIDとします。
-->

# AIへの指示
・ 本ファイルでは、実装または修正をしてほしいStatusまたはActionについて、以下のフォーマットで記載いたします。記載内容に基づいて対応してください。対象とする記載は空行までとし、空行後の記載は無視してください。完了後はコミットコメントに概要を記入し、commit&pushしてください。その他以下は、見出し行の指示に従って実装、調査、修正等を行ってください。また、対応中のタイトルが分かるように表示してください。
(行頭) ## 実装：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて実装し、日付を変更してください。
(行頭) ## 修正：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて修正し、日付を変更してください。
(行頭) ## 調査：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容について調査・回答を追記し、日付を変更してください。
(行頭) ## 完了：　日付　ID　　⇒　指定IDのStatus/Actionについては変更の必要はありません。

# Action
## 完了：　FocusedPanel.ToggleAreaVisibility
## 完了：　FocusedPanel.SetViewModePrev
## 完了：　FocusedPanel.SetViewModeNext
## 完了：　TextEditor.Folding.ForwardVisible　　　
## 完了：　TextEditor.Folding.BackwardVisible　　　
## 完了：　TextEditor.Folding.OpenEachLevel　　　
## 完了：　TextEditor.Folding.CloseEachLevel　　　


# Status
## 完了：　260614　ToolBar.StatusMode.Text
　ToolBar.StatusのTextBoxには「StatusID1:[値1]」、「StatusID2:[値2]」...「StatusIDn:[値n]」というフォーマットで表示します。

　ToolBarがStatusモードのPanelには、EditBoxとTextBoxを配置し、PanelにフォーカスがあるときはEditBoxが、FocusがはずれるとTextBoxが表示されます。
　EditBoxに入力された値が、このToolBar.StatusMode.Textに保存されます。
　TextBoxのときには、ToolBar.StatusMode.TextをCSV形式のStatusIDとして読み取り、「StatusID1:{値1}」、「StatusID2:{値2}」...「StatusIDn:{値n}」というフォーマットで表示します。
## 完了：　260615　Application.FocusedArea.Name
　StatusBarKeyActionPanelのTextBox中にあるFOCUSにその値を表示してください。　
　フォーカスされるものがある場合のみFOCUSされる

　Q：設定値を記載してください。
　A：キーボードフォーカスがあるDOM要素と各パネルの表示モード状態に基づき、動的に以下の値が判定されて設定されます。
　　- Thinktank.{ModeName}
　　- Overview.{ModeName} 
　　- WorkoutSetting.{ModeName}
　　- ToolBar.{ModeName} 
　　- Workout.{MediaType}
　　- ReThink.{ModeName}
　　※フォーカスがどこにもない場合は None、ステータスバーにある場合は Application.StatusBarArea となります。
## 完了：　260615　Application.FocusedPanel.Name
　Q：設定値を記載してください。
　A：設定されるすべての値（フォーカス対象となるパネル・エリア名）は以下の5つです。
　　- Thinktank （左パネル：フィルター / チャット / 設定）
　　- Overview （上部パネル：データグリッド / グラフ / チャット / 設定）
　　- WorkoutSetting （ワークアウト設定トレイ / 垂直タブバー）
　　- Workout （ワークアウト編集エリア）
　　- ReThink （右パネル：AIチャット / 設定）
　　※レイアウトモードが 'simple' の場合は、Thinktank, WorkoutSetting, Workout の3つのみが選択肢となります。
## 完了：　260613　ToolBar.Mode.Name
　Q：設定値を記載してください。
　A：設定可能な値は以下の7つです。
　　- Status （ステータス）
　　- Highlighter （ハイライター）
　　- KeyAction （キーアクション）
　　- Command （コマンド）
　　- Translate （翻訳）
　　- Reminder （リマインダー）
　　- Copyright （著作権・コピーライト情報）
## 完了：　260613　ThinktankPanel.Mode.IsOpen
## 完了：　260613　ThinktankPanel.Mode.Name
　設定値の1文字目は大文字にしてください

　Q：設定値を記載してください。
　A：設定可能な値は以下の3つです。
　　- Filter （フィルター / 検索）
　　- Chat （AI相談チャット）
　　- Settings （設定）
## 完了：　260613　OverviewPanel.Mode.IsOpen
## 完了：　260613　OverviewPanel.Mode.Name
　設定値の1文字目は大文字にしてください

　Q：設定値を記載してください。
　A：設定可能な値は以下の4つです。
　　- Datagrid （データグリッド）
　　- Graph （関係性グラフ）
　　- Chat （AIチャット）
　　- Settings （設定）
## 完了：　260613　WorkoutSettingPanel.Mode.IsOpen
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
## 完了：　260613　ReThinkPanel.Mode.IsOpen
## 完了：　260613　ReThinkPanel.Mode.Name
　設定値の1文字目は大文字にしてください

　Q：設定値を記載してください。
　A：設定可能な値は以下の2つです。
　　- Chat （AI対話チャット）
　　- Settings （設定）

## 完了：　260613　WorkoutPanel.Pane.Count
## 完了：　260613　WorkoutPanel.FocusedPane.ID
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

## 完了：　260613　TextEditor.LineNumbers.IsVisible
## 完了：　260613　TextEditor.WordWrap.IsVisible
## 完了：　260613　TextEditor.Minimap.IsVisible
## 完了：　260613　TextEditor.FullWidthSpace.IsVisible
## 完了：　260613　TextEditor.UnicodeHighlight.IsVisible
## 完了：　260613　TextEditor.BracketPairColorization.IsVisible
## 完了：　260613　TextEditor.Color.Background
## 完了：　260613　TextEditor.Color.Text
## 完了：　260613　TextEditor.Color.Selection
## 完了：　260613　TextEditor.Color.Occurrence
## 完了：　260613　TextEditor.Style.Section

# その他
## 完了:　260614　ToolBar.KeyActionのTextBox中に表示されている値を説明してください
 　A：ステータスバーの `KeyAction` モード（`StatusBarKeyActionPanel`）では、以下の項目が横並びで表示され、ユーザーの入力やフォーカス状態を監視します。
 　　- **focus** (フォーカスエリア名): 現在キーボードフォーカスがあるDOM要素に対応するエリア名。例: `Thinktank.Filter`, `Workout.Texteditor`, `ReThink.Chat` など。
 　　- **mod** (修飾キー): 現在押されている修飾キー（`Ctrl`, `Alt`, `Shift`, `Meta`）。
 　　- **key** (キー名): 現在押下された直近のキー名（例: `A`, `Space`, `Enter` などの大文字表示）。
 　　- **mouse** (マウス操作): 直近のマウスイベントタイプとクリック座標（例: `click(320, 840)` など）。
 　　- **touch** (タッチ操作): 直近のタッチイベントタイプとタッチポイント数（例: `touchstart(1)` など）。
 　　- **exmode** (EXモード): 現在有効になっている一時的な拡張ショートカットモード（例: `Command`, `Highlight` など）。
 　　- **exmod** (EX修飾キー): 拡張モードのトリガーになっている修飾キー。
 　　- **action** (直前アクション): 直前に実行されたショートカットやコマンド等のアクション名（例: `L20へ移動`, `L5折畳` など）。


