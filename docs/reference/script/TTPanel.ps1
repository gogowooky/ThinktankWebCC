
#::: 概要
# ThinkTankのパネルを定義するスクリプトです。
#::: 依存関係
# script/Tool.ps1, script/SetupEnvironment.ps1, script/TTModel.ps1, script/Control.ps1
#::: 注意
# 1. このスクリプトはThinkTankのパネルを定義します。
# 2. パネルの表示やフォーカス管理、キーテーブルの設定などを行います。
# 3. パネルの状態管理や、キーワード、テーブル、日付入力、アクター、メニューなどのイベントを設定します。
# 4. パネルの構造を定義し、ユーザーインターフェイスを構築します。
# 5. パネルのモードやツールの切り替え、キーワードの入力、日付の操作などを行います。
# 6. パネルのタイトル表示や、キーワードのハイライト、フォーカスの管理などを行います。
# 7. パネルの状態を保存し、復元する機能を提供します。
# 8. パネルのイベントを定義し、ユーザーの操作に応じてアクションを実行します。
# 9. パネルのキーワードやテーブルの操作、日付の入力、アクターの操作、メニューの操作などを行います。



#::: 250430 TTPanelの課題
# 40325 SP/EPはUndo/Redoに対応してないので、Editorの状態管理はEditor任せた方がよいように思う。
# 040428 まず、SP/EPをなくそう
# 040428 EditorとKeywordの共通化、も考えること
# 030401 メールクリップボード貼りつけ
# 030324 メール送信：　zip,urlencode　
# 030324 メールメモ化：　unzip,urldecode
# 080000: AES暗号・復号      https://qiita.com/YoshijiGates/items/6c331924d4fcbcf6627a
# 080000: Zip/UnZip          https://resanaplaza.com/2022/10/09/【c】-net標準機能でzipファイルを操る（zipfile、ziparchive）/#index_id2


#region using namespace
using namespace System
using namespace System.IO
using namespace System.Text
using namespace System.Windows
using namespace System.Windows.Data
using namespace System.Windows.Documents
using namespace System.Windows.Media
using namespace System.Windows.Controls
using namespace System.Windows.Markup
using namespace System.Windows.Input
using namespace System.Windows.Media.TextFormatting
using namespace System.Xml
using namespace System.Globalization
using namespace System.Diagnostics
using namespace System.Drawing
using namespace System.ComponentModel
using namespace System.Text.RegularExpressions
using namespace System.Collections.Generic
using namespace ICSharpCode.AvalonEdit
using namespace ICSharpCode.AvalonEdit.Editing
using namespace ICSharpCode.AvalonEdit.Highlighting
using namespace ICSharpCode.AvalonEdit.Document
using namespace ICSharpCode.AvalonEdit.Folding
using namespace ICSharpCode.AvalonEdit.Rendering
using namespace Microsoft.Web.WebView2.Wpf
using namespace Microsoft.Web.WebView2.Core

#endregion

class TTExModMode {
    #region variant
    static [string]     $Name = ''
    static [TTPanel]    $ExPanel
    static [ScriptBlock] $OnExit = {}
    static [ScriptBlock] $OnStart = {}
    static [ScriptBlock] $OnClear = {}
    static [System.Windows.Input.ModifierKeys] $Mods
    static [hashtable] $Tag
    static [string] $Text
    static [KeyConverter] $kconv
    #endregion
    static [TTPanel] ExFdPanel() {
        return @( [TTExModMode]::ExPanel, [TTExModMode]::FdPanel() ).where{ $_ }[0]
    }
    static [TTPanel] FdPanel() {
        return $global:Application.FocusedTool.TTPanel
    }
    static [void] Clear() {
        [TTExModMode]::Name = ''
        [TTExModMode]::Text = ''
        [TTExModMode]::Tag = @{}
        [TTExModMode]::Mods = [System.Windows.Input.ModifierKeys]''
        [TTExModMode]::OnClear.Invoke()
        [TTExModMode]::OnExit = {}

        $global:Application.SwitchKeyTable( 'focusedtool' )
        [TTExModMode]::ExPanel = $null

    }
    static [void] ExitMode() {
        if ( [TTExModMode]::Name -eq '' ) { return }
        [TTExModMode]::OnExit.invoke()
        [TTExModMode]::Clear()
    }
    static [void] Start( $name ) {

        $_mods = [System.Windows.Input.Keyboard]::Modifiers
        if ( $_mods -eq [System.Windows.Input.ModifierKeys]::None ) { return }

        $global:Application.SwitchKeyTable( $name )

        [TTExModMode]::Name = $name
        [TTExModMode]::Tag = @{}
        [TTExModMode]::Mods = $_mods
        [TTExModMode]::OnStart.Invoke()
        [TTExModMode]::kconv = [KeyConverter]::New()

        [TTExModMode]::ExPanel = $global:Application.$( $name.Replace('Ex', '') )

    }
    static [void] Add_OnExit( $onexit ) {
        [TTExModMode]::OnExit = $onexit
    }
    static [void] CheckToClear( $win, $e ) {
        if ( [TTExModMode]::Name -eq '' ) { return }
        if ( -not $e.KeyboardDevice.Modifiers.HasFlag( [TTExModMode]::Mods ) ) { [TTExModMode]::Clear() }
    }
    static [void] CheckToExit( $win, $e ) {
        if ( [TTExModMode]::Name -eq '' ) { return }
        if ( ![System.Windows.Input.Keyboard]::Modifiers.HasFlag( [TTExModMode]::Mods ) ) {
            [TTExModMode]::OnExit.invoke()
            [TTExModMode]::Clear()
        }
    }
    static [string] StackKey( $mods, $key ) {
        [TTExModMode]::Text += [string][TTExModMode]::kconv.ConvertTo( $key, [string] )
        return [TTExModMode]::Text
    }
}

class TTPanelStructure {
    #region variables: Name/ UserControl/ Title Keyword/ Editor/ Table, New, Setup()
    hidden          $_parent
    [string]        $Name
    [System.Windows.Controls.UserControl]   $UserControl

    [ContextMenu]   $Menu
    [Label]         $Title

    [DockPanel]     $EditorPanel
    [TextEditor]    $EditorKeyword
    [TextEditor]    $EditorMain

    [DockPanel]     $TablePanel
    [TextEditor]    $TableKeyword
    [DataGrid]      $TableMain

    [DockPanel]     $WebViewPanel
    [TextEditor]    $WebViewKeyword
    [WebView2]      $WebViewMain

    TTPanelStructure() {}
    TTPanelStructure( $name, $parent ) {

        $this.Name = $name
        $this._parent = $parent

        $xamlPath = "$($global:ScriptPath)\TTPanel.xaml"
        $stylePath = "$($global:ScriptPath)\Style.xaml"
        $xaml = [Xml]( Get-Content $xamlPath -raw ).Replace( '<ResourceDictionary Source="Style.xaml" />', ( Get-Content $stylePath -raw ) )

        $this.UserControl = [XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
        $this.UserControl | Add-Member TTPanel $this

        $this.Menu = $this.UserControl.ContextMenu
        $this.Menu |    Add-Member TTPanel $this
        $this.Title = $this.UserControl.FindName('Title')
        $this.Title |   Add-Member TTPanel $this

        @(  'EditorPanel', 'EditorKeyword', 'EditorMain', 
            'TablePanel', 'TableKeyword', 'TableMain', 
            'WebViewPanel', 'WebViewKeyword', 'WebViewMain' ).foreach{
            $this.$_ = $this.UserControl.FindName($_)
            $this.$_ |  Add-Member TTPanel $this
            if ( $_ -match '(Keyword|EditorMain)$' ) { 
                $this.$_.TextArea.Caret | Add-Member TTPanel $this
                $this.$_.TextArea.Caret | Add-Member EditorComponent $this.$_
                $this.$_.TextArea.TextView | Add-Member TTPanel $this
                $this.$_.TextArea.TextView | Add-Member EditorComponent $this.$_
            }
        }
    }
    [void]      Setup() {}
    #endregion
    #region TitleVisible/ Title
    [void]      SetTitleVisible( $vis ) {
        $this.UserControl.Dispatcher.Invoke( [Action] {
                switch ( [string]$vis ) {
                    'true' { $this.Title.Visibility = [Visibility]::Visible }
                    'false' { $this.Title.Visibility = [Visibility]::Collapsed }
                    'toggle' { $this.SetTitleVisible( -not $this.GetTitleVisible() ) }
                }
            })
    }
    [bool]      GetTitleVisible() {
        return( $this.Title.Visibility -eq [Visibility]::Visible )
    }
    [void]      SetTitle( $text ) {
        $text = '{0}{1}' -f $this.Name, $text 
        if ( $this -eq [TTExModMode]::FdPanel() ) { $text = '●' + $text }
        $this.Title.Content = $text
    }
    [string]    GetTitle() {
        return $this.Title.Content -replace '^●*(.*)', '$1'        
    }
    #endregion
}
class TTPanelBase : TTPanelStructure {
    #region variables, New, Setup()
    #::: 状態管理変数
    [Object]    $CurrentTool        #::: (Editor|Table|WebView)(Main|Keyword)
    [Object]    $CurrentToolEditor  #::: Editor(Main|Keyword)
    [Object]    $CurrentToolTable   #::: Table(Main|Keyword)
    [Object]    $CurrentToolWebView #::: WebViewMain(Main|Keyword)

    TTPanelBase( $name, $parent ) : Base( $name, $parent ) {
        $this.CurrentTool = $this.EditorKeyword
        $this.CurrentToolEditor = $this.EditorKeyword
        $this.CurrentToolTable = $this.TableKeyword
        $this.CurrentToolWebView = $this.WebViewKeyword
    }
    [void] Setup() {
        ([TTPanelStructure]$this).Setup()
    }
    #endregion
    #region Focus, Mode, Tool, RestoreCurrentTool
    [void]      Focus( $tool ) {
        #::: (Editor|Table|WebView) (Keyword|Main), ''
        switch -regex ($tool) {
            '^$' { 
                $global:Application.Focus( $this.CurrentTool )
            }
            '^(Editor|Table|WebView)(Keyword|Main)$' {
                $global:Application.Focus( $this.Name, $Matches.1, $Matches.2 )
            }
            '^(Editor|Table|WebView)$' {
                $global:Application.Focus( $this."CurrentTool$tool" )
            }
            '^(Keyword|Main)$' {
                $mode = $this.CurrentTool.Name -replace '(Editor|Table|WebView)(Keyword|Main)', '$1'
                $global:Application.Focus( $this.Name, $mode, $Matches.1 )
            }
            default {
                $global:Application.Focus( $tool )
            }
        }
    }
    [void]      Focus() {
        $this.Focus('')
    }
    [string]    GetMode() {
        #::: (Editor|Table|WebView)
        return $this.CurrentTool.Name -replace '(Editor|Table|WebView)(Keyword|Main)', '$1'
    }  
    [void]      SetMode( [string] $mode ) {
        #::: (Editor|Table|WebView|next|prev)
        # $this -eq $FdPanel の場合はFocusする
        switch -regex ($mode) {
            '(Editor|Table|WebView)' {
                $global:Application.Display( $this."CurrentTool$mode" )
                if ( [TTExModMode]::FdPanel() -eq $this ) {
                    $global:Application.Focus( $this."CurrentTool$mode" )
                }
            }
            'next' {
                $this.SetMode( ($this.GetMode() | Get-Next next -Enum 'Editor|Table|WebView') )
            }
            default {
                # prev
                $this.SetMode( ($this.GetMode() | Get-Next prev -Enum 'Editor|Table|WebView') )
            }
        }
    }
    [string]    GetTool() {
        #::: (Keyword|Main)
        return $this.CurrentTool.Name -replace '(Editor|Table|WebView)(Keyword|Main)', '$2'
    }
    [void]      SetTool( [string]$tool ) {
        #::: (Keyword|Main|toggle)
        switch -regex ($tool) {
            '(Keyword|Main)' {
                $this.Focus( $tool )
            }
            default {
                #::: toggle
                $this.Focus( ($this.GetTool() | Get-Next next -Enum 'Keyword|Main') )
            }
        }
    }
    [void]      RestoreCurrentTool( [Object]$toolobj ) {
        #::: Panel毎の状態保存  Focusイベント内で使用
        $this.CurrentTool = $toolobj
        $mode = $this.GetMode()
        $this."CurrentTool$mode" = $toolobj
    }
    #endregion
}
class TTPanelEditor : TTPanelBase { 
    #region variables, New, Setup
    [string]                                $MemoID
    [FoldingManager]                        $FoldManager
    [Thinktank.ThinktankFoldingStrategy]    $FoldStrategy

