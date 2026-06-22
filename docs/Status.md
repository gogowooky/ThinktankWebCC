UI Settings
# current列を編集 → Ctrl+S 保存でUIに反映 / 更新ボタンでUIからファイルに反映
# Undo: Ctrl+Shift+Z  /  Redo: Ctrl+Shift+Y

> group,   description,key,     current,     default,    type,     candidates

# Application
アプリケーション, フォーカスカラム     ,Application.FocusedPanel.Name,Overview    ,Thinktank   ,string  ,^(Thinktank|Overview|WorkoutSetting|Workout|ReThink)$

# Thinktank Panel
パネル  , 左パネル表示       ,ThinktankPanel.Area.IsOpen,true        ,true        ,boolean ,^(true|false)$
パネル  , 左パネルモード      ,ThinktankPanel.Mode.Name,Filter      ,Filter      ,string  ,^(Filter|Chat|Settings)$
パネル  , 上部パネル表示      ,OverviewPanel.Area.IsOpen,true        ,false       ,boolean ,^(true|false)$
パネル  , 上部パネル表示モード   ,OverviewPanel.Mode.Name,Datagrid    ,Datagrid    ,string  ,^(Datagrid|Graph|Chat|Settings)$
パネル  , ワークアウトパネル表示  ,WorkoutSettingPanel.Area.IsOpen,false       ,true        ,boolean ,^(true|false)$
パネル  , ワークアウト設定パネルモード,WorkoutSettingPanel.Mode.Name,Markdown    ,Workout     ,string  ,^(Workout|Texteditor|Markdown|Datagrid|Card|Graph)$
パネル  , 右パネル表示       ,ReThinkPanel.Area.IsOpen,false       ,true        ,boolean ,^(true|false)$
パネル  , 右パネル表示モード    ,ReThinkPanel.Mode.Name,Chat        ,Chat        ,string  ,^(Chat|Settings)$

#　TextEditor
エディタ , 行番号表示        ,TextEditor.LineNumbers.IsVisible,false       ,false       ,boolean ,^(true|false)$
エディタ , 折り返し         ,TextEditor.WordWrap.IsVisible,false       ,true        ,boolean ,^(true|false)$
エディタ , ミニマップ        ,TextEditor.Minimap.IsVisible,false       ,false       ,boolean ,^(true|false)$
エディタ , 全角スペース表示     ,TextEditor.FullWidthSpace.IsVisible,true        ,false       ,boolean ,^(true|false)$
エディタ , Unicode強調    ,TextEditor.UnicodeHighlight.IsVisible,false       ,false       ,boolean ,^(true|false)$
エディタ , 括弧ペア色分け      ,TextEditor.BracketPairColorization.IsVisible,true        ,true        ,boolean ,^(true|false)$
エディタ , 背景色          ,TextEditor.Color.Background,#f5f5f5     ,#f5f5f5     ,color   ,"^#[0-9a-fA-F]{6,8}$"
エディタ , 文字色          ,TextEditor.Color.Text,#1e1e1e     ,#1e1e1e     ,color   ,"^#[0-9a-fA-F]{6,8}$"
エディタ , 選択色          ,TextEditor.Color.Selection,#cba8ff     ,#c6e6c6ff   ,color   ,"^#[0-9a-fA-F]{6,8}$"
エディタ , 一致色          ,TextEditor.Color.Occurrence,#fff0fd     ,#aac6aaff   ,color   ,"^#[0-9a-fA-F]{6,8}$"
エディタ , セクションスタイル    ,TextEditor.Style.Section,TextEditor.SectionStyle.Preset1,TextEditor.SectionStyle.Preset1,string  ,^TextEditor\.SectionStyle\.Preset[1-5]$
エディタ , セクションスタイルプリセット1,TextEditor.SectionStyle.Preset1,const       ,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json    ,.*
エディタ , セクションスタイルプリセット2,TextEditor.SectionStyle.Preset2,const       ,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json    ,.*
エディタ , セクションスタイルプリセット3,TextEditor.SectionStyle.Preset3,const       ,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json    ,.*
エディタ , セクションスタイルプリセット4,TextEditor.SectionStyle.Preset4,const       ,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json    ,.*
エディタ , セクションスタイルプリセット5,TextEditor.SectionStyle.Preset5,const       ,"[{""color"":""#569cd6"",""bold"":true,""underline"":false},{""color"":""#4ec9b0"",""bold"":true,""underline"":false},{""color"":""#ce9178"",""bold"":true,""underline"":false},{""color"":""#dcdcaa"",""bold"":true,""underline"":false},{""color"":""#c586c0"",""bold"":true,""underline"":false}]",json    ,.*
エディタ , 見出しOffset     ,TextEditor.CurrentFolding.HeadingOffset,0          ,0          ,string  ,.*
エディタ , 見出し番号       ,TextEditor.CurrentFolding.HeadingNumber,None       ,None       ,string  ,.*

# Panel
パネル  , ハイライトスタイル    ,WorkoutPanel.Style.Highlight,WorkoutPanel.HighlightStyle.Preset1,WorkoutPanel.HighlightStyle.Preset1,string  ,^WorkoutPanel\.HighlightStyle\.Preset[1-5]$
パネル  , ハイライトスタイルプリセット1,WorkoutPanel.HighlightStyle.Preset1,const       ,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json    ,.*
パネル  , ハイライトスタイルプリセット2,WorkoutPanel.HighlightStyle.Preset2,const       ,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json    ,.*
パネル  , ハイライトスタイルプリセット3,WorkoutPanel.HighlightStyle.Preset3,const       ,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json    ,.*
パネル  , ハイライトスタイルプリセット4,WorkoutPanel.HighlightStyle.Preset4,const       ,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json    ,.*
パネル  , ハイライトスタイルプリセット5,WorkoutPanel.HighlightStyle.Preset5,const       ,"[{""backgroundColor"":""#fff0b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#ffb3b3"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3e0ff"",""color"":""#1a1a1a""},{""backgroundColor"":""#b3ffb3"",""color"":""#1a1a1a""},{""backgroundColor"":""#e6b3ff"",""color"":""#1a1a1a""}]",json    ,.*
パネル  , Toolバー表示モード  ,ToolBar.Mode.Name,KeyAction   ,Copyright   ,string  ,^(Status|Highlighter|KeyAction|Command|Translate|Reminder|Copyright)$
パネル  , ハイライター入力テキスト,ToolBar.HighlighterMode.Text,            ,            ,string  ,.*
パネル  , コマンド入力テキスト   ,ToolBar.CommandMode.Text,            ,            ,string  ,.*
パネル  , 翻訳入力テキスト     ,ToolBar.TranslateMode.Text,            ,            ,string  ,.*
パネル  , リマインダー入力テキスト ,ToolBar.ReminderMode.Text,            ,            ,string  ,.*