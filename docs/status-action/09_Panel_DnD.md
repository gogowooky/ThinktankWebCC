# Panel D&D ========================================================================================================
## Action：　260724　WorkingPanel.DroppedFile.ID:Load
description:    DropされたThinkファイルをPaneにLoadする
　IDを WorkingPanel.DroppedFile.ID:Load に修正してください。

　DropされたThinkファイルをPaneにLoadする

　A（260724修正）：ActionID を 'WorkingPanel.Load.DroppedFile' から 'WorkingPanel.DroppedFile.ID:Load'
　　に変更しました（TTFocusedPanelActions.ts の TTActions.Register、WorkingArea.tsx /
　　WorkingPanel.tsx の実行・判定箇所、docs\DefaultShortcut.md の ThinkFileDrag 割当を統一）。
　　命名規則（{Status ID}:*）に合わせ、対応するStatus WorkingPanel.DroppedFile.ID の実装と
　　あわせて対応しました。
## Action：　260724　WorkingPanel.DroppedFile.ID:Insert
description:    DropされたThinkファイルを[memo:{ID}]タグとしてコンテンツ内に挿入する
　IDを WorkingPanel.DroppedFile.ID:Insert に修正してください。

　DropされたThinkファイルの内容ではなく `[memo:{ID}]` タグをコンテンツ内に挿入する
　Drop開始時にModifierキーを確認し、Alt+ThinkFileDragであればゴーストを表示せず、
　mouseoverに合わせてカーソルを移動させる

　A（260724修正）：ActionID を 'WorkingPanel.Insert.DroppedFile' から
　　'WorkingPanel.DroppedFile.ID:Insert' に変更しました（対応箇所はLoad側と同様）。

　A（260716時点）：ThinkFileDrag（修飾なし）/ Alt+ThinkFileDrag の判定を
　　TTShortcutManager.resolveDragAction('ThinkFileDrag', e) で行っていましたが、この時点では
　　ActionID文字列を各Dropハンドラー内でif分岐するだけで、TTActions.Registerによる正式な
　　Action登録ができておらず、TTActions.Has('WorkingPanel.Load.DroppedFile') が false を
　　返す状態でした（＝「Actionの実装ができていない」状態）。

　A（260718修正）：以下のとおり、TTActions.Registerで正式に2つのActionを登録し、
　　全てのDropハンドラーがTTShortcutManager.resolveDragAction()でActionIDを解決した後、
　　TTActions.Execute()経由で実行するよう統一しました。
　　- ドラッグ中のペイロード（ThinkID・配置先情報）はキーボードイベントに乗せられないため、
　　　TTShortcutManager.setPendingThinkDrop() / consumePendingThinkDrop() で明示的に
　　　受け渡します（ThinkDropContext型、TTShortcutManager.tsに定義）。
　　- WorkingPanel.Load.DroppedFile: 'load-replace'（タイトルバードロップ、指定Areaを
　　　丸ごと差し替え）と 'load-place'（コンテンツ領域の余白/端へのドロップ、WorkingPanel側で
　　　計算済みのオーバーレイ位置に新規Paneを追加）の2種類のcontextを受け取り分岐します。
　　- WorkingPanel.Insert.DroppedFile: thinkIdのみを受け取り、事前に
　　　TTShortcutManager.setActiveEditor()でセットされたエディタのカーソル位置へ
　　　`[memo:{ID}]` を挿入します。TextEditorMediaRef.getEditor()で対象ペインの
　　　生Monacoインスタンスを取得し、タイトルバー・コンテンツ領域どちらのドロップでも
　　　同じActionを共通実行します。
　　Insertはテキストエディタ（texteditor/working）でのみ実装しており、Markdown等の
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
　　ドロップ先各所（WorkingMenuRibbon/WorkingPanel）のdropEffectもAltを無視して
　　常に'copy'固定になっていた点も、Alt押下時は'link'を示すよう修正しました
　　（同一問題を引き起こしていた可能性のある副次的な要因のため、あわせて是正）。

