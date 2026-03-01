












#region namespace
using namespace Microsoft.PowerShell.Commands
using namespace System.Text.RegularExpressions
using namespace System.IO
using namespace System.Windows
using namespace System.Windows.Input
#endregion

#region TTObject / TTCollection
#########################################################################################################################
class TTObject { 
    #region (var) _parent/ _flag/ ID/ Name/ UpdateDate
    hidden [TTObject]   $_parent
    hidden [string]     $_flag
    [string]            $ID
    [string]            $Name
    [string]            $UpdateDate
    #endregion ----------------------------------------------------------------------------------------------------------
    TTObject() {
        $this._parent = $null
        $this._flag = $false
        $this.ID = ($this.GetType().Name -replace '^TT', '')
        $this.Name = ($this.GetType().Name -replace '^TT', '')
        $this.UpdateDate = ( Get-TTID init )
     }
    #region (event)     _updated/ OnUpdated/ NotifyUpdated()
    hidden [bool] $_updated
    static [scriptblock] $OnUpdated = { 
        param( [TTCollection]$col )  #::: $ttcollection型毎
    }
    [void] NotifyUpdated() {
        $this._updated = $true 
        $this.UpdateDate = ( Get-TTID now )
        [TTCollection]::OnUpdated.Invoke( $this )
    }
    #endregion ----------------------------------------------------------------------------------------------------------
    #region (path)      GetFilename()/ GetDirectory()/ GetFullPath()/ GetBackupPath()
    [string] GetFilename() {
        return $this.ID + '.md'
    }
    [string] GetDirectory() {
        if ( $this.ID -eq 'thinktank' ) { 
            return $global:RootPath
        }
        else {
            return $global:MemoPath
        }
    }
    [string] GetFullPath() {
        return '{0}\{1}' -f $this.GetDirectory(), $this.GetFilename()
    }
    [string] GetBackupPath() {
        $now = ( Get-TTID now )
        $backup_filename = $this.GetFilename().replace( '.', "_deleted_at_$now." )
        return '{0}\{1}' -f $global:BackupPath, $backup_filename
    }
    #endregion ----------------------------------------------------------------------------------------------------------
    #region (file)      GetFile()/ ReadFile()/ WriteFile(text)/ DeleteFile()/ BackupFile()
    [FileInfo] GetFile() {
        return ( $(try{ Get-ChildItem -Path $this.GetFullPath() }catch{ $null }) )
     }
    [string[]] ReadFile() {
        return ( Get-Content $this.GetFullPath() ) -as [string[]]
     }
    [void] WriteFile( $text ) {
        $text | Out-File $this.GetFullPath() -Encoding utf8
     }
    [string] DeleteFile() {
        try {
            $backup_path = $this.GetBackupPath()
            Move-Item $this.GetFullPath() $backup_path
            return $backup_path
        }
        catch {}
        return ''
     }
    #endregion ----------------------------------------------------------------------------------------------------------
    #region (resource)  GetResourceMemos()/ GetRootMemo()
    [FileInfo[]] GetResourceMemos() {
        $paths = @( "$global:RootPath\thinktank.md", "$global:MemoPath\????-??-??-??????.md" )
        return [FileInfo[]] @( Get-ChildItem -Path $paths -File )
    }
    [FileInfo[]] GetRootMemo() {
        $paths = @( "$global:RootPath\thinktank.md" )
        return [FileInfo[]] @( Get-ChildItem -Path $paths -File )
    }

    #endregion
    #region (property)  _property/ Property()/ Property(clsnme)

    static [hashtable]  $_property = @{}
    static [hashtable] Property($classname) {
        return [TTObject]::_property[$classname]
     }
    [hashtable] Property() {
        return [TTObject]::_property[ $this.GetType().Name ]
     }

    #endregion
    #region (check)     IsUpdatedAfter(date)/ IsUpdatedAt(regexp)/ IsMatched(tags)
    [bool] IsUpdatedAfter( $date ) {
        return ( $date -le $this.UpdateDate )
    }
    [bool] IsUpdatedAt( $regex ) {
        return ( $this.UpdateDate -match $regex )
    }
    [bool] IsMatched( $tags ) {

        $text = '{0}|{1}' -f $this.ID, $this.Name

        return $tags.split(' ').where{ $_ -ne '' }.foreach{
            if ( $_[0] -eq '-' ) {
                $text -notlike ( '*{0}*' -f $_.substring(1) )
            }
            else {
                $text -like ( '*{0}*' -f $_ )
            }
        } -notcontains $false
    }
    #endregion
}
class TTCollection : TTObject { 
    #region (var) _children/ Count/ Description/ New()
    hidden [hashtable]  $_children
    [int]               $Count
    [string]            $Description

