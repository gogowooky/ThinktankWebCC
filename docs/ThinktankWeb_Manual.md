# Thinktank アプリケーション取扱説明書

本取扱説明書は、ナレッジ管理・思考支援アプリケーション「**Thinktank**」の概要、基本的な使い方、および詳細な機能仕様について解説します。

---

## 1. 概要

**Thinktank**は、日々の思考、テキストメモ、データベース（表）、AIとのチャット履歴をひとつの場所に集め、それらを相互に関連付けながら思考を深めるための**ナレッジ管理・思考支援システム**です。

### 3つの核心機能
1.  **記憶支援**: 大量に蓄積した過去のメモや対話履歴を、日付、キーワード、さらにAIによる意味的なアプローチ（セマンティック検索）で即座に探し出します。
2.  **思考支援**: 現在フォーカスしているメモやテーマの文脈（コンテキスト）を自動的にAIに手渡し、SSE（サーバー送信イベント）による高速ストリーミングチャットを通じて、アイデアの要約や分析、ブレインストーミングを支援します。
3.  **発見支援**: 異なるメモ同士の関係性（関連リンク）をグラフィカルに可視化し、キーワードが直接一致しなくても関連するナレッジを自動でサジェストします。

### 2つの起動モード
*   **Localアプリモード (Electron)**: PCにインストールされたデスクトップアプリとして動作します。データはローカルのJSONファイルとして保存され、オフラインでも利用可能です。
*   **PWAモード (Web)**: WebブラウザからURLを開いて動作します。データはクラウドの Google BigQuery に直接保存され、どこからでも同一のデータにアクセス可能です。

---

## 2. 初めて使う方へ（クイックスタート）

### 2.1 起動と準備
1.  デスクトップ版（Electron）の場合は、アプリアイコンをダブルクリックして起動します。
2.  ブラウザ版の場合は、指定されたURLを開きます。
3.  起動すると、以下の**4つのパネル**が横並びになったUIが表示されます。

### 2.2 4パネルUI of 構成
```
┌────────────────┬────────────────┬────────────────────────────────┬────────────────┐
│  Thinktank     │  Overview      │        Workout Panel           │  ReThink       │
│  Panel         │  Panel         │                                │  Panel         │
│  （ダークブルー）│  （インディゴ）  │        （グレー）              │  （ダークグリーン）│
│  データ一覧・   │  選択したテーマ  │  メイン作業領域                 │  AIとのチャット │
│  検索・絞り込み │  の構造表示     │  画面を縦横に分割・編集可能     │  思考の深化     │
└────────────────┴────────────────┴────────────────────────────────┴────────────────┘
```

### 2.3 基本操作の流れ
1.  **データの選択**:
    左端の **ThinktankPanel** で、Thoughts（テーマ）のリストから見たいテーマを選択します。
2.  **全体像の俯瞰**:
    選択されたテーマに属する子データ（Think）の一覧が **OverviewPanel** に表示されます。ここで全体のつながり（グラフ）やリストを確認します。
3.  **編集と作業（ワークアウト）**:
    閲覧・編集したい Think をダブルクリックするか、中央の **WorkoutPanel** にドラッグ＆ドロップして開きます。
    *   WorkoutPanel のリボンにある「右に分割」「下に分割」ボタンを押すことで、画面を何分割にもして異なるデータを並べて作業できます。
4.  **AIとの対話思考**:
    中央で作業しているナレッジについて考えを深めたいときは、右端の **ReThinkPanel** にメッセージを入力します。AIはあなたが今フォーカスしているナレッジの内容を理解した上で応答します。

---

## 3. 詳細説明

### 3.1 4パネルの機能詳細

#### ThinktankPanel (左端 / テーマカラー: ダークブルー)
*   **Ribbonボタン（縦メニュー）**:
    *   `Sparkles`: AI絞り込みモード（将来実装予定）
    *   `Filter`: タイトル、日付、ContentTypeでのデータの絞り込み。
    *   `Search`: キーワードによる全文検索、またはGemini Embeddingsを使用した「意味検索（セマンティック検索）」。
    *   `Brain`: 登録されている Thoughts（テーマ）の一覧表示。
*   **Settings（歯車アイコン）**: 保管庫（Vault）の接続先や、APIキーの設定を行います。

