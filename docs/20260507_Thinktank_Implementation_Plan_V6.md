# Thinktank 実装プラン V6

**作成日**: 2026-05-07
**対象バージョン**: v4.0.0（ThinktankWebCC）
**前バージョンからの主な変更点**: WPF/WebView2 → Electron 移行、ReThinkPanel（旧ToDoPanel）整備、セマンティック検索（Gemini埋め込み）実装、Google Drive連携追加

---

## 1. このアプリは何をするものか

**Thinktank**は、日々の思考・記録・AIとの対話を一か所に集め、必要なときに素早く呼び出し、AIと一緒に深く考えるための**個人用ナレッジ管理・思考支援アプリ**です。

### 3つの核心機能

| 機能 | 説明 | 例 |
|------|------|-----|
| **記憶支援** | 「あの日何をした？」「あの件どうなった？」を助ける | 3か月前のメモを日付・キーワードで即座に検索 |
| **思考支援** | AIが視点・材料を提示し、考えを整理する | 「このアイデア、どう展開すべきか？」をClaudeに相談 |
| **発見支援** | 意味が近いデータをAIが自動で関連付ける | キーワードが違っても内容が近いメモを自動サジェスト |

### ターゲットユーザー

特定の職業に限らず、「考えること」「記録すること」「AIと協働すること」を日常とするすべての人。

---

## 2. 2つの使い方（起動モード）

Thinktankは同じアプリを **2つの形態**で利用できます。

```
┌─────────────────────────────────────────────────────────────┐
│  Localアプリモード（Electron）                               │
│  ─────────────────────────────────────────────────────────  │
│  PCにインストールしたデスクトップアプリとして動作             │
│  データはPCのローカルフォルダ（JSON形式）に保存              │
│  オフラインでも使用可能                                      │
│  インターネット接続時は自動的にクラウドと同期                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  PWA（Web）モード                                            │
│  ─────────────────────────────────────────────────────────  │
│  Webブラウザで開くアプリとして動作                           │
│  データはGoogle BigQuery（クラウドDB）に直接保存              │
│  常にインターネット接続が必要                                 │
│  どのPCからでも同じデータにアクセス可能                      │
└─────────────────────────────────────────────────────────────┘
```

### モードの比較

| 項目 | Localアプリ（Electron） | PWA（Web） |
|------|------------------------|-----------|
| 起動方法 | アプリアイコンをダブルクリック | ブラウザでURLを開く |
| データ保存先 | PC内（`%AppData%/thinktank/vault/`） | Google BigQuery（クラウド） |
| オフライン使用 | ○ 使用可能 | × 不可 |
| データ同期 | 自動（起動時・変更時） | 常にリアルタイム |
| AI機能（チャット・検索） | ○（要インターネット） | ○ |
| インストール | 必要（Electronアプリ） | 不要 |

---

## 3. システム全体像

```
【Localアプリモード（Electron）】
┌──────────────────────────────────────────────────┐
│  Electronデスクトップアプリ                       │
│  ┌────────────────────────────────────────────┐  │
│  │  React SPA（Thinktank UI）                 │  │
│  │  ブラウザエンジン（Chromium）で表示          │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │ IPC通信（プロセス間通信）        │
│  ┌──────────────▼──────────────────────────────┐ │
│  │  Electronメインプロセス                      │ │
│  │  • JSONファイル読み書き（vault/フォルダ）      │ │
│  │  • サーバーとの同期管理                       │ │
│  └──────────────┬──────────────────────────────┘ │
└─────────────────┼────────────────────────────────┘
                  │ 同期（インターネット経由）
         ┌────────▼────────┐
         │  Expressサーバー │ ← AIチャット / 検索 / Drive
         │  （localhost or  │    は常にこちら経由
         │   Cloud Run）    │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │  Google BigQuery │
         │  thinktank.vault │
         └─────────────────┘

【PWAモード（ブラウザ）】
ブラウザ → React SPA → Expressサーバー → Google BigQuery
                     → Claude API（チャット）
                     → Gemini API（検索用埋め込み）
                     → Google Drive API（ファイル保存）
```

---

## 4. データの概念モデル

Thinktankのデータは以下の3層で管理されます。

```
TTVault（保管庫）
  └── TTThink群（Think = 個別データアイテム）
        ├── memo（テキストメモ）
        ├── thought（Thinkのコレクション）← 特別なThink
        ├── table（表データ）
        ├── links（URLリスト）
        ├── chat（AI対話記録）
        └── nettext（Webから取得したテキスト）
```

### 用語説明

| 用語 | クラス | 説明 |
|------|--------|------|
| **Think**（シンク） | `TTThink` | 1件のデータアイテム。メモ・表・チャット等。BigQueryの1レコードに対応 |
| **Thought**（ソート） | `TTThink`（type=`thought`） | 複数のThinkをまとめた「テーマ」。Thinkの集合体 |
| **Vault**（ボルト） | `TTVault` | 保管庫。全Thinkを保持するルートコンテナ |

---

## 5. コンテンツ種別（ContentType）一覧

| ContentType | 日本語名 | 説明 | 使用できる表示形式 |
|-------------|---------|------|-----------------|
| `memo` | テキストメモ | 自由記述のテキスト（Markdown対応）| テキストエディタ・Markdown表示 |
| `thought` | テーマ | ThinkのIDリスト or 検索条件を本文に持つ集合体 | テキストエディタ・Markdown・データグリッド |
| `table` | 表データ | 複数テーブルを含む独自形式データ | テキストエディタ・データグリッド・カード |
| `links` | リンク集 | URLやファイルパスのリスト | テキストエディタ・Markdown・カード |
| `chat` | AI対話記録 | AIとの会話の記録 | テキストエディタ・Markdown・チャット表示 |
| `nettext` | Web取得テキスト | Webページ等からダウンロードしたテキスト | テキストエディタ・Markdown |

