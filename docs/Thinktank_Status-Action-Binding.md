# IDの命名規則および設計ルール
<!--
本アプリの Action と Status の ID ルール：
1. Action/Statusはともに、*.*.* 形式のIDを基本とします。
2. Statusは読み取り専用とします。
3. Status値の変更はActionで行い、そのActionのIDは、{Status ID}:*形式のIDとします。
-->

# AIへの指示
・ 本ファイルでは、実装または修正をしてほしいStatusまたはActionについて、以下のフォーマットで記載いたします。記載内容に基づいて対応してください。　対象とする記載は空行までとし、空行後の記載は無視してください。# Application から始まる行以降については対応の必要はありません。完了後はコミットコメントに概要を記入し、commit&pushしてください。その他以下は、見出し行の指示に従って実装、調査、修正等を行ってください。また、対応中のタイトルが分かるように表示してください。
(行頭) ## 実装：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて実装し、日付を変更してください。
(行頭) ## 修正：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて修正し、日付を変更してください。
(行頭) ## 調査：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容について調査・回答を追記し、日付を変更してください。
(行頭) ## 完了：　日付　ID　　⇒　指定IDのStatus/Actionについては変更の必要はありません。

# Action

## 完了：　260630　TextEditor.CurrentEditor.DoOnCursorPos:Url:Open
　CursorPos位置が、urlを表す部分であれば、ブラウザで対象のURLを開いてください。

## 完了：　260630　TextEditor.CurrentEditor.DoOnCursorPos:File:Open
　CursorPos位置が、filepathを表す部分であれば、サーバーAPI(/api/system/open)を経由し、OSの規定のアプリでローカルファイル/フォルダを起動してください。

## 完了：　260630　TextEditor.CurrentEditor.DoOnCursorPos:Tag:Open
　CursorPos位置が、tagを表す部分であれば、大かっこ内のテキストを取り出し、コロン「:」がある場合はクエリとして各検索テンプレート（Google、Spotify等）をブラウザで開きます。また「memo:ID」の場合はアプリ内で対象のThinkを開きます。コロンがない通常タグ（例: [TODO]）の場合は左パネルのフィルター検索にそのキーワードを設定して絞り込んでください。

## 完了：　260630　TextEditor.CurrentEditor.DoOnCursorPos
　CursorPos位置が、url, filepath, tag のいずれかを表す部分であれば、下記のそれぞれについて実行してください。
　url:      TextEditor.CurrentEditor.DoOnCursorPos:Url:Open　を実施
　filepath: TextEditor.CurrentEditor.DoOnCursorPos:File:Open　を実施
　tag:      TextEditor.CurrentEditor.DoOnCursorPos:Tag:Open　を実施
　※ダブルクリック（Left2）起動時などの状態更新ズレ（一回前のリンクが起動する問題）をエディタ同期関数（syncTextOnCursor）の導入により修正完了。

## 完了：　260630　TextEditor.CurrentEditor.DoOnCursorPos:Menu
　CursorPos位置が、url, filepath, tag のいずれかを表す部分であれば、下記のそれぞれについて実行してください。
　url:      TextEditor.CurrentEditor.DoOnCursorPos:Url:*　をメニューで表示し選択して実施
　filepath: TextEditor.CurrentEditor.DoOnCursorPos:File:*　をメニューで表示し選択して実施
　tag:      TextEditor.CurrentEditor.DoOnCursorPos:Tag:*　をメニューで表示し選択して実施


## 完了：　Application.Resource.ImportFromLocal
## 完了：　260628　TextEditor.CurrentEditor.CursorPos:LineStart+
　↓ CurPosが行先頭ではない場合、CurPosを現在行の先頭位置に移動する　→　終了
　↓ CurPosが行先頭だがテキスト先頭ではない場合、CurPosをテキスト先頭位置に移動する　→　終了
　↓ CurPosがテキスト先頭の場合、カーソルがテキスト先頭にある状態でテキストすべてを選択する
## 完了：　260628　TextEditor.CurrentEditor.CursorPos:LineEnd+
　↓ CurPosが行末尾ではない場合、CurPosを行末尾位置に移動する　→　終了
　↓ CurPosが行末尾だがテキスト末尾ではない場合、CurPosをテキスト末尾位置に移動する　→　終了
　↓ CurPosがテキスト末尾の場合、テキストすべてを選択する

# Status
## 完了：　260630　WorkoutPanel.Pane.Count
　IDをWorkoutPanel.Panes.Countに変更

## 完了：　260630　WorkoutPanel.Panes.IDs
　本IDは一旦廃止にします。

WorkoutPanelに表示されている全PaneのIDをカンマ区切りで表示。次回起動時に再Loadされる

description:    表示されているPaneのID
key:            WorkoutPanel.Panes.IDs
current:        ""
default:        ""
type:           string
candidates:      .*

