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

## 完了：　Application.Resource.ImportFromLocal

## 修正：　260718　WorkoutPanel.Load.DroppedFile
　DropされたThinkファイルをPaneにLoadする
## 修正：　260719　WorkoutPanel.Insert.DroppedFile
　DropされたThinkファイルの内容ではなく `[memo:{ID}]` タグをコンテンツ内に挿入する
　Drop開始時にModifierキーを確認し、Alt+ThinkFileDragであればゴーストを表示せず、
　mouseoverに合わせてカーソルを移動させる

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
　　docs\Shortcut.md のキー割当（*, ThinkFileDrag / Alt+ThinkFileDrag）は
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

# Status

# 対応不要： その他：ナビゲーション　ファイル内・ファイル間ジャンプ
# 対応不要： その他：メニュー
# 対応不要： その他：D&D対応
　Thinktank/Overviewからのthinkメモの D&D
　ファイルシステムからのファイル/ディレクトリの D&D
　ブラウザからの urlの D&D
　

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
## Action：　260708　Application.PanelDisplay.Mode:Normal
## Status：　260708　Application.PanelDisplay.Mode
description:    
key:            Application.PanelDisplay.Mode
current:        Normal
default:        Normal
type:           string
candidates:      ^(Simple|Normal)$

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
　　※フォーカスがどこにもない場合は None です。

　Q：ToolBar>HilighterのTextboxにフォーカスがあるとき、値はどうなりますか？
　A：ToolBar.Highlighter となります（修正前は誤って Application.StatusBarArea を返していました）。
　　原因は getFocusName.ts のツールバー判定が、実際には存在しない .workout-toolbar という
　　クラス名を参照していたため、常にマッチせずフォールバックの Application.StatusBarArea に
　　落ちていたことです。実際のツールバー（Highlighter/Command/...入力欄を含む）は
　　.ApplicationStatusBarArea として描画されるため、判定をこちらに修正しました。
　　これにより docs\Shortcut.md の `ToolBar.Highlighter ,,Escape` 等、focus列にToolBarの
　　モード名を指定するショートカットが意図通り動作するようになりました。

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

# Panel ============================================================================================================
## Action：　260619　FocusedPanel.Area.IsOpen:Toggle
## Action：　260619　FocusedPanel.Mode.Name:Prev
## Action：　260619　FocusedPanel.Mode.Name:Next

## Action：　260714　Thinktank.Filter.Cursor:Action
　↓ カーソル位置のアイテムを開く　→　終了
## Action：　260714　Thinktank.Filter.Cursor:ToggleCheck
　↓ カーソル位置のチェック状態をトグルする　→　終了
## Status：　260714　Thinktank.Filter.CursorPosID
description:    Thinktank>Think一覧のカーソル位置のID
key:            Thinktank.Filter.CursorPosID
current:        ''
default:        ''
type:           string
candidates:      .*
## Status：　260714　Thinktank.Filter.CursorPos
値0は表示されていない、1以上はカーソルの行番号

description:    Thinktank>Think一覧のカーソル位置
key:            Thinktank.Filter.CursorPos
current:        0
default:        0
type:           string
candidates:      .*
## Actoin：　260714　Thinktank.Filter.CursorPos:PrevLine
　↓ カーソルを１行前に移動する　→　終了
## Actoin：　260714　Thinktank.Filter.CursorPos:NextLine
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

## Action：　260714　Overview.Filter.Cursor:Action
　↓ カーソル位置のアイテムを開く　→　終了
## Action：　260714　Overview.Filter.Cursor:ToggleCheck
　↓ カーソル位置のチェック状態をトグルする　→　終了
## Status：　260714　Overview.Filter.CursorPosID
description:    Overview>Think一覧のカーソル位置のID
key:            Overview.Filter.CursorPosID
current:        ''
default:        ''
type:           string
candidates:      .*
## Status：　260714　Overview.Filter.CursorPos
値0は表示されていない、1以上はカーソルの行番号

description:    Overview>Think一覧のカーソル位置
key:            Overview.Filter.CursorPos
current:        0
default:        0
type:           string
candidates:      .*
## Actoin：　260714　Overview.Filter.CursorPos:PrevLine
　↓ カーソルを１行前に移動する　→　終了
## Actoin：　260714　Overview.Filter.CursorPos:NextLine
　↓ カーソルを１行後に移動する　→　終了

