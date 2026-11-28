# Application ======================================================================================================
## Status 完了：　261128　Thinktank.KeyFocused.Panel
description:    キーボードフォーカスのあるパネル
key:            Thinktank.KeyFocused.Panel
current:        None
default:        None
type:           string
candidates:     ^(Thinktank|Seeds|WorkingSetting|Working|Harvest|ToolBar|None)$

## Status 完了：　261128　Thinktank.KeyFocused.SubPanel
description:    キーボードフォーカスのあるサブパネル（Working は Pane タイトル）
key:            Thinktank.KeyFocused.SubPanel
current:        None
default:        None
type:           string
candidates:     .*

Thinktank: Filer, Project, AIView, AIChat, Config, None
Seeds: Filer, Project, AIView, AIChat, Config, None
WorkingSetting: PaneConfig, AIView, AIChat, TextEditorConfig, ChatConfig, MarkdownConfig, DataGridConfig, CardConfig, GraphConfig, HtmlConfig, None
Working: {PaneTitle}, None
Harvest: AIView, AIChat, Config, None
ToolBar: Status, Highlighter, KeyAction, Command, Search, Reminder, Copyright, None

## Status 完了：　261128　Thinktank.KeyFocused.UIComponent
description:    キー入力を受ける UI 部品
key:            Thinktank.KeyFocused.UIComponent
current:        None
default:        None
type:           string
candidates:     ^(TextEditor|MarkdownViewer|AIChatTextBox|ThinkFiler|DataGrid|Graph|Card|Html|Menu|Dialog|None)$

ToolBar の Status 欄に以下を入力すると、フォーカスの移動に合わせて3つの現在値を確認できる。
Thinktank.KeyFocused.Panel,Thinktank.KeyFocused.SubPanel,Thinktank.KeyFocused.UIComponent


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


## Action：　260708　Application.PanelDisplay.Mode:Edit
description:    パネル表示モードをEditにする
## Action：　260708　Application.PanelDisplay.Mode:Think
description:    パネル表示モードをThinkにする
## Status：　260708　Application.PanelDisplay.Mode
description:    
key:            Application.PanelDisplay.Mode
current:        Think
default:        Think
type:           string
candidates:      ^(Think|Edit)$

## Action：　260827　Application.Display.Zoom:ZoomIn
description:    拡大表示
　表示文字サイズを 10% 拡大する（上限 200%）。utils/appZoom.ts が <html> に CSS変数
　--tt-font-scale を設定し、全 CSS の font-size は calc(Npx * var(--tt-font-scale, 1)) に
　統一されている。文字だけが拡大・縮小し、余白・パネル幅・レイアウトは不変で再フローする
　（zoom はブラウザ差が大きいため不使用）。Monaco エディタは CSS 非継承なので
　TextEditorMedia が fontSize/lineHeight にこの倍率を掛けて updateOptions する。
　倍率は localStorage（tt-app-zoom）に永続化。Thinktank>設定>表示>サイズ のアイコンから呼び出す。
## Action：　260827　Application.Display.Zoom:ZoomOut
description:    縮小表示
　表示文字サイズを 10% 縮小する（下限 50%）。
## Status：　260827　Application.Display.Zoom
description:    表示文字サイズの倍率（％。50〜200、10刻み）
key:            Application.Display.Zoom
current:        100
default:        100
type:           integer
candidates:      ^[0-9]{2,3}$

## Action：　260911　Application.Resource.RollbackFocusedThink
description:    直前にフォーカスされたThinkファイル１つをBQで1時間前の状態に戻す
　対象は WorkingPanel.FocusedPane.FileHistory の先頭のThinkファイル1件。
　BigQuery time travel（FOR SYSTEM_TIME AS OF）を使う復元APIが未実装のため、現状はUIの受け皿のみで、
　実行してもステータスバーに「巻戻（Think1件）: 未実装です」と表示するだけで復元は行われない。
## Action：　260911　Application.Resource.RollbackAll
description:    BQ全体を1時間前の状態に戻す
　thinktank.vault 全体を1時間前のスナップショットで置換する。
　RollbackFocusedThink と同じく復元APIが未実装のため、現状は「巻戻（BQ全体）: 未実装です」と
　表示するだけで復元は行われない。

