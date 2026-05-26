# Thinktank（TTWeb260418）実装の特徴

> 本ドキュメントは `concept.md` / `concept_ui.md`（コンセプト・方向性）とは別に、
> **TTWeb260418 ブランチの実装上の特徴的な仕組み**を記録するもの。
> 「何を目指すか」ではなく「どう作られているか」のメモ。

---

## 0. 通底する思想 ── 「設定もデータ（保管庫内の Think）」

このアプリの最大の特徴は、**UI 設定やキーボードショートカットといった“アプリの挙動そのもの”を、保管庫内の Think（`ContentType='table'`）として保存・編集する**点にある。

- キーボードショートカット → `__tt_shortcuts__`（table Think）
- UI 状態変数 → `__tt_ui_state__`（table Think）

→ 設定がコードに固定されず、**データとして編集→即反映**できる。ユーザーがテーブルを書き換えればアプリの挙動が変わる、データ駆動の設計。

---

## 1. アプリ状態変数の管理（`TTUIStateManager`）

UI の状態を「変数」として一元管理する仕組み。

- **`PROP_SPECS` に全項目を一元集約**。各項目は `key / current / default / type / candidates / description` ＋ `get(app)` / `set(app,v)` を持つ。新しい設定項目の追加は **オブジェクトを1つ足すだけ**。
- 型は `boolean / string / color / json`。
- **`candidates`（正規表現）で値を検証**。特別値 `toggle`（真偽反転）・`next` / `prev`（列挙の循環）に対応。
- **永続化の2系統**:
  1. `localStorage` への高速ロード/保存（起動時）
  2. `__tt_ui_state__` Think（table）との同期 ── DataGrid/Card で `current` 列を編集して Ctrl+S すれば即 UI に反映。逆に更新ボタンで現在値をファイルへ。
- **Undo/Redo**（メモリ内スタック、最大 50 件。`ui:undo` / `ui:redo`）。
- 値の適用は `applyProperty(target, value)` 経由（後述のキー・アクションからも呼ばれる）。

対象例: 各パネルの `IsAreaOpen` / `ViewMode` / パネル幅、TextEditor の表示設定・色、ハイライトスタイル等。

---

## 2. ExMode システム（`TTApplicationStatus`）

**モディファイアキーを押している間だけ有効な一時モード**。Vim の operator-pending に近い、文脈限定の入力モード。

- `_exMode`（現在の ExMode 名、空＝非アクティブ）と `_exModeModKey`（ExMode 開始時に押下されていたモディファイア文字列）を保持。
- `SetExMode(name, modKey)` で開始、`ClearExMode()` で終了。
- ExMode 中はショートカットのキーに **そのモディファイアを自動付加**して照合する（`ExModeModKey` をマージ）。つまり「修飾キーを押している間だけ別のキーマップが有効」になる。
- `LastActionDisplay` に直近アクションを記録し、**KeyAction バー**にリアルタイム表示。

例: `ExPanel` モード中に `o`（パネル開閉）/ `p`・`n`（モード前後）。

---

## 3. キー・アクションバインディング（`TTShortcutManager`）

**「フォーカスパネル × ExMode」をコンテキストに、キー/マウス/ホイールへアクションを束ねる**中核。

- ショートカット定義テーブルの列: `focus / exmode / key / action / description`。
- **`focus`（フォーカス名パターン）**: `*`＝すべて、`Workout*`＝前方一致、完全一致。現在のフォーカス名（後述 §4）と照合。
- **`exmode`**: ExMode 名（空＝ExMode なし）。
- **`key` の表現力**:
  - キーボード `{ctrl|alt|shift|meta}+{key}`（順不同・正規化）
  - マウス `left1 / left2 / right1`、ホイール `wheelup / wheeldown`（修飾付き可）
  - **コード入力**（`Ctrl+K Z` のような2打鍵、2秒タイムアウト）
  - **複数キーを `|` で同一アクションに割当**（`|` 自体は `"..."` で囲む）