    static [hashtable]  $_documents

    hidden [bool] $JustAfterLoaded = $true
    
    TTPanelEditor( $name, $parent ) : Base( $name, $parent ) {
        $this.MemoID = ''
        $this.FoldManager = $null
        $this.FoldStrategy = $null
        
        [TTPanelEditor]::_documents = @{}

        $this._editorkwregex = [regex]::New( '^' )
        $this._editorkwregexs = @()
        $this._nodes = @()
        $this._actorspos = @()
        
        $this.EditorMain.Options.HighlightCurrentLine = $false
        $this.EditorMain.WordWrap = $true


        $this.UpdateHighlightRule()

    }
    [void] Setup() {
        ([TTPanelBase]$this).Setup()

        $this.UpdateKeywordRegex()
        $this.UpdateHighlight()
        $this.UpdateNodesPos()
    }
    #endregion
    #region Update (Keyword, Highlight, Node, Actror)
    [void]          UpdateHighlightRule() {     # New()とLoad()で呼出し
        $rulePath = $global:ScriptPath + '\EditorRule.xshd'
        $xaml = [Xml]( Get-Content $rulePath -raw )
        $this.EditorMain.SyntaxHighlighting = [Xshd.HighlightingLoader]::Load( 
            [XmlReader](New-Object System.Xml.XmlNodeReader ([xml]$xaml)),
            [HighlightingManager]::Instance
        )
        $rulePath = $global:ScriptPath + '\KeywordRule.xshd'
        $xaml = [Xml]( Get-Content $rulePath -raw )
        $this.EditorKeyword.SyntaxHighlighting = [Xshd.HighlightingLoader]::Load( 
            [XmlReader](New-Object System.Xml.XmlNodeReader ([xml]$xaml)),
            [HighlightingManager]::Instance
        )
     }
    [void]          UpdateHighlight() {
        # 着色更新
        @( $this.EditorKeyword, $this.EditorMain ).foreach{

            $rules = $_.SyntaxHighlighting.MainRuleSet.Rules
            $spans = $_.SyntaxHighlighting.MainRuleSet.Spans
            $colors = $_.SyntaxHighlighting.NamedHighlightingColors
    
            #::: delete rules
            $del_rules = $rules.where{ $_.Color.Name -like 'Marker*' }
            $del_rules.foreach{ $rules.Remove( $_ ) }
            $spans.where{ $null -ne $_.RuleSet }.foreach{
                $ruls = $_.RuleSet.Rules
                $dels = $ruls.where{ $_.Color.Name -like 'Marker*' }
                $dels.foreach{ $ruls.Remove($_) }
            }
    
            #::: add rules
            $no = 0
            foreach ( $re in $this._editorkwregexs ) {
                $no += 1
                $rule = [Highlighting.HighlightingRule]::new()
                $rule.Color = $colors.where{ $_.Name -eq "Marker$no" }[0]
                $rule.Regex = $re
                $rules.Add( $rule )
    
                $spans.where{ $null -ne $_.RuleSet }.foreach{
                    $_.RuleSet.Rules.Add( $rule )
                }    
            }
            $_.TextArea.TextView.Redraw()
        }
    }
    hidden [psobject[]] $_nodes
    [void]          UpdateNodesPos() {
        $this._nodes = [RegEx]::Matches($this.EditorMain.Text, '^#+(?= )', 2).foreach{
            @{
                Index  = $_.Index
                Length = $_.Length
            } 
        }
        
        if ( $null -ne $this.FoldStrategy ) {
            $this.FoldStrategy.UpdateFoldings(
                $this.FoldManager, 
                $this.EditorMain.Document
            )
        }
    }
    hidden [long[]]     $_actorspos             # actorsの先頭位置の配列 
    [void]          UpdateActorsPos() {
        $this._actorspos = @()
        $this._actors.where{ $_.Key -match '^(WebPath|FilePath|ChildPath|Tag|Query)$' }.foreach{
            $this._actorspos += $_.Regex.Matches($this.EditorMain.Text).foreach{ $_.Index }
        }
        $this._actorspos = ( $this._actorspos | Sort-Object )        
    }
    #endregion
    #region Actor
    hidden [Regex]$_wordregex = [Regex]'([a-zA-Z0-9]+|[ぁ-んー]+|[ァ-ヶー]+|[ｱ-ﾝﾞﾟ]+|[一-龠]+)'
    hidden [hashtable[]]    $_actors = @(  
        @{ Key = 'WebPath'; Regex = [Regex]'https?://[^") ]+' },
        @{ Key = 'FilePath'; Regex = [Regex]'([a-zA-Z]:\\|\\\\)([^<>:"/\\|?*]+\\?)*' },
        @{ Key = 'ChildPath'; Regex = [Regex]'^\s*\/([^<>:"\\\/|?*]+\\?)*' },
        @{ Key = 'DateTag'; Regex = [Regex]'\[\d{4}\-\d{2}\-\d{2}\]' }, #::: [xxxx-xx-xxxx]  ※Tagより先に評価すること
        @{ Key = 'Tag'; Regex = [Regex]'\[([^\]:]+)\]' },           #::: [1] [>1]
        @{ Key = 'Query'; Regex = [Regex]'\[([^\]]+)\]' },            #::: [Google:xxx] [memo:xxx]
        @{ Key = 'Date'; Regex = [Regex]'\d{4}\/\d{1,2}\/\d{1,2}( \(.\))?( \d{2}:\d{2})?' },
        @{ Key = 'JDate'; Regex = [Regex]'\d{4}年\d{1,2}月\d{1,2}日( \(.\))?( \d{2}:\d{2})?' },
        @{ Key = 'GDate'; Regex = [Regex]'(明治|大正|昭和|平成|令和)(\d{1,2}|元)年\d{1,2}月\d{1,2}日( \(.\))?( \d{2}時\d{2}分)?' }
        @{ Key = 'PanDate'; Regex = [Regex]'(\[\d{4}\-\d{2}\-\d{2}\]|\d{4}\/\d{1,2}\/\d{1,2}( \(.\))?( \d{2}:\d{2})?|\d{4}年\d{1,2}月\d{1,2}日( \(.\))?( \d{2}:\d{2})?|(明治|大正|昭和|平成|令和)(\d{1,2}|元)年\d{1,2}月\d{1,2}日( \(.\))?( \d{2}時\d{2}分)?)' }
    )
    hidden [hashtable]      $_subactors = @{
        'Tag'   = @(
            @{ SubName = 'Mark'; SubARE = '^(1|未|待|続|済|要|催)$'; SubATags = '未|待|続|済|要|催' },
            @{ SubName = 'Mark'; SubARE = '^(2|TODO|WAIT||DOING|DONE|NEED|EVENT)$'; SubATags = 'TODO|WAIT||DOING|DONE|NEED|EVENT' },
            @{ SubName = 'Mark'; SubARE = '^(3|注|？|※|検|重)$'; SubATags = '注|？|※|検|重' },
            @{ SubName = 'Mark'; SubARE = '^(4| |o|x|-|=)$'; SubATags = ' |o|x|-|=' },
            @{ SubName = 'Mark'; SubARE = '^(5|\!|\?|\*|\-|\+|=)$'; SubATags = '!|?|*|-|+|=' },
            @{ SubName = 'Mark'; SubARE = '^(7|－|↓|～|↑|✔)$'; SubATags = '－|↓|～|↑|✔' },
            @{ SubName = 'Mark'; SubARE = '^(6|予定|進行|待機|終了|中止|課題|優先|重要|注意|未定|移管)$'; SubATags = '予定|進行|待機|終了|中止|課題|優先|重要|注意|未定|移管' },
            @{ SubName = 'Reference'; SubARE = '^#.+$' },
            @{ SubName = 'Tag'; SubARE = '.*' }
        )
        'Query' = @(
            @{ SubName = 'Set'; SubAID = '{0}'; SKey = '{1}'; SValue = '{2}' },
            @{ SubName = 'Route'; SubAID = '{0}'; Towns = '{1}' },
            @{ SubName = 'Memo'; SubAID = '{0}'; IdOrKeyword = '{1}' },
            @{ SubName = 'Memo'; SubAID = '{1}'; IdOrKeyword = '{0}' },
            @{ SubName = 'Mail'; SubAID = '{0}'; IdOrKeyword = '{1}' },
            @{ SubName = 'Mail'; SubAID = '{1}'; IdOrKeyword = '{0}' },
            @{ SubName = 'Photo'; SubAID = '{0}'; IdOrKeyword = '{1}' },
            @{ SubName = 'Photo'; SubAID = '{1}'; IdOrKeyword = '{0}' }
            @{ SubName = 'WebSearch'; SubAID = 'WebSearch'; SearchSite = '{0}'; Keywords = '{1}' }
        )
    }
    hidden [hashtable]      _replace_to_subactor( $actor ) {
        switch ($actor.Key) {
            'Tag' {
                $param = $actor.Value.Substring( 1, $actor.Length - 2 )                #::: params取得
                $subactor = $this._subactors['Tag'].where{ #::: subactor選出
                    $param -match $_.SubARE
                }[0]
                $subactor.Keys.foreach{ #::: parameterをactorに付加 
                    $actor[$_] = $subactor[$_] -f $params
                }
                $actor.Mark = $param
                $actor.Key = $actor.SubName
            }
            'Query' {
                $params = $actor.Value.Substring( 1, $actor.Length - 2 ).split(':')     #::: params取得
                $subactor = $this._subactors['Query'].where{ #::: subactor選出
                    $_.SubName -eq $_.SubAID -f $params
                }[0]
                $subactor.Keys.foreach{ #::: parameterをactorに付加 
                    $actor[$_] = $subactor[$_] -f $params
                }
                $actor.Key = $actor.SubName
            }
        }
        return $actor
    }
    [hashtable]     GetUnitAt( $param ) {
        return $this.GetUnitAt( $param, $this.EditorMain.CaretOffset )
    }
    [hashtable]     GetUnitAt( $param, $curpos ) {
        #::: @{ Key, Curpos, Offset, Length, Value }
        $doc = $this.EditorMain.Document
        $offset = 0
        $length = 0

        switch ( $param ) {
            'first' {
                $offset = 0
                $length = $doc.Lines.Item(0).Length
            }
            'all' {
                $offset = 0
                $length = $doc.TextLength
            }
            'selected' {
                $offset = $this.EditorMain.SelectionStart
                $length = $this.EditorMain.SelectionLength
            }
            'line' {
                $offset = $doc.GetLineByOffset($curpos).Offset
                $length = $doc.GetLineByOffset($curpos).Length
            }
            'word' {
                return $this.GetUnitAt( $this._wordregex )
            }
            default {
                #::: Actor or 正規表現
                $regex = [Regex]$param
                foreach ( $actor in $this._actors ) {
                    if ( $actor.Key -eq $param ) { 
                        $regex = $actor.Regex
                        break
                    }
                }
                $curlinpos = $doc.GetLineByOffset($curpos).Offset
                $curlinlen = $doc.GetLineByOffset($curpos).Length
                $rellinpos = $curpos - $curlinpos
                $line = $doc.GetText( $curlinpos, $curlinlen )

                foreach ( $mat in $regex.Matches( $line ) ) {
                    if ( $mat.Index -le $rellinpos -and $rellinpos -lt $mat.Index + $mat.Length ) {
                        $offset = $curlinpos + $mat.Index
                        $length = $mat.Length
                        break
                    }
                }
            }
        }
        return @{
            Key    = $param
            Curpos = $curpos
            Offset = $offset
            Length = $length
            Value  = $this.EditorMain.Document.GetText( $offset, $length )
        }
    }
    [hashtable]     GetActorAt() {
        return $this.GetActorAt( $this.EditorMain.CaretOffset )
    }
    [hashtable]     GetActorAt( $offset ) {
        #::: @{ Key, CurPos, Offset, Length, Value, LinesOffset, LinesLength, LinesValue }

        $edit = $this.EditorMain
        $doc = $edit.Document
        $curlinpos = $doc.GetLineByOffset($offset).Offset
        $curlinlen = $doc.GetLineByOffset($offset).Length
        $curpos = $offset - $curlinpos
        $line = $doc.GetText( $curlinpos, $curlinlen )

        if ( 0 -lt $edit.SelectionLength ) {
            $lineslength = $doc.GetLineByOffset($offset + $edit.SelectionLength).EndOffset - $curlinpos
            return @{
                Key         = 'Selection'
                CurPos      = $edit.CaretOffset
                Offset      = $edit.SelectionStart
                Length      = $edit.SelectionLength
                Value       = $edit.SelectedText
                LinesOffset = $curlinpos
                LinesLength = $lineslength
                LinesValue  = $edit.Text.SubString( $curlinpos, $lineslength )
            }
        }

        $actors = $this._actors + @(  
            @{ Key = 'Keyword'; Regex = $this._editorkwregex },
            @{ Key = 'Word'; Regex = $this._wordregex }
        )
        foreach ( $actor in $actors ) {
            foreach ( $mat in $actor.Regex.Matches( $line ) ) {
                if ( $mat.Index -le $curpos -and $curpos -lt $mat.Index + $mat.Length ) {
                    return $this._replace_to_subactor( @{
                            Key    = $actor.Key
                            CurPos = $offset
                            Offset = $curlinpos + $mat.Index
                            Length = $mat.Length
                            Value  = $mat.Value
                        })
                }
            }
        }
        return @{
            Key    = 'Text'
            Curpos = $offset
            Offset = $curlinpos
            Length = $curlinlen
            Value  = $line
        }
    }
    #endregion
    #region Actor Date
    hidden [hashtable] $_datefmts = @{
        DateTag = @{ Format = '[yyyy-MM-dd]' }
        Date    = @{ Format = 'yyyy/MM/dd' }
        DateW   = @{ Format = 'yyyy/MM/dd (ddd)' }
        DateT   = @{ Format = 'yyyy/MM/dd HH:mm' }
        DateWT  = @{ Format = 'yyyy/MM/dd (ddd) HH:mm' }
        JDate   = @{ Format = 'yyyy年MM月dd日' }
        JDateW  = @{ Format = 'yyyy年MM月dd日 (ddd)' }
        JDateT  = @{ Format = 'yyyy年MM月dd日 HH:mm' }
        JDateWT = @{ Format = 'yyyy年MM月dd日 (ddd) HH:mm' }
        GDate   = @{ Format = 'ggyy年MM月dd日' }
        GDateW  = @{ Format = 'ggyy年MM月dd日 (ddd)' }
        GDateT  = @{ Format = 'ggyy年MM月dd日 HH時mm分' }
        GDateWT = @{ Format = 'ggyy年MM月dd日 (ddd) HH時mm分' }
    }
    [string]    FormatDate( [DateTime]$datetime, [string]$dateformat ) {
        $fmt = $this._datefmts[$dateformat].Format
        $clt = [CultureInfo]::New('ja-JP')
        if ( $dateformat -eq 'GDate' ) {
            $clt.DateTimeFormat.Calendar = [System.Globalization.JapaneseCalendar]::New()
        }
        return $datetime.ToString( $fmt, $clt )
    }
    [psobject]  GetDateAt( $operation ) {
        #::: DateTime Format WeekTime
        #region format analysis
        $actor = $this.GetActorAt()
        $fmttype = $actor.Key

        $datetime = (Get-Date)
        if ( $actor.Key -eq 'DateTag' ) {
            $datetime = (Get-Date $actor.Value.Substring(1, $actor.Length - 2).replace('-', '/') )
        }
        elseif ( $actor.Key -in @('DateTag', 'Date', 'JDate', 'GDate') ) {
            $datetime = (Get-Date $actor.Value )
        }
        $wttype = ''
        if ( $actor.Value.contains('(') ) {
            $wttype += 'W'
        }
        if ( $actor.Value.contains('時') -or $actor.Value.contains(':') ) {
            $wttype += 'T'
        }
        #endregion
        
        switch ( $operation ) {
            '+1d' { $datetime = $datetime.AddDays(+1) }
            '-1d' { $datetime = $datetime.AddDays(-1) }
            '+1w' { $datetime = $datetime.AddDays(+7) }
            '-1w' { $datetime = $datetime.AddDays(-7) }
            '+1m' { $datetime = $datetime.AddMonths(+1) }
            '-1m' { $datetime = $datetime.AddMonths(-1) }
            '+1y' { $datetime = $datetime.AddYears(+1) }
            '-1y' { $datetime = $datetime.AddYears(-1) }
            '+fmt' { $fmttype = @{ 'DateTag' = 'Date'; 'Date' = 'JDate'; 'JDate' = 'GDate'; 'GDate' = 'DateTag' }[$fmttype] }
            '-fmt' { $fmttype = @{ 'DateTag' = 'GDate'; 'Date' = 'DateTag'; 'JDate' = 'Date'; 'GDate' = 'JDate' }[$fmttype] }
            '+wt' { $wttype = @{ '' = 'W'; 'W' = 'T'; 'T' = 'WT'; 'WT' = '' }[$wttype] }
            '-wt' { $wttype = @{ '' = 'WT'; 'WT' = 'T'; 'T' = 'W'; 'W' = '' }[$wttype] }
            'w' { $wttype = @{ '' = 'W'; 'WT' = 'T'; 'T' = 'WT'; 'W' = '' }[$wttype] }
            't' { $wttype = @{ '' = 'T'; 'WT' = 'W'; 'T' = ''; 'W' = 'WT' }[$wttype] }
            'gengo' { $fmttype = 'GDate' }
            'japan' { $fmttype = 'JDate' }
            'tag' { $fmttype = 'DateTag' }
            'us' { $fmttype = 'Date' }
            'today' { $datetime = (Get-Date) }
            'insert' {
                $datetime = (Get-Date)
                $fmttype = 'JDate'
                $wttype = 'W'
                $actor.Offset = $actor.Curpos
                $actor.Length = 0
            }
        }
        return @{
            'DateTime' = $datetime
            'Format'   = $fmttype
            'WeekTime' = $wttype
            'Actor'    = $actor          #::: これあまりよくないのでは？　psobjにpsobjを繰り込んでいる。
        }
    }
    [void]      ReplaceDateAt( $operation ) {

        $dateinfo = $this.GetDateAt( $operation )
        $datetime = $dateinfo.DateTime
        $fmttype = $dateinfo.Format
        $wttype = $dateinfo.WeekTime
        $actor = $dateinfo.Actor

        $fmtdate = $this.Formatdate( $datetime, $fmttype + $wttype )
        $this.Replace( $actor.Offset, $actor.Length, $fmtdate )
        $this.SetOffset( $actor.Offset )
    }
    #endregion
    #region Operation
    [void]      SetOffset( $offset ) { $this.EditorMain.CaretOffset = $offset }
    [void]      Replace( $offset, $length, $text ) { $this.EditorMain.Document.Replace( $offset, $length, $text ) }
    [void]      Insert( $text ) {
        $this.EditorMain.Document.Insert( $this.EditorMain.CaretOffset, $text )
    }
    [void]      Paste( $text ) {
        #::: [241007] ここと,,,
        $this.EditorMain.Document.Insert( $this.EditorMain.CaretOffset, $text )
    }
    [void]      PasteNewLine( $text ) {
        #::: [241007] ここ、は書き換えよう。
        $this.EditorMain.Document.Insert( $this.EditorMain.CaretOffset, "`n" )
        $curpos = $this.EditorMain.CaretOffset
        $this.EditorMain.Document.Insert( $this.EditorMain.CaretOffset, $text )
        $this.EditorMain.CaretOffset = $curpos
    }
    [void]      EditNode( $action ) {
        $this.EditNode( $action, $this.EditorMain.SelectionStart, $this.EditorMain.SelectionLength )
    }
    [void]      EditNode( $action, $offset, $length ) {
        #region variable
        $editor = $this.EditorMain
        $doc = $editor.Document
        $endoffset = $offset + $length
        $lines = $doc.Lines.where{
            ($offset -le $_.Offset -and $_.Offset -lt $endoffset) -or
            ($offset -le $_.EndOffset -and $_.EndOffset -lt $endoffset) -or
            ($_.Offset -le $offset -and $endoffset -le $_.EndOffset )
        }
        #endregion
        switch ( $action ) {
            'init' {
                #::: init
                $doc.Insert( $lines[0].Offset, "# `n" )
                $editor.CaretOffset = $lines[0].Offset + 2
            }
            'inc' {
                #::: node_n → node_n+1, 選択範囲
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    if ( $doc.GetText( $lines[$i].Offset, $lines[$i].Length ) -match '^#+ ' ) {
                        $doc.Insert( $lines[$i].Offset, '#' ) 
                    }
                    elseif ( $lines.count -eq 1 ) {
                        $doc.Insert( $lines[0].Offset, "# " )
                    }
                }
            }
            'dec' {
                #::: node_m → node_n-1 or 非node, 選択範囲
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    if ( $doc.GetText( $lines[$i].Offset, $lines[$i].Length ) -match '^#+ ' ) {
                        if ( $Matches[0].Length -eq 2 ) {
                            $doc.Remove( $lines[$i].Offset, 2 )
                        }
                        else {
                            $doc.Remove( $lines[$i].Offset, 1 )
                        }
                    }
                }
            }
        }
    }
    [void]      EditBullet( $action ) {
        $this.EditBullet( $action, $this.EditorMain.SelectionStart, $this.EditorMain.SelectionLength )
    }
    [void]      EditBullet( $action, $offset, $length ) {
        #region variable
        $editor = $this.EditorMain
        $doc = $editor.Document
        $endoffset = $offset + $length
        $lines = $doc.Lines.where{
            ($offset -le $_.Offset -and $_.Offset -lt $endoffset) -or
            ($offset -le $_.EndOffset -and $_.EndOffset -lt $endoffset) -or
            ($_.Offset -le $offset -and $endoffset -le $_.EndOffset )
        }
        $bullets = '・ ,* ,- ,■ ,@ ,= '.split(',')
        $regexp = [Regex]'^(?<bul>(・ |\* |- |■ |@ |= ))'
        #endregion
        switch ( $action ) {
            'next' {
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    if ( $doc.GetText( $lines[$i].Offset, $lines[$i].Length ) -match $regexp ) {
                        $next = ( $Matches.bul | Get-Next Asc ($bullets -join ('|')) )
                        $doc.Replace( $lines[$i].Offset, $Matches.bul.Length, $next )
                    }
                    else {
                        $doc.Insert( $lines[$i].Offset, ("{0}" -f $bullets[0]) )
                    }
                }
            }
            'prev' {
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    if ( $doc.GetText( $lines[$i].Offset, $lines[$i].Length ) -match $regexp ) {
                        $prev = ( $Matches.bul | Get-Next Dsc ($bullets -join ('|')) )
                        $doc.Replace( $lines[$i].Offset, $Matches.bul.Length, $prev )
                    }
                    else {
                        $doc.Insert( $lines[$i].Offset, ("{0}" -f $bullets[0]) )
                    }
                }
            }
            'remove' {
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    if ( $doc.GetText( $lines[$i].Offset, $lines[$i].Length ) -match $regexp ) {
                        $doc.Remove( $lines[$i].Offset, $Matches.bul.Length )
                    }
                }
            }
        }
    }
    [void]      EditComment( $action ) {
        $this.EditComment( $action, $this.EditorMain.SelectionStart, $this.EditorMain.SelectionLength )
    }
    [void]      EditComment( $action, $offset, $length ) {
        #region variable
        $editor = $this.EditorMain
        $doc = $editor.Document
        $endoffset = $offset + $length
        $lines = $doc.Lines.where{
            ($offset -le $_.Offset -and $_.Offset -lt $endoffset) -or
            ($offset -le $_.EndOffset -and $_.EndOffset -lt $endoffset) -or
            ($_.Offset -le $offset -and $endoffset -le $_.EndOffset )
        }
        $tags = '; ,> ,| '.split(',')
        $regexp = [Regex]'^(?<tag>(; |> |\| ))'
        #endregion
        switch ( $action ) {
            'next' {
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    if ( $doc.GetText( $lines[$i].Offset, $lines[$i].Length ) -match $regexp ) {
                        $next = ( $Matches.tag | Get-Next Asc ($tags -join (',')) -Separator ',' )
                        $doc.Replace( $lines[$i].Offset, $Matches.tag.Length, $next )
                    }
                    else {
                        $doc.Insert( $lines[$i].Offset, ("{0}" -f $tags[0]) )
                    }
                }
            }
            'prev' {
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    if ( $doc.GetText( $lines[$i].Offset, $lines[$i].Length ) -match $regexp ) {
                        $prev = ( $Matches.tag | Get-Next Dsc ($tags -join (',')) -Separator ',' )
                        $doc.Replace( $lines[$i].Offset, $Matches.tag.Length, $prev )
                    }
                    else {
                        $doc.Insert( $lines[$i].Offset, ("{0}" -f $tags[0]) )
                    }
                }
            }
            'remove' {
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    if ( $doc.GetText( $lines[$i].Offset, $lines[$i].Length ) -match $regexp ) {
                        $doc.Remove( $lines[$i].Offset, $Matches.tag.Length )
                    }
                }
            }
        }
    }
    [bool]      EditTab( $action ) {
        return $this.EditTab( $action, $this.EditorMain.SelectionStart, $this.EditorMain.SelectionLength )
    }
    [bool]      EditTab( $action, $offset, $length ) {

        if ( 0 -eq $this.EditorMain.SelectionLength ) { return $false }

        #region variable
        $editor = $this.EditorMain
        $doc = $editor.Document
        $endoffset = $offset + $length
        $lines = $doc.Lines.where{
            ($offset -le $_.Offset -and $_.Offset -lt $endoffset) -or
            ($offset -le $_.EndOffset -and $_.EndOffset -lt $endoffset) -or
            ($_.Offset -le $offset -and $endoffset -le $_.EndOffset )
        }
        #endregion
        switch ( $action ) {
            'add' {
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    $doc.Insert( $lines[$i].Offset, "`t" )
                }
            }
            'remove' {
                for ( $i = $lines.count - 1; 0 -le $i; $i -= 1 ) {
                    if ( $doc.GetText( $lines[$i].Offset, $lines[$i].Length ) -match "^`t" ) {
                        $doc.Remove( $lines[$i].Offset, 1 )
                    }
                }
            }
        }
        return $true
    }
    #endregion
    #region Node
    [psobject[]]    GetNodesAt( [string]$target ) {
        $this.UpdateNodesPos()
        $caretoffset = $this.EditorMain.CaretOffset
        $nodes = $this._nodes

        if ( $curnode = $nodes.where{ $_.Index -le $caretoffset }[-1] ) {
            switch ( $target ) {
                'firstlevel' {
                    return $nodes.where{ $_.Length -eq 1 }
                }
                'children' {
                    if ( $nextnode = $nodes.where{ $curnode.Index -lt $_.Index -and $curnode.Length -eq $_.Length }[0] ) {
                        return $nodes.where{ 
                            $curnode.Index -lt $_.Index -and $_.Index -lt $nextnode.Index -and ($curnode.Length + 1) -eq $_.Length 
                        }
                    }
                    else {
                        return $nodes.where{ 
                            $curnode.Index -lt $_.Index -and ($curnode.Length + 1) -eq $_.Length
                        }
                    }
                }
                'siblings' {
                    if ( $parnode = $nodes.where{ $_.Index -lt $curnode.Index -and ($curnode.Length - 1) -eq $_.Length }[-1] ) {
                        if ( $nextnode = $nodes.where{ $parnode.Index -lt $_.Index -and $parnode.Length -eq $_.Length }[0] ) {
                            return $nodes.where{ 
                                $parnode.Index -lt $_.Index -and $_.Index -lt $nextnode.Index -and $curnode.Length -eq $_.Length 
                            }
                        }
                        else {
                            return $nodes.where{ 
                                $parnode.Index -lt $_.Index -and $curnode.Length -eq $_.Length
                            }
                        }
                    }
                    else {
                        return $this.GetNodesAt('firstlevel')
                    }
                }
                'descendants' {
                    if ( $nextnode = $nodes.where{ $curnode.Index -lt $_.Index -and $curnode.Length -eq $_.Length }[0] ) {
                        return $nodes.where{ 
                            $curnode.Index -lt $_.Index -and $_.Index -lt $nextnode.Index -and $curnode.Length -lt $_.Length  
                        }
                    }
                    else {
                        return $nodes.where{ 
                            $curnode.Index -lt $_.Index -and $curnode.Length -lt $_.Length
                        }
                    }
                }
            }
        }

        return @()
    }
    [void]          ChangeNodeStateAt( [string]$action ) {
        $this.UpdateNodesPos()
        #region variant
        $edit = $this.EditorMain
        if ( !$edit.IsVisible ) { return }
        $foldman = $this.FoldManager
        $curlin = $edit.Document.GetLineByOffset($edit.CaretOffset)
        #endregion
        switch ( $action ) {
            'open' {
                $node = $foldman.GetFoldingsAt( $curlin.EndOffset )[0]
                if ( $node.IsFolded ) { $node.IsFolded = $False }
                else { $this.ChangeNodeStateAt('openchildren') }
            }
            'close' {
                # 自Node Close→ 自兄弟Node Close 
                $node = $foldman.GetFoldingsAt( $curlin.EndOffset )[0]
                if ( !$node.IsFolded ) { $node.IsFolded = $True }
                else { $this.ChangeNodeStateAt('closesiblings') }
            }
            'openall' {
                $foldman.AllFoldings.foreach{ $_.IsFolded = $false }
            }
            'closeall' {
                $foldman.AllFoldings.foreach{ $_.IsFolded = $true }
            }
            'openchildren' {
                $this.ChangeFolding( $this.GetNodesAt('children'), $false )
            }
            'closechildren' {
                $this.ChangeFolding( $this.GetNodesAt('children'), $true )
            }
            'opendescendants' {
                $this.ChangeFolding( $this.GetNodesAt('descendants'), $false )
            }
            'closedescendants' {
                $this.ChangeFolding( $this.GetNodesAt('descendants'), $true )
            }
            'opensiblings' {
                $this.ChangeFolding( $this.GetNodesAt('siblings'), $false )
            }
            'closesiblings' {
                $this.ChangeFolding( $this.GetNodesAt('siblings'), $true )
            }
        }
    }
    [void]          ChangeFolding( [psobject[]]$nodes, [bool]$isfolded ) {
        $nodes.foreach{
            $endoffset = $this.EditorMain.Document.GetLineByOffset( $_.Index ).EndOffset
            $this.FoldManager.GetFoldingsAt( $endoffset ).foreach{ $_.IsFolded = $isfolded }
            # $this.FoldManager.GetFoldingsAt( $endoffset )[0].IsFolded = $isfolded
        }
    }
    #endregion
    #region Get**Sections, GetActorPositions 
    [psobject[]]    GetAllSections() {          # [ @{ Index, Length, Number } ]
        $secnumbers = @( -1, 0, 0, 0, 0, 0, 0, 0, 0 )
        return [RegEx]::Matches( $this.EditorMain.Text, '^#+(?= )', 2 ).foreach{ #::: 2:multiline
            $prenums = $secnumbers[0..($_.Length - 1)]
            $curnum  = $secnumbers[$_.Length] + 1
            $pstnums = @(0) * ( $secnumbers.Length - 1 - $_.Length )
            @{
                Index  = $_.Index
                Length = $_.Length
                Number = @( $prenums + $curnum + $pstnums )[1..($secnumbers.Length - 1)] -join ('.')
            }
            $secnumbers = @( $prenums + $curnum + $pstnums )
        }
    }
    [psobject[]]    GetUnfoldedSections() {     # [ @{ Index, Length, Number } ]
        if ( ($sections = $this.GetAllSections()).count ) {
            return $sections.where{ 
                $_.Length -eq 1 -or (
                    @($this.FoldManager.GetFoldingsContaining( $_.Index ).IsFolded)[0..($_.Length-1)] -notcontains $true
                )
            }
        }
        return @()
     }
    [psobject[]]    GetChildSections( [int]$offset ) {      # [ @{ Index, Length, Number } ]
        if ( ($sections = $this.GetAllSections()).count ) {
            if ( $cursec = $sections.where{ $_.Index -le $offset }[-1] ) {
                $childnum = $cursec.Number.split('.')
                $childnum[$cursec.Length] = '*'
                $childtag = $childnum -join '.'
                return $sections.where{ $_.Number -like $childtag }
            }
        }
        return @()
     }
    [psobject[]]    GetSiblingSections( [int]$offset ) {    # [ @{ Index, Length, Number } ]
        if ( ($sections = $this.GetAllSections()).count ) {
            if ( $cursec = $sections.where{ $_.Index -le $offset }[-1] ) {
                $sibnum = $cursec.Number.split('.')
                $sibnum[$cursec.Length - 1] = '*'
                $sibtag = $sibnum -join '.'
                return $sections.where{ $_.Number -like $sibtag -and $_.Length -eq $cursec.Length }
            }
        }
        return @()
     }
    [psobject]      GetParentSection( [int]$offset ) {      # @{ Index, Length, Number }
        if ( ($sections = $this.GetAllSections()).count ) {
            if ( $cursec = $sections.where{ $_.Index -le $offset }[-1] ) {
                $parnum = $cursec.Number.split('.')
                $parnum[$cursec.Length - 2] = '*'
                $partag = $parnum -join '.'
                return $sections.where{ $_.Number -like $partag }[0]
            }
        }
        return $null
     }
    [psobject[]]    GetActorPositions( [int]$offset ) {     # [ @{ Start, End } ]
        $positions = @()
        $this._actors.where{ $_.Key -match '^(WebPath|FilePath|ChildPath|Tag|Query)$' }.foreach{
            $positions += $_.Regex.Matches( $this.EditorMain.Text ).foreach{ 
                @{  
                    Start = $_.Index
                    End   = $_.Index + $_.Length - 1 
                }
            }
        }
        return $positions
     }
    #endregion
    #region _find/FindM/PositionM/MoveM/SelectM/EditM
    [hashtable]     _find( [TextEditor]$editor, [string]$action, [int]$pos, [Regex]$regex ) {   # @{ Start, End }
        #region variant
        $edit = $editor
        $curlin = $edit.Document.GetLineByOffset( $edit.CaretOffset )
        $curpos = @( $pos, $edit.CaretOffset )[ $pos -eq -1 ]
        #endregion
        switch ( $action ) {
            'cur' {
                $txtlin = $edit.Text.Substring( $curlin.Offset, $curlin.Length )
                $poslin = $curpos - $curlin.offset
                foreach ( $mat in $regex.Matches( $txtlin ) ) {
                    if ( $mat.Index -le $poslin -and $poslin -lt $mat.Index + $mat.Length ) {
                        return @{
                            Start = $curlin.offset + $mat.Index
                            End   = $curlin.offset + $mat.Index + $mat.Length
                        }
                    }
                }
            }
            'prev' {
                if ( $mat = @($regex.Matches( $edit.Text.Substring( 0, $curpos ) ))[-1] ) {
                    return @{
                        Start = $mat.Index
                        End   = $mat.Index + $mat.Length
                    }
                }
            }
            'next' {
                if ( $mat = $regex.Matches( $edit.Text.Substring( $curpos  + 1 ) )[0] ) {
                    return @{
                        Start = $curpos + $mat.Index + 1
                        End   = $curpos + $mat.Index + $mat.Length
                    }
                }
            }
            'first' {
                if ( $mat = $regex.Matches( $edit.Text )[0] ) {
                    return @{
                        Start = $mat.Index
                        End   = $mat.Index + $mat.Length
                    }
                }
            }
            'last' {
                if ( $mat = @($regex.Matches( $edit.Text ))[-1] ) {
                    return @{
                        Start = $mat.Index
                        End   = $mat.Index + $mat.Length
                    }
                }
            }
        }
        return @{
            Start = -1
            End =   -1
        }
     }
    [hashtable]     FindM( [string]$action, [int]$pos, [string]$restr ) {   # @{ Start, End }
        $regex = [Regex]::New( $restr, [RegexOptions]::Multiline )
        return $this.FindM( $action, $pos, $regex )
     }
    [hashtable]     FindM( [string]$action, [int]$pos, [Regex]$regex ) {    # @{ Start, End }
        return $this._find( $this.EditorMain, $action, $pos, $regex )
     }
    [int]           PositionM( [int]$offset, [string]$action ) {
        #region variant
        $edit = $this.EditorMain
        $doc = $edit.Document
        $area = $edit.TextArea
        $curlin = $doc.GetLineByOffset( $offset )
        $pretext = $edit.Text.Substring( 0, $offset )
        $posttext = try { $edit.Text.Substring( $offset + 1 ) }catch { '' }
        $curloc = $doc.GetLocation( $offset )
        #endregion
        try {
            switch ($action) {
                'right' { if ( $offset -lt $doc.TextLength - 1 ) { return $offset + 1 } }
                'left' { if ( 0 -lt $offset ) { return $offset - 1 } }
                'down' { if ( $curloc.Line -lt $doc.LineCount ) { return $doc.GetOffset( $curloc.Line + 1, $curloc.Column ) } }
                'up' { if ( 0 -lt $curlin.LineNumber ) { return $doc.GetOffset( $curloc.Line - 1, $curloc.Column ) } }
                'linestart' { return $curlin.Offset }
                'lineend' { return $curlin.EndOffset }
                'docstart' { return 0 }
                'docend' { return $doc.TextLength }
                
                'linestart+' { return @( $curlin.Offset, 0 )[ $curlin.Offset -eq $offset] }
                'lineend+' { return @( $curlin.EndOffset, $doc.TextLength )[ $curlin.EndOffset -eq $offset ] }

                'nextword' { return $this.FindM( 'next', $offset, $this._wordregex ).Start }
                'prevword' { return $this.FindM( 'prev', $offset, $this._wordregex ).Start }
                'curword' { return $this.FindM( 'cur', $offset, $this._wordregex ).Start }
                'curwordend' { return $this.FindM( 'cur', $offset, $this._wordregex ).End }

                'nextkeyword' { return $this.FindM( 'next', $offset, $this._editorkwregex ).Start }
                'prevkeyword' { return $this.FindM( 'prev', $offset, $this._editorkwregex ).Start }
                'lastkeyword' { return $this.FindM( 'last', $offset, $this._editorkwregex ).Start }
                'firstkeyword' { return $this.FindM( 'first', $offset, $this._editorkwregex ).Start }
                'curkeyword' { return $this.FindM( 'cur', $offset, $this._editorkwregex ).Start }
                'curkeywordend' { return $this.FindM( 'cur', $offset, $this._editorkwregex ).End }

                'cursec' { if ( ($sections = $this.GetAllSections().where{ $_.Index -le $offset }).count ) { return $sections[-1].Index } }
                'prevsec' { if ( ($sections = $this.GetUnfoldedSections().where{ $_.Index -lt $offset }).count ) { return $sections[-1].Index } }
                'nextsec' { if ( ($sections = $this.GetUnfoldedSections().where{ $offset -lt $_.Index }).count ) { return $sections[0].Index } }
                'firstsec' { if ( ($sections = $this.GetAllSections()).count ) { return $sections[0].Index } }
                'lastsec' { if ( ($sections = $this.GetAllSections()).count ) { return $sections[-1].Index } }
                'nextsibsec' {  if ( ($sibsecs = $this.GetSiblingSections($offset).where{ $offset -lt $_.Index }).count ) { return $sibsecs[0].Index }}
                'prevsibsec' {  if ( ($sibsecs = $this.GetSiblingSections($offset).where{ $_.Index -lt $offset }).count ) { return $sibsecs[-1].Index } }
                'firstsibsec' { if ( ($sibsecs = $this.GetSiblingSections($offset)).count ) { return $sibsecs[0].Index } }
                'lastsibsec' { if ( ($sibsecs = $this.GetSiblingSections($offset)).count ) { return $sibsecs[-1].Index } }
                'parentsec' { return $this.GetParentSection($offset) }
                'firstchildsec' { if ( ($childsecs = $this.GetChildSections($offset)).count ) { return $childsecs[0] } }
                'lastchildsec' { if ( ($childsecs = $this.GetChildSections($offset)).count ) { return $childsecs[-1] } }

                'nextactor' { if ( ($acts = $this.GetActorPositions($offset)).where{ $offset -lt $_.Start }.count ) { return $acts[0].Start } }
                'prevactor' { if ( ($acts = $this.GetActorPositions($offset)).where{ $_.Start -lt $offset }.count ) { return $acts[-1].Start } }
                'firstactor' { if ( ($acts = $this.GetActorPositions($offset)).count ) { return $acts[0].Start } }
                'lastactor' { if ( ($acts = $this.GetActorPositions($offset)).count ) { return $acts[-1].Start } }
                'curactor' { if ( ($act = $this.GetActorPositions($offset).where{ $_.Start -eq $offset -and $offset -lt $_.End }[0]) ) { return $act.Start } }
                'curactorend' { if ( ($act = $this.GetActorPositions($offset).where{ $_.Start -eq $offset -and $offset -lt $_.End }[0]) ) { return $act.End } }

                'nextfilepath' { return $this.FindM( 'next', $offset, $this._actors.where{ $_.Key = 'FilePath' }[0].Regex ).Start }
                'prevfilepath' { return $this.FindM( 'prev', $offset, $this._actors.where{ $_.Key = 'FilePath' }[0].Regex ).Start }
                'curfilepath' { return $this.FindM( 'cur', $offset, $this._actors.where{ $_.Key = 'FilePath' }[0].Regex ).Start }
                'curfilepathend' { return $this.FindM( 'cur', $offset, $this._actors.where{ $_.Key = 'FilePath' }[0].Regex ).End }

                'nextwebpath' { return $this.FindM( 'next', $offset, $this._actors.where{ $_.Key = 'WebPath' }[0].Regex ).Start }
                'prevwebpath' { return $this.FindM( 'prev', $offset, $this._actors.where{ $_.Key = 'WebPath' }[0].Regex ).Start }
                'curwebpath' { return $this.FindM( 'cur', $offset, $this._actors.where{ $_.Key = 'WebPath' }[0].Regex ).Start }
                'curwebpathend' { return $this.FindM( 'cur', $offset, $this._actors.where{ $_.Key = 'WebPath' }[0].Regex ).End }

                'nextdate' { return $this.FindM( 'next', $offset, $this._actors.where{ $_.Key = 'PanDate' }[0].Regex ).Start }
                'prevdate' { return $this.FindM( 'prev', $offset, $this._actors.where{ $_.Key = 'PanDate' }[0].Regex ).Start }
                'curdate' { return $this.FindM( 'cur', $offset, $this._actors.where{ $_.Key = 'PanDate' }[0].Regex ).Start }
                'curdateend' { return $this.FindM( 'cur', $offset, $this._actors.where{ $_.Key = 'PanDate' }[0].Regex ).End }
                default {
                    # 正規表現/テキスト at*, next*, prev*, first*, last*
                    switch -regex ( $action ) {
                        'atre:(?<re>.+)' { return $this.FindM( 'at', $Matches.re ).Start }
                        'nextre:(?<re>.+)' { return $this.FindM( 'next', $Matches.re ).Start }
                        'prevre:(?<re>.+)' { return $this.FindM( 'prev', $Matches.re ).Start }
                        'firstre:(?<re>.+)' { return $this.FindM( 'first', $Matches.re ).Start }
                        'lastre:(?<re>.+)' { return $this.FindM( 'last', $Matches.re ).Start }
                        'attext:(?<txt>.+)' { return $this.FindM( 'at', [Regex]::Escape($Matches.txt) ).Start }
                        'nexttext:(?<txt>.+)' { return $this.FindM( 'next', [Regex]::Escape($Matches.txt) ).Start }
                        'prevtext:(?<txt>.+)' { return $this.FindM( 'prev', [Regex]::Escape($Matches.txt) ).Start }
                        'firsttext:(?<txt>.+)' { return $this.FindM( 'first', [Regex]::Escape($Matches.txt) ).Start }
                        'lasttext:(?<txt>.+)' { return $this.FindM( 'last', [Regex]::Escape($Matches.txt) ).Start }
                    }
                }
            }
        }
        catch {}
        return $offset
     }
    [TTPanelEditor] MoveM( [string]$action ) {
        $edit = $this.EditorMain
        $area = $edit.TextArea
        try {
            switch ( $action ) {
                'right' { [EditingCommands]::MoveRightByCharacter.Execute($null, $area); break }
                'left' { [EditingCommands]::MoveLeftByCharacter.Execute($null, $area); break }
                'up' { [EditingCommands]::MoveUpByLine.Execute($null, $area); break }
                'down' { [EditingCommands]::MoveDownByLine.Execute($null, $area); break }
                'linestart' { [EditingCommands]::MoveToLineStart.Execute($null, $area); break }
                'lineend' { [EditingCommands]::MoveToLineEnd.Execute($null, $area); break }
                'docstart' { [EditingCommands]::MoveToDocumentStart.Execute($null, $area); break }
                'docend' { [EditingCommands]::MoveToDocumentEnd.Execute($null, $area); break }
                default {
                    $pos = $this.PositionM( $edit.CaretOffset, $action )
                    if( 0 -le $pos ){ $edit.CaretOffset = $pos } 
                }
            }
            $area.Caret.BringCaretToView()
            
        }
        catch {}
        return $this
     }
    [TTPanelEditor] SelectM( [string]$action ) {
        #region variant
        $edit = $this.EditorMain
        $area = $edit.TextArea
        $curlin = $edit.Document.GetLineByOffset( $edit.CaretOffset )
        $curpos = $edit.CaretOffset
        #endregion
        try {
            switch ( $action ) {
                'right' { [EditingCommands]::SelectRightByCharacter.Execute($null, $area); break }
                'left' { [EditingCommands]::SelectLeftByCharacter.Execute($null, $area); break }
                'up' { [EditingCommands]::SelectUpByLine.Execute($null, $area); break }
                'down' { [EditingCommands]::SelectDownByLine.Execute($null, $area); break }
                'linestart' { [EditingCommands]::SelectToLineStart.Execute($null, $area); break }
                'lineend' { [EditingCommands]::SelectToLineEnd.Execute($null, $area); break }
                'docstart' { [EditingCommands]::SelectToDocumentStart.Execute($null, $area); break }
                'docend' { [EditingCommands]::SelectToDocumentEnd.Execute($null, $area); break }

                'all' { [ApplicationCommands]::SelectAll.Execute($null, $area); break }
                'curline' {
                    $edit.SelectionStart = $curlin.Offset
                    $edit.SelectionLength = $curlin.Length
                    break
                }
                'curword' {
                    $range = $this.FindM( 'cur', $curpos, $this._wordregex )
                    if( $range.Start -eq -1 ) { break }
                    $edit.SelectionStart = $range.Start
                    $edit.SelectionLength = $range.End - $range.Start
                    break
                }
                'curkeyword' {
                    $range = $this.FindM( 'cur', $curpos, $this._editorkwregex )
                    if( $range.Start -eq -1 ) { break }
                    $edit.SelectionStart = $range.Start
                    $edit.SelectionLength = $range.End - $range.Start
                    break
                }
                'cursection' {
                    $startpos = $this.PositionM( 'cursection', $edit.CaretOffset )
                    $endpos = $this.PositionM( 'nextsection', $edit.CaretOffset )
                    $edit.SelectionStart = $startpos
                    $edit.SelectionLength = $endpos - $startpos + 1
                    break
                }
                'curactor' {
                    $startpos = $this.PositionM( 'curactor', $edit.CaretOffset )
                    $endpos = $this.PositionM( 'curactorend', $edit.CaretOffset )
                    if( $startpos -eq $endpos ) { break }
                    $edit.SelectionStart = $startpos
                    $edit.SelectionLength = $endpos - $startpos + 1
                    break
                }
                'curfilepath' {
                    $startpos = $this.PositionM( 'curfilepath', $edit.CaretOffset )
                    $endpos = $this.PositionM( 'curfilepathend', $edit.CaretOffset )
                    if( $startpos -eq $endpos ) { break }
                    $edit.SelectionStart = $startpos
                    $edit.SelectionLength = $endpos - $startpos + 1
                    break
                }
                'curwebpath' {
                    $startpos = $this.PositionM( 'curwebpath', $edit.CaretOffset )
                    $endpos = $this.PositionM( 'curwebpathend', $edit.CaretOffset )
                    if( $startpos -eq $endpos ) { break }
                    $edit.SelectionStart = $startpos
                    $edit.SelectionLength = $endpos - $startpos + 1
                    break
                }
                'curdate' {
                    $startpos = $this.PositionM( 'curdate', $edit.CaretOffset )
                    $endpos = $this.PositionM( 'curdateend', $edit.CaretOffset )
                    if( $startpos -eq $endpos ) { break }
                    $edit.SelectionStart = $startpos
                    $edit.SelectionLength = $endpos - $startpos + 1
                    break
                }
                default {
                    $tgtpos = $this.PositionM( $curpos, $action )
                    if ( $curpos -lt $tgtpos ) {
                        $edit.SelectionLength = $tgtpos - $edit.SelectionStart
                    }
                    else {
                        $edit.SelectionStart = $tgtpos
                        $edit.SelectionLength = ( $curpos - $tgtpos )
                    }
                }
            }
            $area.Caret.BringCaretToView()
        }
        catch {}
        return $this
     }
    [void]          EditM( [string]$action ) {
        #region variant
        $edit = $this.EditorMain
        $doc = $edit.Document
        $area = $edit.TextArea
        $curlin = $doc.GetLineByOffset( $edit.CaretOffset )
        $caret = $area.Caret
        #endregion
        try {
            switch ( $action ) {
                'delete' {          [EditingCommands]::Delete.Execute( $null, $area ); break }
                'backspace' {       [EditingCommands]::Backspace.Execute( $null, $area ); break }
                'deletenextword' {  [EditingCommands]::DeleteNextWord.Execute( $null, $area ); break }
                'deleteprevword' {  [EditingCommands]::DeletePreviousWord.Execute( $null, $area ); break }
                'deletelineend' {   $this.SelectM('lineend').EditM('delete'); break }
                'deletelinestart' { $this.SelectM('linestart').EditM('delete'); break }
                'deleteline' {      $this.SelectM('curline').EditM('delete'); break }
                'deletedocend' {    $this.SelectM('docend').EditM('delete'); break }
                'deletedocstart' {  $this.SelectM('docstart').EditM('delete'); break }
                'paste' {   $edit.Paste() }
                'copy' {    $edit.Copy() }
                'cut' {     $edit.Cut() }
                'redo' {    $edit.Redo() }
                'undo' {    $edit.Undo() }
                default {
                    $this.SelectM( $_ ).EditM('delete')
                    break
                }
            }
        }
        catch {}
     }
    [void]          EditM( [string]$action, [string]$text ){
        $this.EditM( $action, $text, -1 )
    }
    [void]          EditM( [string]$action, [string]$text, [int]$pos ){
        #region variant
        $edit = $this.EditorMain
        $doc = $edit.Document
        $area = $edit.TextArea
        $curlin = $doc.GetLineByOffset( $edit.CaretOffset )
        $caret = $area.Caret
        #endregion
        try {
            switch( $action ){
                'insert' {
                    if( $pos -eq -1 ){  $pos = $edit.CaretOffset }
                    $edit.Document.Insert( $pos, $text )
                }
            }
        }
        catch {}
    }

    #endregion
    #region UpdateEditorTitle
    [void] UpdateEditorTitle() {
        $this.SetTitle(( '| {0} | {1}' -f $this.MemoID, $this.GetUnitAt('first').Value ))
    }
    #endregion
}
class TTPanelTable : TTPanelEditor {
    #region New, Setup()
    TTPanelTable( $name, $parent ) : Base( $name, $parent ) {
        $this.TableResource = ''
        $this._tablecurpos = -1

        # $this.TableMain.SelectionUnit = [DataGridSelectionUnit]::FullRow
        # $this.TableMain.SelectionMode = [DataGridSelectionMode]::Single
    }
    [void] Setup() {
        $this.TableMain.SelectedIndex = $this._tablecurpos
        ([TTPanelEditor]$this).Setup()
    }
    #endregion
    #region Resource
    [string]    $TableResource
    [string[]]  $AllItems
    [string[]]  $DispItems
    [void]      ResetTableResource() {
        try {
            $view = [System.Windows.Data.CollectionViewSource]::GetDefaultView( $this.TableMain.ItemsSource )
            $dir = $view.SortDescriptions.Direction
            $header = $view.SortDescriptions.PropertyName
            $this._header_dir = '{0}|{1}' -f $header, $dir

            $collection = $global:Models.GetCollection( $this.TableResource )
            write-host ("250610 ResetTableResource: {0}" -f $collection.Name)
            $childclass = $collection.Property().ChildClassName
            $property = ( Get-TTModelProperty $childclass )

            $this.AllItems = $property.TableItems.All.split(',')
            $this.DispItems = $property.TableItems.($this.Name).split(',')

            $this.TableMain.ItemsSource = $collection.GetItems()
            $this.TableMain.AutoGenerateColumns = $false
            $this.TableMain.Columns.Clear()

            $this.DispItems.foreach{
                $col = [DataGridTextColumn]::New()
                $col.Header = $property.TableHeaders.$_
                $col.Binding = [Data.Binding]::New($_)
                if ( $_ -eq $this.DispItems[-1] ) { $col.Width = "*" }
                $this.TableMain.Columns.Add( $col )
            }

            $this.SetTableSort($this._header_dir)
            $this.UpdateTableFilter()
            $this.TableMain.Items.Refresh()
            $this.TableCursor('first')

            # Debug ('ResetTableResource: {0}:{1}' -f $this.Name,$this._header_dir)

        }
        catch { 
            Show-Error "TTPanel::ResetTableResource"
        }
    }
    [void]      SetTableResource( [string] $resid ) {
        try {
            if ( $resid.length -eq 0 ) { return }

            $collection = $global:Models.GetCollection( $resid )
            $childclass = $collection.Property().ChildClassName
            $property = ( Get-TTModelProperty $childclass )

            $this.TableResource = $resid
            $this.AllItems = $property.TableItems.All.split(',')
            $this.DispItems = $property.TableItems.($this.Name).split(',')

            $this.TableMain.ItemsSource = $collection.GetItems()
            $this.TableMain.AutoGenerateColumns = $false
            $this.TableMain.Columns.Clear()

            $this.DispItems.foreach{
                $col = [DataGridTextColumn]::New()
                $col.Header = $property.TableHeaders.$_
                $col.Binding = [Data.Binding]::New($_)
                if ( $_ -eq $this.DispItems[-1] ) { $col.Width = "*" }
                $this.TableMain.Columns.Add( $col )
            }

            $this.SetTableSort('ID|Ascending')
            $this.UpdateTableFilter()
            $this.TableMain.Items.Refresh()
            $this.TableCursor('first')

        }
        catch { 
            Show-Error "TTPanel::SetTableResource( $resid )"
        }
    }
    #endregion
    #region Cursor
    [long]      $_tablecurpos
    [void]      TableCursor( [string]$action ) {
        $tbl = $this.TableMain
        if ( !$tbl.IsVisible ) { return }
        switch ( $action ) {
            'repos' { $tbl.SelectedIndex = -1; $tbl.SelectedIndex = $this._tablecurpos }
            'up' { $tbl.SelectedIndex -= if ( 0 -lt $tbl.SelectedIndex ) { 1 }else { 0 } }
            'down' { $tbl.SelectedIndex += if ( $tbl.SelectedIndex -lt $tbl.Items.Count - 1 ) { 1 }else { 0 } }
            'first' { $tbl.SelectedIndex = 0 }
            'last' { $tbl.SelectedIndex = $tbl.Items.Count - 1 }
            'up+' { $tbl.SelectedIndex -= if ( 0 -le $tbl.SelectedIndex ) { 1 }else { - $tbl.Items.Count } }
            'down+' { $tbl.SelectedIndex += if ( $tbl.SelectedIndex -lt $tbl.Items.Count - 1 ) { 1 }else { - $tbl.Items.Count } }
            default {
                try {
                    switch -regex ( $action ) {
                        '^d(\d)$' { $tbl.SelectedIndex = [int]($Matches.1) - 1 }
                        '^(\d+)$' { $tbl.SelectedIndex = [int]$action - 1 }
                    }
                }
                catch {
                    if ( $item = $tbl.FindName($action) ) { $tbl.SelectedItem = $item }
                }
            }
        }
        
        $this._tablecurpos = $tbl.SelectedIndex

        if ( 0 -le $tbl.SelectedIndex ) {
            $tbl.ScrollIntoView( $tbl.SelectedItem )
        }
    }
    #endregion
    #region View
    [void]      SetColumnHeaderVisible( $vis ) {
        $headvis = $this.TableMain.HeadersVisibility

        switch ( $vis ) {
            'true' { $headvis = $headvis -bor [DataGridHeadersVisibility]::Column }
            'false' { $headvis = $headvis -bxor [DataGridHeadersVisibility]::Column }
            'toggle' { $this.SetColumnHeaderVisible( !$this.GetColumnHeaderVisible() ); return }
        }

        $this.TableMain.HeadersVisibility = $headvis
    }
    [bool]      GetColumnHeaderVisible() {
        return [bool]( $this.TableMain.HeadersVisibility -band [DataGridHeadersVisibility]::Column ) 
    }
    [void]      SetRowHeaderVisible( $vis ) {
        $headvis = $this.TableMain.HeadersVisibility

        switch ( $vis ) {
            'true' { $headvis = $headvis -bor [DataGridHeadersVisibility]::Row }
            'false' { $headvis = $headvis -bxor [DataGridHeadersVisibility]::Row }
            'toggle' { $this.SetRowHeaderVisible( !$this.GetRowHeaderVisible() ); return }
        }

        $this.TableMain.HeadersVisibility = $headvis
    }
    [bool]      GetRowHeaderVisible() {
        return [bool]( $this.TableMain.HeadersVisibility -band [DataGridHeadersVisibility]::Row ) 
    }
    #endregion
    #region Keyword (for Sort, Filter)
    [int]       $Count
    [string]    $_header_dir
    [void]      UpdateTableFilter() {
        switch -regex ( $this.GetKeyword('Table') ) {
            '^$' {
                if ( $null -eq $this.TableMain.ItemsSource ) { return }
                [CollectionViewSource]::GetDefaultView( $this.TableMain.ItemsSource ).Filter = $null
            }
            '@(?<n>\d+)(?<u>[dwmy])' {
                $duration = @{ d = 1; w = 7; m = 30; y = 365 }[$Matches.u] * [int]($Matches.n)
                $date = (Get-Date).AddDays(-$duration).tostring('yyyy-MM-dd')
                [CollectionViewSource]::GetDefaultView( $this.TableMain.ItemsSource ).Filter = {
                    Param( $item )
                    return $item.IsUpdatedAfter( $script:date )
                }.GetNewClosure()
            }
            're:(?<re>.*)' {
                $regex = ( '.*{0}.*' -f $Matches.re )
                [CollectionViewSource]::GetDefaultView( $this.TableMain.ItemsSource ).Filter = {
                    Param( $item )
                    return $item.IsUpdatedAt( $script:regex )
                }.GetNewClosure()
            }
            default {
                # $terms = ( $_ -replace '([\*\?\[\]])', '`$1' ).split(',').Trim()
                $terms = [regex]::escape($_).split(',').Trim()
                [CollectionViewSource]::GetDefaultView( $this.TableMain.ItemsSource ).Filter = {
                    Param( $item )
                    foreach ( $term in $script:terms ) {
                        if ( $item.IsMatched($term) ) { return $true }
                    }
                    return $false
                }.GetNewClosure()
            }
        }
        $this.TableCursor('repos')
    }