## Action：　260911　Application.Date:Next
description:    Application.Dateを次の値に切り替える
## Action：　260911　Application.Date:Prev
description:    Application.Dateを前の値に切り替える
　どちらも Status `Application.Date` を next / prev で変更するアクションとして登録済みだが、
　対応する Status `Application.Date` が TTUIStateManager の PROP_SPECS に未登録のため、
　現状は実行しても値は変化しない。Status側の実装が必要。


## Action：　260619　Application.FocusedPanel.Name:Next
description:    フォーカスカラムを次のパネルに移動する
## Action：　260619　Application.FocusedPanel.Name:Prev
description:    フォーカスカラムを前のパネルに移動する
## Status：　260615　Application.FocusedPanel.Name
description:    フォーカスカラム
key:            Application.FocusedPanel.Name
current:        Seeds
default:        Thinktank
type:           string
candidates:      ^(Thinktank|Seeds|WorkingSetting|Working|Harvest)$

　Q：設定値を記載してください。
　A：設定されるすべての値（フォーカス対象となるパネル・エリア名）は以下の5つです。
　　- Thinktank （左パネル：フィルター / チャット / 設定）
　　- Seeds （上部パネル：データグリッド / グラフ / チャット / 設定）
　　- WorkingSetting （Working設定トレイ / 垂直タブバー）
　　- Working （Working編集エリア）
　　- Harvest （右パネル：AIチャット / 設定）
　　※レイアウトモードが 'simple' の場合は、Thinktank, WorkingSetting, Working の3つのみが選択肢となります。


## Action：　260619　Application.Status.ExMode:ExApp
description:    拡張モードをExAppに設定する
## Action：　260619　Application.Status.ExMode:ExOpt
description:    拡張モードをExOptに設定する
## Action：　260911　Application.Status.ExMode:None
description:    拡張モードをNoneに設定する
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

## Action：　260911　Application.FocusedArea.Name:next
description:    フォーカスエリアを次に切り替える
## Action：　260911　Application.FocusedArea.Name:prev
description:    フォーカスエリアを前に切り替える
　ActionIDの接尾辞は小文字（:next / :prev）で登録されている。
## Status：　260615　Application.FocusedArea.Name
description:    フォーカスエリア
key:            Application.FocusedArea.Name
current:        None
default:        None
type:           string
candidates:      ^(None|Thinktank|Seeds|WorkingSetting|Working|Harvest)\..*$

　StatusBarKeyActionPanelのTextBox中にあるFOCUSにその値を表示してください。　
　フォーカスされるものがある場合のみFOCUSされる

　Q：設定値を記載してください。
　A：キーボードフォーカスがあるDOM要素と各パネルの表示モード状態に基づき、動的に以下の値が判定されて設定されます。
　　- Thinktank.{ModeName}
　　- Seeds.{ModeName}
　　- WorkingSetting.{ModeName}
　　- ToolBar.{ModeName} 
　　- Working.{MediaType}
　　- Harvest.{ModeName}
　　※フォーカスがどこにもない場合は None です。

　Q：ToolBar>HilighterのTextboxにフォーカスがあるとき、値はどうなりますか？
　A：ToolBar.Highlighter となります（修正前は誤って Application.StatusBarArea を返していました）。
　　原因は getFocusName.ts のツールバー判定が、実際には存在しない .working-toolbar という
　　クラス名を参照していたため、常にマッチせずフォールバックの Application.StatusBarArea に
　　落ちていたことです。実際のツールバー（Highlighter/Command/...入力欄を含む）は
　　.ApplicationStatusBarArea として描画されるため、判定をこちらに修正しました。
　　これにより docs\DefaultShortcut.md の `ToolBar.Highlighter ,,Escape` 等、focus列にToolBarの
　　モード名を指定するショートカットが意図通り動作するようになりました。


