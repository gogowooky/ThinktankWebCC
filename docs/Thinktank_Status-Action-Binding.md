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

## 完了：　260906　TextEditor.CurrentEditor.CursorPos:Focus
現在フォーカスがあるTextEditorのCursorPosにFocusします。

　A（260906実装）：src\views\actions\textEditorCursorMoveActions.ts に
　　TextEditor.CurrentEditor.CursorPos:Focus を登録しました。
　　TTShortcutManager.instance.activeEditor（＝現在のTextEditor）に対し
　　Monaco の editor.focus() を呼び、カーソル位置を保持したままフォーカスを戻します。
　　位置が判れば revealPositionInCenterIfOutsideViewport でその行を可視化します。
　　ツールバー入力欄（ToolBar.*Mode.Text:Focus）やメニューからエディタ本文へ
　　復帰するための復路アクションで、エディタ未選択時は [エディタ未選択] を返します。
　　既存の TextEditor.CurrentEditor.CursorPos:* 群と同じ登録関数・同じ activeEditor 参照。
　　キー割当は docs\DefaultShortcut.md には追加せず、TTActions.Execute / コマンドから実行可能。

## 完了：　260902　TextEditor.EditText.PasteMarkdown
↓Pasteされるテキストがmarkdownかどうかを判定する → markdownではない場合はそのままPasteして終了
↓markdownの場合は、貼付位置のHeadingレベルを判定し、Pasteテキスト中のHeadingを貼付位置の「子Heading」としてPasteされるようにHeadingの#マークを修正してからPasteする
　（実装内容は下部 # Editor 編集 セクションの TextEditor.EditText.PasteMarkdown の A（260902実装）を参照）




# Status


## 完了：　260906　ToolBar.HighlighterMode.Text:AddContentSearchKeywordFlag
　各パネルの「Think一覧」「AI相談」に設定されているの「コンテンツで絞込み」を実行したときの Keywordを、ToolBar.HighlighterMode.Text に追加するかどうかのフラグです。

　A（260906確認）：260814実装分がコード上に維持されていることを確認しました。
　　TTWorkoutPanel.AddContentSearchKeywordFlag（既定true）／TTUIStateManager の Status 登録／
　　src\utils\highlighterKeyword.ts の addContentSearchKeywordToHighlighter()／
　　ThinktankArea・OverviewArea・ThinktankChatMemoPicker からの呼び出しがいずれも現存。変更なし。

description:    コンテンツで絞込みのキーワードをハイライトする
key:            ToolBar.HighlighterMode.Text:AddContentSearchKeywordFlag
current:        'true'
default:        'true'
type:           bool
candidates:     ^(true|false)^$

　A（260814実装）：TTWorkoutPanel.AddContentSearchKeywordFlag（既定true）として実体を追加し、
　　TTUIStateManagerにStatusとして登録しました。実行判定は共通ユーティリティ
　　src\utils\highlighterKeyword.ts の addContentSearchKeywordToHighlighter() が担い、
　　既存の「選択テキストをHighlighterへ追加」（AddSelected）と同じグループ重複排除ロジックで
　　ToolBar.HighlighterMode.Text にキーワードを追加します。
　　「実行したとき」= コンテンツ絞り込み欄でEnter確定した瞬間とし、以下3箇所に適用しました。
　　- ThinktankPanel Think一覧（ThinktankArea.tsx handleSearch）
　　- OverviewPanel Think一覧（OverviewArea.tsx handleSearch）
　　- 両パネル共通のAI相談メモピッカー（ThinktankChatMemoPicker.tsx、従来onSearchが
　　　NOOPだったためEnter確定時に追加する処理を新設。ライブ絞り込み自体の挙動は変更なし）
　　実機検証（Vite+Expressのdevサーバー）で、Think一覧のコンテンツ絞り込みEnter確定時に
　　ToolBar.HighlighterMode.Text へキーワードが追加されること、フラグをfalseにすると
　　追加されないことを確認しました。

## 完了：　260906　ToolBar.HighlighterMode.Text:AddTitleSearchKeywordFlag
　各パネルの「Think一覧」「AI相談」に設定されているの「タイトルで絞込み」を実行したときの Keywordを、ToolBar.HighlighterMode.Text に追加するかどうかのフラグです。

　A（260906確認）：260814実装分がコード上に維持されていることを確認しました。
　　TTWorkoutPanel.AddTitleSearchKeywordFlag（既定true）／TTUIStateManager の Status 登録／
　　src\utils\highlighterKeyword.ts の addTitleSearchKeywordToHighlighter()／
　　ThinktankArea・OverviewArea・ThinktankChatMemoPicker からの呼び出しがいずれも現存。変更なし。

description:    タイトルで絞込みのキーワードをハイライトする
key:            ToolBar.HighlighterMode.Text:AddTitleSearchKeywordFlag
current:        'true'
default:        'true'
type:           bool
candidates:     ^(true|false)^$

　A（260814実装）：TTWorkoutPanel.AddTitleSearchKeywordFlag（既定true）として実体を追加し、
　　TTUIStateManagerにStatusとして登録しました。追加判定は addContentSearchKeywordToHighlighter
　　と同じユーティリティファイルの addTitleSearchKeywordToHighlighter() で行います。
　　タイトル絞り込み欄（ThinktankFilterPanel/OverviewFilterPanel）はEnterキーで
　　saveHistory()に加えonSearch?.()を呼ぶ実装が既にありましたが、呼び出し元3箇所で
　　onSearchが未接続（ThinktankArea/OverviewArea）またはNOOP（ThinktankChatMemoPicker）
　　だったため、いずれもEnter確定時に上記ユーティリティを呼ぶハンドラーを新設・接続しました。
　　- ThinktankPanel Think一覧（ThinktankArea.tsx handleTitleFilterSearch）
　　- OverviewPanel Think一覧（OverviewArea.tsx handleTitleFilterSearch）
　　- 両パネル共通のAI相談メモピッカー（ThinktankChatMemoPicker.tsx handleTitleSearch）
　　既存のタイトル絞り込み自体（都度ライブ適用）の挙動は変更していません。
　　実機検証で、Think一覧のタイトル絞り込みEnter確定時にToolBar.HighlighterMode.Text へ
　　キーワードが追加されること、フラグをfalseにすると追加されないことを確認しました。


# 対応不要： その他：ナビゲーション　ファイル内・ファイル間ジャンプ
# 対応不要： その他：メニュー
# 対応不要： その他：D&D対応
　Thinktank/Overviewからのthinkメモの D&D
　ファイルシステムからのファイル/ディレクトリの D&D
　ブラウザからの urlの D&D
# 対応不要： その他：設定ファイルの仕組みFix
# 対応不要： その他：AI調整
　

# Application ======================================================================================================
## Status：　260710　Application.CheckedItem.IDs
　IDをApplication.CheckedItem.IDs に変更します。

description:    Think一覧のチェックされたアイテムID
key:            Application.CheckedItem.IDs
current:        ''
default:        ''
type:           string
candidates:     ^(\d{4}\-\d{2}\-\d{2}\-\d{6},)*\d{4}\-\d{2}\-\d{2}\-\d{6}$|^$

## Status：　260709　Application.Synchronization.Status
　アプリケーションの同期状態を示す状態変数です。
description:    
key:            Application.Synchronization.Status
current:        synced
default:        synced
type:           string
candidates:      ^(synced|syncing|pending|error|offline)$
## Status：　260709　Application.Execution.Status
　アプリケーションの起動モードを示す状態変数です。
description:    
key:            Application.Execution.Status
current:        PWA
default:        PWA
type:           string
candidates:      ^(PWA|Local|Electron)$

## Action：　260708　Application.PanelDisplay.Mode:Simple
description:    パネル表示モードをSimpleにする
key:            Application.PanelDisplay.Mode:Simple
## Action：　260708　Application.PanelDisplay.Mode:Normal
description:    パネル表示モードをNormalにする
key:            Application.PanelDisplay.Mode:Normal
## Status：　260708　Application.PanelDisplay.Mode
description:    
key:            Application.PanelDisplay.Mode
current:        Normal
default:        Normal
type:           string
candidates:      ^(Simple|Normal)$

## Action：　260827　Application.Display.Zoom:ZoomIn
description:    拡大表示
key:            Application.Display.Zoom:ZoomIn
　表示文字サイズを 10% 拡大する（上限 200%）。utils/appZoom.ts が <html> に CSS変数
　--tt-font-scale を設定し、全 CSS の font-size は calc(Npx * var(--tt-font-scale, 1)) に
　統一されている。文字だけが拡大・縮小し、余白・パネル幅・レイアウトは不変で再フローする
　（zoom はブラウザ差が大きいため不使用）。Monaco エディタは CSS 非継承なので
　TextEditorMedia が fontSize/lineHeight にこの倍率を掛けて updateOptions する。
　倍率は localStorage（tt-app-zoom）に永続化。Thinktank>設定>表示サイズ のアイコンから呼び出す。
## Action：　260827　Application.Display.Zoom:ZoomOut
description:    縮小表示
key:            Application.Display.Zoom:ZoomOut
　表示文字サイズを 10% 縮小する（下限 50%）。
## Status：　260827　Application.Display.Zoom
description:    表示文字サイズの倍率（％。50〜200、10刻み）
key:            Application.Display.Zoom
current:        100
default:        100
type:           integer
candidates:      ^[0-9]{2,3}$

## Action：　260628　Application.Resource.ExportToLocal
description:    BQ保存済みThinkファイルをローカルにエクスポートする
key:            Application.Resource.ExportToLocal
　BQに保存されているThinkファイルデータをローカル側に保存する
　保存先は {root}/../Thinktank_{yyyyMMdd}/ とする
　ファイル種別がmemoのものは同フォルダ直下に保存するが、その他のファイル種別はファイル種別名毎のフォルダに保存する。
## Status：　260628　Application.Resource.LocalExporting
　Application.Resource.ExportToLocalの実行中タスクの進捗率を表示してください。


## Action：　260619　Application.FocusedPanel.Name:Next
description:    フォーカスカラムを次のパネルに移動する
key:            Application.FocusedPanel.Name:Next
## Action：　260619　Application.FocusedPanel.Name:Prev
description:    フォーカスカラムを前のパネルに移動する
key:            Application.FocusedPanel.Name:Prev
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
description:    拡張モードをExAppに設定する
key:            Application.Status.ExMode:ExApp
## Action：　260619　Application.Status.ExMode:ExOpt
description:    拡張モードをExOptに設定する
key:            Application.Status.ExMode:ExOpt
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
　　※フォーカスがどこにもない場合は None です。

　Q：ToolBar>HilighterのTextboxにフォーカスがあるとき、値はどうなりますか？
　A：ToolBar.Highlighter となります（修正前は誤って Application.StatusBarArea を返していました）。
　　原因は getFocusName.ts のツールバー判定が、実際には存在しない .workout-toolbar という
　　クラス名を参照していたため、常にマッチせずフォールバックの Application.StatusBarArea に
　　落ちていたことです。実際のツールバー（Highlighter/Command/...入力欄を含む）は
　　.ApplicationStatusBarArea として描画されるため、判定をこちらに修正しました。
　　これにより docs\DefaultShortcut.md の `ToolBar.Highlighter ,,Escape` 等、focus列にToolBarの
　　モード名を指定するショートカットが意図通り動作するようになりました。


## Action：　260616　ToolBar.Mode.Name:Next
description:    ToolBarのモードを次の値に切り替える（循環）
key:            ToolBar.Mode.Name:Next
　ToolBar.Mode.Nameの設定値を次の値にする。値は循環式。
## Action：　260616　ToolBar.Mode.Name:Prev
description:    ToolBarのモードを前の値に切り替える（循環）
key:            ToolBar.Mode.Name:Prev
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

## Action：　260728　ToolBar.CommandMode.Text:Unfocus
description:    ToolBarのCommand入力欄から元の位置に戻る
key:            ToolBar.CommandMode.Text:Unfocus
　ToolBarのCommand入力欄から元の位置に戻る
## Action：　260728　ToolBar.CommandMode.Text:Focus
description:    ToolBarのCommand入力欄にフォーカスする
key:            ToolBar.CommandMode.Text:Focus
　ToolBarのCommand入力欄にフォーカスする
## Action：　260728　ToolBar.CommandMode.Text:Clear
description:    ToolBarのCommandをクリアする
key:            ToolBar.CommandMode.Text:Clear
　ToolBarのCommandをクリアする


## Action：　260814　ToolBar.CurrentMode.Text:Focus
　ToolBarの現在のモードの入力欄にフォーカスする
　StatusModeの時は

description:    ToolBarの現在のモードの入力欄にフォーカスする
key:            ToolBar.CurrentMode.Text:Focus

