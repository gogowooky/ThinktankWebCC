# Thinktank 0ベース再構築 実装プラン
**作成日**: 2026-04-02
**ステータス**: 承認済み

---

## Context

多忙・高齢ユーザー向けの**記憶・思考・判断支援アプリ**を0ベースで新規開発する。
既存のThinktankWebCC（React 18 + TypeScript + Vite + Monaco Editor + Express + BigQuery）のコンセプト・設計思想を参考にしつつ、コードは全て新規に書く。

**準備作業**: 既存の全ソースコードを `reference2/` に移動し、`reference/`（二世代前）と並べて参考資料とする。プロジェクトルートは空の状態から開始。

### 参考資料の配置

```
ThinktankWebCC/
├── reference/          # 二世代前のコード（既存・維持）
│   ├── script/         # PowerShellベースWPF版
│   ├── thinktank.md
│   └── ...
├── reference2/         # 現行コード（既存ソース全体を移動）
│   ├── src/            # Reactフロントエンド
│   ├── server/         # Expressバックエンド
│   ├── server.js
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── scripts/        # 運用スクリプト群
│   ├── docs/
│   └── ...
└── (新規プロジェクトをここに構築)
```

---

## 1. 目標

ユーザーは日々メモ、ファイル作成、写真撮影、メール、AIとの会話等を行う。その**全入力を記録**し、蓄積データを基に：

1. **記憶支援** - 想起補助（「あの日何をしたか？」「あの件どうなった？」）
2. **思考支援** - 視点・材料の提示、概略説明の自動生成
3. **判断支援** - 意思決定のための構造化・過去類似判断の検索

ユーザーの**秘書・伴走者**として機能するWebアプリを構築する。

---

## 2. アーキテクチャ概要

### 2.1 コンポーネント階層

```
TTApplication (最上位コントローラ / 最大3列を制御)
├── TTColumn[0] ─┐
├── TTColumn[1] ─┼─ 横並び最大3列
└── TTColumn[2] ─┘
     各TTColumn（縦に3パネル積層）:
     ├── DataGridPanel
     │    ├── DataGridFilter  (1行TextBox: AND/OR/NOT フィルタ式)
     │    └── DataGrid        (仮想スクロールテーブル: ID + タイトル)
     ├── WebViewPanel
     │    ├── WebViewAddrBar  (1行TextBox: URL/プロトコル入力)
     │    └── WebView         (iframe / ChatView / SearchView / EmailView 等)
     └── TextEditorPanel
          ├── TextEditorHighlighter (1行エディタ: ハイライトキーワード入力)
          └── TextEditor            (Monaco Editor: タグ・リンク・Folding対応)
```

TTColumnはマルチモーダル（テーブル・Web・テキスト）な閲覧・編集環境を1列で提供し、最大3列を並べることで複数のデータセットを同時に操作できる。

### 2.2 技術スタック

| レイヤー | 技術 | 備考 |
|---------|------|------|
| Frontend | React 18 + TypeScript 5 + Vite 5 | SPA |
| エディタ | Monaco Editor (@monaco-editor/react) | テキスト編集・タグ・Folding |
| 仮想リスト | react-window | DataGrid高速描画 |
| Backend | Express 5 + Node.js + TypeScript | REST API + WebSocket |
| DB (クラウド) | Google BigQuery | コレクション毎にテーブル分離 |
| DB (ローカル) | IndexedDB | オフラインキャッシュ |
| リアルタイム同期 | WebSocket (ws) | マルチタブ・マルチデバイス |
| 外部連携 | Google Drive / Gmail / Google Photos API | googleapis |
| AI | Claude API or Gemini API | チャット・支援機能 |
| 文字コード | chardet + iconv-lite | 多様なファイル読込 |

### 2.3 主要設計方針

1. **Observerパターンによる反応性** - TTObject基底クラスの`NotifyUpdated()`で状態変更を通知、Reactコンポーネントが購読
2. **TTCollectionによるデータ管理** - 子要素の追加・削除・検索・CSV直列化、5秒デバウンスの自動保存
3. **コレクション毎のDB分離** - 各TTCollectionが独自のBigQueryテーブル/IndexedDBストアを持つ
4. **チャットはメモと分離管理** - TTChatSession/TTChatMessageを専用モデル・専用コレクションで管理
5. **ID = 作成日時** - `yyyy-MM-dd-HHmmss`形式のID。データベースのプライマリキー

---

## 3. データモデル

### 3.1 基底クラス

**TTObject** - 全モデルの基底
```typescript
ID: string              // 識別子
Name: string            // 表示名
UpdateDate: string      // 最終更新日時
_parent: TTObject | null
// Observer: AddOnUpdate(), RemoveOnUpdate(), NotifyUpdated()
```

