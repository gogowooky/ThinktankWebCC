# TextEditor Edit ==================================================================================================
## Action：　260627　TextEditor.FoldingHeading.IncLevel
description:    見出し行のレベルを1つ上げる（非見出し行は見出し化）
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
　カーソル行または選択範囲内のすべての行に対し
　　Heading行の場合は、HeadginのLevelを1つ減らす。# の場合は# を削除する。
　　Heading行でない場合はなにもしない。
## Action：　260625　TextEditor.Comment.NextStyle
description:    行頭のコメント記号を次のスタイルに変更する
　カーソル位置の行、または、選択されている全行を対象に、コメント記号文字を設定する。　設定ルールは以下の通り。
　各行における 先頭の1文字目
　　TextEditor.Comment.StyleSet に含まれる：　次の値に置換
　　TextEditor.Comment.StyleSet に含まれない：　1文字目の位置に、TextEditor.Comment.StyleSetの1番目の文字を挿入
## Action：　260625　TextEditor.Comment.PrevStyle
description:    行頭のコメント記号を前のスタイルに変更する
　カーソル位置の行、または、選択されている全行を対象に、コメント記号文字を設定する。　設定ルールは以下の通り。
　各行における 先頭の1文字目
　　TextEditor.Comment.StyleSet に含まれる：　前の値に置換
　　TextEditor.Comment.StyleSet に含まれない：　1文字目の位置に、TextEditor.Comment.StyleSetの最後の文字を挿入
## Action：　260625　TextEditor.Bullet.NextStyle
description:    行頭の箇条書き文字を次のスタイルに変更する
　カーソル位置の行、または、選択されている全行を対象に、行頭文字を設定する。　設定ルールは以下の通り。
　行頭文字の位置は、一つ上の行で最初の非空白文字が始まる位置に揃える。一つ上の行に非空白文字がない場合は、対象行の位置を維持する。
　　TextEditor.Bullet.StyleSet に含まれる：　次の値に置換
　　TextEditor.Bullet.StyleSet に含まれない：　上記の位置に、TextEditor.Bullet.StyleSetの1番目の文字を挿入
## Action：　260625　TextEditor.Bullet.PrevStyle
description:    行頭の箇条書き文字を前のスタイルに変更する
　カーソル位置の行、または、選択されている全行を対象に、行頭文字を設定する。　設定ルールは以下の通り。
　行頭文字の位置は、一つ上の行で最初の非空白文字が始まる位置に揃える。一つ上の行に非空白文字がない場合は、対象行の位置を維持する。
　　TextEditor.Bullet.StyleSet に含まれる：　前の値に置換
　　TextEditor.Bullet.StyleSet に含まれない：　上記の位置に、TextEditor.Bullet.StyleSetの最後の文字を挿入

