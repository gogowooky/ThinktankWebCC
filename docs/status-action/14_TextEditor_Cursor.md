# TextEditor Cursor ================================================================================================
## Action：　260906　TextEditor.CurrentEditor.CursorPos:Focus
description:    現在のTextEditorにカーソル位置でフォーカスを戻す
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
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevChar
description:    カーソルを1文字前に移動する
　↓ カーソルを１文字前に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextChar
description:    カーソルを1文字後に移動する
　↓ カーソルを１文字後に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevWord
description:    カーソルを1ワード前に移動する
　↓ カーソルを１ワード前に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextWord
description:    カーソルを1ワード後に移動する
　↓ カーソルを１ワード後に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevLine
description:    カーソルを1行前に移動する（文書先頭行では行頭へ）
　↓ CurPosが文書先頭行だった場合　→　カーソルを先頭行行頭に移動する　→　終了
　↓ monaco editor defaultのArrowUpの移動位置に移動する　→　終了
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextLine
description:    カーソルを1行後に移動する（文書最終行では末尾へ）
　↓ CurPosが文書最終行だった場合　→　カーソルを最終行末尾に移動する　→　終了
　↓ monaco editor defaultのArrowDownの移動位置に移動する　→　終了

　A：独自のカラム計算をやめ、Monaco既定コマンド（cursorUp / cursorDown）に委譲しました。
　　これにより折り畳み行のスキップ・折り返し行・カラムのスティッキー復元が既定どおりになります。
## Action：　260628　TextEditor.CurrentEditor.CursorPos:LineStart+
description:    カーソルを行頭→テキスト先頭の順に移動する。テキスト先頭では全選択する
　↓ CurPosが行先頭ではない場合、CurPosを現在行の先頭位置に移動する　→　終了
　↓ CurPosが行先頭だがテキスト先頭ではない場合、CurPosをテキスト先頭位置に移動する　→　終了
　↓ CurPosがテキスト先頭の場合、カーソルがテキスト先頭にある状態でテキストすべてを選択する
## Action：　260628　TextEditor.CurrentEditor.CursorPos:LineEnd+
description:    カーソルを行末→テキスト末尾の順に移動する。テキスト末尾では全選択する
　↓ CurPosが行末尾ではない場合、CurPosを行末尾位置に移動する　→　終了
　↓ CurPosが行末尾だがテキスト末尾ではない場合、CurPosをテキスト末尾位置に移動する　→　終了
　↓ CurPosがテキスト末尾の場合、テキストすべてを選択する
　（261108）テキスト末尾へ移動するとき、末尾が折畳で隠れていれば、末尾を含む見出し（祖先を含む）をすべて開いてから
　　キャレットを置きます（unfoldRegionsHidingLine）。隠れていなければ折畳状態は変えません。
## Status：　260629　TextEditor.CurrentEditor.CursorPos
description:    現在のエディタのカーソルのOffset位置
key:            TextEditor.CurrentEditor.CursorPos
current:        0
default:        0
type:           string
candidates:      .*