#### OverviewPanel (中央左 / テーマカラー: インディゴ)
*   選択したThought（コレクション）の中身を以下の形式で表示できます：
    *   `datagrid`: 表形式の一覧表示。カラムの並べ替えやフィルタリングが可能。
    *   `graph`: 選択テーマと子データの関係性をノードとエッジで描画。
    *   `chat`: 選択したテーマに直接紐づくAI相談チャット。

#### WorkoutPanel (中央右 / テーマカラー: グレー)
*   **BSP（二分空間分割）ツリーレイアウト**:
    メイン作業領域は、縦分割・横分割によって自由にグリッドを再帰分割できます。
*   **選択可能な表示形式（MediaType）**:
    各分割ペイン（Area）は独立して以下のMediaTypeに切り替えられます。
    *   `texteditor`: Monaco Editorを使用したリッチなMarkdown/CSVテキスト編集。未保存時は `●` がタイトルに表示されます。
    *   `markdown`: Markdownの整形プレビュー表示。
    *   `datagrid`: 表データのスプレッドシート風表示。
    *   `card`: カード形式（かんばん風）での情報カード一覧。
    *   `graph`: ノード関係グラフ。
    *   `chat`: AIとの対話用 CLI 風チャット。

#### ReThinkPanel (右端 / テーマカラー: ダークグリーン)
*   現在フォーカスされているペイン（WorkoutPanelで最後にクリックされたエリア）のThinkデータ、または現在選択中のThoughtデータをAIへのコンテキストとして自動で渡し、会話を進めることができます。

---

## 4. 技術詳細

### 4.1 Thinkファイルのフォーマット形式

保存されるデータアイテム（`TTThink`）のテキスト表現仕様です。

#### ① memo / nettext (自由テキスト形式)
1行目がタイトル（`Name`）になり、2行目以降は通常のMarkdown形式のテキストです。
```markdown
[タイトル行]
（以降は自由なMarkdownテキスト）
```

#### ② thought (テーマ・コレクション形式)
複数のThinkIDや検索条件を保持し、関連するThinkを仮想的に集約するためのフォーマットです。
```markdown
[タイトル]
> Keyword：[キーワード]
> 作成日：[基準日], [範囲]
> 更新日：[基準日], [範囲]
>> 検索語：[全文検索クエリ]
>> 作成日：[基準日], [範囲]
>> 更新日：[基準日], [範囲]
* [ThinkID_1]
* [ThinkID_2]
```
*   1行目 : コレクションタイトル（行頭の `> ` や `>> ` は除去して処理されます）
*   `>` で始まる行 : フィルターパラメータ（Keyword、作成日、更新日）
*   `>>` で始まる行 : 全文検索パラメータ（検索語、作成日、更新日）
*   `*` で始まる行 : thoughtに含まれる個別ThinkのIDリスト（1行につき1件）
*   パース・シリアライズロジックは [thinkFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/thinkFormat.ts) の `parseThought()` および `serializeThought()` に一元化されています。

#### ③ chat (AI対話記録形式)
AIアシスタントとの会話ログを記録するフォーマットです。
```markdown
[タイトル行]
## [ユーザーの最初の質問]
[AIの最初の回答]

## [ユーザーの次の質問]
[AIの次の回答]
```
*   `## ` で始まる行 : ユーザーの発言
*   それ以外の行 : AIの応答メッセージ（Markdown対応）
*   パース・シリアライズロジックは [thinkFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/thinkFormat.ts) の `parseChat()` および `serializeChat()` に一元化されています。

#### ④ links (リンク集形式)
外部URLやローカルファイルパスのリンクをまとめて管理するフォーマットです。
```markdown
[タイトル行]
* [[リンクのラベル_1]]([URL_1])
* [[リンクのラベル_2]]([URL_2])
```
*   `* ` で始まる行 : `* [ラベル](URL)` のMarkdownリンク形式
*   パース・シリアライズロジックは [thinkFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/thinkFormat.ts) の `parseLinks()`, `serializeLinks()`, `appendLinkToContent()` に一元化されています。

