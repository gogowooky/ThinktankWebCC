# TextEditor ExOpt =================================================================================================
## Action：　260619　TextEditor.LineNumbers.IsVisible:Toggle
description:    行番号表示をトグルする
## Action：　260619　TextEditor.WordWrap.IsVisible:Toggle
description:    折り返し表示をトグルする
## Action：　260619　TextEditor.Minimap.IsVisible:Toggle
description:    ミニマップ表示をトグルする
## Action：　260619　TextEditor.FullWidthSpace.IsVisible:Toggle
description:    全角スペース強調表示をトグルする
## Action：　260619　TextEditor.UnicodeHighlight.IsVisible:Toggle
description:    Unicode文字強調表示をトグルする
## Action：　260619　TextEditor.BracketPairColorization.IsVisible:Toggle
description:    括弧の色分けをトグルする
　上記6つの IsVisible 系トグルは、ショートカット定義が小文字の `:toggle` 表記を使う箇所があるため、
　`{Status ID}:Toggle` と `{Status ID}:toggle` の両方のActionIDを同じハンドラに解決するよう登録している。

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
