# TextEditor Find/Replace ========================================================================================
## Action：　260716　TextEditor.CurrentEditor.ShowFind
description:    検索ダイアログを表示/非表示トグルする
　↓検索ダイアログボックスが表示されている場合は非表示にする　→終了
　↓monacoeditorのdefaultの検索ダイアログボックスを表示してフォーカスする
## Action：　260716　TextEditor.CurrentEditor.ShowReplace
description:    置換ダイアログを表示/非表示トグルする
　↓置換ダイアログボックスが表示されている場合は非表示にする　→終了
　↓monacoeditorのdefaultの置換ダイアログボックスを表示してフォーカスする

　A：monaco既定のアクション（actions.find / editor.action.startFindReplaceAction）を
　　そのまま実行しています。ダイアログを開いた直後に、保存済みの検索・置換オプション
　　（下記Status）をウィジェットへ反映します。
　　※プレビュー実行環境では、monaco既定のCtrl+H等を直接押した場合と同様に、ダイアログの
　　表示は行われるもののフォーカス移動が働かないことを確認しています（monaco側のrAF依存の
　　フォーカス処理が環境要因で効かないためで、本アクション固有の問題ではありません）。

　A（260716追記）：表示中のダイアログを非表示にするトグル動作を追加しました。
　　- ShowFind：置換行を伴わない検索ダイアログが表示中（isRevealed かつ !isReplaceRevealed）
　　　であれば closeFindWidget() で閉じて終了します。
　　- ShowReplace：置換行を伴う置換ダイアログが表示中（isRevealed かつ isReplaceRevealed）
　　　であれば同様に閉じて終了します。
　　検索のみ表示中に ShowReplace を押すと置換行を追加して展開し、置換表示中に ShowFind を
　　押しても閉じません（monaco既定の actions.find の挙動に委ねています）。
## Action：　260715　TextEditor.FindOption.MatchCase:Toggle
description:    検索オプション「大文字小文字を区別」をトグルする
　検索オプションの値を変更する
## Action：　260715　TextEditor.FindOption.MatchWholeWord:Toggle
description:    検索オプション「単語単位で検索」をトグルする
　検索オプションの値を変更する
## Action：　260715　TextEditor.FindOption.UseRexp:Toggle
description:    検索オプション「正規表現」をトグルする
　検索オプションの値を変更する
## Action：　260715　TextEditor.ReplaceOption.PreserveCase:Toggle
description:    置換オプション「大文字小文字を保持」をトグルする
　置換オプションの値を変更する

　A：値は WorkingPanel.TextEditor.FindOption / ReplaceOption に永続化されます。
　　検索/置換ダイアログが表示中の場合は、トグルと同時に開いているダイアログのチェック
　　ボックス状態にも即座に反映されます。
## Status：　260715　TextEditor.FindOption.MatchCase
　検索オプションの値
## Status：　260715　TextEditor.FindOption.MatchWholeWord
　検索オプションの値
## Status：　260715　TextEditor.FindOption.UseRexp
　検索オプションの値
## Status：　260715　TextEditor.ReplaceOption.PreserveCase
　置換オプションの
