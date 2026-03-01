




#region Application.Product.*
New-TTState     Application.Product.Name            'アプリ名'                      'Thinktank'
New-TTState     Application.Product.Author          '制作者'                        'Shinichiro Egashira'
New-TTState     Application.Product.Mail            '連絡先'                        'gogowooky@gmail.com'
New-TTState     Application.Product.Site            '開発サイト'                    'https://github.com/gogowooky'
New-TTState     Application.Product.Version         'バージョン'                    @{
    Default = {
        $branch =       ''
        $message =      ''
        $timestamp =    ''
        ( Get-Content -Path "$global:ScriptPath\branch_info.txt" ).split("`n").foreach{
            switch -regex ($_){
                'BranchName:([^:]+):' {        $branch = $matches[1] }
                'CommitMessage:([^:]+):' {     $message = $matches[1] }
                'CommitTimestamp:([^:]+)T(\d\d\:\d\d\:\d\d)' {    $timestamp = [DateTime]($matches[1]+' '+$matches[2]) }
            }
        }
        "ver.$($timestamp.tostring('yyyy-MM-dd-HHmmss')) (comm.$branch)"
     }
    Apply = {}
 }
#endregion
#region Application.System.*
New-TTState     Application.System.RootPath         'ルートディレクトリ'            $global:RootPath
New-TTState     Application.System.ScriptPath       'スクリプトディレクトリ'        $global:ScriptPath
New-TTState     Application.System.PCName           'PC名'                          $Env:Computername
New-TTState     Application.System.UserName         'User名'                        $([System.Environment]::UserName)
New-TTState     Application.System.MemoPath         'メモディレクトリ'                  @{
    Default = { "$global:RootPath\..\Memo" }
    Apply = {   
        Param($id,$val)
        if( -not ( Test-Path $val )){
            New-Item $val -ItemType Directory -ErrorAction SilentlyContinue
        }
        $global:MemoPath = $val
        $global:Models.Status.SetValue( $id, $val )
     }
 }
New-TTState     Application.System.CachePath        'キャッシュディレクトリ'            @{
    Default = {     "$global:RootPath\..\Memo\cache" }
    Apply = {   
        Param($id,$val)
        if( -not ( Test-Path $val )){
            New-Item $val -ItemType Directory -ErrorAction SilentlyContinue
        }
        $global:CachePath = $val
        $global:Models.Status.SetValue( $id, $val )
     }
 }
New-TTState     Application.System.BackupPath       'バックアップディレクトリ'          @{
    Default = {     "$global:RootPath\..\Memo\backup" }
    Apply = {
        Param($id,$val)
        if( -not ( Test-Path $val )){
            New-Item $val -ItemType Directory -ErrorAction SilentlyContinue
        }
        $global:BackupPath = $val
        $global:Models.Status.SetValue( $id, $val )
     }
 }
New-TTState     Application.System.PhotoPath        'フォトディレクトリ'                @{
    Default = {     "$global:RootPath\..\Photo" }
    Apply = {     
        Param($id,$val)
        if( -not ( Test-Path $val )){
            New-Item $val -ItemType Directory -ErrorAction SilentlyContinue
        }
        $global:PhotoPath = $val
        $global:Models.Status.SetValue( $id, $val )
      }
 }
New-TTState     Application.System.LinkPath         'リンクディレクトリ'                @{
    Default = {     "$global:RootPath\..\Link" }
    Apply = {
        Param($id,$val)
        if( -not ( Test-Path $val )){
            New-Item $val -ItemType Directory -ErrorAction SilentlyContinue
        }
        $global:LinkPath = $val
        $global:Models.Status.SetValue( $id, $val )
      }
 }
New-TTState     Application.System.OutlookBackupFolder  '引用メールの保存先フォルダ'    @{
    Default = { '' }
    Apply = {     Param($id,$val)
        $global:Models.Status.SetValue( $id, $val )
      }
 }
