# Thinktank 実装プラン v2
**作成日**: 2026-04-18  
**ベース**: 20260402_Thinktank_Implementation_Plan.md を整理・再構成

---

## Context

多忙・高齢ユーザー向けの**記憶・思考・判断支援アプリ**を新規開発する。  
既存コード（React 18 + TypeScript + Vite + Monaco Editor + Express + BigQuery）のコンセプトを引き継ぎ、コードは全て新規に書く。

**準備**: 既存ソースを `reference2/` に退避し、プロジェクトルートから開始。

---

## 1. 目標

ユーザーの日々の入力（メモ・ファイル・写真・メール・AIとの会話）を全て記録・蓄積し、以下を実現する：

1. **記憶支援** - 「あの日何をした？」「あの件どうなった？」への想起補助
2. **思考支援** - 視点・材料の提示、概略説明の自動生成
3. **判断支援** - 意思決定のための構造化・過去類似判断の検索

---

## 2. アーキテクチャ概要

### コンポーネント階層

```
TTApplication（最上位コントローラ、最大3列を管理）
└── TTColumn[0..2]（各列）
     ├── DataGridPanel    - データ一覧（react-window 仮想スクロール）
     ├── TextEditorPanel  - テキスト編集（Monaco Editor）
     └── WebViewPanel     - Web表示 / Chat / Markdown / 検索
```

各パネルはタイトルバー内にツールバーを統合（DataGrid=フィルタ、TextEditor=ハイライト、WebView=アドレス/Chat）。

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | React 18 + TypeScript 5 + Vite 5 |
| エディタ | Monaco Editor (@monaco-editor/react) |
| 仮想リスト | react-window |
| Backend | Express 5 + Node.js + TypeScript |
| DB（クラウド）| Google BigQuery（単一テーブル + categoryクラスタリング） |
| DB（ローカル）| IndexedDB（オフラインキャッシュ） |
| リアルタイム同期 | WebSocket (ws) |
| 外部連携 | Google Drive / Gmail / Google Photos API |
| AI | Claude API（@anthropic-ai/sdk） |

### 主要設計方針

1. **Observerパターン** - TTObject基底クラスの `NotifyUpdated()` で状態変更を通知、Reactが購読
2. **TTCollectionによるデータ管理** - CRUD・CSV直列化・デバウンス自動保存
3. **単一BigQueryテーブル** - `thinktank.files` テーブルに全データを格納、`category` 列でクラスタリング
4. **デュアルライト** - IndexedDB即時保存（dirty=true）→ BigQuery非同期。オフライン時はダーティキューで再送
5. **WebSocket同期** - マルチタブ・マルチデバイス間のリアルタイム更新
6. **ID = 作成日時** - `yyyy-MM-dd-HHmmss` 形式、DBのプライマリキー
7. **WebView URL駆動** - `/view/markdown`, `/view/chat` 等のURLで表示内容を制御する自己完結型HTMLテンプレート

---

## 3. データモデル

### 基底クラス

**TTObject** - 全モデルの基底
```typescript
ID: string              // yyyy-MM-dd-HHmmss形式
Name: string            // 表示名
UpdateDate: string
// Observer: AddOnUpdate(), RemoveOnUpdate(), NotifyUpdated()
```

**TTCollection**（TTObject継承）- データコンテナ
```typescript
_children: Map<string, TTObject>
DatabaseID: string        // BigQueryカテゴリ名 / IndexedDBストア名
ItemSaveProperties: string[]
ColumnMapping: Record<string, string>
ColumnMaxWidth: Record<string, number>
// Add(), Remove(), Find(), Filter(), SaveCache(), LoadCache()
```

### データアイテム

**TTDataItem**（TTObject継承）- 統一コンテンツモデル
```typescript
ContentType: 'memo' | 'chat' | 'url' | 'file' | 'photo' | 'email' | 'drive'
Content: string
Keywords: string
CollectionID: string
RelatedIDs: string
```

**TTKnowledge**（TTCollection継承）- 複数カテゴリ統合コレクション  
MemoとChatを1つのDataGridに統合表示するためのコレクション。`SyncCategories` で複数カテゴリをBQから差分同期する。

### ビューモデル

**TTColumn**（TTObject継承）
```typescript
DataGridFilter: string       // フィルタ式
WebViewUrl: string           // 表示URL
ChatInput: string            // Chat入力
ChatMessages: ChatMessage[]  // チャット履歴
EditorResource: string       // 編集中アイテムID
SelectedItemID: string       // DataGrid選択行ID（自動でEditorResourceとWebViewUrlも更新）
HighlighterKeyword: string
FocusedPanel: 'DataGrid' | 'WebView' | 'TextEditor'
CheckedItemIDs: Set<string>  // DataGrid複数選択
VerticalRatios: number[]     // パネル高さ比率
```

### BigQueryスキーマ

```sql
CREATE TABLE `thinktank.files` (
  file_id     STRING    NOT NULL,
  title       STRING,
  file_type   STRING    NOT NULL,
  category    STRING,        -- クラスタリングキー
  content     STRING,
  keywords    STRING,
  related_ids STRING,
  metadata    JSON,
  size_bytes  INT64,
  is_deleted  BOOL      DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL,
  updated_at  TIMESTAMP NOT NULL
) CLUSTER BY category;
```

---

## 4. ディレクトリ構成

