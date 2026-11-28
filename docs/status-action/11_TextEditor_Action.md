# TextEditor Action ================================================================================================
## Action：　261008　TextEditor.CurrentEditor.DefaultAction
texteditorのdefaultのアクションを実施する。（＝action bubleを停止させずにそのままthroughする）

description:    テキストエディタのdefaultアクション

　A（261008実装）：src\views\TTShortcutManager.ts の _processEvent で特別扱いするようにしました。
　　押されたキーに一致する行（現在の focus / exmode で絞り込み済み）の中にこのアクションがあれば、
　　preventDefault / stopPropagation を行わず、同じキーの他の行も一切実行せずに終了します。
　　キーイベントはそのまま Monaco に届き、エディタ既定の動作（例: Ctrl+B 等の既定編集操作）になります。
　　行の並び順に関係なく他の行より優先されます。
　　用途は「グローバル（focus=*）に割り当てたキーを、エディタ内でだけ既定動作に戻す」ことで、
　　docs\DefaultShortcut.md に例えば次のような行を足して使います。
　　　*TextEditor ,       ,Ctrl+B ,TextEditor.CurrentEditor.DefaultAction ,エディタ既定動作
　　ステータスバーの KeyAction には「TextEditor.CurrentEditor.DefaultAction: 既定動作」と表示します。
　　TTActions にも登録済み（src\views\TTFocusedPanelActions.ts）ですが、コマンド等から直接実行した
　　場合は素通しするキーが無いため何もしません。キー割当は DefaultShortcut.md には追加していません。

## Action：　260814　WorkingPanel.FocusedPane.FileHistory:Next
description:    フォーカスペインのファイル履歴を1つ後の位置に進める
　Workingパネルに表示されているPane毎に、最大30個までのLoadファイルの履歴リストを設定し、以下ルールで運用してください。
　1. 最初のファイルがLoadされると、ファイル履歴にIDを記録し、HistoryPosとHistoryMaxを1にします。
　2. 次のファイルがLoadされると、ファイル履歴にIDを追加し、HistoryPosとHistoryMaxを+1します。
　3. HistoryMaxが31に達した場合は、履歴の2-30を1-29にスライドし、30番目に新しいIDを追加し、HistoryPosとHistoryMaxは30のままにしてください。

　このActionは、フォーカスのあるPaneのファイル履歴において、HistoryPosのみを+1し、その位置のIDをLoadします。　HistoryPosがHistoryMaxのときは何もロードしません。
　（260814修正：:Prev と動作を入れ替えました。修正前は「HistoryPosを-1」でした）