## 完了：　260629　TextEditor.CurrentEditor.CursorPos
description:    現在のエディタのカーソルのOffset位置
key:            TextEditor.CurrentEditor.CursorPos
current:        0
default:        0
type:           string
candidates:      .*

## 完了：　260629　TextEditor.CurrentEditor.TextOnCursorPos
description:    現在のエディタのカーソル位置のテキスト（URL、ファイルパス、タグなど）
key:            TextEditor.CurrentEditor.TextOnCursorPos
current:        
default:        
type:           string
candidates:     .*

# Application ========================================================================================================

## Action：　260628　Application.Resource.ExportToLocal
　BQに保存されているThinkファイルデータをローカル側に保存する
　保存先は {root}/../Thinktank_{yyyyMMdd}/ とする
　ファイル種別がmemoのものは同フォルダ直下に保存するが、その他のファイル種別はファイル種別名毎のフォルダに保存する。
## Status：　260628　Application.Resource.LocalExporting
　Application.Resource.ExportToLocalの実行中タスクの進捗率を表示してください。


## Action：　260619　Application.FocusedPanel.Name:Next
## Action：　260619　Application.FocusedPanel.Name:Prev
## Status：　260615　Application.FocusedPanel.Name
description:    フォーカスカラム
key:            Application.FocusedPanel.Name
current:        Overview
default:        Thinktank
type:           string
candidates:      ^(Thinktank|Overview|WorkoutSetting|Workout|ReThink)$

　Q：設定値を記載してください。
　A：設定されるすべての値（フォーカス対象となるパネル・エリア名）は以下の5つです。
　　- Thinktank （左パネル：フィルター / チャット / 設定）
　　- Overview （上部パネル：データグリッド / グラフ / チャット / 設定）
　　- WorkoutSetting （ワークアウト設定トレイ / 垂直タブバー）
　　- Workout （ワークアウト編集エリア）
　　- ReThink （右パネル：AIチャット / 設定）
　　※レイアウトモードが 'simple' の場合は、Thinktank, WorkoutSetting, Workout の3つのみが選択肢となります。


## Action：　260619　Application.Status.ExMode:ExApp
## Action：　260619　Application.Status.ExMode:ExOpt
## Status：　260619　Application.Status.ExMode
description:    拡張モード
key:            Application.Status.ExMode
current:        None
default:        None
type:           string
candidates:      ^(None|ExApp|ExOpt)$

　Q：登録されていないでしょうか？
　A：登録されていませんでしたので、Statusとして `TTUIStateManager` に追加登録（実装）しました。
　　これにより、一時拡張ショートカットモード（`ExApp` / `ExOpt` 等）のステータス変化が UI状態管理システムを通じて正しく通知され、参照可能になりました。
　　
　　設定値は以下の通りです。
　　- `None` （通常状態）
　　- `ExApp` （アプリケーション拡張モード）
　　- `ExOpt` （オプション拡張モード）

## Status：　260615　Application.FocusedArea.Name
description:    フォーカスエリア
key:            Application.FocusedArea.Name
current:        None
default:        None
type:           string
candidates:      ^(None|Thinktank|Overview|WorkoutSetting|Workout|ReThink)\..*$

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

## Action：　260616　ToolBar.Mode.Name:Next
　ToolBar.Mode.Nameの設定値を次の値にする。値は循環式。
## Action：　260616　ToolBar.Mode.Name:Prev
　ToolBar.Mode.Nameの設定値を前の値にする。値は循環式。
## Status：　260613　ToolBar.Mode.Name

description:    ToolBarのモード
key:            ToolBar.Mode.Name
current:        KeyAction
default:        KeyAction
type:           string
candidates:     ^(Status|Highlighter|KeyAction|Command|Translate|Reminder|Copyright)$

　Q：設定値を記載してください。
　A：設定可能な値は以下の7つです。
　　- Status （ステータス）
　　- Highlighter （ハイライター）
　　- KeyAction （キーアクション）
　　- Command （コマンド）
　　- Translate （翻訳）
　　- Reminder （リマインダー）
　　- Copyright （著作権・コピーライト情報）

## Status：　260614　ToolBar.StatusMode.Text
description:    ステータスIDのテキスト
key:            ToolBar.StatusMode.Text
current:        
default:        
type:           string
candidates:     .*