　A：Status は TTUIStateManager に読み取り専用（isConst）の派生値として登録しました。
　　値はフィルタ・ソート適用後のThink一覧における行番号で、カーソル未設定時は 0 です。
　　Action は Ctrl+N / Ctrl+P に割当てました（docs\Shortcut.md）。
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

## Status：　260630　WorkoutPanel.Pane.Count
　IDをWorkoutPanel.Panes.Countに変更
## Status：　260706　WorkoutPanel.Pane.Layout
description:    Paneレイアウト構造(JSON)
key:            WorkoutPanel.Pane.Layout
current:        null
default:        null
type:           json
candidates:     .*
## Status：　260706　WorkoutPanel.Pane.Display
description:    各Paneのロード状態(JSON)
key:            WorkoutPanel.Pane.Display
current:        []
default:        []
type:           json
candidates:     .*

# Panel D&D ======================================================================================================

# TextEditor Edit ==================================================================================================
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
## Action：　260625　TextEditor.Comment.NextStyle
　カーソル位置の行、または、選択されている全行を対象に、コメント記号文字を設定する。　設定ルールは以下の通り。
　各行における 先頭の1文字目
　　TextEditor.Comment.StyleSet に含まれる：　次の値に置換
　　TextEditor.Comment.StyleSet に含まれない：　1文字目の位置に、TextEditor.Comment.StyleSetの1番目の文字を挿入
## Action：　260625　TextEditor.Comment.PrevStyle
　カーソル位置の行、または、選択されている全行を対象に、コメント記号文字を設定する。　設定ルールは以下の通り。
　各行における 先頭の1文字目
　　TextEditor.Comment.StyleSet に含まれる：　前の値に置換
　　TextEditor.Comment.StyleSet に含まれない：　1文字目の位置に、TextEditor.Comment.StyleSetの最後の文字を挿入
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

## Action：　260619　TextEditor.EditText.Undo
## Action：　260619　TextEditor.EditText.Redo

# TextEditor Action ================================================================================================
## Action：　260630　TextEditor.CurrentEditor.DoOnCursorPos:Menu
　CursorPos位置が、url, filepath, tag のいずれかを表す部分であれば、下記のそれぞれについて実行してください。
　url:      TextEditor.CurrentEditor.DoOnCursorPos:Url:*　をメニューで表示し選択して実施
　filepath: TextEditor.CurrentEditor.DoOnCursorPos:File:*　をメニューで表示し選択して実施
　tag:      TextEditor.CurrentEditor.DoOnCursorPos:Tag:*　をメニューで表示し選択して実施
## Action：　260630　TextEditor.CurrentEditor.DoOnCursorPos:Url:Open
　CursorPos位置が、urlを表す部分であれば、ブラウザで対象のURLを開いてください。
## Action：　260630　TextEditor.CurrentEditor.DoOnCursorPos:File:Open
　CursorPos位置が、filepathを表す部分であれば、サーバーAPI(/api/system/open)を経由し、OSの規定のアプリでローカルファイル/フォルダを起動してください。
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:WebSearch:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:GoogleRoute:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:YahooTransfer:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Think:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Mail:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Chat:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:AI:Open
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Anchor:Open
## Action：　260630　TextEditor.CurrentEditor.DoOnCursorPos
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
　↓検索ダイアログボックスが表示されている場合は非表示にする　→終了
　↓monacoeditorのdefaultの検索ダイアログボックスを表示してフォーカスする
## Action：　260716　TextEditor.CurrentEditor.ShowReplace
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
　検索オプションの値を変更する
## Action：　260715　TextEditor.FindOption.MatchWholeWord:Toggle
　検索オプションの値を変更する
## Action：　260715　TextEditor.FindOption.UseRexp:Toggle
　検索オプションの値を変更する
## Action：　260715　TextEditor.ReplaceOption.PreserveCase:Toggle
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
　↓ Highlighterに設定されたテキストを検索して前のヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextHighlighter
　↓ Highlighterに設定されたテキストを検索して次のヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する
## Action：　260714　TextEditor.CurrentEditor.CursorPos:FirstHighlighter
　↓ Highlighterに設定されたテキストを検索して先頭ヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する
## Action：　260714　TextEditor.CurrentEditor.CursorPos:LastHighlighter
　↓ Highlighterに設定されたテキストを検索して末尾ヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する