```
ThinktankWebCC/
├── reference/              # 二世代前のコード（参考）
├── reference2/             # 現行コードの退避（参考）
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── models/
│   │   ├── TTObject.ts
│   │   ├── TTCollection.ts
│   │   ├── TTDataItem.ts
│   │   ├── TTKnowledge.ts      # Memo+Chat統合コレクション
│   │   ├── TTModels.ts         # ルートシングルトン
│   │   ├── TTStatus.ts
│   │   ├── TTAction.ts
│   │   └── TTEvent.ts
│   ├── views/
│   │   ├── TTApplication.ts
│   │   ├── TTColumn.ts
│   │   └── helpers/
│   │       ├── DateHelper.ts
│   │       └── TagParser.ts
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── AppLayout.tsx + .css
│   │   │   └── Splitter.tsx + .css
│   │   ├── Column/
│   │   │   └── TTColumnView.tsx + .css
│   │   ├── DataGrid/
│   │   │   ├── DataGridPanel.tsx
│   │   │   ├── DataGrid.tsx + .css
│   │   ├── WebView/
│   │   │   ├── WebViewPanel.tsx + .css
│   │   │   ├── SearchView.tsx
│   │   │   └── RelatedView.tsx
│   │   ├── TextEditor/
│   │   │   └── TextEditorPanel.tsx + .css
│   │   └── UI/
│   │       ├── ContextMenu.tsx
│   │       └── CommandPalette.tsx
│   ├── services/
│   │   ├── storage/
│   │   │   ├── IStorageService.ts
│   │   │   ├── BigQueryStorageService.ts
│   │   │   ├── IndexedDBStorageService.ts
│   │   │   └── StorageManager.ts
│   │   └── sync/
│   │       ├── WebSocketService.ts
│   │       └── SyncManager.ts
│   ├── controllers/
│   │   ├── DefaultActions.ts
│   │   ├── DefaultEvents.ts
│   │   ├── DefaultStatus.ts
│   │   └── actions/
│   │       ├── ApplicationActions.ts
│   │       ├── DataGridActions.ts
│   │       ├── EditorActions.ts
│   │       └── WebViewActions.ts
│   ├── hooks/
│   │   └── useAppUpdate.ts
│   ├── utils/
│   │   ├── csv.ts
│   │   ├── markdownToHtml.ts
│   │   ├── editorHighlight.ts
│   │   ├── highlightSpans.tsx
│   │   └── webviewUrl.ts
│   ├── view-templates/
│   │   ├── markdown.html       # 自己完結型Markdownビューア
│   │   └── chat.html           # 自己完結型チャットUI
│   └── types/
│       └── index.ts
├── server/
│   ├── index.ts
│   ├── tsconfig.json
│   ├── wait-for-server.mjs     # Vite起動前にバックエンドの起動を待つ
│   ├── middleware/
│   │   └── authMiddleware.ts
│   ├── routes/
│   │   ├── bigqueryRoutes.ts
│   │   ├── chatRoutes.ts
│   │   ├── searchRoutes.ts
│   │   ├── relatedRoutes.ts
│   │   ├── fetchRoutes.ts      # URL内容取得プロキシ
│   │   ├── driveRoutes.ts
│   │   ├── gmailRoutes.ts
│   │   └── photosRoutes.ts
│   └── services/
│       ├── BigQueryService.ts
│       ├── ChatService.ts
│       ├── SearchService.ts
│       ├── RelatedService.ts
│       ├── DriveService.ts
│       ├── GmailService.ts
│       └── PhotosService.ts
└── ui-design/
    ├── events.tsv              # キーバインド定義（Excel編集）
    └── menus.tsv               # コンテキストメニュー定義（Excel編集）
```

---

## 5. 実装フェーズ

各フェーズは動作確認可能な中間成果物を生成する。

---

### Phase 1: プロジェクト初期化

**目標**: 空のVite + React + TypeScriptプロジェクトを構築する。

**作業**:
- 既存ソースを `reference2/` に退避
- Vite + React + TypeScript + Monaco Editor + react-window をセットアップ
- `vite.config.ts`, `tsconfig.json`, `index.html` を作成
- `src/main.tsx`, `src/App.tsx`, `src/index.css` の最小構成を作成

**検証**: `npm run dev` → ブラウザに「Thinktank」タイトルの空ページが表示される。

---

### Phase 2: データモデル基盤（TTObject・TTCollection）

**目標**: Observerパターンの基底クラスとコレクション管理クラスを実装する。

**新規作成**:
- `src/models/TTObject.ts` - Observer基盤（AddOnUpdate / RemoveOnUpdate / NotifyUpdated）
- `src/models/TTCollection.ts` - Map管理、CSV直列化、5秒デバウンス自動保存
- `src/utils/csv.ts` - CSV parse/stringify
- `src/types/index.ts` - 型定義

**検証**: コンソールでTTObject/TTCollectionのCRUDとObserver通知が動作する。

---

### Phase 3: アプリケーションモデル（TTDataItem・TTModels）

**目標**: 統一コンテンツモデルとアプリ全体のモデルルートを構築する。

**新規作成**:
- `src/models/TTDataItem.ts` - ContentType対応の統一データモデル
- `src/models/TTStatus.ts` - UI状態管理
- `src/models/TTAction.ts` - アクション定義
- `src/models/TTEvent.ts` - イベント定義
- `src/models/TTModels.ts` - ルートシングルトン（全コレクションを保持）

