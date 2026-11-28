# ToolBar ==========================================================================================================
## Action：　260616　ToolBar.Mode.Name:Next
description:    ToolBarのモードを次の値に切り替える（循環）
　ToolBar.Mode.Nameの設定値を次の値にする。値は循環式。
## Action：　260616　ToolBar.Mode.Name:Prev
description:    ToolBarのモードを前の値に切り替える（循環）
　ToolBar.Mode.Nameの設定値を前の値にする。値は循環式。
## Status：　260613　ToolBar.Mode.Name

description:    ToolBarのモード
key:            ToolBar.Mode.Name
current:        KeyAction
default:        KeyAction
type:           string
candidates:     ^(Status|Highlighter|KeyAction|Command|Search|Reminder|Copyright)$

　Q：設定値を記載してください。
　A：設定可能な値は以下の7つです。
　　- Status （ステータス）
　　- Highlighter （ハイライター）
　　- KeyAction （キーアクション）
　　- Command （コマンド）
　　- Search （キーワード検索）
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
## Status：　260625　ToolBar.ReminderMode.Text
description:    リマインダーの入力テキスト
key:            ToolBar.ReminderMode.Text
current:        
default:        
type:           string
candidates:     .*


## Status：　260625　ToolBar.SearchMode.Text
description:    キーワード検索の入力テキスト
key:            ToolBar.SearchMode.Text
current:        
default:        
type:           string
candidates:     .*

　（261013）ToolBar の Translate（翻訳）モードを Search（キーワード検索）モードに改めました。
　　- モード名 Translate → Search（ToolBar.Mode.Name）、フォーカス名 ToolBar.Translate → ToolBar.Search
　　- StatusID・ActionID の ToolBar.TranslateMode.Text* → ToolBar.SearchMode.Text*
　　- タブのアイコンは虫眼鏡、入力欄のプレースホルダーは「Keyword...」
　　保存済みの旧名（ToolBar.TranslateMode.Text*、ToolBar.Mode.Name の Translate）は読込時に新しい名前へ読み替えます。
　　ThinktankKeyBinding メモに旧名で書き戻したショートカットは読み替えないので、書き直しが必要です。
## Action：　261013　ToolBar.SearchMode.Text:Unfocus
description:    ToolBarのキーワード検索入力欄から元の位置に戻る
　ToolBarのキーワード検索入力欄から元の位置に戻る
## Action：　261013　ToolBar.SearchMode.Text:Focus
description:    ToolBarのキーワード検索入力欄にフォーカスする
　ToolBarのキーワード検索入力欄にフォーカスする
## Action：　261013　ToolBar.SearchMode.Text:Clear
description:    ToolBarのキーワード検索入力欄をクリアする
　ToolBarのキーワード検索入力欄をクリアする
## Action：　261013　ToolBar.SearchMode.Text:SetAndFocus
description:    選択テキストがあればキーワード検索入力欄に設定し、キーワード検索入力欄にフォーカスする
FocusedPaneの選択テキストの内容をToolBar.SearchMode.Textに設定する。

　A（261013実装）：src\views\actions\textEditorHighlighterToolbarActions.ts に登録しました。
　　- 選択テキストは Highlighter の AddSelected と同じく、エディタの選択を優先し、無ければ画面上の選択を使います。
　　- 入力欄は1行のため、選択の改行は空白1つに置き換えます。
　　- 入力欄の内容は選択テキストで置き換えます（既存の入力には追加しません）。
　　- 設定後は ToolBar.SearchMode.Text:Focus を実行してSearch モードに切り替え、入力欄にフォーカスします。
　　 直前のフォーカス位置もこのとき記憶されるので、:Unfocus で元に戻れます。
　　- 選択が無いときは入力欄の内容をそのままにして、フォーカスだけ移します。
　　（261013）当初は ToolBar.SearchMode.Text:AddSelected（既存の入力の末尾に追加）として実装しましたが、
　　　ID を SetSelected に改め、追加ではなく置き換えにしました。さらに ID を SetAndFocus に改め、
　　　選択が無くてもフォーカスするようにしました（それまでは選択が無いと何もしませんでした）。
　　キー割当（docs\DefaultShortcut.md）: *TextEditor で Alt+F。
## Status：　261013　ToolBar.SearchMode.Text:SearchID
docs\DefaultSearchTag.mdに登録されている検索サイトの「ID」。
description:    入力文字の検索サイトID
key:            ToolBar.SearchMode.Text:SearchID
current:        
default:        Google
type:           string
candidates:     .*

