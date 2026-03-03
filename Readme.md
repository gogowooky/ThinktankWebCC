# ThinkTank

- Memos: 読み込み、検索
- Event: マウスクリック
- Monaco Editorの機能の勉強：　検索、マルチカーソル、入力補助、ハイライト、Folding、コマンドパレット、Change All Occurence
・ すること

- BQからファイルをExport、ファイルのImport、BQのクリア、Cacheの削除
- Splitterの移動、スタイルの設定、カラースキーマ
- Keywordとハイライト
- Folding
- キーアサイン：　Folding、Panel/Mod/Tool、
- ActionとMenu
- ActionTag：　[search:xxx]、[mail:xxx]、[memo:xxx]、[AI>]、[1] 20xx/03/11 [20xx-03-11]
・ 新しい機能
- Chatの創設、BigQueryとGeminiとの連携、

　Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
  $env:GOOGLE_SERVICE_ACCOUNT_KEY = Get-Content .\thinktankweb-483408-9548b5a08345.json -Raw

- BQリンク
　⇒ <https://console.cloud.google.com/bigquery?project=thinktankweb-483408&ws=!1m0>
- サーバー立ち上げ
　./scripts/start-backend.bat
　npm run dev
- クライアント立ち上げ
　<http://localhost:5173/>
　<https://thinktank-web-699735546730.asia-northeast1.run.app>>

- ■ TTRequests/TTRequest

[26xxxx]

- TTChats/TTChatの追加

[260303]

- node .\scripts\analyze-duplicates.js を実行したところ、ダブって登録されているファイルが複数ありました。現在の重複レコードを最新のものだけ残して残りは削除し、今後のレコード更新は、File_ID＋Categoryで同一性を確認してUPDATEする方法を徹底し、今後は重複が起こらないように修正してください。

- boldではない場合は何ですか？
- 上記設定のコンポーネント側での表示反映の実装もお願いします。
- TTRequestの個々アイテム毎に、文字色と文字太さの指定をします。TTRequestのメンバー変数に追加し、AddRequestで指定できるようにしてください。

[260302]

- WebViewは、Markdown プレビュー や全文検索(/ttsearch)などの同一オリジンに限定した利用法を考えています。全文検索サービス(/ttsearch)でキーボードでリンクを移動できるようにすることは可能でしょうか？

- 以下のWebView用のkeybindingを追加してください。
Alt+S : WebView.Action.Search
WebView.Action.SearchはWebView.Keywordに /ttsearch と入力して全文検索サービスを表示します。

[260301]

- 質問です。WebViewではキーイベントが取得できていません、キーイベントが発生していないのでしょうか？

- 各パネルのWebView上でカーソルがあるLinkの順位を示すTTState([Panels].WebView.CurPos) を追加してください。next/prev/first/lastも受け入れるようにしてください。
-
- node .\scripts\analyze-duplicates.js を実行したところ、ダブって登録されているファイルが複数あります（下記）。File_ID＋Categoryが同じであればupdateされるはずです。調査して修正してください。
-
- WebViewパネルで/ttsearchが表示されておりません。調査修正をお願いします。
- TTMemosのcsvキャッシュはlocal cacheとBQの両方に保存しますが、TTMemosへのTTMemoの登録は、まずBQの一覧情報からの登録を試み、BQアクセスができない場合に、local cacheからよみとる形にしてください。

[260227]

- TTState((Panel).Editor.CurPos)の設定値に、linestart+/lineend+を追加してください。linestart+は現在位置が行先頭であった場合は文書先頭へ、lineend+は現在位置が行末であった場合は文書末尾へ移動します。

[260224]

- 質問です。タッチデバイスの場合にキーボード入力を全面的に中止にしようと考えています。そのときに音声入力しようとした場合、入力は可能でしょうか？音声入力はキーボードをsimulateしてるため入力できないでしょうか？

- 以前「- Pointer Events API でご提案のTAP1/TAP2/LONGPRESS/SWIPE_LEFT/SWIPE_RIGHT/SWIPE_UP/SWIPE_DOWN/PanelTitle_TAP1/PanelTitle_LONGPRESS を認識するジェスチャー認識ロジックを組み込んでください。」と依頼し、タッチデバイス用のジェスチャー認識ロジックを組み込みましたがこれを解除してください。そしてその時タッチイベントを優先させるためにマウスイベントを一時停止していたと思いますが、その設定を元に戻してください。

- ローカル開発をしているときにスマホからPCのlocalhostに接続するには？

- クライアントデバイスが携帯電話やパッドなどのタッチデバイスであった場合のみ、Deskパネルをzenモードで表示するように設定してください。
- Pointer Events API でご提案のTAP1/TAP2/LONGPRESS/SWIPE_LEFT/SWIPE_RIGHT/SWIPE_UP/SWIPE_DOWN/PanelTitle_TAP1/PanelTitle_LONGPRESS を認識するジェスチャー認識ロジックを組み込んでください。
- まだ実装しないでください。タッチデバイスでEditor/Table/WebViewを切り替える方法を考えています。タッチ操作イベントでKeyにタップ、ダブルタップ、長押しなどの値を与えてUIRequestTriggeredActionを起動し、通常のイベント制御に乗せることができれば、その後にメニュー表示するなどの方策があると考えています。そのような都合の良いイベントはありますか？
- 質問です。クライアントデバイスが携帯電話やパッドなどのタッチデバイスであった場合のみ、Deskパネルをzenモードで表示するようにできますか？

- 変更した場合、検索にかかる時間はどのようになるでしょうか？　現在5500件あります。
- 質問です。BQの全文検索はすべてを抽出できていないようですが、できるだけすべてを抽出するようにすることはできないのでしょうか？

- WebView.Keywordのテキスト変更の仕方を記載しますので、全体的に修正をお願いいたします。
　WebView.Keywordのテキスト変更は行単位です。

　追加テキストがTTState([Panels].WebView.Keywords)に含まれる場合、その行を最終行に移動して値全体を更新し、WebView.Panelのカーソルを最終行に移動します。([Panels].WebView.Keyword)も更新します。
　追加テキストがTTState([Panels].WebView.Keywords)に含まれない場合、最終行に追加して値全体を更新し、WebView.Panelのカーソルを最終行に移動します。([Panels].WebView.Keyword)も更新します。
　WebView.Keywordは TTAction(WebView.Keyword.Query)を起動するまでは確定していません。その間はTTState([Panels].WebView.Keyword)が正しい値です。

- WebView.Keywordの表示文字と、TTState([Panels].WebView.Keywords)の表示文字が一致していませんので、一致するようにしてください。

[260223]

- 質問です：全文検索では何件くらいのデータを対象にしていますか？ 5500全件ではないと思っています。
- /ttsearch の検索対象は categoryが Memos のデータにしてください。

- 質問です。　検索語をキーにGoogle Photoで検索をかけ、ヒットPhotoのサムネイルを取得することはできますか？

- WebView.Keywordsをいったんすべて削除すると、その後のキーワード検索が登録されなくなってしまいます。
- 入力した文字がWebView.Keywords/Keywordに登録されないことがあります。これって、WebView.Keywordsがnullのときに登録されなくなりますか？
- 認識しにくいため、パネルタイトルやWebView.Keywordのクエリー文字をurlエンコードするのを止めてください。そのかわり、実際にurlとしてWebViewに適用するときにurlエンコードしてから適用するように変更してください。
- パネルタイトルに表示されるurlには適応されていますが、WebView.Keywordには反映されないです。修正をお願いいたします。
- ほぼOKです。content内の検索用textboxへの文字入力→検索のアクションを実施する際には、WebView.Keywordにその相対urlを記入するようにしてください。
- WebViewとWebView.Keywordの動作については下記に従い、現実装を総合的に見直して再構築してください。
　WebView.KeywordはEditor.Keywordのような文字入力毎の更新作業は不要ですので、文字入力毎のイベントは不要です。
　WebView.KeywordでのENTER入力はTTAction(WebView.Keyword.Query)にBindされます。
　TTAction(WebView.Keyword.Query)は以下のように作用します。
　　文字列が絶対url(http等で始まる)または相対url(/で始まる)であれば、そのurlをWebViewに適用して表示します。
　　responseがない場合やエラーの場合にはNoResponse/Errorなどのメッセージのみ表示します。
　　その他の場合、requestID=TTObject, requestTag=[TTSearch:入力文字列] として、URIRequestTriggeredAction を呼び出します。
　　TTAction( Request.TTSearch.Default ) は /ttsearch?q=urlencode済入力文字列 をurlとしてWebViewに適用して表示します。
　　WebViewにurlが適用されたタイミングで、Current.Keywords/Keywordにそのurlが設定されます。設定はEditorKeywords/Keywordと同じ要領です。つまり、Keywords内に同じ文字列があれば無登録でその行にカーソルを合わせ、なければ登録してその行にカーソルを合わせます。そしてKeywordにその行のテキストを設定します。

- content内のキーワード欄への文字入力はできませんし、パネルのKeyword欄への入力も一文字有力するごとにフォーカスが変わってしまい実質入力できない状態です。修正してください。
- コンテンツ内の検索キーワード欄の文字を変更できない、パネルのキーワード欄のurlが変更できない、などの状態になっています。
- 読み直しをしたら、そのときのurlでkeyword欄を書き換えてください。
- /ttsearchをパラメーター付きの/ttsearch でも呼び出せるようにしてください。そして/ttsearchのtextboxにキーワードを入力したら、"/ttsearch?q=urlencode(キーワード)" でサービスを再呼出しするようにしてください。

- リンクをクリックしたあと以下のメッセージを得ています。
■ UIRequestTriggeredAction:
requestIDとrequestTagが設定されているので、UIRequestTriggeredAction は メモを開くアクションをするものと思うのですが、そうはなりません。なぜでしょうか？

- 添付画像ではDeskパネルKeyword欄に /tte と入力され、アプリが再帰的に表示されている状態です。どうやら ホストアドレス以降の /xxxx はどのようなものであっても アプリが表示されるようなのですが、 そうではなく、(hosturl)/ は　アプリを表示 (hosturl)/ttsearch は 全文検索を、それ以外は白紙を表示するように修正してください。

- 添付画像は１つめは、アプリのアドレスを入力したときは循環表示であっても表示してほしい 、にもかかわらず表示されていない画像です。
ふたつめは、/ttsearch と入力しているが表示されないという画像です。
ふたつめは単に表示までにかなり時間がかかってしまうということのようです。
みっつめは検索語を入力したがレスポンスがないという画像です。ネットはつながっているし、backend serverも立ち上がっていますが、なぜこうなってしまうのでｈそうか？

[260221]

- ブラウザコントロールに
TTPanelEditorBehavior.ts:420 [TTPanelEditorBehavior] Editor handle not available for restore: thinktank (Retry: 75)
restoreEditorState @ TTPanelEditorBehavior.ts:420
のエラーが大量に発生しています。どういうことでしょうか？

- では、本アプリの /search 全文検索サービスを以下のように変更してください。
・ /search から /ttsearch に変更
・各アイテムのリンクに、requestID='TTMemo', requestTag='[TTMemo:(メモID)' を追加

[260220]

- 検索文字が表示されるスニペットとそうではないスニペットがあります。後ろに行くほど表示されない例が多くなります。
- スニペットには検索文字を含むテキストを設定し、検索文字部分を太字で強調表示していただきたいです。現在は先頭のテキストが部分的に表示されているのみです。
- 全文検索サービス /search ですが、以下のフォーマットでヒットデータを表示してください。
　1行目：MemID : Memoタイトル（リンク設定）
　2行目～５行目：検索文字周辺のスニペット（検索文字太字で表示）
　リンク文字列は表示不要
全体的に文字サイズ小さく

- BQについて再度確認してほしいのですが、IDが重複しているファイルの数がまた増えています。ファイルのBQへの保存は、file_idとcategoryで同一ファイルの確認をすることになっていたはずですが、現状どうなっていますでしょうか？

- BQ内のデータには、titleにcontentの内容が含まれてしまっているものがあります。titleに '===*' を含むデータについて、’===*'を含む後ろの文字を削除したうえで titleとして登録するように、scripts/update-memos-to-bigquery.js を書き換えてください。

- 相談です。本アプリのWebView上に、通常の検索サービスのような入力画面に文字入力すると全メモと対象とした全文検索結果が表示されるようなアプリ内サービスを作成することの現実可能性を教えてください。

[260219]

- migrate-memos-to-bigquery.js の 参照先を引数で指定するように変更してください。参照先としては、backup-memos-from-bigqueryの保存先folderを想定しています。Folder以下の構成としては、Memoファイルはthinktank.mdも含めてMemo folderに、CacheファイルはCache folderに配置されています。

- EditorモードのKeyword欄のカーソル行の文字を参照してハイライトを決定しているはずですが、カーソル位置を変えて参照文字が変わったはずの状態でもハイライトが更新されないようです。調査してください。

- EditorパネルではKeywordのテキストをハイライトさせる機能があります。その文字色をもう少し目立たせたいです。マーカーのような背景色（蛍光色）と対抗色の文字色にしてください。

[260218]

- 長いパネルタイトルは折り返し表示されていますが、折り返しはせず1行で表示してください。　表示しきれない場合は途中まで表示し、... で後ろがあることを示すようにしてください。