#### ⑤ table (表形式データ)
CSVをベースにした独自形式のデータです。
```markdown
[タイトル行]
> 列名1,列名2,列名3
値A1,値A2,値A3
# コメントやメモ（保存時も維持されます）
値B1,値B2,値B3
```
*   `>` で始まる最初の行 : 列定義ヘッダー（CSV形式）
*   データ行 : 通常のCSV形式の行
*   `#` または `;` で始まる行 : コメント行（データとして読み込まれませんが、ファイル構造を維持したまま保存されます）
*   パース・シリアライズロジックは [tableFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/tableFormat.ts) の `parseTableContent()` および `tableSectionToContent()` が処理を担います。

---

### 4.2 UI設定の同期と構造維持更新

*   アプリの表示/非表示状態やテキストエディタのカラーテーマ等の設定は、`__tt_ui_state__` というシステムThink（table種別）で管理されています。
*   この設定値は `localStorage` にキャッシュされ、高速起動を実現しています。
*   保存時には、ユーザーがエディタ（Monaco Editor）等で手書きしたコメント行や空行のファイル構造を壊さないように、[tableFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/tableFormat.ts) の `updateTableContent()` 汎用関数を利用して、`current` 列（または後方互換用の `value` 列）のみを部分更新する**構造維持シリアライズ**が適用されます。

---

### 4.3 Status値（状態変数）の管理

*   **型安全な設定キーの定義**:
    アプリ設定項目（`PROP_SPECS`）のキーは `ConfigKey` リテラル型として厳密に定義され、存在しない設定項目に対するタイポ等のバグをコンパイル段階で検出します。
*   **Pub/Sub通知モデル**:
    [TTUIStateManager.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/views/TTUIStateManager.ts) から特定のパネルクラスに更新通知を強制するハードコードを排除し、`addListener()` / `removeListener()` / `_emit()` による自律的なイベントエミッター方式へ移行しました。
*   **一括イベント購読**:
    [TTApplication.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/views/TTApplication.ts) の初期化（コンストラクタ）において、各パネル設定の変更イベント購読を一括定義し、状態変数の更新が適切なコンポーネントの再描画（`NotifyUpdated()`）に自動伝搬する構成をとっています。

---

### 4.4 アクションの管理

*   **型安全なActionID**:
    ショートカット等からキックされるアクションIDは `ActionID` リテラル型として定義され、型チェックの恩恵を受けられます。
*   **同期・非同期のハイブリッド実行**:
    [TTActions.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/views/TTActions.ts) は、非同期処理（Completion が `Promise` を返す）と同期処理の両方をシームレスにサポートします。
    *   非同期アクション実行時は、ステータスバーに `[実行中...]` が即座に表示され、完了（resolve）またはエラー（reject）時に自動的に状態表示が更新されます。
*   **メタデータと一覧取得**:
    アクション定義（`TTAction`）には `Description` (説明) や `Category` (分類) が定義でき、`TTActions.GetRegisteredActions()` を用いて登録されているアクション一覧とメタデータを動的に取得可能です。

---

### 4.5 キーバインディングの管理

*   **キーイベント解析の分離**:
    キーボードイベントやマウス/ホイールイベントから「`ctrl+shift+z`」などの文字列に変換・正規化するロジックや、複数キー定義を分割する処理は [keyboardUtils.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/keyboardUtils.ts) に完全に分離されています。
*   **フォーカス状態に応じたディスパッチ**:
    [TTShortcutManager.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/views/TTShortcutManager.ts) は、現在アクティブなフォーカス（`getFocusName()` 経由）および ExMode（一時的なモディファイアモード）と照合して、一致するアクションをディスパッチします。
*   **入力フォームでの競合制御**:
    `input`, `textarea`, `select` および `contenteditable` 要素にフォーカスがある間は、グローバルショートカットの処理を自動的に無効化（`_shouldHandle`）し、Monaco Editor 固有のアクション（アウトライン移動等）のみをバイパスして安全に実行するロジックになっています。

---

## 付録 1. Status名とその説明

アプリケーションの状態変数（UI設定 `__tt_ui_state__` で管理される項目）の一覧です。

