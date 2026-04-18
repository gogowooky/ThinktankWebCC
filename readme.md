2026/04/19
これまでの経過のうち、 docs\20260418_Thinktank_Implementation_Plan_v4.md には記載していないが実施したことで、次回の再構築時に必要なことについては、実装計画として Phase1 に記載してください。

2026/04/15
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
