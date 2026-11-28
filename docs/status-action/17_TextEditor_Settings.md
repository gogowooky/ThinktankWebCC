# TextEditor Settings ===============================================================================================
## Action：　260907　TextEditor.KeyBinding.Load
description:    Vault内の「ThinktankKeyBinding」という名前のMemoを読み込み、キー設定をDefaultに戻してから適用する（Memoに無いキーはDefaultの状態になる）
　Working>TextEditor設定>設定>キー設定のfile-penアイコンボタンから実行する。
　Vault内でタイトルが「ThinktankKeyBinding」（大文字小文字不問）のMemoを検索し、見つかれば
　`resetToDefault()` で docs/DefaultShortcut.md の状態へ戻したうえで、その内容
　（docs/DefaultShortcut.md と同じテーブル形式）で TTShortcutManager.mergeContent() を呼び、
　key が一致する行を置換する（見つからない場合は何もしない）。
　260905の初期実装は `_loadFromContent()`（全件差し替え）で、メモに書かれていないショートカットが
　消える不具合があったため260907に現在の設定へマージする方式へ変更したが、それでは過去のLoadや
　手動変更が積み上がるため、260910に「Defaultへリセットしてから適用」へ再変更した。
　結果は常に「Default + Memo」で、実行回数によらず同じ状態になる。
　TTShortcutManager はUndo/Redoの対象外のため、この変更もUndo対象外。
　アプリ再起動時には反映されない（起動時は常に docs/DefaultShortcut.md を読み込む）。
## Action：　260905　TextEditor.KeyBinding.Reset
description:    キー設定をDefaultの状態に戻す
　Working>TextEditor設定>設定>キー設定のfile-xアイコンボタンから実行する。
　docs/DefaultShortcut.md の内容でショートカット設定を初期状態に戻す（全件差し替え）。
## Action：　261013　TextEditor.KeyBinding.Save
description:    現在のキー設定をVault内の「ThinktankKeyBinding」という名前のMemoに書き戻す（無ければ作る）
　Working>TextEditor設定>設定>キー設定のfile-inputアイコンボタンから実行する（ツールチップ「ThinktankKeyBindingに書き戻す」）。
　Vault内でタイトルが「ThinktankKeyBinding」（大文字小文字不問）のMemoを探し、あればタイトル行を残して本文を現在値で上書き保存、
　無ければその名前で新しいMemoを作る（src/views/actions/bindingMemo.ts）。
　本文は docs/DefaultShortcut.md と同じ表形式（> focus,exmode,key,action,description）で、現在の全ショートカットを書く
　（TTShortcutManager.serializeTable()）。key の "|" は複数キー区切りと区別するため "\|" に、"," や '"' を含むセルは CSV の引用で書く。
　Load と同じ形式で書くので、書き戻した後に Load すると同じ状態に戻る。結果はステータスバーの ACTION 欄に表示する。
## Action：　260905　TextEditor.ColorBinding.Load
description:    Vault内の「ThinktankColorBinding」という名前のMemoを読み込み、色設定をDefaultに戻してから適用する（Memoに無い項目はDefaultの状態になる）
　Working>TextEditor設定>設定>色設定のfile-penアイコンボタンから実行する。
　Vault内でタイトルが「ThinktankColorBinding」（大文字小文字不問）のMemoを検索し、見つかれば
　まず DEFAULT_COLOR_ENTRIES（docs/DefaultColor.md）を適用して初期状態へ戻し、続いてその内容
　（docs/DefaultColor.md と同じCSV形式：StatusID, Color, BgColor, Attrs）を適用する
　（見つからない場合は何もしない）。260910に「現在の設定へ上書き」から本方式へ変更した。
　結果は常に「Default + Memo」で、実行回数によらず同じ状態になる。TTUIStateManager.applyProperties() を pushUndo=false で呼ぶため、
　Undoスタックへの記録は行わない。localStorage / __tt_ui_state__ には反映されるため、次回起動後も残る。
## Action：　260905　TextEditor.ColorBinding.Reset
description:    色設定をDefaultの状態に戻す
　Working>TextEditor設定>設定>色設定のfile-xアイコンボタンから実行する。
　docs/DefaultColor.md の内容で色設定を初期状態に戻す。Load同様、Undoスタックへの記録は行わない。
## Action：　261013　TextEditor.ColorBinding.Save
description:    現在の色設定をVault内の「ThinktankColorBinding」という名前のMemoに書き戻す（無ければ作る）
　Working>TextEditor設定>設定>色設定のfile-inputアイコンボタンから実行する（ツールチップ「ThinktankColorBindingに書き戻す」）。
　Vault内でタイトルが「ThinktankColorBinding」（大文字小文字不問）のMemoを探し、あればタイトル行を残して本文を現在値で上書き保存、
　無ければその名前で新しいMemoを作る（src/views/actions/bindingMemo.ts）。
　本文は docs/DefaultColor.md と同じ「StatusID, Color, BgColor, Attrs」形式で、DefaultColor.md の全 StatusID の現在値を書く。
　Load と同じ形式で書くので、書き戻した後に Load すると同じ状態に戻る。結果はステータスバーの ACTION 欄に表示する。
## Action：　260907　TextEditor.SearchTag.Load
description:    Vault内の「ThinktankSearchTag」という名前のMemoを読み込み、タグ定義をDefaultに戻してから適用する（Memoに無いidはDefaultの状態になる）
　Working>TextEditor設定>設定>タグ設定のfile-penアイコンボタンから実行する。
　docs/DefaultSearchTag.md は他の2つと異なり ?raw バンドルではなく、サーバー
　（server/routes/systemRoutes.ts の /api/system/search-tags・/search-tag-items）がリクエストの
　たびにファイルを直接読んで配信する方式のため、サーバー側は一切変更せずクライアント側の
　2つの消費モジュール（src/utils/tagInsertMenu.ts のタグ挿入メニュー、
　src/views/actions/textEditorCursorContentActions.ts のURLテンプレート解決）それぞれに
　「サーバー取得分」と「Vaultメモ由来の上書き分」を分けて持たせ、idキーでマージして返すよう変更した。
　Vault内でタイトルが「ThinktankSearchTag」（大文字小文字不問）のMemoを検索し、見つかれば
　reset*Override() で上書き分を一度破棄してサーバー取得分（＝Default）へ戻したうえで、その内容
　（docs/DefaultSearchTag.md と同じ ID, "Description", URL 形式。新設の
　src/utils/searchTagFormat.ts でパース）を適用する（見つからない場合は何もしない）。
　上書き分は元々まるごと差し替える実装なので挙動自体は変わらないが、他2つと同じ
　「Defaultへ戻してから適用」の手順に揃えてある（260910）。
　この機能はTTUIStateManager/TTShortcutManagerのどちらにも属さない独立モジュールのため、
　Undo/永続化のいずれの対象にもならない（セッション中のみ有効）。
## Action：　260907　TextEditor.SearchTag.Reset
description:    タグ定義をDefaultの状態に戻す
　Working>TextEditor設定>設定>タグ設定のfile-xアイコンボタンから実行する。
　Vaultメモ由来の上書き分をクリアし、サーバー取得分（docs/DefaultSearchTag.md）に戻す。
## Action：　261013　TextEditor.SearchTag.Save
description:    現在のタグ定義をVault内の「ThinktankSearchTag」という名前のMemoに書き戻す（無ければ作る）
　Working>TextEditor設定>設定>タグ設定のfile-inputアイコンボタンから実行する（ツールチップ「ThinktankSearchTagに書き戻す」）。
　Vault内でタイトルが「ThinktankSearchTag」（大文字小文字不問）のMemoを探し、あればタイトル行を残して本文を現在値で上書き保存、
　無ければその名前で新しいMemoを作る（src/views/actions/bindingMemo.ts）。
　本文は docs/DefaultSearchTag.md と同じ「ID, "Description", URL」形式で、サーバー取得分に Vaultメモの上書きを重ねた現在の
　タグ定義を書く（URL の無いタグは NoURL）。タグ定義を取得できないときは書き戻さない。
　Load と同じ形式で書くので、書き戻した後に Load すると同じ状態に戻る。結果はステータスバーの ACTION 欄に表示する。
## Action：　261101　TextEditor.Dictionary.Load
description:    Vault内の「ThinktankDictionary」という名前のMemoを読み込み、辞書をDefaultに戻してから適用する（Memoに無いキーはDefaultの状態になる）
　A（261101実装）：既定の辞書は docs/DefaultDictionary.yaml（YAMLのマッピング）。src/utils/defaultDictionary.ts が
　　?raw で取り込み、モジュール読み込み時（起動時）に js-yaml でパースして DEFAULT_DICTIONARY に持つ。
　　各所からは getDictionary() / lookupDictionary(key) / lookupDictionaryString(key) で参照する
　　（key は "親.子" のドット区切りで入れ子もたどれる。トップレベルに同名のキーがあればそちらを優先）。
　　変化を追う場合は onDictionaryChange() で購読する。
　　Load は Memo の本文（1行目のタイトルを除く）を YAML として読み、トップレベルのキー単位で既定値に重ねる。
　　YAML として読めないときは辞書を変えずにエラーを返す。登録は src/views/actions/textEditorDictionaryActions.ts。
　　キー割当・ボタンは未設定（TTActions.Execute / コマンドから実行可能）。
## Action：　261101　TextEditor.Dictionary.Reset
description:    辞書をDefaultの状態に戻す
　Vaultメモ由来の上書き分をクリアし、docs/DefaultDictionary.yaml の内容に戻す。
## Action：　261101　TextEditor.Dictionary.Save
description:    現在の辞書をVault内の「ThinktankDictionary」という名前のMemoに書き戻す（無ければ作る）
　既定値に上書きを重ねた現在の辞書を docs/DefaultDictionary.yaml と同じ YAML 形式で書く（src/views/actions/bindingMemo.ts）。
　Load と同じ形式なので、書き戻した後に Load すると同じ状態に戻る。
