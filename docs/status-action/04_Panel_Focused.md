# Panel Focused ====================================================================================================

## Action 完了：　261021　FocusedPanel.Area.OpenStepwise
エリアが閉じているとき：エリアを開く　→終了
下位項目をすべて開く →終了
「Shift+FocusedPanelの開ボタン左クリック」にこのアクションをBindする
description:    フォーカスパネルのエリアを段階的に開く
## Action 完了：　261021　FocusedPanel.Area.CloseStepwise
エリアが開いているときで、下位項目の一部が開いているとき：すべての下位項目を閉じる　→終了
エリアを閉じる →終了
「Shift+FocusedPanelの閉ボタン左クリック」にこのアクションをBindする
description:    フォーカスパネルのエリアを段階的に閉じる

　A（261020実装）：src\views\TTFocusedPanelActions.ts に2アクションを登録しました。
　　- 対象パネルは今のキーボードフォーカス（getFocusName）から決め、取れなければ FocusedColumn を使います。
　　　WorkingSetting / Working はどちらも Working の設定エリアが対象です。
　　- 「下位項目」はエリア内の開閉セクション（見出しの ▼／▶）と <details> です。
　　　開閉はエリア開閉ボタンの Shift+クリックと同じ仕組み（hooks\usePanelSectionsSetAll.ts の
　　　setPanelSectionsAll）で行います。
　　- 「一部が開いているか」は、いま表示されている見出しが ▼ か、開いた <details> があるかで判定します
　　　（表示していないセクションの開閉状態は数えません）。Working は Pane 側の Markdown にも
　　　<details> があるため、設定エリア（.working-setting-area）の中だけを見ます。
　　- エリアを開くときの幅は変えません（その時点の OpenWidth のまま）。
　　- 閉じているエリアに CloseStepwise を実行したときは何もしません（[閉じている]）。
　　- Bind：各パネルの縦タブバーの開閉ボタン（components\Layout\VerticalTabBar.tsx）で、
　　　Shift+右クリックすると、開ボタン（エリアが閉じている）なら OpenStepwise、
　　　閉ボタン（エリアが開いている）なら CloseStepwise を実行します。押したボタンのパネルが
　　　対象になるよう、実行前にそのボタンへフォーカスを移します。ブラウザの右クリックメニューは出さず、
　　　DefaultShortcut.md のマウス割当（right1）にも流しません。
　　- 注意：開閉ボタンはエリアを開くと閉ボタンに変わるため、ボタンからは OpenStepwise の2段目
　　　（下位項目をすべて開く）に届きません。2段目はキー割当や TTActions.Execute から実行できます。
　　- テスト：src\views\TTPanelAreaStepwise.test.ts
## Action：　260917　FocusedPanel.Area.IsOpen:Toggle
エリアを開くときはFocusedPanel.Area.OpenWidth:Userの位置で開く
description:    フォーカスパネルのエリア開閉をUser位置でトグルする

