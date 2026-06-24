# IDの命名規則および設計ルール
<!--
本アプリの Action と Status の ID ルール：
1. Action/Statusはともに、*.*.* 形式のIDを基本とします。
2. Statusは読み取り専用とします。
3. Status値の変更はActionで行い、そのActionのIDは、{Status ID}:*形式のIDとします。
-->

# AIへの指示
・ 本ファイルでは、実装または修正をしてほしいStatusまたはActionについて、以下のフォーマットで記載いたします。記載内容に基づいて対応してください。対象とする記載は空行までとし、空行後の記載は無視してください。完了後はコミットコメントに概要を記入し、commit&pushしてください。その他以下は、見出し行の指示に従って実装、調査、修正等を行ってください。また、対応中のタイトルが分かるように表示してください。
(行頭) ## 実装：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて実装し、日付を変更してください。
(行頭) ## 修正：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容に基づいて修正し、日付を変更してください。
(行頭) ## 調査：　日付　ID　　⇒　指定IDのStatus/Actionをコンテンツ内容について調査・回答を追記し、日付を変更してください。
(行頭) ## 完了：　日付　ID　　⇒　指定IDのStatus/Actionについては変更の必要はありません。

# Action

# Status

## Status：　260624　Overview.Thought.Name
　Overviewパネルに設定された thoughtファイルの IDです。

description:    OverviewパネルのthoughtファイルID
key:            Overview.Thought.Name
current:        none
default:        none
type:           string
candidates:     .*

## 完了：　260624　TextEditor.Style.Section
　本IDは廃止されました。


## 

1. システムで使用されているもの（使用中）
エディタの各種配色、および各見出し階層（セクション）ごとのカラー設定は、状態管理マネージャー（

TTUIStateManager.ts
）およびコンポーネント上で完全に機能しています。

TextEditor.Color.Background（エディタ背景色）
TextEditor.Color.Text（エディタ文字色）
TextEditor.Color.Selection（テキスト選択範囲の背景色）
TextEditor.Color.Occurrence（一致する単語の強調色）
TextEditor.SectionStyle.Preset1 〜 Preset5（セクションスタイルプリセット）
各JSON定義の中に "color": "#569cd6" のような階層ごとの配色データが指定されており、エディタ見出しのカラー表示に適用されています。
2. 記述はあるが、システムで使用されていないもの（未使用）
ワークアウトパネルのハイライト（キーワード強調）配色に関する以下の 6点 は、

DefaultStatus.md
 に記載がありますが、現在はプログラムで使用されていません。

WorkoutPanel.Style.Highlight（ハイライトスタイル選択）
WorkoutPanel.HighlightStyle.Preset1 〜 Preset5（ハイライト配色のプリセット）
JSON定義の中に {"backgroundColor":"#fff0b3","color":"#1a1a1a"} などの配色データが定義されています。



# OK =================================================================================================================
## Status：　260624　TextEditor.Highlighter1.Color
ハイライト1の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ1＞文字 で変更した場合に反映される。

description:    ハイライト1の文字色
key:            TextEditor.Highlighter1.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter1.BgColor
ハイライト1の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ1＞背景 で変更した場合に反映される。

description:    ハイライト1の背景色
key:            TextEditor.Highlighter1.BgColor
current:        #fff0b3
default:        #fff0b3
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter1.Attrs
ハイライト1の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ1＞属性 で変更した場合に反映される。

description:    ハイライト1の属性
key:            TextEditor.Highlighter1.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter2.Color
ハイライト2の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ2＞文字 で変更した場合に反映される。

description:    ハイライト2の文字色
key:            TextEditor.Highlighter2.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter2.BgColor
ハイライト2の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ2＞背景 で変更した場合に反映される。

description:    ハイライト2の背景色
key:            TextEditor.Highlighter2.BgColor
current:        #ffb3b3
default:        #ffb3b3
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter2.Attrs
ハイライト2の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ2＞属性 で変更した場合に反映される。

