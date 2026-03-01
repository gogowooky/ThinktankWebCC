

#::: 概要
# WPF/XAMLを使用して、ThinkTankのメインウィンドウを定義します。
#::: 依存関係
# script/Tool.ps1, script/SetupEnvironment.ps1, script/TTPanel.ps1, script/TTModel.ps1, script/Control.ps1
#::: 注意
# 1. このスクリプトはThinkTankのメインウィンドウを定義します。
# 2. WPF/XAMLを使用して、ユーザーインターフェイスを構築します。
# 3. キーテーブルの設定や、パネルの表示・フォーカス管理などを行います。


#::: TTApplicationの課題
# 250317 ExBorderモード：　選択⇒移動、スタイル、PanelとBorderの分離

#region namespace
using namespace System
using namespace System.Windows
using namespace System.Windows.Controls
using namespace System.Windows.Markup
using namespace System.Windows.Input
using namespace System.Windows.Controls.Primitives
using namespace System.Xml
#endregion

class TTApplicationBase {
    #region variant/ New()
    [Window]        $Window
    [Menu]          $Menu
    [TTPanel[]]     $Panels
    [StatusBar]     $StatusBar
    # Add-Memberで以下プロパティを設定: Library, Index, Shelf, Desk, System
    # Add-Memberで以下プロパティを設定: UserSystemGrid, UserGrid, LibraryIndexGrid, ShelfDeskGrid, LibraryGrid, IndexGrid, ShelfGrid, DeskGrid, SystemGrid
    [string[]]      $ModeNames = @( 'Editor', 'Table', 'WebView' )