| ステータス名（設定キー） | 担当パネル | データ型 / 選択肢 | 既定値 | 説明 |
| :--- | :--- | :--- | :--- | :--- |
| `ThinktankPanel.IsAreaOpen` | `ThinktankPanel` | `boolean` (true / false) | `true` | 左パネル（ThinktankPanel）の開閉状態 |
| `ThinktankPanel.ViewMode` | `ThinktankPanel` | `string` (filter / chat / settings) | `filter` | 左パネルの表示モード |
| `OverviewPanel.IsAreaOpen` | `OverviewPanel` | `boolean` (true / false) | `false` | 中央左パネル（OverviewPanel）の開閉状態 |
| `OverviewPanel.ViewMode` | `OverviewPanel` | `string` (datagrid / graph / chat / settings) | `datagrid` | 中央左パネルの表示モード |
| `WorkoutPanel.IsAreaOpen` | `WorkoutPanel` | `boolean` (true / false) | `true` | 中央右パネル（WorkoutPanel）の開閉状態 |
| `WorkoutPanel.ViewMode` | `WorkoutPanel` | `string` (workout / texteditor / markdown / datagrid / card / graph) | `workout` | 中央右パネルの表示モード |
| `TextEditor.LineNumbers.IsVisible` | `WorkoutPanel` | `boolean` (true / false) | `false` | エディタでの行番号の表示・非表示 |
| `TextEditor.WordWrap.IsVisible` | `WorkoutPanel` | `boolean` (true / false) | `true` | エディタでの折り返し表示の有効・無効 |
| `TextEditor.Minimap.IsVisible` | `WorkoutPanel` | `boolean` (true / false) | `false` | エディタでのミニマップの表示・非表示 |
| `TextEditor.FullWidthSpace.IsVisible` | `WorkoutPanel` | `boolean` (true / false) | `false` | エディタでの全角スペース可視化の有効・無効 |
| `TextEditor.UnicodeHighlight.IsVisible` | `WorkoutPanel` | `boolean` (true / false) | `false` | エディタでのUnicode特殊文字強調の有効・無効 |
| `TextEditor.BracketPairColorization.IsVisible` | `WorkoutPanel` | `boolean` (true / false) | `true` | エディタでの対応する括弧ペアの色分け表示 |
| `TextEditor.Text.BgColor` | `WorkoutPanel` | `color` (HEXカラー) | `#f5f5f5` | エディタの背景色 |
| `TextEditor.Text.Color` | `WorkoutPanel` | `color` (HEXカラー) | `#1e1e1e` | エディタのフォント文字色 |
| `TextEditor.Selection.BgColor` | `WorkoutPanel` | `color` (HEXカラー) | `#c6e6c6ff` | エディタのテキスト選択範囲の背景色 |
| `TextEditor.Occurrence.BgColor` | `WorkoutPanel` | `color` (HEXカラー) | `#aac6aaff` | エディタで選択した語と同一の単語の強調色 |
| `TextEditor.Style.Section` | `WorkoutPanel` | `string` (Preset1〜5) | `Preset1` | セクション（見出し）の表示装飾スタイルの選択 |
| `WorkoutPanel.Style.Highlight` | `WorkoutPanel` | `string` (Preset1〜5) | `Preset1` | ハイライトキーワードの表示装飾スタイルの選択 |
| `WorkoutPanel.ToolBarMode` | `WorkoutPanel` | `string` (Status / Highlighter / KeyAction / Command / Translate / Reminder / Copyright) | `Copyright` | ワークアウトパネル下部ツールバーの表示コンテンツ切り替え |
| `WorkoutPanel.Highlight.KeyWord` | `WorkoutPanel` | `string` (正規表現対応) | `(空)` | エディタ内で強調表示する追加キーワード |
| `Application.FocusedColumn` | `Application` | `string` (Thinktank / Overview / WorkoutSetting / ReThink) | `Thinktank` | 現在キーボード入力フォーカスがある対象パネル |
| `ReThinkPanel.IsAreaOpen` | `ReThinkPanel` | `boolean` (true / false) | `true` | 右パネル（ReThinkPanel）の開閉状態 |
| `ReThinkPanel.ViewMode` | `ReThinkPanel` | `string` (chat / settings) | `chat` | 右パネルの表示モード |

---

## 付録 2. Action名とその機能の説明

アプリケーション内で実行可能な登録済みアクション（`TTActions`）の一覧です。

