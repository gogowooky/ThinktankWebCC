UI Settings
# current列を編集 → Ctrl+S 保存でUIに反映 / 更新ボタンでUIからファイルに反映
# Undo: Ctrl+Shift+Z  /  Redo: Ctrl+Shift+Y

> key,current,default,type,candidates,description
ThinktankPanel.IsAreaOpen,false,true,boolean,^(true|false)$,左パネル表示
ThinktankPanel.ViewMode,settings,filter,string,^(filter|chat|settings)$,左パネルモード
OverviewPanel.IsAreaOpen,false,false,boolean,^(true|false)$,上部パネル表示
OverviewPanel.ViewMode,chat,datagrid,string,^(datagrid|graph|chat|settings)$,上部パネル表示モード
WorkoutPanel.IsAreaOpen,false,true,boolean,^(true|false)$,ワークアウトパネル表示
WorkoutPanel.ViewMode,workout,workout,string,^(workout|texteditor|markdown|datagrid|card|graph)$,ワークアウト設定パネルモード
TextEditor.LineNumbers.IsVisible,false,false,boolean,^(true|false)$,行番号表示
TextEditor.WordWrap.IsVisible,true,true,boolean,^(true|false)$,折り返し
TextEditor.Minimap.IsVisible,false,false,boolean,^(true|false)$,ミニマップ
TextEditor.FullWidthSpace.IsVisible,true,false,boolean,^(true|false)$,全角スペース表示
TextEditor.UnicodeHighlight.IsVisible,false,false,boolean,^(true|false)$,Unicode強調
TextEditor.BracketPairColorization.IsVisible,true,true,boolean,^(true|false)$,括弧ペア色分け
TextEditor.Color.Background,#f5f5f5,#f5f5f5,color,"^#[0-9a-fA-F]{6,8}$",背景色
TextEditor.Color.Text,#1e1e1e,#1e1e1e,color,"^#[0-9a-fA-F]{6,8}$",文字色
TextEditor.Color.Selection,#cba8ff,#c6e6c6ff,color,"^#[0-9a-fA-F]{6,8}$",選択色
TextEditor.Color.Occurrence,#fff0fd,#aac6aaff,color,"^#[0-9a-fA-F]{6,8}$",一致色
TextEditor.Style.Section,TextEditor.SectionStyle.Preset1,TextEditor.SectionStyle.Preset1,string,^TextEditor\.SectionStyle\.Preset[1-5]$,セクションスタイル
TextEditor.SectionStyle.Preset1,const,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json,.*,セクションスタイルプリセット1
TextEditor.SectionStyle.Preset2,const,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json,.*,セクションスタイルプリセット2
TextEditor.SectionStyle.Preset3,const,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json,.*,セクションスタイルプリセット3
TextEditor.SectionStyle.Preset4,const,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json,.*,セクションスタイルプリセット4
TextEditor.SectionStyle.Preset5,const,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json,.*,セクションスタイルプリセット5
WorkoutPanel.Style.Highlight,WorkoutPanel.HighlightStyle.Preset1,WorkoutPanel.HighlightStyle.Preset1,string,^WorkoutPanel\.HighlightStyle\.Preset[1-5]$,ハイライトスタイル
WorkoutPanel.HighlightStyle.Preset1,const,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json,.*,ハイライトスタイルプリセット1
WorkoutPanel.HighlightStyle.Preset2,const,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json,.*,ハイライトスタイルプリセット2
WorkoutPanel.HighlightStyle.Preset3,const,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json,.*,ハイライトスタイルプリセット3
WorkoutPanel.HighlightStyle.Preset4,const,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json,.*,ハイライトスタイルプリセット4
WorkoutPanel.HighlightStyle.Preset5,const,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json,.*,ハイライトスタイルプリセット5
WorkoutPanel.ToolBarMode,Translate,Copyright,string,^(Status|Highlighter|KeyAction|Command|Translate|Reminder|Copyright)$,Toolバー表示モード
WorkoutPanel.Highlight.KeyWord,,,string,.*,ハイライトキーワード
Application.FocusedColumn,Overview,Thinktank,string,^(Thinktank|Overview|WorkoutSetting|ReThink)$,フォーカスカラム
ReThinkPanel.IsAreaOpen,false,true,boolean,^(true|false)$,右パネル表示
ReThinkPanel.ViewMode,settings,chat,string,^(chat|settings)$,右パネル表示モード