　A：検索語は ToolBar.HighlighterMode.Text（= WorkoutPanel.HighlightWord）を、
　　ハイライト表示と同じ規則でカンマ・空白区切りに分解し、OR条件（大文字小文字を区別）で検索します。
　　ヒット位置の先頭にカーソルを移動し、画面外なら中央にスクロールします。
　　Prev/Next は循環しません（端では移動せず「これ以上ヒットなし」）。
　　キー割当（docs\Shortcut.md）: Ctrl+Shift+P/N = Prev/Next、Ctrl+Alt+P/N = First/Last
## Action：　260715　ToolBar.HighlighterMode.Text:AddSelected
FocusedPaneの選択テキストの内容をToolBar.HighlighterMode.TextにCSV形式で追加する。
## Action：　260715　ToolBar.HighlighterMode.Text:Clear
ToolBar.HighlighterMode.Textをクリアする
## Action：　260715　ToolBar.HighlighterMode.Text:Unfocus
ToolBar.HighlighterMode.Text:Focusで記憶した直前のFocus位置に戻る。
## Action：　260715　ToolBar.HighlighterMode.Text:Focus
ToolBar.HighlighterMode.Textに文字入力するためにFocusする。その際、直前のFocus位置を記憶する。

　A：4アクションとも TTFocusedPanelActions に実装しました。
　　- AddSelected: FocusedPaneの選択テキスト（改行を含む場合は1行目）をカンマ区切りのグループとして追加。既存と重複する場合は追加しない。
　　- Clear: ToolBar.HighlighterMode.Text（= WorkoutPanel.HighlightWord）を空にする。
　　- Focus: 直前のフォーカス要素を記憶し、ToolBarをHighlighterモードに切り替えて入力欄（#StatusBarTextInput）にフォーカス。
　　- Unfocus: 入力欄のフォーカスを外し、Focusで記憶した要素へ戻す。
　　キー割当（docs\Shortcut.md）: Alt+H=AddSelected、Shift+Alt+H=Clear、Ctrl+Shift+H=Focus、（Highlighter入力欄で）Escape=Unfocus

# TextEditor Cursor ================================================================================================
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevChar
　↓ カーソルを１文字前に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextChar
　↓ カーソルを１文字後に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevWord
　↓ カーソルを１ワード前に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextWord
　↓ カーソルを１ワード後に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevLine
　↓ CurPosが文書先頭行だった場合　→　カーソルを先頭行行頭に移動する　→　終了
　↓ monaco editor defaultのArrowUpの移動位置に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextLine
　↓ CurPosが文書最終行だった場合　→　カーソルを最終行末尾に移動する　→　終了
　↓ monaco editor defaultのArrowDownの移動位置に移動する　→　終了

　A：独自のカラム計算をやめ、Monaco既定コマンド（cursorUp / cursorDown）に委譲しました。
　　これにより折り畳み行のスキップ・折り返し行・カラムのスティッキー復元が既定どおりになります。
## Action：　260628　TextEditor.CurrentEditor.CursorPos:LineStart+
　↓ CurPosが行先頭ではない場合、CurPosを現在行の先頭位置に移動する　→　終了
　↓ CurPosが行先頭だがテキスト先頭ではない場合、CurPosをテキスト先頭位置に移動する　→　終了
　↓ CurPosがテキスト先頭の場合、カーソルがテキスト先頭にある状態でテキストすべてを選択する
## Action：　260628　TextEditor.CurrentEditor.CursorPos:LineEnd+
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