**TTCollection** - データコンテナ（TTObject継承）
```typescript
_children: Map<string, TTObject>
DatabaseID: string       // BigQueryテーブル名 / IndexedDBストア名
ItemSaveProperties: string[]  // CSV保存対象プロパティ
ColumnMapping: Record<string, string>  // 表示列名マッピング
ColumnMaxWidth: Record<string, number> // 列幅制約
// メソッド: Add(), Remove(), Find(), Filter(), SaveCache(), LoadCache()
```

### 3.2 データアイテム

**TTDataItem** (TTObject継承) - 統一コンテンツモデル
```typescript
ContentType: 'memo' | 'chat' | 'url' | 'file' | 'photo' | 'email' | 'drive'
Content: string         // 本体（テキスト / JSON / リンクURL）
Keywords: string        // 検索用キーワード
CollectionID: string    // 所属コレクション
RelatedIDs: string      // 関連アイテムID群（カンマ区切り）
IsLoaded: boolean       // 非同期ロード状態
```

**TTChatSession** (TTObject継承) - チャットセッション
```typescript
KeyMemoID: string              // 関連メモID
Messages: TTChatMessage[]      // ContentにJSON格納
```

**TTChatMessage** - チャットメッセージ（セッション内）
```typescript
Role: 'user' | 'assistant' | 'system'
Content: string
Model: string           // 使用AIモデル名
Timestamp: string
```

### 3.3 ビューモデル

**TTColumn** (TTObject継承)
```typescript
DataGridFilter: string   // フィルタ式
WebViewUrl: string       // 表示URL/プロトコル
EditorResource: string   // 編集中アイテムID
SelectedItemID: string   // DataGrid選択行ID
IsVisible: boolean       // レスポンシブ表示制御
VerticalRatios: number[] // パネル高さ比率
```

### 3.4 各パネルでのデータ表示

| パネル | 表示形式 | 例 |
|--------|---------|-----|
| DataGrid | ID + タイトル行 | `2026-04-02-093000  朝のメモ` |
| TextEditor | タグ表記 | `[Memo:2026-04-02-093000]` `[File:2026-04-02-093000]` |
| WebView | クリッカブルタイトル | クリック可能な「朝のメモ」(IDをdata属性に保持) |

### 3.5 BigQueryスキーマ（コレクション毎に1テーブル）

```sql
CREATE TABLE `{dataset}.{collection_id}` (
  file_id     STRING    NOT NULL,   -- ID (yyyy-MM-dd-HHmmss)
  title       STRING,               -- 表示タイトル
  file_type   STRING    NOT NULL,   -- ContentType
  category    STRING,               -- カテゴリ/タグ
  content     STRING,               -- 本体テキスト
  keywords    STRING,               -- 検索キーワード
  related_ids STRING,               -- 関連ID群
  metadata    JSON,                 -- 拡張メタデータ
  size_bytes  INT64,
  is_deleted  BOOL      DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL,
  updated_at  TIMESTAMP NOT NULL
);
```

---

## 4. ディレクトリ構成（新規）

