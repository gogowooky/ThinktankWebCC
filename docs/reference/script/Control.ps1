

#region namespace
using namespace System.Windows.Controls
using namespace System.IO
using namespace System.Text
using namespace System.Windows
using namespace System.Windows.Data
using namespace System.Xml
using namespace System.Windows.Input
using namespace System.Windows.Documents
using namespace ICSharpCode.avalonEdit
using namespace ICSharpCode.AvalonEdit.Editing
using namespace ICSharpCode.AvalonEdit.Highlighting
using namespace ICSharpCode.AvalonEdit.Document
using namespace ICSharpCode.AvalonEdit.Folding
using namespace ICSharpCode.AvalonEdit.Rendering
using namespace System.Reflection
#endregion

class TTControllerBase {
    TTControllerBase(){}
    [void] EventSetup(){ 
        $events = ( $this | Get-Member -Static -MemberType Property )
        $events.foreach{

            $class_name =   $_.TypeName
            $script_id =    $_.Name
            $control_name,$event_name = $script_id.split('_')   #::: $control_name, $event_name

            switch -regex ($control_name){
                '^Window$' {
                    $global:Application.Window."Add_$event_name"( (Invoke-Expression "[$class_name]::$script_id") )
                }
                '^Menu$' {
                    $global:Application.Menu."Add_$event_name"( (Invoke-Expression "[$class_name]::$script_id") )
                    $global:Application.Panels.foreach{
                        $_.Menu."Add_$event_name"( (Invoke-Expression "[$class_name]::$script_id") )
                    }
                }
                '^(UserControl|Title|.+Main|.+Keyword)$' {
                    $global:Application.Panels.foreach{
                        $_.$control_name."Add_$event_name"( (Invoke-Expression "[$class_name]::$script_id") )
                    }
                }
                '(?<t>EditorMain|.+Keyword)TextArea' {
                    $tool = $Matches.t
                    $global:Application.Panels.foreach{
                        $_.$tool.TextArea."Add_$event_name"( (Invoke-Expression "[$class_name]::$script_id") )
                    }
                }
                '(?<t>EditorMain|.+Keyword)(?<s>TextView|Caret)' {
                    $tool = $Matches.t
                    $sub =  $Matches.s
                    $global:Application.Panels.foreach{
                        $_.$tool.TextArea.$sub."Add_$event_name"( (Invoke-Expression "[$class_name]::$script_id") )
                    }
                }
                '(?<m>.+Panel)' {
                    $mode = $Matches.m
                    $global:Application.Panels.foreach{
                        $_.$mode."Add_$event_name"( (Invoke-Expression "[$class_name]::$script_id") )
                    }
                }
                '(TTCollection)' {
                    [TTCollection]::$event_name = (Invoke-Expression "[$class_name]::$script_id")
                }
                '(TTPanelEditor)' {
                    [TTPanel]::$event_name = (Invoke-Expression "[$class_name]::$script_id")
                }
            }
        }
     }
 }