- 2025-06-30-093753 のLoad時にFoldingsが適応されていません。適応されるよう修正をお願いいたします。

- 画像中のID:2025-02-15-092534 のタイトルですが、何度保存しても「ｄNo Title - 2026-02-15-092534」に戻ってしまいます。実際のメモ内のタイトルもこれとは異なります。調査してください。

[260217]

- 添付画像の通りですが、【川崎病】というタイトルのメモを開いて閉じただけで更新日が最新になっています。修正してください。
- TTMemoでファイルを開くだけで更新日が変更されてしまっています。本当に止めてください。更新日が変更されるのは内容に変更があった場合のみです。
- TTMemoでファイルを開くだけで更新日が変更されてしまうのを止めてください。更新日が変更されるのは内容に変更があった場合のみです
- TTEditingの値がメモロード処理後に適応されないことが頻発します。修正をお願いいたします
- TTEditingに保存されている各種値が度々元に戻ってしまいます。おそらく、新規Load時のタイミングで TTEditingを一旦保存してしまっているのではないかと考えています。確認し、確実に前回のTTEditingがLoad時に反映されるように修正してください。

- Tableモード時のTableタイトル（Panelタイトルではない）は表示しなくてよい
- Panelタイトルに、パネル名に続けて表示するもの
Editorモード：　 | ID | タイトル
Tableモード：　| リソース名 (表示アイテム数/全アイテム数) | ID
WebViewモード：　| url

- TTEditingに保存されている各種値が度々元に戻ってしまいます。おそらく、新規Load時のタイミングで TTEditingを一旦保存してしまっているのではないかと考えています。確認し、確実に前回のTTEditingがLoad時に反映されるように修正してください。
- TTAction( Table.SortCol(1-5).(Asc/Desc/Rev) )において、sort対象列をListPropertiesから得ていますが、表示幅によってListPropertiesMinを使う場合に対応できていません。
- Activeパネルのテーブルに表示されているTTCollectionのx番目項目のソートを昇順、逆順、反転する TTAction( Table.SortProp(1/2/3/4/5).(Asc/Desc/Rev) ) を追加してください。先ほどの依頼と似ていますが、テーブルに表示されているCollectionのListPropertiesに対するソートになります。

- Activeパネルのテーブルに表示されている左からx番目カラムのソートを昇順、逆順、反転する TTAction( Table.SortCol(1/2/3/4/5).(Asc/Desc/Rev) ) を追加してください。

- 初期起動時の各パネルの設定を以下にしてください。もちろん初期起動時以降はキャッシュの内容に従います。
　Libraryパネル：Table, Thinktank
　Indexパネル：Table, Memos
　Shelfパネル：Table, Memos
  Deskパネル：Editor, Thinktank
　Systemパネル：Editor, Thinktank
　Chatパネル：Table, Events
　Logパネル：Table, Status
- Tableの表示幅はリソースのColumnMaxWidthを最大幅として表示するようにしてください。Tableの表示幅はリソースのColumnMaxWidthを最大幅として表示するようにしてください。
- Tableの横スクロールバーを操作すると、データは移動するが、カラムタイトルが移動しない。

[260216]

- TTApplication.ts

- TTPanelEditorBehavior.tsのリファクタリングをすすめてください。
- リファクタリングが推奨されるソースファイルはあるでしょうか？

- だいたいの機能が複製し終わったと考えていますので、今から、機能拡充に向けて動かしたいと考えています。
　拡充前にリファクタリングしてからがよいと考えますが、どう思いますか？　リファクタリングで局所解に収れんしてしまうと逆に機能拡充の障害になるでしょうか？

- localhostアプリではRequest.Invoke.DefaultのあとにRequest.TTMemo.Defaultが起動されますが、GoogleConsole上アプリではRequest.Invoke.DefaultのあとにRequest.TTObject.Defaultが起動されて何も動かなくなってしまいます。deployしただけで変更はしていません。この動作の違いはなぜでしょうか？

[260215]

- Tableタイトルをクリックすると UIRequestTriggeredActionが呼ばれ、 context.RequestID = 'TableTitle';
が実行されるはずなのだが、console上でReqrestID、RequestTagにはなにも設定されていません。なぜでしょうか？
- UIRequestTriggeredActionを呼び出しの際、Keyに(PanelTitle|TableTitle|StatusBar)を含む場合、content.RequestIDに(PanelTitle|TableTitle|StatusBar)を、content.RequestTagに[(PanelTitle|TableTitle|StatusBar):パネル名]を設定するように修正してください。

- カーソル行および全選択行を対象に、コメント文字を追加/削除する TTAction( Editor.Edit.NextComment/PrevComment ) を設定してください。行頭文字は '; ','> ','>> ','| ', コメントなし の順番で変更してください。
- カーソル行および全選択行を対象に、TABを追加/削除する TTAction( Editor.Edit.AddTab/RemoveTab ) を設定してください。
- DefaultActions.ts の メソッド performBulletChange は DefaultAction.ts 以外の適切な場所へ移動してください。
- カーソル行および全選択行を対象に、行頭文字を追加/削除する TTAction( Editor.Edit.NextBullet/PrevBullet ) を設定してください。行頭文字は '・ ','- ','* ','→ ', '↓ ', 行頭文字なし の順番で変更してください。

- DateTime.ChangeDetail.Time で時刻を再表示する際、00:00 が表示されました。ExDateTimeモード開始時に時刻表示がないため現在時刻を保持しているはずです。調査してください。
- ExDateTimeモード開始時に読み取った日時はモード終了まで保持してください。そして時刻非表示後の再表示の際には保持した時刻を表示してください。また、ExDateTimeモード開始時に時刻指定がない場合は、現在時刻を保持してください。
- TTAction( DateTime.ChangeDetail.Weekday ) はカーソル位置日付の曜日記載のON/OFFを期待していますが動いていません。調査してください。
- 起動すると WeekDay/Time の有無を変更する TTAction( DateTime.ChangeDetail.Weekday/Time ) を追加して下さい。
- TTAction(Editor.Date.Action)でExDateTimeモードに入った後のアクションとして、表示フォーマットを変更するTTAction( DateTime.ChangeFormat.(Date/DateTag/JDate/GDate)) を追加してください。
- TTAction(Editor.Date.Action)でExDateTimeモードに入った後のアクションとして、カーソル位置の表示日の表示形式を変更するTTAction( DateTime.AddDetail.With(Weekday/Time) ) を追加してください。
- TTAction(Editor.Date.Action)でExDateTimeモードに入った後のアクションとして、カーソル位置の表示日を同じ表示フォーマットのままずらすTTAction( DateTime.Shift.(Prev/Next)(1y/1m/1d/1w) ) を追加してください。

- Excellent！
- 挿入された タグの上で再度起動すると、Application.Current.ExModeはExDateTimeに変更されましたが、StatusBarのcontextは変更されませんでした。また、modifier keyを離してもApplication.Current.ExModeのExDateTimeは解除されませんでした。調査し、修正してください。
- browerコンソールに以下が表示されますが、Editor上には何も表示されていません。
■ UIRequestTriggeredAction: {Key: 'T', Mods: Array(1)}Key: "T"Mods: ['Alt'][[Prototype]]: Object
TTApplication.ts:485 Event Match: *-*-*-*|Alt|T -> Action: Editor.Date.Action
DefaultActions.ts:242 [Editor.Date.Action] Inserted date: [2026-02-15]
- 日時表示に関するActionを追加します。実行時に、カーソル位置のRequestタグを検出し、DateTag/Date/GDate/JDateのいずれかであった場合には、ExModeをExDateTimeに変更します。それ以外のタグの場合は何もしません。タグが検出されない場合には、現在の日時をカーソル位置に追記します。追記時の日時のフォーマットは、TTRequest(DateTag)の正規表現に適合するフォーマットで、曜日と時刻の表示はありません。

- 新規メモがいったん作成されますが、直後にcontentがclearされてしまいます。調査して修正してください。
- DefaultActions.ts#L470-475 は 時間format関数などでもっと簡略的に記載できないのでしょうか？
- 新規メモを作成するAction( Application.Memo.Create ) を追加してください。新規メモのタイトル(1行目)は "No Title - yyyy-mm-dd-HHMMSS" で 2行目は = が 50個、3行目は空行です。

[260214]

- TableTitle上でのマウスアクションの定義を参考に、PanelTitle上でのマウスアクションについてもイベントを記載し、UIRequestTriggeredAction()を起動するようにしてください。

- カラムの幅をマウスで変更できるようにしてください。
- TTAction( Table.Style.AdjustColumnWidth ) の実行により、むしろカラム幅が広がってしまっています（添付画像）。最小限＋空白１文字分のカラム幅にしたいです。修正をお願いいたします。
- ModelBrowser.tsx L505-514 で RequestTag は [パネル名:TableTitle] となるように設定してください。現在はパネル名ではなくリソース名になっています。
- Tableタイトル部をマウスクリックしたときに{ requestID = TableTitle, requestTag = [パネル名:TableTitle] } でrequest.invoke するように設定してください。

- Tableパネルの背景色を現色とこれよりやや薄い色の２色で交互にしてください。
- 幅の狭い Indexパネル（Chatパネル）で TTMemos （TTEvents）のアイテムを表示しようとしていますが、表示されていません。原因を調査し修正してください。
- Tableパネルで表示される各カラムの幅は表示データ＋空白１文字分の幅としてください。

- ./script/backup-memos-from-biguqery.js のデータ退避用directory の名前をThinktank_Backup_yymmdd に変更してください。

- 現時点でlocalhostから立ち上げたアプリのMemo数が 1 で、BQ上のMemo数が5520 となっており、BQのMemoがローカルに反映されていないように見えます。調査して修正してください。

- TTAction( Request.TTAction.Invoke ) の中身を記述してください。

- TTState( Application.Voice.Input ) の on/off に連動して、音声入力の切り替えをしてください。

[260213]

- DeskパネルのTableでTTMemosからTTMemoを選ぶとEditorにTTMemoの内容が表示されますが、ShelfパネルのTableでTTMemosからTTMemoを選ぶとTableにTTEventsの内容が表示され、想定される動きではありません。IndexパネルでもShelfパネルと同様にTTMemoがEditorに表示されず、TTStatusがテーブルに表示されます。Deskパネルだけ正しく動いているように見えます。この状況を調査し、修正してください。

- ShelfのTableにTTMemosを表示、DeskのEditorで編集中、に ExPanel を Shelf にして、Table中のアイテムをInvoke.Defaultしましたところ、選択した TTMemo がDeskに表示されず、TableモードになりTTMemosが表示されました。TableでTTMemoを選択したことが、TTMemosを選択したことになっているようです。 ResourceがTTMemosのときにTTMemoを選択することと、ResourceがTTModelsのときにTTMemosを選択することは区別してほしいです。修正をお願いいたします。
- status.RegisterState('Application.Style.PanelRatio' ... に記載されているソースコードは TTApplication 側に移すべきではないかと考えましたがいかがでしょうか？
- TTState(Application.Style.PanelRatio) に 以下のコマンド入力を許容し、内容に基づいて数値を設定してください。
　コマンド: 内容
　default, reset: 初期値に戻す
　zen: Currentパネルのみの表示にする
　standard: 1:4:0,1:3,1:5:0,1:1 に設定

- TTState(Application.Style.PanelRatio)を設定してください。これはパネルの幅と高さを比で設定するものです。"1:3:1,1:2,1:5:1,1:1" のように数値で設定し、その意味は、左幅:中央幅:右幅, 左上高:左下高, 中央上高:中央中高:中央下高, 右上高:右下高、になります。*は無変更を意味します。"0:5:1,*,*,*" は、カラム幅を0:5:1に変更するが、各カラム内の高さの比は変更しないことを意味します。

[260212]
-ttrequestsを参考に、TTStatus,TTActions,TTEvents,TTEditings についてのActionを記載してください。

- Requestsが表示されたテーブルで任意のレコードを選択して Action.Invoke すると、TTMemoが表示されます。対応するActionが無い場合は Default 値に戻す、という対応になっているのでしょうか？調査してください。
- Request.TTRequests.Openが起動されますが、TTRequestsがテーブルに表示されません。
- TTAction( Request.TTMemos.Open ) requestTag に記載された resourceオブジェクトを Tableモードで表示するよう記載してください。
- 説明を間違えました。Tableリクエストに対応するタグとしては、TTModelsの子アイテムクラスの名前にしてください。テーブルに表示されているアイテムがTTCollectionであった場合、resourceにはがTTModelのNameの'Thinktank'が設定されていますので、その確認をしたのちに、カーソルがあるアイテムのクラス名をrequestID、[]で囲ってrequestTagとしてください。
- TTPanelTableBehavior.tsの
        // Memos の特別処理
以降で、他のオブジェクト(TTModels|TTActions|TTEvents|TTMemos|TTRequests|TTStatus)に関する処理を追加してください。

- Excellent!
- 現在activePanelとexPanelの２つのパネルのどちらかを対象にしながら様々な処理を行うActionを作成しておりますが、Request.Memo.OpenやRequest.TTMemo.Open等では、CurrentExPanelのMemoIDを読み取り、ActivePanelのEditorで開きたいと考えています。実装計画を作成してください。ExPanelとactivePanel間でやりとりするActionは今後も応用いたしますので、わかりやすく汎用的な形で実装したいと思います。

[260211]

- TTState( [Panels].（Editor|Keyword).SelPos ) を追加してください。設定値として、(next/prev/first/last)line, (next/prev)char, line(start/end) などを受け入れてください。

