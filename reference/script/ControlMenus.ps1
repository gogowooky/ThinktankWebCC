#::: メニュー   Line, Word
#region Application                 #::: アプリメニュー}
Add-TTControlMenu     Application     '_O)操作>_Q)終了'                           Application.Operation.Quit
Add-TTControlMenu     Application     '_O)操作>_D)デバッグ>_R)*'                  Application.Run.Break
Add-TTControlMenu     Application     '_O)操作>_R)リセット>_S)Status'             Application.Reset.Status
Add-TTControlMenu     Application     '_O)操作>_R)リセット>_M)Memo'               Application.Reset.Memos
Add-TTControlMenu     Application     '_O)操作>_R)リセット>_F)全ファイル入替'     Application.Data.Import 
Add-TTControlMenu     Application     '_O)操作>_F)フォルダ'                       Application.SubMenu.Folder
Add-TTControlMenu     Application     '_V)表示>_D)フォント>_L)拡大'               Application.Window.FontSize:Up
Add-TTControlMenu     Application     '_V)表示>_D)フォント>_S)縮小'               Application.Window.FontSize:Down
Add-TTControlMenu     Application     '_V)表示>_M)モニター>_N)次へ'               Application.Window.Screen:next
Add-TTControlMenu     Application     '_V)表示>_M)モニター>_P)前へ'               Application.Window.Screen:prev
Add-TTControlMenu     Application     '_V)表示>_W)ウィンドウ>_L)さ大きく'         Application.Window.State:Maximized
Add-TTControlMenu     Application     '_V)表示>_W)ウィンドウ>_S)小さく'           Application.Window.State:Normal
Add-TTControlMenu     Application     '_V)表示>_S)スタイル>_F)全パネル'           Application.Border.Style:All
Add-TTControlMenu     Application     '_V)表示>_S)スタイル>_S)標準'               Application.Border.Style:Standard
Add-TTControlMenu     Application     '_V)表示>_S)スタイル>_T)アイテム詳細'       Application.Border.Style:ItemDetail
Add-TTControlMenu     Application     '_V)表示>_S)スタイル>_N)アイテム一覧'       Application.Border.Style:ItemList
Add-TTControlMenu     Application     '_V)表示>_S)スタイル>_Z)禅'                 Application.Border.Style:Zen
Add-TTControlMenu     Application     '_V)表示>_S)スタイル>_D)デバッグ'           Application.Border.Style:Debug
Add-TTControlMenu     Application     '_V)表示>_M)メニュー'                       Application.Menu.Visible:Toggle
#endregion
Add-TTControlMenu     Panel           '_T)テーブル>_S)セットリソース'             Panel.SubMenu.Table
Add-TTControlMenu     Panel           '_T)テーブル>_R)行ヘッダ切替'               [FdPanel].RowHeader.Visible:toggle
Add-TTControlMenu     Panel           '_T)テーブル>_C)列ヘッダ切替'               [FdPanel].ColumnHeader.Visible:toggle
Add-TTControlMenu     Panel           '_E)エディター>_M)メモ>_L)一覧'             Panel.SubMenu.Editor
Add-TTControlMenu     Panel           '_E)エディター>_M)メモ>_G)作成'             Editor.Memo.New
Add-TTControlMenu     Panel           '_E)エディター>_M)メモ>_S)保存'             Editor.Memo.Save
Add-TTControlMenu     Panel           '_E)エディター>_W)ワードラップ>_O)ON'       Editor.WordWrap.On
Add-TTControlMenu     Panel           '_E)エディター>_W)ワードラップ>_F)OFF'      Editor.WordWrap.Off
Add-TTControlMenu     Panel           '_E)エディター>_W)ワードラップ>_T)Toggle'   Editor.WordWrap.Toggle
Add-TTControlMenu     Panel           '_K)キーワード>_C)クリア'                   Panel.Keyword.Clear
Add-TTControlMenu     Panel           '_K)キーワード>_K)履歴'                     Panel.SubMenu.Keyword
Add-TTControlMenu     Panel           '_P)パネル>_F)フォント>_L)文字拡大'         Panel.FontSize.Up
Add-TTControlMenu     Panel           '_P)パネル>_F)フォント>_S)文字縮小'         Panel.FontSize.Down
Add-TTControlMenu     Panel           '_P)パネル>_B)境界>_L)左移動'               Panel.Border.Left
Add-TTControlMenu     Panel           '_P)パネル>_B)境界>_R)右移動'               Panel.Border.Right
Add-TTControlMenu     Panel           '_P)パネル>_B)境界>_U)上移動'               Panel.Border.Up
Add-TTControlMenu     Panel           '_P)パネル>_B)境界>_D)下移動'               Panel.Border.Down
Add-TTControlMenu     Panel           '_P)パネル>_C)現位置>_P)前移動'             Panel.Move.PrevItem
Add-TTControlMenu     Panel           '_P)パネル>_C)現位置>_N)後移動'             Panel.Cursor.Next
Add-TTControlMenu     Panel           '_P)パネル>_C)現位置>_F)先頭移動'           Panel.Cursor.First
Add-TTControlMenu     Panel           '_P)パネル>_C)現位置>_L)末尾移動'           Panel.Cursor.Last

