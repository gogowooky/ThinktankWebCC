

#region ::: アプリ
Add-TTAction    ExPanel.BeFocused.OrContextMenu         'ExPanel GiveMe Focus' {    # 250517
    $expanel = [TTExModMode]::ExPanel

    if ( [TTExModMode]::FdPanel() -eq $expanel ) {
        Invoke-TTAction 'Panel.Open.ContextMenu' @{}
    }
    else {
        Apply-TTState 'Application.Focus.Panel' $expanel.Name
    }
    return $true
 }
Add-TTAction    Application.SubMenu.Folder              'フォルダ一覧' {
    Param($tag)
    $menu = $tag.Menu

    $folders = $global:Models.Status.GetItems().where{
        $_.ID -like 'Application.System.*Path'
    }.foreach{
        $value = $_.Value
        $mitm = [MenuItem]::New()
        $mitm.Header = ( '_{0}){1}' -f $_.ID.split('.')[2][0], $_.Description )
        $mitm.Tag = $tag + @{ Path = $_.Value }
        $mitm.Add_Click({
                Param($subm)
                Invoke-TTAction 'FilePath.Open.WithExplorer' (@{ Value = $subm.Tag.Path })
            })
        $menu.AddChild($mitm)
    }
    return $true
 }
Add-TTAction    Application.Operation.Quit              '終了' {
    $res = [System.Windows.MessageBox]::Show( "終了しますか", "QUIT", 'YesNo', 'Question')
    switch ( $res ) {
        'No' { return $true }
    }
    $global:Controller.Quit()
    return $true
 }
Add-TTAction    Application.Reset.Status                '設定リセット' {
    $global:Models.Status.GetItems().foreach{
        Apply-TTState   $_.ID Default
    }       
    return $true
 }
Add-TTAction    Application.Reset.Memos                 'メモリセット' {
    $global:Models.Memos.ResetItems()
    return $true
 }
Add-TTAction    Application.Data.Import                 'ps3からデータ取得' {
    $origpath = 'C:\Users\69887\Box\個人フォルダ\2019-04-01\2022-02-08_desktop\ps3\text'
    $dstpath = 'C:\Users\69887\Box\個人フォルダ\2019-04-01\2022-02-08_desktop\Memo'

    Remove-Item -Recurse $dstpath -Force
    New-Item $dstpath -ItemType Directory -Force
    Copy-Item "$origpath\*.txt" -Destination "$dstpath" -Recurse

    Get-ChildItem "$dstpath\*.txt" | Rename-Item -NewName { $_.Name -replace '.txt$', '.md' }
    return $true
 }
Add-TTAction    Application.Run.Break                   'デバッグ画面で改行' {
    Write-Host ''
    return $true
 }

Add-TTAction    Application.Archive.All                 '全メモをアーカイブ' {

   # AES暗号化のパスフレーズ（安全なパスフレーズに変更してください）
    $passphrase = "2r9N7/U8sWFpLCgSmJA1/Q=="

    # カレントディレクトリの.mdファイルをすべて取得
    $files = Get-ChildItem -Filter *.md

    # ファイルを100個ずつ処理
    for ($i = 0; $i -lt $files.Count; $i += 100) {
        $fileBatch = $files[$i..($i + 99)] | Where-Object { $_ } # 最後のバッチでnullエラーが発生するのを防ぐ

        # zipで圧縮（圧縮率を高く設定）
        $archiveName = "archive_$i.zip"
        Compress-Archive -Path $fileBatch.FullName -DestinationPath $archiveName -CompressionLevel Optimal

        # AES暗号化
        $aes = New-Object System.Security.Cryptography.AesCryptoServiceProvider
        $aes.Key = [System.Text.Encoding]::UTF8.GetBytes($passphrase)
        $aes.IV = [byte[]](0..15) # 初期化ベクトル（IV）は固定値を使用（必要に応じて変更してください）
        $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
        $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7

        $encryptor = $aes.CreateEncryptor()
        $encryptedBytes = $encryptor.TransformFinalBlock((Get-Content -Path $archiveName -Encoding Byte), 0, (Get-Content -Path $archiveName -Encoding Byte).Length)
        $encryptedText = [System.Convert]::ToBase64String($aes.IV + $encryptedBytes) # IVを先頭に付加

        # テキストファイルに保存
        $outputFileName = "encrypted_$i.txt"
        $encryptedText | Out-File $outputFileName

        # 中間ファイルを削除
        Remove-Item $archiveName
    }

    Write-Host "処理が完了しました。"
 }
Add-TTAction    Application.Dearchive.File              'クリップボードのテキスト→ファイル' {

    # AES復号化のパスフレーズ（暗号化時に使用したパスフレーズを入力してください）
    $passphrase = "2r9N7/U8sWFpLCgSmJA1/Q=="

    # クリップボードから暗号化されたテキストを取得
    $encryptedText = Get-Clipboard

    # Base64デコード
    $encryptedBytes = [System.Convert]::FromBase64String($encryptedText)

    # AES復号化
    $aes = New-Object System.Security.Cryptography.AesCryptoServiceProvider
    $aes.Key = [System.Text.Encoding]::UTF8.GetBytes($passphrase)
    $aes.IV = $encryptedBytes[0..15]
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7

    $decryptor = $aes.CreateDecryptor()
    $decryptedBytes = $decryptor.TransformFinalBlock($encryptedBytes, 16, $encryptedBytes.Length - 16)

    # zipファイルとして保存
    $outputFileName = '.\decrypted.zip'
    [System.IO.File]::WriteAllBytes($outputFileName, $decryptedBytes)
    Invoke-Item '.\'

    Write-Host "復号化とzipファイルへの保存が完了しました。"
 }
Add-TTAction    Application.Create.EncryptPhrase        'パスフレーズ作成' {
    # ランダムなバイト列を生成
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $bytes = New-Object byte[] 16 # パスフレーズの長さ（バイト単位）
    $rng.GetBytes($bytes)

    # バイト列をBase64エンコード
    $passphrase = [System.Convert]::ToBase64String($bytes)

    # パスフレーズを使用
    Write-Host "パスフレーズ: $passphrase"
 }

Add-TTAction    Application.Outlook.MoveSelected        'Outlook選択メールをBackup' {   # 250517
    Param( $actor )
    $outlook = [TTOutlook]::New()
    $outlook.BackupMail( 'selected' )
    $outlook.Finalize()
 }
#endregion
#region ::: パネル
Add-TTAction    Panel.Open.ContextMenu          'Panel Menu表示' {
    Param($Tag)
    [TTExModMode]::ExFdPanel().ShowMenu({
        Param($menu)
        $global:Controller.ClearMenu( $menu )
        $global:Controller.BuildMenu( 'Panel', $menu, $script:Tag )
    }.GetNewClosure())

    return $true
 }
Add-TTAction    Panel.Keyword.Clear             'Keywordクリア' {
    $panel = [TTExModMode]::ExFdPanel()
    $mode = $panel.GetMode()
    Apply-TTState "$($panel.Name).$mode.Keyword" ''
    return $true
 }
Add-TTAction    Panel.FontSize.Up               'パネル文字サイズ拡大' {
    $pname = [TTExModMode]::ExFdPanel()
    $state = Get-TTState "$pname.Panel.FontSize"
    if ( [int]$state -lt 20 ) { $state = [int]$state + 1 }
    Apply-TTState "$pname.Panel.FontSize" $state
    return $true
 }
Add-TTAction    Panel.FontSize.Down             'パネル文字サイズ縮小' {
    $pname = [TTExModMode]::ExFdPanel()
    $state = Get-TTState "$pname.Panel.FontSize"
    if ( 7 -lt [int]$state ) { $state = [int]$state - 1 }
    Apply-TTState "$pname.Panel.FontSize" $state

    return $true
 }
#endregion
#region ::: アイテム選択・実行
#region --- common interface
Add-TTAction    Panel.Move.PrevItem             '移動：前のアイテム' {
    Param( $actor )
    $mode = [TTExModMode]::ExFdPanel().GetMode()
    Invoke-TTAction "$mode.Move.PrevItem" $actor 
    return $true
 }
Add-TTAction    Panel.Move.NextItem             '移動：次のアイテム' {
    Param( $actor )
    $mode = [TTExModMode]::ExFdPanel().GetMode()
    Invoke-TTAction "$mode.Move.NextItem" $actor 
    return $true
 }
Add-TTAction    Panel.Move.FirstItem            '移動：先頭のアイテム' {
    Param( $actor )
    $mode = [TTExModMode]::ExFdPanel().GetMode()
    Invoke-TTAction "$mode.Move.FirstItem" $actor 
    return $true
 }
Add-TTAction    Panel.Move.LastItem             '移動：末尾のアイテム' {
    Param( $actor )
    $mode = [TTExModMode]::ExFdPanel().GetMode()
    Invoke-TTAction "$mode.Move.LastItem" $actor 
    return $true
 }
Add-TTAction    Panel.Selected.Invoke           'アイテム実行' {
    Param( $actor )
    $mode = [TTExModMode]::ExFdPanel().GetMode()
    Invoke-TTAction "$mode.Selected.Invoke" $actor 
    return $true
 }
Add-TTAction    Panel.Selected.Menu             'アイテムメニュー' {
    Param( $actor )
    $mode = [TTExModMode]::ExFdPanel().GetMode()
    Invoke-TTAction "$mode.Selected.Menu" $actor 
    return $true
 }