# Color Style ====================================================================================================== 
## Status：　260707　TextEditor.Bullet.StyleNum
description:    箇条書きスタイルの登録数
key:            TextEditor.Bullet.StyleNum
current:        9
default:        9
type:           integer
candidates:     ^[0-9]+$
## Status：　260707　TextEditor.Bullet.Style1
description:    箇条書きスタイル1
key:            TextEditor.Bullet.Style1
current:        ・,undefined,undefined
default:        ・,undefined,undefined
type:           string
candidates:     .*
## Status：　260707　TextEditor.Bullet.Style2
description:    箇条書きスタイル2
key:            TextEditor.Bullet.Style2
current:        -,undefined,undefined
default:        -,undefined,undefined
type:           string
candidates:     .*
## Status：　260707　TextEditor.Bullet.Style3
description:    箇条書きスタイル3
key:            TextEditor.Bullet.Style3
current:        *,#cc2222,undefined
default:        *,#cc2222,undefined
type:           string
candidates:     .*
## Status：　260707　TextEditor.Bullet.Style4
description:    箇条書きスタイル4
key:            TextEditor.Bullet.Style4
current:        ■,#000000,underline
default:        ■,#000000,underline
type:           string
candidates:     .*
## Status：　260707　TextEditor.Bullet.Style5
description:    箇条書きスタイル5
key:            TextEditor.Bullet.Style5
current:        ●,#000000,underline
default:        ●,#000000,underline
type:           string
candidates:     .*
## Status：　260707　TextEditor.Bullet.Style6
description:    箇条書きスタイル6
key:            TextEditor.Bullet.Style6
current:        =,#cccc22,undefined
default:        =,#cccc22,undefined
type:           string
candidates:     .*
## Status：　260707　TextEditor.Bullet.Style7
description:    箇条書きスタイル7
key:            TextEditor.Bullet.Style7
current:        ↓,#000000,bold
default:        ↓,#000000,bold
type:           string
candidates:     .*
## Status：　260707　TextEditor.Bullet.Style8
description:    箇条書きスタイル8
key:            TextEditor.Bullet.Style8
current:        →,undefined,underline
default:        →,undefined,underline
type:           string
candidates:     .*
## Status：　260707　TextEditor.Bullet.Style9
description:    箇条書きスタイル9
key:            TextEditor.Bullet.Style9
current:        [✓],undefined,bold
default:        [✓],undefined,bold
type:           string
candidates:     .*

## Status：　260707　TextEditor.Comment.StyleNum
description:    コメントスタイルの登録数
key:            TextEditor.Comment.StyleNum
current:        5
default:        5
type:           integer
candidates:     ^[0-9]+$
## Status：　260707　TextEditor.Comment.Style1
description:    コメントスタイル1
key:            TextEditor.Comment.Style1
current:        >,#bbddbb,undefined
default:        >,#bbddbb,undefined
type:           string
candidates:     .*
## Status：　260707　TextEditor.Comment.Style2
description:    コメントスタイル2
key:            TextEditor.Comment.Style2
current:        >>,#bbbbdd,undefined
default:        >>,#bbbbdd,undefined
type:           string
candidates:     .*
## Status：　260707　TextEditor.Comment.Style3
description:    コメントスタイル3
key:            TextEditor.Comment.Style3
current:        >>>,#ddbbbb,undefined
default:        >>>,#ddbbbb,undefined
type:           string
candidates:     .*
## Status：　260707　TextEditor.Comment.Style4
description:    コメントスタイル4
key:            TextEditor.Comment.Style4
current:        ;,#bbbbbb,undefined
default:        ;,#bbbbbb,undefined
type:           string
candidates:     .*
## Status：　260707　TextEditor.Comment.Style5
description:    コメントスタイル5
key:            TextEditor.Comment.Style5
current:        |,#ffaaaa,undefined
default:        |,#ffaaaa,undefined
type:           string
candidates:     .*



## Status：　260707　TextEditor.Url.Style
TextEditor.CurrentEditor.DoOnCursorPosで認識されるUrlの文字スタイル（文字色, 背景色, 属性）です。

description:    Urlのスタイル
key:            TextEditor.Url.Style
current:        #1010edff, undefined, underline
default:        #1010edff, undefined, underline
type:           string
candidates:     .*
## Status：　260707　TextEditor.Filepath.Style
TextEditor.CurrentEditor.DoOnCursorPosで認識されるFilepathの文字スタイル（文字色, 背景色, 属性）です。

description:    Filepathのスタイル
key:            TextEditor.Filepath.Style
current:        undefined, undefined, underline
default:        undefined, undefined, underline
type:           string
candidates:     .*
## Status：　260707　TextEditor.Tag.Style
TextEditor.CurrentEditor.DoOnCursorPosで認識されるTagの文字スタイル（文字色, 背景色, 属性）です。

description:    Tagのスタイル
key:            TextEditor.Tag.Style
current:        #4ba402ff, undefined, underline|bold
default:        #4ba402ff, undefined, underline|bold
type:           string
candidates:     .*

将来的にタグごとに分ける可能性あり、



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

## Status：　260707　TextEditor.Highlighter.Style1
ハイライト1のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ1 で変更した場合に反映される。

description:    ハイライト1のスタイル
key:            TextEditor.Highlighter.Style1
current:        undefined, #fff0b3, none
default:        undefined, #fff0b3, none
type:           string
candidates:     .*
## Status：　260707　TextEditor.Highlighter.Style2
ハイライト2のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ2 で変更した場合に反映される。

