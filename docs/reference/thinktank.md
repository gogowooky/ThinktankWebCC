Thinktank タイトル
==============================================================================================
# すること：　早期入替！！
- KeywordとMainの切り替え
- 本体のキーアクション
  Targetは何か？
2025年05月08日 (木)
[-][WAIT][重][😱][x][課題][↓]

東京都特許許可局

- メニューのキーアクション
　Application用：　キー入力をメニューだけで止められない。
　Panel用：　メニューでキー入力止まっている。
　
## できていること
- メモ保存
- [Mail]タグ
送信日時	宛先	件名	サイズ	分類項目	
(火) 16:46	小川　真一	RE: 【Vault】URC_済生会中津動画_シナリオ・スライド	101 KB		


[2024-10-24-205412:Mail] [Mail:北海道]
[2024-10-24-202826:Mail]
[2024-10-24-195121:Mail]
[2024-10-24-191925:Mail]
[2024-10-10-181346:Mail] [2024-10-25-084512:Mail]

[Route:つくば,水戸,大洗]
https://www.google.com/maps/dir/%e8%8b%ab%e5%b0%8f%e7%89%a7/%e5%8d%83%e6%ad%b3/%e6%9c%ad%e5%b9%8c
[2021-12-12-113047:Mail]
[2021-12-12-094753:mail]


[2021-12-12-130739:Mail][2021-12-12-120339:Mail][2021-12-12-113047:Mail]

[:Mail][:Mail][:Mail]
[2021-12-11-132051:Mail][:Mail]差出人	件名	受信日時	サイズ	
マイブック【MyBook】	【今年中に届く！ラストクーポン】12/21まで全商品50%OFF	2021/12/11	82 KB	
[リクルートID]PR情報	【お一人様1回限り】おなかの脂肪を減らすサプリをアンケート回答後お得にお試し！	2021/12/11	9 KB	
全国ジモティーメルマガ	デジタルカメラ 0円!液晶テレビ 3,000円! など0円/格安が満載！【ジモティー】	2021/12/11	36 KB	


[Google:おばけ][CNCL][-][][CNCL][？][😠][*][待機]
差出人	件名	受信日時	サイズ	
Seeking Alpha	Wall Street Breakfast: Dodging Turbulence	20:34	111 KB	
_ttobjs
差出人	件名	受信日時	サイズ	
Seeking Alpha	Wall Street Breakfast: Dodging Turbulence	20:34	111 KB	差出人	件名	受信日時	サイズ	
Amazon.co.jp レビュー	江頭　慎一郎さん, お買い上げの「DEATH NOTE　デスノート」**は期待どおりの商品でしたか**？Amazonでレビューいただけますか？	2021/08/16	60 KB	
eared in 3 	/102	37 KB	
#region Menu Paste                                      #::: エディタPasteaメニュー
Add-TTAction    Editor.Paste.Menu                       'メニューから貼付け' {
    Param($panel,$tag)
    $panel =        [TTExModMode]::Panel()
    $datatypes =    [TTClipboard]::GetDataTypes()
****
    $panel.ShowMenu({
        Param($menu)
        $menu.Items.Clear()
        $script:datatypes.foreach{
            $tagplus =  $script:tag + @{ GetClipboard = $_.GetClipboard }
            $name =     "Paste{0}" -f $_.Name
            $global:Controller.BuildMenu( $name, $menu, $script:panel, $tagplus )
        }
    }.GetNewClosure())

    return $true
    
}
Add-TTAction    Editor.Paste.Invoke                     '貼付け' {
    Param($panel,$tag)
    $panel =        [TTExModMode]::Panel()
    $datatypes =    [TTClipboard]::GetDataTypes()

    $tagplus =  $tag + @{ GetClipboard = $datatypes[0].GetClipboard }
    $name =     "Paste{0}" -f $datatypes[0].Name
    return ( Invoke-TTAction "$name.Action.Default" $panel $tagplus )
}
Editor.Paste.Invoke
#endregion差出人	件名	受信日時	サイズ	
CAMPFIREニュースレター	【高級革キャビアスキン使用】大人気シリーズ「大人革袋」からスピンオフ作品が誕生！	21:11	72 KB	
差出人	件名	受信日時	サイズ	
CAMPFIREニュースレター	【高級革キャビアスキン使用】大人気シリーズ「大人革袋」からスピンオフ作品が誕生！	21:11	72 KB	
差出人	件名	受信日時	サイズ	
CAMPFIREニュースレター	【高級革キャビアスキン使用】大人気シリーズ「大人革袋」からスピンオフ作品が誕生！	21:11	72 KB	
2024年10月18日 (EGASHIRA]
[Set:Application.Style.ug]
[Set:Application.Style.Name:All]
[2024-09-04] 2024年09月08日 11:55
[Route:苫小牧]
[Route:苫小牧,千歳,札幌]
    /test/t es 