New-TTState     Application.System.OutlookMainFolder  'メール確認先フォルダ'            @{
    Default = { '' }
    Apply = {     Param($id,$val)
        $global:Models.Status.SetValue( $id, $val )
      }
 }
#endregion  
#region Application.Window.*
New-TTState     Application.Window.Screen           'ウインドウ表示スクリーン'      @{
    Default = {     '0' }
    Test = {        Param($id,$val); $val -match '([0-9]|next|prev)' }
    Apply = {       Param($id,$val)
        $val = $global:Application.ChangeScreen( $val )
        $global:Models.Status.SetValue( $id, $val )
    }
 }
New-TTState     Application.Window.State            'ウインドウ状態'                @{
    Default = {     'Normal' }
    Test = {        Param($id,$val); $val -match '(Minimized|Maximized|Normal)' }
    Apply = {       Param($id,$val); $global:Application.Window.WindowState = $val }
    Watch = {
        $global:Application.Window.Add_StateChanged({
            Param( $win, $evnt )
            $global:Models.Status.SetValue( 'Application.Window.State', [string]$global:Application.Window.WindowState )
        })
      }
 }
New-TTState     Application.Window.Width            'ウインドウ幅'                  @{
    Default = {     '1200' }
    Test = {        Param($id,$val); $val -match '(\d{1,4}|inc|dec)' }
    Apply = {       Param($id,$val)
        switch -regex ($val){
            'inc' { $val = $global:Application.Window.Width + 10 }
            'dec' { $val = $global:Application.Window.Width - 10 }
        }
        $global:Application.Window.Width = [int]$val
    }
    Watch = {
        $global:Application.Window.Add_SizeChanged({
            Param( $win, $evnt )
            $global:Models.Status.SetValue( 'Application.Window.Width', $win.Width )
            $global:Models.Status.SetValue( 'Application.Window.Height', $win.Height )
        })
      }
 }
New-TTState     Application.Window.Height           'ウインドウ高'                  @{
    Default = {     '600' }
    Test = {        Param($id,$val); $val -match '(\d{1,4}|inc|dec)' }
    Apply = {       Param($id,$val)
        switch -regex ($val){
            'inc' { $val = $global:Application.Window.Height + 10 }
            'dec' { $val = $global:Application.Window.Height - 10 }
        }
        $global:Application.Window.Height = [int]$val
    }
    # Watch = {}  #::: Application.Window.Width の Watchと共用 
 }
New-TTState     Application.Window.XPos             'ウインドウ横位置'              @{
    Default = {     '100' }
    Test = {        Param($id,$val); $val -match '(\d{1,4}|right|left)' }
    Apply = {       Param($id,$val)
        switch -regex ($val){
            'right' {   $val = $global:Application.Window.Left + 10 }
            'left' {    $val = $global:Application.Window.Left - 10 }
        }
        $global:Application.Window.Left = $val
     }
    Watch = {
        $global:Application.Window.Add_LocationChanged({
            Param( $win, $evnt )
            $global:Models.Status.SetValue( 'Application.Window.YPos', $win.Top )
            $global:Models.Status.SetValue( 'Application.Window.XPos', $win.Left )
        })
      }
 }
New-TTState     Application.Window.YPos             'ウインドウ縦位置'              @{
    Default = {     '50' }
    Test = {        Param($id,$val); $val -match '(\d{1,4}|down|up)' }
    Apply = {     Param($id,$val)
        switch -regex ($val){
            'down' {    $val = $global:Application.Window.Top + 10 }
            'up' {      $val = $global:Application.Window.Top - 10 }
        }
        $global:Application.Window.Top = $val
      }
    # Watch = {}  #::: Application.Window.Left の Watchと共用 
 }