---

## 6. UIレイアウト（4パネル構成）

画面は左から右へ4つのパネルが横並びに配置されます。

```
┌────────────────┬────────────────┬────────────────────────────────┬────────────────┐
│  Thinktank     │  Overview      │        Workout Panel           │  ReThink       │
│  Panel         │  Panel         │                                │  Panel         │
│  ──────────    │  ──────────    │  ┌──────────┬──────────────┐  │  ──────────    │
│  ↕ Ribbon      │  ↕ Ribbon      │  │ Area A   │   Area B     │  │  ↕ Ribbon      │
│                │                │  │ Ribbon A │   Ribbon B   │  │                │
│  データ一覧・   │  選択したThought│  │          ├──────────────┤  │  AIと相談・    │
│  検索・絞り込み │  の内容表示     │  │ コンテンツ│   Area C     │  │  思考深化      │
│                │                │  │ 表示エリア│   Ribbon C   │  │                │
│  [開閉ボタン]  │  [開閉ボタン]  │  └──────────┴──────────────┘  │  [開閉ボタン]  │
└────────────────┴────────────────┴────────────────────────────────┴────────────────┘
← 収納可能 →    ← 収納可能 →    ←── 自由に分割・リサイズ可能 ──→   ← 収納可能 →
```

### パネルのカラーテーマ

| パネル | テーマ | Ribbon背景色 | エリア背景色 |
|--------|--------|------------|------------|
| ThinktankPanel | ダークブルー | `#073763` | `#E8F1F8` |
| OverviewPanel | インディゴ | `#3949AB` | `#F9FAFF` |
| WorkoutPanel | グレー | `#3F3F3F` | `#D0D0D0` |
| ReThinkPanel | ダークグリーン | `#1E4620` | `#E2EFDA` |

---

## 7. 各パネルの機能詳細

### 7.1 ThinktankPanel（ダークブルー）

**役割**: データの検索・絞り込み・選択の起点

#### Ribbonアイコン（縦並び）

**上部（表示モード切り替え）**:

| アイコン | モード | 説明 |
|---------|--------|------|
| Sparkles（キラキラ）| `ai` | AI支援モード（AIとの会話でデータを絞り込む） |
| Filter（漏斗）| `filter` | フィルターモード（タイトル・日付・カテゴリで絞り込む）|
| Search（虫眼鏡）| `search` | 検索モード（BigQuery全文検索・セマンティック検索）|
| Brain（脳）| `thoughts` | Thoughtsモード（Thoughtデータのみ一覧表示、デフォルト）|

**下部（状態表示・設定）**:

| アイコン | 説明 |
|---------|------|
| 同期インジケーター | データの同期状態を5段階で表示 |
| Monitor/Globe | Localアプリ（Monitor）/ PWA（Globe）の起動モード表示 |
| Settings（歯車）| `settings` モード（保管庫設定画面）|

#### 表示エリア（モード別）

| モード | コンポーネント | 説明 |
|--------|--------------|------|
| `thoughts`（デフォルト）| ThoughtsList | Thoughtsを仮想スクロール一覧表示 |
| `filter` | ThinktankFilterView | タイトルテキスト・日付範囲・カテゴリで全データを絞り込み |
| `search` | ThinktankSearchView | キーワード全文検索（BigQuery）またはセマンティック検索（Gemini）|
| `ai` | ThinktankAiView | AI支援でデータを選定（将来実装）|
| `settings` | ThinktankSettingsView | 保管庫名設定・接続先表示 |

#### ThinktankFilterViewの機能

- **テキストフィルター**: タイトルをAND/OR/NOT条件で絞り込み
- **日付範囲フィルター**: 更新日の期間指定（例: 過去30日以内）
- **カテゴリフィルター**: ContentTypeで絞り込み（memo/thought/table等）
- **フィルター履歴**: 過去の絞り込み条件をプルダウンで呼び出せる
- **列ソート**: タイトル・更新日・カテゴリで昇順/降順ソート
- **統合フィルターパネル**: 複数の条件を組み合わせたフィルター管理

#### 同期インジケーターの状態

| 状態 | アイコン | 色 | 説明 |
|------|---------|-----|------|
| `synced` | チェックマーク | グレー | すべてのデータが同期済み |
| `syncing` | 回転矢印 | ブルー | 同期中 |
| `pending` | 点（件数付き）| オレンジ | 未送信データあり |
| `offline` | ×マーク | グレー | インターネット未接続 |
| `error` | ⚠ | レッド | 同期エラー発生 |

---

### 7.2 OverviewPanel（インディゴ）

**役割**: 選択したThought（Thinkのコレクション）の全体表示・分析

- ThinktankPanelでThoughtを選択すると、その内容を表示
- 表示形式切り替え: Markdown / データグリッド / グラフ
- OverviewAreaは収納ボタンで非表示にできる（Workout画面を広く使いたいとき）

---

### 7.3 WorkoutPanel（グレー）

**役割**: Think/Thoughtデータを自由に並べて閲覧・編集する主作業エリア

#### 分割レイアウト（BSPツリー方式）

- パネルを縦または横に**自由に何分割でも**分割できる
- 各エリアは独立したデータを表示・編集可能
- 分割比率はドラッグで自由に変更
- エリアを閉じると残りのエリアが自動的に広がる

#### 操作方法

