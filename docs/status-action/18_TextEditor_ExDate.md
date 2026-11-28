# TextEditor ExDate ================================================================================================
## Action：　260625　TextEditor.EditDate.InsertExDate
description:    カーソル位置に日付文字を挿入しExDateモードに入る
    カーソル位置に日付文字を挿入しExDateモードに入る。
    ↓カーソル位置の日付文字を判別
    　日付文字ではない場合：　初期日付フォーマットを JDateW としてカーソル位置に日付文字を入力
    ↓カーソル位置の日付文字を認識し、original値、display値、format値として取得・保管する。
    ↓ExDateモードに入ります。
    日付入力の概要は過去のスクリプト docs\reference\script\TTPanel.ps1 を参照
    日付文字判別用の正規表現は以下です。
        @{ Key = 'DateTag'; Regex = [Regex]'\[\d{4}\-\d{2}\-\d{2}\]' }
        @{ Key = 'Date'; Regex = [Regex]'\d{4}\/\d{1,2}\/\d{1,2}( \(.\))?( \d{2}:\d{2})?' }
        @{ Key = 'JDate'; Regex = [Regex]'\d{4}年\d{1,2}月\d{1,2}日( \(.\))?( \d{2}:\d{2})?' }
        @{ Key = 'GDate'; Regex = [Regex]'(明治|大正|昭和|平成|令和)(\d{1,2}|元)年\d{1,2}月\d{1,2}日( \(.\))?( \d{2}時\d{2}分)?' }
　　日付文字挿入用のフォーマットは以下です。　ggyyは日本の元号です。
        DateTag = @{ Format = '[yyyy-MM-dd]' }
        Date    = @{ Format = 'yyyy/MM/dd' }
        DateW   = @{ Format = 'yyyy/MM/dd (ddd)' }
        DateT   = @{ Format = 'yyyy/MM/dd HH:mm' }
        DateWT  = @{ Format = 'yyyy/MM/dd (ddd) HH:mm' }
        JDate   = @{ Format = 'yyyy年MM月dd日' }
        JDateW  = @{ Format = 'yyyy年MM月dd日 (ddd)' }
        JDateT  = @{ Format = 'yyyy年MM月dd日 HH:mm' }
        JDateWT = @{ Format = 'yyyy年MM月dd日 (ddd) HH:mm' }
        GDate   = @{ Format = 'ggyy年MM月dd日' }
        GDateW  = @{ Format = 'ggyy年MM月dd日 (ddd)' }
        GDateT  = @{ Format = 'ggyy年MM月dd日 HH時mm分' }
        GDateWT = @{ Format = 'ggyy年MM月dd日 (ddd) HH時mm分' }　
## Action：　260625　TextEditor.EditDate.ChangeFormat
description:    カーソル位置の日時フォーマットを変更する
    カーソル位置の日時フォーマットを変更する。
    変更の順番は過去のスクリプト docs\reference\script\TTPanel.ps1 を参照
## Action：　260625　TextEditor.EditDate.ToggleWeekday
description:    カーソル位置の曜日表示を変更する
    カーソル位置の曜日表示を変更する
## Action：　260625　TextEditor.EditDate.ToggleTime
description:    カーソル位置の時間表示を変更する
    カーソル位置の時間表示を変更する
## Action：　260625　TextEditor.EditDate.IncYear
description:    カーソル位置の年を1増やす
    カーソル位置の年を1増やす
## Action：　260625　TextEditor.EditDate.DecYear
description:    カーソル位置の年を1減らす
    カーソル位置の年を1減らす
## Action：　260625　TextEditor.EditDate.IncMonth
description:    カーソル位置の月を1増やす
    カーソル位置の月を1増やす
## Action：　260625　TextEditor.EditDate.DecMonth
description:    カーソル位置の月を1減らす
    カーソル位置の月を1減らす
## Action：　260625　TextEditor.EditDate.IncWeek
description:    カーソル位置の週を1増やす
    カーソル位置の週を1増やす
## Action：　260625　TextEditor.EditDate.DecWeek
description:    カーソル位置の週を1減らす
    カーソル位置の週を1減らす
## Action：　260625　TextEditor.EditDate.IncDay
description:    カーソル位置の日を1増やす
    カーソル位置の日を1増やす
## Action：　260625　TextEditor.EditDate.DecDay
description:    カーソル位置の日を1減らす
    カーソル位置の日を1減らす
## Action：　260625　TextEditor.EditDate.SetNow
description:    カーソル位置の日時を今にする
    カーソル位置の日時を今にする　
## Action：　260625　TextEditor.EditDate.Reset
description:    カーソル位置の日時を元に戻す
    カーソル位置の日時を元に戻す　