    TTApplicationBase(){
        $xamlPath =     "$($global:ScriptPath)\TTApplication.xaml"
        $stylePath =    "$($global:ScriptPath)\Style.xaml"
        $xaml =         [Xml]( Get-Content $xamlPath -raw ).Replace( '<ResourceDictionary Source="Style.xaml" />', ( Get-Content $stylePath -raw ) )
        $this.Window =  [XamlReader]::Load(( New-Object System.Xml.XmlNodeReader $xaml ))
        $this.Window | Add-Member TTApplication $this
        $this.Menu = $this.Window.FindName('Menu')
        $this.Menu | Add-Member TTApplication $this
        $this.StatusBar = $this.Window.FindName('StatusBar')
        $this.StatusBar | Add-Member TTApplication $this

        $this.Panels = @()
        @('Library','Index','Shelf','Desk','System').foreach{
            $panel = [TTPanel]::New( $_, $this )
            $panel.Setup()
            $this.Window.FindName($_+'Grid').AddChild( $panel.UserControl )
            $this | Add-Member $_ $panel
            $this.Panels += $panel
        }
        @('UserSystemGrid','UserGrid','LibraryIndexGrid','LibraryGrid','IndexGrid','ShelfDeskGrid','ShelfGrid','DeskGrid','SystemGrid').foreach{
            $this | Add-Member $_ $this.Window.FindName($_)
        }

    }
    #endregion
    [void]      Show(){
        $this.Window.ShowDialog()
     }
    [void]      Close(){
        $this.Window.Close()
     }
}
class TTApplication : TTApplicationBase {
    #region New() Setup()
    TTApplication(){}
    [void]  Setup(){            # thinktank.ps1で呼び出す、キーテーブル設定
        $this.SetupKeyTables()
     }
    #endregion
    #region Screen, Border, Title, StatusBar 
    [int]       ChangeScreen( $param ){
        $screens =  [System.Windows.Forms.Screen]::AllScreens
        $curscrn =  $screens.where{ $_.WorkingArea.Contains( $this.Window.Left, $this.Window.Top) }[0]
        $curno =    $screens.IndexOf($curscrn)

        switch -regex ($param){
            'next' { return $this.ChangeScreen( [string](($curno+1) % $screens.count) ) }
            'prev' { return $this.ChangeScreen( [string](($curno+$screens.count-1) % $screens.count) ) }
            '[0-9]' {
                $targetno = [int]$param % $screens.count
                $this.Window.Left = $screens[$targetno].WorkingArea.X + $this.Window.Left - $curscrn.WorkingArea.X
                $this.Window.Top =  $screens[$targetno].WorkingArea.Y + $this.Window.Top -  $curscrn.WorkingArea.Y
                return $targetno
            }
        }
        return 0
     }
    [int]       GetBorderPosition( $name ){           #::: name: UserSystem, LibraryIndex, ShelfDesk, User
        $a =    -1
        $b =    100
        $grid = $this.Window.FindName($name + 'Grid')

        if( $name -in @('UserSystem', 'LibraryIndex', 'ShelfDesk') ){
            $a = $grid.RowDefinitions[0].ActualHeight
            $b = $grid.RowDefinitions[1].ActualHeight
        }
        elseif( $name -eq 'User' ){
            $a = $grid.ColumnDefinitions[0].ActualWidth
            $b = $grid.ColumnDefinitions[1].ActualWidth
        }
        else{
            Show-Error "TTApplication::GetBorderPosition(name)"
            return -1
        }

        $val = [int]( $a / ( $a + $b ) * 100 )
        if ( $val -le 1 ) {     $val = 0 }
        if ( 99 -le $val ) {    $val = 100 }
        return [string]$val
     }
    [void]      SetBorderPosition( $name, $value ){
        $percent = [int][string]$value
        if ( $value -match "^[+-]\d+$" ) {  $percent += [int]$this.GetBorderPosition( $name ) }
        if ( $percent -lt 0 ) {             $percent = 0 }
        if ( 100 -lt $percent ) {           $percent = 100 }

        $grid = $this.Window.FindName($name + 'Grid')
        if( $name -in @('UserSystem', 'LibraryIndex', 'ShelfDesk') ){
            $grid.RowDefinitions[0].Height = "$percent*"
            $grid.RowDefinitions[1].Height = "$(100-$percent)*"
        }
        elseif( $name -eq 'User' ){
            $grid.ColumnDefinitions[0].Width = "$percent*"
            $grid.ColumnDefinitions[1].Width = "$(100-$percent)*"
        }
        else{
            Show-Error "TTApplication::SetBorderPosition(name,value)"
            throw $this
        }
     }
    [string]    $Title
    [void]      SetTitle( $title ){
        $this.Title =   $title
        $version =      ( Get-TTSTate Application.Product.Version )
        if( [TTExModMode]::Name -ne '' ){
            $this.Window.Title = "$title ($([TTExModMode]::Name)) --- $version" 
        }else{
            $this.Window.Title = "$title --- $version"
        }
     }
    [void]      UpdateTitle(){
        $this.SetTitle( $this.Title )
     }
    [void]      SetStatusBar( [hashtable]$hash ){
        $text = $this.StatusBar.Items[0].Content

        if( '' -eq $text ){ $text = 'KeyTable【】 Key【】 Command【】' }

        $hash.Keys.foreach{ $text = $text -replace "$_【([^】]*)】", "$_【$($hash[$_])】" }

        $this.StatusBar.Items[0].Content = $text
     }

    #endregion
    #region Display             #::: 表示切替
    [void]      Display( [Object]$tool ){
        $pname = $tool.TTPanel.Name         #::: Library,Index,Shelf,Desk,System

        if( $tool.Name -match '(Editor|Table|WebView)(Keyword|Main)' ){
            $mname = $Matches.1             #::: Editor, Table, WebView
            $this.Display( $pname, $mname )
        }
     }
    [void]      Display( [string]$panel, [string]$mode ){
        $this.$panel.ModePanels.foreach{
            $_.Visibility = @( 
                [Visibility]::Collapsed, 
                [Visibility]::Visible
            )[ $_.Name.Contains($mode) ]
        }
     }

    #endregion
    #region Focus               #::: Focusする
    [void]      Focus( [Object]$tool ){
        $this.Display( $tool )
        $tool.Focus()
        if( $tool.Name -eq 'TableMain' ){
            $tool.TTPanel.TableCursor('repos')
        }
    }
    [void]      Focus( [string]$panel, [string]$mode, [string]$tool ){
        $this.Display( $panel, $mode )
        $global:Application.$panel."$mode$tool".Focus()
        if( "$mode$tool" -eq 'TableMain' ){
            $global:Application.$panel.TableCursor('repos')
        }
     }

