# TextEditor Cursor Highlighter ====================================================================================
## Action：　260714　TextEditor.CurrentEditor.CursorPos:PrevHighlighter
description:    Highlighter検索の前のヒットへ移動する
　↓ Highlighterに設定されたテキストを検索して前のヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する
## Action：　260714　TextEditor.CurrentEditor.CursorPos:NextHighlighter
description:    Highlighter検索の次のヒットへ移動する
　↓ Highlighterに設定されたテキストを検索して次のヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する
## Action：　260714　TextEditor.CurrentEditor.CursorPos:FirstHighlighter
description:    Highlighter検索の先頭ヒットへ移動する
　↓ Highlighterに設定されたテキストを検索して先頭ヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する
## Action：　260714　TextEditor.CurrentEditor.CursorPos:LastHighlighter
description:    Highlighter検索の末尾ヒットへ移動する
　↓ Highlighterに設定されたテキストを検索して末尾ヒットへ移動する　→　終了
　Hilighterに設定されたテキストをカンマ(,)と空白( )で区切ってOR条件で検索する

　A：検索語は ToolBar.HighlighterMode.Text（= WorkingPanel.HighlightWord）を、
　　ハイライト表示と同じ規則でカンマ・空白区切りに分解し、OR条件（大文字小文字を区別）で検索します。
　　ヒット位置の先頭にカーソルを移動し、画面外なら中央にスクロールします。
　　Prev/Next は循環しません（端では移動せず「これ以上ヒットなし」）。
　　キー割当（docs\DefaultShortcut.md）: Ctrl+Shift+P/N = Prev/Next、Ctrl+Alt+P/N = First/Last
