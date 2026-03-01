#region namespace
using namespace System
using namespace System.IO
using namespace System.Windows
using namespace System.Windows.Controls
using namespace System.Windows.Markup
using namespace System.Windows.Input
using namespace System.Windows.Threading
using namespace System.Windows.Media.TextFormatting
using namespace System.Xml
using namespace System.Globalization
using namespace System.Diagnostics
using namespace System.Drawing
using namespace System.ComponentModel
using namespace System.Text.RegularExpressions
using namespace System.Collections.Generic
using namespace ICSharpCode.AvalonEdit
using namespace ICSharpCode.AvalonEdit.Document
using namespace ICSharpCode.AvalonEdit.Folding
using namespace ICSharpCode.AvalonEdit.Rendering
#endregion


#region Get-TTID(DateTime)/ Check-TTID(text)
function Get-TTID( $DateTime ) {
    #::: DateTime: (now|init|.*)
    #::: output: 'yyyy-MM-dd-HHmmss'

    $ret = ( Get-Date '1970-03-11' )

    switch ( $DateTime ) {
        'now' { $ret =  ( Get-Date ) }
        'init' { $ret = ( Get-Date '1970-03-11' ) }
        $null { $ret =  ( Get-Date '1970-03-11' ) }
        default { $ret = ( Get-Date $DateTime ) }
    }
    return $ret.tostring('yyyy-MM-dd-HHmmss')
}
function Check-TTID( $text ){

    return ( $text -match '\d{4}\-\d{2}\-\d{2}\-\d{6}' -or $text -eq 'thinktank' )

}
#endregion'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''

#region Show-TTLapTime
#'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
$global:TTLapTime_StartTime =   @{}
function Start-TTLapTime( $id ){
    $global:TTLapTime_StartTime.Add( $id, (Get-Date) )
}
function Show-TTLapTime( $id, $text ){
    try{
        $starttime = $global:TTLapTime_StartTime[$id]
        $diff =     ( New-TimeSpan -Start $starttime -End (Get-Date) ).Milliseconds.ToString().PadLeft(6)
        if( $null -eq $text ){ $text = $id }
        $global:TTLapTime_StartTime.Remove($id)
        
        # write-host "--------- --------- --------- $diff(ms) $text"
    }
    catch{}
}

#endregion'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''

#region Show-Error(text) / Show-OK(text)/ Show-ErrorDialog(text)/ Show-ToCheck()
function Show-Error( $text ) {
    Write-Host ">>>> Error :: $text"
    Write-Host $_.Exception.Message
    Write-Host $_.InvocationInfo.PositionMessage
    Write-Host ">>>> ==========================================="
}
function Show-OK( $text ) {
    Write-Host "  OK: $text"
}
function Show-ToCheck( $text ) {
    Write-Host " ■ Check: $text"
}
function Show-State( $text ) {
    Write-Host "--------- --------- --------- State: $text"
}


function Show-ErrorDialog( $text ){
    [System.Windows.MessageBox]::Show( $text, "Error", 'OK', 'Error')
}


function Debug( $text ){
    $prehead = (Get-Date).tostring('yyMMdd')
    $debunre = "^(000000|$prehead)"
    if( $text -match $debugre ){
        Write-Host "--------- Debug $text"
    }
}
#endregion'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
    
#region Register-DelayedRun(Title,Step,Script)/ Clear-DelayRun()
$global:DelayedRun = @{
    Interval =  400
    Mutex =     $true  
    Tasks =      @{}
    Timer =     $null
    Initalizer = {      
        $global:DelayedRun.Timer =          [System.Windows.Threading.DispatcherTimer]::New()
        $global:DelayedRun.Timer.interval = [System.TimeSpan]::new( 0, 0, 0, 0, $global:DelayedRun.Interval )
        $global:DelayedRun.Timer.Add_Tick({
    
            if ( $global:DelayedRun.Mutex -eq $false ) {
                $global:DelayedRun.Mutex = $true
                $keys = $global:DelayedRun.Tasks.keys.where{
                    $global:DelayedRun.Tasks[$_].step -= 1
                    $global:DelayedRun.Tasks[$_].step -le 0
                }
                $keys.foreach{  #::: 非同期実行
                    $global:Application.Window.Dispatcher.BeginInvoke(
                        [DispatcherPriority]::Background,
                        [Delegate][Action]$global:DelayedRun.Tasks[$_].script
                    )
                }
                $keys.foreach{ $global:DelayedRun.Tasks.Remove($_) }
            }
            $global:DelayedRun.Mutex = $false
            
        })
        $global:DelayedRun.Timer.Start()
    }
 }