- TTState( [Panels].Keyword.CurPos ) を追加してください。設定値として、(next/prev/first/last)line, (next/prev)char, line(start/end) などを受け入れてください。

- AddEvent('*-Table-*-ExPanel', '', 'UP', '(ExPanel).Table.CurPos:prev');
上記のState設定Eventが起動されていますが、思ったように動いていません。ExPanelでTableが表示されていれば、そのExPanelでTable.CurPosを設定する形で動作してほしいです。

- Excellent!!
- WebView2のFontSizeは変更されるようになりましたが、EditorのFOntSizeは変更されません。修正してください。
- [Panels].Font.Sizeにも同様の問題があるようですので対応お願いいたします。
- Excellent！！
- 残念ながらWebViewのみフォントサイズが変更されません。WebViewを表示しているパネルのタイトルなどのフォントは変更されています。
- Application.Font.Size:up/downですが、まだ、WebViewだけ文字サイズが変更されない状態です。ただし、マウスでCtrl+ScrollUp/ScrollDownする場合にはWebViewも変更されていますので、方法はあるように見えます。修正をお願いいたします。
- Application.Font.Size:up/downですが、WebViewだけ文字サイズが変更されません。
- Application.Font.Size:up/downがworkしていないです。改修をお願いいたします。

- TTState( (Panel).Table.CurPos ) に first/last が受け入れられるように修正してください。
- TTAction, TTEventで記載されている 'CurrentPosition' は長すぎるため、'CurPos' の記載に修正してください。
- TTStatus( [Panels].Editor.CurrentPosition ) の引数に、(next|prev|first|last)sibfolding を追加してください。sibfoldingは現在行が所属するfoldingの兄弟（同親に所属する同レベルfolding）です。
- TTStatus( [Panels].Editor.CurrentPosition ) の引数に、currentfoldingを追加してください。これは現在行が所属するfoldingの先頭行に移動します。
- TTStatus( [Panels].Editor.CurrentPosition ) の引数に、(next|prev|first|last)visiblefolding を追加してください。これは見えているfoldingのみを対象とします。
- TTStatus( [Panels].Editor.CurrentPosition ) の引数に、(next|prev|first|last)folding を追加してください。これは兄弟親子の関係性を考慮せずに移動します。
- '(Panel).Editor.CurrentPosition:prevrequest' を起動したあと、カーソルが表示画面からはずれていてもスクロールしませんでした。
- (Panel).Editor.CurrentPosition でのカーソル位置設定後にカーソルが見える範囲から外れている場合はスクロールして見えるようにしてください
- TTStatus( [Panels].Editor.CurrentPosition ) の引数に、(next|prev|first|last)request を追加してください。
- DefaultActions.ts>AddAction で (Mode) の記載を許容するよう修正してください。
- TTStatus( [Panels].Editor.CurrentPosition ) を設定してください。値を設定するとカーソル位置が変更されます。カーソル位置が返されます。また、nextchar, prevchar, nextline, などのキーワードを受け入れ、カーソルを移動します。キーワードは後から追加される可能性があります。

[260210]

- TTAction( Editor.AutoComplete.* ) の中身を追記してください。

- TTAction( Request.TTModel.Open ) では、ExCurrentPanel の選択アイテムを、ActivePanel の Table.Resource に割り当てるように変更してください。
- TTAction( Request.TTModel.Open ) の中身を記載してください。選択したTTModelの子アイテムをTable.Resourceに設定します。
- TTAction( Request.Memo.Open ) でメモを開くパネルは ExPanel が優先で、指定が無ければ CurrentPanel で開いてください。

- TTEventの4th ContextでExPanelが指定された場合は、1st/2nd/3rd Contextの比較対象はExPanelのプロパティとなるように変更してください。

- 質問です。現在TableのTTMemoを起点としたActionは動作していますが、EditorのMemoタグを起点としてActionが動作していません。[Memo:thinktank]のようなタグがUIRequestTriggeredActionで解釈されてActionが起動されるはずですがどのようになっているでしょうか？

- TTEventでcontextの4番目がExPanelの場合はExPanelに含まれている時に発動するようになっているでしょうか？　なっていなければそのように修正してください。

- ActivePanelに対する処理をすべて、ExFdPanel() が名前のパネルに対する処理に変更してください。
- TTApplicationに ExModeがExPanelモードのときはその値からExを除いたPanel名、そうでない場合はactivePanel名を設定した ExFdPanel() プロパティを追加してください。

[260209]

- 質問です：　現開発中アプリでは、ローカルのクリップボード中に保存されているOutlookメールを認識し、送信者、送信時間、タイトル、等の情報を取得することができるでしょうか？

- Editor.Edit.FoldingInitは Foldingを追加した後、Foldingマークの右にカーソルを移動しスペースを１つ入力する
- Editor.Edit.FoldingDownに以下機能を追加してください。
  カーソル行が、選択状態ではなく、Folding行ではない場合、Editor.Edit.FoldingInit を実行してください