write-host "250912: 常にTableのN番をSelectすることにするのはどうか、"
Add-TTAction    Panel.Nth.Invoke                'N番アイテム実行' {
    Param( $actor )
    $mode = [TTExModMode]::ExFdPanel().GetMode()
    Invoke-TTAction "$mode.Nth.Invoke" $actor 
    return $true
 }
Add-TTAction    Panel.Nth.Menu                  'N番アイテムメニュー' {
    Param( $actor )
    $mode = [TTExModMode]::ExFdPanel().GetMode()
    Invoke-TTAction "$mode.Nth.Menu" $actor 
    return $true
 }
#endregion
#region --- editor
Add-TTAction    Editor.Move.PrevItem            '移動：前のActor' {
    [TTExModMode]::ExFdPanel().MoveM('prevsec')
    return $true
 }
Add-TTAction    Editor.Move.NextItem            '移動：次のActor' {
    [TTExModMode]::ExFdPanel().MoveM('nextsec')
    return $true
 }
Add-TTAction    Editor.Move.FirstItem           '移動：先頭のActor' {
    [TTExModMode]::ExFdPanel().MoveM('firstsec')
    return $true
 }
Add-TTAction    Editor.Move.LastItem            '移動：末尾のActor' {
    [TTExModMode]::ExFdPanel().MoveM('lastsec')
    return $true
 }
Add-TTAction    Editor.Selected.Invoke          'Actor実行' {
    Param($actor)
    $panel = [TTExModMode]::ExFdPanel()
    $actor = ( Merge-Hashtables @( $actor, $panel.GetActorAt() ) )
    return ( Invoke-TTAction "$($actor.Key).Action.Default" $actor )
 }
Add-TTAction    Editor.Selected.Menu            'Actorメニュー' {
    Param($actor)
    $panel = [TTExModMode]::ExFdPanel()
    $panel.ShowMenu({
            Param($menu)
            $actor = ( Merge-Hashtables @($actor, $script:panel.GetActorAt()) )
            $global:Controller.ClearMenu( $menu )
            $global:Controller.BuildMenu( $actor.Key, $menu, $actor )
        }.GetNewClosure())
    return $true
 }
Add-TTAction    Editor.Nth.Invoke               'N番Actor実行' {
    Param($actor)
    if ( $actor.UIKey -match 'd(?<n>\d+)' ) {
        $num = [int]($Matches.n)
        $ref = @{ Key = "Reference"; Value = "[#$num]" }
        return ( Invoke-TTAction 'Editor.Selected.Invoke' $ref )
    }
    return $true
 }
Add-TTAction    Editor.Nth.Menu                 'N番Actorメニュー' {
    Param($actor)
    if ( $actor.UIKey -match 'd(?<n>\d+)' ) {
        $num = [int]($Matches.n)
        $ref = @{ Key = "Reference"; Value = "[#$num]" }
        return ( Invoke-TTAction 'Editor.Selected.Menu' $ref )
    }

    $num = $( if ( $actor.UIKey -match 'd(?<n>\d+)' ) { [int]($Matches.n) }else { $null } )

    return ( Invoke-TTAction 'Editor.Selected.Menu' $actor )
 }
#endregion
#region --- table
Add-TTAction    Table.Move.PrevItem             '移動：前のレコード' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().TableCursor('up+')
    return $true
 }
Add-TTAction    Table.Move.NextItem             '移動：次のレコード' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().TableCursor('down+')
    return $true
 }
Add-TTAction    Table.Move.FirstItem            '移動：先頭のレコード' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().TableCursor('first')
    return $true
 }
Add-TTAction    Table.Move.LastItem             '移動：末尾のレコード' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().TableCursor('last')
    return $true
 }
Add-TTAction    Table.Selected.Invoke           'レコード実行' {
    Param( $actor )

    $selitem = [TTExModMode]::ExFdPanel().TableMain.SelectedItem
    $classname = $selitem.GetType().Name
    if ( $selitem -is [TTCollection] ) { $classname = 'TTCollection' }
    $actor += @{ Selected = $selitem }

    Invoke-TTAction "$classname.Action.Default" $actor 
    return $true
 }
Add-TTAction    Table.Selected.Menu             'レコードメニュー' {
    Param( $actor )
    $selitem = [TTExModMode]::ExFdPanel().TableMain.SelectedItem
    $classname = $selitem.GetType().Name
    if ( $selitem -is [TTCollection] ) { $classname = 'TTCollection' }
    if( $actor.ContainsKey('Selected') ) {
        $actor['Selected'] = $selitem
    }else { 
        $actor += @{ Selected = $selitem }
    }

    $panel = [TTExModMode]::ExFdPanel()
    $panel.ShowMenu({
            Param($menu)
            $global:Controller.ClearMenu( $menu )
            $global:Controller.BuildMenu( $script:classname, $menu, $script:actor )
        }.GetNewClosure())
    return $true
 }
Add-TTAction    Table.Nth.Invoke                'N番レコード実行' {
    Param( $actor )
    $num = [int]([string]$actor.UIKey).substring(1, 1)
    $selitem = [TTExModMode]::ExFdPanel().TableMain.Items[$num - 1]
    [TTExModMode]::ExFdPanel().TableMain.SelectedIndex = $num - 1
    $classname = $selitem.GetType().Name
    if ( $selitem -is [TTCollection] ) { $classname = 'TTCollection' }
    $actor += @{ Selected = $selitem }

    Invoke-TTAction "$classname.Action.Default" $actor
 }
Add-TTAction    Table.Nth.Menu                  'N番レコードメニュー' {
    Param( $actor )
    $num = [int]([string]$actor.UIKey).substring(1, 1)
    $selitem = [TTExModMode]::ExFdPanel().TableMain.Items[$num - 1]
    [TTExModMode]::ExFdPanel().TableMain.SelectedIndex = $num - 1
    $classname = $selitem.GetType().Name
    if ( $selitem -is [TTCollection] ) { $classname = 'TTCollection' }
    $actor += @{ Selected = $selitem }

    [TTExModMode]::ExFdPanel().ShowMenu({
            Param($menu)
            $global:Controller.ClearMenu( $menu )
            $global:Controller.BuildMenu( $script:classname, $menu, $script:actor )
        }.GetNewClosure())
    return $true
 }
#endregion
#region --- webview
Add-TTAction    WebView.View.ScrollUp           '移動：前のフォーカス' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('scrollup')
    return $true
}
Add-TTAction    WebView.View.ScrollDown           '移動：次のフォーカス' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('scrolldown')
    return $true
 }
Add-TTAction    WebView.View.ScrollTop          '移動：先頭のフォーカス' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('scrolltop')
    return $true
 }
Add-TTAction    WebView.View.ScrollEnd           '移動：末尾のフォーカス' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('scrollend')
    return $true
 }

Add-TTAction    WebView.Move.PrevItem           '移動：末尾のフォーカス' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('previtem')
    return $true
 }
Add-TTAction    WebView.Move.NextItem           '移動：末尾のフォーカス' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('nextitem')
    return $true
 }
Add-TTAction    WebView.Move.FirstItem           '移動：末尾のフォーカス' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('firstitem')
    return $true
 }
Add-TTAction    WebView.Move.LastItem           '移動：末尾のフォーカス' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('lastitem')
    return $true
 }

 Add-TTAction    WebView.Selected.Invoke         'フォーカス実行' {
 }
Add-TTAction    WebView.Selected.Menu           'フォーカスメニュー' {
 }
Add-TTAction    WebView.Nth.Invoke              'N番フォーカス実行' {
 }
Add-TTAction    WebView.Nth.Menu                'N番フォーカスメニュー' {
 }
#endregion
#endregion

#region ::: エディタ
#region キャレット
Add-TTAction    Memo.Default.Key                        'Editor Default' {
    return $false
 }
Add-TTAction    Memo.Move.Up                            '移動：上行' {
    [TTExModMode]::FdPanel().MoveM('up')
    return $true
 }
Add-TTAction    Memo.Move.Down                          '移動：下行' {
    [TTExModMode]::FdPanel().MoveM('down')
    return $true
 }
Add-TTAction    Memo.Move.Right                         '移動：右文字' {
    [TTExModMode]::FdPanel().MoveM('right')
    return $true
 }
Add-TTAction    Memo.Move.Left                          '移動：左文字' {
    [TTExModMode]::FdPanel().MoveM('left')
    return $true
 }
Add-TTAction    Memo.Move.LineStart                     '移動：先頭行' {
    [TTExModMode]::FdPanel().MoveM('linestart')
    return $true
 }
Add-TTAction    Memo.Move.LineEnd                       '移動：末尾行' {
    [TTExModMode]::FdPanel().MoveM('lineend')
    return $true
 }
Add-TTAction    Memo.Move.DocEnd                        '移動：先頭文書' {
    [TTExModMode]::FdPanel().MoveM('docstart')
    return $true
 }
Add-TTAction    Memo.Move.DocEnd                        '移動：末尾文書' {
    [TTExModMode]::FdPanel().MoveM('docend')
    return $true
 }
Add-TTAction    Memo.Move.LineDocStart                  '移動：先頭行か先頭文書' {
    [TTExModMode]::FdPanel().MoveM('linestart+')
    return $true
 }