　A（260814調査）：実装済みでした。textEditorHighlighterToolbarActions.ts の
　　ToolBar.CurrentMode.Text:Focus アクションで、StatusModeの場合は
　　.ApplicationStatusBarArea__status-panel-container を起点に、input化済みなら
　　inputへ、未input化ならlabel（tabIndex）へフォーカスする分岐が既に実装されており、
　　「StatusModeの時は」の懸念点は解消済みと確認しました。コード変更なし。
## Action：　260728　ToolBar.CurrentMode.Text:Clear
description:    ToolBarの現在のモードの入力欄のテキストを消去する
key:            ToolBar.CurrentMode.Text:Clear
　ToolBarの現在のモードの入力欄に記載されたテキストを消去する
## Action：　260728　ToolBar.CurrentMode.Text:Paste
description:    ToolBarの現在のモードの入力欄にクリップボードのテキストをペーストする
key:            ToolBar.CurrentMode.Text:Paste
　ToolBarの現在のモードの入力欄にクリップボードのテキストをペーストする
## Action：　260728　ToolBar.CurrentMode.Text:Copy
description:    ToolBarの現在のモードの入力欄のテキストをクリップボードにコピーする
key:            ToolBar.CurrentMode.Text:Copy
　ToolBarの現在のモードの入力欄のテキストをクリップボードにコピーする
## Action：　260728　WorkoutPanel.FocusedPane.PaneNumber:ReFocus
description:    WorkoutPanelの現在フォーカス中のPaneに再度フォーカスする
key:            WorkoutPanel.FocusedPane.PaneNumber:ReFocus
　WorkoutPanelの指定のPane番号に再度フォーカスする
  


# Panel ============================================================================================================
## Action：　260619　FocusedPanel.Area.IsOpen:Toggle
description:    フォーカスパネルのエリア開閉をトグルする
key:            FocusedPanel.Area.IsOpen:Toggle
## Action：　260619　FocusedPanel.Mode.Name:Prev
description:    フォーカスパネルの表示モードを前に切り替える
key:            FocusedPanel.Mode.Name:Prev
## Action：　260619　FocusedPanel.Mode.Name:Next
description:    フォーカスパネルの表示モードを次に切り替える
key:            FocusedPanel.Mode.Name:Next
## Action：　260902　FocusedPanel.Filter.CursorPos:PrevLine
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のカーソルを1行上に移動します。
## Action：　260902　FocusedPanel.Filter.CursorPos:NextLine
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のカーソルを1行下に移動します。
## Action：　260902　FocusedPanel.Filter.Cursor:Action
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のカーソル位置を開きます。
## Action：　260902　FocusedPanel.AIChat.CursorPos:PrevLine
　現在フォーカスされているパネルにAI相談パネルがある場合、そのパネルのAI相談のカーソルを1行上に移動します。
## Action：　260902　FocusedPanel.AIChat.CursorPos:NextLine
　現在フォーカスされているパネルにAI相談パネルがある場合、そのパネルのAI相談のカーソルを1行下に移動します。
## Action：　260902　FocusedPanel.AIChat.Cursor:Action
　現在フォーカスされているパネルにAI相談パネルがある場合、そのパネルのAI相談のカーソル位置を開きます。

　A（260902実装）：src\views\TTFocusedPanelActions.ts に6アクションを登録しました。
　　- FocusedPanel.Filter.CursorPos:PrevLine / NextLine / Cursor:Action
　　　キーボードフォーカスがあるパネル（getFocusName 基準の focusedColumnLive()。
　　　260902修正前は app.FocusedColumn 参照で遅延キャッシュのズレにより誤爆していた）が
　　　Thinktank / Overview のとき、既存の {ThinktankPanel|OverviewPanel}.Filter.* へ
　　　TTActions.Execute で委譲します（それ以外のパネルは [Think一覧なし]）。カーソル状態は
　　　既存の panel.CurrentItemID / FilteredThoughts をそのまま使うため挙動は Think一覧と同一です。
　　- FocusedPanel.AIChat.CursorPos:PrevLine / NextLine
　　　AI相談の chat ファイル一覧（ThinktankChatMemoPicker）はモデル層のカーソルを持たず
　　　React ローカル state 駆動のため、フォーカス中パネル（Thinktank / Overview）配下の
　　　.tt-chat-picker .thoughts-list（ArrowUp/Down/Enter 対応済み）へ keydown を送出して
　　　カーソル移動します。メモピッカーはカーソル移動時に対象 chat を即ロードします。
　　- FocusedPanel.AIChat.Cursor:Action
　　　上記のとおり移動時点で chat はロード済みのため、「開く」= その対話へ入る、として
　　　同パネルの .ai-chat-view__input（チャット入力欄）へフォーカスを移します。
　　キー割当は docs\DefaultShortcut.md の focus 列 *Filter（FocusedPanel.Filter.*）/
　　*Chat（FocusedPanel.AIChat.*）で、それぞれ getFocusName が返す Thinktank.Filter /
　　Overview.Filter、Thinktank.Chat / Overview.Chat に後方一致でマッチします。
## Action：　260902　FocusedPanel.Filter.ContentType:Next
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のContentTypeアイコンのフォーカスを次のアイコンに移動します。
　アイコンはメインの6アイコンの他、全種別をクリアのアイコンも含めます。
## Action：　260902　FocusedPanel.Filter.ContentType:Prev
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のContentTypeアイコンのフォーカスを前のアイコンに移動します。
　アイコンはメインの6アイコンの他、全種別をクリアのアイコンも含めます。
## Action：　260902　FocusedPanel.Filter.ContentType:Action
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のフォーカスされているContentTypeアイコンを押下します。
## Action：　260902　FocusedPanel.Filter.Menu:Next
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のMenuアイコンのフォーカスを次のアイコンに移動します。
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧の
　メニューリボン（.thinktank-menu-ribbon / .overview-menu-ribbon）のアイコンを
　キーボードフォーカスのカーソルとして前後移動・押下します。

　A（260902実装）：src\views\TTFocusedPanelActions.ts の共通ヘルパー
　　registerIconStripActions() で ContentType / Menu 2系統を登録しました。
　　対象ボタン群はモデル層のカーソルを持たず React ローカル state 駆動のため、
　　フォーカス中パネル（getFocusName 基準の focusedColumnLive()。Thinktank / Overview）
　　配下の実 DOM ボタン要素を左→右順に取得し、document.activeElement をカーソルとして扱います。
　　- ContentType: .tt-search-bar__types / .ov-search-bar__types 内の
　　　.tt|ov-search-bar__type-btn / __type-all（6種別 + 右端の全種別クリア/選択）。
　　　空なら [種別フィルタなし]。
　　- Menu: .thinktank-menu-ribbon / .overview-menu-ribbon 内の .menu-ribbon__btn
　　　（無効ボタンは除外）。空なら [メニューなし]。
　　- :Next / :Prev — 次／前へ .focus() を循環移動（未フォーカスからは Next=先頭 / Prev=末尾）。
　　　フォーカス位置は各 CSS の :focus アウトライン（ThinktankSearchBar.css /
　　　OverviewSearchBar.css / Layout/MenuRibbon.css）で可視化。
　　- :Action — フォーカス中のボタンが対象群のいずれかなら .click() で既存ハンドラへ委譲。
　　　未フォーカス時は [アイコン未フォーカス]。
　　キー割当は docs\DefaultShortcut.md の focus 列 *Filter / exmode ExApp。
　　ContentType は M / Shift+M / "," 、Menu は未割当（TTActions.Execute でも実行可）。

　　A（260902修正・不具合対応）：「動かない」報告を受け以下3点を修正。
　　　1. 対象パネルの解決を app.FocusedColumn（focusin→rAF 経由の遅延キャッシュで、
　　　　 rAF 未発火時などに古い値が残る）から、getFocusName(document.activeElement) 基準の
　　　　 focusedColumnLive() に変更。ショートカットの focus 条件（*Filter / *Chat）と同じ
　　　　 判定基準になり、実際にキーボードフォーカスがあるパネルへ確実にディスパッチする。
　　　　 FocusedPanel.Filter.CursorPos:* / FocusedPanel.AIChat.* も同修正で堅牢化。
　　　2. Space キーが効かない問題。KeyboardEvent.key はスペースを ' '（半角スペース）で
　　　　 返すため、keyboardUtils.ts の KEY_NAME_MAP に ' ' → 'space' を追加しキー定義の
　　　　 "Space" と一致させた。
　　　3. .focus() は :focus-visible ヒューリスティックに乗らずアウトラインが出ないため、
　　　　 CSS を :focus に変更。

　　A（260902修正・不具合対応その2）：「Overview の Think一覧では効かない」報告を受け修正。
　　　Overview の検索バーは Thinktank の .tt-search-bar__* ではなく .ov-search-bar__* の
　　　接頭辞を使う別コンポーネント（OverviewSearchBar）だった。focusedTypeFilterButtons() の
　　　セレクタに .ov-search-bar__types / __type-btn / __type-all を追加し、
　　　OverviewSearchBar.css にも同じ :focus アウトラインを追加。Thinktank / Overview 両方で
　　　Next / Prev / Toggle が動くことを実機確認（FocusedColumn を別パネルにしても正しく動作）。
## Action：　260902　FocusedPanel.Filter.Menu:Prev
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のMenuアイコンのフォーカスを前のアイコンに移動します。
## Action：　260902　FocusedPanel.Filter.FocusedIcon:Action
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧で
　フォーカスされているアイコン（種別アイコン / メニューアイコンのいずれか）を押下します。
　（旧 ContentType:Action / Menu:Action を統合。実装内容は下部 # Panel セクションの
　　FocusedPanel.Filter の A（260902実装）を参照）



## Action：　260714　ThinktankPanel.Filter.Cursor:Action
description:    Think一覧のカーソル位置のアイテムを開く
key:            ThinktankPanel.Filter.Cursor:Action
　↓ カーソル位置のアイテムを開く　→　終了
## Action：　260714　ThinktankPanel.Filter.Cursor:ToggleCheck
description:    Think一覧のカーソル位置のチェック状態をトグルする
key:            ThinktankPanel.Filter.Cursor:ToggleCheck
　↓ カーソル位置のチェック状態をトグルする　→　終了
## Status：　260714　ThinktankPanel.Filter.CursorPosID
description:    Thinktank>Think一覧のカーソル位置のID
key:            ThinktankPanel.Filter.CursorPosID
current:        ''
default:        ''
type:           string
candidates:      .*
## Status：　260714　ThinktankPanel.Filter.CursorPos
値0は表示されていない、1以上はカーソルの行番号

description:    Thinktank>Think一覧のカーソル位置
key:            ThinktankPanel.Filter.CursorPos
current:        0
default:        0
type:           string
candidates:      .*
## Action：　260714　ThinktankPanel.Filter.CursorPos:PrevLine
description:    Think一覧のカーソルを1行前に移動する
key:            ThinktankPanel.Filter.CursorPos:PrevLine
　↓ カーソルを１行前に移動する　→　終了
## Action：　260714　ThinktankPanel.Filter.CursorPos:NextLine
description:    Think一覧のカーソルを1行後に移動する
key:            ThinktankPanel.Filter.CursorPos:NextLine
　↓ カーソルを１行後に移動する　→　終了
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
## Status：　260711　ThinktankPanel.CurrentItem.ID
description:    Thinktank>Think一覧のカーソル位置アイテムID
key:            ThinktankPanel.CurrentItem.ID
current:        ''
default:        ''
type:           string
candidates:     ^\d{4}\-\d{2}\-\d{2}\-\d{6}$

## Action：　260714　OverviewPanel.Filter.Cursor:Action
description:    Think一覧のカーソル位置のアイテムを開く
key:            OverviewPanel.Filter.Cursor:Action
　↓ カーソル位置のアイテムを開く　→　終了
## Action：　260714　OverviewPanel.Filter.Cursor:ToggleCheck
description:    Think一覧のカーソル位置のチェック状態をトグルする
key:            OverviewPanel.Filter.Cursor:ToggleCheck
　↓ カーソル位置のチェック状態をトグルする　→　終了
## Status：　260714　OverviewPanel.Filter.CursorPosID
description:    Overview>Think一覧のカーソル位置のID
key:            OverviewPanel.Filter.CursorPosID
current:        ''
default:        ''
type:           string
candidates:      .*
## Status：　260714　OverviewPanel.Filter.CursorPos
値0は表示されていない、1以上はカーソルの行番号

description:    Overview>Think一覧のカーソル位置
key:            OverviewPanel.Filter.CursorPos
current:        0
default:        0
type:           string
candidates:      .*
## Action：　260714　OverviewPanel.Filter.CursorPos:PrevLine
description:    Think一覧のカーソルを1行前に移動する
key:            OverviewPanel.Filter.CursorPos:PrevLine
　↓ カーソルを１行前に移動する　→　終了
## Action：　260714　OverviewPanel.Filter.CursorPos:NextLine
description:    Think一覧のカーソルを1行後に移動する
key:            OverviewPanel.Filter.CursorPos:NextLine
　↓ カーソルを１行後に移動する　→　終了