```
ThinktankWebCC/
├── reference/              # 二世代前のコード（参考）
├── reference2/             # 現行コードの退避（参考）
├── index.html              # Viteエントリ
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
├── public/
│   ├── favicon.svg
│   ├── manifest.json
│   └── sw.js
├── src/
│   ├── main.tsx            # エントリポイント
│   ├── App.tsx             # ルートコンポーネント
│   ├── index.css           # グローバルスタイル
│   ├── vite-env.d.ts
│   ├── models/             # データモデル
│   │   ├── TTObject.ts
│   │   ├── TTCollection.ts
│   │   ├── TTDataItem.ts
│   │   ├── TTChatSession.ts
│   │   ├── TTChatMessage.ts
│   │   ├── TTModels.ts     # ルートシングルトン
│   │   ├── TTStatus.ts
│   │   ├── TTAction.ts
│   │   └── TTEvent.ts
│   ├── views/              # ビューモデル/コントローラ
│   │   ├── TTApplication.ts
│   │   ├── TTColumn.ts
│   │   └── helpers/
│   │       ├── FilterParser.ts
│   │       ├── TagParser.ts
│   │       ├── EditorHelper.ts
│   │       └── DateHelper.ts
│   ├── components/         # Reactコンポーネント
│   │   ├── Layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── AppLayout.css
│   │   │   ├── Splitter.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── Column/
│   │   │   ├── TTColumnView.tsx
│   │   │   └── TTColumnView.css
│   │   ├── DataGrid/
│   │   │   ├── DataGridPanel.tsx
│   │   │   ├── DataGridFilter.tsx
│   │   │   ├── DataGrid.tsx
│   │   │   └── DataGrid.css
│   │   ├── WebView/
│   │   │   ├── WebViewPanel.tsx
│   │   │   ├── WebViewAddrBar.tsx
│   │   │   ├── ChatView.tsx
│   │   │   ├── SearchView.tsx
│   │   │   ├── RelatedView.tsx
│   │   │   ├── EmailView.tsx
│   │   │   ├── PhotoView.tsx
│   │   │   ├── TimelineView.tsx
│   │   │   ├── DecisionView.tsx
│   │   │   └── WebView.css
│   │   ├── TextEditor/
│   │   │   ├── TextEditorPanel.tsx
│   │   │   ├── TextEditorHighlighter.tsx
│   │   │   └── TextEditor.css
│   │   ├── UI/
│   │   │   ├── CommandPalette.tsx
│   │   │   ├── ContextMenu.tsx
│   │   │   └── StatusBar.tsx
│   │   └── Search/
│   │       └── SearchApp.tsx
│   ├── services/           # サービス層
│   │   ├── storage/
│   │   │   ├── IStorageService.ts
│   │   │   ├── BigQueryStorageService.ts
│   │   │   ├── IndexedDBStorageService.ts
│   │   │   └── StorageManager.ts
│   │   ├── sync/
│   │   │   ├── WebSocketService.ts
│   │   │   └── SyncManager.ts
│   │   ├── KeywordHighlighter.ts
│   │   ├── TagLinkProvider.ts
│   │   ├── ColorTheme.ts
│   │   ├── FileUploadService.ts
│   │   ├── MemoryService.ts
│   │   ├── ThinkingService.ts
│   │   └── JudgmentService.ts
│   ├── controllers/        # アクション/イベント定義
│   │   ├── DefaultActions.ts
│   │   ├── DefaultEvents.ts
│   │   ├── DefaultStatus.ts
│   │   └── actions/
│   │       ├── ApplicationActions.ts
│   │       ├── EditorActions.ts
│   │       ├── TableActions.ts
│   │       └── RequestActions.ts
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── csv.ts
│       └── markdownToHtml.ts
├── server/
│   ├── index.ts            # Express + WebSocketサーバ
│   ├── tsconfig.json
│   ├── middleware/
│   │   └── authMiddleware.ts
│   ├── routes/
│   │   ├── bigqueryRoutes.ts
│   │   ├── chatRoutes.ts
│   │   ├── searchRoutes.ts
│   │   ├── relatedRoutes.ts
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
└── scripts/
    ├── start-backend.bat
    └── start-frontend.bat
```

---

## 5. 実装フェーズ（全29フェーズ）

各フェーズは動作確認可能な中間成果物を生成する。全て新規作成。

---

### Phase 1: プロジェクト初期化

**目標**: 既存コードを`reference2/`に退避し、空のVite + React + TypeScriptプロジェクトを構築。

**作業内容**:
1. 既存のソースファイル群を`reference2/`に移動（`reference/`, `.git`, `.gitignore`は維持）
2. `npm init` → `package.json`作成
3. Vite + React + TypeScript + Monaco Editor + react-window の依存インストール
4. `vite.config.ts`, `tsconfig.json`, `index.html` 作成
5. `src/main.tsx`, `src/App.tsx`, `src/index.css` 最小構成で作成

**新規作成ファイル**:
- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
- `public/favicon.svg`, `public/manifest.json`

**検証**: `npm run dev` → ブラウザに「Thinktank」タイトルの空ページが表示される。

---

### Phase 2: TTObject・TTCollection 基盤

**目標**: Observerパターンの基底クラスとコレクション管理クラスを新規実装。

**設計参考**: `reference2/src/models/TTObject.ts`, `TTCollection.ts`

**新規作成ファイル**:
- `src/models/TTObject.ts` - Observer基盤（AddOnUpdate/RemoveOnUpdate/NotifyUpdated）
- `src/models/TTCollection.ts` - Map管理、CSV直列化、デバウンス自動保存
- `src/utils/csv.ts` - CSV parse/stringify
- `src/types/index.ts` - 型定義

**検証**: ユニットテスト的にconsoleでTTObject/TTCollectionのCRUDと通知が動作。

---

### Phase 3: TTDataItem・TTModels ルート

**目標**: 統一コンテンツモデルとアプリケーション全体のモデルルートを構築。

**新規作成ファイル**:
- `src/models/TTDataItem.ts` - ContentType対応の統一データモデル
- `src/models/TTStatus.ts` - UI状態管理
- `src/models/TTAction.ts` - アクション定義
- `src/models/TTEvent.ts` - イベント定義
- `src/models/TTModels.ts` - ルートシングルトン（全コレクションを保持）