function Register-DelayedRun( [string]$Title, [long]$Step, [ScriptBlock]$Script ) {
    if ( $null -eq $global:DelayedRun.Timer ) { $global:DelayedRun.Initalizer.Invoke() }
    if( $global:DelayedRun.Tasks.ContainsKey($Title) ) { return }

    (1..10).foreach{    
        if ( $global:DelayedRun.Mutex ) { Start-Sleep -Milliseconds 100 }
    }
    $global:DelayedRun.Mutex = $true
    $global:DelayedRun.Tasks[$Title] = @{
        title =     $Title
        step =      $Step
        script =    $Script
    }
    $global:DelayedRun.Mutex = $false
 }
function Clear-DelayRun() {
    if ( $null -eq $global:DelayedRun.Timer ) { $global:DelayedRun.Initalizer.Invoke() }

    if ( $global:DelayedRun.Mutex -eq $false ) {
        $global:DelayedRun.Mutex = $true
        $global:DelayedRun.Tasks.Keys.foreach{ $global:DelayedRun.Tasks[$_].script.Invoke() }
        $global:DelayedRun.Tasks.Clear()
    }
    $global:DelayedRun.Mutex = $false
}
#endregion'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''

#region Get-Next(Dir,Enum,Default,Separator)
function Get-Next {
    #:::
    #::: '3' | Get-Next Dsc -Enum '1|2|3|4'
    #:::
    Param( $Dir = 'Asc', $Enum = '', $Default = '', $Separator = '|' )
    $orders = @(
        'True|False',
        'true|false',
        'On|Off',
        'Visible|Collapsed',
        'Asc|Dsc',
        'Ascending|Descending',
        'Sun|Mon|Tue|Wed|Thu|Fri|Sat',
        'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec',
        'Left|Right',
        'Up|Down'
    )
    if( $Enum -ne '' ){ $orders = @( $Enum ) }

    $stay =     [string]$input
    $target =   $stay -replace '.*\|', ''

    try{
        $order =    $orders.where{ $_.IndexOf( $target ) -ne -1 }[0].split($Separator)
        $pos =      $order.IndexOf( $target )
        switch -regex ( $Dir ){
            '(Asc|next)' { $pos = ( $pos + 1 ) % $order.count }
            '(Dsc|prev)' { $pos = ( $pos + $order.count - 1 ) % $order.count }
            default { return $stay  }
        }
        $order[$pos]
    }
    catch{ $Default }
}

#endregion

#region SendUrl-ToBrowser(url)/ SendPath-ToExplorer(path)
function SendUrl-ToBrowser( $url ) {
    Start-Process "microsoft-edge:$url"
    return $true
}
function SendPath-ToExplorer( $path, [switch]$Select ){
    if((Test-Path -Path $path)){
        if( $Select ){
            Start-Process "explorer.exe" "/select,`"$path`""
        }
        else{
            Start-Process "explorer.exe" "`"$path`""
        }    
    }else{
        Show-ErrorDialog "$path は存在しません"
    }
    return $true
}
#endregion

#region Merge-Hashtables
function Merge-Hashtables { # $merged = Merge-Hashtables hash1,hash2,hash3
    param (
        [hashtable[]]$Hashtables
    )

    $Output = @{}
    foreach ($Hashtable in $Hashtables) {
        foreach ($Key in $Hashtable.Keys) {
            if( $null -eq $Output[$Key] ){
                $Output[$Key] = $Hashtable[$Key]
            }elseif( $Output[$Key] -is [hashtable] ){
                $Output[$Key] = ( Merge-Hashtables @($Output[$Key], $Hashtable[$Key]) ) # 先入れ優先
            }
        }
    }
    return $Output
}
# $ht1 = @{a = 1; b = 4; c = @{aa=1; bb=2}}
# $ht2 = @{b = 2; d = 5; c = @{bb=4; aa=3; ff=5}}
# $ht3 = @{e = 6}

# $merged = Merge-Hashtables $ht1, $ht2, $ht3
# $merged
#endregion