　A：Status は TTUIStateManager に読み取り専用（isConst）の派生値として登録しました。
　　値はフィルタ・ソート適用後のThink一覧における行番号で、カーソル未設定時は 0 です。
　　Action は Ctrl+N / Ctrl+P に割当てました（docs\DefaultShortcut.md）。
　　行番号0（カーソル未表示）からの移動は、PrevLine/NextLineとも1行目へ移動します。
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
## Status：　260711　OverviewPanel.CurrentItem.ID
description:    Overview>Think一覧のカーソル位置アイテムID
key:            OverviewPanel.CurrentItem.ID
current:        ''
default:        ''
type:           string
candidates:     ^\d{4}\-\d{2}\-\d{2}\-\d{6}$
## Status：　260624　OverviewPanel.Bundle.ID
　本StatusIDの中身
　Overviewパネルに設定された Bundleファイルの IDです。
　※ 起動時のロードおよびD&Dドロップ時の即時反映対応完了。

description:    OverviewパネルのBundleファイルID
key:            OverviewPanel.Bundle.ID
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
description:    フォーカスペインの表示モードを次に切り替える
key:            WorkoutPanel.FocusedPane.Mode:Next
## Action：　260619　WorkoutPanel.FocusedPane.Mode:Prev
description:    フォーカスペインの表示モードを前に切り替える
key:            WorkoutPanel.FocusedPane.Mode:Prev
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
description:    フォーカスペインを次のペインに移動する
key:            WorkoutPanel.FocusedPane.PaneNumber:Next
## Action：　260619　WorkoutPanel.FocusedPane.PaneNumber:Prev
description:    フォーカスペインを前のペインに移動する
key:            WorkoutPanel.FocusedPane.PaneNumber:Prev
## Status：　260619　WorkoutPanel.FocusedPane.PaneNumber

　Q：設定値を記載してください。
　A：現在表示されているペインの中でフォーカスされているペインの番号（1始まり）を返します。
　　設定される値は以下の通りです。
　　- `1`〜`6` （表示されているペインの配置順）
　　- `0` （フォーカスされているペインがない場合）

## Action：　260814　WorkoutPanel.FocusedPane.FileHistory:Menu
　フォーカスのあるPaneのファイル履歴を古いもの順でメニューに表示し、上下キーとEnterで選択する
　メニューのスタイルは TextEditor.CurrentEditor.DoOnCursorPos:Menu と同じにしてください。

　A（260814実装）：TTFocusedPanelActions.ts に登録しました。メニューの描画・操作は
　　DoOnCursorPos:Menu と共通の src\utils\monacoMenu.ts（showMonacoMenu / monaco F1風）を
　　そのまま使うため、スタイル・キー操作は完全に同一です。
　　- 並び順は履歴の並びそのまま（＝古いもの順）で、1行に「位置番号／タイトル（無ければID）／
　　　ID」を表示します。現在位置（HistoryPos）の行には先頭に ● を付けます。
　　- ↑↓で選択、Enterで決定してその位置のファイルをLoadします（LoadHistoryAt。履歴移動なので
　　　履歴自体は増えません）。Escでキャンセル、1〜9はニーモニック（数字キー）で即決定できます。
　　- メニューはフォーカスPane（.workout-area[data-area-id]）の上端中央に表示します。
　　- Paneが無い場合は[対象Paneなし]、履歴が0件の場合は[履歴なし]としてメニューを出しません。
　　キー割当は docs\DefaultShortcut.md に *TextEditor の Ctrl+Alt+Backspace を追加しました
　　（既存の Alt+Backspace＝Prev / Shift+Alt+Backspace＝Next と揃えています）。
　　実機検証（Vite+Expressのdevサーバー）で、4件の履歴が古い順に並びタイトル「ファイル履歴」で
　　表示されること、現在位置に●が付くこと、↑↓で選択が動きEnterでその位置のファイルがLoadされ
　　HistoryPosが移動すること（履歴件数は不変）、Escでキャンセルされ位置が変わらないこと、
　　数字キー4で4番目が即決定されることを確認しました。
　　なお本検証環境のプレビューは document.visibilityState が hidden で requestAnimationFrame が
　　発火しないため、フォーカス判定（focusin→rAF）に依存する *TextEditor 限定のキー割当だけは
　　実キー入力での確認ができていません（アクション本体はショートカットと同じ TTActions.Execute
　　経路で検証済みです）。
## Status：　260814　WorkoutPanel.FocusedPane.FileHistory
　フォーカスがあるPaneでLoadしたファイルの履歴（古い順・最大30件）をCSVで返す読み取り専用Statusです。

description:    フォーカスがあるペインのLoadファイル履歴（古い順・最大30件のCSV）
key:            WorkoutPanel.FocusedPane.FileHistory
current:        ''
default:        ''
type:           string
candidates:     .*
## Status：　260814　WorkoutPanel.FocusedPane.FileHistoryPos
description:    フォーカスがあるペインのファイル履歴の現在位置（1始まり。0=履歴なし）
key:            WorkoutPanel.FocusedPane.FileHistoryPos
current:        0
default:        0
type:           string
candidates:     ^[0-9]+$
## Status：　260814　WorkoutPanel.FocusedPane.FileHistoryMax
description:    フォーカスがあるペインのファイル履歴の件数（最大30）
key:            WorkoutPanel.FocusedPane.FileHistoryMax
current:        0
default:        0
type:           string
candidates:     ^[0-9]+$

## Status：　260630　WorkoutPanel.Pane.Count
　IDをWorkoutPanel.Panes.Countに変更
## Status：　260706　WorkoutPanel.Panes.Layout
description:    Paneレイアウト構造(JSON)
key:            WorkoutPanel.Panes.Layout
current:        null
default:        null
type:           json
candidates:     .*
## Status：　260706　WorkoutPanel.Panes.Display
description:    各Paneのロード状態(JSON)
key:            WorkoutPanel.Panes.Display
current:        []
default:        []
type:           json
candidates:     .*

# Panel D&D ======================================================================================================
## Action：　260724　WorkoutPanel.DroppedFile.ID:Load
description:    DropされたThinkファイルをPaneにLoadする
key:            WorkoutPanel.DroppedFile.ID:Load
　IDを WorkoutPanel.DroppedFile.ID:Load に修正してください。

　DropされたThinkファイルをPaneにLoadする

　A（260724修正）：ActionID を 'WorkoutPanel.Load.DroppedFile' から 'WorkoutPanel.DroppedFile.ID:Load'
　　に変更しました（TTFocusedPanelActions.ts の TTActions.Register、WorkoutArea.tsx /
　　WorkoutPanel.tsx の実行・判定箇所、docs\DefaultShortcut.md の ThinkFileDrag 割当を統一）。
　　命名規則（{Status ID}:*）に合わせ、対応するStatus WorkoutPanel.DroppedFile.ID の実装と
　　あわせて対応しました。
## Action：　260724　WorkoutPanel.DroppedFile.ID:Insert
description:    DropされたThinkファイルを[memo:{ID}]タグとしてコンテンツ内に挿入する
key:            WorkoutPanel.DroppedFile.ID:Insert
　IDを WorkoutPanel.DroppedFile.ID:Insert に修正してください。

　DropされたThinkファイルの内容ではなく `[memo:{ID}]` タグをコンテンツ内に挿入する
　Drop開始時にModifierキーを確認し、Alt+ThinkFileDragであればゴーストを表示せず、
　mouseoverに合わせてカーソルを移動させる

　A（260724修正）：ActionID を 'WorkoutPanel.Insert.DroppedFile' から
　　'WorkoutPanel.DroppedFile.ID:Insert' に変更しました（対応箇所はLoad側と同様）。

　A（260716時点）：ThinkFileDrag（修飾なし）/ Alt+ThinkFileDrag の判定を
　　TTShortcutManager.resolveDragAction('ThinkFileDrag', e) で行っていましたが、この時点では
　　ActionID文字列を各Dropハンドラー内でif分岐するだけで、TTActions.Registerによる正式な
　　Action登録ができておらず、TTActions.Has('WorkoutPanel.Load.DroppedFile') が false を
　　返す状態でした（＝「Actionの実装ができていない」状態）。

　A（260718修正）：以下のとおり、TTActions.Registerで正式に2つのActionを登録し、
　　全てのDropハンドラーがTTShortcutManager.resolveDragAction()でActionIDを解決した後、
　　TTActions.Execute()経由で実行するよう統一しました。
　　- ドラッグ中のペイロード（ThinkID・配置先情報）はキーボードイベントに乗せられないため、
　　　TTShortcutManager.setPendingThinkDrop() / consumePendingThinkDrop() で明示的に
　　　受け渡します（ThinkDropContext型、TTShortcutManager.tsに定義）。
　　- WorkoutPanel.Load.DroppedFile: 'load-replace'（タイトルバードロップ、指定Areaを
　　　丸ごと差し替え）と 'load-place'（コンテンツ領域の余白/端へのドロップ、WorkoutPanel側で
　　　計算済みのオーバーレイ位置に新規Paneを追加）の2種類のcontextを受け取り分岐します。
　　- WorkoutPanel.Insert.DroppedFile: thinkIdのみを受け取り、事前に
　　　TTShortcutManager.setActiveEditor()でセットされたエディタのカーソル位置へ
　　　`[memo:{ID}]` を挿入します。TextEditorMediaRef.getEditor()で対象ペインの
　　　生Monacoインスタンスを取得し、タイトルバー・コンテンツ領域どちらのドロップでも
　　　同じActionを共通実行します。
　　Insertはテキストエディタ（texteditor/workout）でのみ実装しており、Markdown等の
　　読み取り専用メディアや他のMediaTypeでは対象外です（それらは従来通りLoadのみ）。
　　docs\DefaultShortcut.md のキー割当（*, ThinkFileDrag / Alt+ThinkFileDrag）は
　　dragEventToStr()の正規化ルールと一致しており、修正不要と確認済みです。

　Q（260718・1回目）：Alt+ThinkFileDrag（Alt押下と同時にDrag開始）でもInsertにならない。
　A：ネイティブDragEventのaltKeyは、ドラッグ開始前から押していた修飾キーの状態が
　　dragover/drop時点まで正しく反映されないことがあり、ブラウザ・OS依存で不安定でした。
　　window全体のkeydown/keyupでAlt等4修飾キーの押下状態を独自に追跡する仕組み
　　（TTShortcutManager._heldMods）を追加し、resolveDragAction()ではイベント自身の
　　altKeyとこの追跡値をOR演算した実効値で判定するよう修正しました
　　（ウィンドウがフォーカスを失った場合はblurで追跡値を全解除し、押しっぱなし誤検知を防止）。
　　あわせて、ドラッグ元(ThoughtsList)のeffectAllowedが'copy'のみに制限され、
　　ドロップ先各所（WorkoutMenuRibbon/WorkoutPanel）のdropEffectもAltを無視して
　　常に'copy'固定になっていた点も、Alt押下時は'link'を示すよう修正しました
　　（同一問題を引き起こしていた可能性のある副次的な要因のため、あわせて是正）。

　Q（260718・2回目）：上記対応後、タイトルバーへのAlt+Dropでは正しくInsertになるが、
　　コンテンツ領域へのAlt+Dropでは依然Loadになってしまう。
　A：コンテンツ領域の判定は TextEditorMedia.handleDrop 単体で resolveDragAction() を
　　呼び、Insert時のみそこで消費・それ以外はWorkoutPanelの body-level ハンドラーへ
　　バブリングさせてLoadを行う、という2箇所の判定に分かれた設計になっていました。
　　実機の実ドラッグでは、Monaco内部のDOM構造やイベント配送の都合で、この2箇所の
　　判定・タイミングがずれてInsertを取りこぼすケースがあると判断し、コンテンツ領域への
　　Thinkドロップの判定・実行を WorkoutPanel.handleBodyDrop 側の1箇所に一本化しました。
　　- TTShortcutManager に areaId→生Monacoインスタンスのレジストリ
　　　（registerAreaEditor/unregisterAreaEditor/getAreaEditor）を追加し、
　　　TextEditorMediaがマウント/アンマウント時に自身のエディタを登録・解除する
　　　（MediaProps.areaId、WorkoutAreaからarea.IDとして渡す）
　　- WorkoutPanel.handleBodyDrop は、ドロップ位置の直下に既存Pane（overlay.areaId）が
　　　あり、かつそのPaneのエディタが登録済みの場合のみresolveDragAction()でInsert判定を
　　　行い、getAreaEditor()で取得したエディタを対象にInsertを実行する。それ以外
　　　（新規Pane追加位置へのドロップ等、挿入先が無い場合）は従来通りLoadにフォールバックする
　　- TextEditorMedia.handleDrop は application/x-thought-id を検出したら常に
　　　早期returnし、Load/Insertいずれの判定も行わない（Files経由のドロップのみ処理する）
　　実機での複数Pane環境でも、ドロップした特定Paneのエディタにのみ挿入され、
　　他のPaneへ誤って挿入されないことを確認済みです。