## Action：　260619　TextEditor.EditText.Undo
description:    編集を元に戻す（Undo）
## Action：　260619　TextEditor.EditText.Redo
description:    編集をやり直す（Redo）
## Action：　260727　TextEditor.EditText.Delete
description:    カーソル右の文字を削除する
　monaco-editorでDeleteキーを押したときの動作
## Action：　260727　TextEditor.EditText.Backspace
description:    カーソル左の文字を削除する
　monaco-editorでBackspaceキーを押したときの動作
## Action：　260902　TextEditor.EditText.PasteMarkdown
description:    クリップボードを貼り付ける（Markdownなら見出しを貼付位置の子見出しに調整）
　クリップボードのテキストを貼り付ける。ATX 見出しを含まない場合はそのまま貼り付けて終了。
　含む場合は、貼付位置（カーソル行）を内包する直近の見出しレベル parentLevel を求め、
　貼り付けテキスト中の見出しの最上位が parentLevel+1 になるよう全見出しの # 数を一括シフト
　（1..6 にクランプ）してから貼り付ける。フェンス（```/~~~）内の # は見出し扱いしない。

　A（260902実装）：src\views\actions\textEditorPasteActions.ts に登録。見出し検出は
　　utils/markdownSections.ts の collectHeadings（フェンス対応）を流用。貼付は選択範囲へ
　　editor.executeEdits で行う（選択があれば置換）。エディタ未フォーカス時は [エディタ未フォーカス]、
　　クリップボード読取失敗時は [エラー] を返す。純ロジック reparentPastedHeadings は
　　同ファイルから export（テスト用）。

↓Pasteされるテキストがmarkdownかどうかを判定する → markdownではない場合はそのままPasteして終了
↓markdownの場合は、貼付位置のHeadingレベルを判定し、Pasteテキスト中のHeadingを貼付位置の「子Heading」としてPasteされるようにHeadingの#マークを修正してからPasteする
　（実装内容は下部 # Editor 編集 セクションの TextEditor.EditText.PasteMarkdown の A（260902実装）を参照）

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
## Status：　260911　TextEditor.Bullet.StyleNum
description:    箇条書きスタイルの登録数（TextEditor.Bullet.Marks のアイテム数）
key:            TextEditor.Bullet.StyleNum
current:        9
default:        9
type:           integer
candidates:     ^[0-9]+$
　読み取り専用。TextEditor.Bullet.Marks のCSVアイテム数そのものなので直接は書き換えられない
　（登録数を変えるには Marks を編集する）。
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
## Status：　260911　TextEditor.Comment.StyleNum
description:    コメントスタイルの登録数（TextEditor.Comment.Marks のアイテム数）
key:            TextEditor.Comment.StyleNum
current:        6
default:        6
type:           integer
candidates:     ^[0-9]+$
　読み取り専用。TextEditor.Comment.Marks のCSVアイテム数そのものなので直接は書き換えられない
　（登録数を変えるには Marks を編集する）。

　TextEditor.CurrentEditor.DoOnCursorPos で認識される Url / Filepath / Tag の文字スタイルは
　docs/DefaultColor.md で定義します（TextEditor.Url.Style.* / .Filepath.Style.* / .Tag.Style.*）。

将来的にタグごとに分ける可能性あり、

　TextEditor.Highlighter.Style(1..6).* / TextEditor.Heading.Style(1..6).* / TextEditor.Indent.Style(1..6).* は docs/DefaultColor.md で定義します。
　（WorkingSettingPanel>TextEditor設定 の セクション色 / 字下げ色 / ハイライト色 での変更もそちらの値を書き換えます）

　各パネルのテーマ色は docs/DefaultColor.md の (Thinktank|Seeds|Working|Harvest|ToolBar).Theme.* で定義します。
　　Color   … パネルの基礎色（リボン等）。他のパネル色はこの色から生成します。
　　BgColor … コンテンツ表示部（一覧・チャット等の白地）の背景色。
　　（261009追記）リボン・メニューリボン・縦タブバー・設定トレイ上の文字/アイコン色は、地の明るさから
　　白か黒を自動で選びます（src\utils\panelTheme.ts。白で読める限り白を優先）。明るい基礎色でも
　　Color を変えるだけで読めます。ToolBar だけは従来どおり BgColor が文字色です。

　パネル間ボーダー（スプリッター）のマウスオーバー中／ドラッグ中の色は
　docs/DefaultColor.md の FocusingBorder.Theme.Color で定義します（BgColor / Attrs は未使用）。

## Status：　261009　エディタ基本色のUI（WorkingSettingPanel>TextEditor設定>文字色）
　（261009）旧「文字設定」を上下2つに分けました。上側の基本色（下記）を「文字色」、
　下側のセクション１〜６（TextEditor.Heading.Style(1..6).*）を「セクション色」として別セクションにしています。
　TextEditor設定の色関係のセクションは、上から次の順です（各行は 文字色・B・U・BG で編集）。
　　文字色     … 基本/選択/出現/折畳 ＋ Url/File/Tag（TextEditor.(Url|Filepath|Tag).Style.*。旧「タグ色」を統合）
　　コメント色 … TextEditor.Comment.Marks の各記号 → TextEditor.Comment.Style(n).*
　　項目色 … TextEditor.Bullet.Marks の各記号 → TextEditor.Bullet.Style(n).*
　　セクション色 … TextEditor.Heading.Style(1..6).*
　　字下げ色 … TextEditor.Indent.Style(1..6).*（261114追加）
　　　行頭の TAB の数 n の行で、字下げの後ろの文字に Style(n) を付けます。TAB 6個以上は Style6。
　　　スペースの字下げは数えません。Bullet/Comment の行・見出し行には付けません（そちらの色を優先）。
　　　既定はすべて undefined（色なし）です。
　　ハイライト色 … TextEditor.Highlighter.Style(1..6).*
　（261013）パネル色は WorkingSettingPanel>Pane設定 の「アクション」の下へ移しました。
　　パネル色   … (Thinktank|Seeds|Working|Harvest|ToolBar).Theme.Color（基礎色のみ）、
　　　　　　　　 Border（FocusingBorder.Theme.Color）、Added/Divided/Replaced（DDGhost.*.Theme.Color）
　「文字設定」先頭にあった 背景色 / 文字色 / 選択色 / 一致色 の4項目（旧 TextEditor.Color.*）は廃止し、
　同じ位置で以下のStatusIDを直接編集するUIに置き換えました。Color と BgColor のみを扱い、Attrs のUIは持ちません。
　　基本 … TextEditor.Text.(Color,BgColor)
　　選択 … TextEditor.Selection.Theme.Color
　　出現 … TextEditor.Occurrence.Theme.Color
　　折畳 … TextEditor.FoldingHeader.Theme.Color
　（261013）選択・出現・折畳は TextEditor.(Selection|Occurrence|FoldingHeader).* から .Theme.* へ改名し、
　背景色を BgColor から Color へ移しました（BgColor と Color の役割を入れ替え。Color だけを使います）。
　旧名の保存値と、旧形式で書き戻された ThinktankColorBinding メモは読込時に新しい名前へ読み替えます。
　文字色のUIを持つのは基本だけです。選択は Monaco が選択中の文字色（editor.selectionForeground）を
　高コントラストテーマでしか適用せず、出現は wordHighlight に前景色のテーマ項目がないため、いずれも反映できません。
　選択範囲と出現が重なった部分は選択の色を手前に表示します。
　なお TextEditor.Selection.Theme.Color は、エディタのフォーカスの有無にかかわらず同じ色になります。
　Monaco の既定では非フォーカス時に同色の50%（editor.inactiveSelectionBackground の既定値）になるため、
　テーマ側で editor.inactiveSelectionBackground にも同じ値を明示しています。
　既定値の定義元は他と同じく docs/DefaultColor.md で、専用フィールドを廃止したため値の実体は ColorStatus に一本化されました。