　Q（260718・2回目）：上記対応後、タイトルバーへのAlt+Dropでは正しくInsertになるが、
　　コンテンツ領域へのAlt+Dropでは依然Loadになってしまう。
　A：コンテンツ領域の判定は TextEditorMedia.handleDrop 単体で resolveDragAction() を
　　呼び、Insert時のみそこで消費・それ以外はWorkingPanelの body-level ハンドラーへ
　　バブリングさせてLoadを行う、という2箇所の判定に分かれた設計になっていました。
　　実機の実ドラッグでは、Monaco内部のDOM構造やイベント配送の都合で、この2箇所の
　　判定・タイミングがずれてInsertを取りこぼすケースがあると判断し、コンテンツ領域への
　　Thinkドロップの判定・実行を WorkingPanel.handleBodyDrop 側の1箇所に一本化しました。
　　- TTShortcutManager に areaId→生Monacoインスタンスのレジストリ
　　　（registerAreaEditor/unregisterAreaEditor/getAreaEditor）を追加し、
　　　TextEditorMediaがマウント/アンマウント時に自身のエディタを登録・解除する
　　　（MediaProps.areaId、WorkingAreaからarea.IDとして渡す）
　　- WorkingPanel.handleBodyDrop は、ドロップ位置の直下に既存Pane（overlay.areaId）が
　　　あり、かつそのPaneのエディタが登録済みの場合のみresolveDragAction()でInsert判定を
　　　行い、getAreaEditor()で取得したエディタを対象にInsertを実行する。それ以外
　　　（新規Pane追加位置へのドロップ等、挿入先が無い場合）は従来通りLoadにフォールバックする
　　- TextEditorMedia.handleDrop は application/x-thought-id を検出したら常に
　　　早期returnし、Load/Insertいずれの判定も行わない（Files経由のドロップのみ処理する）
　　実機での複数Pane環境でも、ドロップした特定Paneのエディタにのみ挿入され、
　　他のPaneへ誤って挿入されないことを確認済みです。

　Q（260718・3回目）：Drop開始時にModifierキーを確認し、Alt+ThinkFileDragであれば
　　ゴーストは表示せず、mouseoverに合わせてカーソルを移動させてほしい。
　A：WorkingPanel.handleBodyDragOver で、Insertが成立する条件（ドロップ位置直下に
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
　　WorkingPanel領域内への「新規Pane追加」ゴースト（緑）が消えず、Alt押下時にも
　　関わらずInsertではなくLoadが起動してしまう。また、Alt押下時はDrop先のCaretを
　　表示してマウスに追随させてほしい。
　A：computeDropOverlay()は、既存Paneへのヒットテストより先に、WorkingPanel本体の
　　外縁からの距離（OUTER_RATIO=15%）だけでisOuterを判定し、trueなら無条件に
　　「新規Pane追加」（緑ゴースト、overlay.areaIdなし）を返す実装でした。既存Paneは
　　通常WorkingPanel本体の端まで隙間なく敷き詰められるため、本体の外縁付近（15%
　　マージン内）にある既存Paneをホバーした場合、isOuterがtrueになりoverlay.areaId
　　が付かないまま「追加」ゴーストが確定してしまい、直前のInsert判定（overlay.areaId
　　必須）が常にfalseになっていたことが原因でした（単一Pane構成では、本体の端＝Paneの
　　端でもあるため必ず再現します）。
　　isOuterの判定ロジック自体を変更するとLoad（新規Pane追加）側の既存挙動に影響するため、
　　isOuterとは独立した findWorkingAreaIdAtPoint(clientX, clientY) を新設し、
　　document.elementsFromPoint() で座標直下の .working-area[data-area-id] を
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
　　DOMフォーカスに依存しない方式に切り替え、WorkingPanel側で editor.
　　getScrolledVisiblePosition() によりモデル位置をピクセル座標へ変換し、
　　独自の点滅バー要素（.working-panel__insert-caret、WorkingPanel.tsxの
　　insertCaret state）をゴーストオーバーレイと同じ絶対配置レイヤーに描画する
　　方式にしました。Monacoへの setPosition() / focus() 呼び出し自体は挿入位置の
　　確定や副次的なフォーカス合わせのため残していますが、視覚的なCaret表示は
　　この独自オーバーレイのみに依存し、DOMフォーカスの成否に左右されません。
　　実機検証で、Alt押下中は独自Caretが表示されマウス位置に追従し、Alt解除・
　　dragleave・drop完了のいずれでも正しく消去されること、Alt非押下時はCaretが
　　一切表示されず従来通り緑ゴーストのみが出ることを確認しました。
## Status：　260724　WorkingPanel.DroppedFile.ID
　各パネルのThink一覧のThinkファイルがWorkingパネル内にDropされた際に、そのファイルのIDが設定されます。