　Q（260718・3回目）：Drop開始時にModifierキーを確認し、Alt+ThinkFileDragであれば
　　ゴーストは表示せず、mouseoverに合わせてカーソルを移動させてほしい。
　A：WorkoutPanel.handleBodyDragOver で、Insertが成立する条件（ドロップ位置直下に
　　既存Pane＋対象エディタ登録済み＋Alt押下）を満たす場合は setDropOverlay(null) として
　　Pane配置のゴーストを表示せず、代わりに対象エディタのカーソルをmouseover位置へ
　　その場で移動させ、挿入位置をプレビューするようにしました。
　　座標→モデル位置の変換は editor.getTargetAtClientPoint() を第一候補としつつ、
　　（検証環境ではこのAPIが座標を解決できないケースが確認できたため）
　　スクロール位置・行の高さ・文字幅から幾何計算するフォールバック
　　（clientPointToPosition()）を用意し、どちらでも位置が求まらない場合のみ
　　カーソル移動をスキップします。Alt修飾を外す/既存Paneが無い位置に移動すると、
　　次のdragoverで従来通りのゴースト表示に戻ります。
　　実機での検証で、mouseoverのY/X座標に応じてカーソルが正しい行・列へ追従し、
　　ドロップ時にその位置へ `[memo:{ID}]` が挿入されること（ゴーストは非表示のまま）を
　　確認しました。

　Q（260719・1回目）：Alt押下時、Paneコンテンツ内へのゴースト（水色）は消えるが、
　　WorkoutPanel領域内への「新規Pane追加」ゴースト（緑）が消えず、Alt押下時にも
　　関わらずInsertではなくLoadが起動してしまう。また、Alt押下時はDrop先のCaretを
　　表示してマウスに追随させてほしい。
　A：computeDropOverlay()は、既存Paneへのヒットテストより先に、WorkoutPanel本体の
　　外縁からの距離（OUTER_RATIO=15%）だけでisOuterを判定し、trueなら無条件に
　　「新規Pane追加」（緑ゴースト、overlay.areaIdなし）を返す実装でした。既存Paneは
　　通常WorkoutPanel本体の端まで隙間なく敷き詰められるため、本体の外縁付近（15%
　　マージン内）にある既存Paneをホバーした場合、isOuterがtrueになりoverlay.areaId
　　が付かないまま「追加」ゴーストが確定してしまい、直前のInsert判定（overlay.areaId
　　必須）が常にfalseになっていたことが原因でした（単一Pane構成では、本体の端＝Paneの
　　端でもあるため必ず再現します）。
　　isOuterの判定ロジック自体を変更するとLoad（新規Pane追加）側の既存挙動に影響するため、
　　isOuterとは独立した findWorkoutAreaIdAtPoint(clientX, clientY) を新設し、
　　document.elementsFromPoint() で座標直下の .workout-area[data-area-id] を
　　直接ヒットテストするようにしました。handleBodyDragOver / handleBodyDrop の両方で、
　　Alt押下時はcomputeDropOverlay()のisOuter判定より先にこちらを優先し、対象Paneの
　　エディタが見つかればInsert確定（ゴースト非表示）、見つからなければ従来通り
　　computeDropOverlay()にフォールバックします。
　　あわせて、Alt押下中にカーソル移動先のエディタへ editor.focus() を呼び、
　　Drop先のCaretを可視化してマウス位置に追随させました（同一エディタへの連続focus()
　　呼び出しはactiveEditor参照の変化時のみに限定し、余計な再フォーカスは行いません）。
　　実機検証（ブラウザ上での合成dragover/drop）で、単一Pane構成（本体端＝Pane端と
　　なる典型ケース）において、Alt押下時はゴースト非表示・Caret追従・Insert実行
　　（Pane数不変、正しい位置へのタグ挿入）を、Alt非押下時は従来通り緑ゴースト表示・
　　Load実行（新規Pane追加）となることをそれぞれ確認しました。

　Q（260719・2回目）：上記対応後もAlt押下時のInsert位置にCaretが表示されない。
　A：直前の対応では、Insert対象エディタへ editor.focus() を呼ぶことでMonaco自身の
　　カーソル（点滅バー）を表示させようとしていましたが、これは合成イベントによる
　　検証では機能していたものの、実際のネイティブHTML5ドラッグ操作中は成立しません。
　　ブラウザ（Chromium）はドラッグセッション中、フォーカスの奪取をセキュリティ上
　　抑制するため、ドラッグ中に editor.focus() を呼んでもDOMフォーカスは実際には
　　移動せず、Monacoは内部的に非フォーカス状態のままとなり、カーソル（Caret）を
　　描画しません。これが「合成イベントでの検証では動いたが実機の実ドラッグでは
　　表示されない」不整合の原因でした。
　　DOMフォーカスに依存しない方式に切り替え、WorkoutPanel側で editor.
　　getScrolledVisiblePosition() によりモデル位置をピクセル座標へ変換し、
　　独自の点滅バー要素（.workout-panel__insert-caret、WorkoutPanel.tsxの
　　insertCaret state）をゴーストオーバーレイと同じ絶対配置レイヤーに描画する
　　方式にしました。Monacoへの setPosition() / focus() 呼び出し自体は挿入位置の
　　確定や副次的なフォーカス合わせのため残していますが、視覚的なCaret表示は
　　この独自オーバーレイのみに依存し、DOMフォーカスの成否に左右されません。
　　実機検証で、Alt押下中は独自Caretが表示されマウス位置に追従し、Alt解除・
　　dragleave・drop完了のいずれでも正しく消去されること、Alt非押下時はCaretが
　　一切表示されず従来通り緑ゴーストのみが出ることを確認しました。
## Status：　260724　WorkoutPanel.DroppedFile.ID
　各パネルのThink一覧のThinkファイルがWorkoutパネル内にDropされた際に、そのファイルのIDが設定されます。

description:    WorkoutパネルにDropされたThinkファイルのID
key:            WorkoutPanel.DroppedFile.ID
current:        ''
default:        ''
type:           string
candidates:     .*

　A（260724実装）：TTUIStateManager に読み取り専用（isConst）のStatusとして登録しました。
　　実体は TTWorkoutPanel.DroppedFileID（新設フィールド）で、WorkoutPanel.DroppedFile.ID:Load /
　　WorkoutPanel.DroppedFile.ID:Insert の各Actionが、DropされたThinkの thinkId をドロップ成立
　　直後（Load側はPane差し替え/新規Pane追加の成否によらず、Insert側はエディタ未選択でも）に
　　設定します。



# TextEditor Edit ==================================================================================================
## Action：　260627　TextEditor.FoldingHeading.IncLevel
description:    見出し行のレベルを1つ上げる（非見出し行は見出し化）
key:            TextEditor.FoldingHeading.IncLevel
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
description:    見出し行のレベルを1つ下げる
key:            TextEditor.FoldingHeading.DecLevel
　カーソル行または選択範囲内のすべての行に対し
　　Heading行の場合は、HeadginのLevelを1つ減らす。# の場合は# を削除する。
　　Heading行でない場合はなにもしない。
## Action：　260625　TextEditor.Comment.NextStyle
description:    行頭のコメント記号を次のスタイルに変更する
key:            TextEditor.Comment.NextStyle
　カーソル位置の行、または、選択されている全行を対象に、コメント記号文字を設定する。　設定ルールは以下の通り。
　各行における 先頭の1文字目
　　TextEditor.Comment.StyleSet に含まれる：　次の値に置換
　　TextEditor.Comment.StyleSet に含まれない：　1文字目の位置に、TextEditor.Comment.StyleSetの1番目の文字を挿入
## Action：　260625　TextEditor.Comment.PrevStyle
description:    行頭のコメント記号を前のスタイルに変更する
key:            TextEditor.Comment.PrevStyle
　カーソル位置の行、または、選択されている全行を対象に、コメント記号文字を設定する。　設定ルールは以下の通り。
　各行における 先頭の1文字目
　　TextEditor.Comment.StyleSet に含まれる：　前の値に置換
　　TextEditor.Comment.StyleSet に含まれない：　1文字目の位置に、TextEditor.Comment.StyleSetの最後の文字を挿入
## Action：　260625　TextEditor.Bullet.NextStyle
description:    行頭の箇条書き文字を次のスタイルに変更する
key:            TextEditor.Bullet.NextStyle
　カーソル位置の行、または、選択されている全行を対象に、行頭文字を設定する。　設定ルールは以下の通り。
　各行における [ 　\t]* のあとの1文字目
　　TextEditor.Bullet.StyleSet に含まれる：　次の値に置換
　　TextEditor.Bullet.StyleSet に含まれない：　1文字目の位置に、TextEditor.Bullet.StyleSetの1番目の文字を挿入
## Action：　260625　TextEditor.Bullet.PrevStyle
description:    行頭の箇条書き文字を前のスタイルに変更する
key:            TextEditor.Bullet.PrevStyle
　カーソル位置の行、または、選択されている全行を対象に、行頭文字を設定する。　設定ルールは以下の通り。
　各行における [ 　\t]* のあとの1文字目
　　TextEditor.Bullet.StyleSet に含まれる：　前の値に置換
　　TextEditor.Bullet.StyleSet に含まれない：　1文字目の位置に、TextEditor.Bullet.StyleSetの最後の文字を挿入