description:    ハイライト2の属性
key:            TextEditor.Highlighter2.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter3.Color
ハイライト3の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ3＞文字 で変更した場合に反映される。

description:    ハイライト3の文字色
key:            TextEditor.Highlighter3.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter3.BgColor
ハイライト3の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ3＞背景 で変更した場合に反映される。

description:    ハイライト3の背景色
key:            TextEditor.Highlighter3.BgColor
current:        #b3e0ff
default:        #b3e0ff
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter3.Attrs
ハイライト3の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ3＞属性 で変更した場合に反映される。

description:    ハイライト3の属性
key:            TextEditor.Highlighter3.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter4.Color
ハイライト4の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ4＞文字 で変更した場合に反映される。

description:    ハイライト4の文字色
key:            TextEditor.Highlighter4.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter4.BgColor
ハイライト4の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ4＞背景 で変更した場合に反映される。

description:    ハイライト4の背景色
key:            TextEditor.Highlighter4.BgColor
current:        #b3ffb3
default:        #b3ffb3
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter4.Attrs
ハイライト4の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ4＞属性 で変更した場合に反映される。

description:    ハイライト4の属性
key:            TextEditor.Highlighter4.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter5.Color
ハイライト5の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ5＞文字 で変更した場合に反映される。

description:    ハイライト5の文字色
key:            TextEditor.Highlighter5.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter5.BgColor
ハイライト5の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ5＞背景 で変更した場合に反映される。

description:    ハイライト5の背景色
key:            TextEditor.Highlighter5.BgColor
current:        #e6b3ff
default:        #e6b3ff
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter5.Attrs
ハイライト5の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ5＞属性 で変更した場合に反映される。

description:    ハイライト5の属性
key:            TextEditor.Highlighter5.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*
## Status：　260624　TextEditor.Highlighter6.Color
ハイライト6の文字色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ6＞文字 で変更した場合に反映される。

description:    ハイライト6の文字色
key:            TextEditor.Highlighter6.Color
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter6.BgColor
ハイライト6の背景色
WorkoutSettingPanel>TextEditor設定>ハイライト色>グループ6＞背景 で変更した場合に反映される。

description:    ハイライト6の背景色
key:            TextEditor.Highlighter6.BgColor
current:        #e620ff
default:        #e620ff
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Highlighter6.Attrs
ハイライト6の属性
WorkoutSettingPanel>TextEditor設定>ハイライト設定>グループ6＞属性 で変更した場合に反映される。

description:    ハイライト6の属性
key:            TextEditor.Highlighter6.Attrs
current:        undefined
default:        undefined
type:           string
candidates:     .*

## Status：　260624　TextEditor.Heading1.Color
見出し行レベル１の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション1 で変更した場合に反映される。

description:    見出し行レベル１の文字色
key:            TextEditor.Heading1.Color
current:        #569cd6
default:        #569cd6
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading1.BgColor
見出し行レベル１の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション1 で変更した場合に反映される。

description:    見出し行レベル１の背景色
key:            TextEditor.Heading1.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading1.Attrs
見出し行レベル１の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション1 で変更した場合に反映される。

description:    見出し行レベル１の属性
key:            TextEditor.Heading1.Attrs
current:        bold|underline
default:    　　bold|underline
type:           string
candidates:     .*
## Status：　260624　TextEditor.Heading2.Color
見出し行レベル２の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション2 で変更した場合に反映される。

description:    見出し行レベル２の文字色
key:            TextEditor.Heading2.Color
current:        #4ec9b0
default:        #4ec9b0
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading2.BgColor
見出し行レベル２の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション2 で変更した場合に反映される。

description:    見出し行レベル２の背景色
key:            TextEditor.Heading2.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading2.Attrs
見出し行レベル２の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション2 で変更した場合に反映される。

description:    見出し行レベル２の属性
key:            TextEditor.Heading2.Attrs
current:        bold|underline
default:    　　bold|underline
type:           string
candidates:     .*
## Status：　260624　TextEditor.Heading3.Color
見出し行レベル３の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション3 で変更した場合に反映される。