    TTCollection() : base() {
        $this._updated =    $false
        $this._children =   [ordered] @{}
        $this.Count =       0
        $this.Description = 'テンプレート'
        # $this.ID =          ($this.GetType().Name -replace '^TT', '')
        # $this.Name =        ($this.GetType().Name -replace '^TT', '')
        # $this.UpdateDate =  ( Get-TTID init )
     }
    #endregion
    #region (path) GetFilename()/ GetDirectory()
    [string] GetFilename() {
        return "{0}.cache" -f $this.Name
    }
    [string] GetDirectory() {
        return $global:CachePath
    }
    #endregion----------------------------------------------------------------------------------------------------------
    #region (item) GetItem(id)/ AddItem(item)/ DeleteItem(id)
    [TTObject] GetItem( $id ) {
        return $this._children[$id]
    }
    [TTObject] AddItem( $item ) {
        $item._parent = $this
        $this._children[$item.ID] = $item
        $this.Count = $this._children.Count
        $this.NotifyUpdated()
        return $item
    }
    [void] DeleteItem( $id ) {
        $item = $this._children[$id]
        $this._children.Remove($id)
        $this.Count = $this._children.Count
        $this.NotifyUpdated()
        $item.DeleteFile()
    }
    #endregion ----------------------------------------------------------------------------------------------------------
    #region (items) InitItems()/ ReadItems()/ WriteItems()/ ClearItems()/ UpdateItems()
    [void] InitItems() { write-host "250529: InitItems未設定 $($this.GetType().Name)" }
    [TTObject[]] GetItems() {
        return @( $this._children.values )
    }
    [TTObject[]] GetItems( $property, $op, $value ) {
        $items = @()
        switch ( $op ) {
            'eq' {      $items = $this.GetItems().where{ $_.$property -eq $value } }
            'like' {    $items = $this.GetItems().where{ $_.$property -like $value } }
            'match' {   $items = $this.GetItems().where{ $_.$property -match $value } }
            'lt' {      $items = $this.GetItems().where{ $_.$property -lt $value } }
            'le' {      $items = $this.GetItems().where{ $_.$property -le $value } }
            'gt' {      $items = $this.GetItems().where{ $_.$property -gt $value } }
            'ge' {      $items = $this.GetItems().where{ $_.$property -ge $value } }
            'within' {
                $dt = $null
                switch -regex ( $value ) {
                    '(?<n>\d+)d' { $dt = (Get-Date).AddDays( - [int]$Matches.n) }
                    '(?<n>\d+)w' { $dt = (Get-Date).AddDays( - [int]$Matches.n * 7) }
                    '(?<n>\d+)m' { $dt = (Get-Date).AddMonths( - [int]$Matches.n) }
                    '(?<n>\d+)y' { $dt = (Get-Date).AddYears( - [int]$Matches.n) }
                }
                $items = $this.GetItems().where{ $_.$property -lt $dt }
            }
        }
        return $items
    }
    [bool] ReadItems() {
        try {
            $lines = $this.ReadFile()
            if( $null -eq $Lines){ return $false }

            #::: (1)空行＊, (2)Format-List形式(自己プロパティ), (3)空行＋, (4)CSV(子プロパティ)
            $n = 0
            while ( $lines[$n] -eq '' ) { $n += 1 }                                 #::: (1)
            while ( $lines[$n] -ne '' ) {
                #::: (2)
                $key, $val = ( $lines[$n].split(":", 2) ).Trim()
                $this.$key = $val
                $n += 1
            }
            while ( $lines[$n] -eq '' ) { $n += 1 }                                 #::: (3)
            $itms = [psobject[]]@( $lines[$n..$lines.count] | ConvertFrom-Csv )     #::: (4)

            #::: Add All to _children
            $childclsname = $this.Property().ChildClassName
            foreach ( $itm in $itms ) {
                if( !($child = $this.GetItem($itm.ID)) ){ $child = ( New-Object $childclsname ) }
                $itm.psobject.properties.name.foreach{
                    $child.$_ = $itm.$_
                }
                $this._children[$child.ID] = $child
            }
        }
        catch {
            Show-Error "TTCollection::ReadItems()"
            # $this.SetupDefaults()
            # $this.WriteItems()
        }

        $this.Count = $this._children.Count

        return $true
    }
    [TTCollection] WriteItems() {

        $filepath = $this.GetFullPath()

        try{
            #::: (1)空行
            $this | Format-List | Out-File $filepath  #::: (2)Format-List形式(自己プロパティ)
            #::: (3)空行
            $this.GetItems() | ConvertTo-Csv -NoTypeInformation | Out-File $filepath -Append   #::: (4) CSV(子プロパティ)
    
            $this._updated = $false
            return $this
        }
        catch{
            write-host "WriteItems $filepath"
        }

        return $null
    }
    [TTCollection] WriteItemsDelayed() { 

        $id = $this.ID

        Register-DelayedRun -Title "[$id]::WriteItemsDelayed" -Step 5 -Script {
            $global:Models.GetCollection( $script:id ).WriteItems()
        }.GetNewClosure()

        return $this
    }
    [TTCollection] ClearItems() {
        $this._children.Clear()
        $this.Count = 0
        $this.NotifyUpdated()
        return $this
    }
    [bool] UpdateItems() { return $true }
    #endregion ----------------------------------------------------------------------------------------------------------
}
#endregion###############################################################################################################

#region TTModels/ Add-TTModelProperty/ Get-TTModelProperty
#########################################################################################################################
class TTModels : TTCollection {
    #region (var) Status/ Memos/ Actions/ Events/ Editings/ WebSearches/ WebLinks

    # Add-Memberで以下プロパティを設定: Library, Index, Shelf, Desk, System

    # [TTStatus]      $Status
    # [TTMemos]       $Memos
    # [TTActions]     $Actions
    # [TTEvents]      $Events
    # [TTEditings]    $Editings
    # [TTWebSearches] $WebSearches
    # [TTWebLinks]    $WebLinks