    #030401 MemoのSortが遅い
    [void]      SetTableSort( [string] $header_dir ) {
        #::: header | (Ascending|Descending|toggle)
        if ( '' -eq $header_dir -or $this.TableResource -eq '' ) { return }

        $this._header_dir = $header_dir        #::: $header|$dir 
        $header, $dir = $header_dir.split('|')

        if ( [int]::TryParse($header, [ref]$null) ) {
            #::: $headerが数値(1base)
            $num = [int]$header
            if ( $this.DispItems.count -le $num ) {
                $num = $num - $this.DispItems.count
                $this.DispItems = $this.AllItems.where{ $_ -notin $this.DispItems }
            }
            $header = $this.DispItems[$num - 1]
        }
        elseif ( $header -notin $this.AllItems ) {
            #::: Index
            $header = 'ID'
        }

        try {
            $view = [System.Windows.Data.CollectionViewSource]::GetDefaultView( $this.TableMain.ItemsSource )

            $this.Count = $view.count

            $sortDescription = New-Object System.ComponentModel.SortDescription( $header, $dir )
            $view.SortDescriptions.Clear()
            $view.SortDescriptions.Add( $sortDescription )
        }
        catch {
            Show-Error 'SetTableSort'
        }

        $this.TableCursor('repos')

    }
    #endregion
}
class TTPanelWebView : TTPanelTable {
    #region variable, New, Setup()
    TTPanelWebView( $name, $parent ) : Base( $name, $parent ) {
    }
    [void] Setup() {
        ([TTPanelTable]$this).Setup()
        $this.WebViewMain.CreationProperties = [Microsoft.Web.WebView2.Wpf.CoreWebView2CreationProperties]::new()
        $this.WebViewMain.CreationProperties.UserDataFolder = $global:LinkPath
        $this.WebViewMain.Source = ([uri]'https://www.google.com')
    }
    #endregion
    [void]  Navigate( [string]$action ){
        $script = ''
        switch( $action ){
            'scrollup' {    $script = "window.scrollBy(0, -200);"; break }
            'scrolldown' {  $script = "window.scrollBy(0,  200);"; break }
            'scrolltop' {   $script = "window.scrollBy(0, 0);"; break }
            'scrollend' {   $script = "window.scrollTo(0, document.body.scrollHeight);"; break }
        }
        $this.WebViewMain.ExecuteScriptAsync( $script )
    }


}
class TTPanelKeyword : TTPanelWebView {
    #region 説明
    # ■ EditorKeyword：Finder   Editor部のキーワードまたはActorタグ間を移動
    # キーワードを編集：    Editor部のハイライトへ反映
    # Actorタグモード：     [Actor][Data][Path]等から正規表現へ解釈し、Editor部のハイライトへ反映
    # ■ TableKeyword：Filter：
    # ■ WebViewKeyword：Focusser
    #endregion
    #region FindK/PositionK/MoveK/SelectK/EditK  # 250908 ツールに応じて $edit を変更するロジック
    [hashtable]     FindK( [string]$action, [int]$pos, [string]$re ) {
        # @{ Start, End }
        $regex = [Regex]::New( $re, [RegexOptions]::Multiline )
        return $this.FindK( $action, $pos, $regex )
    }
    [hashtable]     FindK( [string]$action, [int]$pos, [Regex]$regex ) {
        # @{ Start, End }
        $kwedit = $this.CurrentTool
        return $this._find( $kwedit, $action, $pos, $regex )
    }
    [int]           PositionK( [int]$offset, [string]$action ) {
        #region variant
        $kwedit = $this.CurrentTool
        $doc = $kwedit.Document
        $area = $kwedit.TextArea
        $curlin = $doc.GetLineByOffset( $offset )
        $pretext = $kwedit.Text.Substring( 0, $offset )
        $posttext = $kwedit.Text.Substring( $offset + 1 )
        $curloc = $doc.GetLocation( $offset )
        #endregion
        try {
            switch ( $action ) {
                'right' { if ( $offset -lt $doc.TextLength - 1 ) { return $offset + 1 } }
                'left' { if ( 0 -lt $offset ) { return $offset - 1 } }
                'down' { if ( $curloc.Line -lt $doc.LineCount ) { return $doc.GetOffset( $curloc.Line + 1, $curloc.Column ) } }
                'up' { if ( 0 -lt $curlin.LineNumber ) { return $doc.GetOffset( $curloc.Line - 1, $curloc.Column ) } }
                'linestart' { return $curlin.Offset }
                'lineend' { return $curlin.EndOffset }

                'nextword' { return $this.FindK( 'next', $offset, $this._wordregex ).Start }
                'prevword' { return $this.FindK( 'prev', $offset, $this._wordregex ).Start }
                'curword' { return $this.FindK( 'cur', $offset, $this._wordregex ).Start }
                'curwordend' { return $this.FindK( 'cur', $offset, $this._wordregex ).End }

                'nextdate' { return $this.FindK( 'next', $offset, $this._actors.where{ $_.Key = 'PanDate' }[0].Regex ).Start }
                'prevdate' { return $this.FindK( 'prev', $offset, $this._actors.where{ $_.Key = 'PanDate' }[0].Regex ).Start }
                'curdate' { return $this.FindK( 'cur', $offset, $this._actors.where{ $_.Key = 'PanDate' }[0].Regex ).Start }
                'curdateend' { return $this.FindK( 'cur', $offset, $this._actors.where{ $_.Key = 'PanDate' }[0].Regex ).End }
                default {
                    # 正規表現/テキスト at*, next*, prev*, first*, last*
                    switch -regex ( $action ) {
                        'atre:(?<re>.+)' { return $this.FindK( 'at', $Matches.re ).Start }
                        'nextre:(?<re>.+)' { return $this.FindK( 'next', $Matches.re ).Start }
                        'prevre:(?<re>.+)' { return $this.FindK( 'prev', $Matches.re ).Start }
                        'firstre:(?<re>.+)' { return $this.FindK( 'first', $Matches.re ).Start }
                        'lastre:(?<re>.+)' { return $this.FindK( 'last', $Matches.re ).Start }
                        'attext:(?<txt>.+)' { return $this.FindK( 'at', [Regex]::Escape($Matches.txt) ).Start }
                        'nexttext:(?<txt>.+)' { return $this.FindK( 'next', [Regex]::Escape($Matches.txt) ).Start }
                        'prevtext:(?<txt>.+)' { return $this.FindK( 'prev', [Regex]::Escape($Matches.txt) ).Start }
                        'firsttext:(?<txt>.+)' { return $this.FindK( 'first', [Regex]::Escape($Matches.txt) ).Start }
                        'lasttext:(?<txt>.+)' { return $this.FindK( 'last', [Regex]::Escape($Matches.txt) ).Start }
                    }
                }
            }
        }
        catch {}
        return $offset
    }
    [TTPanelEditor] MoveK( [string]$action ) {
        $kwedit = $this.CurrentTool
        $area = $kwedit.TextArea
        try {
            switch ( $action ) {
                'right' { [EditingCommands]::MoveRightByCharacter.Execute($null, $area); break }
                'left' { [EditingCommands]::MoveLeftByCharacter.Execute($null, $area); break }
                'up' { [EditingCommands]::MoveUpByLine.Execute($null, $area); break }
                'down' { [EditingCommands]::MoveDownByLine.Execute($null, $area); break }
                'linestart' { [EditingCommands]::MoveToLineStart.Execute($null, $area); break }
                'lineend' { [EditingCommands]::MoveToLineEnd.Execute($null, $area); break }
                'docstart' { [EditingCommands]::MoveToDocumentStart.Execute($null, $area); break }
                'docend' { [EditingCommands]::MoveToDocumentEnd.Execute($null, $area); break }
                default {
                    $kwedit.CaretOffset = $this.PositionK( $kwedit.CaretOffset, $action )
                }
            }
            $area.Caret.BringCaretToView()
        }
        catch {}
        return $this
    }
    [TTPanelEditor] SelectK( [string]$action ) {
        #region variant
        $kwedit = $this.CurrentTool
        $area = $kwedit.TextArea
        $curlin = $kwedit.Document.GetLineByOffset( $kwedit.CaretOffset )
        $curpos = $kwedit.CaretOffset
        #endregion
        try {
            switch ( $action ) {
                'right' { [EditingCommands]::SelectRightByCharacter.Execute($null, $area); break }
                'left' { [EditingCommands]::SelectLeftByCharacter.Execute($null, $area); break }
                'up' { [EditingCommands]::SelectUpByLine.Execute($null, $area); break }
                'down' { [EditingCommands]::SelectDownByLine.Execute($null, $area); break }
                'linestart' { [EditingCommands]::SelectToLineStart.Execute($null, $area); break }
                'lineend' { [EditingCommands]::SelectToLineEnd.Execute($null, $area); break }

                'all' { [ApplicationCommands]::SelectAll.Execute($null, $area); break }
                'curline' {
                    $kwedit.SelectionStart = $curlin.Offset
                    $kwedit.SelectionLength = $curlin.Length
                    break
                }
                'curword' {
                    $range = $this.FindM( 'cur', $curpos, $this._wordregex )
                    $kwedit.SelectionStart = $range.Start
                    $kwedit.SelectionLength = $range.End - $range.Start
                    break
                }
                'curkeyword' {
                    $range = $this.FindM( 'cur', $curpos, $this._editorkwregex )
                    $kwedit.SelectionStart = $range.Start
                    $kwedit.SelectionLength = $range.End - $range.Start
                    break
                }
                'curactor' {
                    $startpos = $this.PositionM( 'curactor', $kwedit.CaretOffset )
                    $endpos = $this.PositionM( 'curactorend', $kwedit.CaretOffset )
                    $kwedit.SelectionStart = $startpos
                    $kwedit.SelectionLength = $endpos - $startpos + 1
                    break
                }
                'curdate' {
                    $startpos = $this.PositionM( 'curdate', $kwedit.CaretOffset )
                    $endpos = $this.PositionM( 'curdateend', $kwedit.CaretOffset )
                    $kwedit.SelectionStart = $startpos
                    $kwedit.SelectionLength = $endpos - $startpos + 1
                    break
                }
                default {
                    $tgtpos = $this.PositionK( $curpos, $action )
                    if ( $curpos -lt $tgtpos ) {
                        $kwedit.SelectionStart = $curpos
                        $kwedit.SelectionLength = $tgtpos - $curpos
                    }
                    else {
                        $kwedit.SelectionStart = $tgtpos
                        $kwedit.SelectionLength = $curpos - $tgtpos
                    }
                }
            }
            $area.Caret.BringCaretToView()
        }
        catch {}
        return $this
    }
    [void]          EditK( [string]$action ) {
        #region variant
        $kwedit = $this.CurrentTool
        $doc = $kwedit.Document
        $area = $kwedit.TextArea
        $curlin = $doc.GetLineByOffset( $kwedit.CaretOffset )
        $caret = $area.Caret
        #endregion
        try {
            switch ( $action ) {
                'delete' { [EditingCommands]::Delete.Execute( $null, $area ); break }
                'backspace' { [EditingCommands]::Backspace.Execute( $null, $area ); break }
                'deletenextword' { [EditingCommands]::DeleteNextWord.Execute( $null, $area ); break }
                'deleteprevword' { [EditingCommands]::DeletePreviousWord.Execute( $null, $area ); break }
                'deletelineend' { $this.SelectM('lineend').EditM('delete'); break }
                'linestart' { $this.SelectM('linestart').EditM('delete'); break }
                'line' { $this.SelectM('curline').EditM('delete'); break }
                'paste' { $kwedit.Paste() }
                'copy' { $kwedit.Copy() }
                'cut' { $kwedit.Cut() }
                'redo' { $kwedit.Redo() }
                'undo' { $kwedit.Undo() }
            }
        }
        catch {}
    }
    #endregion
    #region variable, New, Setup()
    hidden [Regex[]]    $_editorkwregexs    # 全keywordに対応した正規表現の配列
    hidden [Regex]      $_editorkwregex     # 上記正規表現を一つにまとめたもの