    [Object]    $FocusedTool                        #::: Focusイベント後
    [void]      PostFocused( [Object]$tool ){       #::: Focusイベント後

        $this.FocusedTool = $tool

        $this.Panels.foreach{
            $_.Title.Content =  $_.Title.Content -replace '^●*(.*)', @('$1', '●$1')[ $_ -eq $tool.TTPanel ]
        }
     }

     #endregion
    #region KeyTable            #::: モード毎のキーテーブル
    [hashtable] $KeyTableTags_EventTags = @{    # KeyTableTag と EventTags[] の対応表
        'Application' =             @( 'App',       'Panel' )
        'ExApp' =                   @( 'ExApp' )
        'ExDate' =                  @( 'ExDate' )
        'ExMenu' =                  @( 'ExMenu' )
        'ExLibrary' =               @( 'ExPanel',   'ExLibrary' )
        'ExIndex' =                 @( 'ExPanel',   'ExIndex' )
        'ExShelf' =                 @( 'ExPanel',   'ExShelf' )
        'ExDesk' =                  @( 'ExPanel',   'ExDesk' )
        'ExSystem' =                @( 'ExPanel',   'ExSystem' )
        'LibraryEditorMain' =       @( 'App',   'Panel',    'Library', 'Editor',    'EditorMode' )
        'LibraryEditorKeyword' =    @( 'App',   'Panel',    'Library', 'Keyword',   'EditorMode',   'EditorKeyword' )
        'LibraryTableMain' =        @( 'App',   'Panel',    'Library',              'TableMode',    'Table' )
        'LibraryTableKeyword' =     @( 'App',   'Panel',    'Library', 'Keyword',   'TableMode',    'TableKeyword' )
        'LibraryWebViewMain' =      @( 'App',   'Panel',    'Library',              'WebViewMode',  'WebView' )
        'LibraryWebViewKeyword' =   @( 'App',   'Panel',    'Library', 'Keyword',   'WebViewMode',  'WebViewKeyword' )
        'IndexEditorMain' =         @( 'App',   'Panel',    'Index',   'Editor',    'EditorMode' )
        'IndexEditorKeyword' =      @( 'App',   'Panel',    'Index',   'Keyword',   'EditorMode',   'EditorKeyword' )
        'IndexTableMain' =          @( 'App',   'Panel',    'Index',                'TableMode',    'Table' )
        'IndexTableKeyword' =       @( 'App',   'Panel',    'Index',   'Keyword',   'TableMode',    'TableKeyword' )
        'IndexWebViewMain' =        @( 'App',   'Panel',    'Index',                'WebViewMode',  'WebView' )
        'IndexWebViewKeyword' =     @( 'App',   'Panel',    'Index',   'Keyword',   'WebViewMode',  'WebViewKeyword' )
        'ShelfEditorMain' =         @( 'App',   'Panel',    'Shelf',   'Editor',    'EditorMode' )
        'ShelfEditorKeyword' =      @( 'App',   'Panel',    'Shelf',   'Keyword',   'EditorMode',   'EditorKeyword' )
        'ShelfTableMain' =          @( 'App',   'Panel',    'Shelf',                'TableMode',    'Table' )
        'ShelfTableKeyword' =       @( 'App',   'Panel',    'Shelf',   'Keyword',   'TableMode',    'TableKeyword' )
        'ShelfWebViewMain' =        @( 'App',   'Panel',    'Shelf',                'WebViewMode',  'WebView' )
        'ShelfWebViewKeyword' =     @( 'App',   'Panel',    'Shelf',   'Keyword',   'WebViewMode',  'WebViewKeyword' )
        'DeskEditorMain' =          @( 'App',   'Panel',    'Desk',    'Editor',    'EditorMode' )
        'DeskEditorKeyword' =       @( 'App',   'Panel',    'Desk',    'Keyword',   'EditorMode',   'EditorKeyword' )
        'DeskTableMain' =           @( 'App',   'Panel',    'Desk',                 'TableMode',    'Table' )
        'DeskTableKeyword' =        @( 'App',   'Panel',    'Desk',    'Keyword',   'TableMode',    'TableKeyword' )
        'DeskWebViewMain' =         @( 'App',   'Panel',    'Desk',                 'WebViewMode',  'WebView' )
        'DeskWebViewKeyword' =      @( 'App',   'Panel',    'Desk',    'Keyword',   'WebViewMode',  'WebViewKeyword' )
        'SystemEditorMain' =        @( 'App',   'Panel',    'System',  'Editor',    'EditorMode' )
        'SystemEditorKeyword' =     @( 'App',   'Panel',    'System',  'Keyword',   'EditorMode',   'EditorKeyword' )
        'SystemTableMain' =         @( 'App',   'Panel',    'System',               'TableMode',    'Table' )
        'SystemTableKeyword' =      @( 'App',   'Panel',    'System',  'Keyword',   'TableMode',    'TableKeyword' )
        'SystemWebViewMain' =       @( 'App',   'Panel',    'System',               'WebViewMode',  'WebView' )
        'SystemWebViewKeyword' =    @( 'App',   'Panel',    'System',  'Keyword',   'WebViewMode',  'WebViewKeyword' )
     }
    [hashtable] $KeyTableTags_Actions           # KeyTableTag と TTAction[] の対応表    SetupKeyTablesで設定
    [hashtable] $CurrentKeyTable                # 使用中KeyTable = [TTAction[]]         SwitchKeyTableで切替