    #endregion ----------------------------------------------------------------------------------------------------------
    TTModels() : base() {

        $this.ID = 'Thinktank'
        $this.Name = 'Thinktank'
        $this.Description = 'コレクション一覧'

        # 250523: 各CollectionをTTModelsのプロパティとして登録する
        $models = @( 'Status', 'Memos', 'Actions', 'Events', 'Editings', 'WebSearches', 'WebLinks' )
        $this.ClearItems()
        $models.foreach{ $this | Add-Member $_ (New-Object -TypeName "TT$_") }
        $models.foreach{ $this.AddItem( $this.$_ ) }

        # 250527: 各Collectionの属性を読込んで設定
        . "$global:ScriptPath/TTModelProperties.ps1"
        $models.foreach{    $this.$_.Description = $this.Property().Description }
        $this.UpdateDate = ( Get-TTID init )
        [TTCollection]::OnUpdated = {}
     }
    [void] Setup() {

        # 250808 View設定の後、KeyBindingの前に実行される。 
        #::: 登録したCollectionについて、Default→Cache→Userの順で値をロードする
        #::: DefaultActions, DefaultEvents, DefaultStatus, DefaultThinktank, DefaultWebSearches, DefaultWebLinks 

        #region ::: Default値の設定
        $this.GetItems().foreach{ $_.ClearItems() }
        
        $this.GetCollections().foreach{
            "$global:ScriptPath/Default$($_.Name).ps1"
        }.where{
            Test-Path $_
        }.foreach{
            . $_
        }
        #endregion

        #region ::: Cache値の読み込み設定
        write-host "250612: TTEditingsのCache設定について要検討　ここ"
        $this.GetCollections().where{
            $_.Property().NeedCache -eq 'true'
        }.foreach{
            if( -not $_.GetFile() ){
                $_.UpdateItems()
                $_.WriteItems()
            }
            $_.ReadItems()
        }
        #endregion

        #region ::: User設定
        $regex =    "^\w*(Apply-TTState|New-TTWebSearch|New-TTWebLink)\W+.*"
        $items =    ( $this.GetRootMemo() | Select-String $regex -AllMatches ).Matches.Value
        $items.foreach{
            Invoke-Expression $_
        }
        #endregion
     }
    #region (items) CloseItems()/ GetCollection(id)/ GetCollections() 
    [TTCollection] CloseItems() {
        $this._children.Keys.foreach{
            if ( $this._children[$_]._updated ) {
                $this._children[$_].WriteItems()
            }
        }
        $this._children.Clear()
        $this.Count = 0
        $this.NotifyUpdated()
        return $this
    }
    [TTCollection] GetCollection( $id ) {
        if( $id -eq $this.ID ){
            return $this
        }
        return $this._children[$id]
     }
    [TTCollection[]] GetCollections(){
        return ( $this.GetItems() + $this )
    }
    #endregion
}
function Add-TTModelProperty( $classname, $hashvalue ) {

    if ( 'TTObject' -eq $classname ) {
        [TTObject]::_property[$classname] = ( Merge-Hashtables $hashvalue )

    }
    elseif ( 'TTCollection' -eq ([Type]$classname).BaseType.Name ) {
        [TTObject]::_property[$classname] = ( Merge-Hashtables ($hashvalue, ([TTObject]::_property['TTCollection']), ([TTObject]::_property['TTObject'])) )

    }
    else {
        [TTObject]::_property[$classname] = ( Merge-Hashtables ($hashvalue, ([TTObject]::_property['TTObject'])) )

    }
}
function Get-TTModelProperty( $classname, [switch]$Child ) {

    if( $Child ){
        $childclass = $global:Models.GetCollection( $classname ).Property().ChildClassName
        return [TTObject]::_property[$childclass]
    }

    return [TTObject]::_property[$classname]

}
#endregion###############################################################################################################

