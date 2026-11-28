# Panel Working ====================================================================================================
## Status：　261009　WorkingSettingPanel.Area.OpenWidth
key:の意味はThinktankPanel.Area.OpenWidthと同じ
　（旧記載の WorkingPanel.Area.OpenWidth は未登録のIDだったため、実装上の StatusID であるこちらに統合しました）
　Working設定パネル（WorkingSetting：垂直タブバー＋設定トレイ）を開いたときの幅のモードです。
　実体は TTWorkingPanel.AreaWidthMode で、px は panelAreaWidth.ts が導出します。
　FocusedPanel.Area.OpenWidth:* / FocusedPanel.Area.IsOpen:Toggle* は、フォーカスが
　WorkingSetting と Working のどちらにある場合もこの Status を対象にします。
　Splitter で幅を変更すると user に切り替わります。

description:    WorkingパネルOpen時の幅
key:            WorkingSettingPanel.Area.OpenWidth
current:        init
default:        init
type:           string
candidates:     ^(init|user|foredit)$
## Status：　260619　WorkingSettingPanel.Area.IsOpen

description:    Working設定パネル表示
key:            WorkingSettingPanel.Area.IsOpen
current:        false
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　WorkingSettingPanel.Mode.Name

description:    Working設定パネルモード
key:            WorkingSettingPanel.Mode.Name
current:        Working
default:        Working
type:           string
candidates:     ^(Working|Texteditor|Markdown|Datagrid|Card|Graph)$


　Q：設定値を記載してください。
　A：設定可能な値は以下の6つです。
　　- Working （概要設定）
　　- Texteditor （テキストエディタ）
　　- Markdown （マークダウンプレビュー）
　　- Datagrid （データグリッド）
　　- Card （カードビュー）
　　- Graph （グラフビュー）
 
## Action：　260619　WorkingPanel.FocusedPane.Mode:Next
description:    フォーカスペインの表示モードを次に切り替える
## Action：　260619　WorkingPanel.FocusedPane.Mode:Prev
description:    フォーカスペインの表示モードを前に切り替える
## Status：　260619　WorkingPanel.FocusedPane.Mode
description:    Workingパネルの表示モード
key:            WorkingPanel.FocusedPane.Mode
current:        Texteditor
default:        Texteditor
type:           string
candidates:     ^(Texteditor|Markdown|Datagrid|Card|Graph|Chat)$

　Next/Prevを設定して変更される値は、すべての設定値ではなく、FocusedPaneに表示されているThinkファイル種別ごとに取り得る範囲が変わります。
　今、Next/Prevでその範囲を超えて設定されてしまっていますので、修正してください。docs\260606_Thinktank仕様書\02_UI・画面レイアウト仕様.mdの## 6. ContentType と MediaType のマッピングを参照してください。

　Q：設定値を記載してください。
　A：現在フォーカスされているペイン（WorkingArea）の表示モード（1文字目大文字）を取得・設定します。
　　設定・変更可能な値は以下の6つです（循環切替に対応）。
　　- `Texteditor` （テキストエディタ）
　　- `Markdown` （マークダウンプレビュー）
　　- `Datagrid` （データグリッド）
　　- `Card` （カードビュー）
　　- `Graph` （グラフビュー）
　　- `Chat` （AIチャット）
　　- `None` （フォーカスされているペインがない場合）



## Status：　260613　WorkingPanel.FocusedPane.ID

## Action：　261108　WorkingPanel.FocusedPane.ShowMenu
description:    FocusPaneのカーソル位置にコンテキストメニューを表示する
　A（261108実装）：docs\DefaultMenu.md の「FocusedPane」メニューを表示し、選んだアクションを実行します。
　　TextEditor のPaneではキャレットの直下に、それ以外のPaneではPane上端の中央に出します。Esc でキャンセルします。
　　ショートカット：Working フォーカス中の Shift+F10。
## Action：　261108　WorkingPanel.FocusedPane.PaneNumber:Copy
description:    FocusPaneのthinkファイルのIDに準じたタグを生成しクリップボードにコピーする
　A（261108実装）：フォーカス中のPaneに開いている Thinkファイルの参照タグをクリップボードにコピーします。
　　linkファイルはリンク先に応じたタグと Caption（例：[gdrive:ID] 見積書.pdf、[file:ID] File:plan.md）、
　　それ以外は [memo:ID] です。Thinkファイルの Alt+ドロップ（WorkingPanel.DroppedFile.ID:Insert）で入るタグと同じです。
　　「FocusedPane > T)タグをコピーする」から実行します。