Add-TTAction    Memo.Move.LineDocEnd                    '移動：末尾行か末尾文書' {
    [TTExModMode]::FdPanel().MoveM('lineend+')
    return $true
 }
Add-TTAction    Memo.Move.PrevKeyword                   '移動：前キーワード' {
    [TTExModMode]::FdPanel().MoveM('prevkeyword')
    return $true
 }
Add-TTAction    Memo.Move.NextKeyword                   '移動：次キーワード' {
    [TTExModMode]::FdPanel().MoveM('nextkeyword')
    return $true
 }
Add-TTAction    Memo.Move.FirstKeyword                  '移動：先頭キーワード' {
    [TTExModMode]::FdPanel().MoveM('firstkeyword')
    return $true
 }
Add-TTAction    Memo.Move.LastKeyword                   '移動：末尾キーワード' {
    [TTExModMode]::FdPanel().MoveM('lastkeyword')
    return $true
 }
Add-TTAction    Memo.Move.NextWord                      '移動：次単語' {
    [TTExModMode]::FdPanel().MoveM('nextword')
    return $true
 }
Add-TTAction    Memo.Move.PrevWord                      '移動：前単語' {
    [TTExModMode]::FdPanel().MoveM('prevword')
    return $true
 }
Add-TTAction    Memo.Move.CurrentNode                   '移動：現ノード' {
    [TTExModMode]::FdPanel().MoveM('cursection')
    return $true
 }
Add-TTAction    Memo.Move.NextFilePath                  '移動：次ファイル' {
    [TTExModMode]::FdPanel().MoveM('nextfilepath')
    return $true
 }
Add-TTAction    Memo.Move.PrevFilePath                  '移動：前ファイル' {
    [TTExModMode]::FdPanel().MoveM('prevfilepath')
    return $true
 }
Add-TTAction    Memo.Move.NextWebPath                   '移動：次URL' {
    [TTExModMode]::FdPanel().MoveM('nextwebpath')
    return $true
 }
Add-TTAction    Memo.Move.PrevWebPath                   '移動：前URL' {
    [TTExModMode]::FdPanel().MoveM('prevwebpath')
    return $true
 }
Add-TTAction    Memo.Move.NextDate                      '移動：次日付' {
    [TTExModMode]::FdPanel().MoveM('nextdate')
    return $true
 }
Add-TTAction    Memo.Move.PrevDate                      '移動：前日付' {
    [TTExModMode]::FdPanel().MoveM('prevdate')
    return $true
 }
#endregion
#region 基本編集
Add-TTAction    Memo.Select.Up                          '選択：上行' {
    [TTExModMode]::FdPanel().SelectM('up')
    return $true
 }
Add-TTAction    Memo.Select.Down                        '選択：下行' {
    [TTExModMode]::FdPanel().SelectM('down')
    return $true
 }
Add-TTAction    Memo.Select.Right                       '選択：右文字' {
    [TTExModMode]::FdPanel().SelectM('right')
    return $true
 }
Add-TTAction    Memo.Select.Left                        '選択：左文字' {
    [TTExModMode]::FdPanel().SelectM('left')
    return $true
 }
Add-TTAction    Memo.Select.LineStart                   '選択：先頭行' {
    [TTExModMode]::FdPanel().SelectM('linestart')
    return $true
 }
Add-TTAction    Memo.Select.LineEnd                     '選択：末尾行' {
    [TTExModMode]::FdPanel().SelectM('lineend')
    return $true
 }
Add-TTAction    Memo.Select.DocStart                    '選択：先頭文書' {
    [TTExModMode]::FdPanel().SelectM('docstart')
    return $true
 }
Add-TTAction    Memo.Select.DocEnd                      '選択：末尾文書' {
    [TTExModMode]::FdPanel().SelectM('docend')
    return $true
 }
Add-TTAction    Memo.Select.All                         '選択：全文書' {
    [TTExModMode]::FdPanel().SelectM('docend')
    return $true
 }
Add-TTAction    Memo.Select.CurrentLine                 '選択：現在行' {
    [TTExModMode]::FdPanel().SelectM('curline')
    return $true
 }
Add-TTAction    Memo.Select.CurrentKeyword              '選択：現在キーワード' {
    [TTExModMode]::FdPanel().SelectM('curkeyword')
    return $true
 }

Add-TTAction    Memo.Select.CurrentSection              '選択：現在ノード' {
    [TTExModMode]::FdPanel().SelectM('cursection')
    return $true
 }
Add-TTAction    Memo.Select.NextSection                 '選択：次ノード' {
    [TTExModMode]::FdPanel().SelectM('nextsection')
    return $true
 }
Add-TTAction    Memo.Select.PrevSection                 '選択：前ノード' {
    [TTExModMode]::FdPanel().SelectM('prevsection')
    return $true
 }
Add-TTAction    Memo.Select.CurrentWord                 '選択：現在単語' {
    [TTExModMode]::FdPanel().SelectM('curword')
    return $true
 }
Add-TTAction    Memo.Select.NextWord                    '選択：カーソルから次の単語までを選択' {
    [TTExModMode]::FdPanel().SelectM('nextword')
    return $true
 }
Add-TTAction    Memo.Select.PrevWord                    '選択：カーソルから前の単語までを選択' {
    [TTExModMode]::FdPanel().SelectM('prevword')
    return $true
 }

Add-TTAction    Memo.Delete.LineStart                   '削除：行先頭まで' {
    [TTExModMode]::FdPanel().EditM('deletelinestart')
    return $true
 }
Add-TTAction    Memo.Delete.LineEnd                     '削除：行末尾まで' {
    [TTExModMode]::FdPanel().EditM('deletelineend')
    return $true
 }
Add-TTAction    Memo.Delete.CurrentLine                 '削除：現在行' {
    [TTExModMode]::FdPanel().EditM('deleteline')
    return $true
 }
Add-TTAction    Memo.Delete.Right                       '削除：右文字(Delete)' {
    [TTExModMode]::FdPanel().EditM('delete')
    return $true
 }
Add-TTAction    Memo.Delete.Left                        '削除：左文字(Backspace)' {
    [TTExModMode]::FdPanel().EditM('backspace')
    return $true
 }
Add-TTAction    Memo.Delete.NextWord                    '削除：次単語' {
    [TTExModMode]::FdPanel().EditM('deletenextword')
    return $true
 }
Add-TTAction    Memo.Delete.PrevWord                    '削除：前単語' {
    [TTExModMode]::FdPanel().EditM('deteleprevword')
    return $true
 }
Add-TTAction    Memo.Delete.DocStart                    '削除：文書先頭まで' {
    [TTExModMode]::FdPanel().EditM('deletedocstart')
    return $true
 }
Add-TTAction    Memo.Delete.DocEnd                      '削除：文書末尾まで' {
    [TTExModMode]::FdPanel().EditM('deletedocend')
    return $true
 }
Add-TTAction    Memo.Copy.Selection                     '複製：選択文字列' {
    [TTExModMode]::FdPanel().EditM('copy')
    return $true
 }
Add-TTAction    Memo.Copy.Menu                          '複製：メニュー' {
    write-host "Memo.Copy.Menu"
    return $true
 }
Add-TTAction    Memo.Paste.Clipboard                    '貼付：クリップボード' {
    Param( $actor )
    
    $datatypes = [TTClipboard]::GetDataTypes()

    $tagplus = $tag + @{ GetClipboard = $datatypes[0].GetClipboard }
    $name = "Paste{0}" -f $datatypes[0].Name
    return ( Invoke-TTAction "$name.Action.Default" $tagplus )

    # [TTExModMode]::FdPanel().EditM('paste')

 }
Add-TTAction    Memo.Paste.Menu                         '貼付：メニュー' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $datatypes = [TTClipboard]::GetDataTypes()

    $panel.ShowMenu({
            Param($menu)
            $global:Controller.ClearMenu( $menu )
            $script:datatypes.foreach{
                $tagplus = $script:tag + @{ GetClipboard = $_.GetClipboard }
                $name = "Paste{0}" -f $_.Name
                $global:Controller.BuildMenu( $name, $menu, $tagplus )
            }
        }.GetNewClosure())

    return $true
    
 }
Add-TTAction    Memo.Cut.Selection                      '複製：選択文字列切取' {
    [TTExModMode]::FdPanel().EditM('cut')
    return $true
 }
Add-TTAction    Memo.Cut.Menu                           '複製：切取メニュー' {
    write-host "Memo.Cut.Menu"
    return $true
 }
#endregion
#region セクション
Add-TTAction    Memo.Move.PrevSibSection                '移動：前兄弟セクション' {
    [TTExModMode]::FdPanel().MoveM('prevsibsec')
    return $true
 }
Add-TTAction    Memo.Move.NextSibSection                '移動：次兄弟セクション' {
    [TTExModMode]::FdPanel().MoveM('nextsibsec')
    return $true
 }
Add-TTAction    Memo.Move.FirstSibSection               '移動：先頭兄弟セクション' {
    [TTExModMode]::FdPanel().MoveM('firstsibsec')
    return $true
 }
Add-TTAction    Memo.Move.LastSibSection                '移動：末尾兄弟セクション' {
    [TTExModMode]::FdPanel().MoveM('lastsibsec')
    return $true
 }
Add-TTAction    Memo.Move.NextSection                   '移動：次セクション' {
    [TTExModMode]::FdPanel().MoveM('nextsec')
    return $true
 }