#region TTState/ TTStatus/ New-TTState/ Get-TTState/ Apply-TTState
#########################################################################################################################
class TTState : TTObject {
    #region (var) Value/ Description/ _default/ _test/ _apply_to_view/ _event_initiator
    [string]    $Value
    [string]    $Description
    hidden [string]         $_stored_value
    hidden [ScriptBlock]    $_default
    hidden [ScriptBlock]    $_test
    hidden [ScriptBlock]    $_apply_to_view
    hidden [ScriptBlock]    $_event_initiator
    #endregion
    TTState() : base() {
        $this.ID = ''       #::: ID
        $this.Name = ''     #::: 説明
        $this.UpdateDate = ( Get-TTID init )
        $this.Value = ''
        $this.Description = ''
        $this._default = {}
        $this._test = {}
        $this._apply_to_view = {}
        $this._event_initiator = {}
    }
}
class TTStatus: TTCollection {
    #region (item) SetValue(id,value)
    [void] SetValue( $id, $value ) {
        try{
            $val = $this.GetItem($id).Value
            if ( $val -ne $value ) {
                $this.GetItem($id).Value = $value
                $this.GetItem($id).NotifyUpdated()
                $this.NotifyUpdated()
            }
        }
        catch{ Show-Error "SetValue 【$id】【$value】" }
    }
    #endregion
}
function New-TTState( $ID, $Description, $Scripts, $PCName ) {

    try{
        if ( $PCName -notin @( $null, $Env:Computername, '*' ) ) { return }
        if ( $ID.Contains('[Panels]') ){
            $global:Application.Panels.foreach{
                $_id =      $ID.Replace( '[Panels]', $_.Name )
                $_desc =    $Description.Replace( '[Panels]', $_.Name )
                New-TTState $_id $_desc $Scripts $PCName
            }
            return
        }
        if ( $ID.Contains('[Modes]') ){
            $global:Application.ModeNames.foreach{
                $_id =      $ID.Replace( '[Modes]', $_ )
                $_desc =    $Description.Replace( '[Modes]', $_ )
                New-TTState $_id $_desc $Scripts $PCName
            }
            return
        }

        $items =    $global:Models.Status
        $item =     [TTState]::New()
        $item.ID =              $ID
        $item.Name =            $ID
        $item.Description =     $Description

        if( $Scripts -is [string] ){
            $item._default =    {}
            $item.Value =       $Scripts
            $item._test =       { $true }
            $item._apply_to_view =    {}
            $item._event_initiator =  {}
        }
        else{
            $item._default =    if ( $null -eq $Scripts.Default ){ {''} }else{ $Scripts.Default }
            $item.Value =       $item._default.invoke( $ID )
            $item._test =       if ( $null -eq $Scripts.Test ){ { $true } }else{ $Scripts.Test }
            $item._apply_to_view =      if ( $null -eq $Scripts.Apply ){ { $global:Models.Status.SetValue($args[0], $args[1]) } }else{ $Scripts.Apply }
            $item._event_initiator =    if ( $null -eq $Scripts.Watch ){ {} }else{ $Scripts.Watch }
        }
        $items.AddItem( $item )

    }
    catch{
        Show-Error "New-TTState $ID $Description $Scripts"
    }
}
function Get-TTState( $ID, $opt = '' ) {
    switch( $opt ){
        'Default' {     return $global:Models.Status.GetItem( $ID )._default.Invoke($ID) }
        'Stored' {      return $global:Models.Status.GetItem( $ID )._stored_value }
    }
    return $global:Models.Status.GetItem( $ID ).Value
}
function Apply-TTState( $ID, $Value, $PCName ) {
    #
    # 概要：TTStateに値を設定して、アプリに反映させる
    # イベント順
    # ↓ Item(ID)._apply_to_viewを起動、スクリプト内でView(TTApplication/TTPanel)を修正
    # ↓ WPF eventがItem(ID)._event_initiatorを起動、スクリプト内でItem(ID).Valueを変更
    #
    try {
        if ( $PCName -in @( $null, $Env:Computername, '*' ) ) {

            if ( $ID.Contains('[Panels]') ){
                $global:Application.Panels.foreach{
                    $_id =      $ID.Replace( '[Panels]', $_.Name )
                    Apply-TTState $_id $Value $PCName
                }
                return
            }

            $item = $global:Models.Status.GetItem( $ID )
            $val =  $Value
            switch ( $Value ) {
                'Default' {         $val = [string]($item._default.invoke( $ID )) }
                'CurrentValue' {    $val = $item.Value }
                'Stored' {          $val = $item._stored_value }
                $null {             $val = $item.Value }
            }

            if ( $item._test.invoke($ID,$val) -eq 'true' ) {

                $global:Application.Window.Dispatcher.Invoke({
                    $script:item._apply_to_view.invoke( $script:ID, $script:val )
                }.GetNewClosure())
                # $item._apply_to_view.invoke( $ID, $val )

            }
            else {
                Show-Error "not Valid: Apply-TTState $ID ... $val/$Value"
                return $false
            }
        }
    }
    catch {
        Show-Error "Apply-TTState ID[$ID] 設定値[$val] 入力値[$Value]"
        return $false
    }
    return $true
}

#endregion###############################################################################################################

#region TTAction/ TTActions/ Add-TTAction/ Invoke-TTAction
#########################################################################################################################
class TTAction : TTObject { #::: Actionを呼びだすのは以下のコマンドのみ
    hidden [ScriptBlock] $_script
    TTAction() : base() {
        $this.ID = ''       #::: ID
        $this.Name = ''     #::: 説明
        $this.UpdateDate = ( Get-TTID init )
        $this._script = {}
    }
    [bool] Invoke( $Tag ){
        try{
            $id =   $this.ID
            $mods = $Tag.UIMods
            $key =  $Tag.UIKey
            $intk = $Tag.UIIntKey

            write-host "250612: 〓$id  ($mods $key[$intk])"

            return $this._script.Invoke( $Tag )
        }
        catch{
            Show-Error "TTAction::Invoke $($this.ID)"
        }
        return $false
    }
}
class TTActions : TTCollection {
    #region GetItem(id)
    [TTAction] GetItem( $id ) {

        $stateid, $val =   $id.split(':')

        if( $null -ne $val ){  #::: TTState変更系のアクション 
            $actid = $stateid
            $actid = $actid.Replace('[FdPanel]',    [TTExModMode]::FdPanel().Name )
            $actid = $actid.Replace('[ExPanel]',    [TTExModMode]::ExPanel.Name )
            $actid = $actid.Replace('[ExFdPanel]',  [TTExModMode]::ExFdPanel().Name )

            if( $this._children.ContainsKey($actid) ){ return $this._children[$actid] }

            $desc =        $id
            $script =      {
                $vid = $script:stateid
                $vid = $vid.Replace('[FdPanel]',    [TTExModMode]::FdPanel().Name )
                $vid = $vid.Replace('[ExPanel]',    [TTExModMode]::ExPanel.Name )
                $vid = $vid.Replace('[ExFdPanel]',  [TTExModMode]::ExFdPanel().Name )
                Apply-TTState $vid $script:val
                return $true
            }.GetNewClosure()

            $action =           [TTAction]::New()
            $action._script =   $script
            $action.ID =        $id
            $action.Name =      $desc
            $this.AddItem( $action )

        }

        return $this._children[$id]
    }

