
# Thinktank 構造: Window (App)
## AppLayout (HighlightProvider を内包)
###   ├─ ThinktankPanel (左端の制御・一覧パネル)
####  │    ├─ ThinktankRibbon (縦型メニューリボン)
      │    │    ├─ [ThinktankThinkList] モード切り替えボタン
      │    │    ├─ [ThinktankSearch] モード切り替えボタン
      │    │    ├─ [ThinktankAI] モード切り替えボタン
      │    │    └─ [ThinktankSetting] モード切り替えボタン
####  │    ├─ PanelArea (開閉可能な領域)
##### │    └─ ThinktankArea (Thinktankのメイン領域)
##### │    │         ├─ ThinktankMenuRibbon (上部メニューバー)
      │    │         │    ├─ 【通常・検索・Thought一覧モード時】
      │    │         │    │    ├─ ［Square / CheckSquare］表示中を全選択/クリアボタン
      │    │         │    │    ├─ ［List / ListChecks］全アイテム選択/クリア（非表示含む）ボタン
      │    │         │    │    ├─ ［ListCheck］チェック済みアイテムのみ表示トグルボタン
      │    │         │    │    ├─ ［CalendarDays］日付フィルター表示トグルボタン
      │    │         │    │    ├─ ［ArrowDownAZ］表示項目とソート設定ダイアログ表示トグルボタン
      │    │         │    │    ├─ ［LibrarySquare］チェックアイテムからthoughtを作成ボタン
      │    │         │    │    ├─ ［Trash2］チェック中のアイテムを削除ボタン (Danger)
      │    │         │    │    ├─ チェック数カウントテキスト表示
      │    │         │    │    └─ ［ListRestart］表示更新ボタン
      │    │         │    ├─ 【AI相談モード時】
      │    │         │    │    ├─ ［MonitorUp］前のユーザーメッセージへスクロールボタン
      │    │         │    │    ├─ ［MonitorDown］次のユーザーメッセージへスクロールボタン
      │    │         │    │    └─ ［Save］Chatを保管庫に保存ボタン
      │    │         │    └─ 【設定モード時】
      │    │         │         └─ (ボタンなし)
##### │    │         ├─ ColumnSortDialog (カラム設定・ソートダイアログ)
      │    │         │    └─ 表示項目・ソート設定テーブル
      │    │         │         ├─ ヘッダー部 ［X］閉じるボタン
      │    │         │         └─ 各フィールド行
      │    │         │              ├─ ［GripVertical］並び替え用ドラッグハンドル
      │    │         │              ├─ ［input[type=checkbox]］表示オン/オフ
      │    │         │              ├─ ［input[type=checkbox]］昇順ソート
      │    │         │              └─ ［input[type=checkbox]］降順ソート
##### │    │         ├─ UnifiedFilterPanel (キーワード＆日付フィルターバー)
      │    │         │    ├─ テキストフィルター行
      │    │         │    │    ├─ ［input[type=text]］キーワード検索入力欄
      │    │         │    │    ├─ ［ChevronDown］履歴展開矢印
      │    │         │    │    │    └─ FilterHistoryPulldown (フィルター履歴プルダウン)
      │    │         │    │    ├─ ［X］入力消去ボタン
      │    │         │    │    └─ ヒット件数カウントテキスト表示
      │    │         │    ├─ 作成日フィルター行
      │    │         │    │    ├─ ［input[type=date]］基準日選択
      │    │         │    │    ├─ ［input[type=text]］範囲指定入力欄 (+Nd / @N)
      │    │         │    │    └─ ［X］クリアボタン
      │    │         │    └─ 更新日フィルター行
      │    │         │         ├─ ［input[type=date]］基準日選択
      │    │         │         ├─ ［input[type=text]］範囲指定入力欄 (+Nd / @N)
      │    │         │         └─ ［X］クリアボタン
