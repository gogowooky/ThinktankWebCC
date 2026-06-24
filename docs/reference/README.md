# ThinktankPS4


# 参考
## 参考リンク
### 240620

* [サイバー少年][18]

[WPF] KeyDownイベントとPreviewKeyDownイベントの違い

ですから、全てのキー押下イベントをキャッチしたい場合は、一番の親であるWindowのPreviewKeyDownイベントに処理を書いて、キャンセルされたりアクセスキーとしての使用を全くされずに、未使用の状態となったキー押下のみをキャッチしたい場合は、これも一番の親であるWindowの、今度はKeyDownイベントに処理を書けばいいということですね。

[18]:http://cyberboy6.blog.fc2.com/blog-entry-364.html
### 240611

* [第4文型(SVOO)とは][17]

target panelを使った指示：　give me(current panel) item(target panel) がルール

current panelからの指示：　send item(current panel) to panel()

わかりにくいなぁ、これ便利になるかなぁ、

いや大丈夫な気がしてきた。

TargetPanel.PassMe.Pointed

TargetPanel.FocusTo.Target

[17]:https://manabitimes.jp/english/2080
### 240610 

* [正規表現言語 - クイック リファレンス][16]
* [正規表現で日本語が入るようにする方法][13]
* [正規表現のマッチングをどこからでも―「境界アサーション」と「ルックアラウンドアサーション」][14]
* [とほほの正規表現入門][15]

[13]:https://arc-tech.hatenablog.com/entry/2021/01/20/105620
[14]:https://atmarkit.itmedia.co.jp/ait/articles/2207/15/news002.html
[15]:https://www.tohoho-web.com/ex/regexp.html#lookaround_assertion
[16]:https://learn.microsoft.com/ja-jp/dotnet/standard/base-types/regular-expression-language-quick-reference
### 240609
* [WPF で Enter を押したとき次のコントロールにフォーカスを移動する][12]

``` .cs
comboBox.KeyDown += delegate (object sender, KeyEventArgs e)
{
    if (e.Key == Key.Enter)
    {
        KeyEventArgs e1 = new KeyEventArgs(
            e.KeyboardDevice,
            e.InputSource,
            e.Timestamp,
            Key.Tab);
        e1.RoutedEvent = Keyboard.KeyDownEvent;
        InputManager.Current.ProcessInput(e1);
    }
}
```

という風に、Tab キーを押したことにすればいい。

[12]:https://tnakamura.hatenablog.com/entry/20081010/1225071643


### 240531
* [CollectionViewSourceをバインディングする際の注意点][11]


[11]:http://nineworks2.blog.fc2.com/blog-entry-76.html

### 240317-1416

* [PowerShellでWPFを使う][10]
1. 最初の表示/xamlファイル/コントロールの取得/イベント
2. データバインドも普通にできます。 PSCustomObjectも普通に使えます。

``` .xaml
<Window>
    <StackPanel>
        <TextBlock>姓</TextBlock>
        <TextBlock Text="{Binding LastName}" />
        <TextBlock>名</TextBlock>
        <TextBlock Text="{Binding FirstName}" />
    </StackPanel>
</Window>
```
``` .ps1
$window.DataContext = [PSCustomObject]@{
    FirstName = "太郎";
    LastName = "佐藤"
}
```

3. PowerShellのクラスを使ってもバインドできます。

``` .ps1
class PSClass
{
    [string]$FirstName
    [string]$LastName
}

$obj = New-Object PSClass
$obj.FirstName = "太郎"
$obj.LastName = "佐藤"

$window.DataContext = $obj
```
4. INotifyPropertyChanged
5. INotifyCollectionChanged
6. C#でのクラス定義


[10]:https://qiita.com/HrmsTrsmgs/items/1eca0516bd8c690872dc

### 240225-2059

* [PowerShellで躓いた点をまとめてみた。][9]

[9]:https://qiita.com/mgsk_2/items/3f63b871ea475de2609f

### 240220-1255

* [XPATHの記法まとめ][8]

[240220] XamlのNameをそのままTTApplicationにAdd-Memberしてしまう。

[8]:https://qiita.com/rllllho/items/cb1187cec0fb17fc650a

### 240212-0721

* [鷲ノ巣:Add-Member を極める][7]

[7]:https://tech.blog.aerie.jp/entry/2013/12/23/173004

* [WPF 依存関係プロパティを持ったカスタムコントロールの作り方][6]