**検証**: TTModelsシングルトンからMemoコレクションにアイテム追加・取得ができる。

---

### Phase 4: TTColumn・TTApplication ビューモデル

**目標**: 列ベースのビューモデルとアプリケーションコントローラを実装。

**設計参考**: `reference2/src/Views/TTApplication.ts`, `TTPanel.ts`

**新規作成ファイル**:
- `src/views/TTColumn.ts` - 列ビューモデル（フィルタ・URL・リソース・選択状態）
- `src/views/TTApplication.ts` - 最上位コントローラ（TTColumn[0..2]管理、初期化）
- `src/views/helpers/DateHelper.ts` - 日付ID生成ユーティリティ

**検証**: TTApplicationが3つのTTColumnを生成し、各ColumnのプロパティをObserverで監視可能。

---

### Phase 5: 3列レイアウトシェル

**目標**: 3列レイアウトのUI基盤。各列に3パネルのプレースホルダを配置。

**新規作成ファイル**:
- `src/components/Layout/AppLayout.tsx` + `AppLayout.css` - 3列グリッド
- `src/components/Layout/Splitter.tsx` - ドラッグリサイズ（列間・パネル間）
- `src/components/Column/TTColumnView.tsx` + `TTColumnView.css` - 列コンポーネント

**修正ファイル**:
- `src/App.tsx` - AppLayoutを描画

**検証**: 3列が横並びで表示。列間のスプリッタでリサイズ可能。各列内に3つの灰色プレースホルダが縦積み。

---

### Phase 6: DataGridPanel - テーブル描画

**目標**: DataGridパネルの基本実装。react-windowで仮想スクロールテーブル。

**新規作成ファイル**:
- `src/components/DataGrid/DataGridPanel.tsx` - パネルコンテナ
- `src/components/DataGrid/DataGridFilter.tsx` - 1行フィルタ入力
- `src/components/DataGrid/DataGrid.tsx` + `DataGrid.css` - 仮想スクロールテーブル

**修正ファイル**:
- `src/components/Column/TTColumnView.tsx` - 上部スロットにDataGridPanel配置

**検証**: 各列の上部パネルにテーブルが表示。仮テストデータ（ID + タイトル）の行が表示・選択可能。

---

### Phase 7: TextEditorPanel - Monaco統合

**目標**: Monaco Editorによるテキスト編集パネル。

**新規作成ファイル**:
- `src/components/TextEditor/TextEditorPanel.tsx` + `TextEditor.css` - パネルコンテナ
- `src/components/TextEditor/TextEditorHighlighter.tsx` - 1行ハイライタバー

**修正ファイル**:
- `src/components/Column/TTColumnView.tsx` - 下部スロットにTextEditorPanel配置

**検証**: 各列の下部パネルでMonaco Editorが動作。テキスト入力・基本編集機能が使える。

---

### Phase 8: WebViewPanel - iframe基盤

**目標**: アドレスバー付きWebViewパネル。iframe表示とMarkdownプレビュー。

**新規作成ファイル**:
- `src/components/WebView/WebViewPanel.tsx` + `WebView.css` - パネルコンテナ
- `src/components/WebView/WebViewAddrBar.tsx` - 1行アドレスバー
- `src/utils/markdownToHtml.ts` - Markdownをhtml変換

**修正ファイル**:
- `src/components/Column/TTColumnView.tsx` - 中央スロットにWebViewPanel配置

**検証**: 各列の中央パネルにiframe。アドレスバーにURL入力→ページ表示。Markdownプレビュー可能。

---

### Phase 9: DataGrid→TextEditor 選択連携

**目標**: DataGrid行選択でTextEditorにコンテンツをロード。

**修正ファイル**:
- `src/views/TTColumn.ts` - SelectedItemID変更→EditorResource反映のObserver接続
- `src/components/DataGrid/DataGrid.tsx` - 行クリックで選択イベント発火
- `src/components/TextEditor/TextEditorPanel.tsx` - EditorResource変更でコンテンツロード

**検証**: DataGridで行をクリック→TextEditorに当該アイテムの内容が表示。編集可能。

---

### Phase 10: パネル間フルフロー接続

**目標**: DataGrid↔WebView↔TextEditorの3パネル間双方向連携。

**修正ファイル**:
- `src/views/TTColumn.ts` - 全パネル間ワイヤリング完成
- `src/components/WebView/WebViewPanel.tsx` - 選択コンテキスト反応
- `src/components/DataGrid/DataGridPanel.tsx` - プログラマティックフィルタ更新

**フロー**:
- DataGrid選択 → WebView(関連コンテンツ/Markdown) + TextEditor(編集)
- TextEditor操作 → DataGrid更新通知
- WebView操作 → DataGridフィルタ/TextEditorリソース変更