##### │    │         └─ (ViewMode に応じた切り替え表示)
      │    │              ├─ ThinktankFilterView (Think一覧モード)
      │    │              │    └─ Think一覧テーブル (各行にチェックボックス、タイトル、日付等を表示)
      │    │              ├─ ThinktankSearchView (検索モード)
      │    │              │    └─ 検索結果一覧テーブル
      │    │              ├─ AiChatView (AI相談モード)
      │    │              │    └─ ChatMedia (チャット履歴・入力欄)
      │    │              ├─ ThinktankSettingsView (設定モード)
      │    │              │    └─ 保管庫(Vault)接続設定、インポート/エクスポートUI、APIキー設定等
      │    │              └─ ThoughtsList (Thought一覧モード)
      │    │                   └─ Thought一覧テーブル (Thoughtリスト表示、ドラッグ可能)
      │    └─ Splitter (幅リサイズ用バー)
      │
###   ├─ OverviewPanel (左から2番目、特定のテーマ(Thought)を掘り下げるパネル) ※表示モード時のみ
####  │    ├─ OverviewRibbon (縦型メニューリボン)
      │    │    ├─ [OverviewThinkList] モード切り替えボタン
      │    │    ├─ [OverviewResearch] モード切り替えボタン
      │    │    ├─ [OverviewAI] モード切り替えボタン
      │    │    └─ [OverviewSetting] モード切り替えボタン
####  │    ├─ PanelArea (開閉可能な領域)
      │    │    └─ OverviewArea (Overviewのメイン領域)
      │    │         ├─ OverviewMenuRibbon (上部メニューバー)
      │    │         │    ├─ 【通常モード時】
      │    │         │    │    ├─ ［Square / CheckSquare］表示中を全選択/クリアボタン
      │    │         │    │    ├─ ［List / ListChecks］全アイテム選択/クリア（非表示含む）ボタン
      │    │         │    │    ├─ ［ListCheck］チェック済みアイテムのみ表示トグルボタン
      │    │         │    │    ├─ ［CalendarDays］日付フィルター表示トグルボタン
      │    │         │    │    ├─ ［ArrowDownAZ］表示項目とソート設定ダイアログ表示トグルボタン
      │    │         │    │    ├─ ［LibrarySquare］チェックアイテムからthoughtを作成ボタン
      │    │         │    │    ├─ ［ListX］チェック中のアイテムをThoughtから除外ボタン (Danger)
      │    │         │    │    ├─ チェック数カウントテキスト表示
      │    │         │    │    └─ ［ListRestart］表示更新ボタン
      │    │         │    ├─ 【チャット・グラフモード時】
      │    │         │    │    ├─ (チャット時のみ) ［MonitorUp］前のユーザーメッセージへスクロールボタン
      │    │         │    │    ├─ (チャット時のみ) ［MonitorDown］次のユーザーメッセージへスクロールボタン
      │    │         │    │    ├─ (チャット時のみ) ［Save］Chatを保管庫に保存ボタン
      │    │         │    │    └─ ［ListRestart］表示更新ボタン
      │    │         │    └─ 【設定モード時】
      │    │         │         └─ (ボタンなし)
      │    │         ├─ ColumnSortDialog (カラム設定・ソートダイアログ) ※Thinktankと共通
      │    │         ├─ UnifiedFilterPanel (フィルターバー) ※Thinktankと共通
      │    │         └─ (表示内容の切り替え)
      │    │              ├─ OverviewSettingsView (Thoughtプロファイル・設定)
      │    │              │    └─ Thought名、概要、作成/更新日時、保管設定など
      │    │              ├─ ThoughtsList (Thought内Think一覧)
      │    │              │    └─ Thinkリストテーブル (Thoughtに属するThinkの一覧)
      │    │              ├─ AiChatView (AI相談モード) ※Thinktankと共通
      │    │              └─ GraphMedia (Thought分析グラフモード) ※Workoutと共通
      │    └─ Splitter (幅リサイズ用バー)
      │