**検証**: TTModelsシングルトンからMemoコレクションにアイテムを追加・取得できる。

---

### Phase 4: ビューモデル（TTColumn・TTApplication）

**目標**: 列ベースのビューモデルとアプリケーションコントローラを実装する。

**新規作成**:
- `src/views/TTColumn.ts` - 列ビューモデル（フィルタ・URL・リソース・選択状態）
- `src/views/TTApplication.ts` - 最上位コントローラ（TTColumn[0..2]管理・初期化）
- `src/views/helpers/DateHelper.ts` - 日付ID生成ユーティリティ（yyyy-MM-dd-HHmmss）

**検証**: TTApplicationが3つのTTColumnを生成し、各ColumnのプロパティをObserverで監視できる。

---

### Phase 5: 3列レイアウトシェル

**目標**: 3列レイアウトのUI基盤を構築する。各列に3パネルのプレースホルダを配置し、Splitterによるリサイズを実装する。

**新規作成**:
- `src/components/Layout/AppLayout.tsx + .css` - 3列グリッド + ステータスバー（最下部固定）
- `src/components/Layout/Splitter.tsx + .css` - ドラッグリサイズ（列間・パネル間）
- `src/components/Column/TTColumnView.tsx + .css` - 列コンポーネント（3パネル積層）

**レイアウト仕様**:
- 各列は上から DataGridPanel → TextEditorPanel → WebViewPanel の順に積層
- 列間・パネル間のSplitterはゼロまで縮小可能（完全に隠せる）
- レスポンシブ: <768px=1列、<1200px=2列、>=1200px=3列
- 各パネルはタイトルバー内にツールバーを統合（タイトル行 + 入力フィールド）
- フォーカス中パネルに `●` マークを表示（アプリ全体で1つだけ）
- ステータスバー: `Column {N} | {フォーカスパネル名}` を表示

**検証**: 3列が横並びで表示。列間・パネル間のSplitterでリサイズ可能。フォーカス●が1つだけ表示。ステータスバーにフォーカス情報が出る。

---

### Phase 6: DataGridPanel（仮想スクロールテーブル）

**目標**: react-windowによる仮想スクロールテーブルを実装する。

**新規作成**:
- `src/components/DataGrid/DataGridPanel.tsx` - パネルコンテナ（Observer購読・フィルタ・選択管理）
- `src/components/DataGrid/DataGrid.tsx + .css` - react-window仮想スクロールテーブル

**仕様**:
- 列定義はTTCollectionのColumnMapping・ColumnMaxWidthから自動取得
- ヘッダクリックでソート切替（昇順/降順）
- 行クリックで選択 → `TTColumn.SelectedItemID` に反映
- フィルタ式: スペース区切り=AND、カンマ区切り=OR、`-`接頭辞=NOT
- 空状態時は「No items」表示

**検証**: テーブルにテストデータが表示・選択できる。ソートとフィルタが動作する。

---

### Phase 7: TextEditorPanel（Monaco Editor統合・パネル間連携）

**目標**: Monaco Editorによるテキスト編集パネルを実装し、DataGrid行選択でコンテンツをロードする。

**新規作成**:
- `src/components/TextEditor/TextEditorPanel.tsx + .css`

**仕様**:
- Monaco Editor設定: language=markdown、vs-darkテーマ、wordWrap=on、lineNumbers=off
- DataGrid行選択（`column.EditorResource`変更）でコンテンツをロード
- 編集内容はリアルタイムでTTDataItem.Contentに書き戻す
- DataGrid行タイトルを編集内容の先頭行から自動更新

**検証**: DataGridで行クリック→TextEditorに当該アイテムのMarkdownが表示・編集できる。

---

### Phase 8: WebViewPanel（iframe・Markdown・3パネルフルフロー）

**目標**: WebViewパネルを実装し、3パネル間の双方向連携を完成させる。

**新規作成**:
- `src/components/WebView/WebViewPanel.tsx + .css`
- `src/utils/markdownToHtml.ts` - Markdown→HTML変換（markedライブラリ使用）

**仕様**:
- アドレスバーに外部URLを入力するとiframeで表示
- DataGridでアイテム選択するとMarkdownプレビューを表示
- TextEditor編集→Markdownプレビュー即時反映
- Markdownリンク内の `filter:` / `item:` / `http(s)://` プロトコルでパネル間連携

**検証**: 3パネル間の連携が動作する（DataGrid選択→TextEditor編集→WebViewプレビュー反映）。

---

### Phase 9: バックエンド基盤（Express + BigQuery）

**目標**: REST APIサーバーとBigQueryストレージを構築する。

**新規作成**:
- `server/index.ts` - Express 5 + WebSocket(ws)サーバー（ポート8080）
- `server/tsconfig.json`
- `server/middleware/authMiddleware.ts` - HMAC-SHA256 Cookie認証（APP_PASSWORD環境変数）
- `server/services/BigQueryService.ts` - BigQueryアクセス層（MERGE文Upsert、concurrent update自動リトライ）
- `server/routes/bigqueryRoutes.ts` - CRUD API（60秒デバウンス書き込み、直列DMLキュー）