**検証**: 3パネル間を遷移する操作サイクルが動作。

---

### Phase 11: バックエンド基盤 - Express + BigQuery

**目標**: REST APIサーバとBigQueryストレージ。

**新規作成ファイル**:
- `server/index.ts` - Express + WebSocket サーバ
- `server/tsconfig.json`
- `server/middleware/authMiddleware.ts`
- `server/routes/bigqueryRoutes.ts` - CRUD API（コレクション毎テーブル対応）
- `server/services/BigQueryService.ts` - BigQueryアクセス層

**検証**: `GET /api/bq/collections/{id}/files` でBigQueryからデータ取得。POST/DELETEも動作。

---

### Phase 12: ストレージサービス・同期基盤

**目標**: フロントエンドのストレージ抽象化とWebSocket同期。

**新規作成ファイル**:
- `src/services/storage/IStorageService.ts` - ストレージインターフェース
- `src/services/storage/BigQueryStorageService.ts` - BigQuery API呼び出し
- `src/services/storage/IndexedDBStorageService.ts` - ローカルキャッシュ
- `src/services/storage/StorageManager.ts` - デュアルライト（BigQuery + IndexedDB）
- `src/services/sync/WebSocketService.ts` - WS接続・再接続
- `src/services/sync/SyncManager.ts` - リアルタイム同期制御

**修正ファイル**:
- `src/models/TTCollection.ts` - StorageManagerとの統合

**検証**: アイテム保存→BigQueryとIndexedDBの両方に書込。別タブで変更がリアルタイム反映。

---

### Phase 13: DataGridフィルタ - AND/OR/NOT式

**目標**: フィルタ式パーサーとリアルタイムフィルタリング。

**新規作成ファイル**:
- `src/views/helpers/FilterParser.ts` - フィルタ式パーサー

**フィルタ構文**:
- スペース区切り = OR
- `+` 接頭辞 = AND
- `-` 接頭辞 = NOT
- 例: `日記 +2026 -下書き` → 「日記」含む AND「2026」含む AND「下書き」除外

**修正ファイル**:
- `src/components/DataGrid/DataGrid.tsx` - フィルタ適用
- `src/components/DataGrid/DataGridFilter.tsx` - フィルタテキスト連携

**検証**: フィルタバーに式入力→リアルタイムで行が絞り込まれる。

---

### Phase 14: DataGridソートと列設定

**目標**: 列ヘッダクリックでソート。列幅・列名マッピング。

**修正ファイル**:
- `src/components/DataGrid/DataGrid.tsx` - ソートロジック、列設定
- `src/components/DataGrid/DataGrid.css` - ソートインジケータ

**検証**: 列ヘッダクリックで昇順/降順切替。列幅が設定値に従う。

---

### Phase 15: AIチャット基盤

**目標**: メモとは分離されたチャットシステム。WebView内にチャットUI。

**新規作成ファイル**:
- `src/models/TTChatSession.ts` - チャットセッション
- `src/models/TTChatMessage.ts` - メッセージ
- `src/components/WebView/ChatView.tsx` + CSS
- `server/routes/chatRoutes.ts` - チャットAPI
- `server/services/ChatService.ts` - AI API連携（Claude/Gemini）

**修正ファイル**:
- `server/index.ts` - チャットルート追加
- `src/models/TTModels.ts` - ChatCollectionをルートに追加
- `src/components/WebView/WebViewPanel.tsx` - ChatView描画条件

**検証**: WebViewでチャットUI。メッセージ送受信。セッションがChatsコレクションに独立保存。

---

### Phase 16: チャット-メモ統合

**目標**: メモをコンテキストとしたAIチャット。チャットからメモ作成。

**修正ファイル**:
- `src/models/TTChatSession.ts` - KeyMemoID、コンテキスト構築
- `src/components/WebView/ChatView.tsx` - メモコンテキスト表示、メモ作成アクション
- `src/views/TTColumn.ts` - エディタ選択→チャット起動フロー
- `server/services/ChatService.ts` - メモ内容をAIプロンプトに含む

**検証**: メモ選択→チャット開始。AIがメモ踏まえた応答。チャットからメモ新規作成。

---

### Phase 17: TextEditorタグシステム

**目標**: 各種クリッカブルタグの実装。

**新規作成ファイル**:
- `src/views/helpers/TagParser.ts` - タグパターン定義・解析
- `src/services/TagLinkProvider.ts` - Monaco用リンクプロバイダ

**修正ファイル**:
- `src/components/TextEditor/TextEditorPanel.tsx` - タグクリックハンドラ
- `src/controllers/actions/RequestActions.ts` - タグアクション実装

