UI Settings

# DataGridで value 列を編集 → Ctrl+S 保存でUIに即反映

> key,current,type,description,candidates,restore,default

# Panel

ThinktankPanel.IsAreaOpen,false,boolean,Thinktankパネル表示,(true|false|toggle),current,false
OverviewPanel.IsAreaOpen,false,boolean,Overviewパネル表示,(true|false|toggle),current,false
ReThinkPanel.IsAreaOpen,true,boolean,ReThinkパネル表示,(true|false|toggle),current,false
WorkoutPanel.IsAreaOpen,false,boolean,Workoutパネル表示,(true|false|toggle),current,false

ThinktankPanel.ViewMode,chat,string,Thinktankパネルモード,(thoughts|filter|search|chat|settings|next|prev),current,filter
OverviewPanel.ViewMode,graph,string,Overviewパネルモード,(datagrid|graph|chat|settings|next|prev),current,filter
ReThinkPanel.ViewMode,settings,string,Overviewパネルモード,(chat|settings|next|prev),current,chat
WorkoutPanel.ViewMode,texteditor,string,ToDoパネルモード,(workout|texteditor|markdown|datagrid|card|graph|next|prev),current,workout

# TextEditor

TextEditor.LineNumbers.IsVisible,               true,   boolean,    行番号表示,(true|false|toggle),current,false
TextEditor.WordWrap.IsVisible,                  true,   boolean,    折り返し,(true|false|toggle),current,false
TextEditor.Minimap.IsVisible,                   false,  boolean,    ミニマップ,(true|false|toggle),current,false
TextEditor.FullWidthSpace.IsVisible,            false,  boolean,    全角スペース表示,(true|false|toggle),current,false
TextEditor.UnicodeHighlight.IsVisible,          false,  boolean,    Unicode強調,(true|false|toggle),current,false
TextEditor.BracketPairColorization.IsVisible,   true,   boolean,    括弧ペア色分け,(true|false|toggle),current,false
WorkoutPanel.HighlightWord,                     "Is, false",string, ハイライトキーワード,".*",current,""

# --- 挿入

;
;
;
;
# WorkoutPanel.EditorBackground,#f5f5f5,color,背景色,#f5f5f5,#f5f5f5,
# WorkoutPanel.EditorForeground,#1e1e1e,color,前景色,#1e1e1e,#1e1e1e,
# WorkoutPanel.EditorHeadingStyles,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json,見出しスタイル(JSON),"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]","[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",
# WorkoutPanel.EditorHighlightStyles,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json,ハイライトスタイル(JSON),"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]","[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",