Add-TTAction    Memo.Move.PrevSection                   '移動：前セクション' {
    [TTExModMode]::FdPanel().MoveM('prevsec')
    return $true
 }
Add-TTAction    Memo.Move.FirstSection                  '移動：先頭セクション' {
    [TTExModMode]::FdPanel().MoveM('firstsec')
    return $true
 }
Add-TTAction    Memo.Move.LastSection                   '移動：末尾セクション' {
    [TTExModMode]::FdPanel().MoveM('lastsec')
    return $true
 }
Add-TTAction    Memo.Move.ParentSection                 '移動：親セクション' {
    [TTExModMode]::FdPanel().MoveM('parentsec')
    return $true
 }
Add-TTAction    Memo.View.OpenSection                   '表示：セクション' {
    [TTExModMode]::FdPanel().ChangeNodeStateAt('open')
    return $true
 }
Add-TTAction    Memo.View.CloseSection                  '表示：アイテム化' {
    [TTExModMode]::FdPanel().ChangeNodeStateAt('close')
    return $true
 }
Add-TTAction    Memo.View.OpenAllSections               '表示：全て開く' {
    [TTExModMode]::FdPanel().ChangeNodeStateAt('openall')
    return $true
 }
Add-TTAction    Memo.View.CloseAllSections              '表示：全て閉じる' {
    [TTExModMode]::FdPanel().ChangeNodeStateAt('closeall')
    return $true
 }
#endregion
#region 特定編集
Add-TTAction    Memo.Edit.Undo                          '編集：戻す' {
    [TTExModMode]::FdPanel().EditM('undo')
    return $true
 }
Add-TTAction    Memo.Edit.Redo                          '編集：繰り返し' {
    [TTExModMode]::FdPanel().EditM('redo')
    return $true
 }
Add-TTAction    Memo.Edit.Save                          '編集：メモ保存' {
    $panel = [TTExModMode]::FdPanel()
    $global:Controller.SaveMemo( $panel )
    $global:Controller.SaveEditing( $panel )
    return $true
 }
Add-TTAction    Memo.Edit.New                           '編集：メモ新規作成' {
    $memoid = $global:Models.Memos.AddNewMemo().ID
    $global:Controller.LoadMemo( [TTExModMode]::FdPanel(), $memoid )
    return $true
 }

Add-TTAction    Memo.Edit.IncSecLevel                   '編集：セクション階層下げ' {
    [TTExModMode]::FdPanel().EditNode('inc')
    return $true
 }
Add-TTAction    Memo.Edit.DecSecLevel                   '編集：セクション階層上げ' {
    [TTExModMode]::FdPanel().EditNode('dec')
    return $true
 }
Add-TTAction    Memo.Edit.InitSecLevel                  '編集：セクション新規作成' {
    [TTExModMode]::FdPanel().EditNode('init')
    return $true
 }
Add-TTAction    Memo.Edit.NextBullet                    '編集：バレット次' {
    [TTExModMode]::FdPanel().EditBullet('next')
    return $true
 }
Add-TTAction    Memo.Edit.PrevBullet                    '編集：バレット前' {
    [TTExModMode]::FdPanel().EditBullet('prev')
    return $true
 }
Add-TTAction    Memo.Edit.RemoveBullet                  '編集：バレット削除' {
    [TTExModMode]::FdPanel().EditBullet('remove')
    return $true
 }
Add-TTAction    Memo.Edit.InitIndex                     '編集：インデックス新規作成' {
    [TTExModMode]::FdPanel().EditIndex('init')
    return $true
 }
Add-TTAction    Memo.Edit.IncIndex                      '編集：インデックス次' {
    [TTExModMode]::FdPanel().EditIndex('inc')
    return $true
 }
Add-TTAction    Memo.Edit.DecIndex                      '編集：インデックス前' {
    [TTExModMode]::FdPanel().EditIndex('dec')
    return $true
 }
Add-TTAction    Memo.Edit.NextComment                   '編集：コメント次' {
    [TTExModMode]::FdPanel().EditComment('next')
    return $true
 }
Add-TTAction    Memo.Edit.PrevComment                   '編集：コメント前' {
    [TTExModMode]::FdPanel().EditComment('prev')
    return $true
 }
Add-TTAction    Memo.Edit.RemoveComment                 '編集：コメント削除' {
    [TTExModMode]::FdPanel().EditComment('remove')
    return $true
 }
Add-TTAction    Memo.Edit.AddTab                        '編集：タブ追加' {
    [TTExModMode]::FdPanel().EditTab('add')
    return $true
 }
Add-TTAction    Memo.Edit.RemoveTab                     '編集：タブ削除' {
    [TTExModMode]::FdPanel().EditTab('remove')
    return $true
 }
#endregion
#endregion

#region ::: キーワード
#region キャレット
Add-TTAction    Keyword.Default.Key                     'Keyword Default' {
    return $false
 }
Add-TTAction    Keyword.Move.Right                      '移動KW：右文字' {
    [TTExModMode]::FdPanel().MoveK('right')
    return $true
 }
Add-TTAction    Keyword.Move.Left                       '移動KW：左文字' {
    [TTExModMode]::FdPanel().MoveK('left')
    return $true
 }
Add-TTAction    Keyword.Move.LineStart                  '移動KW：先頭行' {
    [TTExModMode]::FdPanel().MoveK('linestart')
    return $true
 }
Add-TTAction    Keyword.Move.LineEnd                    '移動KW：末尾行' {
    [TTExModMode]::FdPanel().MoveK('lineend')
    return $true
 }
Add-TTAction    Keyword.Move.NextWord                   '移動KW：次単語' {
    [TTExModMode]::FdPanel().MoveK('nextword')
    return $true
 }
Add-TTAction    Keyword.Move.PrevWord                   '移動KW：前単語' {
    [TTExModMode]::FdPanel().MoveK('prevword')
    return $true
 }
Add-TTAction    Keyword.Move.NextDate                   '移動KW：次日付' {
    [TTExModMode]::FdPanel().MoveK('nextdate')
    return $true
 }
Add-TTAction    Keyword.Move.PrevDate                   '移動KW：前日付' {
    [TTExModMode]::FdPanel().MoveK('prevdate')
    return $true
 }
#endregion
#region 基本編集
Add-TTAction    Keyword.Select.Right                    '選択KW：右文字' {
    [TTExModMode]::FdPanel().SelectK('right')
    return $true
 }
Add-TTAction    Keyword.Select.Left                     '選択KW：左文字' {
    [TTExModMode]::FdPanel().SelectK('left')
    return $true
 }
Add-TTAction    Keyword.Select.LineStart                '選択KW：先頭行' {
    [TTExModMode]::FdPanel().SelectK('linestart')
    return $true
 }
Add-TTAction    Keyword.Select.LineEnd                  '選択KW：末尾行' {
    [TTExModMode]::FdPanel().SelectK('lineend')
    return $true
 }
Add-TTAction    Keyword.Select.All                      '選択KW：全文書' {
    [TTExModMode]::FdPanel().SelectK('docend')
    return $true
 }
Add-TTAction    Keyword.Select.CurrentLine              '選択KW：現在行' {
    [TTExModMode]::FdPanel().SelectK('curline')
    return $true
 }
Add-TTAction    Keyword.Select.CurrentWord              '選択KW：現在単語' {
    [TTExModMode]::FdPanel().SelectK('curword')
    return $true
 }
Add-TTAction    Keyword.Select.NextWord                 '選択KW：カーソルから次の単語までを選択' {
    [TTExModMode]::FdPanel().SelectK('nextword')
    return $true
 }
Add-TTAction    Keyword.Select.PrevWord                 '選択KW：カーソルから前の単語までを選択' {
    [TTExModMode]::FdPanel().SelectK('prevword')
    return $true
 }

Add-TTAction    Keyword.Delete.LineStart                '削除KW：行先頭まで' {
    [TTExModMode]::FdPanel().EditK('deletelinestart')
    return $true
 }
Add-TTAction    Keyword.Delete.LineEnd                  '削除KW：行末尾まで' {
    [TTExModMode]::FdPanel().EditK('deletelineend')
    return $true
 }
Add-TTAction    Keyword.Delete.CurrentLine              '削除KW：現在行' {
    [TTExModMode]::FdPanel().EditK('deleteline')
    return $true
 }
Add-TTAction    Keyword.Delete.Right                    '削除KW：右文字(Delete)' {
    [TTExModMode]::FdPanel().EditK('delete')
    return $true
 }
Add-TTAction    Keyword.Delete.Left                     '削除KW：左文字(Backspace)' {
    [TTExModMode]::FdPanel().EditK('backspace')
    return $true
 }
Add-TTAction    Keyword.Delete.NextWord                 '削除KW：次単語' {
    [TTExModMode]::FdPanel().EditK('deletenextword')
    return $true
 }
Add-TTAction    Keyword.Delete.PrevWord                 '削除KW：前単語' {
    [TTExModMode]::FdPanel().EditK('deteleprevword')
    return $true
 }
Add-TTAction    Keyword.Copy.Selection                  '複製KW：選択文字列' {
    [TTExModMode]::FdPanel().EditK('copy')
    return $true
 }
Add-TTAction    Keyword.Copy.Menu                       '複製KW：メニュー' {
    write-host "Keyword.Copy.Menu"
    return $true
 }
