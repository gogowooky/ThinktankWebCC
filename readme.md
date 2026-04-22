# ログ

## 依頼事項

* なんとなくの「考えてること」でタブ化したいな。で、タブ名はkeywordにしたい。
かといって、「考えてること」タブではほかのことを考えてはいけない、ようにはしたくない
「あなたオントロジー」

* データの種別と保管方法について

1) アプリが取扱うTTDataItemデータはすべてテキストデータ（markdown）で、「category/種別」属性を持つ
2) 現時点の{種別}は {memo/chat/group/link/data}で、後からも追加可
3) データ種別ごとの記載内容は以下
   * memo: メモ: テキストの文章
   * chat: チャット: AIとの対話の記録、追記不可。
      タイトルが1行目、ユーザー発話は #で始まる行、AI発話は自由記載
   * group: グループ: 保管庫データを選別するfilter、または、保管庫データからの選別データのIDの一覧
      タイトルが1行目、filterは >で始まる行、個別データは *で始まる行 他は自由表記
   * link: リンク: テキストの記録されたURL、ローカルファイルURI、Google Driveファイル、Google Photoデータへのリンクとその付随情報
      タイトルが1行目、個別データは *で始まる行 他は自由表記
   * data: データ: csvデータ
      タイトルが1行目、テーブルタイトルは #で始まる行、その後は 空行で区切られた1行のcsvデータ行があれば列名、その後、空行までのcsvはデータ行。
      空行後に テーブルタイトル行があれば、複数テーブル表記可
4) TTDataItemのテキストデータは「storage/保管庫」に保存され、アプリでは複数保管庫を扱えるが、保管庫間の移動は行わない
5) 保管庫は LocalFS ではディレクトリで構成される
   * {datafolder}/{保管庫名}/{memo/chat/group/link/data}/{ID:yyyy-MM-dd-hhmmss}.{拡張子}
6) 保管庫は BigQueryでは 保管庫名や属性で構成される
   * file_type: {.md}
   * category: {memo/chat/group/link/data}
   * table name: {保管庫名}

* メインパネルのtopicタブとその内部表示データの種別と表示方法について

1) メインパネルには複数のtopicタブが表示される
2) topicタブは、一つの{group}ファイルIDを持ち、その{group}に含まれるアイテムを各メディアで閲覧・編集を行う
3) topicタブの内部を分割し、各メディアを並べて表示させることも可能とする
4) アプリ起動時には空の{group}ファイルでtopicタブを1つ開くが、それは全保管庫の全データを対象とする。
5) topicタブ生成時には{group}ファイルがdatagridメディアで表示されている状態、その後はメディアで選択されたデータが表示される。
6) データを表示する方法/メディアは {texteditor/markdown/datagrid/graph/chat}
   * texteditor: {memo/chat/group/link/data}の編集・閲覧
   * martkdown: {memo/chat/group/link}の閲覧
   * datagrid: {group/link/data}の編集・閲覧
   * graph: {memo/chat/group/link/data}の閲覧
   * chat: 主に新規チャット用、{chat}を読み込むケースも想定
7) 各メディアは最上位にタイトルバーを持つ。　表示内容は以下
   * （左寄せ）← → ボタン：　表示データ履歴を行き来できる。
   * （左寄せ）チェックボタン：　表示のtopicタブの{group}に含まれることを示す。 通常inactive
   * タイトル
   * （右寄せ）メディア選択ボタン：　アイテムが表示可能なメディアのボタン

* 左端ツールバーと左パネルの機能について

1) アプリ左端のツールバーはグループビュー（topicタブ）の制御用。押下によって各種左パネルが開閉。
2) アプリ左端のツールバーに以下ボタンを設置

   * topicボタン：
   　- これまでのtopic
     * 保管庫のpulldown選択肢、履歴付textbox、filterボタン、全文検索ボタン、データリスト表示用のDataGrid、タブ作成ボタン

   * 新規topicボタン：
   　表示内容：　保管庫のpulldown選択肢、履歴付textbox、filterボタン、全文検索ボタン、データリスト表示用のDataGrid、タブ作成ボタン

   * データグリッドボタン：
   * ハイライトボタン：