New-TTState     Application.Window.FontSize         'アプリ全体のフォントサイズ'    @{
    Default = {     12 }
    Test = {        Param($id,$val); $val -match '(\d{1,2}|up|down)' }
    Apply = {       Param($id,$val)
        switch ( $val ){
            'up' {      $val = ( $global:Application.Window.FontSize + 1 ) }
            'down' {    $val = ( $global:Application.Window.FontSize - 1 ) }
        }
        $global:Application.Window.FontSize =   [int]$val
        $global:Application.Menu.FontSize =     [int]$val
        $global:Models.Status.SetValue( 'Application.Window.FontSize', $val )

        @(  
        'Library.Panel.FontSize', 
        'Index.Panel.FontSize', 
        'Shelf.Panel.FontSize', 
        'Desk.Panel.FontSize', 
        'System.Panel.FontSize').foreach{
            Apply-TTState $_ $val
        }

    }
 }
New-TTState     Application.Window.Title            'ウインドウタイトル'            @{
    Default = {     'Thinktank' }
    Apply = {       Param($id,$val)
        $global:Application.SetTitle($val)
        $global:Models.Status.SetValue('Application.Window.Title',$val)
      }
 }
#endregion
#region Application.*
New-TTState     Application.Focus.Panel             'フォーカスパネル'              @{
    Default = {     'Desk' }
    Apply = {   Param( $id, $val )
        if( $val -notmatch '^(Library|Index|Shelf|Desk|System)$' ){ 
            $val = [TTExModMode]::FdPanel().Name
        }

        Register-DelayedRun Application.Focus.Panel 1 {
            $global:Application.$script:val.Focus()
            $curstyle = (Get-TTState Application.Border.Style)
            if( $curstyle -like 'zen*' ){
                Apply-TTState Application.Border.Style "zen:$script:val"
            }
        }.GetNewClosure()
     }
 }

write-host "250909: zen:Systemモードにすると落ちる"

New-TTState     Application.Menu.Visible            'メニュー表示'                  @{
    Default = {     'true' }
    Test = {        Param($id,$val); $val -match '(true|false|toggle)' }
    Apply = {       Param($id,$val)
        switch( [string]$val ){
            'true' {    $global:Application.Menu.Visibility = [Visibility]::Visible }
            'false' {   $global:Application.Menu.Visibility = [Visibility]::Collapsed }
            default {
                $vis = ( $global:Application.Menu.Visibility -eq [Visibility]::Visible )
                $global:Application.Menu.Visibility = @( [Visibility]::Visible, [Visibility]::Collapsed )[ $vis ]
            }
        }
      }
    Watch = {
        $global:Application.Menu.Add_IsVisibleChanged({
            Param($menu,$evnt)
            $global:Models.Status.SetValue('Application.Menu.Visible',$menu.IsVisible)
        })
      }
 }

New-TTState     Application.Current.ExMode          '排他モード'                    @{
    Default = {     '' }
    Test = {        Param($id,$val); $val -match '(Ex.+|)' }
    Apply = {       Param($id,$val)
        switch($val){
            'Panel' { $val = 'Ex{0}' -f [TTExModMode]::FdPanel().Name }
        }
        [TTExModMode]::Start( $val )
    }
    Watch = {
        [TTExModMode]::OnClear = {
            $global:Application.UpdateTitle()
            $global:Models.Status.SetValue( 'Application.Current.ExMode', '' )
        }
        [TTExModMode]::OnStart = {
            $global:Application.UpdateTitle()
            $global:Models.Status.SetValue( 'Application.Current.ExMode', [TTExModMode]::Name )
        }
      }
 }