　A（261013実装）：TTWorkingPanel.SearchSiteID（既定 Google）を実体とし、
　　src\views\settings\toolbarSpecs.ts に Status として登録しました。
　　空にした場合は Google に戻します（current が空のまま起動時に読み込まれても検索先が無くならないように）。
　（261013）ToolBar の Search モードでは、入力欄の左にこの値を表示します
　　（見た目は KeyAction モードの FOCUS の値と同じ。src\components\Layout\ApplicationStatusBarArea.tsx）。
## Action：　261013　ToolBar.SearchMode.Text:ShowMenu
「Keyword検索」がタイトルのMenuを表示しIDを取得し、ToolBar.SearchMode.Text:SearchIDに設定後、ToolBar.SearchMode.Text:Searchを実行する
description:    検索サイトをメニューから選んでToolBar.SearchMode.Text:SearchIDに設定し、検索する

　A（261013実装）：docs\DefaultMenu.md の「Keyword検索」メニューを showDefaultMenu で表示し、
　　選んだ ID を SearchID に設定してから :Search を実行します。Esc などで閉じた場合は SearchID を変えません。
　　メニューは ToolBar の入力欄を基準に表示します。入力欄が画面の下端にあり、メニューが画面外へ
　　はみ出していたため、src\utils\monacoMenu.ts でメニューの高さぶん上へずらして画面内に収めるようにしました
　　（他のメニューでも、下端近くで開いたときは同じように収まります）。
## Action：　261013　ToolBar.SearchMode.Text:Search
docs\DefaultSearchTag.mdからSearchIDに応じたURLを取得し、URLの"{0}"をToolBar.SearchMode.Textで置換し、外部ブラウザで開く
description:    入力テキストを検索する

　A（261013実装）：src\views\actions\textEditorHighlighterToolbarActions.ts に登録しました。
　　- URL テンプレートは [ID:語] タグ（DoOnCursorPos:WebSearch:Open）と同じものを使います
　　 （ThinktankSearchTag メモでの上書きも反映されます）。語は URL エンコードして {0} に入れます。
　　- DefaultSearchTag.md で NoURL の GoogleRoute / YahooTransfer は、タグと同じ書式で URL を組み立てます
　　 （GoogleRoute は「東京駅,大阪駅」、YahooTransfer は「from 東京,to 大阪」）。そのため URL の組み立てを
　　 textEditorCursorContentActions.ts の共通関数（buildGoogleRouteUrl / buildYahooTransferUrl）に移しました。
　　- 入力が空のとき、URL が無い ID のときは開かずに理由を返します。
　　キー割当（docs\DefaultShortcut.md）：ToolBar.Search で Enter（:Search）／Alt+Enter（:ShowMenu）。
　　この2行は exmode 列が抜けていて列がずれていたため、空の exmode 列を補いました。
　　実機で、Enter で Google、Alt+Enter → Q → B で Bing（SearchID も Bing に変わる）、
　　GoogleRoute・YahooTransfer の URL、空入力・未登録 ID の扱いを確認しました。
　　日本語入力の確定中の Enter は確定にだけ使われ、検索は次の Enter で行います。


## Status：　260625　ToolBar.HighlighterMode.Text
description:    ハイライターの入力テキスト
key:            ToolBar.HighlighterMode.Text
current:        
default:        
type:           string
candidates:     .*
## Status：　260906　ToolBar.HighlighterMode.Text:AddContentSearchKeywordFlag
　各パネルの「Think一覧」「AI相談」に設定されているの「コンテンツで絞込み」を実行したときの Keywordを、ToolBar.HighlighterMode.Text に追加するかどうかのフラグです。

　A（260906確認）：260814実装分がコード上に維持されていることを確認しました。
　　TTWorkingPanel.AddContentSearchKeywordFlag（既定true）／TTUIStateManager の Status 登録／
　　src\utils\highlighterKeyword.ts の addContentSearchKeywordToHighlighter()／
　　ThinktankArea・SeedsArea・ThinktankChatMemoPicker からの呼び出しがいずれも現存。変更なし。

description:    コンテンツで絞込みのキーワードをハイライトする
key:            ToolBar.HighlighterMode.Text:AddContentSearchKeywordFlag
current:        'true'
default:        'true'
type:           bool
candidates:     ^(true|false)^$