| 操作 | 説明 |
|------|------|
| 「右に追加」ボタン | フォーカス中のエリアを縦分割して右側に新エリアを追加 |
| 「下に追加」ボタン | フォーカス中のエリアを横分割して下側に新エリアを追加 |
| Ribbonをクリック | そのエリアをフォーカス（Ribbonが青くなる）|
| タイトルをドラッグ＆ドロップ | 別のエリアへコンテンツを移動 |
| Splitterをドラッグ | エリアのサイズを変更 |

#### 表示形式（MediaType）一覧

| アイコン | 形式 | 説明 | 主な用途 |
|---------|------|------|---------|
| FileText | `texteditor` | Monaco Editorによる高機能テキスト編集 | データの直接編集 |
| Eye | `markdown` | Markdownを整形表示 | 読みやすく閲覧 |
| Table | `datagrid` | スプレッドシート風の表形式 | データ一覧・集計 |
| LayoutGrid | `card` | カード形式の一覧表示 | 概要の俯瞰 |
| Share2 | `graph` | ノード関係グラフ | データ間のつながりを可視化 |
| MessageCircle | `chat` | AIチャットインターフェース | AIと対話しながら思考 |

---

### 7.4 ReThinkPanel（ダークグリーン）

**役割**: 選択中のThought/ThinkについてAI（Claude）と対話しながら思考を深める

- 現在フォーカス中のデータのコンテキストを自動的にAIに渡す
- SSE（サーバー送信イベント）によるリアルタイムストリーミング応答
- 会話履歴を維持（セッション中）
- Claudeとの対話を通じて: 要約・分析・次のアクション検討・関連アイデア発見 等

---

## 8. デザイン仕様

### 8.1 カラーテーマ一覧（選択可能な14種類）

| テーマ名 | style-name | メインカラー（濃）| 背景カラー（淡）|
|---------|-----------|----------------|---------------|
| グレー | `gray` | `#3F3F3F` | `#D0D0D0` |
| ライトグレー | `light-gray` | `#808080` | `#F2F2F2` |
| イエロー | `yellow` | `#FBC02D` | `#FFFDE7` |
| インディゴ（ダーク） | `indigo-dark` | `#3949AB` | `#F9FAFF` |
| インディゴ（ライト） | `indigo-light` | `#5C6BC0` | `#FAFBFF` |
| パープル | `purple` | `#9575CD` | `#F8F2FF` |
| ローズ | `rose` | `#994D4D` | `#FFF5F5` |
| オレンジ | `orange` | `#E67E22` | `#FFFCF5` |
| ダークグリーン | `green-dark` | `#1E4620` | `#E2EFDA` |
| セージグリーン | `green-sage` | `#4B6A4C` | `#F2F8F0` |
| ダークブルー | `blue-dark` | `#073763` | `#E8F1F8` |
| ライトブルー | `blue-light` | `#3D85C6` | `#F4F8FB` |
| ダークオレンジ | `orange-dark` | `#CC5200` | `#FFF2E6` |
| ライトオレンジ | `orange-light` | `#FF9933` | `#FFFAF5` |

詳細な色コードは `docs/TT_Color.txt` を参照。ビジュアルサンプルは `docs/TT.pptx` の Slide #5〜#18 を参照。

### 8.2 デザイン原則

- 線で区切らず、**背景色の差・丸角ボックス**で領域を分ける（分かりやすく、すっきりした見た目）
- フォント: Inter / ヒラギノ角ゴシック ProN / システムUI、13px
- アイコン: lucide-react（一貫性のある線画アイコン）
- 各パネルを異なるカラーテーマで視覚的に区別する
- **ツールチップの配置**: 縦リボン上のボタンのツールチップは、パネル境界での隠れを防ぐため、アイコンの横側（右側リボンなら左、左側リボンなら右）に表示する

---

## 9. データモデルとストレージ仕様

### 9.1 BigQueryテーブル構成

**thinktank.vault**（メインデータ）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `file_id` | STRING | データID（例: `2026-05-07-103000`）|
| `title` | STRING | タイトル（本文の1行目）|
| `category` | STRING | ContentType（memo/thought/table/links/chat/nettext）|
| `content` | STRING | 本文 |
| `keywords` | STRING | キーワード |
| `related_ids` | STRING | 関連データIDのリスト |
| `size_bytes` | INT64 | データサイズ（バイト）|
| `is_deleted` | BOOL | 削除フラグ（論理削除）|
| `created_at` | TIMESTAMP | 作成日時 |
| `updated_at` | TIMESTAMP | 更新日時 |

**thinktank.tt_embeddings**（セマンティック検索用ベクトルデータ）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `entry_id` | STRING | 対応するvault.file_id |
| `embedding` | FLOAT64[] | 3072次元の意味ベクトル（Gemini生成）|
| `model_name` | STRING | 使用した埋め込みモデル名 |
| `created_at` | TIMESTAMP | 生成日時 |

### 9.2 Localアプリのデータ保存場所

```
Windows: C:\Users\{ユーザー名}\AppData\Roaming\thinktank\vault\
  └── {file_id}.json    例: 2026-05-07-103000.json
```

各ファイルはJSON形式で、以下のフィールドを持ちます：

```json
{
  "id": "2026-05-07-103000",
  "contentType": "memo",
  "title": "メモのタイトル",
  "content": "本文の内容",
  "keywords": "キーワード1, キーワード2",
  "relatedIds": [],
  "createdAt": "2026-05-07T10:30:00.000Z",
  "updatedAt": "2026-05-07T10:30:00.000Z"
}
```

### 9.3 データファイルのフォーマット（保存・表示形式）

**memo / nettext**（自由テキスト）

```
タイトル（1行目）
（以降は自由なMarkdownテキスト）
```

