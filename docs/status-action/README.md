# Status・Action の仕様（docs/status-action/）

アプリの Status（状態）と Action（操作）の仕様を、領域ごとのファイルに分けて置いている。
番号付きのファイル（`01_Application.md` 〜 `20_Others.md`）はアプリに取り込まれ、番号順につなげて起動時に読み込まれる
（`src/views/statusActionBinding.ts`）。このREADMEはアプリに読み込まれない。

| ファイル | 内容 |
|---|---|
| 01_Application.md | Application（アプリ全体） |
| 02_ToolBar.md | ToolBar |
| 03〜09_Panel_*.md | 各パネル（AIChat・Focused・Thinktank・Seeds・Working・Harvest・D&D） |
| 10〜18_TextEditor_*.md | テキストエディタ（編集・アクション・検索/置換・カーソル・見出し・設定・日付など） |
| 19_Table_Display.md | テーブル表示 |
| 20_Others.md | その他 |

新しい領域のファイルを足すときは、読み込み順が決まるよう番号を付ける。

# IDの命名規則および設計ルール
本アプリの Action と Status の ID ルール：
1. Action/Statusはともに、*.*.* 形式のIDを基本とします。
2. Statusは読み取り専用とします。
3. Status値の変更はActionで行い、そのActionのIDは、{Status ID}:*形式のIDとします。

# AIへの指示
・ このフォルダの番号付きファイルでは、実装または修正をしてほしいStatusまたはActionについて、以下のフォーマットで記載いたします。
　修正の単位はAction/Status記載されているsection(## Action/Status名)単位で行ってください。
　下に示したフォーマットの、見出し行の指示（実装、調査、修正）に従ってください。
　指示の実施完了後に日付を追加または変更してください。
　完了後はコミットコメントに概要を記入し、commit&pushしてください。
　対応中のタイトルが分かるように表示してください。

・実装または修正をしてほしいStatusまたはActionのフォーマット
(行頭) ## Action 実装：　日付　ID　　⇒　指定IDのActionをコンテンツ内容に基づいて実装し、成功したら実装→完了としてください。
(行頭) ## Action 修正：　日付　ID　　⇒　指定IDのActionをコンテンツ内容に基づいて修正し、成功したら修正→完了としてください。
(行頭) ## Action 調査：　日付　ID　　⇒　指定IDのActionをコンテンツ内容について調査・回答を追記し、成功したら修正→完了としてください。
(行頭) ## Action 完了：　日付　ID　　⇒　指定IDのActionについては変更の必要はありません。
(行頭) ## Action：　日付　ID　　⇒　指定IDのActionについては変更の必要はありません。

(行頭) ## Status 実装：　日付　ID　　⇒　指定IDのStatusをコンテンツ内容に基づいて実装し、成功したら実装→完了としてください。
(行頭) ## Status 修正：　日付　ID　　⇒　指定IDのStatusをコンテンツ内容に基づいて修正し、成功したら修正→完了としてください。
(行頭) ## Status 調査：　日付　ID　　⇒　指定IDのStatusをコンテンツ内容について調査・回答を追記し、成功したら修正→完了としてください。
(行頭) ## Status 完了：　日付　ID　　⇒　指定IDのStatusについては変更の必要はありません。
(行頭) ## Status：　日付　ID　　⇒　指定IDのStatusについては変更の必要はありません。

・各節のプロパティ（番号付きファイルはアプリに取り込まれ、起動時に読み込まれます）
　Action 節：ActionID は見出しの最後の語です（「key」行は書きません）。
　　「description」行の値が、そのActionの説明としてアプリで使われます（コード側の説明より優先）。
　Status 節：「key」行が StatusID です。「current」行の値が起動時の初期値になり、保存済みの値があればそちらが優先されます。
　　読み取り専用の Status は「default」行の値が使われます。「description」「type」「candidates」はコード側の定義が使われます。
　説明文の中で、行頭（字下げを除いて）に「key:」「description:」などのプロパティ名を書くと、プロパティとして読まれるので避けてください。
　