## Action：　260917　FocusedPanel.Area.IsOpen:ToggleForEdit
エリアを開くときはFocusedPanel.Area.OpenWidth:ForEditの位置で開く
description:    フォーカスパネルのエリア開閉をForEdit位置でトグルする
## Action：　260917　FocusedPanel.Area.OpenWidth:Initial
description:    フォーカスパネルOpen時の幅を初期値にする
## Action：　260917　FocusedPanel.Area.OpenWidth:User
description:    フォーカスパネルOpen時の幅をユーザー設定値にする
## Action：　260917　FocusedPanel.Area.OpenWidth:ForEdit
description:    フォーカスパネルOpen時の幅を編集時の値にする
## Action：　260917　FocusedPanel.Area.OpenWidth:Toggle
description:    フォーカスパネルOpen時の幅をUser/ForEditでtoggleする
## Action：　260619　FocusedPanel.Mode.Name:Prev
description:    フォーカスパネルの表示モードを前に切り替える
## Action：　260619　FocusedPanel.Mode.Name:Next
description:    フォーカスパネルの表示モードを次に切り替える
## Action：　260902　FocusedPanel.Filter.CursorPos:PrevLine
description:    フォーカスパネルのThink一覧のカーソルを1行前に移動する
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のカーソルを1行上に移動します。
## Action：　260902　FocusedPanel.Filter.CursorPos:NextLine
description:    フォーカスパネルのThink一覧のカーソルを1行後に移動する
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のカーソルを1行下に移動します。
## Action：　260902　FocusedPanel.Filter.Cursor:Action
description:    フォーカスパネルのThink一覧のカーソル位置のアイテムを開く
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のカーソル位置を開きます。
## Action：　260902　FocusedPanel.AIChat.CursorPos:PrevLine
description:    フォーカスパネルのAI相談のカーソルを1行前に移動する
　現在フォーカスされているパネルにAI相談パネルがある場合、そのパネルのAI相談のカーソルを1行上に移動します。
## Action：　260902　FocusedPanel.AIChat.CursorPos:NextLine
description:    フォーカスパネルのAI相談のカーソルを1行後に移動する
　現在フォーカスされているパネルにAI相談パネルがある場合、そのパネルのAI相談のカーソルを1行下に移動します。
## Action：　260902　FocusedPanel.AIChat.Cursor:Action
description:    フォーカスパネルのAI相談のカーソル位置を開く
　現在フォーカスされているパネルにAI相談パネルがある場合、そのパネルのAI相談のカーソル位置を開きます。

　A（260902実装）：src\views\TTFocusedPanelActions.ts に6アクションを登録しました。
　　- FocusedPanel.Filter.CursorPos:PrevLine / NextLine / Cursor:Action
　　　キーボードフォーカスがあるパネル（getFocusName 基準の focusedColumnLive()。
　　　260902修正前は app.FocusedColumn 参照で遅延キャッシュのズレにより誤爆していた）が
　　　Thinktank / Seeds のとき、既存の {ThinktankPanel|SeedsPanel}.Filter.* へ
　　　TTActions.Execute で委譲します（それ以外のパネルは [Think一覧なし]）。カーソル状態は
　　　既存の panel.CurrentItemID / FilteredThoughts をそのまま使うため挙動は Think一覧と同一です。
　　- FocusedPanel.AIChat.CursorPos:PrevLine / NextLine
　　　AI相談の chat ファイル一覧（ThinktankChatMemoPicker）はモデル層のカーソルを持たず
　　　React ローカル state 駆動のため、フォーカス中パネル（Thinktank / Seeds）配下の
　　　.tt-chat-picker .thoughts-list（ArrowUp/Down/Enter 対応済み）へ keydown を送出して
　　　カーソル移動します。メモピッカーはカーソル移動時に対象 chat を即ロードします。
　　- FocusedPanel.AIChat.Cursor:Action
　　　上記のとおり移動時点で chat はロード済みのため、「開く」= その対話へ入る、として
　　　同パネルの .ai-chat-view__input（チャット入力欄）へフォーカスを移します。
　　キー割当は docs\DefaultShortcut.md の focus 列 *Filter（FocusedPanel.Filter.*）/
　　*Chat（FocusedPanel.AIChat.*）で、それぞれ getFocusName が返す Thinktank.Filter /
　　Seeds.Filter、Thinktank.Chat / Seeds.Chat に後方一致でマッチします。
## Action：　260902　FocusedPanel.Filter.ContentType:Next
description:    フォーカスパネルのThink一覧の種別アイコンフォーカスを次に移動する
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のContentTypeアイコンのフォーカスを次のアイコンに移動します。
　アイコンはメインの6アイコンの他、全種別をクリアのアイコンも含めます。
## Action：　260902　FocusedPanel.Filter.ContentType:Prev
description:    フォーカスパネルのThink一覧の種別アイコンフォーカスを前に移動する
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のContentTypeアイコンのフォーカスを前のアイコンに移動します。
　アイコンはメインの6アイコンの他、全種別をクリアのアイコンも含めます。
## Action：　260902　FocusedPanel.Filter.Menu:Next
description:    フォーカスパネルのThink一覧のメニューアイコンフォーカスを次に移動する
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のMenuアイコンのフォーカスを次のアイコンに移動します。
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧の
　メニューリボン（.thinktank-menu-ribbon / .seeds-menu-ribbon）のアイコンを
　キーボードフォーカスのカーソルとして前後移動・押下します。