・sds d
昭和45年3月11日
2000/10/10

## 問題 すること
Work画面単一時にAlt-Wがおかしい　フォーカスが設定されてない？


## [↓] テスト   
[2022-04-25] 
昭和14年10月12日
2020年10月11日
; 2020/10/12 22:01:36

差出人	件名	受信日時	サイズ	
info@hondago.jp	【必見！】HondaGO会員だけのサービスをご案内いたします！	(火) 19:26	39 KB	
https://ja.stackoverflow.com/questions/tagged/非同期?tab=Unanswered

## Edgeのショートカット
Ctrl + G
Strl, Shift + G
Ctrl + H
Alr + R/L

## メモ
### BG実行について
　https://learn.microsoft.com/ja-jp/powershell/module/microsoft.powershell.core/about/about_thread_jobs?view=powershell-7.3
　Start-ThreadJobはPS6から使える。プロセス内で実行される、参照が使える。
　ForEach-Object -Parallel -AsJobはPS7から使える。
　⇒ 将来PS6/7がdefaultになったときに高速化しよう。　今はsingle threadで頑張る。

### new/initialize
　newでReadyToGoにして、initializeでDefault設定する、

### timer
　いまは多重起動防止目的で使われている。　別の方法がないか？

　TTCollectionのCacheは最後の変更が保存されれば、保存タイミングは問わない。
　TTObjectのResourcesは変更タイミングで保存(Memo,Editing)
　TTObjectのSearchResultsは変更と閲覧のタイミングで保存（）

### TTResultsをつくるべきか
　　KeywordSearch
　　WebLinks

### MenuはFilter Keyword式にする　

## 技術アイデア
###  RunSpacePool：　非同期実行
　https://developers.gmo.jp/1964/
　実行空間？　ホストアプリケーション？

###  並列稼働　
　https://blog.yamk.net/posts/20200725-ps1backgroundjob/
　Start-Job で Job開始
　Receive-Job で Job結果取得
　Remove-Job で Job後かたずけ
　Wait-Job で Job終了を待つ
 
# Thinktank Manual
## アプリの目的
　テキストベースでメモをとる。
　情報同士のリンク、外部サイトやファイル、メールとのリンクできます。

## Outlookでリンクしたメールを保存するフォルダの作り方
### Outlook2021
メニュー > ホーム > 新しいメール > その他のアイテム > Outlookデータファイル


## ショートカットキー (%:Alt,^:Ctrl,+:Shift,-:none,)
### Application
%   L/I/S/D/@       Panel ExModMode
%   A               App ExModMode

### ExModMode App
%   A               App Menu On/Off
%                   Panel Style
%                   Window State
%                   Window Size

### ExModMode Panel                         Editor      Table       WebView
%   L/I/S/D/@       Focus
%   P/N             MoveTo Nxt/Prv          Actor       Item        Link
%+  P/N             MoveTo 1st/Lst          Actor       Item        Link
%   Space           Invoke                  Actor       Item        Link
%+  Space           Menu Invoke             Actor       Item        Link
%   M               Focus+Panel Menu
%   C               Clear Keyword
%   F               FocusTo Keyword                 