　ToolBarがStatusモードのPanelには、EditBoxとTextBoxを配置し、PanelにフォーカスがあるときはEditBoxが、FocusがはずれるとTextBoxが表示されます。
　EditBoxに入力された値が、このToolBar.StatusMode.Textに保存されます。
　TextBoxのときには、ToolBar.StatusMode.TextをCSV形式のStatusIDとして読み取り、「StatusID1:{値1}」、「StatusID2:{値2}」...「StatusIDn:{値n}」というフォーマットで表示します。
## Status：　260625　ToolBar.HighlighterMode.Text
description:    ハイライターの入力テキスト
key:            ToolBar.HighlighterMode.Text
current:        
default:        
type:           string
candidates:     .*
## Status：　260625　ToolBar.CommandMode.Text
description:    コマンドラインの入力テキスト
key:            ToolBar.CommandMode.Text
current:        
default:        
type:           string
candidates:     .*
## Status：　260625　ToolBar.TranslateMode.Text
description:    翻訳の入力テキスト
key:            ToolBar.TranslateMode.Text
current:        
default:        
type:           string
candidates:     .*
## Status：　260625　ToolBar.ReminderMode.Text
description:    リマインダーの入力テキスト
key:            ToolBar.ReminderMode.Text
current:        
default:        
type:           string
candidates:     .*

# Panel ==============================================================================================================
## Action：　260619　FocusedPanel.Area.IsOpen:Toggle
## Action：　260619　FocusedPanel.Mode.Name:Prev
## Action：　260619　FocusedPanel.Mode.Name:Next

## Status：　260619　ThinktankPanel.Area.IsOpen
description:    左パネル表示
key:            ThinktankPanel.Area.IsOpen
current:        true
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　ThinktankPanel.Mode.Name
description:    左パネルモード
key:            ThinktankPanel.Mode.Name
current:        Filter
default:        Filter
type:           string
candidates:     ^(Filter|Chat|Settings)$


　Q：設定値を記載してください。
　A：設定可能な値は以下の3つです。
　　- Filter （フィルター / 検索）
　　- Chat （AI相談チャット）
　　- Settings （設定）

## Status：　260619　OverviewPanel.Area.IsOpen

description:    上部パネル表示
key:            OverviewPanel.Area.IsOpen
current:        false
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　OverviewPanel.Mode.Name

description:    上部パネルモード
key:            OverviewPanel.Mode.Name
current:        Datagrid
default:        Datagrid
type:           string
candidates:     ^(Datagrid|Graph|Chat|Settings)$

　Q：設定値を記載してください。
　A：設定可能な値は以下の4つです。
　　- Datagrid （データグリッド）
　　- Graph （関係性グラフ）
　　- Chat （AIチャット）
　　- Settings （設定）
## Status：　260624　Overview.Thought.Name
　本StatusIDの中身
　Overviewパネルに設定された thoughtファイルの IDです。
　※ 起動時のロードおよびD&Dドロップ時の即時反映対応完了。

description:    OverviewパネルのthoughtファイルID
key:            Overview.Thought.Name
current:        none
default:        none
type:           string
candidates:     .*

## Status：　260619　WorkoutSettingPanel.Area.IsOpen

description:    ワークアウト設定パネル表示
key:            WorkoutSettingPanel.Area.IsOpen
current:        false
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　WorkoutSettingPanel.Mode.Name

description:    ワークアウト設定パネルモード
key:            WorkoutSettingPanel.Mode.Name
current:        Workout
default:        Workout
type:           string
candidates:     ^(Workout|Texteditor|Markdown|Datagrid|Card|Graph)$


　Q：設定値を記載してください。
　A：設定可能な値は以下の6つです。
　　- Workout （概要設定）
　　- Texteditor （テキストエディタ）
　　- Markdown （マークダウンプレビュー）
　　- Datagrid （データグリッド）
　　- Card （カードビュー）
　　- Graph （グラフビュー）

## Status：　260619　ReThinkPanel.Area.IsOpen

description:    右パネル表示
key:            ReThinkPanel.Area.IsOpen
current:        false
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　ReThinkPanel.Mode.Name

description:    右パネルモード
key:            ReThinkPanel.Mode.Name
current:        Chat
default:        Chat
type:           string
candidates:     ^(Chat|Settings)$


　Q：設定値を記載してください。
　A：設定可能な値は以下の2つです。
　　- Chat （AI対話チャット）
　　- Settings （設定）





## Action：　260619　WorkoutPanel.FocusedPane.Mode:Next
## Action：　260619　WorkoutPanel.FocusedPane.Mode:Prev
## Status：　260619　WorkoutPanel.FocusedPane.Mode
description:    ワークアウトパネルの表示モード
key:            WorkoutPanel.FocusedPane.Mode
current:        Texteditor
default:        Texteditor
type:           string
candidates:     ^(Texteditor|Markdown|Datagrid|Card|Graph|Chat)$

　Next/Prevを設定して変更される値は、すべての設定値ではなく、FocusedPaneに表示されているThinkファイル種別ごとに取り得る範囲が変わります。
　今、Next/Prevでその範囲を超えて設定されてしまっていますので、修正してください。docs\260606_Thinktank仕様書\02_UI・画面レイアウト仕様.mdの## 6. ContentType と MediaType のマッピングを参照してください。