### A（260814実装）：履歴の実体は Pane（TTWorkingArea）ごとの FileHistory / HistoryPos として
　　src\views\TTWorkingArea.ts に持たせました。HistoryMax は FileHistory の件数から求まる
　　派生値（getter）です。履歴への記録は TTWorkingArea.OpenThink()（＝Paneへのファイル
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
　　Status（読み取り専用）として WorkingPanel.FocusedPane.FileHistory（IDのCSV）／
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
## Action：　260814　WorkingPanel.FocusedPane.FileHistory:Prev
description:    フォーカスペインのファイル履歴を1つ前の位置に戻す

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
　CursorPos位置が、url, filepath, tag のいずれかを表す部分であれば、下記のそれぞれについて実行してください。
　url:      TextEditor.CurrentEditor.DoOnCursorPos:Url:*　をメニューで表示し選択して実施
　filepath: TextEditor.CurrentEditor.DoOnCursorPos:File:*　をメニューで表示し選択して実施
　tag:      TextEditor.CurrentEditor.DoOnCursorPos:Tag:*　をメニューで表示し選択して実施
　いずれでもない場合はmenuからtagを選択して挿入します。
　（261014修正）文字を選択しているときは、カーソル位置の種別にかかわらず「タグ挿入」メニューを出し、
　　選択文字を選んだタグの値の位置（閉じ括弧の直前）に入れて囲みます（例：「東京タワー」→ [Google:東京タワー]）。
　　それまでは選択文字がタグで置き換わって消えていました。処理は TextEditor.CurrentEditor.DoOnCaretPos の
　　文字選択時と同じ関数（textEditorCursorContentActions.ts の insertTagFromMenu）を使います。
　　1回の編集にまとめるので Undo 1回で元に戻り、クリップボードも使いません。
　（261014修正）url / filepath / tag のメニューの中身を docs\DefaultMenu.md から作るようにしました。
　　メニュー名はカーソル位置の種類（Url / File / WebSearch / GoogleRoute / YahooTransfer / Think / Mail / Chat / AI / Anchor）で、
　　そのメニュー名で始まる行が項目になり、ID 列の ActionID を実行します（例："WebSearch > D)タグを除く", TextEditor.CurrentEditor.DoOnCursorPos:DeTag）。
　　並び順・表示名・先頭文字キーも DefaultMenu.md で決めます。それまでは ActionID が DoOnCursorPos:{種類}: で
　　始まるアクションを集めて並べていましたが、何が出るかがコードを読まないと分からないため改めました。
　　メニュー名の行が無い種類では「メニュー項目がありません」と表示します。メニューのタイトルは「種類: カーソル位置のテキスト」です。

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
　CursorPos位置が、urlを表す部分であれば、ブラウザで対象のURLを開いてください。
## Action：　261108　TextEditor.CurrentEditor.DoOnCursorPos:Url:ToTag
description:    カーソル位置のURLを読み取りタグ化する
　A（261108実装）：カーソル位置の http(s) URL の linkファイルを用意し、URL を参照タグ（Caption 付き）に置き換えます
　　（例：https://drive.google.com/file/d/xxx/view → [gdrive:ID] 見積書.pdf）。
　　同じリンク先の linkファイルがあれば新しく作らずそれを使います。Seeds で開いているProjectがあればそこへ登録します。
　　GDrive・GMail は GAS が設定されていれば名前・件名を問い合わせます（docs\261108\GASリンクタイトル取得.md）。
　　キャレットはタグの直後、Undo 1回で元に戻ります。DoOnCursorPos:Menu の「Url > T)タグ化する」から実行します。
## Action：　261108　TextEditor.CurrentEditor.DoOnCursorPos:File:ToTag
description:    カーソル位置のファイルパスを読み取りタグ化する
　A（261108実装）：カーソル位置のファイルパス（引用符で囲んだパス、file:// を含む）の linkファイルを用意し、
　　パスを参照タグ（例：[file:ID] plan.md、[dir:ID] Pictures）に置き換えます。引用符ごと置き換えます。
　　ファイルかフォルダかは PC版では実際に確かめ（system:isDirectory）、ブラウザ版では末尾の区切りで判断します。
　　同じリンク先の再利用・Project登録・キャレット位置は Url:ToTag と同じです。「File > T)タグ化する」から実行します。

## Action：　260630　TextEditor.CurrentEditor.DoOnCursorPos:File:Open
description:    カーソル位置のファイルパスをOS既定アプリで開く
　CursorPos位置が、filepathを表す部分であれば、サーバーAPI(/api/system/open)を経由し、OSの規定のアプリでローカルファイル/フォルダを起動してください。
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:WebSearch:Open
description:    外部ブラウザで表示する
## Action：　261014　TextEditor.CurrentEditor.DoOnCursorPos:DeTag
description:    タグを除く

　A（261014実装）：カーソル位置の [ID:値] タグを、値の文字だけに置き換えます（例：[Google:東京タワー] → 東京タワー）。
　　キャレットは値の直後。Undo 1回で元に戻ります。
　　ID 部分の無いタグ（[TAG]、Anchor の [:見出し]）やタグ以外の位置では何もしません。
## Action：　261014　TextEditor.CurrentEditor.DoOnCursorPos:ReTag
description:    タグを選択しなおす

　A（261014実装）：「タグ挿入」メニュー（docs\DefaultMenu.md）でタグを選び、値はそのままでタグだけを替えます
　　（例：[Google:東京タワー] → [Bing:東京タワー]）。キャレットは値の直後（閉じ括弧の手前）、Undo 1回で元に戻ります。
　　メニューでの選択と書き換えは DoOnCursorPos:Menu の文字選択時と同じ処理（insertTagFromMenu）です。
　（261014）当初は DoOnCursorPos:WebSearch:DeTag / :ReTag として WebSearch タグ専用に作りましたが、
　　タグの種類によらない共通のアクションに改めました。どのタグのメニューに出すかは docs\DefaultMenu.md で決めます
　　（DoOnCursorPos:Menu の 261014 の記載を参照）。
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:GoogleRoute:Open
description:    カーソル位置のGoogleRouteタグでGoogleマップのルートを開く
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:YahooTransfer:Open
description:    カーソル位置のYahooTransferタグでYahoo!乗換案内を開く
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Think:Open
description:    カーソル位置のThinkタグで対象Thinkを開く、またはタイトル・コンテンツ検索する
## Action：　261108　TextEditor.CurrentEditor.DoOnCursorPos:Link:FromTag
description:    カーソル位置のLinkタグが示す linkファイルのリンク先に置換する
　A（261108実装）：カーソル位置の Link タグを、linkファイルの # Link の値に置き換えます。URL はそのまま、
　　パスは引用符で囲みます（"C:\path\file.md"）。タグの直後にそのファイルの Caption（「 見積書.pdf」等）が
　　残っていれば、それも一緒に置き換えます。linkファイル自体は消しません。
　　キャレットは置き換えた文字の直後、Undo 1回で元に戻ります。「Link > U)リンク先（URL・パス）に置き換える」から実行します。