**タグ一覧**:
| タグ | 動作 |
|------|------|
| `[Memo:yyyy-MM-dd-HHmmss]` | 当該メモへナビゲート |
| `[File:yyyy-MM-dd-HHmmss]` | ファイルリンクを開く |
| `[Chat:yyyy-MM-dd-HHmmss]` | チャットセッションを開く |
| URL (`https://...`) | WebView/ブラウザで開く |
| `[yyyy-MM-dd]` | DataGridフィルタに日付設定 |
| `[search:キーワード]` | Web検索実行 |
| `[msearch:キーワード]` | メモ全文検索 |
| `[csearch:キーワード]` | チャット全文検索 |
| `[route:パス]` | アプリ内ルートナビゲーション |
| `[contact:名前]` | 連絡先カード表示 |
| `[pass:サービス名]` | パスワードカード表示 |
| `[ref:セクション名]` | 文書内リファレンスジャンプ |

**検証**: エディタ内の各タグが色付き・クリッカブル。クリックで対応アクション実行。

---

### Phase 18: TextEditorハイライト・Folding・テーマ

**目標**: ハイライタバー駆動のハイライト、Folding、ビジュアルテーマ。

**新規作成ファイル**:
- `src/services/KeywordHighlighter.ts` - キーワードハイライトデコレーション
- `src/services/ColorTheme.ts` - ビジュアルテーマ定義

**修正ファイル**:
- `src/components/TextEditor/TextEditorHighlighter.tsx` - キーワード入力→ハイライト駆動
- `src/components/TextEditor/TextEditorPanel.tsx` - Folding設定、テーマ適用

**検証**: ハイライタバーにキーワード入力→一致箇所がハイライト。セクションFold/Unfold。テーマ切替。

---

### Phase 19: 全文検索（WebView）

**目標**: メモ・チャット横断の全文検索をWebViewに表示。

**新規作成ファイル**:
- `src/components/WebView/SearchView.tsx` - 検索結果UI
- `server/routes/searchRoutes.ts` - 検索API
- `server/services/SearchService.ts` - BigQuery全文検索

**修正ファイル**:
- `server/index.ts` - 検索ルート追加
- `src/components/WebView/WebViewPanel.tsx` - SearchView描画（`search:`プロトコル）

**検証**: WebViewアドレスバーに`search:キーワード`→結果一覧。クリックでアイテムにナビゲート。

---

### Phase 20: 関連コンテンツ発見

**目標**: キーメモ/チャットに基づく関連アイテム一覧表示。日付情報収集。

**新規作成ファイル**:
- `src/components/WebView/RelatedView.tsx` - 関連コンテンツUI
- `server/routes/relatedRoutes.ts` - 関連コンテンツAPI
- `server/services/RelatedService.ts` - キーワード重複度 + 日付近接性

**検証**: メモ選択→「関連」表示→類似メモ・チャット一覧。同日のアイテムも集約。

---

### Phase 21: キーボードショートカット・アクションシステム

**目標**: 列ベースのキーバインド、コマンドパレット。

**新規作成ファイル**:
- `src/controllers/DefaultActions.ts` - 組込アクション定義
- `src/controllers/DefaultEvents.ts` - キーバインド定義
- `src/controllers/DefaultStatus.ts` - 初期ステータス
- `src/controllers/actions/ApplicationActions.ts` - 列ナビゲーション
- `src/controllers/actions/EditorActions.ts` - エディタ操作
- `src/controllers/actions/TableActions.ts` - テーブル操作
- `src/components/UI/CommandPalette.tsx` - コマンドパレット
- `src/components/UI/ContextMenu.tsx` - 右クリックメニュー
- `src/components/UI/StatusBar.tsx` - ステータスバー

**検証**: ショートカットで列切替、DataGridナビ、エディタフォーカス、コマンドパレット起動。

---

### Phase 22: レスポンシブ/モバイル対応

**目標**: スマホ1列、タブレット2列。スワイプ・ボトムナビ。

**新規作成ファイル**:
- `src/components/Layout/MobileNav.tsx` + CSS - ボトムナビ（音声入力、削除、ペースト、コピー）

**修正ファイル**:
- `src/components/Layout/AppLayout.tsx` + CSS - メディアクエリ
- `src/components/Column/TTColumnView.tsx` - モバイルスタック
- `src/views/TTApplication.ts` - 列表示制御

**デバイス別動作**:
| デバイス | 列数 | パネル遷移 |
|---------|------|-----------|
| スマホ | 1列 | 左右スワイプでDataGrid↔WebView↔TextEditor |
| タブレット(縦) | 2列 | 上下スワイプで列組み合わせ切替 |
| タブレット(横) | 2列 | 左右スワイプ |
| デスクトップ | 3列 | 常時全表示 |

