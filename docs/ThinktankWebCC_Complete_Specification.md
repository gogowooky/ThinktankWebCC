# ThinktankWebCC 完全仕様書

## 改版履歴

| 版 | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-03-16 | 初版作成（現行アプリケーション完全再現用） |

---

## 1. はじめに

### 1.1. 本書の目的
本ドキュメントは、ThinktankWebCC（以下「本アプリ」）を完全に再構築するための技術仕様書である。本アプリは、思考整理と情報管理を目的としたキーボード操作主体のWebアプリケーションであり、WPF版デスクトップアプリ「ThinktankGemini」をWebへ移植したものである。

本書は以下の2つの目的を持つ：
1. **完全再現**: 本書に基づき、同等機能を持つアプリケーションをゼロから再構築できること
2. **拡張容易性**: 将来の機能追加（カレンダー、タグ分類、AIチャット統合等）に対応できる設計指針を含むこと

### 1.2. アプリケーション概要
- **名称**: Thinktank Web Editor
- **種別**: シングルページWebアプリケーション (SPA) + PWA対応
- **用途**: 個人メモ管理・マルチパネルエディタ
- **主要特徴**:
  - 7パネル構成のマルチパネルレイアウト
  - Monaco Editorベースの高機能テキストエディタ
  - キーボード中心の操作体系（150以上のキーバインディング）
  - BigQuery連携によるクラウド永続化
  - IndexedDBによるオフラインキャッシュ
  - WebSocket によるリアルタイム同期
  - カスタマイズ可能なカラーテーマ
  - パターンマッチによるリクエストリンク

---

## 2. 動作環境・技術スタック

### 2.1. ターゲット環境
- **ブラウザ**: Chrome, Edge (ES2020対応ブラウザ)
- **デバイス**: デスクトップ (主), タブレット/スマートフォン (副)
- **ネットワーク**: オンライン推奨（オフライン時はIndexedDBキャッシュで動作）

### 2.2. フロントエンド技術スタック

| 技術 | バージョン | 用途 |
|---|---|---|
| React | 18.3.1 | UIフレームワーク |
| TypeScript | 5.5.3 | 言語（strict mode） |
| Vite | 5.4.1 | ビルドツール・開発サーバー |
| Monaco Editor | 0.52.0 | テキストエディタコンポーネント |
| @monaco-editor/react | 4.6.0 | Monaco Editor React ラッパー |
| react-window | 1.8.10 | 仮想化リスト表示 |
| ws (client) | 8.19.0 | WebSocket クライアント |

### 2.3. バックエンド技術スタック

| 技術 | バージョン | 用途 |
|---|---|---|
| Node.js | - | ランタイム |
| Express | 5.2.1 | HTTPサーバー |
| @google-cloud/bigquery | 8.1.1 | データストレージ |
| googleapis | 170.0.0 | Google API連携 |
| ws | 8.19.0 | WebSocketサーバー |
| iconv-lite | 0.7.2 | 文字エンコーディング変換 |
| chardet | 2.1.1 | 文字エンコーディング検出 |

### 2.4. ビルド・実行スクリプト

| コマンド | 説明 |
|---|---|
| `npm run dev` | Vite開発サーバー起動（ポート5173） |
| `npm run build` | フロントエンドビルド（→ `/dist`） |
| `npm run build:server` | バックエンドビルド（→ `/dist-server`） |
| `npm run server:dev` | バックエンド開発モード起動（ポート8080） |
| `npm start` | プロダクションサーバー起動 |

### 2.5. 開発時構成
- フロントエンド: Vite dev server (ポート 5173)
- バックエンド: Express (ポート 8080)
- Vite → Express へのAPI proxy (`/api/bq` → `http://127.0.0.1:8080`)

### 2.6. プロダクション構成
- Express がSPAとAPIの両方を配信
- WebSocket サーバーを同一プロセスで提供 (`/ws`)
- Google Cloud Run 上にデプロイ

---

## 3. システムアーキテクチャ

### 3.1. 全体アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  React   │  │  Monaco  │  │ WebView  │  │  WebSocket   │   │
│  │Components│  │  Editor  │  │ (iframe) │  │   Client     │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │              │               │           │
│  ┌────┴──────────────┴──────────────┴───────────────┤           │
│  │               TTApplication (Singleton)          │           │
│  │     Views / Controllers / Actions / Events       │           │
│  └────┬─────────────────────────────────────────────┤           │
│       │                                             │           │
│  ┌────┴─────────────────┐  ┌────────────────────────┤           │
│  │   TTModels            │  │   StorageManager       │           │
│  │   (Status,Actions,    │  │   ┌─────────────────┐ │           │
│  │    Events,Memos,      │  │   │  IndexedDB      │ │           │
│  │    Requests,Editings) │  │   │  (Local Cache)  │ │           │
│  └───────────────────────┘  │   └─────────────────┘ │           │
│                             │   ┌─────────────────┐ │           │
│                             │   │  BigQuery Client│ │           │
│                             │   └────────┬────────┘ │           │
│                             └────────────┼──────────┘           │
└──────────────────────────────────────────┼──────────────────────┘
                                           │ HTTP/WebSocket
┌──────────────────────────────────────────┼──────────────────────┐
│                     Server (Express)      │                      │
│  ┌───────────────┐  ┌───────────────┐    │ ┌────────────────┐   │
│  │  Auth         │  │  BigQuery     │    │ │  WebSocket     │   │
│  │  Middleware   │  │  Routes       │    │ │  Broadcast     │   │
│  └───────────────┘  └───────┬───────┘    │ └────────────────┘   │
│                             │            │                      │
│                    ┌────────┴────────┐   │                      │
│                    │  BigQuery       │   │                      │
│                    │  Service        │   │                      │
│                    └────────┬────────┘   │                      │
└─────────────────────────────┼────────────┘                      │
                              │                                    │
                    ┌─────────┴──────────┐                        │
                    │  Google BigQuery   │                        │
                    │  (Cloud Storage)   │                        │
                    └────────────────────┘