Add-TTAction    Keyword.Paste.Clipboard                 '貼付KW：クリップボード' {
    Param( $actor )
    
    $datatypes = [TTClipboard]::GetDataTypes()

    $tagplus = $tag + @{ GetClipboard = $datatypes[0].GetClipboard }
    $name = "Paste{0}" -f $datatypes[0].Name
    return ( Invoke-TTAction "$name.Action.Default" $tagplus )

    # [TTExModMode]::FdPanel().EditM('paste')

 }
Add-TTAction    Keyword.Paste.Menu                      '貼付KW：メニュー' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $datatypes = [TTClipboard]::GetDataTypes()

    $panel.ShowMenu({
            Param($menu)
            $global:Controller.ClearMenu( $menu )
            $script:datatypes.foreach{
                $tagplus = $script:tag + @{ GetClipboard = $_.GetClipboard }
                $name = "Paste{0}" -f $_.Name
                $global:Controller.BuildMenu( $name, $menu, $tagplus )
            }
        }.GetNewClosure())

    return $true
    
 }
Add-TTAction    Keyword.Cut.Selection                   '複製KW：選択文字列切取' {
    [TTExModMode]::FdPanel().EditK('cut')
    return $true
 }
Add-TTAction    Keyword.Cut.Menu                        '複製KW：切取メニュー' {
    write-host "Keyword.Cut.Menu"
    return $true
 }
#endregion
#region 特定編集
Add-TTAction    Keyword.Edit.Undo                       '編集KW：戻す' {
    [TTExModMode]::FdPanel().EditK('undo')
    return $true
 }
Add-TTAction    Keyword.Edit.Redo                       '編集KW：繰り返し' {
    [TTExModMode]::FdPanel().EditK('redo')
    return $true
 }
#endregion
#endregion

#region ::: アクター
#region Actor/ ウェブ
Add-TTAction   WebPath.Action.Default                   'Default Action' {
    Param($actor)
    return ( Invoke-TTAction 'WebPath.Send.ToBrowser' $actor )
 }
Add-TTAction   WebPath.Send.ToBrowser                   'ブラウザで表示' {
    Param($actor)
    SendUrl-ToBrowser $Actor.Value
    return $true
 }
Add-TTAction   WebPath.Send.ToExplorer                  'エクスプローラで表示' {
    Param($actor)
    SendPath-ToExplorer $Actor.Value
    return $true
 }
Add-TTAction   WebPath.Copy.It                          '文字をコピー' {
    Param($actor)
    [TTClipboard]::CopyTextToClipboard($Actor.Value)
    return $true
 }
Add-TTAction   WebPath.ShortCut.ToClipboard             'ショートカットをコピー' {
    Param($actor)
    [TTClipboard]::CreateUrlLinksToClipboard( $Actor.Value )
    return $true
 }
Add-TTAction   WebPath.Copy.UrlDecoded                  'URLデコードしてコピー' {
    Param($actor)
    $text = [System.Web.HttpUtility]::UrlDecode( $Actor.Value )
    [TTClipboard]::CopyTextToClipboard( $text )
    return $true
 }
Add-TTAction   WebPath.Copy.UrlEncoded                  'URLエンコードしてコピー' { # encodeする部分要検討
    Param($actor)
    $text = [System.Web.HttpUtility]::UrlEncode( $Actor.Value )
    [TTClipboard]::CopyTextToClipboard( $text )
    return $true
 }
#endregion
#region Actor/ ファイル
Add-TTAction   FilePath.Action.Default                  'Default Action' {
    Param($actor)
    return (Invoke-TTAction 'FilePath.Open.WithExplorer' $actor)
 }
Add-TTAction   FilePath.Select.WithExplorer             '場所を表示' {
    Param($actor)
    SendPath-ToExplorer $Actor.Value -Select
    return $true
 }
Add-TTAction   FilePath.Open.WithExplorer               'ファイルを開く' {
    Param($actor)
    SendPath-ToExplorer $Actor.Value
    return $true
 }
Add-TTAction   FilePath.Uri.ToClipboard                 'リンク文字をコピー' {
    Param($actor)
    [TTClipboard]::CopyText($Actor.Value)
    return $true
 }
Add-TTAction   FilePath.ShortCut.ToClipboard            'ショートカットをコピー' {
    Param($actor)
    [TTClipboard]::CopyFileLinks( @($Actor.Value) )
    return $true
 }
Add-TTAction   FilePath.File.ToClipboard                'ファイルをコピー' { #nocheck
    Param($actor)
    [TTClipboard]::CopyFiles( @($Actor.Value) )
    return $true
 }
#endregion
#region Actor/ 相対パス
Add-TTAction   ChildPath.Action.Default                 'Default Action' {
    Param($actor)
    Invoke-TTAction 'ChildPath.Select.WithExplorer' $actor
 }
Add-TTAction   ChildPath.Select.WithExplorer            'エクスプローラで表示' {
    Param($actor)
    SendPath-ToExplorer $Actor.Value -Select
 }
Add-TTAction   ChildPath.Open.WithExplorer              '_2. エクスプローラで開く' {
    Param($actor)
    SendPath-ToExplorer $Actor.Value
 }
Add-TTAction   ChildPath.Uri.ToClipboard                '_3. 文字をコピー' {
    Param($actor)
    [TTClipboard]::CopyText($Actor.Value)
 }
Add-TTAction   ChildPath.ShortCut.ToClipboard           '_4. ショートカットをコピー' {
    Param($actor)
    [TTClipboard]::CopyFileLinks( @($Actor.Value) )
 }
#endregion
#region Actor/ マーク
Add-TTAction   Mark.Action.Default                      'Default Action' { #::: マークをすすめる
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $mark = ( $actor.Mark | Get-Next Asc -Enum $actor.SubATags )
    if ( $mark -eq '' ) { $mark = $actor.SubATags.split('|')[0] }
    $panel.Replace( $actor.Offset, $actor.Length, "[$mark]" )
    $panel.SetOffset( $actor.Offset + 1 )
    return $true
 }
Add-TTAction   Mark.Set.Prev                            'マークを戻す' { #::: 選択肢が1つなのでmenu表示せずに実行
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $mark = ( $actor.Mark | Get-Next Des -Enum $actor.SubATags )
    if ( $mark -eq '' ) { $mark = $actor.SubATags.split('|')[0] }
    $panel.Replace( $actor.Offset, $actor.Length, "[$mark]" )
    $panel.SetOffset( $actor.Offset + 1 )
    return $true
 }
#endregion
#region Actor/ セレクション
Add-TTAction    Selection.Action.Default                'Default Action' {
    Param($tag)
    [TTExModMode]::FdPanel().ShowMenu({
            Param($menu)
            $script:tag.Menu = $menu
            Invoke-TTAction Selection.SubMenu.WebSearch $script:tag
        }.GetNewClosure())
    return $true
 }
Add-TTAction    Selection.SubMenu.WebSearch             'WebSearch設定' {
    Param($tag)
    $menu = $tag.Menu
    $global:Models.WebSearches.GetItems().foreach{
        $url = $_.Url -f [System.Web.HttpUtility]::UrlEncode($tag.Value)
        $mitm = [MenuItem]::New()
        $mitm.Header = "_{0}){1}" -f $_.ID[0], $_.Name
        $mitm.Tag = $tag + @{ Resource = $_.Name; Url = $url }
        $mitm.Add_Click({
                Param($subm)
                SendUrl-ToBrowser $subm.Tag.Url
                return $true
            })
        $menu.AddChild($mitm)
    }
    return $true
 }
Add-TTAction    Selection.SubMenu.WebSearchTag          'WebSearchタグ' {
    Param($tag)
    $menu = $tag.Menu
    $global:Models.WebSearches.GetItems().foreach{
        $wstag = "[{0}:{1}]" -f $_.ID, $tag.Value
        $mitm = [MenuItem]::New()
        $mitm.Header = "_{0}){1}" -f $_.ID[0], $_.Name
        $mitm.Tag = $tag + @{ Resource = $_.Name; WebSearchTag = $wstag }
        $mitm.Add_Click({
                Param($subm)
                $subm.Tag.Panel.Replace( $subm.Tag.Offset, $subm.Tag.Length, $subm.Tag.WebSearchTag )
                return $true
            })
        $menu.AddChild($mitm)
    }
    return $true
 }
Add-TTAction    Selection.CopyTo.Keyword                'キーワード設定' {
    Param($tag)
 }
Add-TTAction    Selection.Search.Memo                   'メモ検索' {
    Param($tag)
 }
Add-TTAction    Selection.Delete.BlankLine              '空行削除' {
    Param($tag)
    $text = $tag.Value.split("`n").where{ $_ -ne '' } -join "`n"
    [TTExModMode]::FdPanel().Replace( $tag.Offset, $tag.Length, $text )
 }
Add-TTAction    Selection.ToBe.Commented                'コメント(;)' {
    Param($tag)
    $text = $tag.LinesValue.split("`n").foreach{ "; $_" } -join "`n"
    [TTExModMode]::FdPanel().Replace( $tag.LinesOffset, $tag.LinesLength, $text )
 }
Add-TTAction    Selection.ToBe.Referred                 '引用(>)' {
    Param($tag)
    $text = $tag.LinesValue.split("`n").foreach{ "> $_" } -join "`n"
    [TTExModMode]::FdPanel().Replace( $tag.LinesOffset, $tag.LinesLength, $text )
 }