**APIエンドポイント**:
| メソッド | パス | 機能 |
|---------|------|------|
| GET | `/api/bq/files` | ファイル一覧（`?category=`, `?since=`） |
| GET | `/api/bq/files/:id` | 単一ファイル取得 |
| POST | `/api/bq/files` | ファイル保存（Upsert） |
| DELETE | `/api/bq/files/:id` | ファイル削除 |
| GET | `/api/bq/ttsearch?q=` | 全文検索（CONTAINS_SUBSTR） |
| GET | `/api/bq/versions` | バージョン情報（file_id + updated_at） |
| GET | `/api/bq/all` | 全データ取得 |
| POST | `/api/bq/bulk` | 一括保存 |

**重要**: 既存BigQueryデータは削除しない。DROP/TRUNCATE禁止。テーブルが存在しない場合のみ作成する。

**検証**: `GET /api/bq/files` でBigQueryからデータ取得。POST/DELETEも動作する。

---

### Phase 10: ストレージ・同期基盤（IndexedDB + WebSocket）

**目標**: フロントエンドのストレージ抽象化、IndexedDBオフラインキャッシュ、WebSocket同期を実装する。

**新規作成**:
- `src/services/storage/IStorageService.ts` - ストレージインターフェース（FileRecord型、`_dirty`フラグ）
- `src/services/storage/BigQueryStorageService.ts` - REST API経由のBigQueryアクセス
- `src/services/storage/IndexedDBStorageService.ts` - IndexedDBローカルキャッシュ（DB名`thinktank`、`files`ストア）
- `src/services/storage/StorageManager.ts` - デュアルライト管理
- `src/services/sync/WebSocketService.ts` - WS接続・指数バックオフ自動再接続
- `src/services/sync/SyncManager.ts` - リアルタイム同期制御

**オフライン同期**:
- BQ送信失敗時はIndexedDBに `_dirty=true` で保持
- 次回接続時に `flushDirtyQueue()` でリトライ
- ローカル/リモートの `updated_at` を比較して「新しい方が勝つ」マージ

**起動フロー**:
1. `storageManager.initialize()`
2. `Knowledge.LoadCache()` → IndexedDB + BQ差分同期
3. `syncManager.start()` → WebSocket接続

**検証**: アイテム保存→IndexedDBとBigQueryの両方に書き込まれる。別タブで変更がリアルタイム反映される。

---

### Phase 11: WebView URL駆動アーキテクチャ

**目標**: WebViewをURL駆動に変更する。`/view/markdown` でIndexedDBからMarkdownを取得→HTML変換→表示する自己完結型テンプレートを実装する。

**新規作成**:
- `src/view-templates/markdown.html` - 自己完結型HTMLテンプレート。URLパラメータからIndexedDBを参照しMarkdown→HTML変換して表示。iframeと別タブの両方で動作
- `src/utils/webviewUrl.ts` - URL生成・解析ユーティリティ（`buildMarkdownUrl()`, `buildChatUrl()`, `isExternalUrl()` 等）

**修正**:
- `vite.config.ts` - `/view/markdown` リクエストにテンプレートHTMLを返すViteプラグイン追加。`/api`, `/ws` はlocalhost:8080にプロキシ
- `src/views/TTColumn.ts` - `SelectedItemID` セッターで `buildMarkdownUrl()` を使い `WebViewUrl` を設定
- `src/components/Column/TTColumnView.tsx` - `↗` ボタンで同じURLをブラウザ新タブで開く

**URL設計**:
```
/view/markdown?category=memos&id={id}   ← Markdownプレビュー
/view/chat?session={id}                  ← チャットUI
/view/search?q={keyword}                 ← 検索結果（将来）
/view/related?id={id}                    ← 関連コンテンツ（将来）
```

**検証**: DataGridでアイテム選択→WebViewにMarkdown表示。↗ボタンでブラウザ別タブでも表示できる。

---

### Phase 12: AIチャットバックエンドAPI

**目標**: Claude APIを使ったSSEストリーミングチャットAPIをバックエンドに実装する。

**新規作成**:
- `server/services/ChatService.ts` - Anthropic SDK（@anthropic-ai/sdk）ラッパー。SSEストリーミング応答
- `server/routes/chatRoutes.ts` - `POST /api/chat/:sessionId/messages`

**環境変数** (`server/.env`):
- `ANTHROPIC_API_KEY` - Claude APIキー（必須）
- `ANTHROPIC_MODEL` - モデル名（デフォルト `claude-sonnet-4-6`）

**注意**: `dotenv` は `override: true` で読み込む（システム環境変数に空値がある場合の上書き対策）。

**検証**: `POST /api/chat/:sessionId/messages` にメッセージを送信→SSEでAI応答が逐次返される。

---

### Phase 13: チャットUI（WebViewテンプレート）

**目標**: `/view/chat` で表示する自己完結型チャットUIテンプレートを実装する。

**新規作成**:
- `src/view-templates/chat.html` - 自己完結型チャットUI

**仕様**:
- メッセージ一覧（スクロール可能）＋テキスト入力欄＋送信ボタン
- AI応答にMarkdown変換を適用
- `fetch` + `ReadableStream` でSSEをリアルタイム描画（ストリーミングカーソルアニメーション付き）
- 会話履歴をIndexedDBに保存（file_type='chat', category='chats'）
- URLパラメータ `session` なしの場合は新規セッションIDを自動生成
- Enter送信 / Shift+Enter改行