## Action：　260619　TextEditor.EditText.Undo
description:    編集を元に戻す（Undo）
key:            TextEditor.EditText.Undo
## Action：　260619　TextEditor.EditText.Redo
description:    編集をやり直す（Redo）
key:            TextEditor.EditText.Redo
## Action：　260727　TextEditor.EditText.Delete
description:    カーソル右の文字を削除する
key:            TextEditor.EditText.Delete
　monaco-editorでDeleteキーを押したときの動作
## Action：　260727　TextEditor.EditText.Backspace
description:    カーソル左の文字を削除する
key:            TextEditor.EditText.Backspace
　monaco-editorでBackspaceキーを押したときの動作
## Action：　260902　TextEditor.EditText.PasteMarkdown
description:    クリップボードを貼り付ける（Markdownなら見出しを貼付位置の子見出しに調整）
key:            TextEditor.EditText.PasteMarkdown
　クリップボードのテキストを貼り付ける。ATX 見出しを含まない場合はそのまま貼り付けて終了。
　含む場合は、貼付位置（カーソル行）を内包する直近の見出しレベル parentLevel を求め、
　貼り付けテキスト中の見出しの最上位が parentLevel+1 になるよう全見出しの # 数を一括シフト
　（1..6 にクランプ）してから貼り付ける。フェンス（```/~~~）内の # は見出し扱いしない。

　A（260902実装）：src\views\actions\textEditorPasteActions.ts に登録。見出し検出は
　　utils/markdownSections.ts の collectHeadings（フェンス対応）を流用。貼付は選択範囲へ
　　editor.executeEdits で行う（選択があれば置換）。エディタ未フォーカス時は [エディタ未フォーカス]、
　　クリップボード読取失敗時は [エラー] を返す。純ロジック reparentPastedHeadings は
　　同ファイルから export（テスト用）。

## Status：　260816　TextEditor.Bullet.Marks
　CSVの各アイテムが docs/DefaultColor.md の TextEditor.Bullet.Style(1..9).* に順に対応します
　（1番目のマーク＝Style1、2番目＝Style2 …）。色・表示属性はそちらで定義します。
　TextEditor.Bullet.StyleNum はこのCSVのアイテム数から自動で決まるため、ここでは定義しません。

description:    箇条書きのマーク
key:            TextEditor.Bullet.Marks
current:        ・,-,*,■,●,=,↓,→,[✓]
default:        ・,-,*,■,●,=,↓,→,[✓]
type:           string
candidates:     .*
## Status：　260816　TextEditor.Comment.Marks
　CSVの各アイテムが docs/DefaultColor.md の TextEditor.Comment.Style(1..6).* に順に対応します
　（1番目のマーク＝Style1、2番目＝Style2 …）。色・表示属性はそちらで定義します。
　TextEditor.Comment.StyleNum はこのCSVのアイテム数から自動で決まるため、ここでは定義しません。

description:    コメントのマーク
key:            TextEditor.Comment.Marks
current:        >,>>,>>>,;,|,//
default:        >,>>,>>>,;,|,//
type:           string
candidates:     .*

　TextEditor.CurrentEditor.DoOnCursorPos で認識される Url / Filepath / Tag の文字スタイルは
　docs/DefaultColor.md で定義します（TextEditor.Url.Style.* / .Filepath.Style.* / .Tag.Style.*）。

将来的にタグごとに分ける可能性あり、

　TextEditor.Highlighter.Style(1..6).* / TextEditor.Heading.Style(1..6).* は docs/DefaultColor.md で定義します。
　（WorkoutSettingPanel>TextEditor設定 の ハイライト色 / 文字設定 での変更もそちらの値を書き換えます）

　各パネルのテーマ色は docs/DefaultColor.md の (Thinktank|Overview|Workout|ReThink|ToolBar).Theme.* で定義します。
　　Color   … パネルの基礎色（リボン等）。他のパネル色はこの色から生成します。
　　BgColor … コンテンツ表示部（一覧・チャット等の白地）の背景色。

　パネル間ボーダー（スプリッター）のマウスオーバー中／ドラッグ中の色は
　docs/DefaultColor.md の FocusingBorder.Theme.Color で定義します（BgColor / Attrs は未使用）。

## Status：　260817　TextEditor.FoldingHeader
　TextEditor で折り畳まれている（閉じている）行のスタイルは
　docs/DefaultColor.md の TextEditor.FoldingHeader.BgColor で定義します（BgColor のみ。Color / Attrs は使いません）。
　装飾の対象は閉じている範囲の開始行（`⋯` が出る、画面に見えている行）のみで、行全体に背景色を敷きます。
　文字は見出し等その行本来のスタイル（TextEditor.Heading.Style(1..6).* 等）のままです。

　TextEditor.Selection（カーソルで選択された部分）の色は混ざりません。Monaco の既定では
　折り畳み行の色 editor.foldBackground が「選択色の30%」であるため選択色が混ざるので、
　Monaco 標準の折り畳みハイライト（foldingHighlight）を切って断ち切っています。
　ミニマップの印も FoldingHeader の背景色から出します。

　ただし描画順は Monaco の既定のままです（選択 → デコレーションの順に描かれる）。
　折り畳み行の上で選択したとき、その行だけ選択色が背景色に隠れます（文字は本文レイヤなので見えます）。
　折り畳み行でも選択色を見せたい場合は BgColor をアルファ付き8桁（例 #ffddff80）にしてください。
　選択の描画に z-index を与えて前面に出す方法は使わないこと。.lines-content が stacking context を
　作らないため、選択の矩形が本文より前面に来て文字が塗り潰されます。

## Status：　260817　エディタ基本色のUI（WorkoutSettingPanel>TextEditor設定>文字設定）
　「文字設定」先頭にあった 背景色 / 文字色 / 選択色 / 一致色 の4項目（旧 TextEditor.Color.*）は廃止し、
　同じ位置で以下のStatusIDを直接編集するUIに置き換えました。Color と BgColor のみを扱い、Attrs のUIは持ちません。
　　基本 … TextEditor.Text.(Color,BgColor)
　　選択 … TextEditor.Selection.BgColor
　　出現 … TextEditor.Occurrence.BgColor
　　折畳 … TextEditor.FoldingHeader.BgColor
　文字色のUIを持つのは基本だけです。選択は Monaco が選択中の文字色（editor.selectionForeground）を
　高コントラストテーマでしか適用せず、出現は wordHighlight に前景色のテーマ項目がないため、いずれも反映できません。
　なお TextEditor.Selection.BgColor は、エディタのフォーカスの有無にかかわらず同じ色になります。
　Monaco の既定では非フォーカス時に同色の50%（editor.inactiveSelectionBackground の既定値）になるため、
　テーマ側で editor.inactiveSelectionBackground にも同じ値を明示しています。
　既定値の定義元は他と同じく docs/DefaultColor.md で、専用フィールドを廃止したため値の実体は ColorStatus に一本化されました。




# TextEditor Action ================================================================================================
## Action：　260814　WorkoutPanel.FocusedPane.FileHistory:Next
　Workoutパネルに表示されているPane毎に、最大30個までのLoadファイルの履歴リストを設定し、以下ルールで運用してください。
　1. 最初のファイルがLoadされると、ファイル履歴にIDを記録し、HistoryPosとHistoryMaxを1にします。
　2. 次のファイルがLoadされると、ファイル履歴にIDを追加し、HistoryPosとHistoryMaxを+1します。
　3. HistoryMaxが31に達した場合は、履歴の2-30を1-29にスライドし、30番目に新しいIDを追加し、HistoryPosとHistoryMaxは30のままにしてください。

　このActionは、フォーカスのあるPaneのファイル履歴において、HistoryPosのみを+1し、その位置のIDをLoadします。　HistoryPosがHistoryMaxのときは何もロードしません。
　（260814修正：:Prev と動作を入れ替えました。修正前は「HistoryPosを-1」でした）

### A（260814実装）：履歴の実体は Pane（TTWorkoutArea）ごとの FileHistory / HistoryPos として
　　src\views\TTWorkoutArea.ts に持たせました。HistoryMax は FileHistory の件数から求まる
　　派生値（getter）です。履歴への記録は TTWorkoutArea.OpenThink()（＝Paneへのファイル
　　Loadが必ず通る唯一の入口）で行うため、Think一覧からのオープン・D&D・タグからのジャンプ・
　　起動時のPane復元など、経路によらず同じルールで記録されます。
　　- 1件目のLoadでHistoryPos/HistoryMaxが1になり、以降のLoadで末尾に追加して+1します。
　　- 31件目のLoadでは先頭を捨てて末尾に詰め（2-30→1-29、30番目に新ID）、
　　　HistoryPos/HistoryMaxは30のままとします。
　　- （260814修正）履歴を戻った状態（HistoryPos < HistoryMax）で新しいファイルを
　　　Loadした場合は、HistoryPos+1 の位置に新IDを記録し、HistoryMax をその値まで
　　　切り詰めます（それ以降の履歴は破棄。ブラウザの戻る/進むと同じ挙動）。
　　- 履歴エントリにはIDに加えLoad時点のMediaType・タイトルも保持し、履歴移動時に
　　　当時の表示形式のまま復元します。
　　- 同一ファイルの再Load（既にその位置で開いているファイルのLoad）では履歴を増やさず、
　　　MediaType・タイトルのみ最新化します（連続重複の抑止。仕様に明記のない点の補完）。
　　Status（読み取り専用）として WorkoutPanel.FocusedPane.FileHistory（IDのCSV）／
　　FileHistoryPos／FileHistoryMax の3つを TTUIStateManager に登録しました。
　　キー割当は docs\DefaultShortcut.md の ExApp+E／Shift+Alt+Backspace（Next）、
　　ExApp+R／Alt+Backspace（Prev）です。
　　実機検証（Vite+Expressのdevサーバー）で、35件Load時に履歴が30件へスライドし
　　HistoryPos/HistoryMaxが30に留まること、5件Load→3回戻る（pos=2/5）→新規Loadで
　　pos=3/3・履歴が3件へ切り詰められることを確認しました。

### A（260814修正・Next/Prevの入れ替え）：:Next と :Prev の動作を入れ替えました。
　　本Action（:Next）はフォーカスPaneのHistoryPosを+1して、その位置のIDをLoadします。
　　HistoryPos = HistoryMax（末尾）のときは進む先のIDが無いため何もロードしません
　　（履歴移動によるLoadは履歴に記録しません）。
　　docs\DefaultShortcut.md のキーとActionIDの対応は変更していないため、各キーの動作は反転します
　　（Shift+Alt+Backspace＝進む、Alt+Backspace＝戻る、ExApp+E＝進む、ExApp+R＝戻る）。
　　実機検証で、4件Load後にPrevで 4→3→2→1 と戻り、Nextで 1→2→3→4 と進むこと、
　　先頭・末尾でそれぞれ停止することを確認しました。
## Action：　260814　WorkoutPanel.FocusedPane.FileHistory:Prev

　このActionは、フォーカスのあるPaneのファイル履歴において、HistoryPosのみを-1し、その位置のIDをLoadします。　HistoryPosが1のときは何もロードしません。
　（260814修正：:Next と動作を入れ替えました。修正前は「HistoryPosを+1」でした）

　A（260814実装・260814修正）：フォーカスPaneのHistoryPosを-1して、その位置のIDを
　　Loadします（履歴には記録しません）。HistoryPosが1（先頭）のときは何もロードしません。
　　履歴の記録ルール・上限30件のスライド・Statusは :Next 側の記述を参照してください。
　　キー割当は ExApp+R／Alt+Backspace です。
　　実機検証で、4件Load後にPrevで 4→3→2→1 と戻り、HistoryPos=1でそれ以上戻らないこと、
　　そこからNextで 1→2→3→4 と進み末尾で停止することを確認しました。

## Action：　260813　TextEditor.CurrentEditor.DoOnCursorPos:Menu
description:    カーソル位置のテキスト種別に応じたアクションメニューを表示する
key:            TextEditor.CurrentEditor.DoOnCursorPos:Menu
　CursorPos位置が、url, filepath, tag のいずれかを表す部分であれば、下記のそれぞれについて実行してください。
　url:      TextEditor.CurrentEditor.DoOnCursorPos:Url:*　をメニューで表示し選択して実施
　filepath: TextEditor.CurrentEditor.DoOnCursorPos:File:*　をメニューで表示し選択して実施
　tag:      TextEditor.CurrentEditor.DoOnCursorPos:Tag:*　をメニューで表示し選択して実施
　いずれでもない場合はmenuからtagを選択して挿入します。

### 今回のメニューは想定と異なりますので、再構成をお願いします。
F1押下で出てくるmonaco editorオリジナルメニューのようなスタイルにしてください。
menuはwindows context menuのようなmenutree型です。docs\DefaultSearchTag.md の Description を参照、">"で区切られるアイテムでツリー構造を作り、同じ親でまとめて表示してください。　
menuの最上部にmenuタイトルを表示します。今回のタイトルは「タグ挿入」です。
Menuは、基本は↑↓キー、Enter、ESCで選択、決定、キャンセルですが、先頭の一文字でも選択・決定できます。

### > 260812
　CursorPos位置が、url, filepath, tag のいずれかを表す部分であれば、既存の動作を実行してください。
　CursorPos位置が、url, filepath, tag のいずれかを表す部分ではない場合、以下で説明するMenuで選択したタグを挿入してください。
　Menuは「Think一覧>フィルター項目」と似たスタイルとし、タイトルは「タグ挿入」とします。
　Menuは、docs\DefaultSearchTag.md の Description を参照して作成します。　> は子アイテムで、同じ親アイテムのものはまとめて表示してください。　
　Menuは、基本は↑↓キー、Enter、ESCで選択、決定、キャンセルですが、先頭の一文字でも選択・決定できます。
　決定されれば、選択アイテムの #ID のタグを挿入し、メニューを閉じます。　


### A（260812修正）：カーソル位置がurl/filepath/tagのいずれかの場合は、従来通りTTActions.GetRegisteredActionsから
　　該当プレフィックス（Url:/File:/{subTag}:）のアクションを絞り込みshowActionMenuで選択メニューを表示する
　　既存動作を変更せず維持しました。
　　新規に、カーソル位置がそのいずれでもない場合の「タグ挿入」メニューを追加しました（src\utils\tagInsertMenu.ts）。
　　- サーバー側に /api/system/search-tag-items（apiAuth前段の公開API）を追加し、docs\DefaultSearchTag.md の
　　　各行から ID と Description（"親)親名 > 子)子名" 形式、NoURL行含む全件）を返すようにしました。
　　- クライアント側では Description を " > " で分割し、親アイテムの見出し（グルーピング、同じ親は
　　　ファイル内での出現順に関わらずまとめて表示）と、子アイテム（ニーモニック文字＋ラベル＋ID）の
　　　一覧に変換して表示します（action-menu-* のスタイルを流用し、グループ見出し用に
　　　.action-menu-group-header を追加）。
　　- ↑↓キーでの選択移動、Enterでの決定、Escでのキャンセルに加え、Description中の「X)ラベル」の
　　　先頭一文字（ニーモニック）を押すと、その子アイテムを選択と同時に即決定します。
　　- 決定されると、選択アイテムのIDを用いて `[ID:]` をカーソル位置に挿入し、カーソルを `:` と `]` の
　　　間（値を続けて入力できる位置）に移動してメニューを閉じます。
　　実機検証（Vite+Expressのdevサーバー、Monacoエディタへの実キー入力）で、既存のurl/filepath/tag
　　メニュー分岐が従来通り動作すること、非該当時に「タグ挿入」メニューが親グループ見出し付きで
　　表示されること、先頭文字（例："b"→Bing）で即座に `[Bing:]` が挿入されカーソルが`:`と`]`の間に
　　位置することを確認しました。

### A（260813再構成）：260812版はフラットな一覧＋グループ見出しで、要求された menutree 型では
　　なかったため、メニューを全面的に作り直しました（src\utils\tagInsertMenu.ts）。
　　サーバーAPI（/api/system/search-tag-items）と、url/filepath/tag時の既存分岐は変更していません。
　　- 構造：Description を ">" 区切りのパスとみなしてツリーを構築します（同一ラベルの親は1つに
　　　集約。2階層固定ではなく任意段数に対応）。ルートには親アイテムのみが並び、末尾に "›" を
　　　表示します。親を決定すると、その子メニューが Windows のコンテキストメニューと同様に
　　　右側へフライアウトします（右端に収まらない場合は左側へ反転）。
　　- スタイル：monaco の F1（Quick Input）ウィジェットに寄せ、対象エディタ上端の中央に配置します
　　　（背景 #252734／1px #3c4048 ボーダー／角丸4px／ドロップシャドウ、選択行は #04395e）。
　　　パネル最上部にメニュータイトル（今回は「タグ挿入」）を表示します。CSSは .tag-menu-* として
　　　新設し、旧 .tag-insert-menu-container / .action-menu-group-header は廃止しました。
　　- 操作：↑↓で選択、→またはEnterで子メニューを展開、←で1階層戻る、Escは子メニューが
　　　開いていれば1階層戻り・ルートのみならキャンセル、葉でEnterすると決定します。
　　　先頭一文字（ニーモニック）は、その階層で一致が1件なら選択と同時に決定（親なら展開）し、
　　　複数一致する場合はWindowsのメニューと同様に候補間を巡回するだけに留めます
　　　（例：「製薬」配下は P)Pubmed検索 と P)医薬品医療機器総合機構 が重複するため巡回）。
　　　マウスでもホバーで選択・子メニュー展開、クリックで決定できます。
　　- 決定時の挿入内容は260812版と同じく `[ID:]` で、カーソルは `:` と `]` の間に置きます。
　　実機検証（Vite+Expressのdevサーバー）で、ルートが親8件（検索/辞書/場所/Media/科学/製薬/IT/Tag）
　　のツリーになること、→での子メニューのフライアウト位置、←/Escでの階層戻り、ルートEscでの
　　キャンセル、"g"→"y" の2階層ニーモニックで `[YahooTransfer:]` が挿入されカーソルが`:`と`]`の
　　間に来ること、"p" 重複時は決定されず巡回しEnterで `[PMDA:]` が入ること、カーソルがタグ上に
　　ある場合は従来通り既存のアクション選択メニューが出ることを確認しました。

### A（260813修正・タグ挿入内容）：以下3点を修正しました。
　　- Tag.AI の廃止：docs\DefaultSearchTag.md の `AI, "T)Tag > A)外部AI"` 行を（Mailと同じ方式で）
　　　`##` でコメントアウトし、タグ挿入メニューの候補から外しました。メニューは
　　　/api/system/search-tag-items 経由で同ファイルから組み立てているため、コード変更は不要です。
　　　なお既存ノート中の `[ai:...]` タグを開く動作（DoOnCursorPos:AI:Open）は、過去の記述が
　　　動かなくなるのを避けるため残しています（今回の指示はMenuの機能範囲のため）。
　　- 挿入書式の個別指定：既定は従来通り `[ID:]` ですが、アンカー系はID名を含まない固定書式に
　　　なるため、textEditorCursorContentActions.ts に TAG_INSERT_TEXT を追加しました。
　　　　Jump（Tag.Anchor 8.1）      → `[:>]`
　　　　Reference（Tag.Anchor 8.2） → `[:]`
　　- カーソル位置：挿入後のカーソルは「閉じ括弧の直前」に置く1つの規則に統一しました。
　　　これにより `[ID:]` は `:` の後ろ、`[:>]` は `>` の後ろ、`[:]` は `:` の後ろとなり、
　　　3件とも指示どおりになります（計算式 startColumn + length - 1 は従来のまま）。
　　実機検証で、Tag配下の候補が7件（Jump/参照先/QueryID/QueryTitle/QueryContent/ChatTitle検索/
　　ChatContent検索）となり「外部AI」が消えていること、"t"→"j" で `[:>]` がカーソル `>` の直後
　　（次文字が `]`）に、"t"→"r" で `[:]` がカーソル `:` の直後に挿入されること、通常タグ
　　（"q"→"b"）は従来どおり `[Bing:]` でカーソルが `:` の直後になることを確認しました。