Add-TTAction    Selection.ToBe.Exampled                 '例示(|)' {
    Param($tag)
    $text = $tag.LinesValue.split("`n").foreach{ "| $_" } -join "`n"
    [TTExModMode]::FdPanel().Replace( $tag.LinesOffset, $tag.LinesLength, $text )
 }
Add-TTAction    Selection.Cut.ToClipboad                '選択テキストを切取り' {
    Param($tag)
    [TTClipboard]::CopyText( $tag.Value )
    [TTExModMode]::FdPanel().DeleteRange('selection')
    return $true
 }
Add-TTAction    Selection.Copy.ToClipboad               '選択テキストをコピー' {
    Param($Tag)
    [TTClipboard]::CopyText( $tag.Value )
    return $true
 }
#endregion
#region Actor/ 日付文字
Add-TTAction   Date.Insert.Date                         '日付挿入/日付モード開始' {
    $panel = [TTExModMode]::FdPanel()
    $actor = $panel.GetActorAt()

    $key = $actor.Key
    if ( $key -in @( 'DateTag', 'Date', 'JDate', 'GDate' ) ) {
        Invoke-TTAction "$key.Action.Default" $actor
    }
    else {
        $panel.ReplaceDateAt('insert')
        Invoke-TTAction "Memo.Move.Right"
        Invoke-TTAction "Date.Insert.Date"
    }
    return $true
 }
Add-TTAction   Date.Action.Default                      'Default Action Date' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    [TTExModMode]::Start('ExDate')
    [TTExModMode]::Tag = @{ Panel = $panel; Actor = $actor; OriginalDate = $actor.Value }
    return $true
 }
Add-TTAction   DateTag.Action.Default                   'Default Action DateTag' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    [TTExModMode]::Start('ExDate')
    [TTExModMode]::Tag = @{ Panel = $panel; Actor = $actor }
    return $true
 }
Add-TTAction   JDate.Action.Default                     'Default Action JDate' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    [TTExModMode]::Start('ExDate')
    [TTExModMode]::Tag = @{ Panel = $panel; Actor = $actor }
    return $true
 }
Add-TTAction   GDate.Action.Default                     'Default Action GDate' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    [TTExModMode]::Start('ExDate')
    [TTExModMode]::Tag = @{ Panel = $panel; Actor = $actor }
    return $true
 }
Add-TTAction   ExDate.Set.Now                           '現日時を設定' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('today')
    return $true
 }
Add-TTAction   ExDate.Set.Original                      '元の日時に戻す' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt( [TTExModMode]::Tag.OriginalDate )
    return $true
 }
Add-TTAction   ExDate.Advance.Year                      '１年進める' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('+1y')
    return $true
 }
Add-TTAction   ExDate.Rewind.Year                       '１年戻す' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('-1y')
    return $true
 }
Add-TTAction   ExDate.Advance.Month                     '１ヵ月進める' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('+1m')
    return $true
 }
Add-TTAction   ExDate.Rewind.Month                      '１ヵ月戻す' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('-1m')
    return $true
 }
Add-TTAction   ExDate.Advance.Day                       '１日進める' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('+1d')
    return $true
 }
Add-TTAction   ExDate.Rewind.Day                        '１日戻す' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('-1d')
    return $true
 }
Add-TTAction   ExDate.Advance.Week                      '１週進める' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('+1w')
    return $true
 }
Add-TTAction   ExDate.Rewind.Week                       '１週戻す' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('-1w')
    return $true
 }
Add-TTAction   ExDate.Format.Next                       '表記形式を変更' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('+fmt')
    return $true
 }
Add-TTAction   ExDate.Format.Prev                       '表記形式を変更・逆' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('-fmt')
    return $true
 }
Add-TTAction   ExDate.Format.Gengo                      '表記形式を元号' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('gengo')
    return $true
 }
Add-TTAction   ExDate.Format.Japan                      '表記形式を和式' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('japan')
    return $true
 }
Add-TTAction   ExDate.Format.US                         '表記形式を通常' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('us')
    return $true
 }
Add-TTAction   ExDate.Format.Tag                        '表記形式をタグ形式' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('tag')
    return $true
 }
Add-TTAction   ExDate.WeekTime.Next                     '表記項目を変更' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('+wt')
    return $true
 }
Add-TTAction   ExDate.WeekTime.Prev                     '表記項目を変更・逆' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('-wt')
    return $true
 }
Add-TTAction   ExDate.Week.Toggle                       '曜日表記を変更' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('w')
    return $true
 }
Add-TTAction   ExDate.Time.Toggle                       '時間表記を変更' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ReplaceDateAt('t')
    return $true
 }
Add-TTAction   ExDate.Time.Input                        '時間を入力' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    if ( 4 -eq [TTExModMode]::StackKey($actor.UIMods, $actor.UIKey).Length ) {
        $panel.ReplaceDateAt( [TTExModMode]::Text )
        [TTExModMode]::Text = ''
    }
    return $true
 }
Add-TTAction   Date.Filter.Memo                         '時間でMemoを選択' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $keyword = [TTExModMode]::Tag.OriginalDate
    Show-Dialog "未実装: Date.Filter.Memo $keyword"
    return $true
 }
Add-TTAction   Date.SubMenu.Format                      '表示フォーマット選択' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $dateinfo = $panel.GetDateAt('')
    $fmt = $dateinfo.Format
    $wt = $dateinfo.WeekTime
    $datetime = $dateinfo.DateTime

    Write-Host "250616: Date.SubMenu.Format >$wt >$datetime >$($dateinfo.Format)"
    $menu = $actor.Menu 
    $panel._datefmts.Keys.where{
        $_ -in @( 'DateTag' , "Date$wt", "JDate$wt", "GDate$wt" )
    }.foreach{
        $datetime = $panel.FormatDate( $datetime, $_ )
        $mitm = [MenuItem]::New()
        $mitm.Header = $datetime
        $mitm.Tag = $actor + @{ Panel = $panel; DateTime = $datetime }
        $mitm.Add_Click({
                Param($subm)
                $panel = $subm.Tag.Panel
                $offset = $subm.Tag.Offset
                $length = $subm.Tag.Length
                $datetime = $subm.Tag.DateTime
                $panel.Replace( $offset, $length, $datetime )
                return $true
            })
        $menu.AddChild($mitm)
    }
    return $true
 }
Add-TTAction   Date.SubMenu.Type                        '表示項目を選択' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $dateinfo = $panel.GetDateAt('')
    $fmt = $dateinfo.Format
    $wt = $dateinfo.WeekTime
    $datetime = $dateinfo.DateTime

    Write-Host "250616: Date.SubMenu.Format >$wt >$datetime >$($dateinfo.Format)"
    $menu = $actor.Menu 
    $panel._datefmts.Keys.where{
        $_ -in @( "$fmt", "$($fmt)W", "$($fmt)T", "$($fmt)WT" )
    }.foreach{
        $datetime = $panel.FormatDate( $datetime, $_ )
        $mitm = [MenuItem]::New()
        $mitm.Header = $datetime
        $mitm.Tag = $tag + @{ Panel = $panel; DateTime = $datetime }
        $mitm.Add_Click({
                Param($subm)
                $panel = $subm.Tag.Panel
                $offset = $subm.Tag.Offset
                $length = $subm.Tag.Length
                $datetime = $subm.Tag.DateTime
                $panel.Replace( $offset, $length, $datetime )
                return $true
            })
        $menu.AddChild($mitm)
    }
    return $true
 }

#endregion
#region Actor/ ノード  
Add-TTAction   Node.Action.Default '' { Invoke-TTAction 'Node.Enter.ExMode' }
Add-TTAction   Node.Enter.ExMode '' {}
Add-TTAction   Node.Copy.Title '' {}
Add-TTAction   Node.Copy.Content '' {}

#endregion
#region Actor/ バレット

#endregion
#region Actor/ 参照
Add-TTAction   Reference.Action.Default                 'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'Reference.Invoke.Cited' $actor )
 }
Add-TTAction   Reference.JumpTo.Cited                   '引用タグにジャンプ' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.MoveCaret('firstre:^{0}' -f [Regex]::Escape($actor.Value))
    return $true
 }
Add-TTAction   Reference.Invoke.Cited                   '引用アクションをInvoke' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ChangeCaretPos('firstre:^{0}' -f [Regex]::Escape($actor.Value))
    $cited = $panel.GetActorAt()
    $action = '{0}.Action.Default' -f $cited.Key
    return ( Invoke-TTAction $action $cited )
 }
Add-TTAction   Reference.Move.Next                      '次の同Referenceへ移動' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.MoveCaret('nextre:{0}' -f [Regex]::Escape($actor.Value))
    return $true
 }
Add-TTAction   Reference.Move.Prev                      '前の同Referenceへ移動' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.MoveCaret('prevre:{0}' -f [Regex]::Escape($actor.Value))
    return $true
 }
Add-TTAction   Reference.Move.First                     '最初の同Referenceへ移動' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.MoveCaret('firstre:{0}' -f [Regex]::Escape($actor.Value))
    return $true
 }
Add-TTAction   Reference.Move.Last                      '最後の同Referenceへ移動' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.MoveCaret('lastre:{0}' -f [Regex]::Escape($actor.Value))
    return $true
 }

#endregion
#region Actor/ 旅程
Add-TTAction   Route.Action.Default         'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'Route.Send.ToBrowser' $actor )
 }