　Q：設定値を記載してください。
　A：現在フォーカスされているペイン（WorkoutArea）の表示モード（1文字目大文字）を取得・設定します。
　　設定・変更可能な値は以下の6つです（循環切替に対応）。
　　- `Texteditor` （テキストエディタ）
　　- `Markdown` （マークダウンプレビュー）
　　- `Datagrid` （データグリッド）
　　- `Card` （カードビュー）
　　- `Graph` （グラフビュー）
　　- `Chat` （AIチャット）
　　- `None` （フォーカスされているペインがない場合）



## Status：　260613　WorkoutPanel.FocusedPane.ID

## Action：　260619　WorkoutPanel.FocusedPane.PaneNumber:Next
## Action：　260619　WorkoutPanel.FocusedPane.PaneNumber:Prev
## Status：　260619　WorkoutPanel.FocusedPane.PaneNumber

　Q：設定値を記載してください。
　A：現在表示されているペインの中でフォーカスされているペインの番号（1始まり）を返します。
　　設定される値は以下の通りです。
　　- `1`〜`6` （表示されているペインの配置順）
　　- `0` （フォーカスされているペインがない場合）



# TextEditor Edit =================================================================================================
## Action：　260627　TextEditor.FoldingHeading.IncLevel
　テキストが選択状態ではない場合　
　　カーソル位置がHeading行の先頭の場合は、新しいHeading行を挿入する。
　　カーソル位置がHeading行だが先頭ではない場合は、HeadingのLevelを１つ増やす。
　　カーソル位置がHeading行ではない行の先頭の場合は、新しいHeading行を挿入する。
　　カーソル位置がHeading行ではない行で先頭ではない場合は、先頭に# を挿入してHeading行とする

　テキストが選択状態の場合
　　選択範囲内のすべての行に対し
　　　Heading行の場合は、HeadginのLevelを1つ増やす
　　　Heading行でない場合はなにもしない。
## Action：　260627　TextEditor.FoldingHeading.DecLevel
　カーソル行または選択範囲内のすべての行に対し
　　Heading行の場合は、HeadginのLevelを1つ減らす。# の場合は# を削除する。
　　Heading行でない場合はなにもしない。

## Action： 260625　TextEditor.Comment.NextStyle
　カーソル位置の行、または、選択されている全行を対象に、コメント記号文字を設定する。　設定ルールは以下の通り。
　各行における 先頭の1文字目
　　TextEditor.Comment.StyleSet に含まれる：　次の値に置換
　　TextEditor.Comment.StyleSet に含まれない：　1文字目の位置に、TextEditor.Comment.StyleSetの1番目の文字を挿入
## Action： 260625　TextEditor.Comment.PrevStyle
　カーソル位置の行、または、選択されている全行を対象に、コメント記号文字を設定する。　設定ルールは以下の通り。
　各行における 先頭の1文字目
　　TextEditor.Comment.StyleSet に含まれる：　前の値に置換
　　TextEditor.Comment.StyleSet に含まれない：　1文字目の位置に、TextEditor.Comment.StyleSetの最後の文字を挿入
## Status： 260625　TextEditor.Comment.StyleSet
description:    行頭文字
key:            TextEditor.Comment.StyleSet
current:        > ,>> ,>>> ,; ,| ,# ,
default:        > ,>> ,>>> ,; ,| ,# ,
type:           string
candidates:     .*

　# の次は blank。TextEditor.Comment.NextStyleやTextEditor.Comment.PrevStyleでは# と> の間に行頭文字無し（blank）の状態に移行すること。

## Action：　260625　TextEditor.Bullet.NextStyle
　カーソル位置の行、または、選択されている全行を対象に、行頭文字を設定する。　設定ルールは以下の通り。
　各行における [ 　\t]* のあとの1文字目
　　TextEditor.Bullet.StyleSet に含まれる：　次の値に置換
　　TextEditor.Bullet.StyleSet に含まれない：　1文字目の位置に、TextEditor.Bullet.StyleSetの1番目の文字を挿入
## Action：　260625　TextEditor.Bullet.PrevStyle
　カーソル位置の行、または、選択されている全行を対象に、行頭文字を設定する。　設定ルールは以下の通り。
　各行における [ 　\t]* のあとの1文字目
　　TextEditor.Bullet.StyleSet に含まれる：　前の値に置換
　　TextEditor.Bullet.StyleSet に含まれない：　1文字目の位置に、TextEditor.Bullet.StyleSetの最後の文字を挿入
## Status：　260625　TextEditor.Bullet.StyleSet
description:    行頭文字
key:            TextEditor.Bullet.StyleSet
current:        ・,- ,* ,■ ,● ,= ,> ,# ,↓ ,→ ,[✓] ,
default:        ・,- ,* ,■ ,● ,= ,> ,# ,↓ ,→ ,[✓] ,
type:           string
candidates:     .*