### Panel

### Keyword                                 EditorKeyword   TableKeyword    WebViewKeyword
^   P/N             MoveTo Nxt/Prn          Keyword         Item            Link
^+  P/N             MoveTo 1st/Lst          Keyword         Item            Link
^   Space           SelectAt
^+  Space           Menu SelectAt
%   M               Menu Panel
%   C               Clear Keyword
%   F               FocusTo Main


### Editor
%   P/N             MoveTo Nxt/Prv Actor
%+  P/N             MoveTo 1st/Lst Actor
%   Space           Invoke Actor
%+  Space           Menu Actor
%   M               Menu Panel
%   C               Clear Keyword
%   F               FocusTo Keyword                 

%   ↑/↓             MoveTo Nxt/Prv Sibling Section
%+  ↑/↓             MoveTo 1st/Lst Sibling Section
^%+ ↑/↓             SelectTo Section End
%   ←/→             Opn/Cls Current Section
%+  ←/→             Opn/Cls Family Sections
^%+ ←/→             Opn/Cls All Sections
^   I               Add/Level Dn Section
^+  I               Del/Level Up Section

^   Space           SelectAt
^+  Space           Menu SelectAt

^   A               MoveTo Line Start/Doc Start
^   E               MoveTo Line End/Doc End
^+  A               SelectTo Line Start
^+  E               SelectTo Line End

-   ↑/↓             MoveTo Nxt/Prn Line
+   ↑/↓             SelectTo Nxt/Prn Line
^   P/N             MoveTo Nxt/Prn Line
^+  P/N             SelectTo Nxt/Prn Line

-   ←/→             MoveTo Lft/Rht Char
+   ←/→             SelectTo Lft/Rht Char
^   ←/→             MoveTo Lft/Rht Word
^+  ←/→             SelectTo Lft/Rht Word



### Table
%   P/N             MoveTo Nxt/Prv Item
%+  P/N             MoveTo 1st/Lst Item
%   Space           Invoke Item
%+  Space           Menu Item
%   M               Menu Panel
%   C               Clear Keyword
%   F               FocusTo Keyword                 

### WebView
%   P/N             MoveTo Nxt/Prv Link
%+  P/N             MoveTo 1st/Lst Link
%   Space           Invoke Link
%+  Space           Menu Link
%   M               Menu Panel
%   C               Clear Keyword
%   F               FocusTo Keyword



### 過去
### 共通
None			Escape				アプリケーションを終了
Alt,(Shift)		S/L/I/C				Shelf/Library/Index/Cabinetに一時フォーカス→フォーカス（表示切替）
Alt,(Shift)		W					Workspaceにフォーカス、その後Work123を切替（同）
Alt,(Shift)		Z					Desk内（Window内）ZENモード
Alt,(Shift)		W					Workspaceにフォーカス、その後Work123を切替（同）
Alt,(Shift)		Z					Desk内（Window内）ZENモード
Alt,(Shift)		D					Desk/Workplaceを交互に（Deskに）フォーカス
Alt				D1/D2/D3			Work1/Work2/Work3へフォーカス      

### Shelf/Library/Indexパネル ### 一時フォーカス
Alt,(Shift)P/N					上/下（先頭/末尾）にカーソルを移動
Alt				Up/Down/Left/Right	上/下/左/右の境界を移動
Alt,(Shift)		Space				選択アイテムを実行（選択＋実行）
Alt				D0					表示データを更新 
Alt				K					フィルターをクリア
### 通常フォーカス
None,(Shift)	Up/Down				上/下（先頭/末尾）にカーソルを移動
None,(Shift)	F1-F6				第１～６カラムで降順（昇順）ソート
None,(Shift)	Return				選択アイテムを実行（選択＋実行）