Add-TTAction   Route.Send.ToBrowser         'ブラウザで表示' {
    Param( $actor )
    $url = 'https://www.google.com/maps/dir/'
    $url += $actor.Towns.split(',').Trim().foreach{ [System.Web.HttpUtility]::UrlEncode($_) } -join '/'
    return ( SendUrl-ToBrowser $url )
 }
Add-TTAction   Route.Copy.It                'URLをコピー' {
    Param( $actor )
    $url = 'https://www.google.com/maps/dir/'
    $url += $actor.Towns.split(',').Trim().foreach{ [System.Web.HttpUtility]::UrlEncode($_) } -join '/'
    [TTClipboard]::CopyText($url)
    return $true
 }
Add-TTAction   Route.ShortCut.ToClipboard   'ショートカットをコピー' { # nocheck
    Param( $actor )
    $url = 'https://www.google.com/maps/dir/'
    $url += $actor.Towns.split(',').Trim().foreach{ [System.Web.HttpUtility]::UrlEncode($_) } -join '/'
    [TTClipboard]::CreateUrlLink( $url )
    return $true
 }

#endregion
#region Actor/ メモ
Add-TTAction   Memo.Action.Default          'Default Action' { # nocheck
    Param( $actor )
    return ( Invoke-TTAction 'Memo.Send.ToCurrentPanel' $actor )
 }
Add-TTAction   Memo.Send.ToCurrentPanel     '_1.メモをLoad' { # nocheck
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $global:Controller.LoadMemo( $panel, $actor.IdOrKeyword )

    return $true
 }
Add-TTAction   Memo.Copy.It                 '_2.メモをCopy' { # nocheck
    Param( $actor )
    [TTClipboard]::( $Global:Models.Memos.GetItem( $actor.IdOrKeyword ) )
    return $true
 }
Add-TTAction   Memo.Add.Title               '_3.タイトルを付加' { # nocheck
    Param( $actor )
    Write-Host M250616: emo.Add.Title
    return $true
 }
Add-TTAction   Memo.Open.Folder             '_4.ファイル場所を表示' { # nocheck
    Param( $actor )
    Write-Host M250616: emo.Add.Title
    return $true
 }

#endregion
#region Actor/ メール
Add-TTAction   Mail.Action.Default                      'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'Mail.Send.ToOutlook' $actor )
 }
Add-TTAction   Mail.Send.ToOutlook                      'メールを開く' {
    Param( $actor )

    [TTOutlook]::Exec( $actor, {
        Param( $actor, $ol )
        try{
        if ( $actor.IdOrKeyword -match '\d{4}\-\d{2}\-\d{2}\-\d{6}' ) {
            $ol.InspectMail( $actor.IdOrKeyword )
        }
        else {
            $ol.ExploreMails( $actor.IdOrKeyword )
        }
        }
        catch {
            write-host 'ega'
        }
    })
    return $true
 }
Add-TTAction   Mail.Copy.It                             '_2.メモをコピー' { # nocheck
    Param( $actor )
    $outlook = [TTOutlook]::New()
    $bufolder = $global:Model.Status.GetChild('Application.System.OutlookBackupFolder').Value
    $outlook.SetBackupFolder( $bufolder )
    $mail = $outlook.GetMail( $actor.IdOrKeyword )
    [TTClipboard]::Copy( $mail )
    return $true
 }
#endregion
#region Actor/ 写真
Add-TTAction   Photo.Action.Default         'Default Action' { # nocheck
    Param( $actor )
    return ( Invoke-TTAction 'Photo.Send.ToDraw' $actor )
 }
Add-TTAction   Photo.Send.ToDraw            '_1.Drawで開く' { # nocheck
    Param( $actor )
    Write-Host '250616: Photo.Send.ToDraw'
    return $true
 }
Add-TTAction   Photo.Send.PathToClipboard   '_2.ファイル名をクリップボードへ' { # nocheck
    Param( $actor )
    Write-Host '250616: Photo.Send.PathToClipboard'
    return $true
 }
Add-TTAction   Photo.Send.ImageToClipboard  '_3.イメージをクリップボードへ' { # nocheck
    Param( $actor )
    Write-Host '250616: Photo.Send.ImageToClipboard'
    return $true
 }
Add-TTAction   Photo.Send.ToDraw            '_4.ブラウザで開く' { # nocheck
    Param( $actor )
    Write-Host '250616: Photo.Send.ToDraw'
    return $true
 }
Add-TTAction   Photo.Send.ToDraw            '_5.フォルダを開く' { # nocheck
    Param( $actor )
    Write-Host '250616: Photo.Send.ToDraw'
    return $true
 }
#endregion
#region Actor/ ウェブ検索
Add-TTAction   WebSearch.Action.Default         'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'WebSearch.Send.ToBrowser' $actor )
 }
Add-TTAction   WebSearch.Send.ToBrowser         '_1. ウェブ検索する' {
    Param( $actor )
    $item = $Global:Models.WebSearches.GetItem( $actor.SearchSite )
    $url = $item.Url -f [System.Web.HttpUtility]::UrlEncode($actor.Keywords)
    return ( SendUrl-ToBrowser $url )
 }
Add-TTAction   WebSearch.Copy.It                '_2. url文字をコピー' {
    Param( $actor )
    $item = $Global:Models.WebSearches.GetItem( $actor.SearchSite )
    $url = $item.Url -f [System.Web.HttpUtility]::UrlEncode($actor.Keywords)
    [TTClipboard]::CopyText($url)
    return $true
 }
Add-TTAction   WebSearch.ShortCut.ToClipboard   '_3. ショートカットをコピー' {
    Param( $actor )
    $item = $Global:Models.WebSearches.GetItem( $actor.SearchSite )
    $url = $item.Url -f [System.Web.HttpUtility]::UrlEncode($actor.Keywords)
    [TTClipboard]::CopyUrlLink( $url )
    return $true
 }
Add-TTAction   WebSearch.Change.SearchSite      '_4. 検索サイトを変更' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ShowMenu({
            Param($menu)
        ( $Global:Models.WebSearches.GetItems() | Sort-Object ID ).foreach{
                $item = [MenuItem]::New()
                $item.Header = ( '_{0} | {1}' -f $_.ID, $_.Name )
                $item.Tag = @{ ID = $_.ID; Panel = $panel; Actor = $actor }
                $item.Add_Click({ Param($s); $s.Tag.Panel.Replace( $s.Tag.Actor.Offset + 1, $s.Tag.Actor.SearchSite.Length, $s.Tag.ID ) })
                $menu.Items.Add($item)
            }
        }.GetNewClosure())
    return $true
 }
#endregion
#endregion
#region ::: クリップボード(Memo.Paste.Menu)
#region Paste/ Text                                      #::: テキスト
Add-TTAction   PasteText.Action.Default                 'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'PasteText.Intact.Text' $actor )
 }
Add-TTAction   PasteText.Intact.Text                    '貼付' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.Paste( $actor.GetClipboard.Invoke() )
    return $true
 }
Add-TTAction   PasteText.Commented.Text                 'コメント(;)' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $text = $actor.GetClipboard.Invoke().split("`n").foreach{ "; $_" } -join "`n"
    $panel.PasteNewLine( $text )
    return $true
 }
Add-TTAction   PasteText.Referred.Text                  '引用(＞)' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $text = $actor.GetClipboard.Invoke().split("`n").foreach{ "> $_" } -join "`n"
    $panel.PasteNewLine( $text )
    return $true
 }
Add-TTAction   PasteText.Exampled.Text                  '例示(|)' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $text = $actor.GetClipboard.Invoke().split("`n").foreach{ "| $_" } -join "`n"
    $panel.PasteNewLine( $text )
    return $true
 }
#endregion
#region Paste/ FileList                                  #::: ファイルコピー
Add-TTAction   PasteFileList.Action.Default     'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'PasteFileList.Intact.Text' $actor )
 }
Add-TTAction   PasteFileList.Intact.Text        '貼付' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()

    $text = ''
    $actor.GetClipboard.Invoke().foreach{
        if ( (Get-Item $_).PSIsContainer ) { $text += "$_\`n" }
        else { $text += "$_`n" }
    }
    $panel.MoveCaret('linestart')
    $panel.Insert( $text )      # docstartに貼られてしまう
    return $true
 }
#endregion
#region Paste/ Image
Add-TTAction   PasteImage.Action.Default     'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'PasteImage.As.PhotoTag' $actor )
 }
Add-TTAction   PasteImage.As.PhotoTag     '貼付' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $files = $actor.GetClipboard.Invoke()
    $files.foreach{
        $panel.Paste( $_)
    }
    return $true
 }
#endregion
#region Paste/ OutlookMail                               #::: Outlookメール
Add-TTAction   PasteOutlookMail.Action.Default          'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'PasteOutlookMail.As.MailTag' $actor )
 }
Add-TTAction   PasteOutlookMail.As.MailTag              'タグ' {
    Param( $actor )
    $outlook = [TTOutlook]::New()
    $outlook.GetMailTags( 'selected', '[ID:Mail]' ).foreach{
        [TTExModMode]::FdPanel().Insert( $_ )
    }
    $outlook.Finalize()
    return $true
 }
Add-TTAction   PasteOutlookMail.As.TagTitle             'タグ タイトル' {
    Param( $actor )
    $outlook = [TTOutlook]::New()
    $outlook.GetMailTags( 'selected', "[ID:Mail] TITLE40`n" ).foreach{
        [TTExModMode]::FdPanel().Insert( $_ )
    }
    $outlook.Finalize()
    return $true
 }
