# Table Display
## Status 完了：　261018　Table.CellContent.Display
description:    テーブルのセル表示方法
key:            Table.CellContent.Display
current:        Line
default:        Line
type:           string
candidates:     ^(Line|FitToColumn)$
## Action 完了：　261018　Table.CellContent.Display:Toggle
description:    テーブルのセル表示方法をトグルする
## Status 完了：　261018　Table.CellContent.Position
description:    テーブルのセル表示位置
key:            Table.CellContent.Position
current:        Left
default:        Left
type:           string
candidates:     ^(Left|Center|Right)$
## Action 完了：　261018　Table.CellContent.Position:Toggle
description:    テーブルのセルの表示位置をトグルする
## Action 完了：　261018　Table.CellContent.Position:Left
description:    テーブルのセルの表示位置を左寄せにする
## Action 完了：　261018　Table.CellContent.Position:Center
description:    テーブルのセルの表示位置を中心寄せにする
## Action 完了：　261018　Table.CellContent.Position:Right
description:    テーブルのセルの表示位置を右寄せにする

　A（261018実装）：
　　■ Status：TTWorkingPanel.Table.CellContent.Display / .Position（全Pane共通）を実体とし、
　　　src\views\settings\workingSpecs.ts に登録しました（PROP_SPECS に載るので保存・Undo の対象）。
　　　Table.* の変更は WorkingPanel に通知します（TTApplication の listen('Table.*')）。
　　■ Action：src\views\TTFocusedPanelActions.ts に登録しました。
　　　Display:Toggle は Line ⇔ FitToColumn、Position:Toggle は Left → Center → Right → Left の循環、
　　　Position:Left / Center / Right はその値を設定します。結果（新しい値）は ACTION 欄に出ます。
　　■ 表示：DataGrid のテーブル（TableGridView）のデータセルに反映します。
　　　Line は従来どおり1行表示（はみ出しは省略）、FitToColumn は列幅で折り返し、行の高さは内容に合わせます
　　　（仮想スクロールが行ごとに高さを測り直します）。Position は左寄せ・中央寄せ・右寄せです。
　　　列ヘッダーと新規入力行は変えていません。
　　■ 操作：Working>DataGrid設定>表示 に 折返し・左寄・中央寄・右寄 のボタンを置きました。
　　　ツールチップは ActionID、押すとその Action を実行し、現在の設定に当たるボタンを強調表示します。
　　　アイコンは lucide-react 0.474 のため、text-wrap / text-align-start / -center / -end の旧名
　　　（WrapText / AlignLeft / AlignCenter / AlignRight）を使っています。
　　　ショートカットとメニューは割り当てていません。

