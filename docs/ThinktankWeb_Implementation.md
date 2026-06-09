# Thinktank ファイルフォーマット仕様書 (2026-06-01)

本ドキュメントは、Thinktankにおける個別データアイテム（`TTThink`）がストレージに保存される際の各コンテンツ種別（`ContentType`）のテキスト表現フォーマットと、そのパース・シリアライズ仕様について説明します。

---

## 1. 概要
データは `yyyy-MM-dd-hhmmss.json` (Local) または Google BigQueryの `thinktank.vault` テーブル (PWA) に保存されます。本文（`content` / `fullContent`）は、`ContentType` ごとに決まったテキストフォーマットで表現されます。

---

## 2. 各フォーマット仕様

### 2.1 memo / nettext (自由テキスト形式)
*   **仕様**:
    1行目がタイトル（`Name`）になり、2行目以降は通常のMarkdownを含むテキストです。
*   **フォーマット**:
    ```markdown
    [タイトル行]
    （以降は自由なMarkdownテキスト）
    ```
*   **パース処理**:
    *   1行目を改行コードで分割し、行頭の `#` やスペースを取り除いてタイトルとします。
*   **実例**:
    ```markdown
    # 読書メモ：デザインパターン
    Observerパターンについて整理する。
    変更通知を購読者に通知するデザインパターン。
    ```

---

### 2.2 thought (テーマ・コレクション形式)
*   **仕様**:
    複数のThinkIDまたは検索・フィルター条件を保持し、関連するThinkを仮想的に集約・抽出するためのフォーマットです。
*   **フォーマット**:
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
*   **構成要素**:
    *   1行目 : コレクションタイトル（行頭の `> ` や `>> ` は除去して処理されます）
    *   `>` で始まる行 : フィルターパラメータ（Keyword、作成日、更新日）
    *   `>>` で始まる行 : 全文検索パラメータ（検索語、作成日、更新日）
    *   `*` で始まる行 : このThoughtに明示的に含める個別ThinkのIDリスト（1行につき1件）
*   **パース・シリアライズ処理**:
    *   [thinkFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/thinkFormat.ts) の `parseThought()` および `serializeThought()` が処理を一元管理しています。
*   **実例**:
    ```markdown
    3件：AI関連メモ
    > Keyword：LLM
    > 更新日：2026-06-01, -1w
    * 2026-05-30-120000
    * 2026-05-31-153000
    ```

---

### 2.3 chat (AI対話記録形式)
*   **仕様**:
    AIアシスタントとの会話ログをユーザーとAIで交互に配置して記録するフォーマットです。
*   **フォーマット**:
    ```markdown
    [タイトル行]
    ## [ユーザーの最初の質問]
    [AIの最初の回答]

    ## [ユーザーの次の質問]
    [AIの次の回答]
    ```
*   **構成要素**:
    *   `## ` で始まる行 : ユーザーの発言メッセージ
    *   それ以外の行 : AIの応答メッセージ（Markdown対応）
*   **パース・シリアライズ処理**:
    *   [thinkFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/thinkFormat.ts) の `parseChat()` および `serializeChat()` が処理を一元管理しています。
*   **実例**:
    ```markdown
    リファクタリングの相談
    ## リファクタリングの方針について教えて
    リファクタリングを行う際は、以下の手順を推奨します...

    ## ありがとう、試してみるよ
    どういたしまして。何かあればいつでも聞いてください。
    ```

---

### 2.4 links (リンク集形式)
*   **仕様**:
    外部URLやローカルファイルパスのリンクをまとめて管理するフォーマットです。
*   **フォーマット**:
    ```markdown
    [タイトル行]
    * [[リンクのラベル_1]]([URL_1])
    * [[リンクのラベル_2]]([URL_2])
    ```
*   **構成要素**:
    *   `* ` で始まる行 : `* [ラベル](URL)` のMarkdownリンク形式
*   **パース・シリアライズ処理**:
    *   [thinkFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/thinkFormat.ts) の `parseLinks()`, `serializeLinks()`, `appendLinkToContent()` が処理を一元管理しています。
*   **実例**:
    ```markdown
    参考URL集
    * [Google](https://google.com)
    * [GitHub](https://github.com)
    ```

---

### 2.5 table (表形式データ)
*   **仕様**:
    表データを表現する独自形式のフォーマットです。列幅などのメタ情報は保存せず、値データおよびユーザーが追加したコメントや空行の構造のみをそのまま永続化します。
*   **フォーマット**:
    ```markdown
    [タイトル行]
    > 列名1,列名2,列名3
    値A1,値A2,値A3
    # コメントやメモ（保存時も維持）
    ; もうひとつのコメント行
    値B1,値B2,値B3
    ```
*   **構成要素**:
    *   `>` で始まる最初の行 : 列定義ヘッダー（CSV形式）
    *   それ以降の通常行 : データ行（CSV形式）
    *   `#` または `;` で始まる行 : コメント行（データとしては除外されますが、ファイル構造として同じ位置に維持されます）
*   **パース・シリアライズ処理**:
    *   [tableFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/tableFormat.ts) の `parseTableContent()` および `tableSectionToContent()` が処理を担います。

---

## 3. システムThinkの運用フォーマット

### 3.1 UI状態管理 (`__tt_ui_state__`)
*   **ContentType**: `table`
*   **役割**: アプリのレイアウトやエディタカラーなどの各種設定値を永続化します。
*   **構造維持更新処理**:
    *   設定変更の保存時、ユーザーがエディタ（Monaco Editor）で追加したコメント行や空行、定義の並び順を崩さないようにするため、[tableFormat.ts](file:///c:/Users/gogow/Documents/ThinktankWebCC/src/utils/tableFormat.ts) の `updateTableContent()` を利用して `current` 列の値のみを動的に書き換えます。
*   **実例**:
    ```markdown
    UI Settings
    # current列を編集 → Ctrl+S 保存でUIに反映
    # Undo: Ctrl+Shift+Z  /  Redo: Ctrl+Shift+Y

    > key,current,default,type,candidates,description
    ThinktankPanel.IsAreaOpen,true,true,boolean,^(true|false)$,左パネル表示
    TextEditor.LineNumbers.IsVisible,false,false,boolean,^(true|false)$,行番号表示
    ...
    ```

### 3.2 キーバインディング管理 (`__tt_shortcuts__`)
*   **ContentType**: `table`
*   **役割**: キーボードショートカットやマウスショートカットの設定を保持します。
*   **実例**:
    ```markdown
    Keyboard Shortcuts
    # focus: フォーカス名（*=すべて）
    # exmode: ExMode名（空=ExModeなし）
    # key: 修飾キー+キー名
    # action: ActionID または 状態変数:設定値

    > focus,exmode,key,action,description
    *,,ctrl+shift+z,ui:undo,UI設定を元に戻す
    *,,ctrl+shift+y,ui:redo,UI設定をやり直す
    *,,alt+o,Application.Status.ExMode:ExOpt,オプションモード
    ```