　[✓]の次は blank。TextEditor.Bullet.NextStyleやTextEditor.Bullet.PrevStyleでは[✓]と・の間に行頭文字無し（blank）の状態に移行すること。

## Action：　260619　TextEditor.EditText.Undo
## Action：　260619　TextEditor.EditText.Redo

# TextEditor Cursor 
=======================================================================================================


# TextEditor Heading =======================================================================================================
## Action：　260622　TextEditor.CurrentFolding.Heading:OpenStepwise
　以下の手順を実装してください。
　↓　現カーソルがあるHeading行がCloseである場合は、Heading行をOpenにして終了します。
　↓　現カーソルがあるHeading行がOpenである場合、子Heading行をすべて抽出し、自Heading行や孫Heading行が含まれないことを確認し、抽出した子HeadingのすべてをOpenにして終了します
## Action：　260622　TextEditor.CurrentFolding.Heading:CloseStepwise
　以下の手順を実装してください。
　↓　現カーソル位置がHeading行にない場合は、カーソル位置のテキストが属するHeading行へ移動
　↓　現カーソルがあるHeading行がOpenである場合は、Heading行をCloseにして終了します
　↓　現カーソルがあるHeading行がCloseである場合は、兄弟Heading行をすべて抽出し、親Heading行や孫Heading行が含まれないことを確認し、抽出した兄弟HeadingのすべてをCloseにして終了します
## Status：　260621　TextEditor.CurrentFolding.HeadingOffset

description:    カーソル位置が属する見出し行の開始位置（先頭文字位置）
key:            TextEditor.CurrentFolding.HeadingOffset
current:        0
default:        0
type:           string
candidates:     .*

　現在の実装は廃止します。
　Textが修正されるタイミングで cursor位置のgetHeadingAttributesを保存し、その offsetを設定する
## Status：　260621　TextEditor.CurrentFolding.HeadingNumber

description:    カーソル位置が属する見出し行の番号(例: 1.3.4)
key:            TextEditor.CurrentFolding.HeadingNumber
current:        None
default:        None
type:           string
candidates:     ^.*$

　現在の実装は廃止します。
　Textが修正されるタイミングで cursor位置のgetHeadingAttributesを保存し、その headingNumberを設定する
　docs\260606_Thinktank仕様書\04_状態管理・アクション・ショートカット仕様.md > ### 4.2 属性情報を利用した見出し操作プロセス を参照

## Action：　260626　TextEditor.CurrentFolding.Heading:SiblingFirst

　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　現在位置が兄弟Heading行のなかで１番目である場合、親Heading行へ移動
　↓　１番目の兄弟Heading行に移動
## Action：　260626　TextEditor.CurrentFolding.Heading:SiblingLast

　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　現在位置が兄弟Heading行のなかで最後である場合、親Heading行の次の兄弟Heading行へ移動
　↓　最後の兄弟Heading行に移動
## Action：　260621　TextEditor.CurrentFolding.Heading:SiblingForward
　現カーソル位置がHeading行にない場合：カーソル位置のテキストが属するHeading行へ移動
　現カーソル位置がHeading行である場合：次の兄弟Heading行へ移動
　兄弟Heading行とは、同じ親headingNumberをもつHeading行
## Action：　260621　TextEditor.CurrentFolding.Heading:SiblingBackward
　現カーソル位置がHeading行にない場合：カーソル位置のテキストが属するHeading行へ移動
　現カーソル位置がHeading行である場合：前の兄弟Heading行へ移動
　兄弟Heading行とは、同じ親headingNumberをもつHeading行
## Action：　260621　TextEditor.CurrentFolding.Heading:VisibleForward
　親HeadingのCloseによって非表示のHeadingには移動しません。すべての親Headingが表示されているHeadingにのみ移動するように修正してください。　
## Action：　260621　TextEditor.CurrentFolding.Heading:VisibleBackward
　親HeadingのCloseによって非表示のHeadingには移動しません。すべての親Headingが表示されているHeadingにのみ移動するように修正してください。　



