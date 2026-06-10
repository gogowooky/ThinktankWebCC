# Thinktank アプリケーションマッピングシート

本ドキュメントは、アプリケーションにおける **①UI状態（UIState）**、**②アクション（Actions）**、および **③ショートカット（KeyBinding）** のマッピングと整合性を整理したシートです。

---

## 1. 状態・アクション・キーバインド マッピング一覧

現在、キーバインドからアクションが呼び出され、必要に応じてUI状態が更新される一連のフローが定義されている項目です。

| 機能概要 | ③ KeyBinding (キー) | フォーカス範囲 | ② Action (アクションID) | ① 変更される UIState |
| :--- | :--- | :--- | :--- | :--- |
| **Thinktankパネル開閉** | `ctrl+alt+1` | 全体 (`*`) | `Panel.Thinktank.Toggle` | `ThinktankPanel.Open` |
| **Overviewパネル開閉** | `ctrl+alt+2` | 全体 (`*`) | `Panel.Overview.Toggle` | `OverviewPanel.Open` |
| **Workout設定トレイ開閉** | `ctrl+alt+3` | 全体 (`*`) | `Panel.WorkoutSetting.Toggle` | `WorkoutPanel.SettingOpen` |
| **ReThinkパネル開閉** | `ctrl+alt+4` | 全体 (`*`) | `Panel.ReThink.Toggle` | `ReThinkPanel.Open` |
| **レイアウトモード切替** | `ctrl+alt+l` | 全体 (`*`) | `Application.LayoutMode.Toggle` | `Application.LayoutMode` |
| **フォーカス中ペインを保存** | `ctrl+s` | Workoutペイン (`Workout`) | `Workout.SaveFocused` | - *(直接ファイル保存)* |
| **フォーカス中ペインを閉じる**| `ctrl+alt+w` | Workoutペイン (`Workout`) | `Workout.CloseFocused` | - *(ペイン破棄)* |
| **ペイン幅の均等化** | `ctrl+alt+e` | 全体 (`*`) | `Workout.Equalize` | - *(レイアウトの再計算)* |
| **見出しの段階的折りたたみ** | `ctrl+alt+[` | エディタ (`Workout.TextEditor`) | `TextEditor.Folding.CloseEachLevel`| - *(エディタ表示状態)* |
| **見出しの段階的展開** | `ctrl+alt+]` | エディタ (`Workout.TextEditor`) | `TextEditor.Folding.OpenEachLevel` | - *(エディタ表示状態)* |
| **前の表示見出しへ移動** | `ctrl+alt+arrowup` | エディタ (`Workout.TextEditor`) | `TextEditor.Heading.Previous` | - *(カーソル移動)* |
| **次の表示見出しへ移動** | `ctrl+alt+arrowdown`| エディタ (`Workout.TextEditor`) | `TextEditor.Heading.Next` | - *(カーソル移動)* |
| **親見出しへ移動** | `ctrl+alt+arrowleft`| エディタ (`Workout.TextEditor`) | `TextEditor.Heading.Parent` | - *(カーソル移動)* |
| **セルの編集** | `enter` \| `f2` | グリッド (`Workout.DataGrid`) | `DataGrid.EditCell` | - *(セル編集モード移行)* |
| **行を追加** | `ctrl+enter` | グリッド (`Workout.DataGrid`) | `DataGrid.AddRow` | - *(データ行追加)* |
| **列を追加** | `ctrl+shift+enter`| グリッド (`Workout.DataGrid`) | `DataGrid.AddColumn` | - *(データ列追加)* |
| **行を削除** | `ctrl+delete` | グリッド (`Workout.DataGrid`) | `DataGrid.DeleteRow` | - *(データ行削除)* |
| **UI状態を元に戻す** | `ctrl+alt+z` | 全体 (`*`) | `UIState.Undo` | *UIState 履歴全体を戻す* |
| **UI状態をやり直す** | `ctrl+alt+y` | 全体 (`*`) | `UIState.Redo` | *UIState 履歴全体を進める* |

---

## 2. マッピングされていない UIState 一覧

UI状態（`buildPropSpecs()` 内）として定義されていますが、**現在専用のアクション（`TTActions`）やショートカットキーが直接割り当てられていない** 状態項目です。
これらは主に、UI上でのマウスドラッグ操作や、その他のUIコンポーネントから直接 `ApplyProperty` を介して更新されます。

| UIState キー | 型 / 選択肢 | デフォルト値 | 説明 | 主な更新契機 / 備考 |
| :--- | :--- | :--- | :--- | :--- |
| `Application.CloudSyncEnabled` | boolean | `true` | クラウド同期の有効化 | 設定画面のチェックボックスなどから直接変更 |
| `ThinktankPanel.Width` | string (数値) | `240` | 左パネル幅 | スプリッター（境界線）のマウスドラッグ操作など |
| `OverviewPanel.Width` | string (数値) | `260` | Overviewパネル幅 | スプリッター（境界線）のマウスドラッグ操作など |
| `ReThinkPanel.Width` | string (数値) | `260` | ReThinkパネル幅 | スプリッター（境界線）のマウスドラッグ操作など |

> [!TIP]
> **今後の拡張案**:
> * `ThinktankPanel.Width` や `OverviewPanel.Width` などの幅設定は、「初期幅に戻す」といったリセット用のアクション（例: `Panel.Thinktank.ResetWidth`）を作成し、キーバインドを割り当てることが可能です。
> * `Application.CloudSyncEnabled` についても、ショートカットでトグルできるアクションを作ることができます。

---

## 3. マッピングされていない Action 一覧

現在、`TTActions` レジストリに登録されているアクションのうち、ショートカットキーが割り当てられていないアクションです。

*   **現在、登録済みの全アクションに対してショートカットキーが割り当てられています。（未マッピングの登録済アクションは 0 件です）**

> [!NOTE]
> **今後の拡張案 (ショートカット未割り当てアクションの候補)**:
> 今後、以下のようなアクションを `TTActions` に追加する際、あえてデフォルトのキーバインドを割り当てず、コマンドパレットや右クリックメニュー、または設定ファイル経由でのみ実行可能とする「キーバインドなしアクション」を整備する余地があります。
> * `Workout.SaveAll` (開いている全ペインの保存)
> * `Application.ResetAllSettings` (UI設定の初期化)