- **`action` の3系統** ── ここが要点:
  1. `ActionID`（コロンなし）→ `TTActions.Execute()` で関数アクション実行
  2. **`{状態変数}:{値}` → `TTUIStateManager.applyProperty()`**（＝**状態変数への値設定をアクションとして登録できる**。`toggle` 等も可）
  3. `ExMode:{name}` → ExMode 開始 / `ui:undo` / `ui:redo`
- **インデックス構造**で高速化: 全件 `_keyIndex` → 現在の focus+exmode で絞った `_activeTable` ＋ コード入力用 `_activeChordStarters`。フォーカス/ExMode 変化のたびに再構築。
- **処理優先順位**: ①フォーカス固有 → ②ExMode 関連グローバル（入力欄内でも有効）→ ③通常グローバル（input/textarea/contenteditable/Monaco 内では抑止）。
- アクションは `Allow` フラグで「後続の一致ショートカットも続けて実行するか」を制御できる。
- 定義は `__tt_shortcuts__`（table Think）に保存。編集→保存で `_loadFromContent()` が走り**即反映**。

---

## 4. フォーカス名によるコンテキスト判定（`getFocusName`）

DOM 上のフォーカス要素から、**論理的な「フォーカス名」を導出**するユーティリティ。

- 例: `Workout.TextEditor` / `Workout.Graph` / `Thinktank.Thoughts` / `Overview.Analyze` / `ReThink.Chat` / `WorkoutSetting.TextEditor` など。
- `closest()` で祖先要素や `data-media-type`、アクティブリボンの `aria-label` を見て判定。
- **キー・アクションの `focus` 照合**（§3）と、**KeyAction バーの表示**で共用 ── 「今どこにフォーカスがあるか」を単一の語彙で扱う。

---

## 5. 色モード（Panel / テキストへの色設定）

TextEditor を中心に、表示色を細かく設定できる（`TextEditorSettings`）。

- **セクション見出しスタイル**（`SectionStyle`）: 見出しレベル別の `color / bold / underline` を5段。
- **ハイライトスタイル**（`HighlightStyle`）: `backgroundColor / color` を5段（§HighlightProvider と連動）。
- **基本色**: 背景 / 文字 / 選択 / 一致（occurrence）色。
- **プリセット**: セクション・ハイライトとも **5プリセット**を保持し切替可能（`SectionPresets` / `HighlightPresets`）。
- これらの色設定も §1 の状態変数（`type='color'` / `'json'`）として管理・永続化される。

---

## 6. TextEditor の clickable text（Actor）※未実装

- TextEditor 内の特定テキストを **クリック可能な「Actor」** にし、クリックでアクション（他 Think へ飛ぶ、コマンド実行 等）を起動できるようにする構想。
- **現時点では未実装**。将来、§3 のアクション体系や §4 のフォーカス文脈と接続する余地がある。

---

## 7. その他の基盤的な特徴

- **ストレージ抽象（`IStorageBackend` / `StorageManager`）**: Electron / ローカル FS / BigQuery(PWA) を同一インターフェースで差し替え。実行環境を自動判定。
- **単一モデル `TTThink` + `ContentType`**: 全データ種別を1クラスで表現（`memo/thought/table/links/chat/nettext`）。メタのみ先読みし本文は遅延ロード（`IsMetaOnly`）。
- **Notify/Observer ビューモデル層（`TTNotifyBase`）**: `NotifyUpdated()` / `AddOnUpdate()` による購読でビュー（React）を更新。ExMode 変化→ショートカット再構築なども同機構で連動。
- **BSP ツリーによる Workout レイアウト（`TTWorkoutPanel`）**: 純粋関数（`addToFocused` / `removeLeaf` / `swapLeafs`）でツリーを不変操作。縦(v)/横(h)分割、D&D でペイン入替。
- **KeyAction バー**: フォーカス名・押下モディファイア・キー・起動アクションをリアルタイム表示（ショートカット設計のデバッグにも有用）。