## 2026/04/19

### Phase9をすすめてください

一旦、コミット・プッシュしてください。コミットコメントの先頭には Phase番号を記載してください。

### Phase7をすすめてください。Phase8をすすめてください

これまでの経過のうち、 docs\20260418_Thinktank_Implementation_Plan_v4.md には未記載の実施事項があって、次回の再構築時に必要なことがあれば、実装計画として Phase8 に記載してください。その後、コミット・プッシュしてください。コミットコメントの先頭には Phase番号を記載してください。

### Phase6をすすめてください

これまでの経過のうち、 docs\20260418_Thinktank_Implementation_Plan_v4.md には未記載の実施事項があって、次回の再構築時に必要なことがあれば、実装計画として Phase6 に記載してください。その後、コミット・プッシュしてください。コミットコメントの先頭には Phase番号を記載してください。

### Phase5をすすめてください

これまでの経過のうち、 docs\20260418_Thinktank_Implementation_Plan_v4.md には未記載の実施事項があって、次回の再構築時に必要なことがあれば、実装計画として Phase5 に記載してください。その後、コミット・プッシュしてください。コミットコメントの先頭には Phase番号を記載してください。

### Phase4実装してください

これまでの経過のうち、 docs\20260418_Thinktank_Implementation_Plan_v4.md には未記載の実施事項があって、次回の再構築時に必要なことがあれば、実装計画として Phase4 に記載してください。その後、コミット・プッシュしてください。コミットコメントの先頭には Phase番号を記載してください。

### Phase3を実装してください

完了

### Phase1/2

これまでの経過のうち、 docs\20260418_Thinktank_Implementation_Plan_v4.md には未記載の実施事項があって、次回の再構築時に必要なことがあれば、実装計画として Phase2 に記載してください。

これまでの経過のうち、 docs\20260418_Thinktank_Implementation_Plan_v4.md には記載していないが実施したことで、次回の再構築時に必要なことについては、実装計画として Phase1 に記載してください。

## 2026/04/15

Phase21に関連する作業を進めたいです。しかし、規模がおおきくなる可能性があり、分割して順序よくすすめるためにプラン作成する必要がありそうです。進めたい内容は以下の①～④の各項目ですが、開発途中の随時で関連機能が追加されることを想定していますので、今回は機能追加のためのしくみ作りを主作業とし、いくつかの機能追加の実施を通じてその機能を確認するところまでをスコープとしたいです。①アプリの状態管理変数を集中管理するしくみを構築する。このしくみは既に基礎的には実装されていると認識していますが、これをTTStatus/TTStateで集中管理＋制御できるようにしたいです。これは状態を変更するActionを実装する上での基礎となります。②小さい機能単位をActionとして定義し集中管理し、KeyBindingやMenuと連携するしくみを構築する（TTActions/TTAction）。重要な点は、Actionは基本的には基礎機能を呼び出すまたは組み合わせることで機能を実装することを主旨とし、機能自体はアプリのUIクラス、状態管理クラス、データ管理クラス（TTKnowledgeなど）などの基礎クラスに対して追加実装します。その際、基礎クラス間でクロストークしないように厳重注意して実装してください。Actionから別のActionも呼び出せるようにします。③ TTEvents/TTEventは、マウスやタッチ、キーボードなどのイベントとActionとのBindingを管理し、アプリのショートカット機能を実現します。各イベント処理ではアプリの状態管理（特にUIフォーカスや特殊モード）に応じたActionを呼び出します。特にテキスト入力にかかわるイベントでは判定が遅いとUIとして使いにくくなるため、最小限の判定でActionが呼び出せるようにしてください。④ポップアップメニューまたはインクリメンタルメニューをモーダル表示させるActionも実装します。表示されるMenuの内容は、アプリの状態管理（特にUIフォーカスや特殊モード）に応じて変わるContextMenuとして実装しますので、状態管理と表示Actionを連携させる仕組みが必要です。

上記の参考として ./reference2/src/models/以下の TTAction.ts,TTEvent.ts,TTState.ts/TTStatus.ts を挙げます。これらは ./reference2/src/Controllers/以下の*Actions.tsで集中管理されており、開発途中で機能追加しやすくなっています。