### A（260813修正・アクションメニューのスタイル統一）：カーソル位置がurl/filepath/tagの場合の
　　アクション選択メニューを、タグ挿入メニューと同じ monaco F1（Quick Input）風スタイルに
　　置き換えました。旧スタイル（中央モーダル、.action-menu-*）は廃止です。
　　- 描画・操作エンジンを src\utils\monacoMenu.ts として共通化しました（MenuNode型 /
　　　showMonacoMenu()）。パネル生成・配置（対象エディタ上端中央、子メニューは右へフライアウト）・
　　　キーボード操作（↑↓／→←／Enter／Esc／先頭一文字）は2系統で完全に共通です。
　　- src\utils\tagInsertMenu.ts は DefaultSearchTag.md の読み込みとツリー構築のみを担い、
　　　描画は monacoMenu に委譲する形にスリム化しました。
　　- アクションメニューは対象アクションを葉ノードに変換して表示します。
　　　ラベル＝アクションのDescription、右端の補助表示＝アクションID末尾（Open等）、
　　　ニーモニック＝その末尾の先頭一文字（例：Open→"O"）。タイトルは
　　　「URL アクション: {text}」「パス アクション: {text}」「タグ({subTag}) アクション: {text}」。
　　　決定するとそのActionIDを TTActions.Execute() で実行し、結果を item.Result に伝播します
　　　（非同期アクションも await します）。キャンセル時は「メニューの選択をキャンセルしました」。
　　- 不要になった src\utils\actionMenu.ts を削除し、index.css の .action-menu-* と、
　　　そこでのみ使われていた @keyframes fadeIn / scaleIn も削除しました。
　　　CSSクラスは2系統共用のため .tag-menu-* → .tt-menu-* に改名しています。
　　実機検証で、URL上では「URL アクション: https://example.com/foo」、タグ上では
　　「タグ(WebSearch) アクション: [Google:テスト]」のタイトルで新スタイルのパネルが出ること
　　（旧 action-menu-overlay は生成されない）、背景・境界線・角丸・選択行の色・幅・エディタ中央
　　配置がタグ挿入メニューと一致すること、"o" で決定すると WebSearch アクションが実行され
　　（window.openをスタブして確認）item.Result が「WebSearch [Google:テスト] を開きました」に
　　なること、Escでキャンセルできること、タグ挿入側（"t"→"j" で `[:>]`）に回帰がないことを
　　確認しました。
## Action：　260630　TextEditor.CurrentEditor.DoOnCursorPos:Url:Open
description:    カーソル位置のURLをブラウザで開く
key:            TextEditor.CurrentEditor.DoOnCursorPos:Url:Open
　CursorPos位置が、urlを表す部分であれば、ブラウザで対象のURLを開いてください。
## Action：　260630　TextEditor.CurrentEditor.DoOnCursorPos:File:Open
description:    カーソル位置のファイルパスをOS既定アプリで開く
key:            TextEditor.CurrentEditor.DoOnCursorPos:File:Open
　CursorPos位置が、filepathを表す部分であれば、サーバーAPI(/api/system/open)を経由し、OSの規定のアプリでローカルファイル/フォルダを起動してください。
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:WebSearch:Open
description:    カーソル位置のWebSearchタグでWeb検索する
key:            TextEditor.CurrentEditor.DoOnCursorPos:WebSearch:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:GoogleRoute:Open
description:    カーソル位置のGoogleRouteタグでGoogleマップのルートを開く
key:            TextEditor.CurrentEditor.DoOnCursorPos:GoogleRoute:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:YahooTransfer:Open
description:    カーソル位置のYahooTransferタグでYahoo!乗換案内を開く
key:            TextEditor.CurrentEditor.DoOnCursorPos:YahooTransfer:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Think:Open
description:    カーソル位置のThinkタグで対象Thinkを開く、またはタイトル・コンテンツ検索する
key:            TextEditor.CurrentEditor.DoOnCursorPos:Think:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Mail:Open
description:    カーソル位置のMailタグでメールを開く、またはメール検索する
key:            TextEditor.CurrentEditor.DoOnCursorPos:Mail:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Chat:Open
description:    カーソル位置のChatタグでThink一覧をchatフィルター検索する
key:            TextEditor.CurrentEditor.DoOnCursorPos:Chat:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:AI:Open
description:    カーソル位置のAIタグで外部AIに問い合わせる
key:            TextEditor.CurrentEditor.DoOnCursorPos:AI:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Anchor:Open
description:    カーソル位置のAnchorタグでファイル内アンカーへ移動、またはHighlighter設定する
key:            TextEditor.CurrentEditor.DoOnCursorPos:Anchor:Open
## Action：　260630　TextEditor.CurrentEditor.DoOnCursorPos
description:    カーソル位置がURL/パス/タグであれば対応するOpenアクションへ分岐実行する
key:            TextEditor.CurrentEditor.DoOnCursorPos
　CursorPos位置が、url, filepath, tag のいずれかを表す部分であれば、下記のそれぞれについて実行してください。
　url:      TextEditor.CurrentEditor.DoOnCursorPos:Url:Open　を実施
　filepath: TextEditor.CurrentEditor.DoOnCursorPos:File:Open　を実施
　tag:      TextEditor.CurrentEditor.DoOnCursorPos:Tag:Open　を実施
　※ダブルクリック（Left2）起動時などの状態更新ズレ（一回前のリンクが起動する問題）をエディタ同期関数（syncTextOnCursor）の導入により修正完了。
## Status：　260629　TextEditor.CurrentEditor.TextOnCursorPos
description:    現在のエディタのカーソル位置のテキスト（URL、ファイルパス、タグなど）
key:            TextEditor.CurrentEditor.TextOnCursorPos
current:        
default:        
type:           string
candidates:     .*



# TextEditor Find/Replace ========================================================================================
## Action：　260716　TextEditor.CurrentEditor.ShowFind
description:    検索ダイアログを表示/非表示トグルする
key:            TextEditor.CurrentEditor.ShowFind
　↓検索ダイアログボックスが表示されている場合は非表示にする　→終了
　↓monacoeditorのdefaultの検索ダイアログボックスを表示してフォーカスする
## Action：　260716　TextEditor.CurrentEditor.ShowReplace
description:    置換ダイアログを表示/非表示トグルする
key:            TextEditor.CurrentEditor.ShowReplace
　↓置換ダイアログボックスが表示されている場合は非表示にする　→終了
　↓monacoeditorのdefaultの置換ダイアログボックスを表示してフォーカスする

　A：monaco既定のアクション（actions.find / editor.action.startFindReplaceAction）を
　　そのまま実行しています。ダイアログを開いた直後に、保存済みの検索・置換オプション
　　（下記Status）をウィジェットへ反映します。
　　※プレビュー実行環境では、monaco既定のCtrl+H等を直接押した場合と同様に、ダイアログの
　　表示は行われるもののフォーカス移動が働かないことを確認しています（monaco側のrAF依存の
　　フォーカス処理が環境要因で効かないためで、本アクション固有の問題ではありません）。

　A（260716追記）：表示中のダイアログを非表示にするトグル動作を追加しました。
　　- ShowFind：置換行を伴わない検索ダイアログが表示中（isRevealed かつ !isReplaceRevealed）
　　　であれば closeFindWidget() で閉じて終了します。
　　- ShowReplace：置換行を伴う置換ダイアログが表示中（isRevealed かつ isReplaceRevealed）
　　　であれば同様に閉じて終了します。
　　検索のみ表示中に ShowReplace を押すと置換行を追加して展開し、置換表示中に ShowFind を
　　押しても閉じません（monaco既定の actions.find の挙動に委ねています）。
## Action：　260715　TextEditor.FindOption.MatchCase:Toggle
description:    検索オプション「大文字小文字を区別」をトグルする
key:            TextEditor.FindOption.MatchCase:Toggle
　検索オプションの値を変更する
## Action：　260715　TextEditor.FindOption.MatchWholeWord:Toggle
description:    検索オプション「単語単位で検索」をトグルする
key:            TextEditor.FindOption.MatchWholeWord:Toggle
　検索オプションの値を変更する
## Action：　260715　TextEditor.FindOption.UseRexp:Toggle
description:    検索オプション「正規表現」をトグルする
key:            TextEditor.FindOption.UseRexp:Toggle
　検索オプションの値を変更する
## Action：　260715　TextEditor.ReplaceOption.PreserveCase:Toggle
description:    置換オプション「大文字小文字を保持」をトグルする
key:            TextEditor.ReplaceOption.PreserveCase:Toggle
　置換オプションの値を変更する

　A：値は WorkoutPanel.TextEditor.FindOption / ReplaceOption に永続化されます。
　　検索/置換ダイアログが表示中の場合は、トグルと同時に開いているダイアログのチェック
　　ボックス状態にも即座に反映されます。
## Status：　260715　TextEditor.FindOption.MatchCase
　検索オプションの値
## Status：　260715　TextEditor.FindOption.MatchWholeWord
　検索オプションの値
## Status：　260715　TextEditor.FindOption.UseRexp
　検索オプションの値
## Status：　260715　TextEditor.ReplaceOption.PreserveCase
　置換オプションの値