```

### 3.2. 設計原則
1. **シングルトンパターン**: TTApplication, TTModels は単一インスタンス
2. **オブザーバーパターン**: 全モデルは `AddOnUpdate`/`RemoveOnUpdate` による変更通知
3. **ストラテジーパターン**: パネルの表示モード (Editor/Table/WebView) をBehaviorで切り替え
4. **コントローラパターン**: Actions/Events/Status が Controller 層として機能
5. **オフラインファースト**: IndexedDB を第一読み込み先、BigQuery をマスターとする二層ストレージ
6. **動的アクション**: `StateID:Value` パターンによるアクション自動生成

### 3.3. ディレクトリ構造（推奨）

```
project-root/
├── index.html                    # SPAエントリポイント
├── package.json
├── vite.config.ts
├── tsconfig.json                 # フロントエンド用
├── src/                          # フロントエンドソース
│   ├── main.tsx                  # Reactエントリ
│   ├── App.tsx                   # ルートコンポーネント
│   ├── index.css                 # グローバルスタイル
│   ├── types/
│   │   └── index.ts              # 共通型定義
│   ├── models/                   # ドメインモデル
│   │   ├── TTObject.ts
│   │   ├── TTCollection.ts
│   │   ├── TTModels.ts
│   │   ├── TTMemo.ts / TTMemos.ts
│   │   ├── TTAction.ts
│   │   ├── TTEvent.ts
│   │   ├── TTStatus.ts / TTState.ts
│   │   ├── TTRequest.ts
│   │   └── TTEditing.ts
│   ├── Views/                    # ビューモデル・ビヘイビア
│   │   ├── TTApplication.ts
│   │   ├── TTPanel.ts
│   │   ├── TTPanelEditorBehavior.ts
│   │   ├── TTPanelTableBehavior.ts
│   │   ├── TTPanelWebViewBehavior.ts
│   │   ├── IPanelModeBehavior.ts
│   │   └── Editor*Helper.ts
│   ├── Controllers/              # コントローラ
│   │   ├── DefaultStatus.ts
│   │   ├── DefaultActions.ts
│   │   ├── DefaultEvents.ts
│   │   ├── DefaultRequests.ts
│   │   ├── Actions/
│   │   │   ├── ApplicationActions.ts
│   │   │   ├── EditorActions.ts
│   │   │   ├── ModelActions.ts
│   │   │   ├── RequestActions.ts
│   │   │   └── TableActions.ts
│   │   ├── Status/
│   │   │   ├── ApplicationStatus.ts
│   │   │   ├── EditorStatus.ts
│   │   │   └── TableStatus.ts
│   │   └── helpers/
│   ├── components/               # Reactコンポーネント
│   │   ├── Layout/MainLayout.tsx
│   │   ├── Panel/TTPanel.tsx
│   │   ├── Editor/Editor.tsx
│   │   ├── Explorer/ModelBrowser.tsx
│   │   ├── Search/SearchApp.tsx
│   │   ├── UI/CommandPalette.tsx
│   │   ├── UI/ContextMenu.tsx
│   │   └── Status/StatusBar.tsx
│   ├── services/                 # サービス層
│   │   ├── storage/
│   │   │   ├── IStorageService.ts
│   │   │   ├── StorageManager.ts
│   │   │   ├── BigQueryStorageService.ts
│   │   │   └── IndexedDBStorageService.ts
│   │   ├── sync/
│   │   │   ├── WebSocketService.ts
│   │   │   └── SyncManager.ts
│   │   ├── ColorTheme.ts
│   │   ├── KeywordHighlighter.ts
│   │   ├── RequestLinkProvider.ts
│   │   └── TouchGestureRecognizer.ts
│   └── utils/
│       ├── csv.ts
│       └── markdownToHtml.ts
├── server/                       # バックエンドソース
│   ├── index.ts
│   ├── tsconfig.json
│   ├── routes/
│   │   └── bigqueryRoutes.ts
│   ├── middleware/
│   │   └── authMiddleware.ts
│   ├── services/
│   │   └── BigQueryService.ts
│   └── utils/
├── public/                       # 静的アセット
│   ├── favicon.svg
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── scripts/                      # ユーティリティスクリプト
└── docs/                         # ドキュメント
```

---

## 4. データモデル

### 4.1. モデル階層図

```
TTModels (Singleton)
├── Status   : TTStatus    (TTState のコレクション)
├── Actions  : TTActions   (TTAction のコレクション)
├── Events   : TTEvents    (TTEvent のコレクション)
├── Memos    : TTMemos     (TTMemo のコレクション)
├── Requests : TTRequests  (TTRequest のコレクション)
└── Editings : TTEditings  (TTEditing のコレクション)
```

### 4.2. 基底クラス

#### 4.2.1. TTObject
全モデルの基底クラス。

| プロパティ | 型 | 説明 |
|---|---|---|
| `ID` | `string` | 一意識別子 |
| `Name` | `string` | 表示名 |
| `UpdateDate` | `string` | 最終更新日時 |
| `_parent` | `TTObject \| null` | 親オブジェクト参照（カスケード通知用） |

| メソッド | 説明 |
|---|---|
| `AddOnUpdate(handler)` | 更新通知リスナー登録 |
| `RemoveOnUpdate(handler)` | 更新通知リスナー解除 |
| `NotifyUpdated()` | 変更通知を全リスナーと親に伝搬 |
| `Matches(keyword)` | キーワードマッチ判定（テーブルフィルタ用） |

#### 4.2.2. TTCollection
オブジェクトのコレクション管理基底クラス。

| プロパティ | 型 | 説明 |
|---|---|---|
| `Children` | `Map<string, TTObject>` | 子オブジェクト群 |
| `ItemSaveProperties` | `string[]` | CSV保存対象プロパティ名配列 |

| メソッド | 説明 |
|---|---|
| `AddItem(item)` | アイテム追加 |
| `RemoveItem(id)` | アイテム削除 |
| `GetItem(id)` | アイテム取得 |
| `GetItems()` | 全アイテム取得 |
| `LoadCache()` | キャッシュからCSV読み込み |
| `SaveCache()` | CSVとしてキャッシュに保存 |
| `ScheduleSave()` | デバウンス付き保存（5秒間隔） |

### 4.3. ドメインモデル

#### 4.3.1. TTMemo（メモ）

| プロパティ | 型 | 説明 |
|---|---|---|
| `ID` | `string` | メモID（一意） |
| `Name` | `string` | メモタイトル（コンテンツ1行目から自動導出） |
| `Content` | `string` | メモ本文 |
| `UpdateDate` | `string` | 最終更新日時 |
| `IsLoaded` | `boolean` | コンテンツ読み込み済みフラグ |
| `IsDirty` | `boolean` (computed) | 未保存変更ありフラグ |

| メソッド | 説明 |
|---|---|
| `LoadContent()` | BigQueryからコンテンツを遅延読み込み |
| `SaveContent()` | BigQueryへコンテンツを保存 |
| `applyRemoteUpdate(content)` | WebSocket経由のリモート更新適用（ループ防止付き） |

**動作仕様:**
- コンテンツは遅延読み込み（表示時に初めてBigQueryからフェッチ）
- 保存時は `_savedContent` と比較し、差分がある場合のみ実行
- WebSocket による更新時は `_isRemoteUpdate` フラグでエコーバック防止
- タイトルはコンテンツ1行目（`===` 区切り以前）から自動抽出

#### 4.3.2. TTMemos（メモコレクション）

| メソッド | 説明 |
|---|---|
| `SyncWithBigQuery()` | BigQueryのファイル一覧と同期 |
| `getOrCreateMemo(id)` | Promise キャッシュによる競合防止付きメモ取得/作成 |
| `LoadCache()` | IndexedDB → BigQuery フォールバック読み込み |

**同期仕様:**
- カテゴリ `"Memo"` のファイルのみ対象
- `since` パラメータによる差分同期対応
- BigQuery 接続不可時は IndexedDB キャッシュを使用

#### 4.3.3. TTAction（アクション）

| プロパティ | 型 | 説明 |
|---|---|---|
| `ID` | `string` | アクションID（例: `Editor.Folding.Open`） |
| `Name` | `string` | 表示名 |
| `Script` | `ActionScript` | 実行関数 |

| メソッド | 説明 |
|---|---|
| `Invoke(context)` | アクション実行（戻り値: `boolean`） |

**動的アクション解決:**
- `SetDynamicResolver(resolver)` で未登録アクションの動的生成
- `StateID:Value` パターンで自動的に状態設定アクションを生成
  - 例: `Application.Font.Size:up` → フォントサイズを+1するアクション
- プレースホルダ置換: `(Panel)` → 現在のパネル名, `(ExPanel)` → ExModeパネル名, `(Mode)` → 現在のモード

**静的フック:**
- `TTAction.OnInvoke`: アクション実行前に呼ばれるグローバルフック（ロギング等）

#### 4.3.4. TTEvent（イベント）

| プロパティ | 型 | 説明 |
|---|---|---|
| `Context` | `string` | マッチングコンテキスト（例: `*-Editor-Main-*`） |
| `Mods` | `string` | 修飾キー（例: `Control+Shift`） |
| `Key` | `string` | キーコード（例: `A`, `ENTER`, `LEFT1`） |
| `ActionID` | `string` | 実行するアクションID |

**コンテキスト形式:** `Panel-Mode-Tool-ExMode`
- 各セグメントは `*`（ワイルドカード）が使用可能
- 具体的な指定が多いほどスコアが高く、優先される

#### 4.3.5. TTState（状態変数）

| プロパティ | 型 | 説明 |
|---|---|---|
| `ID` | `string` | 状態ID（例: `Application.Font.Size`） |
| `Name` | `string` | 表示名 |
| `Value` | `string` | 現在値 |
| `From` | `string` | 値の設定元 |

| コールバック | 説明 |
|---|---|
| `Default(id)` | デフォルト値を返す関数 |
| `Test(id, value)` | 値の妥当性チェック |
| `Apply(id, value)` | 値をビューに適用する関数 |
| `Watch(id)` | ビュー側の変更を監視し Value を同期する関数 |

#### 4.3.6. TTRequest（リクエストパターン）

| プロパティ | 型 | 説明 |
|---|---|---|
| `ID` | `string` | リクエストID |
| `Name` | `string` | 表示名 |
| `Determinant` | `string` | マッチング正規表現 |
| `Color` | `string` | 表示文字色（CSS色指定） |
| `FontWeight` | `string` | フォントウェイト（`normal`/`bold`） |
| `Underline` | `boolean` | 下線表示の有無 |

#### 4.3.7. TTEditing（編集状態）

| プロパティ | 型 | 説明 |
|---|---|---|
| `ID` | `string` | 対象メモID |
| `CursorPosition` | `{line, column}` | カーソル位置 |
| `WordWrap` | `string` | ワードラップ設定 |
| `Foldings` | `object[]` | 折りたたみ状態 |
| `KeywordHighlights` | `string[]` | キーワードハイライト設定 |

---

## 5. UI仕様

### 5.1. 画面構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser Window                              │
│ ┌──────────┬─────────────────────────────────┬────────────────────┐ │
│ │          │                                 │                    │ │
│ │ Library  │          Shelf                  │      Chat          │ │
│ │          │                                 │                    │ │
│ │          ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤                    │ │
│ ├──────────┤                                 ├────────────────────┤ │
│ │          │          Desk                   │                    │ │
│ │ Index    │                                 │      Log           │ │
│ │          │                                 │                    │ │
│ │          ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤                    │ │
│ │          │          System                 │                    │ │
│ └──────────┴─────────────────────────────────┴────────────────────┘ │
│ [StatusBar: Context | Key | Action                                ] │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2. パネル定義

| パネル名 | 位置 | デフォルトモード | デフォルトリソース | 説明 |
|---|---|---|---|---|
| **Library** | 左上 | Table | Thinktank (TTModels) | データコレクション一覧ブラウザ |
| **Index** | 左下 | Table | Memos | メモ索引・ステータス表示 |
| **Shelf** | 中上 | Table | Events | イベント一覧・一時領域 |
| **Desk** | 中央 | Editor | Memos | メインの作業領域 |
| **System** | 中下 | Table | Actions | アクション一覧・システム設定 |
| **Chat** | 右上 | Table | Events | チャット・イベント表示 |
| **Log** | 右下 | Table | Status | ログ・ステータス表示 |

### 5.3. パネル共通構造

各パネルは以下の要素で構成される：

```
┌────────────────────────────┐
│ Panel Title (パネル名)     │  ← タイトルバー（右クリックでコンテキストメニュー）
├────────────────────────────┤
│                            │
│     Main Content Area      │  ← メインコンテンツ（Editor/Table/WebView）
│                            │
├────────────────────────────┤
│ Keyword [____________]     │  ← キーワード入力欄（Monaco Editor 1行）
└────────────────────────────┘
```

### 5.4. パネルモード

#### 5.4.1. Editor モード
- **コンポーネント**: Monaco Editor
- **用途**: テキスト編集、メモ閲覧・編集
- **機能**:
  - 行番号表示（トグル可能）
  - ワードラップ（トグル可能）
  - ミニマップ（トグル可能）
  - キーワードハイライト（3モード: Default/Subtle/None）
  - リクエストリンク表示（色・太字・下線）
  - コード折りたたみ（見出し単位）
  - 検索/置換
  - マルチカーソル
  - オートコンプリート

#### 5.4.2. Table モード
- **コンポーネント**: react-window 仮想化リスト
- **用途**: コレクションデータの一覧表示
- **機能**:
  - カラムヘッダー付きテーブル表示
  - ソート（昇順/降順/トグル）
  - キーワードフィルタリング
    - スペース区切り → AND条件
    - カンマ区切り → OR条件
    - `@Nd` 形式 → 直近N日以内フィルタ
  - 行選択（クリック/キーボード）
  - カラム幅自動調整
  - 選択行のハイライト表示

#### 5.4.3. WebView モード
- **コンポーネント**: iframe
- **用途**: Web コンテンツ表示、Markdown プレビュー、全文検索結果表示
- **機能**:
  - URL指定によるWebページ表示
  - 同一オリジンコンテンツ (Markdown プレビュー, `/ttsearch`)
  - リンクカーソル移動（UP/DOWN/FIRST/LAST）
  - リンククリック時のリクエスト処理

### 5.5. レイアウトシステム

#### 5.5.1. スプリッター構成
6つのスプリッターでパネルサイズを制御する：

| スプリッター名 | 方向 | 分割対象 |
|---|---|---|
| `LeftVsRest` | 水平 | 左カラム vs 中央+右カラム |
| `LibVsIdx` | 垂直 | Library vs Index |
| `CenterVsRight` | 水平 | 中央カラム vs 右カラム |
| `ShelfVsRest` | 垂直 | Shelf vs Desk+System |
| `DeskVsSys` | 垂直 | Desk vs System |
| `ChatVsLog` | 垂直 | Chat vs Log |

#### 5.5.2. スプリッター仕様
- 幅/高さ: 3px
- ドラッグ可能（マウスイベントで比率変更）
- 比率は `TTApplication.PanelLayout` に保存

#### 5.5.3. レイアウトプリセット

| プリセット名 | 説明 |
|---|---|
| `zen` | Desk パネルのみ最大表示 |
| `standard` | 標準レイアウト（左:中央:右 = 適度な比率） |
| `reset` | デフォルト比率にリセット |

タッチデバイスの場合は自動的に `zen` モードで表示。

### 5.6. ステータスバー

画面最下部に固定表示（高さ22px）。

| セクション | 内容 |
|---|---|
| Status | 現在のコンテキスト文字列 (`Panel-Mode-Tool-ExMode`) |
| Key | 最後に押されたキー/修飾キーの組み合わせ |
| Action | 最後に実行されたアクションID |

マウスクリックイベントをハンドリングし、コンテキスト付きで `UIRequestTriggeredAction` を呼び出す。

### 5.7. コマンドパレット

- `Ctrl+Shift+P` またはコンテキストメニューから起動
- テキスト入力によるアクション検索・実行
- フィルタリング付きリスト表示

### 5.8. コンテキストメニュー

- 右クリック（`RIGHT1`）で表示
- パネルタイトル、ステータスバー、エディタ上で利用可能
- リクエストマッチ時は関連アクションを一覧表示

---

## 6. イベント・アクションシステム

### 6.1. イベント処理フロー

```
キー入力/マウスイベント
    │
    ▼