[240212] UserControlにカスタムコントロールを設定する

* [CODE PROJECT:Wpf usercontrol in powershell][5]

[240212] PowershellでUserControlを使う

[6]:https://shikaku-sh.hatenablog.com/entry/how-to-make-customcontrol-with-dependencyproperty

[5]:https://www.codeproject.com/Questions/1117205/Wpf-usercontrol-in-powershell




### 240209-0028
* [WPF - 独自コントロールに独自イベント][4]

[240209-0029] MouseLeftButtonDownのbindingとかもxaml中に書いていいみたい。
そうすれば [ここ][3]に書いてあるように、xamlで構造とevent binding定義して、csでevent定義して、ps中で windowに add_childすれば、TTPanelでいけそうだね。

[4]:https://blog.basyura.org/entry/2016/03/19/235427




### 240126-1700

* [PowershellでLINQを使う][1]

* [PowerShell+XAMLでDLLを使わずにC#コードに直接イベントハンドラーを連携させる][3]
1. Window 作成後にイベントハンドラーを後から登録する方法
2. [DLL を使ったイベントハンドラーの連携の紹介][2]
> つまりイベントハンドラがたくさんあるような本格的なGUIを、PowerShellから構築することは考えないほうがいいでしょう。

> ロジックをC#でテンプレートにして、PowerShellではXAMLを書いて連携することにより、
> PowerShell上でイベントハンドラの登録に苦労することなく、自由度の高いビューを作成できるという記事でした。

3. [DLL を使用しないイベントハンドラーの連携][3] 👈 ここよめ

[240202-1221] 理解> 参照先は、汎用的なイベントはcs側に書いておけるよ、という記事。　汎用的なコントロールをcsで作れるのか？まで妄想してしまったが、そこまでは書いてないし、できないっぽい。




[3]:https://qiita.com/tkmry/items/f03f774d1969c8b46373
[2]:http://cyberboy6.blog.fc2.com/blog-entry-445.html
[1]:https://www.red-gate.com/simple-talk/sysadmin/powershell/high-performance-powershell-linq/#post-71022-_Toc482783714

## 履歴
### 考えすぎない
1. コンセプトの実装を優先する
2. できるだけPowerShellコマンドを使う
3. フォルダアクセスコマンド

### 追加点・変更点 TBC

### 問題点
課題：　Editorコントロール用文字と、　Tableコントロール用文字を、同じコントロールに表示するか？
- 現状認識：　表示用コントロールの名前が「Keyword」であり、Editor用・Table用に分けられていない
- 現状認識：　Editorコントロール用文字、Tableコントロール用文字、がStatusに設定されていない
- 現状認識：　名前が共有されている
　Editorコントロール用文字のStatus名：Selector
　Tableコントロール用文字のStatus名：Keyword
　文字表示用コントロール：Keyword
- 表示する場合
  



### TBD
- HomePanel

### 確立したい重要な仕様

#### TTEvents:  目的：キーレスポンス改善、　手段：３段ハッシュを併用
UI入力判定時（Invoke-TTEvent）に 指定 $target 順に処理する
　>> $target
　↓ [ExModMode]::Name                     * [ExModMdoe]::Panel()ではない
　↓ 'ExPanel'
　↓ 'Application'
　↓ 'Panel'                               * 現時点でPanel名での分岐は設定していない[240912]
　↓ FocusPanel()の FocusTool()で分岐
　　→ 'Keyword': 'Keyword' 'Text' 'Table'
　　→ 'Editor': 'Editor' 'Text'
　　→ 'Table': 'Table'

キー：　Add-TTEvent  ExApp          'Alt'           Z               Application.Style.Zen
Menu：　Add-TTEvent　登録先         'TTStatus'      'item1> item2> item3'            Command

AddMenu-TTEvent   ApplicationMenu   '表示> _D)フォント> _U)Size Up'        Application.FontSize.Up
AddMenu-TTEvent   ApplicationMenu   '表示> _D)フォント> _D)Size Down'      Application.FontSize.Down
AddMenu-TTEvent   ApplicationMenu   '表示> _C)スクリーン> _N)次に移動'      Application.Window.ScreenNext     { 1 -lt $Global:Application.Screen.Number }
AddMenu-TTEvent   ApplicationMenu   '表示> _C)スクリーン> _P)前に移動'      Application.Window.ScreenPrev     { 1 -lt $Global:Application.Screen.Number }

AddMenu-TTEvent   UrlActionMenu     'Default Action'                    Url.Action.Default
AddMenu-TTEvent   UrlActionMenu     '_1. ブラウザで表示'                Url.Send.ToBrowser
AddMenu-TTEvent   UrlActionMenu     '_2. エクスプローラで表示'          Url.Send.ToExplorer
AddMenu-TTEvent   UrlActionMenu     '_3. 文字をコピー'                  Url.Copy.It
AddMenu-TTEvent   UrlActionMenu     '_4. ショートカットをコピー'            Url.ShortCut.ToClipboard

ApplicationMenu
ApplicationContextMenu
PanelContextMenu
LibraryContextMenu
ActionTextContextMenu
#### TTStatus：　目的：使用状態の保存・再生、　応用：Textアクション化
　Application.*.*
　Library.*.*
　Index.*.*
　Shelf.*.*
　Desk.*.*
　System.*.*
### 予定
【実装２】Editor/HighlightとTable/Filter
【実装３】個別Memoにkeyword property, 個別collectionに(name).(panelname).filterと(name)****.(panelname).sort 
【機能】txtのEditor D&Dで、文字挿入
【機能】Memo内の チェック項目、スケジュール有無、GTD項目のTableへの表示、
【Table】TopLeftCellのStyle
【ExMod】入力モード:　Src: Editor,  Dst:ExMode:Panelの選択　にしたら？
【Editor】カーソルが画面から外れる
【Editor】編集履歴
【Editor】全文検索
【Editor】「閉じる」で前の文書に戻る機能
【Application】StyleをPanelサイズだけでなく、Panel.Toolも変更
【Panel】Cabinet
【Menu】TTPanel.($Tool).ContextMenu という使い方をしているので。

#### 改良予定なし
Keyword, Model
### Actionの対象に関係する「状態」
実体Application
    状態:TargetPanel x { Library, Index, Shelf, Desk, System }
    状態:ExModMode x { Library, Index, Shelf, Desk, System, App }
    実体:Menu
    実体:Panel x { Library, Index, Shelf, Desk, System }
        状態:Focus ( Application.Focus.Panel )
        状態:Mode x { Editor, Table }
        状態:FocusTool x { Keyword, Editor, Table }
        実体:Title
        実体:Keyword
        実体:Editor
        実体:Table
### 250124 実装済み
【実装１】EditorKeywordとTableKeywordを分ける: EditorとTableとWebViewに分け、各パネル専用のKeywordを設置
【Table】ExModでAlt+数字でファイル選択
WheelPlus/WheelMinus　
Mail.Action.Default他　＋　PasteOutlookMail.Action.Default他　
Add-TTControlMenu:    １メニュー登録と、複数サブメニュー登録の２パターンでメニュー構成できるようにした
TTPanel.Table:  RowTitle→行番号
TTActions:      UIアクション、Textアクションを同じ構造で管理 { Param($panel,$psobj) ... }
TTState:        Default値設定　→Library, Index, Shelfの初期ToolがTable→Editorになっているの解決
Application:    Styleを設定,BorderをStatusについて
ContextMenu:    カーソル/マウス位置毎の表示位置調整＋候補Actionの仕組み
Editor: 6. TextChange後文書区切り位置の更新 (都度更新では遅いのでタイマー)
Editor: 2. キーマップ
Editor: 1. 変更後保存 : 遅いので停止中
Editor: 6. フォントサイズ
Table:  2. Keyword入力毎にFilterしないようにする
#### 実装済み：　メニューの制御方法を(ある程度)統一化

##### ２通りのアイテム登録方法
1.Add-TTControlMenu　MenuTag　'submenu1> submenu2> action'　ActionID
　　actionで開くのはアクション：　Actions.GetItem(ActionID)._script　はアクション

2.Add-TTControlMenu　MenuTag　'submenu1> submenu2> action'　ActionID(*.submenu.*)
　　actionで開くのはサブメニュー：　Actions.GetItem(ActionID)._script　はサブメニュー定義
##### ■ Windowメニュー
　メニュー登録：　[event:Window_ContentRendered]                            ControlStatus.ps1
　　　　　　　　　→ { Action.BuildMenu(Taret,Menu,Panel,Tag) } 
##### ■ Panel ポップアップメニュー　
　メニュー登録１：イベントに直接記載
　メニュー起動１：コンテキストメニューイベント
　　　　　　　　　[event:UserControl_ContextMenuOpening]                    ControlAction.ps1
　　　　　　　　　→ { Invoke-TTAction [PanPanel.Open.ContextMenu] }
　　　　　　　　　ShowMenu({})                                              DefaultActions.ps1
　　　　　　　　　→ { Action.BuildMenu('Panel',$menu,$panel,$Tage) }
　メニュー登録２：Add-TTEvent (^+SPC, Right1)                         DefaultEvents.ps1
　　　　　　　　　→ { [(panel).Popup.Menu] }
　　　　　　　　　→ { Action.BuildMenu(Panel,$menu,$panel,$Tage) }
　メニュー起動２：[event:Editor_KeyDown],[event:Editor_MouseButtonDown]     ControlAction.ps1
　　　　　　　　　→ { Invoke-TTEventKey/Mouse }                             Models.ps1
　　　　　　　　　→ $action._script.Invoke [(panel).Popup.Menu]
　　　　　　　　　→ { Invoke-TTAction [PanPanel.Open.ContextMenu] }
　　　　　　　　　ShowMenu({})                                              DefaultActions.ps1
　　　　　　　　　→ { Action.BuildMenu(Panel,$menu,$panel,$Tage) }
##### ■ Editor TextActor
　メニュー登録：　Add-TTEvent (^+SPC, Right1)                         DefaultEvents.ps1
　　　　　　　　　→ { [(panel).Popup.Menu] }
　　　　　　　　　→ { Action.BuildMenu(Panel,$menu,$panel,$Tage) }
　メニュー起動：　[event:Editor_KeyDown],[event:Editor_MouseButtonDown]     ControlAction.ps1
　　　　　　　　　→ { Invoke-TTEventKey/Mouse }                             Models.ps1
　　　　　　　　　→ $action._script.Invoke [(panel).Popup.Menu]
　　　　　　　　　→ { Invoke-TTAction [PanPanel.Open.ContextMenu] }
　　　　　　　　　ShowMenu({})                                              DefaultActions.ps1
　　　　　　　　　→ { Action.BuildMenu(Panel,$menu,$panel,$Tage) }



　アイテム登録：　Add-TTControlMenu                                       DefaultEvents.ps1 (Panel.SubMenu.*)
　　　　　　　　　
　表示：　Key: Invoke-TTEventKey
　　　　　Mouse: Invoke-TTEventMouse
　　→ ◆ Editor.Actor.Invoke (DefaultActions.ps)
　　　→ ◇ Action.BuildMenu(Taret,Menu,Panel,Tag) (ControlAction.ps1) 
　　　→ 🔶 ShowMenuで表示 (TTPanel.ps1) 
##### ■ Editor Paste
　アイテム登録：　Add-TTControlMenuで登録
　表示：　Key: Invoke-TTEventKey
　　　　　Mouse: Invoke-TTEventMouse
　　→ ◆ Editor.Paste.Invoke (DefaultActions.ps)
　　　→ ◇ Action.BuildMenu(Taret,Menu,Panel,Tag) (ControlAction.ps1) 
　　　→ 🔶 ShowMenuで表示 (TTPanel.ps1) 
### 240602 KeywordでTable Filter, Editor Highlight設定、DelayedRun 成功
### 240528 マージ成功
240528-2242 Keyword欄のwordでマーキングする用のbranchと contextmenu用のbranchをマージできた。
### 240217 View表示OK版
240217-1905: TTApplicationとTTPanelで同じStyle定義ファイル使用　→色定義の統一化

240217-1840: TTApplicationとTTPanelが別のStyle定義ファイルを使っている
## 開発再開の手助けのための説明　～　開発指針,コンセプト,思い出すためにすること
### 思い出すためにすること
 thinktank.ps1 を読む

### アプリ起動シーケンス
・ New:     管理用Global変数, 変数内だけで完結
・ Setup:   Default値→ Cache読込→ thinktank.md設定
・ (WindowRendered)
・ Apply-TTState/ SetEvent-TTState

### 開発コンセプト: MVCフレームワーク
- Tool:     tool.ps1
- Model:    model.ps1
- View:     TTApplication.ps1, TTPanel.ps1 ( *.xaml, *.xhd ), ( SetupAvalonEdit.* ), ( Cabinat. ps1 )
- Control:  Control*.ps1 ( Default*.ps1 )
