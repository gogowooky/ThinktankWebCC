
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
using namespace ICSharpCode.AvalonEdit.Document
using namespace ICSharpCode.AvalonEdit.Folding
using namespace ICSharpCode.AvalonEdit.Rendering

. {
    $avalon =   [Reflection.Assembly]::LoadFile( "$($global:ScriptPath)\ICSharpCode.AvalonEdit.dll" )
    $wvcore =   [Reflection.Assembly]::LoadFile( "$($global:ScriptPath)\Microsoft.Web.WebView2.Core.dll" )
    $wvwpf =    [Reflection.Assembly]::LoadFile( "$($global:ScriptPath)\Microsoft.Web.WebView2.Wpf.dll" )

    $srcPath =  "$($global:ScriptPath)\SetupAvalonEdit.cs"
    $src =      (Get-Content $srcPath -raw)

    Add-Type -TypeDefinition $src -ReferencedAssemblies $avalon, $wvcore, $wvwpf, PresentationFramework, PresentationCore, WindowsBase, System.Xaml, System.Text.RegularExpressions, System.Xml.ReaderWriter

}