HandleKeyDown / HandleMouseEvent
    │
    ▼
UIRequestTriggeredAction(context)
    │
    ├── 現在のコンテキスト文字列を構築
    │   (Panel-Mode-Tool-ExMode)
    │
    ├── 全 TTEvent をスコア計算してマッチング
    │   (具体的指定が多いほど高スコア)
    │
    ├── 最高スコアのイベントの ActionID を取得
    │
    └── TTAction.Invoke(context) を実行
         │
         ├── 戻り値 true  → ExMode 継続
         └── 戻り値 false → ExMode 解除
```

### 6.2. コンテキストマッチング

コンテキスト文字列: `Panel-Mode-Tool-ExMode`

**スコア計算:**
- 各セグメントが具体的に一致 → +1点
- ワイルドカード `*` → 0点
- 不一致 → マッチ失敗

**例:**
- `Desk-Editor-Main-*` は `*-Editor-Main-*` より高スコア
- ExMode が有効な場合、ExMode指定のあるイベントが最優先

### 6.3. ExMode（拡張モード）

ExMode はAltキーとの組み合わせで発動する一時的なモード。ExMode 中は専用のキーバインドが有効になる。

| ExMode名 | 発動キー | 用途 |
|---|---|---|
| `ExApp` | `Alt+A` | アプリケーション全体設定 |
| `ExLibrary` | `Alt+L` | Libraryパネル操作 |
| `ExIndex` | `Alt+I` | Indexパネル操作 |
| `ExShelf` | `Alt+S` | Shelfパネル操作 |
| `ExDesk` | `Alt+D` | Deskパネル操作 |
| `ExSystem` | `Alt+/` | Systemパネル操作 |
| `ExChat` | `Alt+[` | Chatパネル操作 |
| `ExLog` | `Alt+]` | Logパネル操作 |
| `ExFold` | `Ctrl+K` | 折りたたみ操作 |
| `ExDateTime` | `Alt+T` | 日付操作（日付タグ上で発動時） |
| `ExPanel` | (上記ExXxx中) | パネル共通 ExMode 操作 |

**ExMode動作:**
1. Alt+{Key} で ExMode 発動
2. ExMode 中は修飾キー不要で専用キーバインドが使用可能
3. アクション実行結果が `false` で ExMode 解除
4. 修飾キーのリリースでも ExMode 解除

### 6.4. ActionContext（アクション実行コンテキスト）

```typescript
interface ActionContext {
    Mods?: string[];         // 修飾キー配列 ['Control', 'Shift']
    Key?: string;            // キーコード ('A', 'ENTER', 'LEFT1'等)
    Sender?: unknown;        // 呼び出し元
    SourcePanel?: string;    // ソースパネル名
    TargetPanel?: string;    // ターゲットパネル名
    ScreenX?: number;        // 画面X座標
    ScreenY?: number;        // 画面Y座標
    ClientX?: number;        // ビューポートX座標
    ClientY?: number;        // ビューポートY座標
    RequestID?: string;      // リクエストID
    RequestTag?: string;     // リクエストタグ
    DroppedData?: unknown;   // ドロップデータ
    [key: string]: unknown;  // 拡張用
}
```

### 6.5. マウス・タッチイベントキー

| キー名 | 説明 |
|---|---|
| `LEFT1` / `LEFT2` / `LEFT3` | 左クリック（シングル/ダブル/トリプル） |
| `RIGHT1` | 右クリック |
| `MIDDLE1` | 中クリック |
| `LINK` | リクエストリンク上クリック |
| `DROP` | ドロップイベント |
| `TAP1` / `TAP2` | タッチ（シングル/ダブルタップ） |
| `LONGPRESS` | 長押し |
| `SWIPE_LEFT` / `SWIPE_RIGHT` | 水平スワイプ |
| `SWIPE_UP` / `SWIPE_DOWN` | 垂直スワイプ |
| `PanelTitle_RIGHT1` | パネルタイトル右クリック |
| `StatusBar_RIGHT1` | ステータスバー右クリック |
| `Selection_LEFT2` / `sel_LEFT2` | 選択テキスト上ダブルクリック |

---

## 7. 状態管理 (TTStatus)

### 7.1. 状態一覧

#### 7.1.1. アプリケーション状態

| 状態ID | デフォルト値 | 値域 | 説明 |
|---|---|---|---|
| `Application.Product.Name` | `"Thinktank"` | readonly | アプリ名 |
| `Application.Product.Author` | `"Shinichiro Egashira"` | readonly | 著者 |
| `Application.Product.Mail` | `"gogowooky@gmail.com"` | readonly | メール |
| `Application.Product.Site` | `"https://github.com/gogowooky"` | readonly | サイト |
| `Application.Product.Version` | 動的生成 | readonly | バージョン文字列 |
| `Application.Appearance.ColorMode` | `"DefaultDark"` | `DefaultDark`, `DefaultOriginal` | カラーモード |
| `Application.Font.Size` | `"14"` | `8`-`72`, `reset`, `up`, `down` | 全体フォントサイズ |
| `Application.Voice.Input` | `"false"` | `true`, `false`, `toggle`, `next`, `prev` | 音声入力 |
| `Application.Style.PanelRatio` | - | `zen`, `standard`, `reset` | レイアウトプリセット |
| `Application.Current.ExMode` | `""` | ExMode名 | 現在のExMode |
| `Application.Current.Panel` | `"Desk"` | PanelName, `next`, `prev` | フォーカスパネル |
| `Application.Current.Mode` | (パネルに委譲) | PanelMode, `next`, `prev` | 現在のモード |
| `Application.Current.Tool` | (パネルに委譲) | PanelTool, `next`, `prev` | 現在のツール |

#### 7.1.2. パネル共通状態（[Panels] は全7パネルに展開）

| 状態ID パターン | デフォルト値 | 説明 |
|---|---|---|
| `[Panels].Current.Mode` | パネル依存 | パネルの表示モード |
| `[Panels].Current.Tool` | `"Main"` | パネルのフォーカス先ツール |
| `[Panels].Font.Size` | `"14"` | パネル個別フォントサイズ |

#### 7.1.3. エディタ状態

| 状態ID パターン | デフォルト値 | 説明 |
|---|---|---|
| `[Panels].Editor.Keyword` | `""` | アクティブキーワード |
| `[Panels].Editor.Keywords` | `""` | キーワード一覧 |
| `[Panels].Editor.Resource` | `"thinktank"` | エディタリソース名 |
| `[Panels].Editor.KeywordColor` | `"Default"` | ハイライトモード |
| `[Panels].Editor.Wordwrap` | `"on"` | ワードラップ |
| `[Panels].Editor.Minimap` | `"true"` | ミニマップ表示 |
| `[Panels].Editor.LineNumber` | `"on"` | 行番号表示 |
| `[Panels].Editor.SearchRegex` | `"false"` | 正規表現検索 |
| `[Panels].Editor.SearchCaseSensitive` | `"false"` | 大文字小文字区別 |
| `[Panels].Editor.SearchWholeWord` | `"false"` | 全語一致 |
| `[Panels].Editor.ReplaceKeepCapitalize` | `"false"` | 大文字保持置換 |
| `[Panels].Editor.ReplaceInSelection` | `"false"` | 選択範囲内置換 |
| `[Panels].Editor.CurPos` | `"1,1"` | カーソル位置 |
| `[Panels].Editor.SelPos` | `"1,1,1,1"` | 選択範囲 |
| `[Panels].Editor.SearchMode` | `"None"` | 検索モード (Search/Replace/None) |

#### 7.1.4. テーブル状態

| 状態ID パターン | デフォルト値 | 説明 |
|---|---|---|
| `[Panels].Table.Keyword` | パネル依存 | フィルタキーワード |
| `[Panels].Table.Keywords` | `""` | キーワード一覧 |
| `[Panels].Table.Resource` | パネル依存 | 表示コレクション名 |
| `[Panels].Table.SortDir` | `"asc"` | ソート方向 |
| `[Panels].Table.SortProperty` | `""` | ソートプロパティ名 |
| `[Panels].Table.CurPos` | `"0"` | 選択行位置 |
| `[Panels].Table.CurrentID` | `""` | 選択行のID |
| `[Panels].Table.VisibleProperties` | - | 表示カラム一覧 |

#### 7.1.5. WebView状態

| 状態ID パターン | デフォルト値 | 説明 |
|---|---|---|
| `[Panels].WebView.Keyword` | `""` | WebView キーワード（URL） |
| `[Panels].WebView.Keywords` | `""` | キーワード履歴 |
| `[Panels].WebView.CurPos` | `"0"` | リンクカーソル位置 |

#### 7.1.6. キーワードツール状態

| 状態ID パターン | デフォルト値 | 説明 |
|---|---|---|
| `[Panels].Keyword.CurPos` | - | キーワード欄カーソル位置 |
| `[Panels].Keyword.SelPos` | - | キーワード欄選択範囲 |

### 7.2. 特殊値のルール

**カーソル位置 (CurPos) の特殊値:**
- `prevline`, `nextline`, `prevchar`, `nextchar` — 相対移動
- `linestart`, `lineend` — 行頭/行末
- `linestart+`, `lineend+` — 行頭（既に行頭なら文書先頭）/行末（既に行末なら文書末）
- `prevvisiblefolding`, `nextvisiblefolding` — 見出し間移動
- `prevsibfolding`, `nextsibfolding` — 同レベル見出し間移動
- `firstsibfolding`, `lastsibfolding` — 同レベル最初/最後の見出し
- `prevfolding`, `nextfolding` — 全折りたたみポイント間移動

**テーブル CurPos の特殊値:**
- `prev`, `next` — 1行移動
- `prev10`, `next10`, `+10`, `-10` — 10行移動
- `first`, `last` — 先頭/末尾

**トグル値:**
- `next`, `prev` — 選択肢の循環
- `toggle` — on/off 切り替え

---

## 8. アクション一覧

### 8.1. アプリケーションアクション

| アクションID | 説明 |
|---|---|
| `Application.Command.NoAction` | 何もしない（キーイベント消費用）。戻り値: `true` |
| `Application.Command.Delegate` | ブラウザのデフォルト動作に委譲。戻り値: `false` |
| `Panel.Keyword.Clear` | アクティブパネルのキーワード欄をクリア |
| `Application.Memo.Renew` | BigQueryと同期し、メモコレクションを再読み込み |
| `Application.AllCollection.Save` | 全コレクションのキャッシュ保存を強制実行 |
| `Application.Memos.Save` | メモコレクションのキャッシュ保存 |
| `Application.Cache.Clear` | ローカルストレージ/IndexedDB全クリア |
| `Application.Cache.Rebuild` | キャッシュを再構築 |

### 8.2. エディタアクション

#### 折りたたみ操作
| アクションID | 説明 |
|---|---|
| `Editor.Folding.Open` | カーソル位置の折りたたみを展開 |
| `Editor.Folding.Close` | カーソル位置の折りたたみを閉じる（またはFoldOrCloseSiblings） |
| `Editor.Folding.OpenAll` | 全折りたたみを展開 |
| `Editor.Folding.CloseAll` | 全折りたたみを閉じる |
| `Editor.Folding.OpenAllSibling` | 同レベルの全折りたたみを展開 |
| `Editor.Folding.CloseAllSibling` | 同レベルの全折りたたみを閉じる |
| `Editor.Folding.OpenLevel2`-`5` | 指定レベルまで展開 |

#### 編集操作
| アクションID | 説明 |
|---|---|
| `Editor.Editing.Save` | エディタ内容と TTEditing を保存 |
| `Editor.Memo.Create` | 新規メモ作成（タイムスタンプ付きID） |
| `Editor.Edit.FoldingInit` | 折りたたみマーカー初期化 |
| `Editor.Edit.FoldingUp` | 折りたたみレベルを上げる |
| `Editor.Edit.FoldingDown` | 折りたたみレベルを下げる |
| `Editor.Edit.NextBullet` | 箇条書き記号の次候補に変更 |
| `Editor.Edit.PrevBullet` | 箇条書き記号の前候補に変更 |
| `Editor.Edit.NextComment` | コメント書式の次候補に変更 |
| `Editor.Edit.PrevComment` | コメント書式の前候補に変更 |
| `Editor.Edit.AddTAB` | インデント追加 |
| `Editor.Edit.RemoveTAB` | インデント削除 |

#### 日付操作
| アクションID | 説明 |
|---|---|
| `Editor.Date.Action` | 日付タグ上ならExDateTimeモードへ、それ以外は[YYYY-MM-DD]挿入 |
| `DateTime.Shift.Next1y` / `Prev1y` | ±1年シフト |
| `DateTime.Shift.Next1m` / `Prev1m` | ±1月シフト |
| `DateTime.Shift.Next1d` / `Prev1d` | ±1日シフト |
| `DateTime.Shift.Next1w` / `Prev1w` | ±1週シフト |
| `DateTime.ChangeFormat.Next` / `Prev` | 日付形式の循環変更 |
| `DateTime.ChangeDetail.Weekday` | 曜日の表示/非表示切り替え |
| `DateTime.ChangeDetail.Time` | 時刻の表示/非表示切り替え |

#### 選択操作
| アクションID | 説明 |
|---|---|
| `Editor.Select.Up` / `Down` | 上下に選択拡張 |
| `Editor.Select.Prev` / `Next` | 前後に選択拡張 |
| `Editor.Select.FirstLine` / `LastLine` | 先頭/末尾まで選択 |

#### その他
| アクションID | 説明 |
|---|---|
| `Editor.AutoComplete.Suggest` | Monaco オートコンプリート起動 |

### 8.3. リクエストアクション

| アクションID | 説明 |
|---|---|
| `Request.Invoke.Default` | カーソル位置のリクエストパターンを検出し、対応するデフォルトアクションを実行 |
| `Request.Show.ContextMenu` | カーソル位置のリクエストに対する全アクションをコマンドパレットに表示 |

**アクション解決順序:**
1. `Request.{ClassName}.Default` (例: `Request.TTMemo.Default`)
2. `Request.{requestId}.Default` (例: `Request.Editor.Default`)
3. レガシーフォールバック

### 8.4. モデル操作アクション

| アクションID | 説明 |
|---|---|
| `Request.Memo.Default` / `Open` | メモを開く（ID抽出→Editor表示） |
| `Request.Memo.CopyTag` | メモタグをクリップボードにコピー |
| `Request.Memo.CopyContent` | メモ内容をクリップボードにコピー |
| `Request.TTMemo.Default` / `Open` / `CopyContent` | TTMemoリクエスト（Memo委譲） |
| `Request.TTAction.Default` / `Invoke` | アクション実行 |
| `Request.TTModel.Default` / `Open` | コレクションをテーブル表示 |
| `Request.TTCollection.Default` / `Open` | リソースをテーブル表示 |
| `Request.TTObject.Default` | オブジェクトデフォルトアクション |
| `Request.TTSearch.Default` | 全文検索（`/ttsearch?q={query}` をWebView表示） |

### 8.5. テーブルアクション

| アクションID | 説明 |
|---|---|
| `Request.TableTitle.AdjustColumnWidth` | カラム幅自動調整 |
| `Table.SortCol{1-5}.{Asc/Desc/Rev}` | カラム番号指定ソート |
| `Table.SortProp{1-5}.{Asc/Desc/Rev}` | プロパティ順ソート |

### 8.6. WebView アクション

| アクションID | 説明 |
|---|---|
| `WebView.OpenSearch` | 検索画面をWebView表示 |
| `WebView.Action.Search` | `/ttsearch` URLをWebViewに適用 |
| `WebView.Keyword.Query` | キーワード欄のクエリ実行 |

**WebView.Keyword.Query の動作仕様:**
1. 入力が絶対URL（`http`等で始まる）または相対URL（`/`で始まる）→ そのURLをiframeに表示
2. レスポンスなし/エラー → メッセージ表示
3. その他 → `Request.TTSearch.Default` を呼び出し（`/ttsearch?q={urlencode(入力)}`）
4. URL適用時に `Keywords`/`Keyword` を更新（既存なら行移動、新規なら追加）

---

## 9. リクエストパターン定義

### 9.1. リクエスト一覧

| ID | 名前 | Determinant (正規表現) | 色 | 太字 | 下線 | 用途 |
|---|---|---|---|---|---|---|
| `Editor` | エディター上表示 | `\[(?<tag>TTMemo:(?<id>[^\]]+))\]` | #12abe2 | normal | ○ | メモ参照リンク |
| `Table` | テーブル上表示 | `\[(?<tag>TTModels\|TTActions\|TTEvents\|TTMemos\|TTRequests\|TTStatus)\]` | #12abe2 | normal | ○ | コレクション参照 |
| `Import` | 外部データ | `\[(?<class>Clipboard\|DragDrop)\]` | #12abe2 | normal | × | 外部データ参照 |
| `Url` | URL | `(?<http>https?://[^") ]+)` | #12abe2 | normal | ○ | 外部URL |
| `RelUrl` | 相対URL | `┗ (?<path>\/([^<>:\\" \|\\?\\*]+)*)` | #12abe2 | normal | ○ | 相対URL |
| `Path` | パス | `(?<file>([a-zA-Z]:\\\\)...)` | #12abe2 | normal | ○ | Windowsパス |
| `RelPath` | 相対パス | `┗ (?<path>\\\\...)` | #12abe2 | normal | ○ | 相対パス |
| `Icon` | アイコン | `\[(?<i1>1\|未\|待\|続\|済\|要\|催)\|...\]` | #e28f12 | bold | × | ステータスアイコン |
| `Reference` | 参照 | `\[(?<scope>>\|>>\|:)(?<tag>[^\]]+)\]` | #12abe2 | normal | × | 内部参照 |
| `WebSearch` | Web検索 | `\[(?<cite>Google\|Wikipedia\|Pubmed):(?<keyword>[^\]]+)\]` | #12abe2 | normal | × | Web検索タグ |
| `Route` | 旅程ルート | `\[(?<tag>Route):(?<param1>...)...\]` | #12abe2 | normal | × | ルートタグ |
| `Memo` | メモ | `\[Memo:(?<param1>...)...\]` | #12abe2 | normal | × | メモリンク |
| `ThinkTank` | アプリタグ | `\[(?<tag>Mail\|Set\|Photo):...\]` | #12abe2 | normal | × | アプリ連携 |
| `Chat` | AIチャットログ | `^\[(?<tag>Gemini\|Claude\|ChatGPT)>\](?<chat>.*)` | #12abe2 | normal | × | AIチャット発言 |
| `DateTag` | 日付タグ | `\[(?<y>\d{4})\-(?<m>\d{2})\-(?<d>\d{2})\]` | #15a80b | bold | × | `[YYYY-MM-DD]` |
| `Date` | 日付 | `(?<y>\d{4})/(?<m>\d{1,2})/(?<d>\d{1,2})(...)` | #15a80b | bold | ○ | `YYYY/MM/DD` |
| `JDate` | 日付 | `(?<y>\d{4})年(?<m>\d{1,2})月(?<d>\d{1,2})日...` | #15a80b | bold | ○ | 和暦日付 |
| `GDate` | 日付 | `(?<g>明治\|大正\|昭和\|平成\|令和)...` | #15a80b | bold | ○ | 元号日付 |

### 9.2. リクエスト処理フロー

```
テキスト上でリクエストアクション発動
    │
    ├── カーソル位置のテキストを全TTRequestの Determinant と照合
    │
    ├── マッチした場合：
    │   ├── requestID = TTRequest.ID
    │   ├── requestTag = マッチしたテキスト
    │   └── 名前付きグループから ClassName, ID 等を抽出
    │
    └── Request.Invoke.Default / Request.Show.ContextMenu を実行
```

---

## 10. キーバインディング一覧

### 10.1. グローバルバインディング

| 修飾キー | キー | アクション | 説明 |
|---|---|---|---|
| - | `F5` | Delegate | ブラウザリロード |
| `Ctrl+Shift` | `R` | Delegate | ブラウザ強制リロード |
| - | `F11` | Delegate | 全画面切り替え |
| - | `F12` | Delegate | 開発者ツール |
| `Alt` | `A` | ExMode:ExApp | アプリ設定モード |
| `Alt` | `L`/`I`/`S`/`D`/`/`/`[`/`]` | ExMode:ExXxx | 各パネルExMode |
| `Alt` | `\` | Panel:next | 次パネルへ移動 |
| `Alt+Shift` | `_` | Panel:prev | 前パネルへ移動 |
| `Alt+Shift` | `L`/`I`/`S`/`D`/`?`/`{`/`}` | Panel:Xxx | パネル直接移動 |
| `Alt` | `Q` | Mode:Table | テーブルモードへ |
| `Alt` | `W` | Mode:WebView | WebViewモードへ |
| `Alt` | `E` | Mode:Editor | エディタモードへ |
| `Alt` | `M` | Mode:next | 次モード |
| `Alt+Shift` | `M` | Mode:prev | 前モード |
| `Alt` | `H` | Tool:next | ツール切り替え |
| `Ctrl` | `G` | Editor.Memo.Create | 新規メモ作成 |
| `Alt` | `T` | Editor.Date.Action | 日付操作 |

### 10.2. ExApp モードバインディング

| キー | アクション | 説明 |
|---|---|---|
| `Z` | PanelRatio:zen | Zenモード |
| `S` | PanelRatio:standard | 標準レイアウト |
| `R` | PanelRatio:reset | レイアウトリセット |
| `V` | Voice.Input:next | 音声入力切替 |
| `M` | Minimap:next | ミニマップ切替 |
| `X` | Wordwrap:next | ワードラップ切替 |
| `N` | LineNumber:next | 行番号切替 |
| `F` | SearchMode:next | 検索モード切替 |
| `Shift+R` | Memo.Renew | メモ再同期 |
| `Shift+Ctrl+R` | AllCollection.Save | 全保存 |

### 10.3. エディタバインディング

| 修飾キー | キー | アクション | 説明 |
|---|---|---|---|
| `Ctrl` | `S` | Editing.Save | 保存 |
| `Ctrl` | `Z`/`Y` | Delegate | Undo/Redo |
| `Ctrl` | `X`/`C`/`V` | Delegate | Cut/Copy/Paste |
| `Ctrl` | `P`/`N` | CurPos:prevline/nextline | 上/下移動 |
| `Ctrl` | `F`/`B` | CurPos:nextchar/prevchar | 右/左移動 |
| `Ctrl` | `A`/`E` | CurPos:linestart+/lineend+ | 行頭+/行末+ |
| `Alt` | `P`/`N` | CurPos:prevvisiblefolding/nextvisiblefolding | 見出し間移動 |
| `Alt+Shift` | `P`/`N` | Folding.Close/Open | 折りたたみ開閉 |
| `Alt` | `G` | Request.Invoke.Default | リクエスト実行 |
| `Alt+Shift` | `G` | Request.Show.ContextMenu | リクエストメニュー |
| `Alt` | `RIGHT`/`LEFT` | Folding.Open/Close | 折りたたみ開閉 |
| `Alt` | `UP`/`DOWN` | CurPos:prev/nextvisiblefolding | 見出し移動 |
| `Ctrl` | `K` | ExMode:ExFold | 折りたたみモード |
| `Ctrl` | `I` | FoldingDown | 折りたたみレベル下 |
| `Ctrl+Shift` | `I` | FoldingUp | 折りたたみレベル上 |
| `Ctrl+Shift+Alt` | `I` | FoldingInit | 折りたたみ初期化 |
| `Ctrl` | `:` | NextBullet | 箇条書き次候補 |
| `Ctrl+Shift` | `*` | PrevBullet | 箇条書き前候補 |
| `Ctrl` | `/` | NextComment | コメント次候補 |
| `Ctrl+Shift` | `?` | PrevComment | コメント前候補 |

### 10.4. ExFold モードバインディング

| キー | アクション | 説明 |
|---|---|---|
| `RIGHT`/`LEFT` | Open/Close | 折りたたみ開閉 |
| `O`/`C` | OpenAll/CloseAll | 全展開/全閉 |
| `1`-`5` | CloseAll/OpenLevel{N} | レベル展開 |
| `P`/`N` | prevfolding/nextfolding | 折りたたみ移動 |
| `Shift+RIGHT`/`LEFT` | OpenAllSibling/CloseAllSibling | 同レベル全開閉 |

### 10.5. ExDateTime モードバインディング

| キー | アクション | 説明 |
|---|---|---|
| `Y` / `Shift+Y` | Next1y/Prev1y | ±1年 |
| `M` / `Shift+M` | Next1m/Prev1m | ±1月 |
| `D` / `Shift+D` | Next1d/Prev1d | ±1日 |
| `K` / `Shift+K` | Next1w/Prev1w | ±1週 |
| `T` / `Shift+T` | ChangeFormat.Next/Prev | 形式変更 |
| `W` | ChangeDetail.Weekday | 曜日切替 |
| `J` | ChangeDetail.Time | 時刻切替 |

### 10.6. テーブルバインディング

| 修飾キー | キー | アクション | 説明 |
|---|---|---|---|
| - | `UP`/`DOWN` | CurPos:prev/next | 行移動 |
| `Shift` | `UP`/`DOWN` | CurPos:-10/+10 | 10行移動 |
| `Shift+Ctrl` | `UP`/`DOWN` | CurPos:first/last | 先頭/末尾 |
| - | `F1`-`F5` | SortCol{N}.Rev | カラムソート |
| `Shift` | `F1`-`F5` | SortProp{N}.Rev | プロパティソート |
| `Alt` | `R` | Resource:Thinktank | リソースリセット |

### 10.7. WebView バインディング

| 修飾キー | キー | アクション | 説明 |
|---|---|---|---|
| - | `UP`/`DOWN` | CurPos:prev/next | リンク移動 |
| `Shift+Ctrl` | `UP`/`DOWN` | CurPos:first/last | 先頭/末尾 |
| `Alt` | `S` | WebView.Action.Search | 検索画面表示 |
| - (Keyword) | `ENTER` | WebView.Keyword.Query | クエリ実行 |

### 10.8. ExPanel モードバインディング

| キー | アクション | 説明 |
|---|---|---|
| `Q`/`W`/`E` | Mode:Table/WebView/Editor | モード切替 |
| `M` / `Shift+M` | Mode:next/prev | モード循環 |
| `P`/`N` | Table.CurPos:prev/next | テーブル行移動 |
| `Shift+P`/`N` | Table.CurPos:prev10/next10 | 10行移動 |
| `Shift+Ctrl+P`/`N` | Table.CurPos:first/last | 先頭/末尾 |
| `;`/`-` | Font.Size:up/down | フォントサイズ |
| `G` | Request.Invoke.Default | リクエスト実行 |
| `Shift+G` | Request.Show.ContextMenu | リクエストメニュー |

### 10.9. キーワードツールバインディング

| 修飾キー | キー | アクション | 説明 |
|---|---|---|---|
| - | `UP`/`DOWN`/`LEFT`/`RIGHT` | Keyword.CurPos:* | カーソル移動 |
| `Ctrl` | `P`/`N`/`F`/`B` | Keyword.CurPos:* | Emacs風移動 |
| `Ctrl` | `A`/`E` | Keyword.CurPos:linestart+/lineend+ | 行頭+/行末+ |
| `Shift` | `UP`/`DOWN`/`LEFT`/`RIGHT` | Keyword.SelPos:* | 選択拡張 |
| `Ctrl+Shift` | `P`/`N`/`F`/`B`/`A`/`E` | Keyword.SelPos:* | 選択拡張(Emacs風) |

---

## 11. ストレージ・同期

### 11.1. ストレージアーキテクチャ

```
┌─────────────────────────────────────────────────┐
│              StorageManager (Singleton)          │
│                                                 │
│  ┌──────────────────┐  ┌─────────────────────┐ │
│  │  IndexedDB        │  │  BigQuery Client     │ │
│  │  (ローカルキャッシュ)│  │  (クラウドストレージ)  │ │
│  └────────┬─────────┘  └──────────┬──────────┘ │
│           │                       │             │
│  Read: ①ローカル優先             │             │
│  Write: ローカル + リモート同時    │             │
│  Sync: リモートの最新を取得        │             │
└───────────┼───────────────────────┼─────────────┘
            │                       │
    ┌───────┴──────┐       ┌────────┴────────┐
    │  IndexedDB   │       │  BigQuery       │
    │  Browser     │       │  Google Cloud   │
    └──────────────┘       └─────────────────┘
```

### 11.2. IStorageService インターフェース

```typescript
interface IStorageService {
    save(path: string, content: string): Promise<StorageResult>;
    load(path: string): Promise<StorageResult<string | null>>;
    exists(path: string): Promise<StorageResult<boolean>>;
    list(directory: string, pattern?: string): Promise<StorageResult<string[]>>;
    delete(path: string): Promise<StorageResult>;
}
```

### 11.3. IndexedDB 構成

| データベース名 | バージョン |
|---|---|
| `ThinktankDB` | 1 |

| オブジェクトストア | キー | 説明 |
|---|---|---|
| `files` | パス文字列 | ファイルデータ格納 |
| `pending` | auto-increment | オフライン変更キュー |
| `syncMeta` | メタデータキー | 同期メタデータ |

### 11.4. BigQuery スキーマ

| カラム | 型 | 説明 |
|---|---|---|
| `file_id` | `STRING` | ファイルID |
| `title` | `STRING` | タイトル |
| `file_type` | `STRING` | ファイルタイプ |
| `category` | `STRING` | カテゴリ（`Memo`, `Cache`, `Config`等） |
| `content` | `STRING` | ファイル内容 |
| `metadata` | `JSON` | メタデータ |
| `size_bytes` | `INTEGER` | サイズ |
| `created_at` | `TIMESTAMP` | 作成日時 |
| `updated_at` | `TIMESTAMP` | 更新日時 |

**複合キー:** `(file_id, category)` でUPSERT（MERGE文使用）

**デプロイ先:** `asia-northeast1`

### 11.5. 同期仕様

#### 起動時同期
1. `StorageManager.initialize()` 実行
2. IndexedDB からキャッシュされたバージョン情報を読み込み
3. オンラインの場合: `checkVersions()` でリモートとタイムスタンプ比較
4. 古いファイルを BigQuery から取得し IndexedDB を更新

#### 保存フロー
1. ユーザーがメモ編集
2. `TTMemo.Content` setter がトリガー
3. `NotifyUpdated()` で通知
4. `SaveContent()` → `POST /api/bq/files`
5. サーバー側で60秒デバウンス
6. `WebSocketService.sendContentUpdate()` で他タブに通知

#### オフライン時
1. 全操作が IndexedDB に対して実行
2. 書き込みは `pending` ストアにキューイング
3. オンライン復帰時: `syncPendingChanges()` でキューを再生

### 11.6. WebSocket 同期

**接続先:** `/ws` (開発時: `ws://localhost:8080/ws`, 本番: プロトコル自動判定)

**メッセージ形式:**
```json
{
    "type": "content-update",
    "fileId": "memo-id",
    "content": "updated content...",
    "timestamp": "2026-03-16T12:00:00.000Z"
}
```

**動作:**
- サーバーは送信元以外の全接続クライアントにブロードキャスト
- クライアントは `applyRemoteUpdate()` でコンテンツを更新
- `_isRemoteUpdate` フラグでエコーバック防止
- 接続断時は指数バックオフで自動再接続（最大5回）

---

## 12. サーバーAPI

### 12.1. エンドポイント一覧

#### 認証 API

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/api/auth/login` | ログイン（パスワード認証） |
| `GET` | `/api/auth/logout` | ログアウト（Cookie削除） |

**認証仕様:**
- `APP_PASSWORD` 環境変数が設定されている場合のみ認証が有効
- トークン: HMAC-SHA256 署名付きタイムスタンプ
- セッション: `tt_session` Cookie（httpOnly, secure, 30日有効期限）
- 認証不要時（環境変数未設定）: 全リクエストを許可

#### BigQuery API

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/bq/files` | ファイル一覧取得 |
| `GET` | `/api/bq/files/:id` | ファイル内容取得 |
| `POST` | `/api/bq/files` | ファイル保存（60秒デバウンス） |
| `DELETE` | `/api/bq/files/:id` | ファイル削除 |
| `GET` | `/api/bq/ttsearch` | 全文検索 |
| `GET` | `/api/bq/versions` | バージョン情報取得 |
| `GET` | `/api/bq/all` | 全ファイル取得（キャッシュ再構築用） |
| `POST` | `/api/bq/bulk` | バッチ保存 |

#### 全文検索 (`/ttsearch`)

**クエリパラメータ:** `?q={検索語}`

**検索対象:** `category = 'Memo'` のデータのみ

**レスポンスフォーマット:**
- 1行目: メモID : メモタイトル（リンク付き）
- 2-5行目: 検索語を含むスニペット（検索語は太字強調）
- リンク属性: `requestID='TTMemo'`, `requestTag='[TTMemo:{メモID}]'`

#### SPA フォールバック

| パス | レスポンス |
|---|---|
| `/` | SPAメインアプリ（`index.html`） |
| `/ttsearch` | 全文検索UI（`SearchApp.tsx`で処理） |
| その他 | 白紙ページ |

### 12.2. サーバー構成

```
Express App (port 8080 / ENV:PORT)
├── AuthMiddleware (optional)
├── Static Files (/dist)
├── API Routes (/api/bq/*)
├── WebSocket Server (/ws)
└── SPA Fallback (→ index.html)
```

---

## 13. カラーテーマ

### 13.1. テーマ定義

| プロパティ | DefaultDark | DefaultOriginal |
|---|---|---|
| `baseColor` | `#2b2b2b` | `#E6E6FA` (ラベンダー) |
| `titleBackground` | `#3c3c3c` | `#6A5ACD` (スレートブルー) |
| `titleForeground` | `#CCCCCC` | `#FFFFFF` |
| `editorBackground` | `#1e1e1e` | `#FFFFFF` |
| `editorForeground` | `#D4D4D4` | `#333333` |
| `keywordBackground` | `#2d2d2d` | `#F0F0FF` |
| `cursorLineInactive` | (透明) | (透明) |
| `cursorLineActive1` | (淡色) | (淡色) |
| `cursorLineActive2` | (中色) | (中色) |
| `cursorLineActive3` | (濃色) | (濃色) |
| `columnHeaderBackground` | `#3c3c3c` | `#7B68EE` |
| `columnHeaderForeground` | `#CCCCCC` | `#FFFFFF` |
| `listItemBackground` | `#2b2b2b` | `#FFFFFF` |
| `listItemSelected` | `#264f78` | `#C6C6FA` |
| `borderColor` | `#3c3c3c` | `#9999CC` |
| `splitterTrigger` | `#32CD32` | `#32CD32` |

**Monaco Editor テーママッピング:**
- `DefaultOriginal` → `vs` (ライト)
- `DefaultDark` → `my-dark` (カスタムダーク)

### 13.2. キーワードハイライトカラーモード

#### Default モード（強調表示）

| 変数 | 背景色 | 前景色 |
|---|---|---|
| Keyword1 | `#FF99FF` | `inherit` |
| Keyword2 | `#99FF99` | `inherit` |
| Keyword3 | `#FFFF99` | `inherit` |
| Keyword4 | `#99FFFF` | `inherit` |
| Keyword5 | `#FFCC99` | `inherit` |
| Keyword6 | `#FF9999` | `inherit` |

#### Subtle モード（控えめ表示）

| 変数 | 背景色 | 前景色 |
|---|---|---|
| Keyword1 | transparent | `#CC2222` |
| Keyword2 | transparent | `#229922` |
| Keyword3 | transparent | `#6666CC` |
| Keyword4 | transparent | `#0088FF` |
| Keyword5 | transparent | `#AA66AA` |
| Keyword6 | transparent | `#666666` |

#### None モード

全キーワードのスタイルなし（inherit/transparent）。

### 13.3. CSS変数

テーマ変更時に以下のCSS変数を `document.documentElement.style` に設定：

```css
--tt-base-color
--tt-title-bg
--tt-title-fg
--tt-editor-bg
--tt-editor-fg
--tt-keyword-bg
--tt-cursor-line-inactive
--tt-cursor-line-active1
--tt-cursor-line-active2
--tt-cursor-line-active3
--tt-column-header-bg
--tt-column-header-fg
--tt-list-item-bg
--tt-list-item-selected
--tt-border-color
--tt-splitter-trigger
```

---

## 14. サービス・ユーティリティ

### 14.1. KeywordHighlighter
- Monaco Editor のデコレーション API を使用
- キーワード欄の各行をハイライトキーワードとして登録
- カラーモード（Default/Subtle/None）に応じたスタイル適用
- 最大6キーワード、各キーワードに固有の配色

### 14.2. RequestLinkProvider
- Monaco Editor の `registerLinkProvider` を使用
- テキスト内の TTRequest.Determinant パターンにマッチするテキストをリンクとして表示
- クリック時に `Request.Invoke.Default` を呼び出し
- リンクの色、太字、下線はTTRequestの定義に従う

### 14.3. TouchGestureRecognizer
- Pointer Events API を使用
- ジェスチャー認識: TAP1, TAP2, LONGPRESS, SWIPE_LEFT/RIGHT/UP/DOWN
- 認識したジェスチャーを `Key` としてイベントシステムに送信
- タッチデバイス判定: `navigator.maxTouchPoints > 0`

### 14.4. markdownToHtml
- Markdown テキストを HTML に変換
- 対応要素: 見出し、段落、リスト、コードブロック、テーブル、リンク、画像、太字、斜体
- テーブル表示対応

### 14.5. CSV ユーティリティ
- `toCsv(objects, properties)`: オブジェクト配列をCSV文字列に変換
- `parseCsv(text)`: CSV文字列を2次元配列にパース（CRLF/LF対応、エスケープ対応）
- `parseCsvToObjects(text)`: ヘッダー付きCSVをオブジェクト配列にパース

### 14.6. 音声入力 (Web Speech API)
- `SpeechRecognition` API を使用
- 言語: 日本語 (`ja-JP`)
- 連続認識モード（`continuous: true`）
- 中間結果表示対応（`interimResults: true`）
- エラー時自動再起動

---

## 15. PWA 対応

### 15.1. Service Worker (`sw.js`)
- オフライン対応のためのキャッシュ戦略

### 15.2. Web App Manifest (`manifest.json`)
- アプリ名、アイコン、表示モード等の定義
- ホーム画面へのインストール対応

### 15.3. アイコン
- `/icons/icon-192.png` (192x192)

---

## 16. 拡張ポイント

本アプリケーションは以下のポイントで機能拡張が可能な設計となっている。

### 16.1. 新規パネルの追加
- `PanelName` 型に新しいパネル名を追加
- `PanelNames` 配列に追加
- `MainLayout.tsx` にレイアウト配置を追加
- `[Panels]` パターンで自動的に関連状態が登録される

### 16.2. 新規パネルモードの追加
- `PanelMode` 型に新しいモード名を追加
- `IPanelModeBehavior` インターフェースを実装する新しい Behavior クラスを作成
- `TTPanel` にモード切り替えロジックを追加

### 16.3. 新規アクションの追加
- `Controllers/Actions/` に新しいアクションファイルを作成
- `DefaultActions.ts` で `InitializeDefaultActions` に追加呼び出し
- 必要に応じて `DefaultEvents.ts` にキーバインド追加

### 16.4. 新規リクエストパターンの追加
- `DefaultRequests.ts` の `AddRequest` で新パターンを定義
- `Controllers/Actions/` に対応するアクションハンドラを追加

### 16.5. 新規状態変数の追加
- `Controllers/Status/` の適切なカテゴリファイルに `RegisterState` を追加
- `Apply` コールバックでビューへの反映ロジックを実装

### 16.6. 新規カラーテーマの追加
- `ColorTheme.ts` の `themes` Map に新テーマ定義を追加
- `Application.Appearance.ColorMode` の選択肢に追加

### 16.7. ストレージバックエンドの追加
- `IStorageService` インターフェースを実装
- `StorageManager` に新バックエンドを統合

### 16.8. 将来構想（未実装機能）
以下は README 等で言及されている将来的な拡張候補：

| 機能 | 説明 |
|---|---|
| **カレンダービュー** | 日/週/月単位のカレンダー表示（メモ、イベント、写真） |
| **タグ分類・タグ詳細** | メモ・イベントのタグベース分類と詳細表示 |
| **日記・週報** | 定期レポート生成機能 |
| **AIチャット統合** | Gemini/Claude/ChatGPT との対話機能（TTChats/TTChat） |
| **Google Photo連携** | 検索語でのPhoto検索・サムネイル表示 |
| **BQデータ管理** | Export/Import/クリア機能 |
| **VSCode連携** | VSCode Plugin としての開発の可能性 |

---

## 付録

### 付録A. 環境変数

| 変数名 | 説明 | 必須 |
|---|---|---|
| `PORT` | サーバーポート（デフォルト: 8080） | × |
| `APP_PASSWORD` | 認証パスワード（未設定時は認証なし） | × |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | GCPサービスアカウントキーJSON | ○ |

### 付録B. データフローまとめ

#### メモ読み込みフロー
```
TTMemos.LoadCache()
  → SyncWithBigQuery()
    → GET /api/bq/files (カテゴリ: Memo)
      → TTMemo オブジェクト生成/更新
        → TTMemo.LoadContent() (遅延)
          → GET /api/bq/files/:id
            → IsLoaded = true
```

#### メモ保存フロー
```
ユーザー編集
  → TTMemo.Content setter
    → NotifyUpdated()
      → SaveContent()
        → POST /api/bq/files (60秒デバウンス)
        → WebSocket sendContentUpdate()
          → 他タブ受信
            → applyRemoteUpdate()
```

#### キーボードイベントフロー
```
KeyDown
  → HandleKeyDown()
    → コンテキスト構築 (Panel-Mode-Tool-ExMode)
      → TTEvent マッチング (スコア計算)
        → TTAction.Invoke(context)
          → 戻り値で ExMode 継続/解除判定
```

### 付録C. ファイル保存パス規約

BigQuery パス形式: `{category}/{file_id}`

| カテゴリ | 用途 | 例 |
|---|---|---|
| `Memo` | メモデータ | `Memo/memo-20260316-123456` |
| `Cache` | コレクションキャッシュ（CSV形式） | `Cache/TTMemos` |
| `Config` | 設定データ | `Config/TTEditings` |

---

*本仕様書はプロジェクトのソースコード（`src/`, `server/`）に基づき作成された。*
*生成日: 2026-03-16*