    #endregion
}
function Add-TTAction( $ID, $Description, [scriptblock]$Script, $PCName ) {
    if ( $PCName -in @( $null, $Env:Computername, '*' ) ) {

        $action =           [TTAction]::New()
        $action._script =   $Script
        $action.ID =        $ID
        $action.Name =      $Description
        $global:Models.Actions.AddItem( $action )
    }
}
function Invoke-TTAction( $ID, $Tag ) {
    #::: 使われ方
    #::: 1.自己呼出し：Invoke-TTAction内で別Actionを呼び出す
    #::: 2.Menu系：環境依存Menuの構築と、Menu選択のAction
    #::: $TagはAction側で用途を決める。
    try{
        return $global:Models.Actions.GetItem( $ID ).Invoke( $Tag )
    }
    catch{
        Show-Error "Invoke-TTAction $ID"
    }
}
#endregion###############################################################################################################

#region TTEvent/ TTEvents/ Add-TTEvent/ Add-TTControlMenu
#########################################################################################################################
class TTEvent : TTObject {
    #region (var) _mods/ _key
    [string] $Tag
    [string] $Mods
    [string] $Key
    #endregion ----------------------------------------------------------------------------------------------------------
    TTEvent() : base() {
        $this.ID = ''           #::: $Tag|$Mods|$Key
        $this.Name = ''         #::: コマンドID
        $this.UpdateDate = ( Get-TTID init )
        $this.Tag = ''          #::: $Tag
        $this.Mods = ''
        $this.Key = ''
    }
}
class TTEvents : TTCollection {}
function Add-TTEvent( $Tag, $Mods, $Key, $ActionID, $PCName ) {
    # 使用例
    # Add-TTControlMenu     Application     '_V)表示>_D)フォント>_L)拡大'               Application.Window.FontSize:Up

    if ( $PCName -in @( $null, $Env:Computername, '*' ) ) {
        if( $Key.Contains(',') ){           #::: 複数Keyへの同一Action一括登録
            $Key.split(',').Trim().foreach{ Add-TTEvent $Tag $Mods $_ $ActionID $PCName }
            return
        }

        $evnt =         [TTEvent]::New()
        $evnt.Name =    $ActionID
        $evnt.Tag =     $Tag
        $evnt.Mods =    $Mods   #::: $( try { [System.Windows.Input.ModifierKeys]$Mods }catch{ [System.Windows.Input.ModifierKeys]::None } )
        $evnt.Key =     $Key    #::: $( try { [System.Windows.Input.Key]$Key }catch{ [System.Windows.Input.Key]'None' }
        $evnt.ID =      "$Tag|$Mods|$Key"
        $global:Models.Events.AddItem( $evnt )
    }
}
#endregion ###############################################################################################################