class TTController : TTControllerBase {
    #region variants, Setup(), Quit(), ClearMenu(menu), BuildMenu(target,menu,tag), SaveMemo(panel), SaveEditing(panel), LoadMemo(panel,memoid)
    hidden [hashtable] $_menus
    TTController(){}
    [void] Setup(){

        ([TTControllerBase]$this).EventSetup()     #::: Staticな[ScriptBlok]を $global:Application 以下のイベントとして 設定する

        $this._menus = @{}
        . "$global:ScriptPath/ControlMenus.ps1"
     }
    [void] Quit(){
        $global:Application.Close()
     }
    [void] ClearMenu( $menu ){
        $menu.Items.Clear()
     }
    [void] BuildMenu( $target, $menu, $tag ){
        $global:Controller._menus[$target].foreach{
            $node = $menu
            foreach( $header in $_.Headers ){   #::: Create Menu Headers
                $item = $( try{ $node.Items.where{ $_.Header -eq $header }[0] }catch{ $null } )
                if( $null -eq $item ){
                    $item =         [MenuItem]::New()
                    $item.Header =  $header
                    $node.Items.Add( $item )
                }
                $node = $item
            }
            $name = $global:Models.Actions.GetItem($_.ActionID).Name
            $node.Header = $node.Header -replace '\*', $name

            if( $_.ActionID -like '*SubMenu*' ){
                $tag.Menu = $node
                Invoke-TTAction $_.ActionID $tag
            }
            else{
                $node.Tag = $tag + @{
                    ActionID =  $_.ActionID         #::: ActionID
                }
                $node.Add_Click({
                    Param($itm)
                    Show-ToCheck ("BuildMenu {0,-20}" -f $itm.Tag.ActionID)
                    return( Invoke-TTAction $itm.Tag.ActionID $itm.Tag )                     #::: Invoke Action
                }.GetNewClosure())
            }
        }
     }
    [void] SaveMemo( $panel ){

        $editor =               $panel.EditorMain
        $editor.IsModified =    $false

        $memo =             [TTMemo]::New()
        $memo.ID =          $panel.MemoID
        $memo.Name =        $panel.GetUnitAt('first').Value
        $memo.UpdateDate =  ( Get-TTID now )
        $memo.Keywords =    [System.Web.HttpUtility]::UrlEncode( $panel.GetKeyword() )
        $memo.WriteFile( $editor.Text )

        $global:Models.Memos.AddItem( $memo )
        $global:Models.Memos.WriteItemsDelayed()

     }
    [void] SaveEditing( $panel ){

        $editor =           $panel.EditorMain

        $edit =             [TTEditing]::New()
        $edit.ID =          $panel.MemoID
        $edit.Name =        $panel.GetUnitAt('first').Value
        $edit.UpdateDate = ( Get-TTID init )
        $edit.CaretPos =    $editor.CaretOffset
        $edit.WordWrap =    $editor.WordWrap
        $edit.Foldings =    @( 
            $panel.FoldManager.AllFoldings.where{ $_.IsFolded }.foreach{ $_.StartOffset }
        ) -join ','
        $global:Models.Editings.AddItem( $edit )
        $global:Models.Editings.WriteItemsDelayed()
 
     }
    [void] LoadMemo( $panel, $memoid ) {

        $editor =           $panel.EditorMain
        $panel.MemoID =     $memoid

        $memo =         $global:Models.Memos.GetItem( $memoid )
        $doc =          [TTPanelEditor]::_documents[$memoid]
        if ( $null -eq $doc ) {
            $doc =              [TextDocument]::new()
            [TTPanelEditor]::_documents[$memoid] = $doc
            $editor.TTPanel.JustAfterLoaded =    $true
            $editor.Document =  $doc
            $editor.Document.FileName =     $memo.GetFullPath()
            $editor.TTPanel.JustAfterLoaded =    $true
            $editor.Text = ( $memo.ReadFile() -join "`r`n" -replace '\r\n', "`r`n" )    #::: CRLFに変換

        }
        else {
            $editor.Document = $doc
        }

        $editor.Options.HighlightCurrentLine =  $true
        $editor.Options.EnableHyperlinks =      $false
        $editor.Options.EnableEmailHyperlinks = $false
        $editor.Options.ShowTabs =              $true
        $editor.Options.IndentationSize =       4
        $editor.AllowDrop =                     $true
        $editor.IsModified = $false

        if ( $null -ne $panel.FoldManager ) {
            [ICSharpCode.AvalonEdit.Folding.FoldingManager]::Uninstall( $panel.FoldManager )
        }
        $panel.FoldManager = [ICSharpCode.AvalonEdit.Folding.FoldingManager]::Install( $editor.TextArea )
        $panel.FoldStrategy = [Thinktank.ThinktankFoldingStrategy]::new()
        $panel.FoldStrategy.UpdateFoldings( $panel.FoldManager, $editor.Document )

        $panel.UpdateHighlightRule()

        $edit = $global:Models.Editings.GetItem( $memoid )
        if( $null -eq $edit ){ return }
        $editor.CaretOffset =   $edit.CaretPos
        $editor.WordWrap =      $edit.WordWrap
        $foldings =             $edit.Foldings.split(',').foreach{[int]$_}
        $panel.FoldManager.AllFoldings.where{ $_.StartOffset -in $foldings }.foreach{ $_.IsFolded = $true }

     }
    #endregion