**検証**: ブラウザリサイズで列数自動変更。スワイプ動作。ボトムナビ表示。

---

### Phase 23: ファイルD&D + Google Drive連携

**目標**: ドロップファイルをGoogle Drive yyyy-mm-ddフォルダに保存。

**新規作成ファイル**:
- `server/routes/driveRoutes.ts` - Drive API
- `server/services/DriveService.ts` - Google Drive操作
- `src/services/FileUploadService.ts` - アップロード制御

**修正ファイル**:
- `server/index.ts` - Driveルート追加
- `src/components/TextEditor/TextEditorPanel.tsx` - ドロップゾーン
- `src/components/DataGrid/DataGridPanel.tsx` - ドロップゾーン

**検証**: ファイルD&D→Google Driveにアップロード→`[File:ID]`タグ自動挿入。

---

### Phase 24: Gmail連携

**目標**: 規定タイトルのGMailアイテムの閲覧・作成・アプリ管理。

**新規作成ファイル**:
- `server/routes/gmailRoutes.ts`
- `server/services/GmailService.ts`
- `src/components/WebView/EmailView.tsx`

**修正ファイル**:
- `server/index.ts` - Gmailルート追加
- `src/components/WebView/WebViewPanel.tsx` - EmailView描画

**検証**: WebViewでGmail受信箱（特定タイトル）表示。メモからメール作成・送信。

---

### Phase 25: Google Photos連携

**目標**: 写真のリンク管理と表示。

**新規作成ファイル**:
- `server/routes/photosRoutes.ts`
- `server/services/PhotosService.ts`
- `src/components/WebView/PhotoView.tsx`

**修正ファイル**:
- `src/models/TTDataItem.ts` - 写真ContentType処理

**検証**: Google Photos閲覧。写真参照タグをメモに挿入。タグクリックで全画面表示。

---

### Phase 26: 記憶支援機能

**目標**: AI活用の想起支援。

**新規作成ファイル**:
- `src/services/MemoryService.ts` - 記憶クエリ構築
- `src/components/WebView/TimelineView.tsx` - タイムライン表示

**修正ファイル**:
- `server/services/ChatService.ts` - 記憶拡張プロンプト
- `server/services/SearchService.ts` - 日付範囲クエリ

**機能**:
- 「あの日何をした？」→ 日付ベースのメモ・活動集約
- タイムライン表示 → 時系列でメモ・チャット・イベント一覧
- コンテキスト連想 → 編集中メモに関連する過去メモのサジェスト

**検証**: チャットで「先週の火曜日何をした？」→当該日のメモ・活動一覧を含むAI応答。

---

### Phase 27: 思考支援機能

**目標**: 視点・材料提示、概略説明生成。

**新規作成ファイル**:
- `src/services/ThinkingService.ts` - 思考支援ワークフロー

**修正ファイル**:
- `server/services/ChatService.ts` - 思考支援プロンプトテンプレート
- `src/components/WebView/ChatView.tsx` - 思考支援アクションボタン

**機能**:
- トピック要約 → メモ群から概要自動生成
- 多角的視点提示 → 異なる立場からの見解
- 関連素材収集 → ユーザーデータ内の関連情報 + Web検索

**検証**: メモ選択→「視点を提示」→AIが複数観点と根拠を提示。

---

### Phase 28: 判断支援機能

**目標**: 意思決定の構造化・補助。

**新規作成ファイル**:
- `src/services/JudgmentService.ts` - 判断支援ワークフロー
- `src/components/WebView/DecisionView.tsx` - 構造化判断表示

**修正ファイル**:
- `server/services/ChatService.ts` - 判断支援プロンプト

**機能**:
- 判断テンプレート（メリット/デメリット/基準の構造化）
- 過去類似判断の検索
- リスク/ベネフィット分析生成

**検証**: 判断メモ→「分析」→構造化メリデメ・推奨表示。

---

### Phase 29: 状態永続化・列間同期

**目標**: アプリ状態のフル保存/復元、列間データ同期。

**修正ファイル**:
- `src/views/TTColumn.ts` - 状態シリアライズ/復元
- `src/views/TTApplication.ts` - 全体状態Save/Restore
- `src/controllers/DefaultStatus.ts` - 列ベースステータス
- `src/services/sync/SyncManager.ts` - 列間変更伝播

**検証**: 列設定→ブラウザ閉→再開で状態復元。列0で編集→列2のDataGridに即反映。

---

## 6. ユーザーフロー概念図