- Editor.Edit.FoldingUpに以下機能を追加してください。
  Foldingが最上位レベルの場合(#が一つの場合)、#を削除してください。
- DefaultActions.ts のうち、コメントに 【追加内容】 と記載されている箇所について、記載内容に沿った機能を記述してください。

[260208]

- アプリ全体のキーアサインのデザインを考えるためのスプレッドシート資料を作りたいです。特に、モード間の類似機能のキーを同じキーにアサインすること、多重低意義のアラート、に気を付けながら、デザインを考えられるようなシートを作成したいです。
・各Table/Editor/WebViewモードに共通のキーをデザインするシート
・編集にかかわる一般的なキーのまとめ
・より上位のCurrent切替やExModeのキーのまとめと多重定義アラート
・Folding操作系、マルチカーソル系などはまとめて確認したい

[260207]

- 分かりやすいキーアサインの一覧表をGoogleスプレッドシート形式で作成してください。
- Foldingが保存時と異なる状態で再現されます。TTEditingを保存するときのFoldingsの読み取りか、再現するときに間違いがないか確認して下さい。特に、閉じているはずのFoldingが開いた状態で再現されることが発生します
- Memo Load時にTTEditingを再現する際には、全体のFolding状態の再現を一番先に再現してください。現在一部のFoldingが再現していないように見えます。

[260206]

- PWA化できている → ^N,^P で default shortcut上書き可
- powershell -ExecutionPolicy Bypass -File .\deploy.ps1
　<https://thinktank-web-699735546730.asia-northeast1.run.app>

- 今アプリ実行のために2つのサーバーを立ち上げていますが、deploy.ps1で２つとも google cloudに設置されて連動動作しますか？

[260205]

- Excellent
- Request.Memo.Openまでつながるようになりましたが、EditorにMemoの内容が表示されません。
- TableパネルでのRequest.Invoke.Action 後に、requestIDに応じたActionが呼ばれなくなりました。また、Request.Show.ContextMenu後にMenuは表示されますが、選択後、Editorに何も表示されません。
- Request.Invoke.Defaultのあと、おかしな名前のActionが実行されています。　requestTagとresuestIDを間違えていないでしょうか？
- 呼び出し元で解決する方針でお願いいたします。
- TTAction( Request.Invoke.Default )のコードが読みにくいです。　GetDefaultAction(requestTag, requestId);　のための、requestTag, requestId、の取得は、より上流でなされるべきとも考えますが、どう思いますか？　ご意見をお聞かせください。

[260204]

- 本プロジェクトで、０ベースで作成されたファイルはどのフォルダーにありますか？つまりライブラリ以外の本アプリのために書かれたファイルはどのフォルダにあるでしょうか？

- Excellent!
- update-memos-to-bigquery.jsを実施した直後ですが、TTMemoがテーブルに表示された直後はオリジナルのローカルファイルの更新日が表示されていますが、表示直後に古い更新日に変更されてしまいます。おそらくローカルのキャッシュの値で上書きしているのではないかと考えます。update-memos-to-bigquery.js直後には、BQ側を最新にしてください。

- Request.InvokeDefaultはRequest.Invoke.Defaultに、Request.ContextMenuはRequest.Show.ContextMenu に変更してください
- TTAction( Request.*.InvokeDefault/ContextMenu ) は*部分に Editor/Table/WebViewの３つがあり、パネル毎に分けられているが、分けずに統合してもよいのではないか、と考えていますが、どう思いますか？

- キーイベント・マウスイベント後に特定アクションが起動されるまでのプロセスをケースごとに分けて説明してください。
- UIRequestTriggeredAction内の記載を、機能パート事に分けてコメントしてください。特に、TTEventsとのマッチング処理と、TTRequestsとのマッチング処理についてわかりやすく整理してください。
- UIイベント（キーボード・マウス）と、TTApplication.UIRequestTriggeredAction(context) メソッド、TTEvent、TTAction についての イベント後の流れと分岐を 図として分かりやすくまとめてください。その際、TTAction( Request.*.InvokeDefault/'Request.*.ContextMenu ) を呼び出した以降の流れについても示してください。

[260203]

- TableKeywordに ">xxxx" と入力

- Request.*.InvokeDefault/ContextMenu は*部に Editor/Table/WebViewがあるが、分ける必要はないのではないか？

- UIRequestTriggeredAction内の記載を、機能パート事に分けてコメントしてください。特に、TTEventsとのマッチング処理と、TTRequestsとのマッチング処理についてわかりやすく整理してください。

- TTAction(Request.Editor.ContextMenu)を参考にRequest.Panel.ContextMenuを追加してください。ここでは、activeなパネル名を requestID/requestTagに設定して、 models.Requests.GetDefaultAction(requestTag, requestId);　を呼ぶようにしてください。

- TTAction(Request.Editor.InvokeDefault)を参考にRequest.Panel.InvokeDefaultを追加してください。ここでは、activeなパネル名を requestID/requestTagに設定して、 models.Requests.GetDefaultAction(requestTag, requestId);　を呼ぶようにしてください。
- TTApplication.tsのOnKeyDown などを参考に、パネルタイトル位置でのマウスイベントをRequestイベントとして処理するよう追記してください。その際のKeyにはPanelTitle_RIGHT, PanelTitle_LEFT2などマウスKey名にPanelTitle_を追記した値にしてください。

[260202]

- 各パネルがEditorモードの時は、LoadしているTTMemoの値を Desk | ID | Name のように記載してください。Editorモードではない場合は表示を戻してください。
- CaretPosとしてカーソル位置の行番号を保管しているようですが、そうではなくCaretPosそのものを保存し、Memo Load時に復元してください。
- TTMemoを保存するときに、以下のような値をTTEditingに保存してください。　そして、MemoをLoadするときには TTMemo.IDと同じTTEditingを参照し（なければ終了）、CaretPos,WordWrap,Keywords,Keywordを読み込んだEditorに適応し、Foldingsの行番号のカンマ区切りをFoldingに適応してください。  
  TTMemo.ID → TTEditing.ID
  FoldingsがCloseしている行番号のカンマ区切り → TTEditing.Foldings
  TTState( [Panel].Editor.CaretPos ) → TTEditing.CaretPos
  TTState( [Panel].Editor.WordWrap ) → TTEditing.WordWrap
  TTState( [Panel].Editor.Keywords ) → TTEditing.Keywords
  TTState( [Panel].Editor.KeywordColor ) → TTEditing.KeywordColor

- Control + Sを無効化してください。

- TTAction( Editor.Cursor.LineStart, Editor.Cursor.LineEnd ) を追加してください。行頭にカーソルがある状態でEditor.Cursor.LineStartを読んだときは、Editor.Cursor.FirstLineを、行末の場合はEditor.Cursor.LastLineを実行してください。
- TTAction( Editor.Cursor.FirstLine, Editor.Cursor.LastLine, Editor.Cursor.NextRequest, Editor.Cursor.PrevRequest, Editor.Cursor.FirstRequest, Editor.Cursor.LastRequest ) を追加してください。

- 編集履歴やメモ毎の環境背設定を保存する TTEditing/TTEditingsを、他のモデルクラスや reference/script/TTModel.ps1 を参考に追加してください。メモを保存するタイミングで変更または追加することになります。

- TTRequestsの clickableテキストの色をもう少し落ち着いた色に変更してください。

- もう一つ質問です。一旦インストールしたものの使われていないライブラリはどれくらいあるでしょうか？
- 質問です。様々なライブラリを利用していると思いますが、ライブラリのコードを直接変更している箇所はあるでしょうか？

[260201]

- 兄弟Foldingが閉じません。修正してください。(opus)
- TTAction(Editor.Folding.Close)は呼び出し時にカーソル位置のFildingがすでに閉じていたら、カーソル位置のFoldingと同レベルの折りたたみをすべて閉じる。その際、親Foldingは変更しない。(opus)
- 親Foldingは閉じていませんが、兄弟Foldingが閉じません。修正してください。
- 修正後も変わらず、すでに折りたたまれている位置で実行すると親要素が閉じました。
- TTAction(Editor.Folding.Close)は呼び出し時にカーソル位置のFildingがすでに閉じていたら、カーソル位置のFoldingと同レベルの折りたたみをすべて閉じる。その際、親Foldingは変更しない。

- Tableパネルのソートですが、更新日とメモIDをクリックした場合のソートの更新が、その項目の並び順になっていません。確認して修正してください。

- Excellent！
- 右クリックでブラウザのコンテクストメニュが表示されてしまいますが、この表示を抑制できますでしょうか？
- すごく良いです！　英表記のIDでもFilterできるところが素敵です。　英語表記が背景で見えないのですが、日本語タイトルより薄い色で見えるようにしてください。
- では、Editor/Table/WebViewのすべてで使えるコマンドパレット風UIを作成してください。TextBoxとSelectionを組み合わせたもので、コマンド専用でよいです。基本的にはRequest.Editor/Table.ContextMenuでの利用がメインですが、別な用途にも使うかもしれません。ご検討ください。

- 更新日もメモIDと同様のフォーマット（yyyy-MM-dd-hhmmss）で表示してください。
- 今Tableに表示されているMemoは更新日の値がない状態のようです。BQには正しく登録されているのでしょうか？また、ローカルファイルからBQへの登録時に正しくローカルファイルの更新時を登録するようになっているのでしょうか？確認してください。
- update-memos-to-bigquery.js で memoを登録すると、特定ファイルにおいて、titleに全contentが含まれてしまうことがあるようです。文字コードによって、 firstLine = content.split['\n'](0).trim();　が正しく動作しないためではないかと考えます。ここについて文字コードに配慮した形の記載にしてください。

- Excellent
- 同一ファイルのBQへの更新リクエストは5秒の遅延後に更新することとし、遅延時間中の同一リクエストがあれば、遅延時間をリセットすることにするのはどうでしょうか？
- BQについて再度確認してほしいのですが、IDが重複しているファイルの数がまた増えています。ファイルのBQへの保存は、file_idとcategoryで同一ファイルの確認をすることになっていたはずですが、現状どうなっていますでしょうか？

- BQ内のデータには、titleにcontentの内容が含まれてしまっているものがあります。titleに '===*' を含むデータについて、’===*'を含む後ろの文字を削除し titleとして再登録してください。

- 以前はMemosのレコード数がだんだん増えてゆくのが見えていましたが、今は毎回22件と表示したのみで停止しそれ以上レコード件数が増えません。Memosの一覧を作成する機能が作動していないのでしょうか
- BQについて再度確認してほしいのですが、IDが重複しているファイルの数が増えています。ファイルのBQへの保存は、file_idとcategoryで同一ファイルの確認をすることになっていたはずですが、現状どうなっていますでしょうか？

- BQには5000件以上メモが登録されていますが、TTMemosには22件分しか取り込まれませんでした。何が原因でしょうか？

- そうではなくて、アプリケーションがBQと行っている通信の内容について知りたいです。メモとキャッシュだけなのでしょうか、通信速度が遅いときにメモが表示されるまでの時間が非常にかかるために気なっています。

- BQとの通信に時間がかかっているように思います。編集更新毎のメモといくつかのキャッシュ csvファイルだけで、サイズもほとんど小さいと思いますが、そのほか発生している通信内容を教えてください。

- Excellent !
- Excellent !　ほぼ完成です。　メニューの表示位置をEditorのCaret位置やマウスカーソル位置などのイベント発生の位置に基づいて表示してください。あとは画面外に表示されないような調整もお願いします。　また、メニューはESC押下やマウスカーソルから外れたら消えるようにしてください
- コメントをいくつか追記しました。了解いただければ、実装を開始してください。
- Request.Editor.InvokeDefault は UIイベントを受けて起動し、タグを認識し、[Memo:xxxx]であれば、Request.Memo.Default を起動します。これはworkするようになりました。こんどは、Request.Editor.ContextMenuを実装します。こちらもUIイベントを受けて起動し、タグを認識するところまでは同じですが、[Memo:xxxx] であれば、Request,.Memo.Default を除いたすべての Request.Memo.* を取得し、コンテキストメニューとして表示してユーザーに選択させ、選択アイテムを実行するように設計します。何段階かに分ける必要があるかもしれませんが、計画・実装をお願いします。

[260131]

- 質問です。現在TTApplication.OnKeyDownに集約しているキーボードイベントをEditorとTableとWebViewの別々に分けたいと考えていますが、可能でしょうか？　またメリットは何でしょうか？

- update-memos-to-bigquery.js ですが、登録するupdated_dateはデータ登録時の値ではなく、ファイルのタイムスタンプの値に変更してください。

- BQについて再度確認してほしいのですが、IDが重複しているファイルの数が増えています。ファイルのBQへの保存は、file_idとcategoryで同一ファイルの確認をすることになっていたはずですが、現状どうなっていますでしょうか？

- Tableモードでアイテムをダブルクリックした後、Editorモードが表示されしばらくしてからファイルが表示されます。この時間を地締められないでしょうか？

- 説明が足りませんでしたので中止してください。Editor上のタグによるファイル表示は機能しています。Tableをダブルクリックしたときのファイル表示が真っ白になっています。原因調査をお願いいたします。
- Request.Memo.Openが起動してメモが読み込まれるはずですが表示されず、真っ白なままです。原因を調査してください

- Excellent!
- Deskパネルのみ、Tableパネルでカーソルを動かすと、全PanelのKeyword用TextEditorがフラッシュします。DeskパネルのTableパネルにはMemosがリソースとして設定されています。この現象を止めてください。
- BQについて確認してほしいのですが、特に追加していませんがレオk－度数が増えています。*.csvファイルの数はCollectionの数と同じだけのはずですが、どうも増えているようです。csvファイルのBQへの保存は、ファイルが存在すれば上書きしてほしいのですが、どうなっていますでしょうか？

[260130]

- TTApplication.ts の選択部分で、contextの中身を consoleに表示させるぬはどうしたらよいでしょうか？

Deskパネルのみ、Tableパネルでカーソルを動かすと、全PanelのKeyword用TextEditorがフラッシュします。DeskパネルのTableパネルにはMemosがリソースとして設定されています。この現象を止めてください。（Opus）

- Deskパネルだけ、Tableパネルでカーソルを動かすと、各PanelのKeyword用TextEditorがフラッシュします。DeskパネルのTableパネルにはMemosがリソースとして設定されています。この現象を止めてください。
- DeskパネルのTableパネルでカーソルを動かすと、各PanelのKeyword用TextEditorがフラッシュします。この現象を止めてください。

- UIRequestTriggeredAction の  MatchedText: キーは RequestTag に変更してください。また、関連するmatchedTextなどのローカル変数もわかりやすくするためrequestTag などに変更してください。

[260129]

- 表示されなくなりました
- StatusBarのActionのところには、 Request.Editor.InvokeDefault以降に、チェーン的に呼び出されたActionを、「→Request.Memo.Default」のように 「→」でつなげて右側に付け足していってください。

- TTAction( 'Request.Memo.Open' ) を確認し、指定IDのメモをTextパネルで開くよう修正してください。

- TTApplication.ProcessUIEvent(content) の名前を TTApplication.UIRequestTriggeredAction(content) に変更してください。
- TTAction( Editor.Folding.FirstSibling/LastSibling) を追加してください。

- Excellent!
- ほぼできましたがおしいです。兄弟Foldingのうちもともと閉じている状態のものについては、そのままの状態にしてください。閉じている状態のFoldingをさらに閉じようとすると一つ上のFoldingを閉じることになってしまうからです。
- TTAction( Editor.Folding.OpenAllSibling/CloseAllSibling ) の動作がおかしい状態です。具体的にはカーソル位置のFoldingとその兄弟Foldingの開閉状態をOpenまたはCloseにすることを期待していますが、そうはなっていません。修正するよりも０ベースで新たに更新していただきたいです。(Opus)
- 一括で折りたたまれず、単なる Open/Close と変わらないです。
- TTEvent( Editor.Folding.OpenAllSibling/CloseAllSibling ) を追加してください。

[260128]

- ModelBrowser.tsxの
    if (panel && panel.Table) {
        // Resource名をそのままRequestIDとして使用
        requestId = panel.Table.Resource;
    }
の部分はResource名ではなくそのリソースのクラス名にしてください。

- Excellent!
- WebViewパネルはEditorパネルで表示しているテキストのMarkdownプレビューを表示するようにしてください
- 内部コンテンツ表示時に、すべてのキー入力を親ウィンドウへ転送するように改修を進めてください。
- ひょっとして、WebViewはキーフックができないですか？　つまり、ショートカットキーをアサインしたりはできないのでしょうか？

- TTAction( Request.WebView.InvokeDefault/ContextMenu ) を追加してください。

- この関数はページ内の複数リンクに対して、前後の移動と先頭・末尾への移動のActionになります。動いていないようですので、改修してください。
- TTAction( WebView.Cursor.Prev/Next/First/Last ) を追加してください。

- この関数はページ内の複数リンクに対して、前後の移動と先頭・末尾への移動のActionになります。動いていないようですので、改修してください。
- TTAction( WebView.Cursor.Prev/Next/First/Last ) を追加してください。

- AddEvent('*-Table-*-*', '', 'LEFT2', 'Request.Table.InvokeDefault');
  AddEvent('*-Table-*-*', '', 'RIGHT1', 'Request.Table.ContextMenu');
のTTEventのうち、下は動作しましたが上は動作しませんでした。　LEFT2は左ダブルクリックのイベントということでよいですか？　なぜ動かないのでしょうか？

- TTState( [Panels].Editor.SearchWholeWord )などを参考にしながら TTState( [Panels].Editor.ReplaceKeepCapitalize/ReplaceInSelection) を追加してください。

- Excellent!
- TTState(Desk.Editor.SearchRegex)は変更されていますが、popupのアイコンがRegexモードに変更されません。
- ReplaceモードからSearchモードに切り替わる際、popupの表示がReplaceモードのままになっています。
- 以下のエラーが出ています。
editor.api-CalNCsUg.js:899 Uncaught (in promise) Error: command 'editor.action.startFindReplace' not found
- SearchModeは None と SearchモードとReplaceモードを繰り返すようにしてください

[260127]

- 以下のエラーが出ます。
  TTStatus: ApplyValue item not found: [Panels].Editor.SearchMode
- TTState([Panels].Editor.SearchMode) を next/prev を受け入れるように修正してください。
- findControllerの表示状態を表す、TTState( [Panels].Editor.SearchPopup ) を追加してください。状態は Search/Replace/Noneで、next/prev も受け入れるように修正してください。
- TTState( [Panels].Editor.SearchRegex/SearchCaption/SearchWholeWord ) は next/prev を受け入れるように修正してください。

- TTAction(Table.Cursor.Prev10)が起動するとカーソル消失します。おそらく マイナスの位置に移動しようとしているように予想します。符号付数字の場合は、現在位置からの差分になりますので、そのように修正してください。

- TableパネルでCursorを動かしても別パネルに表示された[Panel.Table.CurrentIDの値が変更されていませんので、修正してください。

- ModelBrowser.tsxの選択範囲において、左クリックと左ダブルクリック、左トリプルクリックを区別するように記載してください。
- 選択範囲において、左クリックと左ダブルクリック、左トリプルクリックを区別するように記載してください。

- editor.onMouseDownを参考にTableパネルのOnMouseDownにも Modsと座標を選択されたアイテムのIDと表示されているリソース名を取得してcontextを作成し、統合イベント処理を呼び出すよう設定してください。
- 「Resource名（例: "Memos"）から単数形（"Memo"）を推測してRequestIDとして使用しています。」のところですが、複数形であればTableで、単数形であればEditorへ、と表示を分けて表示しますのでそのままの名前でRequestタグを作成してください。
- TTAction(Request.Editor.InvokeDefault, Request.Editor.ContextMenu)を参考に、Tableパネルでの選択レコードに対するアクションである Request.Table.InvokeDefault, Request.Table.ContextMenuを作成してください。

[260126]

- Excellent!
- TTAction(Application.Command.Delegate)は 何もせずに false を返すことで、イベントを消費せずEditor defaultの動作を実行するための Actionですが、今Editorのdefault アクションが実行されません(ctrl+Cやctrl+V)。Actionがfalseを返したときには、イベントを消費しないようになっているか確認してください。

- カーソル移動後はカーソルが見える位置にスクロールしてください
- Table.Cursor.Prev/Next/First/Lastを実行すると、現在行と移動先行の間で選択が入れ替わり続ける状態になり、入力を受け付けなくなります。修正してください。
- TTActionに選択行Table.CurrentRow.Next/Prev/First/Last を追加してください。
- TTState( [Panels].Table.CurrentPosition ) を、next/prev, first/last, +10/-10, を入力可能にしてください。

- Tableパネルの選択行のIDを示すTTState( [Panel].Table.CurrentID ) を設定してください。　CurrentPositionが0のときはCurrentIDを空にしてください。

- Tableパネルの選択行を示すTTState( [Panel].Table.CurrentPosition ) が更新されていませんので、修正して下さい。

[260125]

- それもあるかもしれませんが、数日前に編集履歴をリセットする処理を実装していただいてからおかしくなっているように思います。一旦編集履歴のリセット処理を中止してみていただけないでしょうか？
- [Request.Memo.Open] Param1: thinktank, Param2: undefined, CurrentPanel: Desk
とあります。正しく取得できているようです。

- カーソル位置に以下を書いてください。
MemoをIDにもつRequestのDeterminantでmatchedTextを解釈し、名前付き部分一致を取り出します。CurrentパネルをEditorモードにしResourceにparam1を設定します。その後param2があれば、その文字をKeywordに設定します

- ActionID と context で Actionを起動する簡単な書き方は？

- GetDefaultActionでは、Request.requestedID.Default という名前の Action を起動してください。
- 選択領域部分では、GetDefaultActionには requestedIDとmatchedTextの両方を渡してください。

- 削除しないことで承知いたしました。その代わりLINKというKey名を REQUESTという名前に変更してください。
- editor.onMouseDownの中でRequestID or MatchedTextの判定をしていると思いますが、その後TTApplication::ProcessUIEventでも同じ判定をするので、重複していると考えますが、editor.onMouseDown側の判定を削除すると問題がありますか？

- Request.Editor.InvokeDefault の中でも、RequestID or MatchedTextの判定をしてください。

- TTApplication::ProcessUIEventの呼び出し元毎の、引数の渡し方をまとめて説明してください
  - TTApplication.OnKeyDown: Sender,Key,Mods,ScreenX,ScreenY
  - editor.onMouseDown: Sender,Key,Mods,ScreenX,ScreenY,RequestID,MatchedText
  - domNode.addEventListener('drop'): Sender,Key,Mods,ScreenX,ScreenY,ClientX,ClientY,DroppedData

- TTApplication::ProcessUIEventの呼び出し元毎の、引数の渡し方をまとめて説明してください。

- Editor.tsx に Drag&Dropのイベントを定義し、そこでも、先ほどのUIイベント処理メソッドに統合してください。 Key値はDropとしてください。

- Editor.tsxの hondleEditorDidMountで定義されているonMouseDownを書き換えたいです。具体的には senderとmodifierとkey( = LEFT1,LEFT2,LEFT3,RIGHT1,CENTER1)、ckick位置座標 を context変数にまとめて、UIイベント処理メソッドに渡し、contextのMod/Keyからイベント、イベントからActionを呼び出すようにしたいです。このcontextからActionを呼び出す処理は、TTApplicationのOnKeyDownでも行っているため、UIイベント処理メソッドで統合して処理されるように、TTApplicationのOnKeyDownも修正してください。

[260124]

- 選択部分では requestIDとmatchedTextを計算していますが、position位置からscreenXとscreenYも計算してください。
- 1段目はOKですが、メモ (Ctrl+Click to follow)　と記載された余分な2段目が表示されます。これは必要ありません。
- popupとして表示される Follow link(ctrl+link) は linkしても何も反応しませんので、今2段になっているpopupのFollow link(ctrl+link)と表示されている2段目を削除してください。
- [Memo:thinktank]というclickableテキスト上で Ctrl+Spaceを押すと、
[Request.Editor.InvokeDefault] RequestID or MatchedText is missing
というエラーが出ますが、マウスクリック時には出ません。
おそらく、onmousedownの時にカーソル下の clickableテキストの評価を行っているためと思いますが、clickableテキストの評価は TTAction(Request.Editor.InvokeDefault)の中で、実施することにして、マウスクリックもキーボード押下も統一的に評価できるようにしてください。

- では、[Panel.Editor.Resourceの初期値（= thinktank）どおりに、内容を表示してください。
- [Panel.Editor.Resourceの初期値は thinktank になっていますが、その内容が表示されなくなりました。thinktank という ID の TTMemo の content は消去されてしまいましたか？

- ブラウザコンソールで以下のエラーが発生しますので対応してください
GET <http://localhost:5174/favicon.ico> 404 (Not Found)

- Undoで戻れるのは Load直後までにしたいです。

[260123]

- 下のように設定しています。
    AddEvent('*-Editor-Main-*', 'Control', 'LINK', 'Request.Editor.InvokeDefault');
    AddEvent('*-Editor-Main-*', 'Control', 'SPACE', 'Request.Editor.InvokeDefault');
 ブラウザコンソールから、Ctrl+Spaceがワークしていることは確認できましたが、Ctrl+linkは動いていませんでした。この設定で動くと思っておりましたが、別の設定が必要でしょうか？

- マウスイベント時にもMods, Key(RIGHT1、RIGHT2、RIGHT3，LEFT1，LEFT2, LEFT3, DROP等), を含むよう改修してください。
- Key や Modifier は無かったですか？
- TTActionをInvokeするときの引数に含まれるHashKeyをすべてまとめて掲示してください。

- clickableテキストを触るたびに、RequestLinkProviderに毎回TTRequestの中身を登録しているように見えます。これはそのの理解でよいでしょうか？

- 参照：ega360123

[260122]

- 1つ目の画像で、「# すること：　早期入替！！」にカーソルがあるときに 'Editor.Folding.Next'を起動すると、「# region Menu Paste   」に移動してほしいところだが、カーソル行の「# すること：　早期入替！！」が開いて出てくる「## できていること」にカーソルが移動してしまいます。開かないようにしてほしいです。
- GotoNextHeading() が 閉じていて表示されていない子Foldingに移動してしまいます。親Foldingが閉じているため表示されていない子Foldingは無視して次のFoldingを探して下さい。

- 改善されておりませんが、hover.above、の値を、表示しようとする clickableテキストのviewport内での位置で変更することで、linkの上方または下方に表示させる、という制御だけは実施できないですか？
- popupは表示位置を状況に応じてずらし、popupがすべてユーザーに見えるようにしてください。
- Excellent!
- popupは表示できない場合は位置をずらしてください。現状では1,2,3行目のタグのpopupは欠けるか全く見えません。

- 代替案に同意です。onMouseDownを利用することについて同意なのですが、起動するイベントの設定については、TTEventsと統合する実装方法を考えていますので、ご意見をお願いいたします。アイデアとしては、イベント登録時のKeyとして、RIGHT1、RIGHT2、RIGHT3，LEFT1，LEFT2, LEFT3, DROP等を許容し、マウスクリック（シングル、ダブル、トリプル）またはアイテムのDropに対しても同じ登録方法でTTActionを起動できる形にしたいと考えています。TTActionはActionContext(ハッシュ)を引数にしていますので、イベント呼び出し時に、マウス位置情報を追加できないでしょうか？　ご意見をお願いいたします。

- TTPanelには Editor/Table/WebViewの各モードやPanel自体に関わるメソッド・プロパティが混在しています。管理や理解のしやすさのためリファクタリングをしたいです。どのような方法が良いかご意見を願いいたします。

[260121]

- TTPanelには Editor/Table/WebViewの各モードやPanel自体に関わるメソッド・プロパティが混在しています。TObjectからTPanelに継承する間に、TObject→TPanelEditor→TPanelTable→TPanelWebView→TPanelと継承し、継承途中のクラスに分散させることで、メソッド・プロパティの管理をしやすくできないかと考えています。ご意見を言願いいたします。

- EditorのFoldingのマーク > v は 行番号の数字の色と同じ色にしてください。

- Excellent !
- [ ] 対の '[' と ']' の文字色スタイルを除去してください。
- [ ] や ( )  {} などの括弧対や、対になっていない括弧文字のスタイルを除いてください。

- Excellent !
- すべてのpopupが二段になっています。二段目の Follow link (ctrl+click)はそのままでよいですが、一段目から(ctrl+click)の表記を除いてください。
- すべてのclickableリンクのpopupで「name:対象文字(ctrl+click)」と表示してください。(#PATH) の表示は不要です。
- PATHはpopupの表示が「パス:」ではなく「[パス:\temp]」と表示されています。そのうしろの(#PATH)も他にはない表示です。
- 「\\temp\」 に対する popup表示が、「\temp](thinktank://PATH/%5C%5Ctemp%5C)」と表示されており、対象文字列に含まれないthinktank://PATH という文字が含まれたり%5Cとの文字が含まれたりと、挙動がおかしいように思います。対象文字と同じ文字がpopupに表示されるにできますでしょうか？
- Tableリソースだけが多重登録されているようです。なぜでしょうか？

- TTPanelには Editor/Table/WebViewの各モードやPanel自体に関わるメソッド・プロパティが混在しています。TObjectからTPanelに継承する間に、TObject→TPanelEditor→TPanelTable→TPanelWebView→TPanelと継承し、継承途中のクラスに分散させることで、メソッド・プロパティの管理をしやすくできないかと考えています。ご意見を言願いいたします。

- 子Foldingを持つ親Foldingが閉じている時に、GotoNextHeading()を実行すると、親Foldingが開いてしまいます。開かずに次のFoldingに移動するようにしてください。
- GotoPrevHeading()とGotoNextHeading()ですが、表示されていないFoldingは非対象です。FoldingをOpenせずに移動できる次のFoldingに移動してください。
- この二つのActionについては、View側（TTPanel側）に内容を移動し、AddActionではView側メソッドを指定する形にするほうがよいと思います。
- TTAction(ditor.Folding.(Prev|Next)) については、レベルを問わずに次のFoldingに移動するようにしてください。

- 全角スペースを枠付きで表示するのをやめてください。

[260120]

- BigQueryにデータはありました。1の方法でお願いします。
- TTMemoの数は5000以上あったと思うのですが今は thinktank.md の1件のみが表示されています。BigQueryからも消失しているように見えますが、原因を調査してください。

- SortやFilter操作の後、選択アイテムに追随してください。表示されていない場合は0にしてください。
- 選択行の色はTableタイトルの色とTableのBgColorの色の中間の色にしてください。
- *.Table.CurrentPositionの値がTableに表示されていません。
- 追加です。この値は1ベースの数値にしてください、そして、無選択は 0 にしてください。
- Tableの選択表示しているアイテムの位置を示すTTState([Panels].Table.CurrentPosision)を設定してください。無選択の場合は空白にしてください。

- TTState(Application.Focus.*)をTTState(Application.Current.*)に変更してください。

[260119]

- 与えられた文字列に応じてたActionを返すTTRequests/TTRequest クラスを設定します。
  TTRequestのプロパティ
    ID：          Model
    Name：        キーワード検索
    Determinant： \[([^\]\:]+):([^\]]+)\]
  TTRequestsのメソッド
    GetDefaultAction(tag)： tagとDeterminantがマッチする子アイテムを取得。子アイテムIDと、マッチ結果から取得したsubIDを組み合わせて、TTAction(ID.subID.Default)を返します。
    GetActions(tag)： tagとDeterminantがマッチする子アイテムを取得。子アイテムIDと、マッチ結果から取得したsubIDを組み合わせて、TTAction(ID.subID.Default以外)を返します。
  TTRequestsへのアイテムの登録は DefaultRequests.ts で行います。

[260115]

- Editorにハイライトを適応するタイミングでEditorパネルのKeywordにも同じハイライトを適応してください
- [Panels].Editor.Keywordではなく[Panels].Editor.Keywordsに基づいてハイライトしています。[Panels].Editor.Keywordのほうでお願いいたします。
- TTState([Panels].Editor.Keyword)に従って、EditorパネルのKeywordとEditorのキーワードをハイライトします。[Panels].Editor.Keywordの , でグループに分けグループ1から6までに対し、[Panels].Editor.KeywordColorで規定されるColor1からColor6を割り当てます。各グループの文字はスペース' 'でさらに分割され、各グループのキーワードとしてハイライトします。
- KeywordsColorModeは６数の色を規定するプロパティで、値'Default'は reference\script\EditorRule.xshd に規定されている Keyword1..6 のfgColor, bgColor, fontWeight, Underline を 保持します。将来的には別の色を保持する値も想定されます。
- TTState('Application.Appearance.ColorMode')を参考に'Editor.Keywords.ColorMode'を設定し、その制御実体である KeywordsColorMode をTTPanelに設定してください。

- TTStatus(Application.Focus.Panel) も (next|prev)を受け付けるようにしてください。その際、表示されていないパネル（widthまたはheightが0）を除いたパネルの中からnext|prevの候補を選んでください。

- StatusBarのスタイルもPanelタイトルと同じようにしてください。
- TableとWebViewのスクロールバーをEditorと同じスタイルに変更してください。

- 前回のResolveValueが良かったです、その名前に変更してください。またResolveValueを受ける変数名がnextValというのもわかりにくくしていると思います。nextをはずして適切な名前にしてください。
- 現在選択している 'Application.Appearance.ColorMode' の Applyは、Viewに対して値val を設定するだけと思いますが、ここにGetNextInCycleが入り込む理由がよくわかりません。　説明してください。

- TTState('Application.Focus.Mode/Tool') を設定してください。
  これらは、設定済みのTTState('[Panels].Current.Mode/Tool') の連動変数です。ApplyとCalculateを設定してください。

- ExModeが固定化してしまう現象が発生しています。ExModeの解除はKeyUp時に所定のmodifierを確認することとともに、全modifierが押されていなければ解除するようにしてください。

- TTState/TTStatusの[Panels]と[Modes]は、単純に展開して登録する
- publicなクラス変数であるValueをプロパティ化し、GetValueをgetメソッドにしてください。
- TTStateに値取得用のメソッドプロパティ protected _calculate_value を設定してください。それに伴い関連メソッド等の追加をお願いいたします。

- バックエンドサーバーを停止すると BigQueryへのアクセスができなくなりますか？
- Google Drive関連のコードを削除するメリット・デメリットについて教えてください。
- Google Driveは現在使用していません。その場合バックエンドサーバーの必要性はありますか？
- バックエンドサーバーは何をしていますか？

[260114]

- 質問です。音声入力を起動してTextEditorに入力することはできますか？

- WebViewのKeywordに何も表示されていない場合は、同パネルのEditorに表示されている mdファイルを html化して表示してください。

- EditorやKeywordの背景色を極わずかにベージュ色にしてください。

- テーブルタイトルの高さを18%小さくしてください。

- テーブルのcolumnタイトルの高さは15%小さくしてください

- Tableのレコード境界の線は無くしてください。またレコードの高さを15%減らしてください

- アプリを起動しなおしました。Application.Appearance.ColorModeのDefault値を変更しましたがDefaultDarkのままで、DefaultOriginalが適応されていませんでした。適応するよう修正してください。

[260113]

- 各CollectionクラスのColumnMaxWidthにカラム名と最大幅を定義しましたので、その値に基づいて幅を設定してください。-1は無制限です。

- もう少し幅を狭くしてほしいカラムも散見されます。

- 各パネルのテーブルモードにおいて、表示項目の表示幅は項目ごと均等割り付けではなく、左寄せにしてください。

- サーバー立ち上げ
　./scripts/start-backend.bat
　npm run dev
- クライアント立ち上げ
　<http://localhost:5173/>
　<https://thinktank-web-699735546730.asia-northeast1.run.app>>

[260112]

- Editorのテキスト変更が TTMemoに伝わる際、Name(=タイトル)も更新してください。その結果 TTMemoを表示しているTableも更新することになります。

- 日本語を高速で入力するとカーソルが文書末にとんでしまいます。英表記の場合は問題ないです。これはどういう現象でしょうか？

[260111]

- Table表示にしてからTTMemosが表示されるまで数秒時間がかかっています。毎度serverから読み出しているのでしょうか？　ブラウザでcacheを保持することはできないのでしょうか？

- こんかい使用しているBigQueryを確認するためのブラウザのリンクを教えてください。
⇒ <https://console.cloud.google.com/bigquery?project=thinktankweb-483408&ws=!1m0>

- 相談です。データ管理方法を大幅に変更したいと思います。ファイルとしてデータを取り扱うことを辞めます。したがって、Google Driveやcacheフォルダは使わなくなります。その代わりにGoogle BigQuery上にテキストデータを保管します。BiqQueryを用いた全文検索、Geminiとの連携を図ります。また、GBQへのデータ一括Load/Saveの仕組みを持ちます。この方針に伴い、ファイルベース管理のために導入したソース・ライブラリの整理とGBQ導入のための準備が必要です。本方針の注意点を指摘し、変更のためのプランを策定してください。

[260109]

- 両フォルダを確認しましたが保存されていませんでした。

- [ApiCacheStorage] Saved: Thinktank.csv　と表示されていますが csv ファイルは保存されていないように見えます。正しく保存されていますか？　保存されているフォルダをフルパスで教えてください。

- 一覧化されていることが重要ですので、自動登録されるのではなく、各Actionを個別に登録してください。共通部分をヘルパー関数化するのは可です。

- 各TTCollectionのcacheを同期保存する 'Application.(各ID).Save' を作成してください。

-すべてのTTCollectionのcacheを同期保存する 'Application.(ID).Save' を作成してください。  

[260108]

- Google Drive上のthinktank.mdにはタイトル行をThinktank on Google Driveとしました。Cloud Runサーバーにアクセスしましたが、そのタイトルではありませんでした。Google Driveにアクセスしていないように思います。

- Application.Memo.Renewの終了時には TTMemosはcacheを読みなおししてください。

- GoogleDriveの「マイドライブ/Thinktank/thinktank.md」と「マイドライブ/Thinktank/Memo/*.md」をスキャンして 既存cacheと入れ替えるコマンド、 'Application.Memo.Renew' を DefaultActions.ts 内に作成してください。

- 1. 開発時（ローカルサーバー → ローカルブラウザ）の事例では、"G:/My Drive/Thinktank/thinktank.md" を読み込んでおりますが、今現在、このケースで動いていますが、G: は存在していません。　今は、どのフォルダから thinktank.md を取得しているのでしょうか？

- thinktank.md ファイルを表示するまでの、プロセス図を以下にケースごとに作成して比較してください。
  1. 開発時：　ローカルのサーバーをローカルのブラウザで表示するとき
  2. 想定ケース：　Cloud Runのサーバーをローカルブラウザで表示するとき
  3. ネット不使用時：　？

- TTMemosの初期化時に、GoogleDriveからThinktank.mdを読み込み、Memoを生成してください。

- 以下に 6.ユーザー確認事項 への回答を示します。ステップごとに区切って実装をお願いいたします。
6.1: 既に Google Cloud Run上にデプロイしており、Drive APIをOnにしています。
6.2: 認証方式はChat内の「オプション 1: サーバー経由（ブラウザ → サーバー → Google Drive API）」に記載の方法でお願いします。
6.3: Step 5（Drive API）のオンライン対応を優先してください。

- 想定ユースケースですが、ネットアクセスできない際でも使えるようにするため、ファイルをPCローカルに保存する仕組みも設定したいですが、どのようにすればよいでしょうか？

- ケースによりcacheをリセットする必要が生じると考えています。その際、6000件のファイルにアクセスして、Memo情報をしゅとくする必要がありますが、この作業をブラウザ直接でのアクセスで実施するのはかなり時間がかかるように思いますが、バックグラウンド動作させるなどで対処可能でしょうか？

- Google Drive APIを用いた各ケースにおける、第三者によるサーバー情報取得にたいするセキュリティ対策はどのようになっているのでしょうか？

- 相談です。　今回 Phase3 にて、Google Drive API を使用する場合、を想定したリファクタリングを実施していただきました。　これは、ローカルからDriveに接続する前提でしょうか、または、サーバーからDriveに接続する前提で章か？

- ヘルパー関数、テンプレートパターンとも、AddEvent() のパラメータとして記載するのはNGです。RegisterState()およびAddAction() の第一、第二パラメータでの記載はNGです。スクリプト本体内での記載はOKです。

- Model/View分離強化の対象である Default*.ts はいわば設定ファイルになっております。効率的な記載は目指しておらず、変更のしやすさ、統一記載フォーマットによる理解のしやすさなどを重視しており、プログラマではないユーザーが変更することも想定しています。そのようなコンセプトに基づく修正は受け入れますので、ご提案ください。Model/View分離強化をPhase1においてください。

-現在のThinktankWebプロジェクトのリファクタリングをお願いいたします。リファクタリングに含まれませんが、将来像として以下を目指していますので、参考にしてください。(Opus4.5)

- すべてのMemo, Cache, 等は Google Drive上に保存します。サーバー側で管理し、並行してGoogle Driveと同期をとる形でも良いです。
- 現時点でのメモの数は約6000個でサイズは合計50MB程度です。これらをGoogle Geminiに与えてメモの全文検索等を想定しています。
- サーバーはGoogle Cloud Run上で動かす予定ですが、完全に個人利用用であり公開はしない予定です。
- メモ中にAIへの指示を示すタグを設定する予定です。外部AIとのAPIを介した連携が想定されます。
- Outlookを含むメールサーバーとのやりとりが想定されます。これらもAPIを通じた連携になるかもしれません。

[260107]

- Keywordコンポーネントでカーソルを動かすと、1行目は正しく表示されますが、2行目以降は全行の下半分とカーソル行の上半分がKeywordコンポーネントに表示されます。カーソル行だけが表示されるように修正してください。

- KeywordのTextEditorコンポーネントの高さを1行だけが表示できるようにしてください。そして、カーソル移動等の際、カーソル行だけが表示されるように調整してください。

- 改行のみの行も削除してください。

- Keyword中に空白行があれば、フォーカスが外れるときにすべて削除してください。

- 重複行の統合はKeywordからフォーカスが外れるときに実施してください。

- 全パネルの([Panels].[Modes].Keyword)は各パネル・各モードのKeywordコンポーネントのカーソル行の値にしてください。

- monaco editorのfolding状態について、[+] と [-] ([]は四角)に変更しましたが、
  やはり、その設定はやめて、defaultの  > と V の表示に戻してください。ただし、色は現在のままでお願いいたします。

- 各パネルのTableとWebViewの各KeywordもTextEditorコンポーネントで表示するようにしてください。

- TTState([Panels].Editor.Number) は [Panels].Editor.LineNumber に変更してください

[260106]

- 修正されましたが、あと2px分四角の位置を上にあげてください。

- 固定行内の四角の位置が変わっておらず、テキスト行に対して下にずれています。　修正してください。

- 先頭に#の行を固定したままスクロールする際に、#行の四角が下にずれます。固定行の四角をテキスト行に対して下にずれないように修正してください。

- Foldingの四角の位置をあと4px上にあげてください。

- 行番号の表示状態を保持する TTState([Panels].Editor.Number) を設定してください。

- 行番号、Foldingの四角、Foldingの+とーは、色が強すぎます。　暗い灰色にして目立たないようにしてください。

- 質問です。monaco editorのfolding状態は > と V 以外の表示はできないですか？ [+] と [-] ([]は四角)にしたいです。

- '#*.*' に合致する行から、文末または次の同じ#の数の '#*.*' の手前までを章とし、折りたたみ表示してください。
  '#' の数が1つ増えると、小章として扱われ入れ子構造にしてください

- #で始まる行ではなく、#* で始まる行でした。修正をお願いいたします。

- 行頭が(# .*)で始まり、文末または次の(# .*)の手前までを章とし、折りたたみ表示してください。

- Editorの表示言語はMarkDownにし、章の行で折りたためるようにしてください。

- [Panels].Table.SortDir も加えてください。

- [Panels].Editor.Wordwrap, [Panels].Editor.Minimap, [Panels].Current.Mode, [Panels].Current.Tool は 選択肢を正順で切り替える next と 逆順で切り替える prev でも状態変更できるようにしてください。

- 各パネルのEditorのWordwrapおよびMinimapの表示状態を保持する TTStatus([Panels].Editor.Wordwrap, [Panels].Editor.Minimap) を設置してください。
  この値にtrue/falseが設定されると、Wordwrap/Minimapが変更されます。

- [Panels].Editor.MemoID は [Panels].Editor.Resource に変更してください。

- 全パネルの([Panels].Editor.MemoID) の default値を thinktank に設定してください。

- 各パネルのEditorに表示されているメモIDを保持する TTStatus([Panels].Editor.MemoID) を設置してください。
  この値に適切なIDが入力されると、コンテンツを読み込みEditorに表示します。このIDに空白を設定すると、何も表示されなくなります。

- TTMemoにContent読み取り、書き出し機能を追加してください。
  その際、ファイルは Google Driveの「マイドライブ/Thinktank/thinktank.md」または「マイドライブ/Thinktank/Memo/*.md」が対象になります。
  Google Driveへのアクセスも含めて実装してください。

- デプロイ：
  gcloud run deploy thinktank-web --source . --region asia-northeast1 --allow-unauthenticated --project thinktankweb-483408

[260105]

- commit_log.ps1とlog_commit.ps1がありますが、各々どこで使っていますか？

- デプロイ中にエラーが出ました。ターミナルのような状況です。対処をお願いいたします。
  > <https://thinktank-web-699735546730.asia-northeast1.run.app/>
  
- gcloudをインストールしましたが、以下のエラーが出ました。対応してください。
  gcloud run deploy thinktank-web --source . --region asia-northeast1 --allow-unauthenticated
  ERROR: (gcloud.run.deploy) The [project] resource is not properly specified. Please specify the argument [--project] on the command line or set the property [core/project].

  > gcloudコマンドがプロジェクトを認識できていない、かつ、認証情報が設定されていないためエラーが発生しています。 以下の手順で認証とプロジェクトの設定を行ってください。
  > ターミナルで gcloud auth login を実行し、ブラウザでGoogleアカウントにログインしてください。
  > gcloud projects list を実行し、使用するプロジェクトIDを確認してください（Readmeには ThinktankWeb とありますが、
  > IDは小文字の thinktankweb や thinktankweb-12345 のような形式である可能性があります）。
  > gcloud config set project [確認したプロジェクトID] を実行してプロジェクトを設定してください。
  > 設定完了後、再度 .\deploy.ps1 を実行してデプロイを試してください。

- このアプリを Cloud Run にデプロイして。リージョンは東京（asia-northeast1）で、未認証のアクセスを許可してください。
　<699735546730-compute@developer.gserviceaccount.com>
　Google Cloud: ThinktankWeb

- EditorモードのKeywordに入力すると、Focusが勝手にEditorに切り替わってしまいます。　修正してください。

- 連動して更新されません。修正をお願いいたします。

- マウスクリックによるソートの方向とプロパティの変更イベントが発生で、①TTStateを変更し、②TTStateを表示しているTableを更新してください。

- マウスクリックによるソート方向とプロパティの選択イベントが発生したタイミングでTTStateも変更するようにしてください。

- 各パネルのTable表示のソートに関する値保持するTTState([Panels].Table.SortDir, [Panels].Table.SortProperty)を設定してください。

- 各パネルのTableに表示するCollectionのIDを保持するTTState([Panels].Table.Resource)を設定してください。

- SystemPanelのTableにTTActionsを、DeskPanelのTableにTTMemosを設定してください。

- TTMemosのアイテムは、GoogleDriveの「マイドライブ/Thinktank/thinktank.md」と「マイドライブ/Thinktank/Memo/*.md」が対象です。
  TTMemosのCountが0の場合は、「マイドライブ/Thinktank/thinktank.md」からデータを抽出し、登録を1にした後、cacheを生成・保存してください。

- TTMemosとTTStatusはDefault値を設定した後に、cacheを読み込んで前回保存した値にセットしてください。

- メモを管理するための変数を設定いたします。TTModel.ps1中のTTMemo/TTMemosを参考に作成してください。

- [CollectionID].mdではなく[CollectionID].csvとし、csv形式で保存してください。

- ローカルに保存ではなく、サーバー側のThinktankWeb\cache\以下に保存してください。

- TTCollectionは変更毎に全子アイテムをID.mdという名前でcacheフォルダに保存してください。その際、子アイテムの保存プロパティはItemSavePropertiesに記載したものです

- Tableの行高を15%低くしてください。

[260104]

- フォーカスが変更されたら、Application.Focus.Panel、[Panels].Current.Mode、[Panels].Current.Tool　も変更されるようにしてください。

- ExModeが解除された際にもTTState(Application.Current.ExMode)を更新してください。

- commitしても commit_log.csvが更新されません。  commit_log.csvはどのフォルダにあるでしょうか？

- Git Hookとして設定してください。

- コミット時にcommit_log.ps1が呼び出されることは、どこに記載されていますか？

- TTStatus ([Panel].[Mode].Keyword) が変更された際に、TTStatusを表示している全Tableの表示を更新してください。

- commit_with_log.ps1はcommit_log.ps1に変更してください。

- commit_with_log.ps1はreferenceの下ではなく、ThinktankWebの下に配置してください。

- GitHubにコミットする前に、commit_log.csvにコミット日時、レポジトリ名、コミットメッセージ、PC名を追加してください。

- Shelf.(Editor|Table|WebView).Keywordに文字が入力されたら、各Stateアイテムも値を変更してください。

- ソートの矢印を正順を↓、逆順を↑にしてください。

- 矢印の表示もソートも実施されません。　修正をお願いいたします。

- 反応が非常に遅くなりました。ソートもされません。修正してください。

- Tableのカラムタイトルのクリックでそのカラムでのソートし、正順・逆順のマーク「↑・↓」をカラム頭に表示してください。
  マーク表示はソートカラムのみであり、他カラムに移ればマーク表示は消去してください。また再クリックでソート方向を逆転してください。

- 現在、本アプリケーションは Web Applicationとして制作していますが、これはGoogle Cloud Shell上に配置して、Web経由で呼び出すことができるでしょうか？

- TableKeywordが更新されると、Tableの項目がフィルターされるようにしてください。フィルターは以下のルールです。① スペース区切りはandフィルター、② カンマ区切りはorフィルター、③ マイナスはnotフィルター
  例１）　-Orexin : 'Orexin' を含むアイテムは非表示
  例２）　Orexin MCH : 'Orexin'と'MCH'を含むアイテムを表示
  例３）　Orexin, MCH : 'Orexin'または'MCH'を含むアイテムを表示
  例４）　Orexin -MCH : 'Orexin'を含みかつ'MCH'を含まないアイテムを表示
  例５）　Orexin, -MCH : 'Orexin'を含む、または、'MCH'を含まないアイテムを表示

- 多くのサイトが iframe に表示できないようです。外部サイトを表示する、という使い方以外でこのWebViewコンポーネントが役に立つ使い方で、どのようなものを思いつきますでしょうか？

- 「別タブで開くボタン（↗）」が表示されていません。再確認し修正してください。

- WebViewで <https://www.google.com> が表示されない理由をもう一度教えてください。

- 全パネルのWebViewの表示を 'www.google.com' にしてください。

- ChatのTableにはTTEventsを、LogのTableにはTTStatusを表示してください。

- Tableの縦スクロールはアイテムの範囲のみに制限してください。

- Tableのカラムタイトルの文字への対応、および、Table幅による表示プロパティの変更について、LibraryとIndexパネルのみ対応しており、その他のパネルでは適応されていません。修正してください。

- ShelfのTableにはTTEventsを、IndexのTableにはTTStatusを、DeskのTableにはTTActionsを表示してください。

- TTCollection由来クラスをTableへ表示する際の子アイテムの表示については、
  表示幅が狭ければListPropertiesMinクラス変数、通常はListPropertiesクラス変数に記載されているプロパティを表示してください。
  その際、ColumnMappingに記載されているカラムタイトルを表示してください。

- 現在、各パネルには Desk/Libraryなどの名前のあとに "(Mode)" が表示されていますが、その "(Mode)" の部分は表示しなくてもよいので、修正してください。

- TTCollectionに以下設定用のクラス変数を設定してください。
  1) アプリ終了時にキャッシュに保存する子アイテムのプロパティ名のCSV、
  2) 最小一覧表示で表示するプロパティ名のCSV、
  3) 標準一覧表示で表示するプロパティ名のCSV、
  4) 一覧表示での"プロパティ名:カラム名"対応のCSV

- StatusBarのActionはAction実行前に表示してください。

[260103]

- 少しずつすすめてきたので理解しにくいコーディングになっているかもしれません。一旦、全体的な検討を行い、以下の方針でリファクタリングを実施してください。
  英語コメントは日本語にする。
  MとVを切り分け混在させない。
  Default*.tsで、MとVの接続を定義する。

[251229]

- 今DefaultEvents.tsで選択されている領域は類似構造を持つ記載ですのでまとめて読みやすくすることはできないでしょうか？

- Alt＋Q/W/EでModeを変更することができなくなってしまいました。全Panelで使用できるように修正してください。

- ChatとLogパネルの位置を入れ替えてください。

- Mode/ToolをLog/Chat Panelにも適応してください

- SplitterはPanelが完全に隠れるまで動かせるようにしてください。

- Panelの構成を以下のように健康します。
  LeftPanels,CenterPanels,RightPanelsの３つに分け、以下のようなPanelで構成します。
  LeftPanelsには上から、LibraryPanel, IndexPanel
  CenterPanelsにはShelfPanel, DeskPanel, SystemPanel
  RightPanelにはLogPanel, ChatPanel

- いったんPWA化は中断します。調査ありがとうございます。

[251227]

- では、マニフェストファイルの作成を設定し、スタンドアロンウィンドウでの動作検証をじっししてください

- マニフェストファイルの作成とはどういうことでしょうか？また、PWA化したアプリはローカルアプリになりますか？さらに、PWA化したとしても、通常のWebアプリに戻すことは可能ですか？

[251226]

- PWA化してもMacでの動作は可能でしょうか？　またbrowserを選びますか？

- 質問です。本webアプリをPWAとして実装することは可能なのでしょうか？　その際のメリット、デメリットを教えてください。

- ExAppモードの時は、ExAppモードを起動したときのmodifierkey（=Alt）をTTEventのmodifierKeyと現在押下中のmodifierKeyにかぶせたうえで比較することになっていたはずです。ですので、Altを指定していなくても、ExAppモードが継続されAltが押されていれば、invokeされるはずです。

- ExAppモードのときにAlt+ARROWUPをKeDownすればApplication.Window.State:nextがinvokeされるはずですが、そうなっていません。何が原因でしょうか？

- 質問です。このwebアプリではwindowサイズの種類はいくつありますか？　通常枠サイズのnormal、最大枠サイズのmax, ブラウザーの枠やメニュー、ステータスバーを消したアプリケーションのみのFullの3種類くらいでしょうか？

- 各ソースコード中の英語のコメントを日本語にしてください。

- DefaultStatus.ps1を参考に、'[Panels].Current.Mode'を移植してください。

- マウスでフォーカスをした場合はキー入力もフォーカスしたパネルに入りますが、キー入力でパネルのフォーカスを変更しても、キー入力がついてきません。原因調査し修正してください。

- Editorの初期状態は''としてください

- AddEvent の第1パラメータにExPanelを含む場合、ExModeにExLibrary, ExIndex, ExShelf, ExDesk, ExSystemが含まれればExModeが一致とする。

- AddEvent の第4パラメータに[ExMode]を含む場合、ExPanelのModeを指定する。

- AddEvent の第4パラメータに[FdMode]を含む場合、FdPanelのModeを指定する。

- AddEventの第4パラメータの文字終末が:で終わる場合、StatusIDに空文字を設定することとする。

- TTPanel.SetKeywordで値が設定されると、Viewの対応コンポーネントに値が設定されるようにしてください。

- DefaultStatus.ps1を参考に、[Panels].Table.Keyword, [Panels].Editor.Keyword, [Panels].WebView.Keyword  を移植してください。

- DefaultActions.ps1を参考にして、Panel.Keyword.ClearをDefaultActions.tsに定義して下さい。

[251225]

- GitHubへPushする際には、直前のコミットコメント、コミット日時、プロジェクト名を書き込んだ、version.mdというファイルを生成するように設定してください。

- ExModeモードのときは、押下済みのModifierKey、および、TTEventのModifierKeyに、ExModeモードが保持するキーをANDし、各ModifierKey同士を比較して、一致を検出します。

- ExModeが設定されている場合は、TTEventに設定されているModifierKeyがKeyDownされていれば一致とみなされ、複数ModifierKeyの組み合わせまで一致していなくてもInvokeされます。

- ControlとShiftが押されていないのに、押されているようにStatusBarに表示されています。内部変数がKeyUpの時に更新されていないものと思います。何かのキーのKeyDownの際は、modifierKeyをチェックして更新してください。また、modifierKeyのみのKeyDownは検知しないようにしてください。

- Application.Current.ExMode:ExIndexが、Alt+Iだけではなく、Alt+Shift+IでもInvokeされています。正しい組み合わせのときのみInvokeするようにしてください。

- FontはすべてMeiryoにしてください。

- StatusBar, Editor,KeywordのFontを1pt小さくしてください。

- Splitterを1pixcel増やし、mouseoverのときも色が変わるようにしてください。

- Panelタイトルの高さを15%削り、Splitterを2pxcel狭くします。

- Alt+L/S/I/DについてAddEventしましたが、Alt+Lだけ動きません。なぜでしょうか？　system設定のキーでしょうか？'

- Actionは次のキーが押されたタイミングで消去してください。

- AddEventのactionIdに”StatusID:val"の形式が指定された場合は、StatusIDのTTStateにvalを設定するアクションをTTActionsに登録し、そのActiobnID（”StatusID:val"）をEvent登録時に指定してください。

- DefaultStatus.ps1を参考にApplication.Current.ExModeをDefaultStatus.tsに移植してください。

- Tool (Keyword/Main) のフォーカスの切り替え時にもStatusBarが正しく更新されるように修正してください。

- Tool（KeywordとMain）の切り替わりのタイミングでStatusBarが更新されません。

- フォーカス変更やExMode変更時にはStatusBarも更新されるようにしてください。

- ExPanelはExModeの間違いですので修正してください。　ExModeが設定されていない場合は '*' を表示してください。

- 現在StatusBarにはKeyのみが表示されていますが、Status:Panel-Mode-Tool-ExPanel　　Key:ModifierKey+Key　　Action:ActionID、　のフォーマットで表示されるようにしてください。

- TTApplicationのKeyDown/KeyUpイベントにおけるTTEventの取り扱いについて説明します。
　TTEventは、KeyDownイベント時に、アプリケーションのContext状態と押下されたModifierKey/KeyをTTEventのメンバ変数と比較し、一致するときにメンバ変数であるNameをActionIDにもつTTActionをInvokeします。
　Contextプロパティには"Panel-Mode-Tool-ExMode"の順で文字列が設定されております。
　ContextプロパティのPanel-Mode-Toolの部分は、TTApplicationのFocusされているPanel/Mode/Toolと比較し、ExModeの部分はTTAplicationのExModeとの比較です。
　"Panel-Mode-Tool"の各部分に"*"が記載されている場合は無条件一致となり、"ExMode"部分に"*"が記載されている場合は、ExMode未設定時にのみ一致となります。
　つまりContextに "*-*-*-*" が設定されている TTEvent は、ExModeが設定されていないときのキー一致でTTActionがInvokeされます。
　また、Contextに "*-*-*-ExApp" が設定されている TTEvent は、ExModeがExAppのときにInvokeされます。
　その際、TTEventに設定されているModifierKeyがKeyDownされていればよく、複数ModifierKeyの組み合わせまで一致していなくてもInvokeされます。
　InvokeされたActionの返値がtrueの場合、それ以上のキーイベントは実行しません。

- TTEventのメンバー変数TagはContextに変更してください。

- TTEventを設定するためのスクリプトをDefaultEvent.ps1を参考に作成してください。

- アプリケーションのキーバインディングを管理するための変数を設定いたします。TTModel.ps1中のTTEvent/TTEventsを参考に作成してください。

- TTActionを設定するためのスクリプトをDefaultAction.ps1を参考に作成してください。

- アプリケーションのアクションを管理するための変数を設定いたします。TTModel.ps1中のTTAction/TTActionsを参考に作成してください。

- TTPanelにプロパティMode/Toolを設定し、SetMode/SetToolはsetterとしてください。
　３つのMode毎に tt-panel-content を設定し、Mode変更に伴いpanel-contentの表示を切り替えてください。
　Toolはpanel-content内のアクティブなコンポーネントを示します。
　親PanelにFocusがある場合Mode/Toolの変更はFocus変更を意味しますが、
　親PanelにFocusがない場合は、Modeの変更は表示のみの変更であり、Toolの変更はプロパティ値のみの変更になります。

- TTApplicationにstring型のExModeというプロパティを設定してください。getは値を返すだけです。setは以下のように実装してください。
　setする際には与えられたExMode値とともに、KeyDownされているmodifierキーを記録する。キーは記憶しない。
　KeyUpを監視し記録されたmodifierキーのいずれかがKeyUpされたときに、値をクリアする。[251224]

- TTStateを設定するためのスクリプトをDefaultStatus.ps1を参考に作成してください。

- アプリケーションの状態管理変数を設定いたします。TTModel.ps1中のTTState/TTStatusを参考に作成してください。

- 相談です。本アプリにおいて、ユーザーがキーバインディングを設定できるようにしたいです。
　具体的には、キー設定用のファイルに、コンテキスト（フォーカスパネル-フォーカスモード-フォーカスツール-Exモード）、
　モディファイキー、キーと、アクションIDを対応付設定をユーザーが記述できるようにしたいです。
　どのような形式で記載し、どの場所に配置すればよいでしょうか？
　実行時に変更することは想定していないため、ソースコードと同じ言語で記述し、初期化時に一回だけ読み込むことで構いません。

- Status Barの表示を、"Key:modifierキー+キー" の形で表示してください。

- Panelタイトル高さを1割小さくしてください。

- TTApplication.tsとTTPanel.psはView系のスクリプトですのでmodels/Viewというフォルダのなかで管理して下さい。そのほかはmodels/Modelというフォルダで管理してください。

- referenceフォルダのTTApplication.ps1/TTPanel.ps1を参考に、アプリケーション操作のためのTTApplication/TTPanelクラスを作成してください。

- referenceフォルダのTTModel.ps1を参考に、ユーザー定義データを管理するためTTObject/TTCollection/TTModelsを作成してください。

- StatusBarはPanelのTitleと同じ色を背景色に設定してください。

[251223]

- Status Barの色はアプリの色味と統一してください。

- Status Barを表示するようにしてください。そして、[(Modifierキー) (キー)] が表示されるようにしてください。

- FocusのあるPanelのタイトル先頭に "●" がつくようにしてください。

- 各PanelのタイトルであるLibrary|Index|Shelf|Desk|Systemの文字をもうひとつBold 10ptにしてください。

- SplitterはPanelが完全に隠れるまで動かせるようにしてください。

- Plate境界のSplitterを可動式に変更してください。また、移動中は色を変更してください。

- Thinktank Web Editorの文字を非表示にしてください

- 各PanelのKeyword部分のEditorは、1)行番号不要、2)Minimap不要、3)枠非表示、4) margin=1で表示してください。

[251222]

- reference/script内のTTApplication.xamlおよびTTPanel.xamlを参考にEditorの基本構造を構築してください。

- implementation plan, taskとも日本語で記載してください。

- Webアプリケーションのテキストエディターを作成します。まずは環境の準備について指示してください。monaco-editorを使ってください。

- ■ Monaco Editor 組み込みショートカット一覧
  - 検索・置換
    ショートカット コマンドID ラベル
    Ctrl+F           actions.find                                       Find
    Ctrl+H           editor.action.startFindReplaceAction               Replace
    F3               editor.action.nextMatchFindAction                   Find Next
    Shift+F3         editor.action.previousMatchFindAction               Find Previous
    Ctrl+F3           editor.action.nextSelectionMatchFindAction         Find Next Selection
    Ctrl+Shift+F3     editor.action.previousSelectionMatchFindAction     Find Previous Selection
    Ctrl+D           editor.action.addSelectionToNextFindMatch           Add Selection to Next Find Match
    Ctrl+Shift+L     editor.action.selectHighlights                     Select All Occurrences

  - 行操作
    ショートカット コマンドID ラベル
    Ctrl+Shift+K     editor.action.deleteLines                           Delete Line
    Alt+↑             editor.action.moveLinesUpAction                     Move Line Up
    Alt+↓             editor.action.moveLinesDownAction                   Move Line Down
    Shift+Alt+↑       editor.action.copyLinesUpAction                     Copy Line Up
    Shift+Alt+↓       editor.action.copyLinesDownAction                   Copy Line Down
    Ctrl+Enter       editor.action.insertLineAfter                       Insert Line Below
    Ctrl+Shift+Enter editor.action.insertLineBefore                     Insert Line Above
    Ctrl+J           editor.action.joinLines                             Join Lines
    Ctrl+L           extendLineSelection                                 Expand Line Selection

  - カーソル操作
    ショートカット コマンドID ラベル
    Ctrl+Alt+↑       editor.action.insertCursorAbove                     Add Cursor Above
    Ctrl+Alt+↓       editor.action.insertCursorBelow                     Add Cursor Below
    Ctrl+U           cursorUndo                                         Cursor Undo
    Ctrl+Shift+U     cursorRedo                                         Cursor Redo

  - コメント
    ショートカット コマンドID ラベル
    Ctrl+/          editor.action.commentLine                           Toggle Line Comment
    Ctrl+K Ctrl+C     editor.action.addCommentLine                       Add Line Comment
    Ctrl+K Ctrl+U     editor.action.removeCommentLine                     Remove Line Comment
    Shift+Alt+A       editor.action.blockComment                         Toggle Block Comment

  - インデント
    ショートカット コマンドID ラベル
    Ctrl+]          editor.action.indentLines                           Indent Line
    Ctrl+[          editor.action.outdentLines                         Outdent Line

  - フォールディング
    ショートカット コマンドID ラベル
    Ctrl+Shift+[     editor.fold                                         Fold
    Ctrl+Shift+]     editor.unfold                                       Unfold
    Ctrl+K Ctrl+0     editor.foldAll                                     Fold All
    Ctrl+K Ctrl+J     editor.unfoldAll                                   Unfold All

  - ☑ ナビゲーション
    ショートカット コマンドID ラベル
    Ctrl+G           editor.action.gotoLine                             Go to Line/Column...
    Ctrl+Shift+\     editor.action.jumpToBracket                         Go to Bracket
    F12               editor.action.revealDefinition                     Go to Definition
    Alt+F12           editor.action.peekDefinition                       Peek Definition
    Shift+F12         editor.action.goToReferences                       Go to References

  - ☑ コード編集
    ショートカット コマンドID ラベル
    Ctrl+Space       editor.action.triggerSuggest                       Trigger Suggest
    Ctrl+Shift+Space editor.action.triggerParameterHints                 Trigger Parameter Hints
    F2               editor.action.rename                               Rename Symbol
    Ctrl+.           editor.action.quickFix                             Quick Fix
    Shift+Alt+F       editor.action.formatDocument                       Format Document
    Ctrl+K Ctrl+F     editor.action.formatSelection                       Format Selection
    Ctrl+K Ctrl+X     editor.action.trimTrailingWhitespace               Trim Trailing Whitespace
    Ctrl+Shift+D     editor.action.duplicateSelection                   Duplicate Selection

  - ☑ その他
    ショートカット コマンドID ラベル
    F1               editor.action.quickCommand                         Command Palette
    Escape           -                                                   Cancel / Close

  - ☑ 基本操作（OS/ブラウザ共通）
    ショートカット 機能
    Ctrl+Z               Undo
    Ctrl+Y / Ctrl+Shift+Z Redo
    Ctrl+X               Cut
    Ctrl+C               Copy
    Ctrl+V               Paste
    Ctrl+A               Select All

- ■ Monaco Editor 組み込みコマンド一覧
  - 検索・置換
    ID ラベル
    actions.find Find
    actions.findWithSelection Find with Selection
    editor.action.nextMatchFindAction Find Next
    editor.action.previousMatchFindAction Find Previous
    editor.action.nextSelectionMatchFindAction Find Next Selection
    editor.action.previousSelectionMatchFindAction Find Previous Selection
    editor.action.startFindReplaceAction Replace
    editor.action.selectHighlights Select All Occurrences of Find Match
    editor.actions.findWithArgs Find with Arguments
  - カーソル操作
    ID ラベル
    editor.action.insertCursorAbove Add Cursor Above
    editor.action.insertCursorBelow Add Cursor Below
    editor.action.addCursorsToTop Add Cursors to Top
    editor.action.addCursorsToBottom Add Cursors to Bottom
    editor.action.insertCursorAtEndOfEachLineSelected Add Cursors to Line Ends
    editor.action.focusNextCursor Focus Next Cursor
    editor.action.focusPreviousCursor Focus Previous Cursor
    cursorUndo Cursor Undo
    cursorRedo Cursor Redo
  - 行操作
    ID ラベル
    editor.action.deleteLines Delete Line
    editor.action.copyLinesDownAction Copy Line Down
    editor.action.copyLinesUpAction Copy Line Up
    editor.action.moveLinesDownAction Move Line Down
    editor.action.moveLinesUpAction Move Line Up
    editor.action.joinLines Join Lines
    editor.action.insertLineAfter Insert Line Below
    editor.action.insertLineBefore Insert Line Above
    editor.action.insertFinalNewLine Insert Final New Line
    expandLineSelection Expand Line Selection
  - コメント
    ID ラベル
    editor.action.commentLine Toggle Line Comment
    editor.action.addCommentLine Add Line Comment
    editor.action.removeCommentLine Remove Line Comment
    editor.action.blockComment Toggle Block Comment
  - インデント
    ID ラベル
    editor.action.indentLines Indent Line
    editor.action.outdentLines Outdent Line
    editor.action.reindentlines Reindent Lines
    editor.action.reindentselectedlines Reindent Selected Lines
    editor.action.indentationToSpaces Convert Indentation to Spaces
    editor.action.indentationToTabs Convert Indentation to Tabs
    editor.action.indentUsingSpaces Indent Using Spaces
    editor.action.indentUsingTabs Indent Using Tabs
    editor.action.detectIndentation Detect Indentation from Content
  - テキスト変換
    ID ラベル
    editor.action.transformToUppercase Transform to Uppercase
    editor.action.transformToLowercase Transform to Lowercase
    editor.action.transformToTitlecase Transform to Title Case
    editor.action.transformToCamelcase Transform to Camel Case
    editor.action.transformToPascalcase Transform to Pascal Case
    editor.action.transformToSnakecase Transform to Snake Case
    editor.action.transformToKebabcase Transform to Kebab Case
  - 並べ替え
    ID ラベル
    editor.action.sortLinesAscending Sort Lines Ascending
    editor.action.sortLinesDescending Sort Lines Descending
    editor.action.reverseLines Reverse lines
    editor.action.removeDuplicateLines Delete Duplicate Lines
  - 選択
    ID ラベル
    editor.action.smartSelect.expand Expand Selection
    editor.action.smartSelect.shrink Shrink Selection
    editor.action.duplicateSelection Duplicate Selection
    editor.action.setSelectionAnchor Set Selection Anchor
    editor.action.selectToBracket Select to Bracket
    editor.action.addSelectionToNextFindMatch Add Selection to Next Find Match
    editor.action.addSelectionToPreviousFindMatch Add Selection to Previous Find Match
    editor.action.moveSelectionToNextFindMatch Move Last Selection to Next Find Match
    editor.action.moveSelectionToPreviousFindMatch Move Last Selection to Previous Find Match
  - 削除
    ID ラベル
    deleteAllLeft Delete All Left
    deleteAllRight Delete All Right
    deleteInsideWord Delete Word
    editor.action.trimTrailingWhitespace Trim Trailing Whitespace
  - ナビゲーション
    ID ラベル
    editor.action.gotoLine Go to Line/Column...
    editor.action.jumpToBracket Go to Bracket
    editor.action.marker.next Go to Next Problem
    editor.action.marker.prev Go to Previous Problem
    editor.action.marker.nextInFiles Go to Next Problem in Files
    editor.action.marker.prevInFiles Go to Previous Problem in Files
  - その他
    ID ラベル
    editor.action.quickCommand Command Palette
    editor.action.triggerSuggest Trigger Suggest
    editor.action.showHover Show or Focus Hover
    editor.action.hideHover Hide Hover
    editor.action.showContextMenu Show Editor Context Menu
    editor.action.openLink Open Link
    editor.action.removeBrackets Remove Brackets
    editor.action.transpose Transpose Characters around the Cursor
    editor.action.transposeLetters Transpose Letters
    editor.action.moveCarretLeftAction Move Selected Text Left
    editor.action.moveCarretRightAction Move Selected Text Right
    editor.action.pasteAs Paste As...
    editor.action.pasteAsText Paste as Text
    editor.action.clipboardCopyWithSyntaxHighlightingAction Copy with Syntax Highlighting
    editor.action.fontZoomIn Increase Editor Font Size
    editor.action.fontZoomOut Decrease Editor Font Size
    editor.action.fontZoomReset Reset Editor Font Size
    editor.action.toggleHighContrast Toggle High Contrast Theme
    editor.action.inlineSuggest.trigger Trigger Inline Suggestion
    editor.action.inlineSuggest.toggleShowCollapsed Toggle Inline Suggestions Show Collapsed
