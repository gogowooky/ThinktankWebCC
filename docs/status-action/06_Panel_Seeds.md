# Panel Seeds ======================================================================================================
## Action：　260714　SeedsPanel.Filter.Cursor:Action
description:    Think一覧のカーソル位置のアイテムを開く
　↓ カーソル位置のアイテムを開く　→　終了
## Action：　260714　SeedsPanel.Filter.Cursor:ToggleCheck
description:    Think一覧のカーソル位置のチェック状態をトグルする
　↓ カーソル位置のチェック状態をトグルする　→　終了
## Status：　260714　SeedsPanel.Filter.CursorPosID
description:    Seeds>Think一覧のカーソル位置のID
key:            SeedsPanel.Filter.CursorPosID
current:        ''
default:        ''
type:           string
candidates:      .*
## Status：　260714　SeedsPanel.Filter.CursorPos
値0は表示されていない、1以上はカーソルの行番号

description:    Seeds>Think一覧のカーソル位置
key:            SeedsPanel.Filter.CursorPos
current:        0
default:        0
type:           string
candidates:      .*
## Action：　260714　SeedsPanel.Filter.CursorPos:PrevLine
description:    Think一覧のカーソルを1行前に移動する
　↓ カーソルを１行前に移動する　→　終了
## Action：　260714　SeedsPanel.Filter.CursorPos:NextLine
description:    Think一覧のカーソルを1行後に移動する
　↓ カーソルを１行後に移動する　→　終了

　A：Status は TTUIStateManager に読み取り専用（isConst）の派生値として登録しました。
　　値はフィルタ・ソート適用後のThink一覧における行番号で、カーソル未設定時は 0 です。
　　Action は Ctrl+N / Ctrl+P に割当てました（docs\DefaultShortcut.md）。
　　行番号0（カーソル未表示）からの移動は、PrevLine/NextLineとも1行目へ移動します。
## Status：　260917　SeedsPanel.Area.OpenWidth
key:の意味はThinktankPanel.Area.OpenWidthと同じ
description:    SeedsパネルOpen時の幅
key:            SeedsPanel.Area.OpenWidth
type:           string
candidates:     (init|user|foredit)
## Status：　260619　SeedsPanel.Area.IsOpen

description:    上部パネル表示
key:            SeedsPanel.Area.IsOpen
current:        false
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　SeedsPanel.Mode.Name

description:    上部パネルモード
key:            SeedsPanel.Mode.Name
current:        Datagrid
default:        Datagrid
type:           string
candidates:     ^(Datagrid|Graph|Chat|Settings)$

　Q：設定値を記載してください。
　A：設定可能な値は以下の4つです。
　　- Datagrid （データグリッド）
　　- Graph （関係性グラフ）
　　- Chat （AIチャット）
　　- Settings （設定）
## Status：　260711　SeedsPanel.CurrentItem.ID
description:    Seeds>Think一覧のカーソル位置アイテムID
key:            SeedsPanel.CurrentItem.ID
current:        ''
default:        ''
type:           string
candidates:     ^\d{4}\-\d{2}\-\d{2}\-\d{6}$
## Status：　260624　SeedsPanel.Project.ID
　本StatusIDの中身
　Seedsパネルに設定された Projectファイルの IDです。
　※ 起動時のロードおよびD&Dドロップ時の即時反映対応完了。

description:    SeedsパネルのProjectファイルID
key:            SeedsPanel.Project.ID
current:        none
default:        none
type:           string
candidates:     .*