# TextEditor Cursor Highlighter ====================================================================================
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevHighlighter
description:    Highlighter検索の前のヒットへ移動する
key:            TextEditor.CurrentEditor.CursorPos:PrevHighlighter
　↓ Highlighterに設定されたテキストを検索して前のヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextHighlighter
description:    Highlighter検索の次のヒットへ移動する
key:            TextEditor.CurrentEditor.CursorPos:NextHighlighter
　↓ Highlighterに設定されたテキストを検索して次のヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する
## Action：　260714　TextEditor.CurrentEditor.CursorPos:FirstHighlighter
description:    Highlighter検索の先頭ヒットへ移動する
key:            TextEditor.CurrentEditor.CursorPos:FirstHighlighter
　↓ Highlighterに設定されたテキストを検索して先頭ヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する
## Action：　260714　TextEditor.CurrentEditor.CursorPos:LastHighlighter
description:    Highlighter検索の末尾ヒットへ移動する
key:            TextEditor.CurrentEditor.CursorPos:LastHighlighter
　↓ Highlighterに設定されたテキストを検索して末尾ヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する

　A：検索語は ToolBar.HighlighterMode.Text（= WorkoutPanel.HighlightWord）を、
　　ハイライト表示と同じ規則でカンマ・空白区切りに分解し、OR条件（大文字小文字を区別）で検索します。
　　ヒット位置の先頭にカーソルを移動し、画面外なら中央にスクロールします。
　　Prev/Next は循環しません（端では移動せず「これ以上ヒットなし」）。
　　キー割当（docs\DefaultShortcut.md）: Ctrl+Shift+P/N = Prev/Next、Ctrl+Alt+P/N = First/Last
## Action：　260715　ToolBar.HighlighterMode.Text:AddSelected
description:    選択テキストをHighlighter検索語に追加する
key:            ToolBar.HighlighterMode.Text:AddSelected
FocusedPaneの選択テキストの内容をToolBar.HighlighterMode.TextにCSV形式で追加する。
## Action：　260715　ToolBar.HighlighterMode.Text:Clear
description:    Highlighter検索語をクリアする
key:            ToolBar.HighlighterMode.Text:Clear
ToolBar.HighlighterMode.Textをクリアする
## Action：　260715　ToolBar.HighlighterMode.Text:Unfocus
description:    Highlighter入力欄から直前のフォーカス位置に戻る
key:            ToolBar.HighlighterMode.Text:Unfocus
ToolBar.HighlighterMode.Text:Focusで記憶した直前のFocus位置に戻る。
## Action：　260715　ToolBar.HighlighterMode.Text:Focus
description:    Highlighter入力欄にフォーカスする
key:            ToolBar.HighlighterMode.Text:Focus
ToolBar.HighlighterMode.Textに文字入力するためにFocusする。その際、直前のFocus位置を記憶する。

　A：4アクションとも TTFocusedPanelActions に実装しました。
　　- AddSelected: FocusedPaneの選択テキスト（改行を含む場合は1行目）をカンマ区切りのグループとして追加。既存と重複する場合は追加しない。
　　- Clear: ToolBar.HighlighterMode.Text（= WorkoutPanel.HighlightWord）を空にする。
　　- Focus: 直前のフォーカス要素を記憶し、ToolBarをHighlighterモードに切り替えて入力欄（#StatusBarTextInput）にフォーカス。
　　- Unfocus: 入力欄のフォーカスを外し、Focusで記憶した要素へ戻す。
　　キー割当（docs\DefaultShortcut.md）: Alt+H=AddSelected、Shift+Alt+H=Clear、Ctrl+Shift+H=Focus、（Highlighter入力欄で）Escape=Unfocus

# TextEditor Cursor ================================================================================================
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevChar
description:    カーソルを1文字前に移動する
key:            TextEditor.CurrentEditor.CursorPos:PrevChar
　↓ カーソルを１文字前に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextChar
description:    カーソルを1文字後に移動する
key:            TextEditor.CurrentEditor.CursorPos:NextChar
　↓ カーソルを１文字後に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevWord
description:    カーソルを1ワード前に移動する
key:            TextEditor.CurrentEditor.CursorPos:PrevWord
　↓ カーソルを１ワード前に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextWord
description:    カーソルを1ワード後に移動する
key:            TextEditor.CurrentEditor.CursorPos:NextWord
　↓ カーソルを１ワード後に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevLine
description:    カーソルを1行前に移動する（文書先頭行では行頭へ）
key:            TextEditor.CurrentEditor.CursorPos:PrevLine
　↓ CurPosが文書先頭行だった場合　→　カーソルを先頭行行頭に移動する　→　終了
　↓ monaco editor defaultのArrowUpの移動位置に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextLine
description:    カーソルを1行後に移動する（文書最終行では末尾へ）
key:            TextEditor.CurrentEditor.CursorPos:NextLine
　↓ CurPosが文書最終行だった場合　→　カーソルを最終行末尾に移動する　→　終了
　↓ monaco editor defaultのArrowDownの移動位置に移動する　→　終了

　A：独自のカラム計算をやめ、Monaco既定コマンド（cursorUp / cursorDown）に委譲しました。
　　これにより折り畳み行のスキップ・折り返し行・カラムのスティッキー復元が既定どおりになります。
## Action：　260628　TextEditor.CurrentEditor.CursorPos:LineStart+
description:    カーソルを行頭→テキスト先頭の順に移動する。テキスト先頭では全選択する
key:            TextEditor.CurrentEditor.CursorPos:LineStart+
　↓ CurPosが行先頭ではない場合、CurPosを現在行の先頭位置に移動する　→　終了
　↓ CurPosが行先頭だがテキスト先頭ではない場合、CurPosをテキスト先頭位置に移動する　→　終了
　↓ CurPosがテキスト先頭の場合、カーソルがテキスト先頭にある状態でテキストすべてを選択する
## Action：　260628　TextEditor.CurrentEditor.CursorPos:LineEnd+
description:    カーソルを行末→テキスト末尾の順に移動する。テキスト末尾では全選択する
key:            TextEditor.CurrentEditor.CursorPos:LineEnd+
　↓ CurPosが行末尾ではない場合、CurPosを行末尾位置に移動する　→　終了
　↓ CurPosが行末尾だがテキスト末尾ではない場合、CurPosをテキスト末尾位置に移動する　→　終了
　↓ CurPosがテキスト末尾の場合、テキストすべてを選択する
## Status：　260629　TextEditor.CurrentEditor.CursorPos
description:    現在のエディタのカーソルのOffset位置
key:            TextEditor.CurrentEditor.CursorPos
current:        0
default:        0
type:           string
candidates:      .*


# TextEditor Heading ===============================================================================================
## Action：　260622　TextEditor.CurrentFolding.Heading:OpenStepwise
description:    見出し行を段階的に開く（Close→Open、Open→子をOpen）
key:            TextEditor.CurrentFolding.Heading:OpenStepwise
　以下の手順を実装してください。
　↓　現カーソルがあるHeading行がCloseである場合は、Heading行をOpenにして終了します。
　↓　現カーソルがあるHeading行がOpenである場合、子Heading行をすべて抽出し、自Heading行や孫Heading行が含まれないことを確認し、抽出した子HeadingのすべてをOpenにして終了します
## Action：　260622　TextEditor.CurrentFolding.Heading:CloseStepwise
description:    見出し行を段階的に閉じる（Open→Close、Close→兄弟をClose）
key:            TextEditor.CurrentFolding.Heading:CloseStepwise
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

## Action：　260826　TextEditor.CurrentFolding.Heading:Parent
　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　親Heading行へ移動して終了

　A（260826実装）：views/actions/textEditorHeadingNavActions.ts の
　　registerTextEditorHeadingNavActions に9番目のアクションとして追加しました。
　　既存のSiblingFirst/SiblingLastと同じ流儀で、カーソル位置が属するHeading(h)の
　　headingNumberから親のheadingNumber（末尾セグメントを除いたもの）を求め、一致する
　　Headingへ移動します。ルートレベル(Level1)や親が見つからない場合は「親見出しなし」を
　　返します。
## Action：　260826　TextEditor.CurrentFolding.Heading:SiblingNext
　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　次の兄弟Heading行に移動（次の兄弟Heading行が存在しない場合は、移動しません。）

　A（260826実装）：views/actions/textEditorHeadingNavActions.ts の
　　registerTextEditorHeadingNavActions に10番目のアクションとして追加しました。
　　既存のParentアクションと同じ流儀で、カーソル位置が属するHeading(h)のheadingNumberから
　　親のheadingNumber（末尾セグメントを除いたもの）を求め、同じ親を持ち・同レベルで・
　　h自身より後方（offsetが大きい）にある最初のHeadingへ移動します。旧
　　SiblingForward（260827廃止）と異なり、カーソルがHeading行自体にあるかどうかで挙動を分けず、
　　常に直接「次の兄弟」へ移動する単純な一手順です。次の兄弟が存在しない場合は
　　「次の兄弟見出しなし」を返すのみで、カーソルは移動しません。
## Action：　260826　TextEditor.CurrentFolding.Heading:SiblingPrev
　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　前の兄弟Heading行に移動（前の兄弟Heading行が存在しない場合は、移動しません。）

　A（260826実装）：SiblingNextと同じ textEditorHeadingNavActions.ts に11番目のアクションとして
　　追加しました。同じ親・同レベルで、h自身より前方（offsetが小さい）にある直近のHeadingへ
　　移動する点以外はSiblingNextと共通のロジックです。前の兄弟が存在しない場合は
　　「前の兄弟見出しなし」を返すのみで、カーソルは移動しません。
## Action：　260626　TextEditor.CurrentFolding.Heading:SiblingFirst
description:    最初の兄弟見出し行へ移動する
key:            TextEditor.CurrentFolding.Heading:SiblingFirst

　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　現在位置が兄弟Heading行のなかで１番目である場合、親Heading行へ移動
　↓　１番目の兄弟Heading行に移動
## Action：　260626　TextEditor.CurrentFolding.Heading:SiblingLast
description:    最後の兄弟見出し行へ移動する
key:            TextEditor.CurrentFolding.Heading:SiblingLast

　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　現在位置が兄弟Heading行のなかで最後である場合、親Heading行の次の兄弟Heading行へ移動
　↓　最後の兄弟Heading行に移動
## Action：　260621　TextEditor.CurrentFolding.Heading:VisibleNext
description:    次の表示中見出し行へ移動する（非表示の見出しは除外）
key:            TextEditor.CurrentFolding.Heading:VisibleNext
　親HeadingのCloseによって非表示のHeadingには移動しません。すべての親Headingが表示されているHeadingにのみ移動するように修正してください。　
　（260827：ActionIDを VisibleForward から VisibleNext に変更。処理内容の変更はありません。）
## Action：　260621　TextEditor.CurrentFolding.Heading:VisiblePrev
description:    前の表示中見出し行へ移動する（非表示の見出しは除外）
key:            TextEditor.CurrentFolding.Heading:VisiblePrev
　親HeadingのCloseによって非表示のHeadingには移動しません。すべての親Headingが表示されているHeadingにのみ移動するように修正してください。　
　（260827：ActionIDを VisibleBackward から VisiblePrev に変更。処理内容の変更はありません。）

## Action：　260826　TextEditor.CurrentEditor.Folding:OpenAll
　以下の手順を実装してください。
　↓　全Heading行をOpenにして終了します。

　A（260826実装）：textEditorCurrentFoldingActions.ts に実装しました。
　　Monaco標準の editor.unfoldAll をそのまま起動し、Heading行に限らずコードブロック等の
　　折畳領域も含めてすべて展開します。
## Action：　260826　TextEditor.CurrentEditor.Folding:CloseAll
　以下の手順を実装してください。
　↓　現カーソル行を、最上位の親Heading行に移動します。
　↓　全Heading行をCloseにして終了します。