#region TTMemo/ TTMemos
#########################################################################################################################
class TTMemo : TTObject {
    #region (var) Keywords
    [string] $Keywords
    #endregion ----------------------------------------------------------------------------------------------------------
    TTMemo() : base() {
        $memoid = ( Get-TTID now )
        $this.ID = $memoid
        $this.Name = "[$memoid] 新しいメモ"
        $this.UpdateDate = ( Get-TTID init )
        $this.Keywords = ''
    }
    [void] CreateFile() {

        if( Test-Path $this.GetFullPath() ){ $this.DeleteFile() }

        $text = "[{0}] 新しいメモ" -f $this.ID
        $this.Name = $text
        $text += "`r`n" + '='*80 + "`r`n`r`n"
        $this.WriteFile( $text )
        $this.UpdateDate = ( Get-Item $this.GetFullPath() ).LastWriteTime 

    }
#2504012 textchange毎にWriteFile後のNotifyUpdateでCollection→Table→Sortの連鎖が発生し遅くなっている
#250412 SaveFile時か、TextChange時に $this.Name に テキスト1行目を設定する
    [void] WriteFile( $text ) {

        $this.UpdateDate =  ( Get-TTID now )
        $this.NotifyUpdated()
        $text | Out-File $this.GetFullPath() -Encoding utf8

    }
    [void] WriteFileDelayed( $text ) {

        $item = $this

        Register-DelayedRun -Title "[$($this.GetFilename())]::WriteFile" -Step 5 -Script {
            write-host ( 'write-file-delayed: {0} {1}' -f $script:item.id, $script:item.GetFilename() )
            $script:item.WriteFile( $script:text )
        }.GetNewClosure()
    }
}
class TTMemos : TTCollection {
    [void] UpdateItems(){

        $cache_update = [DateTime]::ParseExact( $this.UpdateDate, 'yyyy-MM-dd-HHmmss', $null )

        $this.GetResourceMemos().where{
            !$this._children.Contains( $_.BaseName ) -or $cache_update -lt $_.LastWriteTime
        }.foreach{
            $memo = [TTMemo]::New()
            $memo.ID = $_.BaseName
            $memo.Name = ( Get-Content $_.FullName -TotalCount 1 )
            $memo.UpdateDate = ( Get-TTID ($_.LastWriteTime) )
            $this.AddItem( $memo )
        }
    }
    [void] ResetItems(){
        $this._children.Clear()
        ( $this.GetResourceMemos() ).foreach{
            $memo = [TTMemo]::New()
            $memo.ID = $_.BaseName
            $memo.Name = ( Get-Content $_.FullName -TotalCount 1 )
            $memo.UpdateDate = ( Get-TTID ($_.LastWriteTime) )
            $this.AddItem( $memo )
        }
    }
    [TTMemo] AddNewMemo(){
        $memo = [TTMemo]::New()
        $memo.CreateFile()
        return [TTMemo]$this.AddItem( $memo )
    }
    [TTMemo] AddNewSearch( $search_word ) { 
        # no use

        $memoid = $this.GetTTID()
        $filepath = "$global:TTMemoDirPath\$memoid.txt"
        $title = "[memo:$search_word]"
        $text = "$title`r`n========================================================================================================`r`n"

        if ( $search_word -notmatch "((?<opt>Re|Aa):)?(?<criteria>.+)" ) { return $null }
        $opt = $Matches.opt
        $criteria = $Matches.criteria

        $path = @( "$global:TTRootDirPath\thinktank.md", "$global:TTMemoDirPath\????-??-??-??????.txt" )
        $update_date = [DateTime]'1970/3/11' 
        $memos = @( Get-ChildItem -Path $path | Where-Object { $update_date -Lt $_.LastWriteTime } | Sort-Object -property LastWriteTime -Descending )
        
        @( switch ( $opt ) {
                'Aa' { $memos | Select-String "$criteria" -List -SimpleMatch -CaseSensitive }
                'Re' { $memos | Select-String "$criteria" -List }
                default { $memos | Select-String "$criteria" -List -SimpleMatch }
            }).foreach{ #::: MatchInfo object
            $targetid = $_.Filename -replace ".*(thinktank|\d{4}\-\d{2}\-\d{2}\-\d{6})\..*", '$1'
            $targettitle = $this.children[$targetid].Title
            $linenum = $_.LineNumber
            $text = $text + "# [$($targetid):memo:$linenum] $targettitle`r`n"
            $text = $text + "[$($targetid):memo:$search_word]`r`n"
            $matchline = $_.Line
            $text = $text + ";$matchline`r`n`r`n"
        }

        $text | Out-File $filepath -Encoding utf8

        $child = $this.CreateChild()
        $child.MemoID = $memoid
        $child.Title = $title
        $child.UpdateDate = $memoid
        $child.parent = $this

        return ([TTCollection]$this).AddChild( $child )
    }
}
#endregion###############################################################################################################

#region TTEditing/ TTEditings
#########################################################################################################################
class TTEditing : TTObject {
    #region (var) CaretPos/ WordWrap/ Foldings
    [long] $CaretPos
    [bool] $WordWrap
    [string] $Foldings
    #endregion ----------------------------------------------------------------------------------------------------------
    TTEditing() : base() {
        # $this.ID =          ($this.GetType().Name -replace '^TT', '')
        # $this.Name =        ($this.GetType().Name -replace '^TT', '')
        # $this.UpdateDate =  ( Get-TTID init )
        $this.CaretPos = 1
        $this.WordWrap = $False
        $this.Foldings = ''
    }
}
class TTEditings : TTCollection {
}
#endregion###############################################################################################################

#region TTWebSearch / TTWebSearchs/ New-TTWebSearch
#########################################################################################################################
class TTWebSearch : TTObject {
    #region (var) Url, New()
    [string] $Url
    
    TTWebSearch() : base() {
        $this.ID =          'Web'       #::: タグ
        $this.Name =        'Web検索'   #::: 名前
        # $this.UpdateDate =  ( Get-TTID init )
        $this.Url =         ''          # 'https:https://www.google.com/search?q=<keywords>'
    }
    #endregion ----------------------------------------------------------------------------------------------------------
}
class TTWebSearches: TTCollection {
    #region CreateUrlFromTag()
    [string] CreateUrlFromTag( $Match ){
        $tag =          $Match.tag
        $keywords =     $Match.keywords
        $websearch =    $global:Models.WebSearches.GetItem($tag)
        $url =          $websearch.Url
        if( $websearch._script -eq {} ){
            return $url -replace '<keywords>', [System.Web.HttpUtility]::UrlEncode($keywords)
        }

        return $websearch._script.Invoke( $Match )
        
    }
    #endregion
}
function New-TTWebSearch( $Tag, $Description, $Url ) {
    $websearches =  $global:Models.WebSearches
    $websearch =    [TTWebSearch]::New()
    $websearch.ID =     $Tag
    $websearch.Name =   $Description
    $websearch.Url =    $Url
    $websearches.AddItem( $websearch )
}

#endregion###############################################################################################################

#region TTWebLink / TTWebLinks/ New-TTWebLink
#########################################################################################################################
class TTWebLink : TTObject {
    #region (var) Url, New()
    [string] $Url
    