Add-TTControlMenu     Panel           '_E)エディター>_M)メモ>_)保存'             Editor.Memo.Save


#endregion
#region Actor WebPath               #::: アクション文字 WebPath
Add-TTControlMenu     WebPath         '_V)表示>_V)ブラウザ'               WebPath.Send.ToBrowser
Add-TTControlMenu     WebPath         '_V)表示>_E)エクスプローラ'         WebPath.Send.ToExplorer
Add-TTControlMenu     WebPath         '_C)コピー>_C)そのまま'             WebPath.Copy.It
Add-TTControlMenu     WebPath         '_C)コピー>_S)ショートカット'       WebPath.ShortCut.ToClipboard
Add-TTControlMenu     WebPath         '_C)コピー>_D)URLデコード'          WebPath.Copy.UrlDecoded
Add-TTControlMenu     WebPath         '_C)コピー>_E)URLエンコード'        WebPath.Copy.UrlEncoded
#endregion
#region Actor FilePath              #::: アクション文字 FilePath    
Add-TTControlMenu     FilePath        '_V)表示>_V)場所を開く'             FilePath.Select.WithExplorer
Add-TTControlMenu     FilePath        '_V)表示>_O)開く'                   FilePath.Open.WithExplorer
Add-TTControlMenu     FilePath        '_C)コピー>_C)そのまま'             FilePath.Uri.ToClipboard
Add-TTControlMenu     FilePath        '_C)コピー>_S)ショートカット'       FilePath.ShortCut.ToClipboard
Add-TTControlMenu     FilePath        '_C)コピー>_F)ファイル'             FilePath.File.ToClipboard
#endregion
#region Actor ChildPath
Add-TTControlMenu     ChildPath       '_V)表示>_V)ブラウザ'               ChildPath.Send.ToBrowser
Add-TTControlMenu     ChildPath       '_V)表示>_E)エクスプローラ'         ChildPath.Send.ToExplorer
Add-TTControlMenu     ChildPath       '_C)コピー>_C)そのまま'             ChildPath.Copy.It
Add-TTControlMenu     ChildPath       '_C)コピー>_S)ショートカット'       ChildPath.ShortCut.ToClipboard
Add-TTControlMenu     ChildPath       '_C)コピー>_D)URLデコード'          ChildPath.Copy.UrlDecoded
Add-TTControlMenu     ChildPath       '_C)コピー>_E)URLエンコード'        ChildPath.Copy.UrlEncoded
#endregion
#region Actor Selection             #::: アクション文字 Selection
Add-TTControlMenu     Selection       '_S)ウェブ検索'         Selection.SubMenu.WebSearch
Add-TTControlMenu     Selection       '_T)検索タグ付加'       Selection.SubMenu.WebSearchTag
Add-TTControlMenu     Selection       '_K)キーワード設定'     Selection.CopyTo.Keyword
Add-TTControlMenu     Selection       '_M)メモ検索'           Selection.Search.Memo
Add-TTControlMenu     Selection       '_D)空行削除'           Selection.Delete.BlankLine
Add-TTControlMenu     Selection       '_;)コメント'           Selection.ToBe.Commented
Add-TTControlMenu     Selection       '_R)引用'               Selection.ToBe.Referred
Add-TTControlMenu     Selection       '_E)例示'               Selection.ToBe.Exampled
Add-TTControlMenu     Selection       '_X)切取り'             Selection.Cut.ToClipboard
Add-TTControlMenu     Selection       '_C)コピー'             Selection.Copy.ToClipboard
#endregion
#region Actor Date
Add-TTControlMenu     Date            '_M)メモフィルター'     Date.Filter.Memo
Add-TTControlMenu     Date            '_F)フォーマット'       Date.SubMenu.Format
Add-TTControlMenu     Date            '_S)タイプ'             Date.SubMenu.Type
Add-TTControlMenu     DateTag         '_M)メモフィルター'     Date.Filter.Memo
Add-TTControlMenu     DateTag         '_F)フォーマット'       Date.SubMenu.Format
Add-TTControlMenu     DateTag         '_S)タイプ'             Date.SubMenu.Type
Add-TTControlMenu     JDate           '_M)メモフィルター'     Date.Filter.Memo
Add-TTControlMenu     JDate           '_F)フォーマット'       Date.SubMenu.Format
Add-TTControlMenu     JDate           '_S)タイプ'             Date.SubMenu.Type
Add-TTControlMenu     GDate           '_M)メモフィルター'     Date.Filter.Memo
Add-TTControlMenu     GDate           '_F)フォーマット'       Date.SubMenu.Format
Add-TTControlMenu     GDate           '_S)タイプ'             Date.SubMenu.Type
#endregion
#region Actor Mark
Add-TTControlMenu     Mark            'メニューキーで即時実行'     Mark.Set.Prev
# Add-TTControlMenu     Mark            'マーク一覧'     Mark.SubSet.Item  #::: [241006] 今後対応