　A（260814実装）：TTWorkingPanel.AddContentSearchKeywordFlag（既定true）として実体を追加し、
　　TTUIStateManagerにStatusとして登録しました。実行判定は共通ユーティリティ
　　src\utils\highlighterKeyword.ts の addContentSearchKeywordToHighlighter() が担い、
　　既存の「選択テキストをHighlighterへ追加」（AddSelected）と同じグループ重複排除ロジックで
　　ToolBar.HighlighterMode.Text にキーワードを追加します。
　　「実行したとき」= コンテンツ絞り込み欄でEnter確定した瞬間とし、以下3箇所に適用しました。
　　- ThinktankPanel Think一覧（ThinktankArea.tsx handleSearch）
　　- SeedsPanel Think一覧（SeedsArea.tsx handleSearch）
　　- 両パネル共通のAI相談メモピッカー（ThinktankChatMemoPicker.tsx、従来onSearchが
　　　NOOPだったためEnter確定時に追加する処理を新設。ライブ絞り込み自体の挙動は変更なし）
　　実機検証（Vite+Expressのdevサーバー）で、Think一覧のコンテンツ絞り込みEnter確定時に
　　ToolBar.HighlighterMode.Text へキーワードが追加されること、フラグをfalseにすると
　　追加されないことを確認しました。
## Status：　260906　ToolBar.HighlighterMode.Text:AddTitleSearchKeywordFlag
　各パネルの「Think一覧」「AI相談」に設定されているの「タイトルで絞込み」を実行したときの Keywordを、ToolBar.HighlighterMode.Text に追加するかどうかのフラグです。

　A（260906確認）：260814実装分がコード上に維持されていることを確認しました。
　　TTWorkingPanel.AddTitleSearchKeywordFlag（既定true）／TTUIStateManager の Status 登録／
　　src\utils\highlighterKeyword.ts の addTitleSearchKeywordToHighlighter()／
　　ThinktankArea・SeedsArea・ThinktankChatMemoPicker からの呼び出しがいずれも現存。変更なし。

description:    タイトルで絞込みのキーワードをハイライトする
key:            ToolBar.HighlighterMode.Text:AddTitleSearchKeywordFlag
current:        'true'
default:        'true'
type:           bool
candidates:     ^(true|false)^$

　A（260814実装）：TTWorkingPanel.AddTitleSearchKeywordFlag（既定true）として実体を追加し、
　　TTUIStateManagerにStatusとして登録しました。追加判定は addContentSearchKeywordToHighlighter
　　と同じユーティリティファイルの addTitleSearchKeywordToHighlighter() で行います。
　　タイトル絞り込み欄（ThinktankFilterPanel/SeedsFilterPanel）はEnterキーで
　　saveHistory()に加えonSearch?.()を呼ぶ実装が既にありましたが、呼び出し元3箇所で
　　onSearchが未接続（ThinktankArea/SeedsArea）またはNOOP（ThinktankChatMemoPicker）
　　だったため、いずれもEnter確定時に上記ユーティリティを呼ぶハンドラーを新設・接続しました。
　　- ThinktankPanel Think一覧（ThinktankArea.tsx handleTitleFilterSearch）
　　- SeedsPanel Think一覧（SeedsArea.tsx handleTitleFilterSearch）
　　- 両パネル共通のAI相談メモピッカー（ThinktankChatMemoPicker.tsx handleTitleSearch）
　　既存のタイトル絞り込み自体（都度ライブ適用）の挙動は変更していません。
　　実機検証で、Think一覧のタイトル絞り込みEnter確定時にToolBar.HighlighterMode.Text へ
　　キーワードが追加されること、フラグをfalseにすると追加されないことを確認しました。
## Action：　260715　ToolBar.HighlighterMode.Text:AddSelected
description:    選択テキストをHighlighter検索語に追加する
FocusedPaneの選択テキストの内容をToolBar.HighlighterMode.TextにCSV形式で追加する。
## Action：　260715　ToolBar.HighlighterMode.Text:Clear
description:    Highlighter検索語をクリアする
ToolBar.HighlighterMode.Textをクリアする
## Action：　260715　ToolBar.HighlighterMode.Text:Unfocus
description:    Highlighter入力欄から直前のフォーカス位置に戻る
ToolBar.HighlighterMode.Text:Focusで記憶した直前のFocus位置に戻る。
## Action：　260715　ToolBar.HighlighterMode.Text:Focus
description:    Highlighter入力欄にフォーカスする
ToolBar.HighlighterMode.Textに文字入力するためにFocusする。その際、直前のFocus位置を記憶する。