    TTWebLink() : base() {
        $this.ID =          'WebLink'   #::: タグ
        $this.Name =        'Webリンク' #::: 名前   
        # $this.UpdateDate =  ( Get-TTID init )
        $this.Url =         ''          # 'https:https://www.google.com'
    }
    #endregion ----------------------------------------------------------------------------------------------------------
}

class TTWebLinks: TTCollection {}

function New-TTWebLink( $Name, $Url ) {
    $weblinks =     $global:Models.WebLinks
    $weblink =      [TTWebLink]::New()
    $weblink.ID =   $Name
    $weblink.Name = $Name
    $weblink.Url =  $Url
    $weblinks.AddItem( $weblink )
}

#endregion###############################################################################################################



class TTOutlook {
    #region variant
    hidden $outlook =        $null
    hidden $mainfolder =     $null
    hidden $backupfolder =   $null
    #endregion
    static [bool] Exec( $param, [scriptblock]$script ){
        $ttoutlook =    [TTOutlook]::New()
        $ret =          $script.Invoke( $param, $ttoutlook )
        $ttoutlook.Finalize()
        return $ret
     }

    TTOutlook() {
        $this.outlook =         New-Object -ComObject Outlook.Application
        $this.mainfolder =      $this._getFolder('Application.System.OutlookMainFolder')
        $this.backupfolder =    $this._getFolder('Application.System.OutlookBackupFolder')
     }
    Finalize(){
        [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject( $this.outlook )
     }
    hidden [Object] _getFolder( $name ){
        try{
            $fpath =    $global:Models.Status.GetItem($name).Value
            $folder =   $this.outlook.GetNamespace('MAPI')
            $fpath.split('>').Trim().foreach{
                $folder = $folder.Folders($_)
            }
            return $folder
        }
        catch{}
        return $null
     }
    [Object]    GetItems( $mailid ){        #::: $mailid: xxxx-xx-xx-xxxxxx, selected, displayed
        $items =    $null
        switch( $mailid ){
            'selected' {
                $items =    $this.outlook.ActiveExplorer().Selection
             }
            'displayed' {
                $items =    $this.outlook.ActiveInspector().CurrentItem
             }
            default {
                $time =     [DateTime]::ParseExact( $mailid, "yyyy-MM-dd-HHmmss", $null )
                $time1 =    $time.AddMinutes(-2).ToString("yyyy/MM/d H:mm")
                $time2 =    $time.AddMinutes(+2).ToString("yyyy/MM/d H:mm")
                $filter =   "[ReceivedTime] >= '$time1' AND [ReceivedTime] < '$time2'"

                if( $null -ne $this.backupfolder ){
                    $items =    $this.backupfolder.Items.Restrict( $filter )
                }
                if( $items.count -eq 0 ){
                    $items =    $this.mainfolder.Items.Restrict( $filter )
                }

                $tmp = @()
                for( $i = 1; $i -le $items.count; $i++ ){

                    if( $items[$i].ReceivedTime.ToString("yyyy-MM-dd-HHmmss") -eq $time.ToString("yyyy-MM-dd-HHmmss") ){
                        $tmp += $items[$i]
                    }
                }
                $items = $tmp
             }
        }

        return $items
     }
    [void]      InspectMail( $mailid ){

        $items =    $this.GetItems( $mailid )        

        for( $i = 0; $i -lt $items.count; $i++ ){
            $items[$i].GetInspector().Display()
        }
     }
    [void]      ExploreMails( $keyword ){

        $explorer = $this.backupFolder.GetExplorer( 2 )     #::: olFolderDisplayNoNavigation, 2
        $explorer.Search( $keyword, 2 )                     #::: olSearchMarkedAllOutlookItems, 2
        $explorer.Display()
        $explorer.WindowState = 0                           #::: olMaximized, 0
     }
    [string[]]  GetMailTags( $mailid, $fmt ){   #::: $fmt: ID, FROM, TITLE, BODY 

        $items =    $this.GetItems( $mailid )        
        $tags =     @()

        for( $i = 1; $i -le $items.count; $i++ ){
            $ret = $fmt.Replace( 'ID',      (Get-TTID $items[$i].ReceivedTime) )        #::: ID
            $ret = $ret.Replace( 'FROM',    $items[$i].SenderName )                    #::: FROM
            if( $ret -match 'TITLE(?<max>\d*)'){                                        #::: TITLE<maxchar>
                $num = [int]($Matches.max)
                $ret = ( $ret -replace $Matches[0], ($items[$i].Subject+' '*$num).Substring( 0, $num ) )
             }
            if( $ret -match '(?<head>[]>;| ]*)BODY(?<max>\d*)'){                        #::: BODY<maxline>
                $num = [int]($Matches.max)
                if( $num -eq 0 ){
                    $body = ( $items[$i].Body.split("`n").foreach{ $Matches.head + $_ } -join "`n" )
                    $ret =  ( $ret -replace $Matches[0], $body )
                }
                else{
                    $body = ( $items[$i].Body.split("`n").foreach{ $Matches.head + $_ }[0..$num] -join "`n" )
                    $ret =  ( $ret -replace $Matches[0], $body )
                }
             }
            $tags += $ret
        }
        return $tags
     }
    [void]      BackupMail( $mailid ){

        if( $null -eq $this.backupfolder ){ return }

        $time =     [DateTime]::ParseExact( $mailid, "yyyy-MM-dd-HHmmss", $null )
        $items =    $this.GetItems( $mailid )        
        $tags = @()
        for( $i = 1; $i -le $items.count; $i++ ){
            if( $items.Item($i).ReceivedTime.ToString("yyyy-MM-dd-HHmmss") -eq $time.ToString("yyyy-MM-dd-HHmmss") ){
                $items.Item($i).Move( $this.backupfolder )
            }
        }
     }
    [void]      SendMail( $text, $mailto ){
        #::: zipしてencodeして送信する

     }
    [string[]]  RecieveText( $mailid ){
        #::: text得てdecodeしてunzipする
        return $null
     }

}

class TTClipboard {
    #region _ttobj, _datatypes, GetDataTypes()
    static [object] $_ttobj
    static [hashtable[]] $_datatypes = @(
        @{  'Name' = 'OutlookMail'
            'DataFormat' = @( 'Csv', 'FileGroupDescriptor' )
            'GetClipboard' = {
                $items =    [Clipboard]::GetData('FileGroupDescriptor')
                $encoder =  [System.Text.Encoding]::GetEncoding("Shift_JIS")
                $texts =    ( $encoder.GetString( $items.ToArray() ) -replace("[\0]",'') ).substring(1)
                $texts =    $texts -replace('_','?') -split('.msg')
                return $texts
            }
        },
        @{  'Name' = 'OutlookSchedule'
            'DataFormat' = @( 'RenPrivateAppointment' )
            'GetClipboard' = {
                $items =    [Clipboard]::GetData('FileGroupDescriptor')
                $encoder =  [System.Text.Encoding]::GetEncoding("Shift_JIS")
                $texts =    ( $encoder.GetString( $items.ToArray() ) -replace("[\0]",'') ).substring(1)
                $texts =    $texts -replace('_','?') -split('.msg')
                return $texts
            }
        },
        @{  'Name' = 'ExcelRange'
            'DataFormat' = @( 'XML Spreadsheet' )
            'GetClipboard' = {
            }
        },
        @{  'Name' = 'WebLink' 
            'DataFormat' = @( 'OEMText' )
            'GetClipboard' = {
                $item =     [Clipboard]::GetText()
                $encoder =  [System.Text.Encoding]::GetEncoding("Shift_JIS")
                return $encoder.GetString( $item )
            }
        },
        @{  'Name' = 'TTObject'
            'DataFormat' = @( 'TTObject' )
            'GetClipboard' = {
            }
        },
        @{  'Name' = 'Text'
            'DataFormat' = @( 'Text' )
            'GetClipboard' = {
                [Clipboard]::GetText()
            }
        },
        @{  'Name' = 'FileList'
            'DataFormat' = @( 'Shell Object Offsets' )
            'GetClipboard' = {
                [Clipboard]::GetFileDropList()
            }
        },
        @{  'Name' = 'Image'
            'DataFormat' = @( 'PNG' )
            'GetClipboard' = {
                [Clipboard]::GetImage()
            }
        }
    )
    static [hashtable[]] GetDataTypes() {
        $formats =  [System.Windows.Clipboard]::GetDataObject().GetFormats()
        return [TTClipboard]::_datatypes.where{
            $_.DataFormat.foreach{ $_ -in $formats } -notcontains $false
        }
    }
    #endregion