　A（260826実装）：textEditorCurrentFoldingActions.ts に実装しました。
　　現カーソル位置以前でレベル1の直近のHeadingを探索し、見つかればそこへ移動した上で
　　（見出しが1つも無い場合は移動をスキップ）、Monaco標準の editor.foldAll を起動します。
　　（260826修正：ActionIDを OpenClose から CloseAll に変更。処理内容の変更はありません。）
## Action：　260826　TextEditor.CurrentEditor.Folding:OpenLv2
　以下の手順を実装してください。
　↓　現カーソル行が所属するHeading行のレベル(#の数)を確認します。
　↓　レベルが 3以上の場合、レベル3の親Heading行に移動します。
　↓　Heading行を上から走査し、Level1,Level2のHeading行はOpenに、Level3以上のHeading行をCloseにして終了します。
　↓　ただし、子Heading行を一つも持たないHeading行は、レベルに関わらずCloseとします。

　A（260826実装）：views/actions/textEditorCurrentFoldingActions.ts に新規登録しました。
　　現カーソル位置が属する直近のHeading（自身含む）を取得し、そのレベルが3以上の場合のみ、
　　同オフセット以前でレベル3以下の直近のHeadingを祖先として探索してそこへカーソルを移動します
　　（レベル2以下しか存在しない場合は移動しません＝条件を満たさないため）。
　　その後、全Headingを走査してLevel1,2をeditor.unfold、Level3以上をeditor.foldで一括適用します。

　Q（260826・1回目）：OpenLv1とOpenLv2が正しく動きませんでした。
　A：2点の不具合がありました。
　　(1) Monacoの 'editor.fold'/'editor.unfold' コマンド（selectionLines指定）は、対象行自身の
　　　fold領域が既に目的の状態のとき「まだ目的の状態でない最初の祖先」へ処理対象をすり替える
　　　仕様（VSCodeの単一カーソル位置向けの挙動）を持つため、複数見出し行を一括で特定の開閉
　　　状態に揃えたい本用途では、既に閉じている子Heading（Level3等）の存在に引きずられて、
　　　開いたままにしたい祖先Heading（Level1,2等）まで誤って畳んでしまうことがありました
　　　（例：全Heading Close状態からOpenLv1を実行すると、Level2以上を畳む際の処理が
　　　Level1まで誤って畳んでしまうケースがある）。foldingModelを直接操作し、Heading行ごとに
　　　「自分自身のfold領域」のisCollapsedのみを見て目的の状態と異なるものだけをtoggleする
　　　方式に変更し解消しました。
　　(2) カーソル退避の判定条件が、OpenLv2/OpenLv1共通で「レベル3以上」に固定されていました。
　　　OpenLv1（Level2以上をClose）の場合、レベル2の本文（Level2見出し配下・Level3未満）に
　　　カーソルがあると退避条件を満たさず、Level2が閉じられた後カーソルが非表示領域に
　　　取り残されていました。退避条件の閾値を各アクションの対象レベル（OpenLv2は3、
　　　OpenLv1は2）に合わせて修正しました。
　　実機検証（Vite+Expressのdevサーバー）で、全Close状態からのOpenLv2/OpenLv1、
　　OpenLv1結果からのOpenLv2、Level2本文からのOpenLv1でのカーソル退避、いずれも
　　仕様どおりの開閉状態・カーソル位置になることを確認しました。

　Q（260826・2回目）：子Heading行がひとつもない親Heading行はCloseとするよう修正してください。
　A：setFoldStateByLevel()に、対象Heading行の直後（headings配列上の次要素）が自身より
　　深いレベルかどうかで子Headingの有無を判定するロジックを追加しました。子が無い場合は
　　レベルに関わらずdesiredCollapsed=trueとし、Level1やLevel2であっても強制的にCloseと
　　なるようにしました（子を持つHeadingは従来どおりレベル判定でOpen/Close）。
　　実機検証で、子ありLevel1/Level2はOpen、子なしLevel1/Level2はレベルに関わらずClose、
　　Level3以上は常にCloseとなることを確認しました。
## Action：　260826　TextEditor.CurrentEditor.Folding:OpenLv1
　以下の手順を実装してください。
　↓　現カーソル行が所属するHeading行のレベル(#の数)を確認します。
　↓　レベルが 2以上の場合、レベル2の親Heading行に移動します。
　↓　Heading行を上から走査し、Level1のHeading行はOpenに、Level2以上のHeading行をCloseにして終了します。
　↓　ただし、子Heading行を一つも持たないHeading行は、レベルに関わらずCloseとします。

　A（260826実装）：OpenLv2と同じ textEditorCurrentFoldingActions.ts に実装しました。
　　移動先レベルを2にした点以外はOpenLv2と共通ロジック（moveOutOfClosingScopeTo /
　　setFoldStateByLevel）を再利用しているため、OpenLv2側に記載した2件の不具合修正
　　（foldコマンドのすり替え仕様対策、カーソル退避閾値の修正）と、子Heading行の
　　有無によるCloseオーバーライドは、いずれも本アクションにも同様に適用されています。


# TextEditor ExOpt =================================================================================================
## Action：　260619　TextEditor.LineNumbers.IsVisible:Toggle
description:    行番号表示をトグルする
key:            TextEditor.LineNumbers.IsVisible:Toggle
## Action：　260619　TextEditor.WordWrap.IsVisible:Toggle
description:    折り返し表示をトグルする
key:            TextEditor.WordWrap.IsVisible:Toggle
## Action：　260619　TextEditor.Minimap.IsVisible:Toggle
description:    ミニマップ表示をトグルする
key:            TextEditor.Minimap.IsVisible:Toggle
## Action：　260619　TextEditor.FullWidthSpace.IsVisible:Toggle
description:    全角スペース強調表示をトグルする
key:            TextEditor.FullWidthSpace.IsVisible:Toggle
## Action：　260619　TextEditor.UnicodeHighlight.IsVisible:Toggle
description:    Unicode文字強調表示をトグルする
key:            TextEditor.UnicodeHighlight.IsVisible:Toggle
## Action：　260619　TextEditor.BracketPairColorization.IsVisible:Toggle
description:    括弧の色分けをトグルする
key:            TextEditor.BracketPairColorization.IsVisible:Toggle

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


# TextEditor Settings ===============================================================================================
## Action：　260905　TextEditor.KeyBinding.Load
description:    Vault内の「ThinktankKeyBinding」という名前のMemoを読み込み、キー設定を上書きする
key:            TextEditor.KeyBinding.Load
　Workout>TextEditor設定>設定>キー設定のStarアイコンボタンから実行する。
　Vault内でタイトルが「ThinktankKeyBinding」（大文字小文字不問）のMemoを検索し、見つかればその内容
　（docs/DefaultShortcut.md と同じテーブル形式）でショートカット設定を実行中のみ上書きする（見つからない
　場合は何もしない）。TTShortcutManager はUndo/Redoの対象外のため、この変更もUndo対象外。
　アプリ再起動時には反映されない（起動時は常に docs/DefaultShortcut.md を読み込む）。
## Action：　260905　TextEditor.KeyBinding.Reset
description:    キー設定をDefaultの状態に戻す
key:            TextEditor.KeyBinding.Reset
　Workout>TextEditor設定>設定>キー設定のPowerアイコンボタンから実行する。
　docs/DefaultShortcut.md の内容でショートカット設定を初期状態に戻す。
## Action：　260905　TextEditor.ColorBinding.Load
description:    Vault内の「ThinktankColorBinding」という名前のMemoを読み込み、色設定を上書きする
key:            TextEditor.ColorBinding.Load
　Workout>TextEditor設定>設定>Color設定のStarアイコンボタンから実行する。
　Vault内でタイトルが「ThinktankColorBinding」（大文字小文字不問）のMemoを検索し、見つかればその内容
　（docs/DefaultColor.md と同じCSV形式：StatusID, Color, BgColor, Attrs）で色設定を上書きする
　（見つからない場合は何もしない）。TTUIStateManager.applyProperties() を pushUndo=false で呼ぶため、
　Undoスタックへの記録は行わない。localStorage / __tt_ui_state__ には反映されるため、次回起動後も残る。
## Action：　260905　TextEditor.ColorBinding.Reset
description:    色設定をDefaultの状態に戻す
key:            TextEditor.ColorBinding.Reset
　Workout>TextEditor設定>設定>Color設定のPowerアイコンボタンから実行する。
　docs/DefaultColor.md の内容で色設定を初期状態に戻す。Load同様、Undoスタックへの記録は行わない。


# TextEditor ExDate ================================================================================================
## Action：　260625　TextEditor.EditDate.InsertExDate
description:    カーソル位置に日付文字を挿入しExDateモードに入る
key:            TextEditor.EditDate.InsertExDate
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
description:    カーソル位置の日時フォーマットを変更する
key:            TextEditor.EditDate.ChangeFormat
    カーソル位置の日時フォーマットを変更する。
    変更の順番は過去のスクリプト docs\reference\script\TTPanel.ps1 を参照
## Action：　260625　TextEditor.EditDate.ToggleWeekday
description:    カーソル位置の曜日表示を変更する
key:            TextEditor.EditDate.ToggleWeekday
    カーソル位置の曜日表示を変更する
## Action：　260625　TextEditor.EditDate.ToggleTime
description:    カーソル位置の時間表示を変更する
key:            TextEditor.EditDate.ToggleTime
    カーソル位置の時間表示を変更する
## Action：　260625　TextEditor.EditDate.IncYear
description:    カーソル位置の年を1増やす
key:            TextEditor.EditDate.IncYear
    カーソル位置の年を1増やす
## Action：　260625　TextEditor.EditDate.DecYear
description:    カーソル位置の年を1減らす
key:            TextEditor.EditDate.DecYear
    カーソル位置の年を1減らす
## Action：　260625　TextEditor.EditDate.IncMonth
description:    カーソル位置の月を1増やす
key:            TextEditor.EditDate.IncMonth
    カーソル位置の月を1増やす
## Action：　260625　TextEditor.EditDate.DecMonth
description:    カーソル位置の月を1減らす
key:            TextEditor.EditDate.DecMonth
    カーソル位置の月を1減らす
## Action：　260625　TextEditor.EditDate.IncWeek
description:    カーソル位置の週を1増やす
key:            TextEditor.EditDate.IncWeek
    カーソル位置の週を1増やす
## Action：　260625　TextEditor.EditDate.DecWeek
description:    カーソル位置の週を1減らす
key:            TextEditor.EditDate.DecWeek
    カーソル位置の週を1減らす
## Action：　260625　TextEditor.EditDate.IncDay
description:    カーソル位置の日を1増やす
key:            TextEditor.EditDate.IncDay
    カーソル位置の日を1増やす
## Action：　260625　TextEditor.EditDate.DecDay
description:    カーソル位置の日を1減らす
key:            TextEditor.EditDate.DecDay
    カーソル位置の日を1減らす
## Action：　260625　TextEditor.EditDate.SetNow
description:    カーソル位置の日時を今にする
key:            TextEditor.EditDate.SetNow
    カーソル位置の日時を今にする　
## Action：　260625　TextEditor.EditDate.Reset
description:    カーソル位置の日時を元に戻す
key:            TextEditor.EditDate.Reset
    カーソル位置の日時を元に戻す　

# その他
## AI Chatの運用の仕方１
Thinktank>Chat では 問題解決の template, skelton 作成して、Overviewでパッケージ化して、workoutで内容書いて、ReThinkで回答を得るパターンがありえそうですね

## AI Chatの運用の仕方２
Thinktank>Chat で既存のlinksファイルを Referenceしながら概要を捉え、


## 完了：その他：タグ
TextEditor.CurrentEditor.TextOnCursorPos にはカーソル位置で取得されたアクション用の Tag が設定されますが、
そのTagのアクションについて以下のように分類しなおして、各subTag毎でアクションを再定義することを考えています。
各subTagの例示において、大文字はタグ文字（ただし運用は大文字小文字混和可)、小文字はパラメータ文字です。
1. Tag.WebSearch:       docs\DefaultSearchTag.mdで定義済みの WebSearch 用タグ
2. Tag.GoogleRoute:     GoogleMapでplace1,2,3...を通るルートを表示するためのタグ        例：[GOOGLEROUTE:plasce1,place2,place3...]
3. Tag.YahooTransfer:   Yahoo乗換案内で電車を検索するためのタグ                         パラメータは "key value" 形式のCSV（key: from/to/dep/arr/via、viaは省略可、dep/arrはhh:mm形式、dep優先）
                        例：[YAHOOTRANSFER:from 東京駅,to 大阪駅,via 名古屋駅,dep 10:00]
4. Tag.Think:           4.1 特定thinkファイルを指定するためのタグ                       例：[THINK:id] [MEMO:id](前方互換用)
                        4.2 Thinktank>Think一覧のタイトル絞込でkeywordsを検索するタグ   例：[THINK:keywords] [MEMO:keywords](前方互換用)
                        4.3 Thinktank>Think一覧のコンテンツ絞込でkeywordsを検索するタグ 例：[THINK:>keywords] [MEMO:>keyword](前方互換用)
5. Tag.Mail             5.1 特定mailを指定するタグ                                      例：[MAIL]:ID]（アクション未実装）
                        5.2 mail検索をするためのタグ                                    例：[MAIL]:keywords]（アクション未実装）
6. Tag.Chat             6.1 Thinktank>Think一覧でタイトル絞込みでkeywords検索するタグ(chatフィルター付)   例：[CHAT:keywords]
7. Tag.AI              外部AI(ai:GEMINI,CLAUDE,CHATGTP)へ接続し、sentenceで問い合わせるためのタグ        例：[ai:>] sentence
8. Tag.Anchor           8.1 ファイル内で[:anchor]で始まる行に飛ぶためのタグ             例：[:>anchor]
                        8.2 anchorテキストをHighlighterとして設定するためのタグ         例：[:anchor]
本方針を踏まえて、TextEditor.CurrentEditor.DoOnCursorPos:Tag:Open は廃止する代わりに、
各TextEditor.CurrentEditor.DoOnCursorPos:{subTag}:Open を作成します。
TextEditor.CurrentEditor.TextOnCursorPosは正しい{subTag}値になるよう修正してください。
TextEditor.CurrentEditor.DoOnCursorPosは上記の例示を参考に、各TextEditor.CurrentEditor.DoOnCursorPos:{subTag}:Openへと正しく分岐するように修正してください。

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

<!--  -->