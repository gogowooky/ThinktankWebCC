# Panel Thinktank ==================================================================================================
## Action：　260714　ThinktankPanel.Filter.Cursor:Action
description:    Think一覧のカーソル位置のアイテムを開く
　↓ カーソル位置のアイテムを開く　→　終了
## Action：　260714　ThinktankPanel.Filter.Cursor:ToggleCheck
description:    Think一覧のカーソル位置のチェック状態をトグルする
　↓ カーソル位置のチェック状態をトグルする　→　終了
## Status：　260714　ThinktankPanel.Filter.CursorPosID
description:    Thinktank>Think一覧のカーソル位置のID
key:            ThinktankPanel.Filter.CursorPosID
current:        ''
default:        ''
type:           string
candidates:      .*
## Status：　260714　ThinktankPanel.Filter.CursorPos
値0は表示されていない、1以上はカーソルの行番号

description:    Thinktank>Think一覧のカーソル位置
key:            ThinktankPanel.Filter.CursorPos
current:        0
default:        0
type:           string
candidates:      .*
## Action：　260714　ThinktankPanel.Filter.CursorPos:PrevLine
description:    Think一覧のカーソルを1行前に移動する
　↓ カーソルを１行前に移動する　→　終了
## Action：　260714　ThinktankPanel.Filter.CursorPos:NextLine
description:    Think一覧のカーソルを1行後に移動する
　↓ カーソルを１行後に移動する　→　終了
## Status：　261009　ThinktankPanel.Area.OpenWidth
key:の意味
「init」は起動時の値。
「user」はアプリ使用中にユーザーが設定した値
「foredit」は、iphoneの時はアプリ幅の100%、その他の時はアプリ幅の30%とする
　（縦タブバー・Splitter を含めたパネル全体の幅。割合は src\utils\panelAreaWidth.ts の FOR_EDIT_RATIO）

description:    ThinktankパネルOpen時の幅
key:            ThinktankPanel.Area.OpenWidth
type:           string
candidates:     (init|user|foredit)
## Status：　260619　ThinktankPanel.Area.IsOpen
description:    左パネル表示
key:            ThinktankPanel.Area.IsOpen
current:        true
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　ThinktankPanel.Mode.Name
description:    左パネルモード
key:            ThinktankPanel.Mode.Name
current:        Filter
default:        Filter
type:           string
candidates:     ^(Filter|Chat|Settings)$


　Q：設定値を記載してください。
　A：設定可能な値は以下の3つです。
　　- Filter （フィルター / 検索）
　　- Chat （AI相談チャット）
　　- Settings （設定）
## Status：　260711　ThinktankPanel.CurrentItem.ID
description:    Thinktank>Think一覧のカーソル位置アイテムID
key:            ThinktankPanel.CurrentItem.ID
current:        ''
default:        ''
type:           string
candidates:     ^\d{4}\-\d{2}\-\d{2}\-\d{6}$