**修正**:
- `vite.config.ts` - `/view/chat` リクエストへのルーティング追加

**検証**: `/view/chat` にアクセス→チャットUI表示→メッセージ送信→AIがストリーミング応答→履歴がIndexedDBに保存される。

---

### Phase 14: DataGrid複数選択とコンテキストチャット起動

**目標**: DataGridにチェックボックス列を追加し、選択アイテムをAIチャットのコンテキストとして起動する機能を実装する。

**修正**:
- `src/views/TTColumn.ts` - `CheckedItemIDs: Set<string>` とチェック操作メソッドを追加。`buildChatContext()` でチェック済みアイテムの内容をまとめてコンテキスト情報を返す
- `src/components/DataGrid/DataGrid.tsx` - チェックボックス列追加（ヘッダに全選択/全解除、各行に個別チェック）
- `src/components/Column/TTColumnView.tsx` - DataGridツールバーに💬ボタン追加（チェック数付き）。TextEditorツールバーに💬ボタン追加（選択行数付き）。チャット起動時はセッションIDを生成→コンテキストをIndexedDBに一時保存→WebViewUrlに `/view/chat?session={id}` をセット

**検証**: DataGridで複数アイテムをチェック→💬ボタンでチャット起動→WebViewにチャットUI表示。TextEditorでテキスト選択→💬でチャット起動できる。

---

### Phase 15: チャットコンテキスト統合とメモ保存

**目標**: チャットUIがコンテキスト情報を表示し、会話をメモとして保存する機能を実装する。

**新規作成**:
- `server/routes/fetchRoutes.ts` - `POST /api/fetch-urls`（URL内容取得プロキシ、最大10URL）

**修正**:
- `src/view-templates/chat.html` - コンテキストバー（IndexedDBから読み込み、アイテム一覧・URL自動検出表示）。システムプロンプトにコンテキスト内容を組み込む。「メモに保存」ボタン（会話をMarkdown形式でメモとして保存）。保存後に `window.parent.postMessage` で親ウィンドウに通知
- `src/components/WebView/WebViewPanel.tsx` - `thinktank-item-saved` メッセージをリッスン→DataGridに即反映
- `src/models/TTCollection.ts` - `AddOrUpdateFromRecord()` メソッド追加

**検証**: チャットUIにコンテキストアイテム一覧が表示される。「メモに保存」→新規メモがDataGridに即反映される。

---

### Phase 16: データ差分同期と起動フロー

**目標**: BigQueryとの起動時差分同期と、バックエンド→フロントエンドの順序保証された起動フローを実装する。

**修正**:
- `server/services/BigQueryService.ts` - `getVersions(category?)`, `getFilesByIds(fileIds, category?)` を追加
- `server/routes/bigqueryRoutes.ts` - `GET /api/bq/versions?category=`, `POST /api/bq/fetch-by-ids` を追加
- `src/services/storage/StorageManager.ts` - `syncCategory(localCategory, remoteCategory?)` を追加。差分同期アルゴリズム: BQのバージョン情報（file_id + updated_at）のみ先にフェッチ→差分IDのみcontent付きフェッチ
- `package.json` - `concurrently` を使いバックエンド起動確認後にViteを起動する `dev` スクリプト
- `server/wait-for-server.mjs` - バックエンドの起動完了をポーリングで待つヘルパー

**検証**: 初回起動でBQからデータを差分同期。2回目以降は差分のみ取得。`npm run dev` 1コマンドで正しい順序で起動できる。

---

### Phase 17: TTKnowledge統合コレクション

**目標**: MemoとChatを1つのDataGridに統合表示するTTKnowledgeコレクションを実装する。チャット保存をBigQueryにも書き込む。

**新規作成**:
- `src/models/TTKnowledge.ts` - TTCollectionを継承した統合コレクション。`SyncCategories` で複数カテゴリを集約

**修正**:
- `src/models/TTModels.ts` - `Memos` + `Chats` → `Knowledge`（TTKnowledge）に統合
- `src/models/TTCollection.ts` - `recordToItem()` でchatsのタイトルをJSONでなくユーザー発言先頭40文字から生成。`file_type='md'`/`'text'` を `'memo'` に正規化
- `src/view-templates/chat.html` - IndexedDB保存と同時にBQ（`POST /api/bq/files`）にも保存
- `src/views/TTColumn.ts` - DataGridでchatアイテム選択時は `/view/chat?session={id}` をWebViewUrlに設定

**検証**: DataGridにMemoとChatが混在表示される。チャットデータがBQに永続化される。DataGridでchatをクリック→チャットUI復元表示。

---

### Phase 18: TextEditorタグシステム

**目標**: TextEditor内の各種クリッカブルタグを実装する。

**新規作成**:
- `src/views/helpers/TagParser.ts` - タグパターン定義・解析
- `src/services/TagLinkProvider.ts` - Monaco用リンクプロバイダ

**タグ一覧**:
| タグ | 動作 |
|------|------|
| `[Memo:yyyy-MM-dd-HHmmss]` | 当該メモへナビゲート |
| `[Chat:yyyy-MM-dd-HHmmss]` | チャットセッションを開く |
| `[File:yyyy-MM-dd-HHmmss]` | ファイルリンクを開く |
| URL（`https://...`） | WebViewで表示 |
| `[yyyy-MM-dd]` | DataGridに日付フィルタを設定 |
| `[search:キーワード]` | Web検索実行 |
| `[msearch:キーワード]` | メモ全文検索 |
| `[csearch:キーワード]` | チャット全文検索 |