New-TTState     Application.Border.Style            'パネル分割スタイル'            @{
    Default = {     'Free' }
    Test = {        Param($id,$val); $val -match '(free|all|standard|detail|list|zen|debug)' }
    Apply = {       Param($id,$val)
        $styles = @{
            'free' =        @{}
            'all' =         @{  User =  '20';   LibraryIndex =  '20';    ShelfDesk =  '20';     UserSystem = '80' }
            'standard' =    @{  User =  '15';   LibraryIndex =  '20';    ShelfDesk =  '20';     UserSystem = '100' }
            'detail' =      @{                                           ShelfDesk =  '40';     UserSystem = '100' }
            'list' =        @{  User =  '30';   LibraryIndex =  '0';                            UserSystem = '100' }
            'zen' =         @{  User =   '0';   LibraryIndex =  '20';    ShelfDesk =   '0';     UserSystem = '100' }
            'debug' =       @{  User =   '0';   LibraryIndex =  '20';    ShelfDesk =  '30';     UserSystem = '70' }
            'zenLibrary' =  @{  User = '100';   LibraryIndex = '100';    ShelfDesk =   '0';     UserSystem = '100'}
            'zenIndex' =    @{  User = '100';   LibraryIndex =   '0';    ShelfDesk =   '0';     UserSystem = '100'}
            'zenShelf' =    @{  User =   '0';   LibraryIndex =   '0';    ShelfDesk = '100';     UserSystem = '100'}
            'zenDesk' =     @{  User =   '0';   LibraryIndex =   '0';    ShelfDesk =   '0';     UserSystem = '100'}
            'zenSystem' =   @{  User =   '0';   LibraryIndex =   '0';    ShelfDesk =   '0';     UserSystem =   '0'}
        }
        if( $val -eq 'zen' ){
            $curfocus = (Get-TTState Application.Focus.Panel)
            $val =      "zen$curfocus"
        }
        $styles[$val].Keys.foreach{
            Apply-TTState "Application.Border.$_" $styles[$val].$_
        }
        $global:Models.Status.SetValue( 'Application.Border.Style', $val )
      }
 }
New-TTState     Application.Border.User             'User境界位置'                  @{
    Default = { '20' }
    Test = {    Param($id,$val); $val -match '((\+|\-)?\d{1,2}|100)'}
    Apply = { Param($id,$val); $global:Application.SetBorderPosition('User',$val) }
    Watch = {
        $status =   $global:Models.Status
        $app =      $global:Application
        $app.LibraryIndexGrid.Add_SizeChanged({
            $status.SetValue(   'Application.Border.User',  $app.GetBorderPosition('User') )
        }.GetNewClosure())
        $app.ShelfDeskGrid.Add_SizeChanged({
            $status.SetValue(   'Application.Border.User',  $app.GetBorderPosition('User') )
        }.GetNewClosure())
      }
 }
New-TTState     Application.Border.LibraryIndex     'LibraryIndex境界位置'          @{
    Default = { '20' }
    Test = {    Param($id,$val); $val -match '((\+|\-)?\d{1,2}|100)' }
    Apply = { Param($id,$val); $global:Application.SetBorderPosition('LibraryIndex',$val) }
    Watch = {
        $status =   $global:Models.Status
        $app =      $global:Application
        $app.LibraryGrid.Add_SizeChanged({
            $status.SetValue(   'Application.Border.LibraryIndex',  $app.GetBorderPosition('LibraryIndex') )
        }.GetNewClosure())
        $app.IndexGrid.Add_SizeChanged({
            $status.SetValue(   'Application.Border.LibraryIndex',  $app.GetBorderPosition('LibraryIndex') )
        }.GetNewClosure())
      }
 }
New-TTState     Application.Border.ShelfDesk        'ShelfDesk境界位置'             @{
    Default = { '20' }
    Test = {    Param($id,$val); $val -match '((\+|\-)?\d{1,2}|100)'}
    Apply = { Param($id,$val); $global:Application.SetBorderPosition('ShelfDesk',$val) }
    Watch = {
        $status =   $global:Models.Status
        $app =      $global:Application
        $app.ShelfGrid.Add_SizeChanged({
            $status.SetValue(   'Application.Border.ShelfDesk',  $app.GetBorderPosition('ShelfDesk') )
        }.GetNewClosure())
        $app.DeskGrid.Add_SizeChanged({
            $status.SetValue(   'Application.Border.ShelfDesk',  $app.GetBorderPosition('ShelfDesk') )
        }.GetNewClosure())
      }
 }