# Color ============================================================================================================== 
## Status：　260624　Thinktank.Ribbon.BgColor
description:    Thinktank（左）パネルのヘッダー・リボン背景色
key:            Thinktank.Ribbon.BgColor
current:        #1d618f
default:        #1d618f
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　Thinktank.Area.BgColor
description:    Thinktank（左）パネルのメインエリア背景色
key:            Thinktank.Area.BgColor
current:        #edf2f6
default:        #edf2f6
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　Overview.Ribbon.BgColor
description:    Overview（上）パネルのヘッダー・リボン背景色
key:            Overview.Ribbon.BgColor
current:        #873960
default:        #873960
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　Overview.Area.BgColor
description:    Overview（上）パネルのメインエリア背景色
key:            Overview.Area.BgColor
current:        #f8f3f5
default:        #f8f3f5
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　Workout.Ribbon.BgColor
description:    Workout（中）パネルのヘッダー・リボン背景色
key:            Workout.Ribbon.BgColor
current:        #382830
default:        #382830
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　Workout.Area.BgColor
description:    Workout（中）パネルのメインエリア背景色
key:            Workout.Area.BgColor
current:        #e3e1e2
default:        #e3e1e2
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　ReThink.Ribbon.BgColor
description:    ReThink（右）パネルのヘッダー・リボン背景色
key:            ReThink.Ribbon.BgColor
current:        #324f46
default:        #324f46
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　ReThink.Area.BgColor
description:    ReThink（右）パネルのメインエリア背景色
key:            ReThink.Area.BgColor
current:        #eff1f0
default:        #eff1f0
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　ToolBar.BgColor
description:    ツールバー（ステータスバー）の背景色
key:            ToolBar.BgColor
current:        #2d2d2d
default:        #2d2d2d
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　ToolBar.Color
description:    ツールバー（ステータスバー）の文字色
key:            ToolBar.Color
current:        #ffffff
default:        #ffffff
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$

## Status：　260624　TextEditor.Highlighter1.Color
ハイライト1の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ1＞文字 で変更した場合に反映される。

description:    ハイライト1の文字色
key:            TextEditor.Highlighter1.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter1.BgColor
ハイライト1の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ1＞背景 で変更した場合に反映される。

description:    ハイライト1の背景色
key:            TextEditor.Highlighter1.BgColor
current:        #fff0b3
default:        #fff0b3
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter1.Attrs
ハイライト1の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ1＞属性 で変更した場合に反映される。

description:    ハイライト1の属性
key:            TextEditor.Highlighter1.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter2.Color
ハイライト2の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ2＞文字 で変更した場合に反映される。

description:    ハイライト2の文字色
key:            TextEditor.Highlighter2.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter2.BgColor
ハイライト2の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ2＞背景 で変更した場合に反映される。

description:    ハイライト2の背景色
key:            TextEditor.Highlighter2.BgColor
current:        #ffb3b3
default:        #ffb3b3
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter2.Attrs
ハイライト2の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ2＞属性 で変更した場合に反映される。

description:    ハイライト2の属性
key:            TextEditor.Highlighter2.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter3.Color
ハイライト3の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ3＞文字 で変更した場合に反映される。

description:    ハイライト3の文字色
key:            TextEditor.Highlighter3.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter3.BgColor
ハイライト3の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ3＞背景 で変更した場合に反映される。

description:    ハイライト3の背景色
key:            TextEditor.Highlighter3.BgColor
current:        #b3e0ff
default:        #b3e0ff
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter3.Attrs
ハイライト3の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ3＞属性 で変更した場合に反映される。

description:    ハイライト3の属性
key:            TextEditor.Highlighter3.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter4.Color
ハイライト4の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ4＞文字 で変更した場合に反映される。

description:    ハイライト4の文字色
key:            TextEditor.Highlighter4.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter4.BgColor
ハイライト4の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ4＞背景 で変更した場合に反映される。

description:    ハイライト4の背景色
key:            TextEditor.Highlighter4.BgColor
current:        #b3ffb3
default:        #b3ffb3
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter4.Attrs
ハイライト4の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ4＞属性 で変更した場合に反映される。

description:    ハイライト4の属性
key:            TextEditor.Highlighter4.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter5.Color
ハイライト5の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ5＞文字 で変更した場合に反映される。

description:    ハイライト5の文字色
key:            TextEditor.Highlighter5.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter5.BgColor
ハイライト5の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ5＞背景 で変更した場合に反映される。

description:    ハイライト5の背景色
key:            TextEditor.Highlighter5.BgColor
current:        #e6b3ff
default:        #e6b3ff
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter5.Attrs
ハイライト5の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ5＞属性 で変更した場合に反映される。

description:    ハイライト5の属性
key:            TextEditor.Highlighter5.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter6.Color
ハイライト6の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ6＞文字 で変更した場合に反映される。

description:    ハイライト6の文字色
key:            TextEditor.Highlighter6.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter6.BgColor
ハイライト6の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ6＞背景 で変更した場合に反映される。

description:    ハイライト6の背景色
key:            TextEditor.Highlighter6.BgColor
current:        #e620ff
default:        #e620ff
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter6.Attrs
ハイライト6の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ6＞属性 で変更した場合に反映される。

description:    ハイライト6の属性
key:            TextEditor.Highlighter6.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*

## Status：　260624　TextEditor.Heading1.Color
見出し行レベル１の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション1 で変更した場合に反映される。

description:    見出し行レベル１の文字色
key:            TextEditor.Heading1.Color
current:        #569cd6
default:        #569cd6
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading1.BgColor
見出し行レベル１の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション1 で変更した場合に反映される。