#endregion
#region Actor Route     
Add-TTControlMenu     Route           '_V)*'                  Route.Send.ToBrowser
Add-TTControlMenu     Route           '_C)*'                  Route.Copy.It
Add-TTControlMenu     Route           '_S)*'                  Route.ShortCut.ToClipboard
#endregion
#region Actor Reference             #::: アクション文字 Reference
Add-TTControlMenu     Reference       '_J)引用先に移動'       Reference.JumpTo.Cited
Add-TTControlMenu     Reference       '_I)引用先を実行'       Reference.Invoke.Cited
Add-TTControlMenu     Reference       '_N)次のタグ'           Reference.Move.Next
Add-TTControlMenu     Reference       '_P)前のタグ'           Reference.Move.Prev
Add-TTControlMenu     Reference       '_F)最初のタグ'         Reference.Move.First
Add-TTControlMenu     Reference       '_L)最後のタグ'         Reference.Move.Last
#endregion
#region Paste PasteText             #::: ペースト PasteText
Add-TTControlMenu     PasteText       '_I)そのまま'           PasteText.Intact.Text
Add-TTControlMenu     PasteText       '_C)コメント(;)'        PasteText.Commented.Text
Add-TTControlMenu     PasteText       '_R)引用(＞)'           PasteText.Referred.Text
Add-TTControlMenu     PasteText       '_E)例示(|)'            PasteText.Exampled.Text
#endregion
#region Paste PasteOutlookMail      #::: ペースト PasteOutlookMail
Add-TTControlMenu     PasteOutlookMail    '_1)*'              PasteOutlookMail.As.MailTag
Add-TTControlMenu     PasteOutlookMail    '_2)*'              PasteOutlookMail.As.TagTitle
Add-TTControlMenu     PasteOutlookMail    '_3)*'              PasteOutlookMail.As.SenderTag
Add-TTControlMenu     PasteOutlookMail    '_4)*'              PasteOutlookMail.As.SenderTagTitle
Add-TTControlMenu     PasteOutlookMail    '_5)*'              PasteOutlookMail.As.MailBody
#endregion
#region Keyword
Add-TTControlMenu     Keyword             '_W)ウェブ検索'     Selection.SubMenu.WebSearch
Add-TTControlMenu     Keyword             '_M)メモ検索'       Selection.Search.Memo
#endregion
#region TTCollection
Add-TTControlMenu     TTCollection        '_E)ExPanel'        TTCollection.SendTo.ExPanel
Add-TTControlMenu     TTCollection        '_F)FocusPanel'     TTCollection.SendTo.FocusPanel
#endregion
#region TTMemo
Add-TTControlMenu     TTMemo              '_P)表示パネル'       TTMemo.SubMenu.Panel
Add-TTControlMenu     TTMemo              '_C)コピー'           TTMemo.CopyTo.Clipboard
Add-TTControlMenu     TTMemo              '_E)エディタ'         TTMemo.LoadTo.Editor
Add-TTControlMenu     TTMemo              '_D)削除'             TTMemo.Delete.Memo
#endregion