description:    ハイライト2のスタイル
key:            TextEditor.Highlighter.Style2
current:        undefined, #ffb3b3, none
default:        undefined, #ffb3b3, none
type:           string
candidates:     .*
## Status：　260707　TextEditor.Highlighter.Style3
ハイライト3のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ3 で変更した場合に反映される。

description:    ハイライト3のスタイル
key:            TextEditor.Highlighter.Style3
current:        undefined, #b3e0ff, none
default:        undefined, #b3e0ff, none
type:           string
candidates:     .*
## Status：　260707　TextEditor.Highlighter.Style4
ハイライト4のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ4 で変更した場合に反映される。

description:    ハイライト4のスタイル
key:            TextEditor.Highlighter.Style4
current:        undefined, #b3ffb3, none
default:        undefined, #b3ffb3, none
type:           string
candidates:     .*
## Status：　260707　TextEditor.Highlighter.Style5
ハイライト5のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ5 で変更した場合に反映される。

description:    ハイライト5のスタイル
key:            TextEditor.Highlighter.Style5
current:        undefined, #e6b3ff, none
default:        undefined, #e6b3ff, none
type:           string
candidates:     .*
## Status：　260707　TextEditor.Highlighter.Style6
ハイライト6のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ6 で変更した場合に反映される。

description:    ハイライト6のスタイル
key:            TextEditor.Highlighter.Style6
current:        undefined, #e620ff, none
default:        undefined, #e620ff, none
type:           string
candidates:     .*

## Status：　260707　TextEditor.Heading.Style1
見出し行レベル1のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>文字設定>セクション1 で変更した場合に反映される。

description:    見出し行レベル1のスタイル
key:            TextEditor.Heading.Style1
current:        #569cd6, undefined, bold|underline
default:        #569cd6, undefined, bold|underline
type:           string
candidates:     .*
## Status：　260707　TextEditor.Heading.Style2
見出し行レベル2のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>文字設定>セクション2 で変更した場合に反映される。

description:    見出し行レベル2のスタイル
key:            TextEditor.Heading.Style2
current:        #4ec9b0, undefined, bold|underline
default:        #4ec9b0, undefined, bold|underline
type:           string
candidates:     .*
## Status：　260707　TextEditor.Heading.Style3
見出し行レベル3のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>文字設定>セクション3 で変更した場合に反映される。

description:    見出し行レベル3のスタイル
key:            TextEditor.Heading.Style3
current:        #ce9178, undefined, bold|underline
default:        #ce9178, undefined, bold|underline
type:           string
candidates:     .*
## Status：　260707　TextEditor.Heading.Style4
見出し行レベル4のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>文字設定>セクション4 で変更した場合に反映される。

description:    見出し行レベル4のスタイル
key:            TextEditor.Heading.Style4
current:        #dcdcaa, undefined, bold|underline
default:        #dcdcaa, undefined, bold|underline
type:           string
candidates:     .*
## Status：　260707　TextEditor.Heading.Style5
見出し行レベル5のスタイル（文字色, 背景色, 属性）
WorkoutSettingPanel>TextEditor設定>文字設定>セクション5 で変更した場合に反映される。

description:    見出し行レベル5のスタイル
key:            TextEditor.Heading.Style5
current:        #c586c0, undefined, bold|underline
default:        #c586c0, undefined, bold|underline
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

# TextEditor ExOpt =================================================================================================
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


# TextEditor ExDate ================================================================================================
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


## 完了：その他：タグ
TextEditor.CurrentEditor.TextOnCursorPos にはカーソル位置で取得されたアクション用の Tag が設定されますが、
そのTagのアクションについて以下のように分類しなおして、各subTag毎でアクションを再定義することを考えています。
各subTagの例示において、大文字はタグ文字（ただし運用は大文字小文字混和可)、小文字はパラメータ文字です。
1. Tag.WebSearch:       docs\DefaultSearchTag.mdで定義済みの WebSearch 用タグ
2. Tag.GoogleRoute:     GoogleMapでplace1,2,3...を通るルートを表示するためのタグ        例：[GOOGLEROUTE:plasce1,place2,place3...]
3. Tag.YahooTransfer:   Yahoo乗換案内で電車を検索するためのタグ                         例：[YAHOOTRANSFER:from,to,via,time,departure|arrive] 
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