**検証**: エディタ内の各タグが色付き・クリッカブル。クリックで対応アクションが実行される。

---

### Phase 19: TextEditorハイライト・Folding・テーマ

**目標**: Monacoカスタムトークナイザによる見出し色分け、Folding、ビジュアルテーマを実装する。

**新規作成**:
- `src/services/ColorTheme.ts` - `DefaultDark` / `DefaultOriginal` テーマ定義。CSS変数をdocumentに適用

**修正**:
- `src/components/TextEditor/TextEditorPanel.tsx` - `tt-markdown` カスタム言語・Monarchトークナイザを登録（H1-H6を6色で色分け）。見出しスタックアルゴリズムによるFoldingRangeProviderを登録。テーマ切替に対応
- `src/utils/editorHighlight.ts` - キーワードハイライト（スペース区切り=AND色グループ、カンマ区切り=別色グループ）。カーソル位置ワードの自動ハイライト

**検証**: Markdown見出しがH1-H6で色分け表示。セクションFold/Unfold動作。テーマ切替で全体のカラースキームが変わる。キーワードハイライトが動作する。

---

### Phase 20: ハイライト適用範囲の拡大

**目標**: TextEditor以外のUI領域（DataGrid・WebView・パネルタイトル）にもキーワードハイライトを適用できるようにする。

**新規作成**:
- `src/utils/highlightSpans.tsx` - テキスト内キーワードをReactNodeに変換する `highlightTextSpans()`。iframeのDOM内テキストノードにハイライトを適用する `applyIframeHighlight()`

**修正**:
- `src/views/TTColumn.ts` - `HighlightTargets`（panelTitle / dataGrid / webView / dataGridToolbar / webViewToolbar の5フラグ）を追加
- `src/components/DataGrid/DataGrid.tsx` - `highlightKeyword` prop 対応
- `src/components/WebView/WebViewPanel.tsx` - iframeロード後にハイライトを適用
- `src/components/Column/TTColumnView.tsx` - TextEditorツールバーに5つのハイライト対象トグルボタン [T][G][W][F][A] を追加

**検証**: ハイライトキーワード設定後、各トグルをONにすると対応箇所がハイライトされる。WebViewロード後も自動適用される。

---

### Phase 21: DataGrid表示モードとパネルタイトル改善

**目標**: DataGridタイトルバーに「表示件数/全件数」を表示し、TextEditorタイトルバーを編集中アイテムのメタ情報表示に改善する。

**修正**:
- `src/views/TTColumn.ts` - `GetDisplayItemCount()`, `GetTotalItemCount()` メソッド追加
- `src/components/Column/TTColumnView.tsx`
  - DataGridタイトル: `All (表示数/総数)` 形式でリアルタイム更新
  - TextEditorタイトル: `{ContentType} | {ID} | {Name}` 形式（未選択時はフォーカス●のみ）

**検証**: フィルタ入力でDataGridタイトルの件数がリアルタイム更新される。TextEditorタイトルにアイテムのメタ情報が反映される。

---

### Phase 22: WebViewパネルChatモード（CLI風チャット）

**目標**: WebViewパネルを常時ChatモードとしてリデザインしCLI風チャットUIを実装する。アドレスバーをChatバーに改名し、URLを開く機能は維持する。

**修正**:
- `src/views/TTColumn.ts` - `ChatMessages`, `ChatInput`, `ChatSessionId` プロパティを追加。`addChatMessage()`, `updateLastAssistantMessage()` メソッドを追加
- `src/components/Column/TTColumnView.tsx` - WebViewツールバーをChatバーに変更（プレースホルダを `Chat...` に）。Enter押下でSSEストリーミングチャットを実行。タイトルに最後のユーザー発言を表示
- `src/components/WebView/WebViewPanel.tsx` - ChatCliViewコンポーネントを追加。外部URLや `/view/markdown` URLのときはiframe表示、それ以外はChatCliViewを表示

**Chat UI仕様**:
- ユーザー発言: `> {text}` 形式
- アシスタント応答: ストリーミング表示（末尾カーソル点滅）

**検証**: Chatバーにメッセージ入力→Enter→AIがストリーミング応答。URLを入力するとiframeで表示される。

---

### Phase 23: 全文検索

**目標**: メモ・チャット横断の全文検索をWebViewに表示する。

**新規作成**:
- `src/components/WebView/SearchView.tsx` - 検索結果UI
- `server/routes/searchRoutes.ts` + `server/services/SearchService.ts` - BigQuery全文検索API

**検証**: WebViewアドレスバーに `search:キーワード` → 結果一覧表示。クリックでアイテムにナビゲートできる。

---

### Phase 24: 関連コンテンツ発見

**目標**: 選択メモ/チャットに基づく関連アイテム一覧を表示する。

**新規作成**:
- `src/components/WebView/RelatedView.tsx` - 関連コンテンツUI
- `server/routes/relatedRoutes.ts` + `server/services/RelatedService.ts` - キーワード重複度 + 日付近接性による関連度計算

**検証**: メモ選択→関連コンテンツ表示。同日のアイテムも集約される。