**thought**（Thinkの集合体）

```
タイトル（1行目）
> フィルター条件式（省略可）
* ThinkのID（1件1行、省略可）
（その他自由記載）
```

**table**（表データ）

```
タイトル（1行目）
> 列1,列2,列3  ← > が行頭のCSV、最初の1行のみ列定義として有効
値A,値B,値C    ← CSVデータ行（複数行記載可）
値D,値E,値F
# コメント行    ← # が行頭の行はコメント。データとして扱わないが保存時も残す
; コメント行    ← ; が行頭の行もコメント。同上  
```

**table データの保存ルール**:

- filter/sort で表示順を変えてもファイルのデータ行位置は変更しない（コメント行が挟まれるため）
- カラム位置（並び順）を変更して保存すると、各データ行の列順をファイル上で更新する
- カラム幅（リサイズ）は表示上の設定であり、ファイルには保存されない（現在の表示中のみ有効）
- 新規追加行はファイル末尾に追記する
- `#` / `;` はtableデータとしてはコメント行（非データ行）だが、TextEditorでは `#` = Section行、`;` = コメント行 として扱われる

**links**（URLリスト）

```
タイトル（1行目）
* https://example.com
* /path/to/local/file
（その他自由記載）
```

**chat**（AI対話記録）

```
タイトル（1行目）
## ユーザーの発言
AIの応答
## ユーザーの発言
...
```

### 9.4 データIDの形式

```
yyyy-MM-dd-hhmmss
例: 2026-05-07-103000
```

同じ秒に複数のデータが作成された場合、1秒ずつ遡って空いているIDを自動割り当て。

---

## 10. AI機能の詳細

### 10.1 Claude（Anthropic）— 会話・思考支援

**使用場所**: ReThinkPanel、WorkoutPanelのChatMediaビュー

**動作の仕組み**:

1. ユーザーがメッセージを送信
2. 現在選択中のThought/Thinkデータをシステムプロンプトとしてコンテキストに含める
3. Claude APIにリクエスト
4. 応答をSSE（サーバー送信イベント）でリアルタイムにストリーミング表示

**使用モデル**: `claude-sonnet-4-6`
**環境変数**: `ANTHROPIC_API_KEY`

### 10.2 Gemini（Google）— セマンティック検索・意味検索

**使用場所**: ThinktankPanelのSearchモード

**動作の仕組み**:

1. データを保存するとき、Gemini APIがデータの「意味ベクトル」（3072次元の数値列）を生成
2. ベクトルはBigQueryの `tt_embeddings` テーブルに保存
3. 検索するとき、検索語の意味ベクトルを生成
4. BigQueryで全データとのコサイン類似度を計算し、意味的に近いデータを返す

**特徴**: キーワードが一致しなくても意味が近いデータを発見できる（例: 「自動車」で検索して「車」「クルマ」のメモもヒット）

**使用モデル**: `gemini-embedding-001`（3072次元）
**環境変数**: `GEMINI_API_KEY`

### 10.3 Embedding（埋め込み）生成のレート制限

Gemini APIのレート制限（約85リクエスト/分）に対応するため：

- 1リクエストあたり700msの間隔を確保
- バッチ処理（全データの一括埋め込み生成）はSSEで進捗をリアルタイム表示

---

## 11. 利用しているGoogle/外部サービス一覧

### Google Cloud / Google APIs

| サービス | 用途 | 認証方式 |
|---------|------|---------|
| **Google BigQuery** | メインデータベース。VaultデータとEmbeddingデータを保存・検索 | サービスアカウント |
| **Gemini API（Generative Language API）**| テキストの意味ベクトル生成（セマンティック検索）| APIキー |
| **Google Drive API** | データをGoogleドライブにアップロード。Thinktank/{日付}フォルダに保存 | サービスアカウント |
| **Google Calendar API** | カレンダー連携（将来実装向けに接続済み）| サービスアカウント |
| **Vertex AI** | Gemini APIの代替フォールバック（エラー時に自動切り替え）| サービスアカウント |

### サービスアカウント認証ファイル

```
ThinktankWebCC/thinktankweb-483408-9548b5a08345.json
```

このJSONファイルにGoogleサービスへのアクセス権限が含まれています。**公開リポジトリには絶対にアップロードしないこと。**

### Anthropic（外部AI）

| サービス | 用途 | 認証 |
|---------|------|------|
| **Claude API** | AIチャット・思考支援 | APIキー（`ANTHROPIC_API_KEY`）|

---

## 12. ディレクトリ構成

