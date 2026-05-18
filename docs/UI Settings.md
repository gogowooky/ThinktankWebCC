UI Settings

# DataGridで value 列を編集 → Ctrl+S 保存でUIに即反映

> key,current,type,description,candidates,restore,default

# Application

Application.FocusedColumn,WorkoutSetting,string,フォーカスカラム,(Thinktank|Overview|WorkoutSetting|Workout|ReThink|next|prev),current,Thinktank

# Panel

ThinktankPanel.IsAreaOpen,true,boolean,Thinktankパネル表示,(true|false|toggle),current,false
OverviewPanel.IsAreaOpen,false,boolean,Overviewパネル表示,(true|false|toggle),current,false
ReThinkPanel.IsAreaOpen,false,boolean,ReThinkパネル表示,(true|false|toggle),current,false
WorkoutPanel.IsAreaOpen,true,boolean,Workoutパネル表示,(true|false|toggle),current,false

ThinktankPanel.ViewMode,filter,string,Thinktankパネルモード,(thoughts|filter|search|chat|settings|next|prev),current,filter
OverviewPanel.ViewMode,settings,string,Overviewパネルモード,(datagrid|graph|chat|settings|next|prev),current,filter
ReThinkPanel.ViewMode,settings,string,Overviewパネルモード,(chat|settings|next|prev),current,chat
WorkoutPanel.ViewMode,workout,string,ToDoパネルモード,(workout|texteditor|markdown|datagrid|card|graph|next|prev),current,workout

# TextEditor

TextEditor.LineNumbers.IsVisible,false,   boolean,    行番号表示,(true|false|toggle),current,false
TextEditor.WordWrap.IsVisible,true,   boolean,    折り返し,(true|false|toggle),current,false
TextEditor.Minimap.IsVisible,false,  boolean,    ミニマップ,(true|false|toggle),current,false
TextEditor.FullWidthSpace.IsVisible,true,  boolean,    全角スペース表示,(true|false|toggle),current,false
TextEditor.UnicodeHighlight.IsVisible,false,  boolean,    Unicode強調,(true|false|toggle),current,false
TextEditor.BracketPairColorization.IsVisible,true,   boolean,    括弧ペア色分け,(true|false|toggle),current,false

TextEditor.Text.Background,#f5f5f5, color, 文字背景色, #[a-f0-9]+, current, #f5f5f5
TextEditor.Text.Foreground,#1e1e1e, color, 文字前景色, #[a-f0-9]+, current,#1e1e1e
TextEditor.Selection.Background,#c6e6c6ff, color, 選択範囲背景色, #[a-f0-9]+, current,#c6e6c6ff
TextEditor.Occurrence.Background,#aac6aaff, color, 一致文字背景色, #[a-f0-9]+, current,#adceadff

# TextEditor: Section

TextEditor.Style.Section,TextEditor.SectionStyle.Preset1,string,セクションスタイル,TextEditor.SectionStyle.Preset[1-5],current,TextEditor.SectionStyle.Preset1

TextEditor.SectionStyle.Preset1,const,json,セクションスタイルプリセット1,.*,default,"[{""color"":""#351dbeff"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]"
TextEditor.SectionStyle.Preset2,const,json,セクションスタイルプリセット2,.*,default,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]"
TextEditor.SectionStyle.Preset3,const,json,セクションスタイルプリセット3,.*,default,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]"
TextEditor.SectionStyle.Preset4,const,json,セクションスタイルプリセット4,.*,default,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]"
TextEditor.SectionStyle.Preset5,const,json,セクションスタイルプリセット5,.*,default,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]"

# Highlight

WorkoutPanel.Highlight.KeyWord,,string, ハイライトキーワード,.*,current,

WorkoutPanel.Style.Highlight,WorkoutPanel.HighlightStyle.Preset1,string,ハイライトスタイル,WorkoutPanel.HighlightStyle.Preset[1-5],current,WorkoutPanel.HighlightStyle.Preset1

WorkoutPanel.HighlightStyle.Preset1,const,json,セクションスタイルプリセット1,.*,default,"[{""backgroundColor"":""#ae123eff"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]"
WorkoutPanel.HighlightStyle.Preset2,const,json,セクションスタイルプリセット2,.*,default,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]"
WorkoutPanel.HighlightStyle.Preset3,const,json,セクションスタイルプリセット3,.*,default,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]"
WorkoutPanel.HighlightStyle.Preset4,const,json,セクションスタイルプリセット4,.*,default,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]"
WorkoutPanel.HighlightStyle.Preset5,const,json,セクションスタイルプリセット5,.*,default,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]"