    TTPanelKeyword( $name, $parent ) : Base( $name, $parent ) {
    }
    [void] Setup() {
        ([TTPanelWebView]$this).Setup()
    }
    #endregion
    #region UpdateKeywordRegex
    [void]          UpdateKeywordRegex() {
        $regexs = @()
        $this.GetKeyword('Editor').split(',').Trim().where{ '' -ne $_ }.foreach{
            switch -regex ($_) {
                're:(?<re>.*)' {
                    $regexs += $Matches.re
                }
                default {
                    $ret = [regex]::Escape($_).replace('\ ', ' ')
                    $ret = $ret -replace '[ 　\t]+', '|'
                    $regexs += $ret
                }
            }
        }
        $this._editorkwregexs = @( $regexs.foreach{ [regex]::New($_) } )
        $this._editorkwregex = [regex]::New( '({0})' -f ($regexs -join '|') )
        #::: Keyword_TextChanged, KeywordCaret_PositionChanged
    }
    #endregion
    #region KeywordVisible/ Keyword
    [void]      SetKeywordVisible( $vis ) {
        #::: (true|false|toggle)
        return
        switch ( [string]$vis ) {
            'true' {
                $this.EditorKeyword.Visibility = [Visibility]::Visible
                $this.TableKeyword.Visibility = [Visibility]::Visible
                $this.WebViewKeyword.Visibility = [Visibility]::Visible
            }
            'false' {
                $this.EditorKeyword.Visibility = [Visibility]::Collapsed 
                $this.TableKeyword.Visibility = [Visibility]::Collapsed 
                $this.WebViewKeyword.Visibility = [Visibility]::Collapsed 
            }
            default {
                $this.SetKeywordVisible( -not $this.GetKeywordVisible() )
            }
        }
    }
    [bool]      GetKeywordVisible() {
        return( $this.EditorKeyword.Visibility -eq [Visibility]::Visible )
    }
    [void]      SetKeyword( $mode, $keyword ) {
        $kweditor = $mode + 'Keyword'
        $edit = $this.$kweditor
        $doc = $edit.Document
        $num = $edit.TextArea.Caret.Line
        $lin = @($doc.Lines)[$num - 1]
        $doc.Replace( $lin.Offset, $lin.Length, $keyword )
    }
    [string]    GetKeyword( $mode ) {
        $kweditor = $mode + 'Keyword'
        $edit = $this.$kweditor
        $doc = $edit.Document
        $num = $edit.TextArea.Caret.Line
        $lin = @($doc.Lines)[$num - 1]
        return $doc.GetText( $lin.Offset, $lin.Length )
    }
    [void]      SetKeyword( $keyword ) {
        $this.SetKeyword( $this.GetMode(), $keyword )
    }
    [string]    GetKeyword() {
        return $this.GetKeyword( $this.GetMode() )
    }
    [void]      CenterKeywordCaret() {

        $edit = $this.EditorKeyword
        $currentLine = $edit.Document.GetLineByOffset( $edit.CaretOffset )
        $cLtopvp = [TextViewPosition]::New( $edit.Document.GetLocation( $currentLine.Offset ))
        $cLbtmvp = [TextViewPosition]::New( $edit.Document.GetLocation( $currentLine.Offset + $currentLine.Length ) )

        $textView = $edit.TextArea.TextView
        $cLtopPnt = $textView.GetVisualPosition( $cLtopvp, [VisualYPosition]::LineTop )
        $cLbtmPnt = $textView.GetVisualPosition( $cLbtmvp, [VisualYPosition]::LineBottom)

        $lineTop = $cLtopPnt.Y
        $lineBottom = $cLbtmPnt.Y + $textView.DefaultLineHeight
        
        # $desiredScrollOffset = $lineTop - ($edit.TextArea.ActualHeight / 2) + ($textView.DefaultLineHeight / 2)
        $desiredScrollOffset = $lineTop
        
        $edit.ScrollToVerticalOffset($desiredScrollOffset)


    }
    #endregion
}
class TTPanel : TTPanelKeyword {
    #region variables, New, Setup()
    #::: 参照用定数
    [DockPanel[]]   $ModePanels     #::: (EditorPanel | TablePanel | WebViewPanel )
    [Object[]]      $Tools          #::: (Editor | Table | WebView) x ( Main | Keyword )