```
ThinktankWebCC/                      ← メインリポジトリ（React SPA + Expressサーバー）
├── src/                             ← Reactフロントエンド（TypeScript）
│   ├── models/                      ← データモデル（TTObject/TTCollection/TTThink/TTVault）
│   ├── views/                       ← ビューモデル（TTApplication/各パネルView）
│   ├── components/
│   │   ├── Layout/                  ← AppLayout, PanelRibbon, PanelArea, Splitter
│   │   ├── ThinktankPanel/          ← 検索・フィルター・Thoughts一覧
│   │   ├── OverviewPanel/           ← Thought全体表示
│   │   ├── WorkoutPanel/            ← BSPツリー分割エディタ
│   │   │   └── media/               ← TextEditor/Markdown/DataGrid/Card/Graph/Chat
│   │   └── ReThinkPanel/            ← AIチャットパネル
│   ├── services/
│   │   ├── ChatApiService.ts        ← Claudeチャット（SSEクライアント）
│   │   ├── EmbeddingApiService.ts   ← Geminiセマンティック検索クライアント
│   │   └── storage/                 ← ストレージ抽象化レイヤー
│   │       ├── IStorageBackend.ts   ← ストレージインターフェース定義
│   │       ├── StorageManager.ts    ← モード判定・バックエンド選択
│   │       ├── ElectronStorageBackend.ts  ← Electron IPC経由のローカル保存
│   │       ├── BigQueryStorageBackend.ts  ← Express API経由のBigQuery保存
│   │       └── LocalStorageBackend.ts     ← C# API経由（レガシー互換）
│   ├── hooks/
│   │   └── useAppUpdate.ts          ← TTObjectの変更通知 → Reactの再描画
│   ├── contexts/
│   │   └── HighlightContext.tsx     ← パネル間の選択状態共有
│   └── types/
│       └── index.ts                 ← 共通型定義
├── server/                          ← Expressバックエンド（Node.js/TypeScript）
│   ├── index.ts                     ← メインサーバー（ポート8080）
│   ├── routes/                      ← APIルート定義
│   │   ├── bigqueryRoutes.ts        ← データCRUD (/api/bq/)
│   │   ├── chatRoutes.ts            ← AIチャット (/api/chat/)
│   │   ├── embeddingRoutes.ts       ← セマンティック検索 (/api/embeddings/)
│   │   └── driveRoutes.ts           ← Driveアップロード (/api/drive/)
│   └── services/                    ← バックエンドサービス
│       ├── BigQueryService.ts       ← BigQuery CRUD操作
│       ├── ChatService.ts           ← Claude API連携
│       ├── EmbeddingService.ts      ← Gemini API連携（埋め込み生成）
│       ├── EmbeddingPipeline.ts     ← バッチ埋め込み生成パイプライン
│       ├── VectorStoreService.ts    ← BigQueryベクトル検索
│       └── DriveService.ts          ← Google Drive操作
├── electron/                        ← Electronデスクトップアプリ
│   ├── main.cjs                     ← Electronメインプロセス（IPC・ファイル操作）
│   └── preload.cjs                  ← セキュリティブリッジ（electronAPI公開）
├── docs/                            ← 設計ドキュメント
├── public/                          ← 静的ファイル（アイコン・マニフェスト等）
├── package.json                     ← 依存パッケージ定義
└── vite.config.ts                   ← Viteビルド設定
```

---

## 13. 起動方法

### 13.1 開発時の起動方法

#### Localアプリ（Electron）として起動

```powershell
# ターミナルで以下を実行（ThinktankWebCCディレクトリで）
npm run electron:dev
```

このコマンドで以下が同時に起動します：

- Viteデブサーバー（ポート5173、React UI）
- Expressサーバー（ポート8080、BigQuery/AI API）
- Electronアプリ（デスクトップウィンドウ）

起動後はデスクトップにThinktankウィンドウが表示されます。

#### PWA（ブラウザ）として起動

```powershell
# ターミナルウィンドウ1
npm run dev:vite        # Vite開発サーバー（ポート5173）

# ターミナルウィンドウ2
npm run server:dev      # Expressサーバー（ポート8080）

# ブラウザで開く
# http://localhost:5173
```

#### 各サーバーの役割

| ポート | プロセス | 役割 |
|-------|---------|------|
| 5173 | Vite（Node.js） | React UIの配信 |
| 8080 | Express（Node.js） | BigQuery CRUD・AIチャット・検索・Drive API |

### 13.2 本番デプロイ時の構成

```
Electronアプリ配布:  npm run electron:build → インストーラー生成
PWA（クラウド配信）: npm run build → dist/ を Cloud Run / Firebase Hosting 等にデプロイ
Expressサーバー:     dist-server/ を Cloud Run にデプロイ
```

### 13.3 モードの自動判定

アプリがどちらのモードで起動しているかは、`StorageManager` が自動的に判定します：

```typescript
// Electronが起動するとwindow.electronAPIが利用可能になる
// 利用可能な場合 → ElectronStorageBackend（ローカルJSON）
// 利用不可の場合 → BigQueryStorageBackend（クラウドBigQuery）
```

---

## 14. 実装フェーズ

以下の順序で実装を進めます。**Phase 1〜15 は実装済み**です。

---

### ✅ Phase 1: データモデル基盤

**目的**: アプリのデータを管理する根幹クラスを実装する。

- `TTObject` — データの変更を通知するベースクラス（Observer パターン）
- `TTCollection<T>` — TTObject のコレクション（追加・削除・検索）
- `TTThink` — 個別データアイテム（ID・ContentType・タイトル・本文・キーワード等）
- `TTVault` — 全TTThinkを保持する保管庫（TTCollection の派生クラス）
- `TTModels` — アプリ全体のデータルート（シングルトン）

**検証ポイント**: TTVault にThinkを追加・取得・削除できる。`GetThoughts()` がContentType=`thought`のみ返す。

---

### ✅ Phase 2: ビューモデル（4パネル構成）

**目的**: UIの状態を管理するビューモデルクラスを実装する。

- `TTWorkoutArea` — 1つのWorkoutエリアの状態（表示中データID・メディア形式・タイトル）
- `TTWorkoutPanel` — WorkoutPanel全体の管理（BSPツリー・フォーカス・エリア追加削除・コンテンツ入れ替え）
- `TTThinktankPanel` — ThinktankPanelの状態（表示モード・フィルター・選択中Thought）
- `TTOverviewPanel` — OverviewPanelの状態（表示中Thought・メディア形式）
- `TTReThinkPanel` — ReThinkPanelの状態（連携中Thought・チャット履歴）
- `TTApplication` — アプリ全体の統括クラス（全パネルを管理）

**検証ポイント**: 各パネルの開閉・選択・WorkoutAreaの追加削除がビューモデルレベルで動作する。