## Action：　261030　TextEditor.CurrentEditor.DoOnCursorPos:Link:Open
description:    カーソル位置のLinkタグが指す linkファイルのリンク先を開く
　A（261030実装）：[link:ID] [gmail:ID] [gdrive:ID] [gphoto:ID] [gnb:ID] [file:ID] [dir:ID]（タグ名の大文字小文字は問わない）の
　　ID の linkファイルを読み、# Link のURLをブラウザで、パスをOS既定のアプリ（PC版のみ）で開きます。
　　値が ThinkID でないタグ（[GMail:検索語] 等）は Link タグとして扱いません（docs\261028 のタグ増設計画に残す）。
　　旧書式（箇条書きのリンク集）の linkファイルは先頭のリンクを開きます。http(s) 以外のURLは開きません。
　　DoOnCursorPos（ダブルクリック等）で Link タグを実行したときの既定動作です。書式は docs\261030\linkファイル仕様.md。
## Action：　261030　TextEditor.CurrentEditor.DoOnCursorPos:LinkFile:Open
description:    カーソル位置のLinkタグが指す linkファイル自体をWorkingで開く
　A（261030実装）：[THINK:ID] と同じく、フォーカス中のPaneに linkファイルを開いてエディタへフォーカスします。
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Mail:Open
description:    カーソル位置のMailタグでメールを開く、またはメール検索する
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Chat:Open
description:    カーソル位置のChatタグでThink一覧をchatフィルター検索する
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:AI:Open
description:    カーソル位置のAIタグで外部AIに問い合わせる
## Action：　260709　TextEditor.CurrentEditor.DoOnCursorPos:Anchor:Open
description:    カーソル位置のAnchorタグでファイル内アンカーへ移動、またはHighlighter設定する
## Action：　260630　TextEditor.CurrentEditor.DoOnCursorPos
description:    カーソル位置がURL/パス/タグであれば対応するOpenアクションへ分岐実行する
　CursorPos位置が、url, filepath, tag のいずれかを表す部分であれば、下記のそれぞれについて実行してください。
　url:      TextEditor.CurrentEditor.DoOnCursorPos:Url:Open　を実施
　filepath: TextEditor.CurrentEditor.DoOnCursorPos:File:Open　を実施
　tag:      TextEditor.CurrentEditor.DoOnCursorPos:Tag:Open　を実施
　※ダブルクリック（Left2）起動時などの状態更新ズレ（一回前のリンクが起動する問題）をエディタ同期関数（syncTextOnCursor）の導入により修正完了。
## Action：　261013　TextEditor.CurrentEditor.DoOnCaretPos
description:    文字選択中は選択文字をタグで囲み、選択していなければ DoOnCursorPos と同じく対象を開く
　・文字選択状態の場合
　　↓タグ挿入メニュー（docs/DefaultMenu.md の「タグ挿入」。utils/defaultMenu.ts の showDefaultMenu）を表示
　　↓IDがnull → 終了
　　↓選択文字を切り取って、IDのタグ（[ID:]、Jump は [:>]、Reference は [:]）を挿入し、
　　　挿入後キャレット位置（閉じ括弧の直前）に選択文字をペーストする → 終了
　　　（クリップボードは使わず1回の編集で行うので、Undo 1回で元に戻る。キャレットは貼り付けた文字の直後）
　・文字選択状態でない場合は、TextEditor.CurrentEditor.DoOnCursorPos を実施。
　キー割当は docs\DefaultShortcut.md には追加していない（TTActions.Execute / コマンドから実行可能）。
## Status：　260629　TextEditor.CurrentEditor.TextOnCursorPos
description:    現在のエディタのカーソル位置のテキスト（URL、ファイルパス、タグなど）
key:            TextEditor.CurrentEditor.TextOnCursorPos
current:        
default:        
type:           string
candidates:     .*