description:    WorkingパネルにDropされたThinkファイルのID
key:            WorkingPanel.DroppedFile.ID
current:        ''
default:        ''
type:           string
candidates:     .*

　A（260724実装）：TTUIStateManager に読み取り専用（isConst）のStatusとして登録しました。
　　実体は TTWorkingPanel.DroppedFileID（新設フィールド）で、WorkingPanel.DroppedFile.ID:Load /
　　WorkingPanel.DroppedFile.ID:Insert の各Actionが、DropされたThinkの thinkId をドロップ成立
　　直後（Load側はPane差し替え/新規Pane追加の成否によらず、Insert側はエディタ未選択でも）に
　　設定します。

## Action：　261030　TextEditor.CurrentEditor.DDInsert:Link
description:    D&DされたURLまたはパスをそのままテキストとして挿入する
　browser等のURL、Explorer等のファイルパス、URL/パス形式のテキスト、URL/パスを指す
　WindowsショートカットがTextEditorへD&Dされたとき、「URL.D&D」または「FILEPATH.D&D」
　メニューから選択して、ドロップ位置へリンク先文字列を挿入します。URLはそのまま、
　ファイルパスは `"C:\\folder\\file.ext"` のように引用符で囲んで挿入します。
## Action：　261030　TextEditor.CurrentEditor.DDInsert:Menu
description:    D&Dされた外部URLまたはパスの挿入方法をメニューから選ぶ
　LocalFileDrag（ブラウザURL・ローカルファイル・ディレクトリ）を受け取り、統一された
　「LINK.D&D」メニューを表示します。URLとパスの最終的なタグ種別はAction側で判別します。
　ブラウザ専用のBrowserLinkDragは設けず、URLもLocalFileDragへ正規化します。
　（261030）ディレクトリ用のLocalDirDragは割り当てるActionがファイルと同じだったため廃止し、
　　ディレクトリもLocalFileDragとして扱います。
## Action：　261030　TextEditor.CurrentEditor.DDInsert:Tag
description:    D&DされたURLまたはパスのlinkファイルを作成し、参照タグを挿入する
　同じD&Dメニューから選択すると、URL/パスを1件のlinkファイルとして保存し、リンク先に応じた
　GMail / GDrive / GPhoto / GNB / file / dir / link タグをドロップ位置へ挿入します。
　WindowsのInternet Shortcut（.url）とShell Link（.lnk、Electron版）はリンク先を解決します。
　メニュー定義はdocs\DefaultMenu.md、linkファイル書式とタグ判定はsrc\utils\linkFormat.tsに集約しています。
　Electron版で画像等のローカルファイルをTextEditorへD&Dした場合も、Pane作成へ流さず
　LocalFileDragとしてLINK.D&Dメニュー（またはAlt時のTag Action）へ渡します。
　linkファイルではpathを引用符で囲み、Affiliationを「(PC名)親フォルダ」で記録します。