---

### ✅ Phase 3: アプリレイアウトシェル

**目的**: 4パネルのUIの骨格（CSS・Reactコンポーネント）を構築する。

- `AppLayout` — 4パネルグリッドレイアウト（CSS Grid、100vhフルスクリーン）
- `PanelRibbon` — 各パネルの縦アイコンバー（共通コンポーネント）
- `PanelArea` — 開閉アニメーション付きエリアコンテナ
- `Splitter` — パネル間のドラッグリサイズセパレーター

**検証ポイント**: 4パネルが正しい位置に配置される。各パネルの開閉ボタンでエリアが滑らかにアニメーションする。

---

### ✅ Phase 4: ThinktankPanel — 基本実装

**目的**: Thoughtsの一覧表示と基本的な操作を実装する。

- `ThinktankPanel` / `ThinktankRibbon` / `ThinktankArea` — パネル骨格
- `ThoughtsList` — Thoughtsを仮想スクロール（@tanstack/react-virtual）で高速一覧表示
- `ThoughtsFilter` — テキストフィルター（AND/OR/NOT構文対応）
- Ribbon上部4ボタン: AI / Filter / Search / Thoughts
- Ribbon下部3ボタン: 同期インジケーター / 起動モード / 設定
- `ThinktankSettingsView` — 保管庫名設定画面（localStorage保存）

**一覧行の表示形式**: `[アイコン] タイトル [更新日]`、行高さ36px

**検証ポイント**: Thoughts一覧が表示される。フィルターで絞り込みできる。クリックでOverviewPanelが更新される。

---

### ✅ Phase 5: WorkoutPanel — BSPツリーレイアウト

**目的**: 自由に分割できるマルチエリアレイアウトを実装する。

- `WorkoutPanel` — BSPツリー再帰レンダリングコンテナ
- `WorkoutArea` — 個別エリア（Ribbon + コンテンツ）
- `WorkoutAreaRibbon` — メディア切り替え・ドラッグハンドル・フォーカス表示
- `WorkoutPanelRibbon` — 「右に追加」「下に追加」ボタン
- `WorkoutHSplitter` — 横分割スプリッター（ポインターキャプチャ方式）
- `WorkoutAreaEmpty` — エリアなし時の空表示

**BSPツリーの内部構造**:

```
type LayoutNode = 
  | { type: 'leaf'; areaId: string }           ← 単一エリア
  | { type: 'split'; direction: 'v'|'h';       ← 縦/横分割
      first: LayoutNode; second: LayoutNode }
```

**検証ポイント**: 縦分割・横分割・エリア削除・ドラッグ移動・スプリッターリサイズがすべて動作する。

---

### ✅ Phase 6: 表示メディア（6種類）

**目的**: WorkoutAreaで使用する各種表示形式を実装する。

- `TextEditorMedia` — Monaco Editor（高機能コードエディタ）。Ctrl+S保存、未保存時に`●`表示
- `MarkdownMedia` — Markdown整形表示（marked + highlight.js）。見出しに色付き
- `DataGridMedia` — 仮想スクロール付きデータグリッド。列フィルター対応
- `CardMedia` — 2列グリッドのカード表示（タイトル・抜粋・アイコン）
- `GraphMedia` — react-force-graphによる関係グラフ（RelatedIDsをエッジとして描画）
- `ChatMedia` — AIチャットUI（右：ユーザー、左：AI応答Markdown、下部固定入力欄）

**Markdown見出しの色規則**:

| 見出し | 色 |
|--------|-----|
| `# H1` | ゴールド（`--text-highlight`）|
| `## H2` | ブルー（`--text-accent`）|
| `### H3` | グリーン（`--text-success`）|

**検証ポイント**: 全6種類のメディアでThinkデータが正しく表示される。WorkoutAreaRibbonで切り替えできる。

---

### ✅ Phase 7: OverviewPanel

**目的**: 選択したThoughtをOverviewPanelで表示・分析する。

- `OverviewPanel` / `OverviewRibbon` / `OverviewArea` / `OverviewMenuRibbon`
- ThinktankPanelでThoughtを選択 → OverviewPanelに内容を表示
- 表示形式切り替え: Markdown / データグリッド / グラフ

**検証ポイント**: Thoughtを選択するとOverviewAreaに内容が表示される。表示形式が切り替わる。

---

### ✅ Phase 8: ReThinkPanel（AIチャット）

**目的**: 現在のコンテキストをAIに渡してリアルタイム対話するパネルを実装する。

- `ReThinkPanel` / `ReThinkRibbon` / `ReThinkArea` / `ReThinkMenuRibbon`
- `ReThinkChat` — ChatMediaを転用したAIチャットUI
- 現在フォーカス中のThought/Thinkデータをシステムプロンプトとして自動注入
- SSEストリーミングでClaudeの応答をリアルタイム表示

**検証ポイント**: メッセージを送信するとSSEでAI応答が返る。コンテキストが正しく渡される。

---

### ✅ Phase 9: Electronアプリシェル

**目的**: ReactアプリをElectronデスクトップアプリとして動作させる。

- `electron/main.cjs` — メインプロセス（BrowserWindow生成・IPC・ファイル操作）
- `electron/preload.cjs` — セキュリティブリッジ（`window.electronAPI` を安全に公開）

**IPC（プロセス間通信）ハンドラー**:

| コマンド | 動作 |
|---------|------|
| `storage:listMeta` | vault/フォルダの全JSONをメタデータのみで一覧取得 |
| `storage:getContent` | 指定IDのJSONから本文を取得 |
| `storage:save` | JSONファイルとして保存（作成・更新）|
| `storage:delete` | 指定IDのJSONを削除フラグ付きで更新 |
| `storage:search` | タイトル・本文のキーワード検索 |
| `storage:syncFromServer` | Expressサーバー経由でBigQueryから差分をローカルに取り込む |