    hidden [string]    $_keytabletag
    [void]      SetupKeyTables(){               # TTEvents と TTActions から KeyTableを作る

        $this.KeyTableTags_Actions = @{}

        $global:Models.Events.GetItems().foreach{
            $tag =          $_.Tag
            $mods =         $_.Mods
            $key =          $_.Key
            $action =       $global:Models.Actions.GetItem($_.Name)
            $intm = [int][System.Windows.Input.ModifierKeys]($mods.Replace('None',''))
            $intk = $( switch -regex ($key){
                'Left\d' {      256 + [int]($key[-1]) - 1 }
                'Middle\d' {    260 + [int]($key[-1]) - 1 }
                'Right\d' {     264 + [int]($key[-1]) - 1 }
                'XButton1\d' {  268 + [int]($key[-1]) - 1 }
                'XButton2\d' {  272 + [int]($key[-1]) - 1 }
                'WheelPlus' {   280 }
                'WheelMinus' {  281 }
                default {      [int][System.Windows.Input.Key]$key } })

            $this.KeyTableTags_EventTags.Keys.foreach{

                $evt_tags =     $this.KeyTableTags_EventTags[$_]    #::: 上のタグ対応表の要素 [string[]]
                # $act_tags =     $this.KeyTableTags_Actions[$_]      #::: [hashtable[hashtable[]]] 

                if( $tag -in $evt_tags ){
                    if( $null -eq $this.KeyTableTags_Actions[$_] ){         $this.KeyTableTags_Actions[$_] =          @{} }
                    if( $null -eq $this.KeyTableTags_Actions[$_][$intm] ){  $this.KeyTableTags_Actions[$_][$intm] =   @{} }
                    
                    $action1 = $this.KeyTableTags_Actions[$_][$intm][$intk]

                    if( $null -eq $action1 -or $evt_tags.IndexOf($tag) -le $evt_tags.IndexOf($action1.Tag) ){
                        $this.KeyTableTags_Actions[$_][$intm][$intk] = $action
                    }
                }
            }
         }
        $this.FocusedTool = $this.Desk.EditorMain
        $this.SwitchKeyTable( 'Application' )

    }
    [void]      SwitchKeyTable( $kt_tag ){      # Focusイベント後、[TTExModMode]::Start/Clear

        if( [TTExModMode]::Name -match '^Ex.+' ){  return }         #::: [TTExModMode]:::Start() 用
        if( $kt_tag -eq 'focusedtool' ){                            #::: [TTExModMode]:::Clear() 用
            $kt_tag = $this.FocusedTool.TTPanel.Name + $this.FocusedTool.Name
        }
        $this.CurrentKeyTable = $this.KeyTableTags_Actions[$kt_tag]
        $this._keytabletag =    $kt_tag

        $this.SetStatusBar( @{ 'KeyTable' = $kt_tag } )
    }