###   ├─ WorkoutPanel (中央のコンテンツ・編集作業領域)
####  │    ├─ WorkoutRibbon (左縦型メニューリボン)
      │    │    ├─ [ChevronLeft / ChevronRight] 設定パネル開閉トグルボタン
      │    │    ├─ [Workout] モード設定ボタン
      │    │    ├─ [TextEditor] モード設定ボタン
      │    │    ├─ [Markdown] モード設定ボタン
      │    │    ├─ [DataGrid] モード設定ボタン
      │    │    ├─ [Card] モード設定ボタン
      │    │    └─ [Graph] モード設定ボタン
####  │    ├─ PanelArea (設定などの開閉領域)
      │    │    └─ WorkoutSettingPanel (新規作成・インポート・エクスポート設定)
      │    │         ├─ 【Workout設定時】
      │    │         │    └─ エリアセクション
      │    │         │         ├─ 分割: ［PanelRightDashed］左に分割, ［PanelLeftDashed］右に分割, ［PanelBottomDashed］上に分割, ［PanelTopDashed］下に分割
      │    │         │         ├─ 追加: ［GalleryThumbnails］左端に追加, 右端に追加, 上端に追加, 下端に追加 (回転角違い)
      │    │         │         ├─ 消去: ［SquareX］フォーカスペイン消去, ［CopyX］全ペイン消去 (Danger)
      │    │         │         └─ 均等: ［ChevronsLeftRightEllipsis］幅均等化, ［ChevronsLeftRightEllipsis (回転)］高さ均等化
      │    │         ├─ 【TextEditor設定時】
      │    │         │    ├─ 表示設定セクション: ［checkbox］行番号, ［checkbox］Wordwrap, ［checkbox］ミニマップ, ［checkbox］全角スペース, ［checkbox］特殊文字警告, ［checkbox］括弧対応
      │    │         │    ├─ 文字設定セクション: ［color］背景色, ［color］文字色, ［color］選択色, ［color］一致色, セクション1〜5設定 (［color］文字色, ［checkbox］太字B, ［checkbox］下線U)
      │    │         │    ├─ ハイライト色セクション: グループ1〜5の背景色/文字色ピッカー
      │    │         │    └─ メモセクション: ［FilePlus］新規作成, ［FileSpreadsheet］読込, ［Save］保存
      │    │         ├─ 【DataGrid設定時】
      │    │         │    └─ テーブルセクション: ［FilePlus］新規作成, ［FileSpreadsheet］読込, ［Save］保存
      │    │         └─ 【その他 (Markdown / Card / Graph設定) 時】
      │    │              └─ プレースホルダーテキスト表示
####  │    ├─ Splitter (幅リサイズ用バー)
####  │    └─ ContentsArea (メインコンテンツ領域)
##### │         ├─ WorkoutAreaEmpty (エリアが空の時の初期表示)
      │         │    └─ ガイドテキスト・初期画面
##### │         ├─ LayoutView (BSPツリー型で画面分割を再帰レンダリングするビュー)
      │         │    ├─ SplitView (分割ノード)
      │         │    │    ├─ LayoutView (第1ペイン)
      │         │    │    ├─ Splitter / WorkoutHSplitter (境界線)
      │         │    │    └─ LayoutView (第2ペイン)
      │         │    └─ WorkoutArea (葉ノード：個別のペイン領域)
      │         │         ├─ WorkoutAreaRibbon (ペインの上部リボン・D&Dターゲット)
      │         │         │    ├─ ドラッグハンドル（種別アイコン: FileText, Library, Table, Link, MessageCircle, Globe のいずれか）
      │         │         │    ├─ タイトル表示（未保存変更ありの時は ●）
      │         │         │    ├─ MediaType切り替えボタン群
      │         │         │    │    ├─ 【chat の場合】 ［NotebookPen］エディタ, ［MessageCircle］チャット
      │         │         │    │    ├─ 【thought の場合】 ［NotebookPen］エディタ, ［Table］テーブル, ［BookOpenText］Markdown, ［IdCard］カード, ［Share2］グラフ
      │         │         │    │    ├─ 【table の場合】 ［NotebookPen］エディタ, ［Table］テーブル, ［IdCard］カード
      │         │         │    │    └─ 【その他 (memo 等) の場合】 ［NotebookPen］エディタ, ［BookOpenText］Markdown
      │         │         │    └─ ［X］閉じるボタン
      │         │         └─ (MediaType に応じた各種エディタ・メディアビュー)
      │         │              ├─ TextEditorMedia (テキスト/コードエディタ - Monaco)
      │         │              ├─ MarkdownMedia (プレビュー)
      │         │              ├─ DataGridMedia (表データ表示)
      │         │              ├─ CardMedia (かんばん/カード表示)
      │         │              ├─ GraphMedia (関連グラフ構造表示)
      │         │              └─ ChatMedia (チャット履歴ビュー)