    #region DrugDrop/ CutFiles/ CreateFileLinks/ CopyImage/ CopyText/ CopyTTObject/ CopyUrlLinks
    static [void]   DrugDrop( [string]$action, [string[]]$files ) {
        if( $action -in @('move','link','copy') ){

            $dataObj = [System.Windows.Forms.DataObject]::New()
            $dataObj.SetFileDropList( $files )
            $memoryStream = [System.IO.MemoryStream]::New()
            $memoryStream.Write(
                [byte[]]( ([System.Windows.Forms.DragDropEffects]::$action -as [byte]), 0, 0, 0 ),-
                0, 4 )
            $dataObj.SetData( "Preferred DropEffect", $memoryStream )

            [System.Windows.Forms.Clipboard]::SetDataObject( $dataObj, $true )
        }
     }
    static [void]   CutFiles( [string[]]$files ) {
        [TTClipboard]::DrugDrop( 'move', $files )
     }
    static [void]   CopyFiles( [string[]]$files ) {
        [TTClipboard]::DrugDrop( 'copy', $files )
     }
    static [void]   CopyImage( [string]$filepath ) {
        [Clipboard]::SetImage( [System.Drawing.Image]::FromFile( $filepath ) )
     }
    static [void]   CopyText( [string]$text ) {
        [Clipboard]::SetText( $text )    
     }
    static [void]   CopyTTObject( [TTObject]$object ) {
        [Clipboard]::SetData( 'TTObject', $object )
        [TTClipboard]::_ttobj = $object
     }
    static [void]   CreateUrlLink( [string]$url ){
        if( $url -match "https://(?<srv>[^/]+)(?<opt>/.*)?" ){
            $server =   $Matches.srv
            $path =     $global:BackupPath            
            Set-Content -Path "$path\$server.url" -Value "[InternetShortcut]`nURL=$url " -Encoding string
            [TTClipboard]::CutFiles(@( "$path\$server.url" ))  
        }

     }
    static [void]   CreateFileLinks( [string[]]$files ) {
        [TTClipboard]::DrugDrop( 'link', $files )
     }
    static [string] SaveImageToFile() {
        
        return ''
     }
    #endregion

}