---

### Phase 25: アクション・状態管理基盤

**目標**: コンテキストベースのアクション管理とReactとの接続を構築する。

**設計方針**:
- コンテキスト文字列: `{ColumnType}-{PanelType}-{PanelTool}-{Status}` 形式
- Action → TTApplication → TTColumn の経路のみ（ReactコンポーネントへのAction直接参照禁止）

**新規作成**:
- `src/hooks/useAppUpdate.ts` - TTObjectのObserverをReact useReducerに接続する購読フック
- `src/controllers/DefaultStatus.ts` - アプリ全体の初期状態を登録
- `src/controllers/DefaultActions.ts` - アクション初期化エントリポイント
- `src/controllers/actions/ApplicationActions.ts` - 列ナビゲーション・フォーカス操作
- `src/controllers/actions/DataGridActions.ts` - DataGrid操作（選択・削除・チェック等）
- `src/controllers/actions/EditorActions.ts` - TextEditor操作
- `src/controllers/actions/WebViewActions.ts` - WebView・Chat操作

**修正**:
- `src/views/TTApplication.ts` - `DispatchAction(id, context)` メソッド実装。`GetContext()` でコンテキスト文字列を生成

**検証**: `TTModels.Instance.Actions.GetItem('DataGrid.Item.Selected.Remove')?.Invoke()` でアイテムが削除される。

---

### Phase 26: イベントシステム（キーボードショートカット）

**目標**: キーイベントを統一ディスパッチルーチンで処理し、コンテキストに応じてActionに繋ぐ。TSVファイルによるキーバインド定義を実装する。

**新規作成**:
- `src/controllers/DefaultEvents.ts` - イベントバインディング初期化
- `ui-design/events.tsv` - キーバインド設計（Excel編集対象）
- `scripts/codegen-ui.ts` - TSV → TypeScript コード自動生成スクリプト

**TSVフォーマット**:
```tsv
# Context    Mods          Key     ActionID                      Comment
*-*-*-*      Control       Tab     Application.Column.FocusNext  次の列
*-DataGrid-Main-*          Delete  DataGrid.Item.Selected.Remove 選択削除
*-TextEditor-Main-*  Control  S   TextEditor.Item.Save          保存
*-*-*-*      Control       P       Application.CommandPalette.Show コマンドパレット
```

**修正**:
- `src/models/TTEvent.ts` - `TTEvents.Dispatch(type, e)` 統一ディスパッチメソッド追加（印字文字の高速スルー、コンテキストベースのActionルックアップ）
- `src/components/Layout/AppLayout.tsx` - グローバルkeydownリスナー登録
- `package.json` - `codegen-ui` スクリプト追加

**検証**: DataGridにフォーカスした状態でDeleteキー→選択アイテムが削除される。TextEditor使用中は通常文字入力が阻害されない。TSVに1行追加→codegen実行→即有効になる。

---

### Phase 27: コンテキストメニューとコマンドパレット

**目標**: 右クリックメニューとコマンドパレットを実装する。

**新規作成**:
- `src/components/UI/ContextMenu.tsx` - コンテキストメニューコンポーネント
- `src/components/UI/CommandPalette.tsx` - コマンドパレットコンポーネント
- `ui-design/menus.tsv` - コンテキストメニュー定義（Excel編集対象）

**修正**:
- `src/views/TTApplication.ts` - `ShowContextMenu()`, `ShowCommandPalette()` メソッド追加
- `src/components/Layout/AppLayout.tsx` - ContextMenu・CommandPaletteを描画

**検証**: DataGrid右クリック→コンテキストメニュー表示・操作できる。Ctrl+P→コマンドパレット表示。

---

### Phase 28: レスポンシブ/モバイル対応

**目標**: スマホ1列・タブレット2列対応。スワイプ・ボトムナビを実装する。

**新規作成**:
- `src/components/Layout/MobileNav.tsx + .css` - ボトムナビ（音声入力・削除・ペースト・コピー）

**修正**:
- `src/components/Layout/AppLayout.tsx + .css` - メディアクエリで列数を制御
- `src/views/TTApplication.ts` - 列表示制御

| デバイス | 列数 | パネル遷移 |
|---------|------|-----------|
| スマホ | 1列 | スワイプでDataGrid↔WebView↔TextEditor |
| タブレット(縦) | 2列 | スワイプで列組み合わせ切替 |
| デスクトップ | 3列 | 常時全表示 |

**検証**: ブラウザリサイズで列数が自動変更される。スワイプ動作とボトムナビが機能する。

---

### Phase 29: ファイルD&D + Google Drive連携

**目標**: ドロップファイルをGoogle Driveの `yyyy-mm-dd` フォルダに保存し、タグをメモに自動挿入する。

**新規作成**:
- `server/routes/driveRoutes.ts` + `server/services/DriveService.ts` - Google Drive API操作
- `src/services/FileUploadService.ts` - アップロード制御

**修正**:
- `src/components/TextEditor/TextEditorPanel.tsx`, `src/components/DataGrid/DataGridPanel.tsx` - ドロップゾーン追加

**検証**: ファイルD&D→Google Driveにアップロード→`[File:ID]`タグが自動挿入される。

---

### Phase 30: Gmail連携

**目標**: 規定タイトルのGmailアイテムをアプリ内で閲覧・作成・管理する。