また、上記の方法とは異なる方法ですが、上記のデータクラスやアイテム内容の定義は相互に関連するため、すべての定義を統一的・集中的に管理できるのが良いようにも思います。下記はTTState/TTAction/TTEvent/TTMenuの定義フォーマットを記載したもので、これらをまとめて管理することで、クラスごとではなくアプリ状態別に記載でき、UIの理解・整理がしやすくなるように思います。

# State管理   *IDとNameの管理, 実装は別

# State:  {ActionID} | {ActionName}

State:  DataGrid.Item.Selected.Remove | カーソル位置アイテムを削除

State:  DataGrid.Item.Checked.Remove | チェック付きアイテムを削除

# Action管理   *IDとNameの管理, 実装は別

# Action:  {ActionID} | {ActionName}

Action:  DataGrid.Item.Selected.Remove | カーソル位置アイテムを削除

Action:  DataGrid.Item.Checked.Remove | チェック付きアイテムを削除

# Event管理   *修飾キーは ^:ctrl, +:shift, #:alt

# Event: {Focusコンポーネント名,特殊Mode} | {Key等} | {ActionID}

Event: DataPanel | Delete | DataGrid.Item.Selected.Remove

Event: DataPanel | ^D | DataGrid.Item.Selected.Remove

Event: DataItem | ^+Delete | DataGrid.Item.Checked.Remove

# Menu管理

# Menu: {Focusコンポーネント名,特殊Mode} | {Menu階層} | {ActionID}

Menu: DataPanel | 編集 > 削除 | DataGrid.Item.Selected.Remove

Menu: DataItem | 編集 > 削除 | DataGrid.Item.Checked.Remove

以上について理解し、プランを作成してほしいのですが、まず、想定される実装上の不備などがあれば教えて下さい。

そのやり取りが終了しましたら、Phase21のサブフェーズとして段階的に進める実装プランを作成し、docs\20260402_Thinktank_Implementation_Plan.mdに追記してください。

2026/04/10
各パネルの機能を拡張します。WebViewPanelにも表示モードを導入しますが基本的には常時Chatモードです。タイトルの"WebView"の文字は表示せず、"Chat | {ユーザー発言内容(文字幅自動調節)}"と表示してください。フォーカス時の"●"は表示します。AddressバーはChatバーと改名します。ChatバーはChatの発言以外にも機能を持たせる予定です。タイトルバーの右の外部ブラウザへの移行ボタンは残してください。

2026/04/08
・Phase18
機能を全体的に向上させるため、各パネルの機能を拡張します。

・Phase18 ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　の Phase18 に追記

2026/04/07
・Phase18 ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　の Phase18 に追記

2026/04/06
・Phase16 ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　の Phase16 に追記
・Phase16 完了 ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　の Phase16 に追記
・Phase15
・Phase15 完了　ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　の Phase15 に追記
・Phase15
ターミナル1: npm run server:dev（バックエンドサーバー起動）
ターミナル2: npm run dev（Viteフロントエンド起動）
ブラウザで <http://localhost:5173/> を開く
WebViewのアドレスバーに /view/chat?session=test-001 を入力
チャットUIでメッセージを送信 → AIの回答がストリーミング表示
または直接 <http://localhost:5173/view/chat?session=test-001> をブラウザで開いてもチャットUIが表示されます。

2026/04/03
・Phase14 完了　ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　に追記
・Phase13 実装済　すでに実装済のルールで　docs\20260402_Thinktank_Implementation_Plan.md　の Phase13 を上書きしてください。  
・Phase12 完了  
・Phase11 完了
・Phase10 完了　ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　に追記
・Phase09 完了　ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　に追記
・Phase08 完了　ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　に追記

2026/04/02
・Phase07 完了　ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　に追記
・Phase06 完了　ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　に追記
・Phase05 完了　ここまでの個別変更を　docs\20260402_Thinktank_Implementation_Plan.md　に追記
・Phase04 完了
・Phase03 完了
・Phase02 完了
・プランを作成
　docs\20260402_Thinktank_Implementation_Plan.md
