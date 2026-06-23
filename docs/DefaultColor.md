
# Name,                                 Color,            BgColor,          Attrs
Default.TextEditor.Text,                #1e1e1e,        #f5f5f5,        none
Default.TextEditor.Selection,           undefined,        #cba8ff,        undefined
Default.TextEditor.Occurrence,          undefined,        #fff0fd,        undefined

Default.TextEditor.Highlighter1,        undefined,        #fff0b3,        undefined
Default.TextEditor.Highlighter2,        undefined,        #ffb3b3,        undefined
Default.TextEditor.Highlighter3,        undefined,        #b3e0ff,        undefined
Default.TextEditor.Highlighter4,        undefined,        #b3ffb3,        undefined
Default.TextEditor.Highlighter5,        undefined,        #e6b3ff,        undefined
Default.TextEditor.Highlighter6,        undefined,        #e620ff,        undefined

Default.TextEditor.Underline,           undefined,        undefined,        underline
Default.TextEditor.Italic,              undefined,        undefined,        italic
Default.TextEditor.Strikethrough,       undefined,        undefined,        strikethrough
Default.TextEditor.Bold,                undefined,        undefined,        bold

Default.TextEditor.Heading1,            #569cd6,        undefined,        bold|underline
Default.TextEditor.Heading2,            #4ec9b0,        undefined,        bold|underline
Default.TextEditor.Heading3,            #ce9178,        undefined,        bold|underline
Default.TextEditor.Heading4,            #dcdcaa,        undefined,        bold|underline
Default.TextEditor.Heading5,            #c586c0,        undefined,        bold|underline
Default.TextEditor.Heading6,            #569cd6,        undefined,        bold|underline



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