**新規作成**:
- `server/routes/gmailRoutes.ts` + `server/services/GmailService.ts`
- `src/components/WebView/EmailView.tsx`

**検証**: WebViewでGmail受信箱（特定タイトル）を表示。メモからメール作成・送信できる。

---

### Phase 31: Google Photos連携

**目標**: 写真のリンク管理と表示を実装する。

**新規作成**:
- `server/routes/photosRoutes.ts` + `server/services/PhotosService.ts`
- `src/components/WebView/PhotoView.tsx`

**検証**: Google Photos閲覧。写真参照タグをメモに挿入。タグクリックで全画面表示。

---

### Phase 32: 記憶支援機能

**目標**: 日付ベースの想起支援。「あの日何をした？」への回答とタイムライン表示。

**新規作成**:
- `src/components/WebView/TimelineView.tsx` - タイムライン表示

**修正**:
- `server/services/ChatService.ts` - 記憶拡張プロンプト（日付範囲クエリ連携）
- `server/services/SearchService.ts` - 日付範囲クエリ対応

**検証**: チャットで「先週の火曜日何をした？」→当該日のメモ・活動一覧を含むAI応答が返される。

---

### Phase 33: 思考支援機能

**目標**: 視点・材料の提示と概略説明の自動生成。

**修正**:
- `server/services/ChatService.ts` - 思考支援プロンプトテンプレート（要約・多角的視点・関連素材収集）

**検証**: メモ選択→「視点を提示」→AIが複数観点と根拠を提示する。

---

### Phase 34: 判断支援機能

**目標**: 意思決定の構造化支援。

**新規作成**:
- `src/components/WebView/DecisionView.tsx` - 構造化判断表示

**修正**:
- `server/services/ChatService.ts` - 判断支援プロンプト（メリット/デメリット/基準の構造化）

**検証**: 判断メモ→「分析」→構造化メリデメ・推奨が表示される。

---

### Phase 35: 状態永続化・列間同期

**目標**: アプリ状態のフル保存/復元と、列間のデータ同期を実装する。

**修正**:
- `src/views/TTColumn.ts` - 列状態のシリアライズ/復元（列幅・パネル比率・フィルタ・URL等をlocalStorageに保存）
- `src/views/TTApplication.ts` - 全体状態Save/Restore
- `src/services/sync/SyncManager.ts` - 列間変更伝播

**検証**: 列設定→ブラウザ閉→再開で状態が復元される。列0で編集→列2のDataGridに即反映される。

---

## 6. ユーザーフロー

```
DataGrid（エントリー選択）
    │
    ├──→ WebView（Chat / 関連コンテンツ / Markdownプレビュー）
    │       │
    │       └──→ TextEditor（メモ作成・編集）
    │                │
    │                ├── [Memo:ID]クリック → DataGridにナビゲート
    │                ├── [yyyy-MM-dd]クリック → DataGridに日付フィルタ
    │                ├── URL → WebViewで表示
    │                └── 保存 → DataGrid更新
    │
    └──→ TextEditor（直接編集）
```

各パネル間を遷移する中で異なるデータセット・視点に触れ、記憶の活性化を自然に促す設計。

---

## 7. マイルストーン

| マイルストーン | 完了フェーズ |
|--------------|-------------|
| プロジェクト起動・空ページ表示 | Phase 1 |
| 3列×3パネルのレイアウト表示 | Phase 5 |
| 3パネル間の基本インタラクション | Phase 8 |
| バックエンド接続・データ永続化 | Phase 10 |
| WebView URL駆動 | Phase 11 |
| AIチャット動作 | Phase 13 |
| チャット-メモ統合 | Phase 15 |
| タグ・ハイライト・Folding | Phase 19 |
| CLI風チャットモード | Phase 22 |
| 全文検索・関連発見 | Phase 24 |
| ショートカット・コマンドパレット | Phase 27 |
| モバイル対応 | Phase 28 |
| 外部連携（Drive / Gmail / Photos） | Phase 31 |
| 記憶・思考・判断支援 | Phase 34 |
| フルアプリ完成 | Phase 35 |

---

## 8. 起動方法

```bash
# フロントエンド + バックエンド同時起動（バックエンド起動確認後にViteを起動）
npm run dev

# バックエンドのみ
npm run server:dev

# ビルド確認
npm run build
```

各フェーズの「検証」項目をブラウザ上で手動確認する。

---

## 9. フェーズ追加ガイドライン

### 依存関係

```
Phase 1-4:  基盤層（全ての土台）
Phase 5-8:  UI + パネル間連携
Phase 9-10: バックエンド + ストレージ（Phase 11以降の前提）
Phase 11:   WebView URL駆動（Phase 13,23,24の前提）
Phase 12-13: チャット基盤（Phase 14-17,32-34の前提）
Phase 25-27: アクション・イベント管理（Phase 28の前提）
```

### アイデアの規模別対処

| 規模 | 例 | 対処 |
|------|-----|------|
| 小 | 新タグ種類・UIの微調整 | 現在のフェーズに含める |
| 中 | 新WebView画面・新API | 独立した新フェーズとして挿入 |
| 大 | アーキテクチャ変更 | プラン全体の再検討 |

**原則**: 各フェーズ完了時点で必ず動作確認し、動作する中間成果物の上に機能を足すこと。