    TTPanel( $name, $parent ) : Base( $name, $parent ) {
        $this.ModePanels = @(  $this.EditorPanel, $this.TablePanel, $this.WebViewPanel )
        $this.Tools = @(  $this.EditorMain, $this.TableMain, $this.WebViewMain,
            $this.EditorKeyword, $this.TableKeyword, $this.WebViewKeyword )
    }
    [void] Setup() {
        ([TTPanelWebView]$this).Setup()
    }
    #endregion
    #region ShowMenu
    [void]      ShowMenu( [ScriptBlock]$setupscript ) {
        $this.ShowMenu( $setupscript, $false )
    }
    [void]      ShowMenu( [ScriptBlock]$setupscript, [bool]$panelpos ) {

        #::: メニュー作成
        $menu = $this.Menu
        $menu.Items.Clear()
        $setupscript.Invoke( $menu )

        #::: メニュー非表示の処理
        switch ( $menu.Items.count ) {
            0 { return }    #::: 選択肢０の場合はメニュー表示しない
            1 {
                #::: 選択肢１つの場合は、表示せずにクリックイベント発行して終了
                if ( $menu.Items[0].Items.count -eq 0 ) {
                    $evntargs = [Windows.RoutedEventArgs]::New([Windows.Controls.MenuItem]::ClickEvent)
                    $menu.IText.Select.ToLineEndtems[0].RaiseEvent($evntargs)
                    return
                }
            }
        }

        #::: メニュー表示の処理
        if ( [InputManager]::Current.MostRecentInputDevice -is [MouseDevice] ) {
            #::: マウスアクション時：　マウスカーソルに表示
            $menu.Placement = [System.Windows.Controls.Primitives.PlacementMode]::MousePoint
            $menu.HorizontalOffset = 0
            $menu.VerticalOffset = 0
        }
        elseif ( $panelpos ) {
            #::: パネルコンテキストメニュー時：　パネル左上に表示
            $menu.PlacementTarget = $this.UserControl
            $menu.Placement = [System.Windows.Controls.Primitives.PlacementMode]::RelativePoint
            $menu.HorizontalOffset = 0
            $menu.VerticalOffset = 0
        }
        else {
            # [241006] 現時点でPanel Menuもキャレット位置に表示している
            #::: アクションテキスト時：　キャレット位置に表示
            $edit = $this.EditorMain
            $view = $edit.TextArea.TextView
            $cpos = $edit.TextArea.Caret.Position
            $cvpos = $view.GetVisualPosition( $cpos, [VisualYPosition]::LineBottom ) - $view.ScrollOffset
            $scrnpnt = $edit.PointToScreen([System.Windows.Point]::New($cvpos.X, $cvpos.Y))

            #::: メニュー表示
            $tradev = [PresentationSource]::FromVisual($edit).CompositionTarget.TransformToDevice
            $menu.Placement = [System.Windows.Controls.Primitives.PlacementMode]::RelativePoint
            $menu.HorizontalOffset = $scrnpnt.X / $tradev.M11
            $menu.VerticalOffset = $scrnpnt.Y / $tradev.M22
        }

        #[TTExModMode]::Start('ExMenu')
        $menu.IsOpen = $true

    }
    #endregion
    #region FontSize
    [int] GetFontsize() {
        return $this.EditorMain.FontSize
    }
    [void] SetFontSize( [string]$size ) {
        switch -regex ( $size ) {
            '\d{1,2}' {
                $this.Title.FontSize = [int]$size
                $this.EditorMain.FontSize = [int]$size
                $this.TableMain.FontSize = [int]$size
                # $this.WebViewMain.FontSize =    [int]$size
                $this.EditorKeyword.FontSize = [int]$size
                $this.TableKeyword.FontSize = [int]$size
                $this.WebViewKeyword.FontSize = [int]$size        
            }
            'up' {
                $this.SetFontSize( $this.GetFontsize() + 1 )
            }
            'down' {
                $this.SetFontSize( $this.GetFontsize() - 1 )
            }
        }
    }
    #endregion
    #region UpdatePanelTitle
    [void] UpdatePanelTitle() {
        if ( $this.EditorPanel.IsVisible ) {
            $this.SetTitle(( '| {0} | {1}' -f $this.MemoID, $this.GetUnitAt('first').Value ))
        } 
        elseif ( $this.TablePanel.IsVisible ) {
            $this.SetTitle(( '| {0}({1})' -f $this.TableResource, $this.Count ))
        } 
        elseif ( $this.WebViewPanel.IsVisible ) {
            $this.SetTitle(( '| {0}' -f $this.WebViewMain.Source.ToString() ))
        } 
    }
    #endregion
}