    #endregion
    #region InvokeAction        #::: KeyEvent用のメソッド
    [bool]  InvokeActionOnKey( $evnt ){             #::: Keyイベント対応           $mods:0-7, $key:0-255
        $mods =     $evnt.KeyboardDevice.Modifiers                                  #::: [System.Windows.Input.ModifierKeys]
        $key =      @( $evnt.Key, $evnt.SystemKey )[ $evnt.key -eq [Key]::System ]  #::: [System.Windows.Input.Key]
        $intm =     [int]$mods
        $intk =     [int]$key
        $action =   $null

        if( $this.CurrentKeyTable[$intm] ){
            $action = $this.CurrentKeyTable[$intm][$intk]
        }
        if( $null -eq $action ){
            if( [TTExModMode]::Name -match '^Ex.+' ){
                $mods = $mods -band ( -bnot [TTExModMode]::Mods )
                $intm = [int]$mods
                $action =  $this.CurrentKeyTable[$intm][$intk]
            }
        }

        $this.SetStatusBar( @{ 'Key' = "$mods($intm) + $key($intk)" } )

        if( $null -ne $action ){
            $this.SetStatusBar( @{ 'Command' = $action.ID } )
            return $action.Invoke( @{ UIMods = $mods; UIKey = [string]$key; UIIntKey = $intk } )
        }
        $this.SetStatusBar( @{ 'Command' = '' } )

        return $false
     }
    [bool]  InvokeActionOnMouseButton( $evnt ){     #::: MouseButtonイベント対応   $mods:0-7, $key:256-275
        $mods =     [System.Windows.Input.Keyboard]::Modifiers
        $key =      ('{0}{1}' -f [string]$evnt.ChangedButton, $evnt.ClickCount )                #::: ChangeButton:1-5, ClockCount:1-4
        $intm =     [int]$mods
        $intk =     256 + ([int]$evnt.ChangedButton - 1 ) * 4 + ([int]$evnt.ClickCount - 1 )    #::: ChangeButton:1-5, ClockCount:1-4
        $act =      $( try{ $this.CurrentKeyTable[$intm][$intk] }catch{ $null } )

        $this.SetStatusBar( @{ 'Key' = "$mods($intm) + $key($intk)" } )

        if( $null -ne $act ){
            $this.SetStatusBar( @{ 'Command' = $act.ID } )
            return $act.Invoke( @{ UIMods = $mods; UIKey = [string]$key; UIIntKey = $intk } )
        }
        $this.SetStatusBar( @{ 'Command' = '' } )

        return $false
     }
    [bool]  InvokeActionOnMouseWheel( $evnt ){      #::: MouseWheelイベント対応    $mods:0-7, $key:280-281

        $mods =     [System.Windows.Input.Keyboard]::Modifiers
        $key =      @( 'WheelMinus', 'WheelPlus')[ 0 -lt $evnt.Delta ]
        $intm =     [int]$mods
        $intk =     280 + 1 * ( 0 -lt $evnt.Delta )
        $act =      $( try{ $this.CurrentKeyTable[$intm][$intk] }catch{ $null } )

        $this.SetStatusBar( @{ 'Key' = "$mods($intm) + $key($intk)" } )

        if( $null -ne $act ){
            $this.SetStatusBar( @{ 'Command' = $act.ID } )
            return $act.Invoke( @{ UIMods = $mods; UIKey = [string]$key; UIIntKey = $intk } )
        }
        $this.SetStatusBar( @{ 'Command' = '' } )

        return $false
     }

    #endregion
}