　A（260902実装）：src\views\TTFocusedPanelActions.ts の共通ヘルパー
　　registerIconStripActions() で ContentType / Menu 2系統を登録しました。
　　対象ボタン群はモデル層のカーソルを持たず React ローカル state 駆動のため、
　　フォーカス中パネル（getFocusName 基準の focusedColumnLive()。Thinktank / Seeds）
　　配下の実 DOM ボタン要素を左→右順に取得し、document.activeElement をカーソルとして扱います。
　　- ContentType: .tt-search-bar__types / .ov-search-bar__types 内の
　　　.tt|ov-search-bar__type-btn / __type-all（6種別 + 右端の全種別クリア/選択）。
　　　空なら [種別フィルタなし]。
　　- Menu: .thinktank-menu-ribbon / .seeds-menu-ribbon 内の .menu-ribbon__btn
　　　（無効ボタンは除外）。空なら [メニューなし]。
　　- :Next / :Prev — 次／前へ .focus() を循環移動（未フォーカスからは Next=先頭 / Prev=末尾）。
　　　フォーカス位置は各 CSS の :focus アウトライン（ThinktankSearchBar.css /
　　　SeedsSearchBar.css / Layout/MenuRibbon.css）で可視化。
　　- :Action — フォーカス中のボタンが対象群のいずれかなら .click() で既存ハンドラへ委譲。
　　　未フォーカス時は [アイコン未フォーカス]。
　　キー割当は docs\DefaultShortcut.md の focus 列 *Filter / exmode ExApp。
　　ContentType は M / Shift+M / "," 、Menu は未割当（TTActions.Execute でも実行可）。

　　A（260902修正・不具合対応）：「動かない」報告を受け以下3点を修正。
　　　1. 対象パネルの解決を app.FocusedColumn（focusin→rAF 経由の遅延キャッシュで、
　　　　 rAF 未発火時などに古い値が残る）から、getFocusName(document.activeElement) 基準の
　　　　 focusedColumnLive() に変更。ショートカットの focus 条件（*Filter / *Chat）と同じ
　　　　 判定基準になり、実際にキーボードフォーカスがあるパネルへ確実にディスパッチする。
　　　　 FocusedPanel.Filter.CursorPos:* / FocusedPanel.AIChat.* も同修正で堅牢化。
　　　2. Space キーが効かない問題。KeyboardEvent.key はスペースを ' '（半角スペース）で
　　　　 返すため、keyboardUtils.ts の KEY_NAME_MAP に ' ' → 'space' を追加しキー定義の
　　　　 "Space" と一致させた。
　　　3. .focus() は :focus-visible ヒューリスティックに乗らずアウトラインが出ないため、
　　　　 CSS を :focus に変更。

　　A（260902修正・不具合対応その2）：「Seeds の Think一覧では効かない」報告を受け修正。
　　　Seeds の検索バーは Thinktank の .tt-search-bar__* ではなく .ov-search-bar__* の
　　　接頭辞を使う別コンポーネント（SeedsSearchBar）だった。focusedTypeFilterButtons() の
　　　セレクタに .ov-search-bar__types / __type-btn / __type-all を追加し、
　　　SeedsSearchBar.css にも同じ :focus アウトラインを追加。Thinktank / Seeds 両方で
　　　Next / Prev / Toggle が動くことを実機確認（FocusedColumn を別パネルにしても正しく動作）。
## Action：　260902　FocusedPanel.Filter.Menu:Prev
description:    フォーカスパネルのThink一覧のメニューアイコンフォーカスを前に移動する
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧のMenuアイコンのフォーカスを前のアイコンに移動します。
## Action：　260902　FocusedPanel.Filter.FocusedIcon:Action
description:    フォーカスパネルのThink一覧でフォーカス中のアイコンを押下する
　現在フォーカスされているパネルにThink一覧パネルがある場合、そのパネルのThink一覧で
　フォーカスされているアイコン（種別アイコン / メニューアイコンのいずれか）を押下します。
　（旧 ContentType:Action / Menu:Action を統合。実装内容は下部 # Panel セクションの
　　FocusedPanel.Filter の A（260902実装）を参照）