Add-TTAction   PasteOutlookMail.As.SenderTag            '送信者 タグ' {
    Param( $actor )
    $outlook = [TTOutlook]::New()
    $outlook.GetMailTags( 'selected', "FROM [ID:Mail]`n" ).foreach{
        [TTExModMode]::FdPanel().Insert( $_ )
    }
    $outlook.Finalize()
    return $true
 }
Add-TTAction   PasteOutlookMail.As.SenderTagTitle       '送信者 タグ タイトル' {
    Param( $actor )
    $outlook = [TTOutlook]::New()
    $outlook.GetMailTags( 'selected', "FROM [ID:Mail] TITLE40`n" ).foreach{
        [TTExModMode]::FdPanel().Insert( $_ )
    }
    $outlook.Finalize()
    return $true
 }
Add-TTAction   PasteOutlookMail.As.MailBody             '送信者 タグ タイトル 内容' {
    Param( $actor )
    $outlook = [TTOutlook]::New()
    $outlook.GetMailTags( 'selected', "FROM [ID:Mail] TITLE40`n> BODY10" ).foreach{
        [TTExModMode]::FdPanel().Insert( $_ )
    }
    $outlook.Finalize()
    return $true
 }

 #endregion
#region Paste/ WebLink
Add-TTAction   PasteWebLink.Action.Default              'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'PasteWebLink.As.MailTag' $actor )
 }
Add-TTAction   PasteWebLink.As.WebLinkTag               'タグ貼付' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()

    $link = $actor.GetClipboard.Invoke()
    $panel.MoveCaret('linestart')
    $panel.Insert( $link )          # docstartに貼られてしまう

    return $true
 }
#endregion
#region Paste/ OutlookSchedule
Add-TTAction   PasteOutlookSchedule.Action.Default     'Default Action' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    return ( Invoke-TTAction 'PasteOutlookSchedule.As.MailTag' $actor )
 }
Add-TTAction   PasteOutlookSchedule.As.MailTag        '貼付' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    return $true
 }
#endregion
#region Paste/ ExcelRange
Add-TTAction   PasteExcelRange.Action.Default     'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'PasteExcelRange.As.Text' $actor )
 }
Add-TTAction   PasteExcelRange.As.Text        '貼付' {
    Param( $actor )
    return $true
 }
#endregion
#region Paste/ TTObject
Add-TTAction   PasteTTObject.Action.Default             'Default Action' {
    Param( $actor )
    return ( Invoke-TTAction 'PasteTTObject.As.Tag' $actor )
 }
Add-TTAction   PasteTTObject.As.Tag                     'タグ貼付' { # nocheck
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()

    $ttobj = [TTClipboard]::_ttobj
    switch ( $true ) {
        { $ttobj -is [TTMemo] } {
            $tag = '[Memo:{0}]' -f $ttobj.ID
            $panel.EditM('insert', $tag )
        }
        { $ttobj -is [TTState] } {
            $tag = '[Set:{0}:{1}]' -f $ttobj.ID, $ttobj.Value
            $panel.EditM('insert', $tag )
        }
        { $ttobj -is [TTWebSearch] } {}
        { $ttobj -is [TTWebLink] } {}
        { $ttobj -is [TTCollection] } {}    
        { $ttobj -is [TTAction] } {}    
    }
    return $true
 }
#endregion
#endregion
#region ::: テーブル
#region ソート 
Add-TTAction    Table.NthColumn.Ascend              '選択カラム順ソート' {
    Param( $actor )
    $panel = [TTExModMode]::ExFdPanel()
    if ( $actor.UIKey -match 'F(?<n>[12345678])' -and $panel.GetMode() -eq 'Table' ) {
        $num =      $Matches.n
        $pname =    $panel.Name
        Apply-TTState "$pname.Table.Sort" "$num|Ascending"
    }
    return $true
 }
#250407 ExFd対応に変更した
Add-TTAction    Table.NthColumn.Descend             '選択カラム逆ソート' {
    Param( $actor )
    $panel = [TTExModMode]::ExFdPanel()
    if ( $actor.UIKey -match 'F(?<n>[12345678])' -and $panel.GetMode() -eq 'Table' ) {
        $num =      $Matches.n
        $pname =    $panel.Name
        Apply-TTState "$pname.Table.Sort" "$num|Descending"
    }
    return $true
 }

#endregion
#endregion

#region ::: キーワード
#region Keyword/ Action
Add-TTAction    Keyword.Action.Invoke                   'アクションを起動' {
    Param( $actor )
    return ( Invoke-TTAction 'Keyword.Action.Default' $actor )
 }
Add-TTAction    Keyword.Action.Menu                     'アクションを選択・起動' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ShowMenu({
            Param($menu)
            $global:Controller.ClearMenu( $menu )
            $tag = $script:Tag + @{ Menu = $menu; Value = $panel.GetKeyword() }
            $global:Controller.BuildMenu( 'Keyword', $menu, $tag )
        }.GetNewClosure())

    return $true
 }
Add-TTAction    Keyword.Action.Default                  'Default Action' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $panel.ShowMenu({
            Param($menu)
            $global:Controller.ClearMenu($menu)
            $tag = $script:Tag + @{ Menu = $menu; Value = $panel.GetKeyword() }
            Invoke-TTAction 'Selection.SubMenu.WebSearch' $tag
        }.GetNewClosure())

    return $true
 }
#endregion
#endregion
#region ::: TTMemo
Add-TTAction    TTMemo.SubMenu.Panel                '' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $menu = $actor.Menu
    $Global:Application.Panels.foreach{
        $mitm = [MenuItem]::New()
        $mitm.Header = "_$($_.Name)"
        $mitm.Tag = $actor + @{ MemoID = $panel.TableMain.SelectedItem.ID; Panel = $_ } 
        $mitm.Add_Click({
                Param($subm)
                $panel = $subm.Tag.Panel
                $panel.SetMode('Editor')
                $global:Controller.LoadMemo( $panel, $subm.Tag.MemoID )
                return $true
            })
        $menu.AddChild($mitm)
    }
    return $true
 }
Add-TTAction    TTMemo.Action.Default               'Default Action' {
    Param( $actor )
    return( Invoke-TTAction 'TTMemo.LoadTo.Editor' $actor )
 }
Add-TTAction    TTMemo.LoadTo.Editor                'フォーカスEditorに表示' {
    Param( $actor )
    $panel = [TTExModMode]::FdPanel()
    $global:Controller.LoadMemo( $panel, $actor.Selected.ID )
    [TTExModMode]::FdPanel().SetMode('Editor')
    return $true
 }
Add-TTAction    TTMemo.CopyTo.Clipboard             'CopyTo.Clipboard' {
    Param( $actor )
    $memo = $actor.Selected
    [TTClipboard]::CopyTTObject( $memo )
 }
Add-TTAction    TTMemo.Delete.Memo                  'Delete Memo' {
    Param( $actor )
    $memo = $actor.Selected
    $global:Models.Memos.DeleteItem( $memo.ID )
    write-host "250916: Editor表示メモがあれば非表示、履歴さかのぼる or Thinktank"
 }
#endregion
#region ::: TTCollection
Add-TTAction   TTCollection.Action.Default              'Default Action' {
    Param( $actor )
    return( Invoke-TTAction 'TTCollection.LoadTo.Table' $actor )
 }
Add-TTAction   TTCollection.LoadTo.Table                'Tableに表示' {
    Param( $actor )
    [TTExModMode]::FdPanel().SetTableResource( $actor.Selected.ID )
    return $true
 }
Add-TTAction   TTCollection.CopyTo.Clipboard            'CopyTo.Clipboard' {
    Param( $actor )
    $collection = $actor.Selected
    [TTClipboard]::CopyTTObject( $collection )
 }
#endregion
#region ::: ExMenu
Add-TTAction   ExMenu.Key.Up            'ExMenu Up' {
    return [System.Windows.Input.Key]::Up
 }
Add-TTAction   ExMenu.Key.Down          'ExMenu Down' {
    return [System.Windows.Input.Key]::Down
 }
Add-TTAction   ExMenu.Key.Left          'ExMenu Left' {
    return [System.Windows.Input.Key]::Left
 }
Add-TTAction   ExMenu.Key.Right         'ExMenu Right' {
    return [System.Windows.Input.Key]::Right
 }
Add-TTAction   ExMenu.Key.Cancel        'ExMenu Cancel' {
    return [System.Windows.Input.Key]::Escape
 }
Add-TTAction   ExMenu.Key.Select        'ExMenu Select' {
    return [System.Windows.Input.Key]::Return
 }
#endregion
#region ::: WebView2
Add-TTAction    WebView.View.ScrollUp           '画面：上にスクロール' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('scrollup')
    return $true
 }
Add-TTAction    WebView.View.ScrollDown         '画面：下にスクロール' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('scrolldown')
    return $true
 }
Add-TTAction    WebView.View.ScrollTop          '画面：最上段にスクロール' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('scrolltop')
    return $true
 }
Add-TTAction    WebView.View.ScrollEnd         '画面：最下段にスクロール' {
    Param( $actor )
    [TTExModMode]::ExFdPanel().Navigate('scrollend')
    return $true
 }
#endregion



