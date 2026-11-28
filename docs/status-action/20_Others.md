# その他
## AI Chatの運用の仕方１
Thinktank>Chat では 問題解決の template, skelton 作成して、Seedsでパッケージ化して、workingで内容書いて、Harvestで回答を得るパターンがありえそうですね

## AI Chatの運用の仕方２
Thinktank>Chat で既存のlinksファイルを Referenceしながら概要を捉え、


## 完了：その他：タグ
TextEditor.CurrentEditor.TextOnCursorPos にはカーソル位置で取得されたアクション用の Tag が設定されますが、
そのTagのアクションについて以下のように分類しなおして、各subTag毎でアクションを再定義することを考えています。
各subTagの例示において、大文字はタグ文字（ただし運用は大文字小文字混和可)、小文字はパラメータ文字です。
1. Tag.WebSearch:       docs\DefaultSearchTag.mdで定義済みの WebSearch 用タグ
2. Tag.GoogleRoute:     GoogleMapでplace1,2,3...を通るルートを表示するためのタグ        例：[GOOGLEROUTE:plasce1,place2,place3...]
3. Tag.YahooTransfer:   Yahoo乗換案内で電車を検索するためのタグ                         パラメータは "key value" 形式のCSV（key: from/to/dep/arr/via、viaは省略可、dep/arrはhh:mm形式、dep優先）
                        例：[YAHOOTRANSFER:from 東京駅,to 大阪駅,via 名古屋駅,dep 10:00]
4. Tag.Think:           4.1 特定thinkファイルを指定するためのタグ                       例：[THINK:id] [MEMO:id](前方互換用)
                        4.2 Thinktank>Think一覧のタイトル絞込でkeywordsを検索するタグ   例：[THINK:keywords] [MEMO:keywords](前方互換用)
                        4.3 Thinktank>Think一覧のコンテンツ絞込でkeywordsを検索するタグ 例：[THINK:>keywords] [MEMO:>keyword](前方互換用)
5. Tag.Mail             5.1 特定mailを指定するタグ                                      例：[MAIL]:ID]（アクション未実装）
                        5.2 mail検索をするためのタグ                                    例：[MAIL]:keywords]（アクション未実装）
6. Tag.Chat             6.1 Thinktank>Think一覧でタイトル絞込みでkeywords検索するタグ(chatフィルター付)   例：[CHAT:keywords]
7. Tag.AI              外部AI(ai:GEMINI,CLAUDE,CHATGTP)へ接続し、sentenceで問い合わせるためのタグ        例：[ai:>] sentence
8. Tag.Anchor           8.1 ファイル内で[:anchor]で始まる行に飛ぶためのタグ             例：[:>anchor]
                        8.2 anchorテキストをHighlighterとして設定するためのタグ         例：[:anchor]
本方針を踏まえて、TextEditor.CurrentEditor.DoOnCursorPos:Tag:Open は廃止する代わりに、
各TextEditor.CurrentEditor.DoOnCursorPos:{subTag}:Open を作成します。
TextEditor.CurrentEditor.TextOnCursorPosは正しい{subTag}値になるよう修正してください。
TextEditor.CurrentEditor.DoOnCursorPosは上記の例示を参考に、各TextEditor.CurrentEditor.DoOnCursorPos:{subTag}:Openへと正しく分岐するように修正してください。

## 完了:　260614　ToolBar.KeyActionのTextBox中に表示されている値を説明してください
 　A：ステータスバーの `KeyAction` モード（`StatusBarKeyActionPanel`）では、以下の項目が横並びで表示され、ユーザーの入力やフォーカス状態を監視します。
 　　- **focus** (フォーカスエリア名): 現在キーボードフォーカスがあるDOM要素に対応するエリア名。例: `Thinktank.Filter`, `Working.Texteditor`, `Harvest.Chat` など。
 　　- **mod** (修飾キー): 現在押されている修飾キー（`Ctrl`, `Alt`, `Shift`, `Meta`）。
 　　- **key** (キー名): 現在押下された直近のキー名（例: `A`, `Space`, `Enter` などの大文字表示）。
 　　- **mouse** (マウス操作): 直近のマウスイベントタイプとクリック座標（例: `click(320, 840)` など）。
 　　- **touch** (タッチ操作): 直近のタッチイベントタイプとタッチポイント数（例: `touchstart(1)` など）。
 　　- **exmode** (EXモード): 現在有効になっている一時的な拡張ショートカットモード（例: `Command`, `Highlight` など）。
 　　- **exmod** (EX修飾キー): 拡張モードのトリガーになっている修飾キー。
 　　- **action** (直前アクション): 直前に実行されたショートカットやコマンド等のアクション名（例: `L20へ移動`, `L5折畳` など）。

<!--  -->
