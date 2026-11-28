# TextEditor Heading ===============================================================================================
## Action：　260622　TextEditor.CurrentFolding.Heading:OpenStepwise
description:    見出し行を段階的に開く（Close→Open、Open→子をOpen）
　以下の手順を実装してください。
　↓　現カーソルがあるHeading行がCloseである場合は、Heading行をOpenにして終了します。
　↓　現カーソルがあるHeading行がOpenである場合、子Heading行をすべて抽出し、自Heading行や孫Heading行が含まれないことを確認し、抽出した子HeadingのすべてをOpenにして終了します
## Action：　260622　TextEditor.CurrentFolding.Heading:CloseStepwise
description:    見出し行を段階的に閉じる（Open→Close、Close→兄弟をClose）
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
description:    親見出し行へ移動する
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
description:    次の兄弟見出し行へ移動する
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
description:    前の兄弟見出し行へ移動する
　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　前の兄弟Heading行に移動（前の兄弟Heading行が存在しない場合は、移動しません。）

　A（260826実装）：SiblingNextと同じ textEditorHeadingNavActions.ts に11番目のアクションとして
　　追加しました。同じ親・同レベルで、h自身より前方（offsetが小さい）にある直近のHeadingへ
　　移動する点以外はSiblingNextと共通のロジックです。前の兄弟が存在しない場合は
　　「前の兄弟見出しなし」を返すのみで、カーソルは移動しません。
## Action：　260626　TextEditor.CurrentFolding.Heading:SiblingFirst
description:    最初の兄弟見出し行へ移動する

　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　現在位置が兄弟Heading行のなかで１番目である場合、親Heading行へ移動
　↓　１番目の兄弟Heading行に移動
## Action：　260626　TextEditor.CurrentFolding.Heading:SiblingLast
description:    最後の兄弟見出し行へ移動する

　以下の手順を実装してください。
　↓　カーソル位置のテキストが属するHeading行を把握
　↓　現在位置が兄弟Heading行のなかで最後である場合、親Heading行の次の兄弟Heading行へ移動
　↓　最後の兄弟Heading行に移動
## Action：　260621　TextEditor.CurrentFolding.Heading:VisibleNext
description:    次の表示中見出し行へ移動する（非表示の見出しは除外）
　親HeadingのCloseによって非表示のHeadingには移動しません。すべての親Headingが表示されているHeadingにのみ移動するように修正してください。　
　（260827：ActionIDを VisibleForward から VisibleNext に変更。処理内容の変更はありません。）
## Action：　260621　TextEditor.CurrentFolding.Heading:VisiblePrev
description:    前の表示中見出し行へ移動する（非表示の見出しは除外）
　親HeadingのCloseによって非表示のHeadingには移動しません。すべての親Headingが表示されているHeadingにのみ移動するように修正してください。　
　（260827：ActionIDを VisibleBackward から VisiblePrev に変更。処理内容の変更はありません。）

## Action：　260826　TextEditor.CurrentEditor.Folding:OpenAll
description:    すべての見出しを展開する
　以下の手順を実装してください。
　↓　全Heading行をOpenにして終了します。

　A（260826実装）：textEditorCurrentFoldingActions.ts に実装しました。
　　Monaco標準の editor.unfoldAll をそのまま起動し、Heading行に限らずコードブロック等の
　　折畳領域も含めてすべて展開します。
## Action：　260826　TextEditor.CurrentEditor.Folding:CloseAll
description:    カーソルを最上位の親見出し行へ移動し、すべての見出しを折り畳む
　以下の手順を実装してください。
　↓　現カーソル行を、最上位の親Heading行に移動します。
　↓　全Heading行をCloseにして終了します。

　A（260826実装）：textEditorCurrentFoldingActions.ts に実装しました。
　　現カーソル位置以前でレベル1の直近のHeadingを探索し、見つかればそこへ移動した上で
　　（見出しが1つも無い場合は移動をスキップ）、Monaco標準の editor.foldAll を起動します。
　　（260826修正：ActionIDを OpenClose から CloseAll に変更。処理内容の変更はありません。）
## Action：　260826　TextEditor.CurrentEditor.Folding:OpenLv2
description:    Level1,2の見出しを展開し、Level3以上の見出しを折り畳む
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
description:    Level1の見出しを展開し、Level2以上の見出しを折り畳む
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