New-TTState     Application.Border.UserSystem       'UserSystem境界位置'            @{
    Default = { '80' }
    Test = {    Param($id,$val); $val -match '((\+|\-)?\d{1,2}|100)'}
    Apply = { Param($id,$val); $global:Application.SetBorderPosition('UserSystem',$val) }
    Watch = {
        $status =   $global:Models.Status
        $app =      $global:Application
        $app.UserGrid.Add_SizeChanged({
            $status.SetValue(   'Application.Border.UserSystem',  $app.GetBorderPosition('UserSystem') )
        }.GetNewClosure())
        $app.SystemGrid.Add_SizeChanged({
            $status.SetValue(   'Application.Border.UserSystem',  $app.GetBorderPosition('UserSystem') )
        }.GetNewClosure())
      }
 }
#endregion
#region [Panels].Current.*
New-TTState     [Panels].Current.Mode               '[Panels]のモード'              @{
    Default = { Param($id)
        return @{
            Library = 'Table';  Index = 'Table';    Shelf = 'Table';    Desk = 'Editor';    System = 'Editor'
        }[ $id.split('.')[0] ]
     }
    Test = {    Param($id,$val); $val -match '^(Editor|Table|WebView|next|prev)$' }
    Apply = {   Param($id,$val); 
        $p = $id.split('.')[0]
        $global:Application.$p.SetMode( $val )
    }
    Watch = {   Param($id)
        $pname = $id.split('.')[0]
        $global:Application.$pname.Tools.foreach{
            $_.Add_IsVisibleChanged({   #::: Visibility変更時　Focusではない
                Param($ctrl,$evnt)
                if( $ctrl.IsVisible ){
                    $panel = $ctrl.TTPanel
                    $pname = $panel.Name
                    $mname = $ctrl.Name -replace '(Editor|Table|WebView)(Keyword|Main)','$1'
                    $panel.CurrentTool = $panel."CurrentTool$mname"
                    $global:Models.Status.SetValue( "$pname.Current.Mode", $mname )
                }
            })
        }
     }
 }
$global:tool_gotfocus = {
    Param( $ctrl,$evnt )

    $pname =    $ctrl.TTPanel.Name
    $mname =    $ctrl.Name -replace '(Editor|Table|WebView)(Keyword|Main)','$1'
    $tname =    $ctrl.Name -replace '(Editor|Table|WebView)(Keyword|Main)','$2'

    $global:Application.PostFocused( $ctrl )
    $global:Application.$pname.RestoreCurrentTool( $ctrl )

    $global:Application.SwitchKeyTable( $pname + $ctrl.Name )

    $global:Models.Status.SetValue( 'Application.Focus.Panel', $pname )
    $global:Models.Status.SetValue( "$pname.Current.Mode", $mname )
    $global:Models.Status.SetValue( "$pname.Current.Tool", $tname )

 }
New-TTState     [Panels].Current.Tool               '[Panels]のツール'              @{
    Default = { Param($id)
        return @{
            Library = 'TableKeyword';  Index = 'TableKeyword';    Shelf = 'TableKeyword';    Desk = 'EditorMain';    System = 'EditorKeyword'
        }[ $id.split('.')[0] ]
    }
    Test = {    Param($id,$val); $val -match '^(Editor|Table|WebView)?(Keyword|Main|toggle)$' }
    Apply = {   Param($id,$val);
        $p = $id.split('.')[0]; $global:Application.$p.SetTool( $val ) }
    Watch = {   Param($id)
        $pname = $id.split('.')[0]

        $global:Application.$pname.Tools.foreach{
            $_.Add_PreviewTouchDown($global:tool_gotfocus)
            $_.Add_PreviewMouseDown($global:tool_gotfocus)
            $_.Add_GotFocus($global:tool_gotfocus)
        }
    }
 }