**データ保存先**: `%AppData%/thinktank/vault/{file_id}.json`

**検証ポイント**: Electronウィンドウが起動してReact UIが表示される。ローカルJSON読み書きが動作する。

---

### ✅ Phase 10: ストレージ抽象化レイヤー

**目的**: Electron / PWA それぞれのモードに対応したストレージを透過的に切り替える。

- `IStorageBackend` — ストレージ操作の共通インターフェース定義
- `StorageManager` — `window.electronAPI` の有無でバックエンドを自動選択
- `ElectronStorageBackend` — Electron IPC経由でローカルJSONを操作
- `BigQueryStorageBackend` — Express `/api/bq/` 経由でBigQueryを操作
- `LocalStorageBackend` — C# API経由（レガシー互換）

**バックエンド選択ロジック**:

```
window.electronAPI が存在する → ElectronStorageBackend（ローカルJSON）
window.electronAPI が存在しない → BigQueryStorageBackend（クラウド）
```

**検証ポイント**: ElectronモードとPWAモードそれぞれでデータ読み書きが動作する。

---

### ✅ Phase 11: Expressバックエンド（BigQuery / Drive連携）

**目的**: クラウドデータと外部サービスへのバックエンドAPIを実装する。

- `server/index.ts` — Expressサーバー（ポート8080）
- `BigQueryService.ts` — MERGE文によるUpsert・自動リトライ付きCRUD
- `DriveService.ts` — Google Drive APIでファイルアップロード・フォルダ管理
- `bigqueryRoutes.ts` / `driveRoutes.ts` — 各APIエンドポイント

**BigQuery APIエンドポイント**:

| メソッド | パス | 機能 |
|---------|------|------|
| GET | `/api/bq/files/meta` | メタデータ一覧（本文除く）|
| GET | `/api/bq/files/:id/content` | 本文のみ取得 |
| GET | `/api/bq/files/search?q=` | 全文検索（最大200件）|
| POST | `/api/bq/files` | 保存（MERGE Upsert）|
| DELETE | `/api/bq/files/:id` | 論理削除 |

**Drive APIエンドポイント**:

| メソッド | パス | 機能 |
|---------|------|------|
| POST | `/api/drive/upload` | ファイルをDriveにアップロード |

Driveのフォルダ構成: `マイドライブ / Thinktank / {yyyy-MM-dd} / {ファイル名}`

**検証ポイント**: BigQuery CRUD・Drive アップロードが動作する。

---

### ✅ Phase 12: AIチャットAPI（Claude / SSEストリーミング）

**目的**: Claude APIを使ったリアルタイムストリーミングチャットAPIを実装する。

- `ChatService.ts` — @anthropic-ai/sdk を使ったSSEストリーミング
- `chatRoutes.ts` — `POST /api/chat/messages`
- `ChatApiService.ts`（フロントエンド）— SSEクライアント

**API仕様**:

```
POST /api/chat/messages
Request: { messages: ChatMessage[], systemPrompt?: string }
Response: SSEストリーム（text/event-stream）
  → data: { type: 'delta', content: 'トークン' }
  → data: { type: 'done' }
```

**環境変数**:

```
ANTHROPIC_API_KEY=sk-ant-...
```

**検証ポイント**: メッセージ送信後、レスポンスが1文字ずつリアルタイムで表示される。

---

### ✅ Phase 13: ThinktankPanel拡張（フィルター・検索強化）

**目的**: データ探索をより使いやすくする拡張機能を追加する。

- `ThinktankFilterView` — タイトル・日付範囲・カテゴリのフィルタリング
- `ThinktankSearchView` — BigQuery全文検索とセマンティック検索の切り替え
- `FilterHistoryPulldown` — 過去のフィルター条件を履歴から呼び出し
- `ColumnSortDialog` — 列名・更新日・カテゴリでの列ソート設定ダイアログ
- `UnifiedFilterPanel` — 複数条件を組み合わせた統合フィルターパネル
- `ThinktankMenuRibbon` — エリア上部の水平メニューバー（height: 30px）

各パネルに `MenuRibbon`（高さ30pxの水平リボン）を追加し、エリアの上部に機能ボタンを配置できるようにした。

**検証ポイント**: 日付範囲フィルター・フィルター履歴呼び出し・列ソートが動作する。

---

### ✅ Phase 14: セマンティック検索（Gemini埋め込み）

**目的**: キーワードに依存しない意味検索機能を実装する。

- `EmbeddingService.ts` — Gemini APIによる埋め込みベクトル生成
- `EmbeddingPipeline.ts` — バッチ埋め込み生成（SSEで進捗通知）
- `VectorStoreService.ts` — BigQuery `tt_embeddings` テーブルへのUpsert・コサイン類似度検索
- `embeddingRoutes.ts` — 埋め込み生成・セマンティック検索エンドポイント
- `EmbeddingApiService.ts`（フロントエンド）— セマンティック検索クライアント

**Embedding APIエンドポイント**:

| メソッド | パス | 機能 |
|---------|------|------|
| GET | `/api/embeddings/status` | 埋め込み済みデータ件数を取得 |
| POST | `/api/embeddings/generate` | 指定IDのデータの埋め込みを生成 |
| POST | `/api/embeddings/batch` | 全データの埋め込みを一括生成（SSE進捗）|
| GET | `/api/embeddings/search?q=` | セマンティック検索（類似度スコア付き）|