| アクションID (ActionID) | 分類 | アクションの機能と説明 |
| :--- | :--- | :--- |
| `FocusedPanel.ToggleAreaVisibility` | パネル制御 | 現在フォーカスのあるパネルを開閉（表示/非表示をトグル）します。 |
| `FocusedPanel.SetViewModePrev` | パネル制御 | 現在フォーカスのあるパネルの表示モード（ViewMode）を1つ前に戻します。 |
| `FocusedPanel.SetViewModeNext` | パネル制御 | 現在フォーカスのあるパネルの表示モード（ViewMode）を1つ次に進めます。 |
| `TextEditor.Folding.ForwardVisible` | エディタ移動 | エディタ内で、現在表示（展開）されている見出し行を上方向に検索し、見つかった行へカーソルを移動します。 |
| `TextEditor.Folding.BackwardVisible` | エディタ移動 | エディタ内で、現在表示（展開）されている見出し行を下方向に検索し、見つかった行へカーソルを移動します。 |
| `TextEditor.Folding.OpenEachLevel` | エディタ折畳 | カーソルが配置されている見出し（Foldingスコープ）を段階的に展開します。 |
| `TextEditor.Folding.CloseEachLevel` | エディタ折畳 | カーソルが配置されている見出し（Foldingスコープ）を段階的に折りたたみます。 |

---

## 付録 3. キーバインディング表

アプリケーション起動時にデフォルトで適用されるキーバインディングの一覧です。これらの定義は `__tt_shortcuts__`（Keyboard Shortcuts）テーブルを編集することで、ユーザーが独自に上書きまたは新規追加することが可能です。

| フォーカス範囲 (`focus`) | モード制限 (`exmode`) | ショートカットキー (`key`) | 実行アクション (`action`) | アクション内容の説明 |
| :--- | :--- | :--- | :--- | :--- |
| `*` (全体) | (なし) | `ctrl+shift+z` | `ui:undo` | UI設定（フォント色や開閉状態等）の変更履歴を1つ戻します。 |
| `*` (全体) | (なし) | `ctrl+shift+y` | `ui:redo` | UI設定（フォント色や開閉状態等）の変更履歴を1つ進めます（やり直し）。 |
| `*` (全体) | (なし) | `ctrl+shift+l` | `TextEditor.LineNumbers.IsVisible:toggle` | テキストエディタの行番号表示のトグル切り替え。 |
| `*` (全体) | (なし) | `ctrl+shift+w` | `TextEditor.WordWrap.IsVisible:toggle` | テキストエディタの右端折り返し表示のトグル切り替え。 |
| `*` (全体) | (なし) | `ctrl+shift+m` | `TextEditor.Minimap.IsVisible:toggle` | テキストエディタのミニマップ表示のトグル切り替え。 |
| `*` (全体) | `ExPanel` | `o` | `FocusedPanel.ToggleAreaVisibility` | フォーカスしているパネルの開閉状態をトグル切り替え。 |
| `*` (全体) | `ExPanel` | `p` | `FocusedPanel.SetViewModePrev` | フォーカスしているパネルの表示モードを1つ前に戻します。 |
| `*` (全体) | `ExPanel` | `n` | `FocusedPanel.SetViewModeNext` | フォーカスしているパネルの表示モードを1つ次に進めます。 |
| `*TextEditor` | (なし) | `alt+arrowup` | `TextEditor.Folding.ForwardVisible` | 現在エディタで表示されている見出し行を上方向に探索して移動。 |
| `*TextEditor` | (なし) | `alt+arrowdown` | `TextEditor.Folding.BackwardVisible` | 現在エディタで表示されている見出し行を下方向に探索して移動。 |
| `*TextEditor` | (なし) | `alt+arrowright` | `TextEditor.Folding.OpenEachLevel` | カーソル位置の見出し階層を段階的に展開します。 |
| `*TextEditor` | (なし) | `alt+arrowleft` | `TextEditor.Folding.CloseEachLevel` | カーソル位置の見出し階層を段階的に折りたたみます。 |

> [!NOTE]
> **アクションの指定形式について**
> キーバインディング設定 (`action` 列) には以下の書式を使用できます。
> - **ActionIDのみ**: 登録された JavaScript アクションを実行します（例: `FocusedPanel.ToggleAreaVisibility`）。
> - **`{Status名}:{設定値}`**: UI状態変数の値を直接変更します（例: `TextEditor.LineNumbers.IsVisible:toggle` で表示/非表示を反転）。
> - **`ui:undo` / `ui:redo`**: UI状態設定の履歴を取り消し、またはやり直します。
> - **`ExMode:{モード名}`**: 特定の一時キーモディファイア（ExMode）をアクティブにします。