description:    見出し行レベル１の背景色
key:            TextEditor.Heading1.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading1.Attrs
見出し行レベル１の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション1 で変更した場合に反映される。

description:    見出し行レベル１の属性
key:            TextEditor.Heading1.Attrs
current:        bold|underline
default:    　　bold|underline
type:           string
candidates:     .*
## Status：　260624　TextEditor.Heading2.Color
見出し行レベル２の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション2 で変更した場合に反映される。

description:    見出し行レベル２の文字色
key:            TextEditor.Heading2.Color
current:        #4ec9b0
default:        #4ec9b0
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading2.BgColor
見出し行レベル２の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション2 で変更した場合に反映される。

description:    見出し行レベル２の背景色
key:            TextEditor.Heading2.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading2.Attrs
見出し行レベル２の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション2 で変更した場合に反映される。

description:    見出し行レベル２の属性
key:            TextEditor.Heading2.Attrs
current:        bold|underline
default:    　　bold|underline
type:           string
candidates:     .*
## Status：　260624　TextEditor.Heading3.Color
見出し行レベル３の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション3 で変更した場合に反映される。

description:    見出し行レベル３の文字色
key:            TextEditor.Heading3.Color
current:        #ce9178
default:        #ce9178
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading3.BgColor
見出し行レベル３の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション3 で変更した場合に反映される。

description:    見出し行レベル３の背景色
key:            TextEditor.Heading3.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading3.Attrs
見出し行レベル３の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション3 で変更した場合に反映される。

description:    見出し行レベル３の属性
key:            TextEditor.Heading3.Attrs
current:        bold|underline
default:    　　bold|underline
type:           string
candidates:     .*
## Status：　260624　TextEditor.Heading4.Color
見出し行レベル4の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション4 で変更した場合に反映される。

description:    見出し行レベル4の文字色
key:            TextEditor.Heading4.Color
current:        #dcdcaa
default:        #dcdcaa
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading4.BgColor
見出し行レベル4の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション4 で変更した場合に反映される.

description:    見出し行レベル4の背景色
key:            TextEditor.Heading4.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading4.Attrs
見出し行レベル4の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション4 で変更した場合に反映される。

description:    見出し行レベル4の属性
key:            TextEditor.Heading4.Attrs
current:        bold|underline
default:    　　bold|underline
type:           string
candidates:     .*
## Status：　260624　TextEditor.Heading5.Color
見出し行レベル5の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション5 で変更した場合に反映される。

description:    見出し行レベル5の文字色
key:            TextEditor.Heading5.Color
current:        #c586c0
default:        #c586c0
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading5.BgColor
見出し行レベル5の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション5 で変更した場合に反映される。

description:    見出し行レベル5の背景色
key:            TextEditor.Heading5.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading5.Attrs
見出し行レベル5の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション5 で変更した場合に反映される。

description:    見出し行レベル5の属性
key:            TextEditor.Heading5.Attrs
current:        bold|underline
default:    　　bold|underline
type:           string
candidates:     .*

## Status：　260624　TextEditor.Text.BgColor
description:    エディタ背景色
key:            TextEditor.Text.BgColor
current:        #f5f5f5
default:        #f5f5f5
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Text.Color
description:    エディタ文字色
key:            TextEditor.Text.Color
current:        #1e1e1e
default:        #1e1e1e
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Selection.BgColor
description:    エディタのテキスト選択範囲の背景色
key:            TextEditor.Selection.BgColor
current:        #cba8ff
default:        #c6e6c6ff
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Occurrence.BgColor
description:    エディタで選択した語と同一の単語の強調色
key:            TextEditor.Occurrence.BgColor
current:        #fff0fd
default:        #aac6aaff
type:           color
candidates:     ^#[0-9a-fA-F]{6,8}$

# TextEditor ExOpt ==================================================================================================
## Action：　260619　TextEditor.LineNumbers.IsVisible:Toggle
## Action：　260619　TextEditor.WordWrap.IsVisible:Toggle
## Action：　260619　TextEditor.Minimap.IsVisible:Toggle
## Action：　260619　TextEditor.FullWidthSpace.IsVisible:Toggle
## Action：　260619　TextEditor.UnicodeHighlight.IsVisible:Toggle
## Action：　260619　TextEditor.BracketPairColorization.IsVisible:Toggle