```
[ユーザーの基本動作サイクル]

DataGrid(エントリー選択)
    │
    ├──→ WebView(チャット / 関連コンテンツ / Markdownプレビュー)
    │       │
    │       └──→ TextEditor(メモ作成・編集)
    │                │
    │                ├── [Memo:ID]タグクリック → DataGrid(該当メモ表示)
    │                ├── [yyyy-MM-dd]タグクリック → DataGrid(日付フィルタ)
    │                ├── URL → WebView(ブラウザ表示)
    │                ├── [search:xxx] → WebView(検索結果)
    │                └── 保存 → DataGrid(一覧更新)
    │
    └──→ TextEditor(直接編集)
            │
            └── Filter変更 → DataGrid(別データセット表示)
                    │
                    └── 新しいコンテキストでのアクティビティ → 記憶の活性化

※ 各パネル間を遷移する中で、異なるデータセット・視点に触れ、
   記憶の活性化を自然に促す設計
```

---

## 7. 主要マイルストーン検証

| マイルストーン | 完了フェーズ | 状態 |
|--------------|-------------|------|
| プロジェクト起動・空ページ表示 | Phase 1 | 開発基盤 |
| 3列×3パネルのレイアウト表示 | Phase 5 | UIシェル |
| 3パネル間の基本インタラクション | Phase 10 | コアUX |
| バックエンド接続・データ永続化 | Phase 12 | データ基盤 |
| AIチャット動作 | Phase 16 | AI基盤 |
| タグ・ハイライト・Folding | Phase 18 | エディタ完成 |
| 全文検索・関連発見 | Phase 20 | 検索基盤 |
| モバイル対応 | Phase 22 | マルチデバイス |
| 外部連携(Drive/Gmail/Photos) | Phase 25 | 統合 |
| 記憶・思考・判断支援 | Phase 28 | コア機能 |
| フルアプリ完成 | Phase 29 | 完成 |

---

## 8. 検証方法

```bash
# フロントエンド起動
npm run dev
# → http://localhost:5173/

# バックエンド起動 (Phase 11以降)
./scripts/start-backend.bat
# → http://localhost:8080/

# ビルド確認
npm run build
```

各フェーズの「検証」項目をブラウザ上で手動確認。

---

## 9. 新しいアイデアを盛り込む際のガイドライン

本プランは段階的開発を前提としており、各フェーズの合間に新しいアイデアを追加することを想定しています。以下のガイドラインに従ってください。

### 9.1 追加可能なタイミング

- **フェーズ完了後、次フェーズ開始前**が最適なタイミング
- 各フェーズの「検証」が通った状態で追加すること
- 実装中のフェーズへの追加は、そのフェーズの検証完了後に行う

### 9.2 依存関係マップ

アイデアを挿入する際、以下の依存関係を確認してください：

```
Phase 1-4: 基盤層（全ての土台）
  └── ここに依存: Phase 5以降の全て

Phase 5-10: UI + パネル間連携
  └── ここに依存: Phase 13-14 (フィルタ/ソート), Phase 17-18 (タグ/ハイライト), Phase 21-22 (ショートカット/モバイル)

Phase 11-12: バックエンド + ストレージ
  └── ここに依存: Phase 15-16 (チャット), Phase 19-20 (検索/関連), Phase 23-25 (外部連携), Phase 26-28 (AI支援)

Phase 15-16: チャット基盤
  └── ここに依存: Phase 26-28 (記憶/思考/判断支援)
```

**例**: 「カレンダービュー機能を追加したい」→ Phase 10（パネル間連携）以降、Phase 11（バックエンド）以降のどちらにも依存 → Phase 12以降に挿入可能

### 9.3 アイデアの規模別対処

| 規模 | 例 | 対処 |
|------|-----|------|
| **小** | 新しいタグ種類の追加、UIの微調整、色の変更 | 現在のフェーズに同時に含める |
| **中** | 新しいWebView画面、新しいAPI、新しいデータモデル | 独立した新フェーズとして挿入 |
| **大** | アーキテクチャ変更、データモデルの根本変更 | プラン全体の再検討が必要。影響範囲を確認してから判断 |

### 9.4 注意事項

1. **動作する状態を壊さない** - 各フェーズ完了時点で必ず動作確認し、動作する中間成果物の上に機能を足すこと
2. **1フェーズ = 1つの明確な目標** - 複数の無関係な機能を1フェーズに詰め込まない
3. **後続フェーズへの影響を確認** - データモデルの変更やAPIインターフェースの変更は後続フェーズに波及する可能性がある
4. **プランファイルを更新する** - 新アイデアを追加した際はこのドキュメントも更新し、常に最新の全体像を維持する
5. **大規模変更は早めに相談** - アーキテクチャに影響する変更は、実装前に影響範囲を洗い出すこと