### Deskパネル（Deskキーワード部）
Alt				N					Workspaceにフォーカス
None			Down				Workspaceにフォーカス
Alt				Up/Down				上/下にDesk内境界を移動
Alt				Left/Right			左/右にDesk内境界を移動
Alt				K					キーワードをクリア
           [2222-22-22-222222:memo]
[memo:2222-22-22-22222]
[Google:sdsdsds] 

### Editorパネル
Alt				Up/Down				前/次のセクションにカーソルを移動
Alt				Left/Right			セクションを折畳/展開
Alt				P/N					前/次のキーワード（セクション）にカーソルを移動
Alt				B/F					セクションを折畳/展開
Control			P/N					前行/次行へカーソルを移動
Control			B/F					左/右へカーソルを移動
Control			A/E					行頭・文頭/行末・文末へカーソルを移動
Control			K					カーソル位置から行末までを削除
Control			S					メモを強制保存
Alt/Control		Space				タグを実行
Control,(Shift)	Back				前履歴/次履歴のファイルを開く
Alt				T					カーソル位置に日付タグを挿入
Alt				V					カーソル位置にクリップボードの内容を挿入
Control, Shift	P/N					前行/次行へカーソルをスクロール
None			PageUp/Next			前行/次行へカーソルをスクロール
None			BrowserBack			前行へカーソルをスクロール
None			BrowserForward		次行へカーソルをスクロール
None			Return			ttcmd_editor_move_tonewline
Shift			Return				ttcmd_editor_scroll_tonewline
Control			H					ttcmd_editor_edit_backspace
Control			G					ttcmd_editor_load_new
Control			D					ttcmd_editor_edit_delete
Control,(Shift) I                   セクション階層の変更
Control,(Shift) ;(OemPlus)          カーソル行のアイテムヘッダーを変更する






## 機能

## パネル
### ライブラリーパネル

### インデックスパネル

### シェルフパネル

### デスクパネル

#### ワーク１パネル、ワーク２パネル、ワーク３パネル

#### ツール：エディタ

#### ツール：ブラウザ

#### ツール：グリッド

### キャビネットパネル

### パネル内パーツ
#### テキストボックスddsdsdsd

#### データグリッド

#### メニュー
 
#### ボーダー
 

  

## アクショ ン
### アイテム
#### キーボード（Alt+Space）
#### マウス（double click）

### タグ
#### キーボード（Alt+Space）
#### マウス（double click）


### メニュー
#### キーボード（select）
#### マウス（select）


## アイテム

## タグ (TTActionText用関数(ttact_*)で処理) [thinktank-model-action.ps1]
### Check       "(\[[ox_]\])"
[o][x][_]			Control Spaceでトグル

- ttact_check_toggle

### Url         "((https?://[^　 \[\],;<>\`"\']+)|(`"https?://[^\[\],;<>\`"\']+)`")"

- ttact_url_open
- ttact_url_openparent
- ttact_url_browse
- ttact_url_copy
- ttact_url_copyshortcut

### Path        "(([a-zA-Z]:\\[\w\\\-\.]*|`"[a-zA-Z]:\\[\w\\\-\.].*`")|(\\\\[\w\\\-\.]*|`"\\\\[\w\\\-\.].*`"))"

- ttact_path_open
- ttact_path_select
- ttact_path_copy
- ttact_path_copyfile
- ttact_path_copyshortcut
[memo:2015-03-09-133514]

### Panel       "\[(?<tag>library|index|shelf|desk|cabinet):(?<param>[^\[\]]+)\]"
[library:cccccc]                    library の キーワードに cccccc をセット (フィルター)
[index:cccccc]                      index の キーワードに cccccc をセット (フィルター)
[shelf:cccccc]                      shelf の キーワードに cccccc をセット (フィルター)
[desk:cccccc]                       desk の キーワードに cccccc をセット (フィルター)
[cabinet:cccccc]                    cabinet の キーワードに cccccc をセット (フィルター)
[desk:cccccc]                       deskの キーワードに cccccc をセット (ハイライト)
[index:memos:cccccc]                indexに memosコレクションをセットし、キーワードに cccccc をセット
[shelf:memos:cccccc]                shelfに memosコレクションをセットし、キーワードに cccccc をセット
[cabinet:memos:cccccc]              cabinetに memosコレクションをセットし、キーワードに cccccc をセット