description:    見出し行レベル３の文字色
key:            TextEditor.Heading3.Color
current:        #ce9178
default:        #ce9178
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading3.BgColor
見出し行レベル３の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション3 で変更した場合に反映される。

description:    見出し行レベル３の背景色
key:            TextEditor.Heading3.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading3.Attrs
見出し行レベル３の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション3 で変更した場合に反映される。

description:    見出し行レベル３の属性
key:            TextEditor.Heading3.Attrs
current:        bold|underline
default:    　　bold|underline
type:           string
candidates:     .*
## Status：　260624　TextEditor.Heading4.Color
見出し行レベル4の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション4 で変更した場合に反映される。

description:    見出し行レベル4の文字色
key:            TextEditor.Heading4.Color
current:        #dcdcaa
default:        #dcdcaa
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading4.BgColor
見出し行レベル4の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション4 で変更した場合に反映される.

description:    見出し行レベル4の背景色
key:            TextEditor.Heading4.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading4.Attrs
見出し行レベル4の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション4 で変更した場合に反映される。

description:    見出し行レベル4の属性
key:            TextEditor.Heading4.Attrs
current:        bold|underline
default:    　　bold|underline
type:           string
candidates:     .*
## Status：　260624　TextEditor.Heading5.Color
見出し行レベル5の文字色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション5 で変更した場合に反映される。

description:    見出し行レベル5の文字色
key:            TextEditor.Heading5.Color
current:        #c586c0
default:        #c586c0
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading5.BgColor
見出し行レベル5の背景色
WorkoutSettingPanel>TextEditor設定>文字設定>セクション5 で変更した場合に反映される。

description:    見出し行レベル5の背景色
key:            TextEditor.Heading5.BgColor
current:        undefined
default:        undefined
type:           string
candidates:     ^#[0-9a-fA-F]{6,8}$
## Status：　260624　TextEditor.Heading5.Attrs
見出し行レベル5の属性
WorkoutSettingPanel>TextEditor設定>文字設定>セクション5 で変更した場合に反映される。

description:    見出し行レベル5の属性
key:            TextEditor.Heading5.Attrs
current:        bold|underline
default:    　　bold|underline
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

## Action：　260619　TextEditor.EditText.Undo
## Action：　260619　TextEditor.EditText.Redo

## Status：　260613　WorkoutPanel.Pane.Count

## Status：　260613　WorkoutPanel.FocusedPane.ID

## Action：　260619　WorkoutPanel.FocusedPane.PaneNumber:Next
## Action：　260619　WorkoutPanel.FocusedPane.PaneNumber:Prev
## Status：　260619　WorkoutPanel.FocusedPane.PaneNumber

　Q：設定値を記載してください。
　A：現在表示されているペインの中でフォーカスされているペインの番号（1始まり）を返します。
　　設定される値は以下の通りです。
　　- `1`〜`6` （表示されているペインの配置順）
　　- `0` （フォーカスされているペインがない場合）

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
　　※フォーカスがどこにもない場合は None、ステータスバーにある場合は Application.StatusBarArea となります。

## Action：　260619　FocusedPanel.Area.IsOpen:Toggle
## Action：　260619　FocusedPanel.Mode.Name:Prev
## Action：　260619　FocusedPanel.Mode.Name:Next
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

　ToolBarがStatusモードのPanelには、EditBoxとTextBoxを配置し、PanelにフォーカスがあるときはEditBoxが、FocusがはずれるとTextBoxが表示されます。
　EditBoxに入力された値が、このToolBar.StatusMode.Textに保存されます。
　TextBoxのときには、ToolBar.StatusMode.TextをCSV形式のStatusIDとして読み取り、「StatusID1:{値1}」、「StatusID2:{値2}」...「StatusIDn:{値n}」というフォーマットで表示します。

# その他
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