#endregion
#region [Panels].Title.*
New-TTState     [Panels].Title.Visible              '[Panels]タイトル表示'          @{
    Default = { 'true' }
    Test = {    Param($id,$val); $val -match '(true|false|toggle)' }
    Apply = {   Param($id,$val); $p = $id.split('.')[0]; $global:Application.$p.SetTitleVisible( $val ) }
    Watch = {   Param($id)
        $pname = $id.split('.')[0]
        $global:Application.$pname.Title.Add_IsVisibleChanged({
                Param($ttl,$evnt)
                $pname = $ttl.TTPanel.Name
                $global:Models.Status.SetValue( "$pname.Title.Visible", $ttl.IsVisible )
            }
        )
    }
 }
New-TTState     [Panels].Title.Text                 '[Panels]タイトル文字'          @{
    Default = { Param($id); return $id.split('.')[0] }
    Apply = {   Param($id,$val)
        $pname =    $id.split('.')[0]
        $global:Application.$pname.Title.Content = $val
        $global:Models.Status.SetValue( $id, $val )
    }
 }
#endregion
#region [Panels].Editor.*
write-host "250620: [Panels].Editor.Keywordはメモ毎に設定されるものと切り替えて設定されるものがマージされるべき"
New-TTState     [Panels].Editor.Keyword             '[Panels]エディタキーワード'    @{
    Default = { '' }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        $global:Application.$pname.SetKeyword( 'Editor', $val )
     }
    Watch =     {   Param($id)
        $pname = $id.split('.')[0]
        $global:Application.$pname.EditorKeyword.Add_TextChanged({
            Param($kwd,$evnt)
            $pn = $kwd.TTPanel.Name
            $global:Models.Status.SetValue( "$pn.Editor.Keyword", $kwd.TTPanel.GetKeyword('Editor') )
            Register-DelayedRun "$pn.EditorKeyword.TextChanged" 3 {
                $global:Application.$script:pn.UpdateKeywordRegex() # EditorMainの変更時はこちらは不要
                $global:Application.$script:pn.UpdateHighlight()
            }.GetNewClosure()
        })
        $global:Application.$pname.EditorKeyword.TextArea.TextView.Add_ScrollOffsetChanged({
            param($tv, $e)
            $edit =                     $tv.EditorComponent
            $currentVerticalOffset =    $tv.VerticalOffset
            $isCaretAtFirstLine =       $edit.Document.GetLineByOffset( $edit.CaretOffset ).LineNumber -eq 1

            $halfLineHeight = $tv.DefaultLineHeight / 2

            $scrollDifference = [Math]::Abs($currentVerticalOffset - $global:previousVerticalOffset)

            if (    $isCaretAtFirstLine -and
                    $currentVerticalOffset -ne 0 -and
                    $scrollDifference -ge ($halfLineHeight - 0.1) -and
                    $scrollDifference -le ($halfLineHeight + 0.1) ) {
                $edit.ScrollToVerticalOffset(0)
            }

            $global:previousVerticalOffset = $currentVerticalOffset
        })
        $global:Application.$pname.EditorKeyword.TextArea.Caret.Add_PositionChanged({
            Param( $crt, $evnt ) 
            $crt.TTPanel.CenterKeywordCaret()
            $pn =   $crt.TTPanel.Name
            $global:Models.Status.SetValue( "$pn.Editor.Keyword", $crt.TTPanel.GetKeyword('Editor') )
 
            $crt.TTPanel.UpdateKeywordRegex()
            $crt.TTPanel.UpdateHighlight()

            # Register-DelayedRun "$pn.EditorKeyword.TextArea.Caret.PositionChanged" 2 {
            #     $global:Application.$script:pn.UpdateKeywordRegex()
            #     $global:Application.$script:pn.UpdateHighlight()
            # }.GetNewClosure()
        })
     }
 }