- ttact_panel_tag

### Reference   "\[(?<tag>ref):(?<param>[^\[\]]+)\]"
[ref:nnn]                           行番号nnnへ移動
[ref:cccccc]                        文字列ccccccへ移動（Editor別検索文字列に設定）
[ref:Aa:cccccc]                     文字列ccccccへ移動（Editor別検索文字列に設定; 大文字小文字区別検索設定）
[ref:Re:cccccc]                     文字列ccccccへ移動（Editor別検索文字列に設定; 正規表現検索設定）
[ref:#cccccc]                       ノードccccccへ移動
[ref::cccccc]                       行頭に:ccccccがある行へ移動

注： 正規表現キーワード内で括弧文字はコードで記載する　⇒　[ '\x5b', ] '\x5d'

- ttact_reference_tag
### Date
#### DateTag     "(\[(?<year>[0-9]{4})\-(?<month>[0-9]{2})\-(?<day>[0-9]{2})\](( (?<hour>[0-9]{2}):(?<min>[0-9]{2}))|(?<wd>\(...\)))?[ 　]*)"
- ttact_date_tag

#### Date        "((?<year>[0-9]{4})\/(?<month>[0-9]{1,2})\/(?<day>[0-9]{1,2})(( (?<hour>[0-9]{2}):(?<min>[0-9]{2}))|(?<wd>\(...\)))?[ 　]*)"
- ttact_date_tag

#### DateJ       "((?<gengo>明治|大正|昭和|平成|令和)(?<nen>[0-9]{1,2})年(?<month>[0-9]{1,2})月(?<day>[0-9]{1,2})日((( (?<hour>[0-9]{2})時(?<min>[0-9]{2})分)|(?<wd>（.）)))?[ 　]*)"
- ttact_date_tag

#### DateN       "((?<year>[0-9]{4})年(?<month>[0-9]{1,2})月(?<day>[0-9]{1,2})日((( (?<hour>[0-9]{2})時(?<min>[0-9]{2})分)|(?<wd>（.）)))?[ 　]*)"
- ttact_date_tag

### Mail
[mail:nnnn-nn-nn-nnnnnn]			'OutlookBackupFolder'に保存されているnnnn-nn-nn-nnnnnnであるメールを開く
[mail:ccccc]						Outlookに保存されているメールで文字列ccccccを検索

- ttact_mail_open

### Memo
[memo:nnnn-nn-nn-nnnnnn]            Editorで表示
[memo:nnnn-nn-nn-nnnnnn:nnn]        Editorで表示後、nnn行へカーソル移動
[memo:nnnn-nn-nn-nnnnnn:cccccc]     Editorで表示後、ccccccをKeyword設定
[memo:nnnn-nn-nn-nnnnnn:#cccccc]    Editorで表示後、セクション行からccccccを検索
[memo:nnnn-nn-nn-nnnnnn::cccccc]    Editorで表示後、:ccccccを検索

[memo:cccccc]                       cccccをkeywordに全文検索
[memo:#cccccc]                      #+ .*ccccc.*で全文検索

[memo:DropBoxName:nnnn-nn-nn-nnnnnn]

### Photo
#### タグ：1枚表示
[photo:nnnn-nn-nn-nnnnnn]
[photo:nnnn-nn-nn-nnnnnn-nnn]

#### タグ：複数枚表示
[photo:nnnn-nn-nn-nnnnnn:xxx]
[photo:nnnn-nn-nn]
[photo:nnnn-nn-nn:xxx]
[photo:nnnn-nn]
[photo:nnnn-nn:xxx]
[photo:nnnn]
[photo:nnnn:xxx]
[photo:nn-nn]
[photo:nn-nn:xxx]

#### アルバム内文字検索
[photo:cccccc]

#### Folder
・[PhotoFolder]
　閲覧時：最初に[PhotoFolder]を参照し、失敗時に[LocalPhotoFolder]を参照する。
　DD時：最初に[PhotoFolder]へ保存し、失敗時に[LocalPhotoFolder]へ保存する。

・[LocalPhotoFolder]
　閲覧時：[LocalPhotoFolder]を参照し、失敗時に[LocalPhotoCache]を参照する。
　DD時：[LocalPhotoFolder]へ保存する。

・[LocalPhotoCache]
　閲覧時：[LocalPhotoCache]を参照し、失敗時にはエラー表示する。
　DD時：[LocalPhotoCache]へ保存することはない。

・命名規則
　(root)\YYYY\YYYY-MM-DD\YYYY-MM-DD-HHNNSS-nnn.***

#### Memo:写真登録記録
　タイトル行：【photo登録記録】[XXXX-XX-XX]に撮影した写真
　レコード行：[photoタグ] 移動日時：yyyy/mm/dd hh:nn、元データ：xxxxxx、コピー先：xxxxxx

#### Memo:写真アルバム 
　タイトル行：【photoアルバム】 (タイトル）
　レコード行：[photoタグ]  (タイトル）
　Outlineでグループ化

#### 将来
- アプリ内Browserに表示
- アウトラインを反映したアルバム表示
- 時系列表示

#### キャプチャー
　キャプチャーはphotoとは別管理

### search
[search:Google:cccccc]
[Google:cccccc]

### link
[link:cccccc]


### command
[command:ttcmd_editor_load_new]


### 検索
[Route:xx,xx,xx]
[google:xxxxx]




## メニュー

## グループ
### メモ（Memos）

### 編集（Editings）


### 検索（Searchs）


### リンク（Links）


### 設定（Configs）


### 状態（Status）


### コマンド（Commands）

### リソース（Thinktank）



# 履歴
## ver.0.7.225 230711 14:05
　各panelのTextboxでdefaultのコンテキストメニュを非表示
　Alt+LSIDCで打鍵し続けると各panel Captionのコンテキストメニュー表示

## ver.0.7.223 230711 09:36
　各panelのFilterをリファクタリング
　　@3d, @3w で 最新の3日,3週に絞れる
　　@xxxx-xx-xx で この日までに絞れる、
　　@xxxx-xx-xx 1d で この日に絞れる

## ver.0.7.221 230710 17:19
　PopupMenuをリファクタリング（機能変更せずに改装）
　　ListViewからDataGridに変更
　　独立Style
　　textbox追加(default非表示)
　　labelをdefault非表示
　
## ver.0.7.220 230710 11:14
　まだMenuが残っている。次からMenuがなくなる



# 設定値

## レコード
Thinktank:レコード:
[分類名]　住所録
[住所]
[名前]
[携帯電話]~~~~
[電話]
[その他]
(空行)

## Status
Apply-TTState     Application.System.OutlookMainFolder      "shinichiro.egashira@veneno.jp>受信トレイ"                    -PCName veneno-02
Apply-TTState     Application.System.OutlookBackupFolder    "Thinktank(2023-08-)"                               -PCName veneno-02
Apply-TTState     Application.System.MemoPath      	        'C:\Users\shinichiro.egashira\Documents\Memo'           -PCName veneno-02
Apply-TTState     Application.System.CachePath              'C:\Users\shinichiro.egashira\Documents\Memo\Cache'     -PCName veneno-02
Apply-TTState     Application.System.BackupPath             'C:\Users\shinichiro.egashira\Documents\Memo\Backup'    -PCName veneno-02
Apply-TTState     Application.System.PhotoPath              'C:\Users\shinichiro.egashira\Documents\Photo'          -PCName veneno-02
Apply-TTState     Application.System.LinkPath      	        'C:\Users\shinichiro.egashira\Documents\Link'           -PCName veneno-02


Apply-TTState     Application.System.OutlookMainFolder      "gogowooky@gmail.com>受信トレイ"                    -PCName TPE15
Apply-TTState     Application.System.OutlookBackupFolder    "Thinktank(2023-08-)"                               -PCName TPE15
Apply-TTState     Application.System.MemoPath      	        'C:\Users\gogow\Documents\Thinktank\Memo'           -PCName TPE15
Apply-TTState     Application.System.CachePath              'C:\Users\gogow\Documents\Thinktank\Memo\Cache'     -PCName TPE15
Apply-TTState     Application.System.BackupPath             'C:\Users\gogow\Documents\Thinktank\Memo\Backup'    -PCName TPE15
Apply-TTState     Application.System.PhotoPath              'C:\Users\gogow\Documents\Thinktank\Photo'          -PCName TPE15
Apply-TTState     Application.System.LinkPath      	        'C:\Users\gogow\Documents\Thinktank\Link'           -PCName TPE15

・Apply-TTState     Application.System.MemoPath      	        'G:\マイドライブ\作業中データ\ThinktankMemo'           -PCName TPE15
・Apply-TTState     Application.System.CachePath              'G:\マイドライブ\作業中データ\ThinktankMemo\Cache'     -PCName TPE15
・Apply-TTState     Application.System.BackupPath             'G:\マイドライブ\作業中データ\ThinktankMemo\Backup'    -PCName TPE15


Apply-TTState     Application.System.OutlookMainFolder      "gogowooky@gmail.com>受信トレイ"                -PCName TABLET-8M1V2L05
Apply-TTState     Application.System.OutlookBackupFolder    "個人用(2025-04-)"                               -PCName TABLET-8M1V2L05
Apply-TTState     Application.System.MemoPath      	        'C:\Users\user\Documents\Thinktank\Memo'        -PCName TABLET-8M1V2L05
Apply-TTState     Application.System.CachePath              'C:\Users\user\Documents\Thinktank\Memo\Cache'  -PCName TABLET-8M1V2L05
Apply-TTState     Application.System.BackupPath             'C:\Users\user\Documents\Thinktank\Memo\Backup' -PCName TABLET-8M1V2L05
Apply-TTState     Application.System.PhotoPath              'C:\Users\user\Documents\Thinktank\Photo'       -PCName TABLET-8M1V2L05
Apply-TTState     Application.System.LinkPath      	        'C:\Users\user\Documents\Thinktank\Link'        -PCName TABLET-8M1V2L05

Apply-TTState     Application.System.OutlookMainFolder      "shinichiro.egashira@mochida.co.jp>受信トレイ"                                  -PCName HPH1N0299
Apply-TTState     Application.System.OutlookBackupFolder    "個人用フォルダ (2024-07-)"                                                           -PCName HPH1N0299
Apply-TTState     Application.System.MemoPath      	        'C:\Users\69887\Box\個人フォルダ\2019-04-01\2022-02-08_desktop\Memo'            -PCName HPH1N0299
Apply-TTState     Application.System.CachePath              'C:\Users\69887\Box\個人フォルダ\2019-04-01\2022-02-08_desktop\Memo\Cache'      -PCName HPH1N0299
Apply-TTState     Application.System.BackupPath             'C:\Users\69887\Box\個人フォルダ\2019-04-01\2022-02-08_desktop\Memo\Backup'     -PCName HPH1N0299
Apply-TTState     Application.System.PhotoPath              'C:\Users\69887\Box\個人フォルダ\2019-04-01\2022-02-08_desktop\Photo'           -PCName HPH1N0299
Apply-TTState     Application.System.LinkPath      	        'C:\Users\69887\Box\個人フォルダ\2019-04-01\2022-02-08_desktop\Link'            -PCName HPH1N0299

Apply-TTState     Application.System.OutlookBackupFolder    '(2019-01-)'                                        -PCName LAPTOP-5FOVA1SU
Apply-TTState     Application.System.MemoPath      	        'C:\Users\shin\Documents\Thinktank\Memo'            -PCName LAPTOP-5FOVA1SU
Apply-TTState     Application.System.CachePath              'C:\Users\shin\Documents\Thinktank\Memo\Cache'      -PCName LAPTOP-5FOVA1SU
Apply-TTState     Application.System.BackupPath             'C:\Users\shin\Documents\Thinktank\Memo\Backup'     -PCName LAPTOP-5FOVA1SU
Apply-TTState     Application.System.PhotoPath              'C:\Users\**shin**\Documents\Thinktank\Photo'           -PCName LAPTOP-5FOVA1SU
Apply-TTState     Application.System.LinkPath      	        'C:\Users\shin\Documents\Thinktank\Link'            -PCName LAPTOP-5FOVA1SU

## WebSearches
New-TTWebSearch     Spotify         'Spotify'                   'https://open.spotify.com/search/{0}'
New-TTWebSearch     NET             '.NET API Browser'          'https://docs.microsoft.com/ja-jp/dotnet/api/?view=net-5.0&term={0}'
New-TTWebSearch     VBAOutlook      'VBAOutlook'                'https://docs.microsoft.com/ja-jp/search/?category=outlook&search={0}'
New-TTWebSearch     Pubmed          'Pubmed検索'                'https://pubmed.ncbi.nlm.nih.gov/?term={0}'
New-TTWebSearch     NIPH            '国立保健医療科学院'        'https://rctportal.niph.go.jp/s/result?t=chiken&q={0}'
New-TTWebSearch     CTG             'ClinicalTrials.gov'        'https://clinicaltrials.gov/ct2/results?term=&cntry=&state=&city=&dist=&cond={0}'
New-TTWebSearch     Cortellis       'コルテリス'                'https://www.cortellis.com/intelligence/qsearch/{0}?indexBased=true&searchCategory=ALL'
New-TTWebSearch     PMDA            '医薬品医療機器総合機構'    'https://ss.pmda.go.jp/ja_all/search.x?ie=UTF-8&page=1&q={0}'
New-TTWebSearch     KAKEN           '日本学術振興会科研費'      'https://kaken.nii.ac.jp/ja/search/?kw={0}'
New-TTWebSearch     EMA             '欧州医薬品庁'              'https://www.clinicaltrialsregister.eu/ctr-search/search?query={0}'
New-TTWebSearch     JST             '科学技術振興機構'          'https://www.jstage.jst.go.jp/result/global/-char/ja?globalSearchKey={0}'
New-TTWebSearch     PMC             'PubMed Central'            'https://www.ncbi.nlm.nih.gov/pmc/?term={0}'
New-TTWebSearch     MHLW            '厚生労働省'                'https://www.mhlw.go.jp/search.html?q={0}'

## WebLinks
New-TTWebLink       'AvalonEdit'                'http://avalonedit.net/documentation/'
New-TTWebLink       'dotNet API'                'https://docs.microsoft.com/ja-jp/dotnet/api/?view=net-5.0'
New-TTWebLink       'Googleニュース'            'https://news.google.com/topstories?hl=ja&tab=wn&gl=JP&ceid=JP:ja'
New-TTWebLink       'MSNニュース'               'https://www.msn.com/ja-jp/news/'
New-TTWebLink       '時事ニュース'              'https://www.jiji.com/?google_editors_picks=true'
New-TTWebLink       'Excel'                     'https://docs.microsoft.com/ja-jp/office/vba/api/overview/excel/object-model'
New-TTWebLink       'Word'                      'https://docs.microsoft.com/ja-jp/office/vba/api/overview/word/object-model'
New-TTWebLink       'Outlook'                   'https://docs.microsoft.com/ja-jp/office/vba/api/overview/outlook/object-model'
New-TTWebLink       'Powershell'                'https://docs.microsoft.com/ja-jp/powershell/scripting/overview?view=powershell-5.1'
New-TTWebLink       'System.Windows.Controls'   'https://docs.microsoft.com/ja-jp/dotnet/api/system.windows.controls?view=net-5.0'