　A：4アクションとも TTFocusedPanelActions に実装しました。
　　- AddSelected: FocusedPaneの選択テキスト（改行を含む場合は1行目）をカンマ区切りのグループとして追加。既存と重複する場合は追加しない。
　　- Clear: ToolBar.HighlighterMode.Text（= WorkingPanel.HighlightWord）を空にする。
　　- Focus: 直前のフォーカス要素を記憶し、ToolBarをHighlighterモードに切り替えて入力欄（#StatusBarTextInput）にフォーカス。
　　- Unfocus: 入力欄のフォーカスを外し、Focusで記憶した要素へ戻す。
　　キー割当（docs\DefaultShortcut.md）: Alt+H=AddSelected、Shift+Alt+H=Clear、Ctrl+Shift+H=Focus、（Highlighter入力欄で）Escape=Unfocus

## Status 完了：　261021　ToolBar.HighlighterMode.MatchCase
description:    ハイライターの大文字小文字を区別する (aA)
key:            ToolBar.HighlighterMode.MatchCase
current:        'false'
default:        'false'
type:           bool
candidates:     ^(true|false)$
## Action 完了：　261021　ToolBar.HighlighterMode.MatchCase:Toggle
description:    ハイライターの大文字小文字区別モードを切り替える

## Status 完了：　261021　ToolBar.HighlighterMode.IsRegex
description:    ハイライターの正規表現モード (.*)
key:            ToolBar.HighlighterMode.IsRegex
current:        'false'
default:        'false'
type:           bool
candidates:     ^(true|false)$
## Action 完了：　261021　ToolBar.HighlighterMode.IsRegex:Toggle
description:    ハイライターの正規表現モードを切り替える

## Status 完了：　261021　ToolBar.HighlighterMode.MatchWidth
description:    ハイライターの全角半角を区別する (全半)
key:            ToolBar.HighlighterMode.MatchWidth
current:        'false'
default:        'false'
type:           bool
candidates:     ^(true|false)$
## Action 完了：　261021　ToolBar.HighlighterMode.MatchWidth:Toggle
description:    ハイライターの全角半角区別モードを切り替える


## Status：　260625　ToolBar.CommandMode.Text
description:    コマンドラインの入力テキスト
key:            ToolBar.CommandMode.Text
current:        
default:        
type:           string
candidates:     .*
## Action：　260728　ToolBar.CommandMode.Text:Unfocus
description:    ToolBarのCommand入力欄から元の位置に戻る
　ToolBarのCommand入力欄から元の位置に戻る
## Action：　260728　ToolBar.CommandMode.Text:Focus
description:    ToolBarのCommand入力欄にフォーカスする
　ToolBarのCommand入力欄にフォーカスする
## Action：　260728　ToolBar.CommandMode.Text:Clear
description:    ToolBarのCommandをクリアする
　ToolBarのCommandをクリアする


## Action：　260814　ToolBar.CurrentMode.Text:Focus
　ToolBarの現在のモードの入力欄にフォーカスする
　StatusModeの時は

description:    ToolBarの現在のモードの入力欄にフォーカスする

　A（260814調査）：実装済みでした。textEditorHighlighterToolbarActions.ts の
　　ToolBar.CurrentMode.Text:Focus アクションで、StatusModeの場合は
　　.ApplicationStatusBarArea__status-panel-container を起点に、input化済みなら
　　inputへ、未input化ならlabel（tabIndex）へフォーカスする分岐が既に実装されており、
　　「StatusModeの時は」の懸念点は解消済みと確認しました。コード変更なし。
## Action：　260728　ToolBar.CurrentMode.Text:Clear
description:    ToolBarの現在のモードの入力欄のテキストを消去する
　ToolBarの現在のモードの入力欄に記載されたテキストを消去する
## Action：　260728　ToolBar.CurrentMode.Text:Paste
description:    ToolBarの現在のモードの入力欄にクリップボードのテキストをペーストする
　ToolBarの現在のモードの入力欄にクリップボードのテキストをペーストする
## Action：　260728　ToolBar.CurrentMode.Text:Copy
description:    ToolBarの現在のモードの入力欄のテキストをクリップボードにコピーする
　ToolBarの現在のモードの入力欄のテキストをクリップボードにコピーする