New-TTState     [Panels].Editor.Memo                '[Panels]メモID'                @{
    Default = { 'thinktank' }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        $panel = $global:Application.$pname
        if( $val -in @( '', $panel.MemoID ) ){ return }
        $panel.MemoID = $val
        $global:Controller.LoadMemo( $panel, $val )
     }
    Watch = {   Param($id)
        $pname = $id.split('.')[0]
        $global:Application.$pname.EditorMain.Add_DocumentChanged({
            Param($edt,$evnt)
            $pname = $edt.TTPanel.Name
            $global:Models.Status.SetValue( "$pname.Editor.Memo", $edt.TTPanel.MemoID )
        })
     }
 }
New-TTState     [Panels].Editor.Wordwrap            '[Panels]メモWordwrap'          @{
    Default = { 'false' }
    Test = {    Param($id,$val); $val -match '(true|false|toggle)' }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        if( $val -eq 'toggle' ){
            $val = @( 'true', 'false')[ $global:Application.$pname.EditorMain.Wordwrap ]
        }
        $global:Application.$pname.EditorMain.Wordwrap = [bool]$val
     }
 }
#endregion
#region [Panels].Table.*
New-TTState     [Panels].Table.Keyword              '[Panels]テーブルキーワード'    @{
    Default = { Param($id)
        return @{
            Library = ''
            Index = '@7d'
            Shelf = ''
            Desk = ''
            System = ''
        }[ $id.split('.')[0] ]
    }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        $global:Application.$pname.SetKeyword( 'Table', $val )
     }
    Watch = {   Param($id)
        $pname = $id.split('.')[0]
        $global:Application.$pname.TableKeyword.Add_TextChanged({
            Param($kwd,$evnt)
            $pn = $kwd.TTPanel.Name
            $global:Models.Status.SetValue( "$pn.Table.Keyword", $kwd.TTPanel.GetKeyword('Table') )
            Register-DelayedRun "$pn.TableKeyword.TextChanged" 3 {
                $global:Application.$script:pn.UpdateTableFilter()
            }.GetNewClosure()
        })
        $global:Application.$pname.TableKeyword.TextArea.Caret.Add_PositionChanged({
            Param( $crt, $evnt ) 
            $pn =   $crt.TTPanel.Name
            $global:Models.Status.SetValue( "$pn.Table.Keyword", $crt.TTPanel.GetKeyword('Table') )
            Register-DelayedRun "$pn.TableKeyword.TextArea.Caret.PositionChanged" 3 {
                $global:Application.$script:pn.UpdateTableFilter()
            }.GetNewClosure()
        })
     }
 }
New-TTState     [Panels].Table.Resource             '[Panels]リソース名'            @{
    Default = { Param($id)
        return @{
            Library = 'Thinktank';  Index = 'Memos';    Shelf = 'Memos';    Desk = 'Memos';    System = 'Memos'
        }[ $id.split('.')[0] ]
    }
    Apply = {   Param($id,$val); $p = $id.split('.')[0]; $global:Application.$p.SetTableResource( $val ) }
    Watch = {   Param($id)
        $pname = $id.split('.')[0]
        $global:Application.$pname.TableMain.Add_SourceUpdated({
            Param($tbl,$evnt)
            $pname = $tbl.TTPanel.Name
            $global:Models.Status.SetValue( "$pname.Table.Resource", $tbl.TTPanel.TableResource )
        })
    }
 }
