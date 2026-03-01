

#000000 行頭進捗管理 ↓一覧
#000000 09:済・解決、01:問題点
#000000 03:やること、04:後回し
#000000 07:大方針、08:参考・リンク、
#000000 25mmdd:今やっているところ
#020000 問題点
#030000 やること
#040000 後回し
#090000 大方針
#080000 参考・リンク

# ■ すぐなおす
# 250509 $e.Handled = について気を付ける
# 250508 キーボードフォーカスと、KeyTable（フォーカス）の制御が一致していない
# 250508 EditorとKeywordは別のキー制御系にして、共通のTextをなくす。
# 250508 フォントサイズ変更
# 250508 TTStatusのDefault値はまとめてApplyしているが、TTStatusに反映されていない。 ？


# 040519 下からカーソルを上げて1行目に達した後にもう一度カーソルを上げようとすると半行ずれる


# ■ 方針
#::: きれいにすること（以下）は後でもよい

#::: 楽しい実装も重要



# ■ 思いつき
# 250428 OutlookBackupに移動するコマンド
# 250428 KeywordとEditorは共通に設定しないようにして、
# 030331 Tableは縞模様にしたい

# ■ 心構え
#090416 旧Outlookはもうすぐ終わる




#region namespace
#########################################################################################################################
using namespace System
using namespace System.Windows
using namespace System.Windows.Controls
using namespace System.Windows.Markup
using namespace System.Windows.Input
using namespace System.Windows.Media.TextFormatting
using namespace System.Xml
using namespace System.Diagnostics
using namespace System.Drawing
using namespace System.ComponentModel
using namespace System.Text.RegularExpressions
using namespace System.Collections.Generic
using namespace ICSharpCode.AvalonEdit
using namespace ICSharpCode.AvalonEdit.Document
using namespace ICSharpCode.AvalonEdit.Folding
using namespace ICSharpCode.AvalonEdit.Rendering

#endregion###############################################################################################################

Add-Type -AssemblyName PresentationFramework, System.Windows.Forms, System.Drawing, System.Xml.ReaderWriter, System.Text.RegularExpressions, System.Web, System.Collections

$global:RootPath =      $PSScriptRoot
$global:ScriptPath =    "$global:RootPath\script"
$global:MemoPath =      "$global:RootPath\..\Memo"
$global:CachePath =     "$global:MemoPath\..\Memo\cache"
$global:BackupPath =    "$global:MemoPath\..\Memo\backup"
$global:PhotoPath =     "$global:RootPath\..\Photo"
$global:LinkPath =      "$global:RootPath\..\Link"


if( !(Test-Path "$PSCommandPath.lnk") ){ #::: ショートカットの作成
    $WshShell = New-Object -comObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut( "$PSCommandPath.lnk" )
    $Shortcut.TargetPath =      "$PSHOME\powershell.exe"
    $Shortcut.Arguments =       "-ExecutionPolicy Bypass -File $PSCommandPath"
    $Shortcut.WorkingDirectory = $global:RootPath
    $Shortcut.IconLocation =    "$PSHOME\powershell.exe,0"
    $Shortcut.Save()
    return
}

. "$($global:ScriptPath)\Tool.ps1"
. "$($global:ScriptPath)\SetupEnvironment.ps1"
. "$($global:ScriptPath)\TTPanel.ps1"
. "$($global:ScriptPath)\TTApplication.ps1"
. "$($global:ScriptPath)\TTModel.ps1"
. "$($global:ScriptPath)\Control.ps1"


Start-TTLapTime 'thinktank'

Start-TTLapTime 'var'
$global:Application =   [TTApplication]::New()  #::: Viewに関わるプロパティ変数の生成・登録
$global:Models =        [TTModels]::New()       #::: Modelsと子Collectionの生成・登録
$global:Controller =    [TTController]::New()   #::: なし
Show-TTLapTime 'var' 'グローバル変数生成完了'

Start-TTLapTime 'setup'
$global:Models.Setup()                          #::: 自分を含む各Collectionの、1)Default設定値読込、2)キャッシュされた設定値読込、3)ユーザー設定値読込
$global:Controller.Setup()                      #::: 1)WPFイベントの設定、2)Control*読込、(Add-TTControlMenu → Add-TTAction)
$global:Application.Setup()                     #::: 1)キーテーブル設定、(Key-Action)
Show-TTLapTime 'setup' 'グローバル変数セットアップ完了'


$Global:Application.Show()
# $Window_ContentRendered内
# 　Apply-TTState All                           #::: 全 TTStateのWatchスクリプトの実行
# 　Apply-TTState Application.Focus.Panel 'Desk'

Show-TTLapTime 'thinktank' 'thinktank使用時間'