    #region key action events
    static $Window_PreviewKeyDown = {
        Param( $win, $e )
        $e.Handled = $false

        if( [int]$e.Key -in 116..121 -or [int]$e.SystemKey -in 116..121 ){ return }     #::: KeyとしてのModKeyを無視
        $e.Handled = $global:Application.InvokeActionOnKey($e)
        [TTExModMode]::CheckToClear( $win, $e )

     }
    static $Window_KeyUp = {
        Param( $win, $e )
        $e.Handled =    $false
        [TTExModMode]::CheckToExit( $win, $e )
     }
    static $Window_Deactivated = {
        [TTExModMode]::ExitMode()
     }
    #endregion
    #region mouse action events
    static $Title_PreviewMouseDown = {
        Param( $ttl, $evnt )
        $evnt.Handled = $global:Application.InvokeActionOnMouseButton($evnt)
        [TTExModMode]::ExitMode()
     }
    static $EditorKeyword_PreviewMouseDown = {
        Param( $kwd, $evnt )
        $evnt.Handled = $global:Application.InvokeActionOnMouseButton($evnt)
     }
    static $TableKeyword_PreviewMouseDown = {
        Param( $kwd, $evnt )
        $evnt.Handled = $global:Application.InvokeActionOnMouseButton($evnt)
     }
    static $WebViewKeyword_PreviewMouseDown = {
        Param( $kwd, $evnt )
        $evnt.Handled = $global:Application.InvokeActionOnMouseButton($evnt)
     }
    static $EditorMain_PreviewMouseDown = {
        Param( $edt, $evnt )
        $evnt.Handled = $global:Application.InvokeActionOnMouseButton($evnt)
     }
    static $TableMain_PreviewMouseDown = {
        Param( $tbl, $evnt )
        $evnt.Handled = $global:Application.InvokeActionOnMouseButton($evnt)
     }
    static $UserControl_PreviewMouseWheel = {
        Param( $edt, $evnt )    #::: MouseWheelEventArgs
        $evnt.Handled = $global:Application.InvokeActionOnMouseWheel($evnt)
     }
    static $EditorMain_PreviewDragOver = {
        #::: dragoverに合わせてキャレット移動 
        Param( $editor, $dragevent )

        $x = $dragevent.GetPosition($editor).X
        $y = $dragevent.GetPosition($editor).Y

        $txtpnt = $editor.GetPositionFromPoint([Point]::New( $x, $y ))
        $pntpos = $editor.Document.GetOffset( $txtpnt.line, $txtpnt.column )
        $editor.CaretOffset = $pntpos

        $dragevent.Handled = $true
     }
    static $EditorMain_PreviewDrop = {
        #::: file drag'n drop後の処理
        Param( $editor, $dragevent )

        $files = $dragevent.Data.GetFileDropList()  #::: ファイル、フォルダ
        $text = $dragevent.Data.GetTextAt()         #::: url、mail、schedule

        if ( 0 -lt $files.count ) {
            # $global:View.Works.Editor.PasteFileList( $files, $editor, '' )
            write-host $files
            $dragevent.Handled = $true
            
        }

        elseif ( $null -ne $text ) {
            # $global:View.Works.Editor._paste_url_text( '', $editor, $text, 'menu' )
            write-host $text
            $dragevent.Handled = $true
        }

        [TTExModMode]::ExitMode()

     }
    #endregion
    #region menu
    static $Menu_PreviewKeyDown = {            # Menu キー置換
        Param( $menu, $e )
        return # 250215 キー処理,未着手

        if( ( 116 -le [int]$e.Key       -and [int]$e.Key -le 121 ) -or                  #::: KeyとしてのModKeyを無視
        ( 116 -le [int]$e.SystemKey -and [int]$e.SystemKey -le 121 ) ){ return }    

        $e.Handled =    $false
        $evnt =         $e
        
        $key = $global:Application.InvokeActionOnKey($e)    #::: ExMenu用のAction(ExMenu.*.*)は [System.Windows.Input.Key]型 を返す
        $e.Handled = $true
        if( $key -isnot [System.Windows.Input.Key] ){
            # sibling itemの shortcutを押した場合
            $e.Handled =    $true
            return
        }
        else{
            $evnt = [KeyEventArgs]::New( $e.KeyboardDevice, $e.InputSource, $e.Timestamp, $key )
            $evnt.RoutedEvent = [Keyboard]::KeyDownEvent
            [InputManager]::Current.ProcessInput($evnt)
    
        }
        return
     }
    #endregion
    #region contextmenu action events
    static $UserControl_ContextMenuOpening = {      # UserControl       #::: ContentMenu設定
        Param( $uctl, $e )
        $e.Handled = $true
        Invoke-TTAction Panel.Open.ContextMenu -Tag @{}
     }
    static $Title_ContextMenuOpening = {            # Title             #::: ContentMenu禁止しない
        Param( $kwd, $e )
        # $e.Handled = $true
     }
    static $EditorKeyword_ContextMenuOpening = {    # EditorKeyword     #::: ContentMenu禁止
        Param( $kwd, $e )
        $e.Handled = $true
     }
    static $TableKeyword_ContextMenuOpening = {     # TableKeyword      #::: ContentMenu禁止
        Param( $kwd, $e )
        $e.Handled = $true
     }
    static $WebViewKeyword_ContextMenuOpening = {   # WebViewKeyword    #::: ContentMenu禁止
        Param( $kwd, $e )
        $e.Handled = $true
     }
    static $EditorMain_ContextMenuOpening = {       # Editor            #::: ContentMenu禁止
        Param( $edt, $e )
        $e.Handled = $true
     }
    static $TableMain_ContextMenuOpening = {        # Table             #::: ContentMenu禁止
        Param( $tbl, $e )
        $e.Handled = $true
     }
    static $WebViewMain_ContextMenuOpening = {      # WebView           #::: ContentMenu禁止
        Param( $tbl, $e )
        $e.Handled = $true
     }
    #endregion
    #region setup events
    static $Window_ContentRendered = { 
        Param( $win, $evnt )
        Start-TTLapTime 'rendered'

        # 1. Status（Setup済(Default-Cache-User)）を_stored_value に記録
        $global:Models.Status.GetItems().foreach{ $_._stored_value = $_.Value }

        # 2. UIメニューの構築
        $menu = $global:Application.Menu
        $global:Controller.ClearMenu( $menu )
        $global:Controller.BuildMenu('Application', $menu, @{})

        # 3. Memosコレクションの更新
        $global:Models.Memos.UpdateItems()

        # 4. Panelの初期セットアップ
        $global:Application.Panels.foreach{ $_.Setup() }

        # 5. 保存された状態をUIへ適用
        $status = ( $global:Models.Status.GetItems() | Sort-Object { $_.ID.split('.')[-1] } )
        $status.foreach{
            if( $_._event_initiator ){   $_._event_initiator.Invoke( $_.ID ) }
            Apply-TTState $_.ID 'Stored'
        }
        $global:Application.Panels.foreach{
            $panel = $_
            $pname = $panel.Name
            $mname = ( Get-TTState "$pname.Current.Mode" 'Stored' )
            $tname = ( Get-TTState "$pname.Current.Tool" 'Stored' )
            $global:Application.Display( $panel."$mname$tname" )
        }
        # 5c. 最後に、保存されたフォーカスパネルにフォーカスを当てる

        Apply-TTState 'Application.Focus.Panel' 'Stored'
        Show-TTLapTime 'rendered' 'UI描画と状態適用完了'
    }
    static $Window_Closing = {

        # Debug-TT "inside Window_Closing"

        $global:Models.CloseItems()
    }
    #endregion
    #region status events
    static $EditorMain_TextChanged = {                  #::: Memo, Editing 保存
        Param( $edt, $evnt )

        $panel = $edt.TTPanel
        if( $panel -eq [TTExModMode]::FdPanel() ){ 

            if( $panel.JustAfterLoaded ){
                $panel.JustAfterLoaded = $false
                return
            }

            Register-DelayedRun "$($panel.Name) TextChanged" 3 {
                $global:Controller.SaveMemo( $script:edt.TTPanel )
                $global:Controller.SaveEditing( $script:edt.TTPanel )
            }.GetNewClosure()

            $panel.UpdatePanelTitle() 
        }
     }
    static $EditorMainTextArea_SelectionChanged = {     #::: 位置保存
        Param( $area, $evnt )
     }
    static $TableMain_LoadingRow = {                    #::: 行番号設定
        Param( $tbl, $evnt )

        $RowNumber = $evnt.Row.GetIndex() + 1

        if( $RowNumber -le 9 ){
            $evnt.Row.Header = $RowNumber
        }
        else{
            $evnt.Row.Header = ''
        }
     }
    static $TableMain_Sorting = {
    #     Param( $tbl, $evnt )
    #     $view = [System.Windows.Data.CollectionViewSource]::GetDefaultView( $tbl.ItemsSource )
    #     $dir =      $view.SortDescriptions.Direction
    #     $header =   $view.SortDescriptions.PropertyName
    #     $tbl.TTPanel._header_dir = '{0}|{1}' -f $header, $dir
    #     Debug ('Table_Sorting: {0}:{1}' -f $tbl.TTPanel.Name, $tbl.TTPanel._header_dir)
    }
    static $UserControl_GotFocus = {            Param( $mp, $evnt ); $mp.TTPanel.UpdatePanelTitle()  }
    static $EditorPanel_IsVisibleChanged = {    Param( $mp, $evnt ); $mp.TTPanel.UpdatePanelTitle()  }
    static $TablePanel_IsVisibleChanged = {     Param( $mp, $evnt ); $mp.TTPanel.UpdatePanelTitle()  }
    static $TableKeyword_TextChanged = {        Param( $mp, $evnt ); $mp.TTPanel.UpdatePanelTitle()  }
    static $WebViewPanel_IsVisibleChanged = {   Param( $mp, $evnt ); $mp.TTPanel.UpdatePanelTitle()  }

    static $TTCollection_OnUpdated = {
        Param( $ttcol )
        try{
            $global:Application.Panels.foreach{
                if( $_.GetMode() -eq 'Table' -and $_.TableResource -eq $ttcol.Name){ 
                    $panel = $_
                    Register-DelayedRun ('{0}:{1} Updated' -f $panel.Name, $panel.TableResource ) 5 {
                        $script:panel.ResetTableResource()
                    }.GetNewClosure()
                }
            }
        }
        catch{ Show-Error "TTCollection_OnUpdated"}
    }
    #endregion
 }
function Add-TTControlMenu( $Target, $Labels, $ActionID, $PCName ){

    $menus = $global:Controller._menus

    if ( $PCName -in @( $null, $Env:Computername, '*' ) ) {
        
        if( !$menus.ContainsKey($Target) ){
            $menus[$Target] = @()
        }

        $menus[$Target] += @{
            Headers =   $Labels.Split('>').Trim()
            ActionID =  $ActionID
        }
    }

 }