New-TTState     [Panels].Table.Sort                 '[Panels]ソート'                @{
    Default = { Param($id)
        return @{
            Library =   'ID|Descending'
            Index =     'UpdateDate|Descending'
            Shelf =     'Name|Ascending'
            Desk =      'ID|Descending'
            System =    'UpdateDate|Descending'
        }[ $id.split('.')[0] ]
    }
    Test = {    Param($id,$val); $val -match '.+\|(Ascending|Descending)' }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        $global:Application.$pname.SetTableSort( $val )
        $global:Models.Status.SetValue( $id, $val )
    }
    Watch = {   Param($id)
        $pname = $id.split('.')[0]
        $global:Application.$pname.TableMain.Add_Sorting({
            Param($tbl,$evnt)
            $pname =    $tbl.TTPanel.Name
            $sort =     [System.Windows.Data.CollectionViewSource]::GetDefaultView( $tbl.ItemsSource ).SortDescriptions[0]
            $sortval =  ('{0}|{1}' -f $sort.PropertyName, $sort.Direction)
            $global:Models.Status.SetValue( "$pname.Table.Sort", $sortval )
        })
    }
 }
#endregion
#region [Panels].WebView.*
New-TTState     [Panels].WebView.Keyword            '[Panels]ウェブビューキーワード'    @{
    Default = { '' }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        $global:Application.$pname.SetKeyword( 'WebView', $val )
     }
    Watch = {   Param($id)
        $pname = $id.split('.')[0]
        $global:Application.$pname.TableKeyword.Add_TextChanged({
            Param($kwd,$evnt)
            $panel =    $kwd.TTPanel
            $pn =       $panel.Name
            $md =       $panel.GetMode()
            $global:Models.Status.SetValue( "$pn.$md.Keyword", $panel.GetKeyword('WebView') )
            # $panel.UpdateMarker('WebView')
        })
        $global:Application.$pname.TableKeyword.TextArea.Caret.Add_PositionChanged({
            Param($kwd,$evnt)
            $panel =    $kwd.TTPanel
            $pn =       $panel.Name
            $md =       $panel.GetMode()
            $global:Models.Status.SetValue( "$pn.$md.Keyword", $panel.GetKeyword('WebView') )
            # $panel.UpdateMarker('WebView')
        })
     }
 }
#endregion
#region [Panels].*
New-TTState     [Panels].Keyword.Visible            '[Panels]キーワード表示'          @{
    Default = { 'true' }
    Test = {    Param($id,$val); $val -match '(true|false)' }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        $global:Application.$pname.SetKeywordVisible( $val )
    }
    Watch = {   Param($id)
        $pname = $id.split('.')[0]
        $global:Application.$pname.EditorKeyword.Add_IsVisibleChanged({
            Param($kwd,$evnt)
            $pname = $kwd.TTPanel.Name
            $global:Models.Status.SetValue( "$pname.Keyword.Visible", $kwd.IsVisible )
        })
     }
 }
New-TTState     [Panels].ColumnHeader.Visible       '[Panels]カラムヘッダー'        @{
    Default = { 'true' }
    Test = {    Param($id,$val); $val -match '(true|false|toggle)' }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        $global:Application.$pname.SetColumnHeaderVisible( $val )
        $newval = $global:Application.$pname.GetColumnHeaderVisible()
        $global:Models.Status.SetValue( $id, $newval )
    }
 }
New-TTState     [Panels].RowHeader.Visible          '[Panels]ロウヘッダー'          @{
    Default = { 'true' }
    Test = {    Param($id,$val); $val -match '(true|false|toggle)' }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        $global:Application.$pname.SetRowHeaderVisible( $val )
        $newval = $global:Application.$pname.GetRowHeaderVisible()
        $global:Models.Status.SetValue( $id, $newval )
      }
 }
New-TTState     [Panels].Panel.FontSize             '[Panels]フォントサイズ'        @{
    Default = { 12 }
    Test = {    Param($id,$val); $val -match '(\d{1,2}|up|down)' }
    Apply = {   Param($id,$val)
        $pname = $id.split('.')[0]
        $global:Application.$pname.SetFontSize( $val )
        $global:Models.Status.SetValue( "$pname.Panel.FontSize", $val )
     }
 }
#endregion