##### │         └─ WorkoutToolBar (最下段のステータス/ツールバー)
      │              ├─ 左側エリア
      │              │    ├─ 【通常入力時】 ［input[type=text]］コマンド/テキスト入力欄、［X］クリアボタン、［datalist］ハイライト履歴
      │              │    ├─ 【KeyAction表示時】 状態テキスト表示 (focus, mod, key, mouse, touch, exmode/exmod, action 等)
      │              │    └─ 【Copyright表示時 / バナー表示時】 バナーまたは静的な著作権表示テキスト
      │              ├─ 中央モードアイコン群
      │              │    ├─ ［Info］Statusモード選択ボタン
      │              │    ├─ ［Highlighter］Highlighterモード選択ボタン
      │              │    ├─ ［Keyboard］KeyActionモード選択ボタン
      │              │    ├─ ［Terminal］Commandモード選択ボタン
      │              │    ├─ ［BookA］Translateモード選択ボタン
      │              │    └─ ［Bell］Reminderモード選択ボタン
      │              └─ 右側ユーティリティボタン
      │                   ├─ ［Copyright］Copyright表示トグルボタン
      │                   └─ ［ChevronsLeftRight / ChevronsRightLeft］ツールバー拡大縮小トグルボタン
      │
###   └─ ReThinkPanel (右端 of AI対話・考察パネル) ※表示モード時のみ
####       ├─ Splitter (幅リサイズ用バー)
####       ├─ PanelArea (開閉可能な領域)
           │    └─ ReThinkArea (ReThinkのメイン領域)
           │         ├─ ReThinkMenuRibbon (上部メニューバー)
           │         │    ├─ 【chat モード時】
           │         │    │    ├─ ［MonitorUp］前のユーザーメッセージへスクロールボタン
           │         │    │    ├─ ［MonitorDown］次のユーザーメッセージへスクロールボタン
           │         │    │    └─ ［Save］Chatを保管庫に保存ボタン
           │         │    └─ 【settings モード時】
           │         │         └─ (ボタンなし)
           │         └─ ReThinkChat (AIとのCLI風チャットエリア)
           │              ├─ ログ出力エリア
           │              │    ├─ バナー領域
           │              │    └─ チャットメッセージエントリ一覧 (ユーザーメッセージ / AIメッセージ)
           │              └─ ［textarea］入力エリア (Enter=送信 / Shift+Enter=改行)
####       └─ ReThinkRibbon (縦型メニューリボン)
                ├─ [ReThinkAI] モード切り替えボタン
                └─ [ReThinkSetting] モード切り替えボタン




# 実装したい変数
Application.Focus.Panel
  ThinktankThinkList,ThinktankSearch,ThinktankAI,ThinktankSetting
  OverviewThinkList,OverviewResearch,OverviewAI,OverviewSetting
  Workout,TextEdito,Markdown,DataGrid,Card,Graph
  Workout.Pane1,Workout.Pane2,...
  Workout.StatusBar.
  ReThinkAI,ReThinkSetting
Application.Focus.Column
  Thinktank,Overview,WorkoutSetting,Workout,ReThink
WorkoutPanel.Current.PaneID
  Workout.Pane1,Workout.Pane2,...
WorkoutPanel.Current.PaneName
  .*