## Action：　260728　WorkingPanel.FocusedPane.PaneNumber:ReFocus
description:    WorkingPanelの現在フォーカス中のPaneに再度フォーカスする
　WorkingPanelの指定のPane番号に再度フォーカスする
## Action：　260619　WorkingPanel.FocusedPane.PaneNumber:Next
description:    フォーカスペインを次のペインに移動する
## Action：　260619　WorkingPanel.FocusedPane.PaneNumber:Prev
description:    フォーカスペインを前のペインに移動する
## Action：　261108　WorkingPanel.FocusedPane.PaneNumber:First
description:    フォーカスペインを最初のペインに移動する
　A（261108実装）：Pane番号（WorkingPanel.FocusedPane.PaneNumber と同じ順）の1番目のPaneにフォーカスします。
　　ショートカット：ExApp の Shift+P、Working フォーカス中の Shift+Alt+PageUp。
## Action：　261108　WorkingPanel.FocusedPane.PaneNumber:Last
description:    フォーカスペインを最後のペインに移動する
　A（261108実装）：Pane番号の最後のPaneにフォーカスします。
　　ショートカット：ExApp の Shift+N、Working フォーカス中の Shift+Alt+PageDown。
　（261108）Next / Prev にも Working フォーカス中の Alt+PageDown / Alt+PageUp を割り当てました（ExApp の N / P は従来どおり）。
## Status：　260619　WorkingPanel.FocusedPane.PaneNumber

　Q：設定値を記載してください。
　A：現在表示されているペインの中でフォーカスされているペインの番号（1始まり）を返します。
　　設定される値は以下の通りです。
　　- `1`〜`6` （表示されているペインの配置順）
　　- `0` （フォーカスされているペインがない場合）

## Action：　261108　WorkingPanel.FocusedPane.FileHistory:AddNew
description:    FocusPaneに現在表示されているファイル種別と同じファイルを新規に作成して表示する
　A（261108実装）：フォーカス中のPaneに表示している Thinkファイルの種別（memo / table / html / chat 等）で
　　新しいファイルを作り、同じPane・同じ表示モードで開きます（ファイル履歴に追加されます）。
　　タイトルは「新規メモ」「新規テーブル」等の仮の名前、Project は「新規プロジェクト」です。
　　Seeds で開いているProjectがあればそこへ登録します。Paneにファイルが無いときは memo を作ります。
　　「FocusedPane > N)新規ファイルを挿入する」から実行します。

## Action：　260814　WorkingPanel.FocusedPane.FileHistory:Menu
description:    フォーカスペインのファイル履歴をメニューで表示して選択する
　フォーカスのあるPaneのファイル履歴を古いもの順でメニューに表示し、上下キーとEnterで選択する
　メニューのスタイルは TextEditor.CurrentEditor.DoOnCursorPos:Menu と同じにしてください。

　A（260814実装）：TTFocusedPanelActions.ts に登録しました。メニューの描画・操作は
　　DoOnCursorPos:Menu と共通の src\utils\monacoMenu.ts（showMonacoMenu / monaco F1風）を
　　そのまま使うため、スタイル・キー操作は完全に同一です。
　　- 並び順は履歴の並びそのまま（＝古いもの順）で、1行に「位置番号／タイトル（無ければID）／
　　　ID」を表示します。現在位置（HistoryPos）の行には先頭に ● を付けます。
　　- ↑↓で選択、Enterで決定してその位置のファイルをLoadします（LoadHistoryAt。履歴移動なので
　　　履歴自体は増えません）。Escでキャンセル、1〜9はニーモニック（数字キー）で即決定できます。
　　- メニューはフォーカスPane（.working-area[data-area-id]）の上端中央に表示します。
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
## Status：　260814　WorkingPanel.FocusedPane.FileHistory
　フォーカスがあるPaneでLoadしたファイルの履歴（古い順・最大30件）をCSVで返す読み取り専用Statusです。

description:    フォーカスがあるペインのLoadファイル履歴（古い順・最大30件のCSV）
key:            WorkingPanel.FocusedPane.FileHistory
current:        ''
default:        ''
type:           string
candidates:     .*
## Status：　260814　WorkingPanel.FocusedPane.FileHistoryPos
description:    フォーカスがあるペインのファイル履歴の現在位置（1始まり。0=履歴なし）
key:            WorkingPanel.FocusedPane.FileHistoryPos
current:        0
default:        0
type:           string
candidates:     ^[0-9]+$
## Status：　260814　WorkingPanel.FocusedPane.FileHistoryMax
description:    フォーカスがあるペインのファイル履歴の件数（最大30）
key:            WorkingPanel.FocusedPane.FileHistoryMax
current:        0
default:        0
type:           string
candidates:     ^[0-9]+$

## Status：　260630　WorkingPanel.Pane.Count
　IDをWorkingPanel.Panes.Countに変更
## Status：　260911　WorkingPanel.Panes.Count
description:    表示されているペインの数
key:            WorkingPanel.Panes.Count
current:        0
default:        0
type:           string
candidates:     ^[0-9]+$
　読み取り専用（isConst）。WorkingPanel.Areas の数から算出するため直接は書き換えられない。
## Status：　260706　WorkingPanel.Panes.Layout
description:    Paneレイアウト構造(JSON)
key:            WorkingPanel.Panes.Layout
current:        null
default:        null
type:           json
candidates:     .*
## Status：　260706　WorkingPanel.Panes.Display
description:    各Paneのロード状態(JSON)
key:            WorkingPanel.Panes.Display
current:        []
default:        []
type:           json
candidates:     .*