**ハイブリッド検索**: セマンティック検索とキーワード全文検索の結果を組み合わせて提供

**レート制限対応**: 700ms間隔・最大85 RPM・エラー時バッチレベルリカバリー

**環境変数**:

```
GEMINI_API_KEY=AIza...
```

**検証ポイント**: キーワードが違っても意味が近いデータが検索で見つかる。バッチ処理の進捗がリアルタイムで表示される。

---

## 15. 将来機能の提案

### 15.1 機能のAddon（プラグイン）化

現在は1つのアプリに全機能が統合されていますが、将来的に各機能を「Addon」として分離し、必要な機能だけ追加できるアーキテクチャへの移行を提案します。

**Addon化の基本構想**:

```
Core（必須）
  ├── データモデル（TTThink/TTVault）
  ├── ストレージレイヤー
  └── 4パネルUIシェル

Addons（選択式）
  ├── SemanticSearch    ← Gemini埋め込み・セマンティック検索
  ├── ClaudeChat        ← Claudeとのリアルタイムチャット
  ├── DriveSync         ← Google Driveとの同期
  ├── CalendarLink      ← Googleカレンダーとの連携
  ├── MailImport        ← メールからのデータ取り込み（将来）
  ├── WebClipper        ← WebページのClipping取り込み（将来）
  └── ExternalAI        ← OpenAI/Gemini等の外部AI切り替え（将来）
```

**メリット**:

- 使わない機能によるAPIキー漏洩リスクをゼロにできる
- 必要なAddonだけをインストールすることで起動を軽量化
- コミュニティ製Addonの受け入れが可能になる

---

### 15.2 ReThinkPanel の強化

| 機能 | 説明 |
|------|------|
| **Thoughtの自動サマリー生成** | 選択したThoughtを1クリックでAIが要約 |
| **会話履歴の保存** | AI対話をchat型のThinkとして自動保存 |
| **マルチモデル対応** | Claude以外にGemini / GPT-4を切り替えて使用 |
| **コンテキスト選択UI** | どのThinkをAIに見せるかUIで手動選択可能に |

---

### 15.3 データ取り込み強化

| 機能 | 説明 |
|------|------|
| **Webクリッパー** | URLを貼り付けるとWebページを自動取得してnettext型で保存 |
| **ドラッグ&ドロップ取り込み** | PCのファイル・テキストをドラッグしてThinkとして保存 |
| **メール取り込み** | Gmail等からメールをlinks/nettext型で取り込み |
| **カレンダー連携** | Googleカレンダーのイベントをthought型として同期 |

---

### 15.4 コラボレーション機能

| 機能 | 説明 |
|------|------|
| **Thought共有** | 特定のThoughtをURLで共有（読み取り専用）|
| **マルチユーザー保管庫** | 複数人で同じVaultにアクセス・編集 |
| **コメント機能** | Think単位でコメントを追加 |

---

### 15.5 Electron版の強化

| 機能 | 説明 |
|------|------|
| **グローバルホットキー** | OSの任意の場所でホットキーを押すとThinktankが前面に出る |
| **システムトレイ常駐** | 最小化するとタスクバーの通知エリアに収まる |
| **自動起動** | PC起動時にThinktankを自動起動 |
| **ローカルバックアップ** | Vault全体の自動バックアップ（日次・週次）|

---

### 15.6 AI検索のさらなる強化

| 機能 | 説明 |
|------|------|
| **インクリメンタルEmbedding** | 新規保存のたびに自動的に埋め込みを生成 |
| **類似アイテムのサジェスト** | Think閲覧中に意味的に近いThinkを自動サジェスト |
| **クラスタリング表示** | 意味的に似たThinkをグループ化してグラフ表示 |
| **日本語最適化モデル** | 日本語向けEmbeddingモデルへの切り替えオプション |

---

## 16. 環境変数まとめ

本番環境・開発環境で必要な環境変数の一覧です。

```bash
# Google Cloud / BigQuery
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}  # JSONの内容を文字列で

# Gemini API（セマンティック検索）
GEMINI_API_KEY=AIza...

# Anthropic Claude（AIチャット）
ANTHROPIC_API_KEY=sk-ant-...

# サーバー設定（省略時はデフォルト値を使用）
PORT=8080
NODE_ENV=production
```

> **セキュリティ注意**: `.env` ファイルや `thinktankweb-483408-9548b5a08345.json` は絶対にGitリポジトリにコミットしないこと。`.gitignore` で除外済みであることを確認すること。

---

## 17. 技術スタック早見表

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|----------|------|
| **UIフレームワーク** | React | 18.3.1 | フロントエンドUI全般 |
| **言語** | TypeScript | — | フロントエンド・バックエンド両方 |
| **ビルドツール** | Vite | — | 開発サーバー・本番ビルド |
| **デスクトップ** | Electron | — | デスクトップアプリ化 |
| **バックエンド** | Express | — | Node.js HTTPサーバー |
| **コードエディタ** | Monaco Editor | — | TextEditorMedia |
| **Markdown** | marked + highlight.js | — | MarkdownMedia |
| **仮想スクロール** | @tanstack/react-virtual | — | 大量データの高速一覧表示 |
| **グラフ** | react-force-graph | — | GraphMedia |
| **表計算** | xlsx | — | Excelファイル入出力 |
| **AI（チャット）** | @anthropic-ai/sdk | — | Claudeとの対話 |
| **AI（検索）** | Gemini API | — | 意味ベクトル生成 |
| **クラウドDB** | Google BigQuery | — | データ保存・検索 |
| **クラウドストレージ** | Google Drive API | — | ファイルアップロード |
| **アイコン** | lucide-react | — | UIアイコン全般 |