## Status：　260613　TextEditor.LineNumbers.IsVisible
description:    行番号表示
key:            TextEditor.LineNumbers.IsVisible
current:        false
default:        false
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　TextEditor.WordWrap.IsVisible
description:    折り返し
key:            TextEditor.WordWrap.IsVisible
current:        false
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　TextEditor.Minimap.IsVisible
description:    ミニマップ表示
key:            TextEditor.Minimap.IsVisible
current:        false
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　TextEditor.FullWidthSpace.IsVisible
description:    全角スペース強調表示
key:            TextEditor.FullWidthSpace.IsVisible
current:        false
default:        false
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　TextEditor.UnicodeHighlight.IsVisible
description:    Unicode文字強調表示
key:            TextEditor.UnicodeHighlight.IsVisible
current:        false
default:        false
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　TextEditor.BracketPairColorization.IsVisible
description:    括弧の色分け
key:            TextEditor.BracketPairColorization.IsVisible
current:        true
default:        true
type:           boolean
candidates:     ^(true|false)$


# TextEditor ExDate =============================================================================================
## Action：　260625　TextEditor.EditDate.InsertExDate
    カーソル位置に日付文字を挿入しExDateモードに入る。
    ↓カーソル位置の日付文字を判別
    　日付文字ではない場合：　初期日付フォーマットを JDateW としてカーソル位置に日付文字を入力
    ↓カーソル位置の日付文字を認識し、original値、display値、format値として取得・保管する。
    ↓ExDateモードに入ります。
    日付入力の概要は過去のスクリプト docs\reference\script\TTPanel.ps1 を参照
    日付文字判別用の正規表現は以下です。
        @{ Key = 'DateTag'; Regex = [Regex]'\[\d{4}\-\d{2}\-\d{2}\]' }
        @{ Key = 'Date'; Regex = [Regex]'\d{4}\/\d{1,2}\/\d{1,2}( \(.\))?( \d{2}:\d{2})?' }
        @{ Key = 'JDate'; Regex = [Regex]'\d{4}年\d{1,2}月\d{1,2}日( \(.\))?( \d{2}:\d{2})?' }
        @{ Key = 'GDate'; Regex = [Regex]'(明治|大正|昭和|平成|令和)(\d{1,2}|元)年\d{1,2}月\d{1,2}日( \(.\))?( \d{2}時\d{2}分)?' }
　　日付文字挿入用のフォーマットは以下です。　ggyyは日本の元号です。
        DateTag = @{ Format = '[yyyy-MM-dd]' }
        Date    = @{ Format = 'yyyy/MM/dd' }
        DateW   = @{ Format = 'yyyy/MM/dd (ddd)' }
        DateT   = @{ Format = 'yyyy/MM/dd HH:mm' }
        DateWT  = @{ Format = 'yyyy/MM/dd (ddd) HH:mm' }
        JDate   = @{ Format = 'yyyy年MM月dd日' }
        JDateW  = @{ Format = 'yyyy年MM月dd日 (ddd)' }
        JDateT  = @{ Format = 'yyyy年MM月dd日 HH:mm' }
        JDateWT = @{ Format = 'yyyy年MM月dd日 (ddd) HH:mm' }
        GDate   = @{ Format = 'ggyy年MM月dd日' }
        GDateW  = @{ Format = 'ggyy年MM月dd日 (ddd)' }
        GDateT  = @{ Format = 'ggyy年MM月dd日 HH時mm分' }
        GDateWT = @{ Format = 'ggyy年MM月dd日 (ddd) HH時mm分' }　
## Action：　260625　TextEditor.EditDate.ChangeFormat
    カーソル位置の日時フォーマットを変更する。
    変更の順番は過去のスクリプト docs\reference\script\TTPanel.ps1 を参照
## Action：　260625　TextEditor.EditDate.ToggleWeekday
    カーソル位置の曜日表示を変更する
## Action：　260625　TextEditor.EditDate.ToggleTime
    カーソル位置の時間表示を変更する
## Action：　260625　TextEditor.EditDate.IncYear
    カーソル位置の年を1増やす
## Action：　260625　TextEditor.EditDate.DecYear
    カーソル位置の年を1減らす
## Action：　260625　TextEditor.EditDate.IncMonth
    カーソル位置の月を1増やす
## Action：　260625　TextEditor.EditDate.DecMonth
    カーソル位置の月を1減らす
## Action：　260625　TextEditor.EditDate.IncWeek
    カーソル位置の週を1増やす
## Action：　260625　TextEditor.EditDate.DecWeek
    カーソル位置の週を1減らす
## Action：　260625　TextEditor.EditDate.IncDay
    カーソル位置の日を1増やす
## Action：　260625　TextEditor.EditDate.DecDay
    カーソル位置の日を1減らす
## Action：　260625　TextEditor.EditDate.SetNow
    カーソル位置の日時を今にする　
## Action：　260625　TextEditor.EditDate.Reset
    カーソル位置の日時を元に戻す　

# その他
## AI Chatの運用の仕方１
Thinktank>Chat では 問題解決の template, skelton 作成して、Overviewでパッケージ化して、workoutで内容書いて、ReThinkで回答を得るパターンがありえそうですね

## AI Chatの運用の仕方２
Thinktank>Chat で既存のlinksファイルを Referenceしながら概要を捉え、



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

