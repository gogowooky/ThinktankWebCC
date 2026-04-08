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
     各TTColumn（縦に3パネル積層、上から順に）:
     ├── DataGridPanel
     │    ├── TitleBar + Filter    (タイトルバー内にフィルタ入力を統合)
     │    └── DataGrid             (仮想スクロールテーブル: ID + タイトル)
     ├── TextEditorPanel
     │    ├── TitleBar + Highlight (タイトルバー内にハイライト入力を統合)
     │    └── TextEditor           (Monaco Editor: タグ・リンク・Folding対応)
     └── WebViewPanel
          ├── TitleBar + Address   (タイトルバー内にURL入力を統合)
          └── WebView              (iframe / ChatView / SearchView / EmailView 等)
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
DataGridFilter: string    // フィルタ式
WebViewUrl: string        // 表示URL/プロトコル
EditorResource: string    // 編集中アイテムID
SelectedItemID: string    // DataGrid選択行ID（setter でEditorResourceも自動連動）
HighlighterKeyword: string // ハイライトキーワード
FocusedPanel: PanelType   // フォーカス中のパネル ('DataGrid' | 'WebView' | 'TextEditor')
IsVisible: boolean        // レスポンシブ表示制御
VerticalRatios: number[]  // パネル高さ比率
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
│       ├── markdownToHtml.ts
│       └── editorHighlight.ts
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

**目標**: 3列レイアウトのUI基盤。各列に3パネルのプレースホルダを配置。ステータスバー。

**新規作成ファイル**:
- `src/components/Layout/AppLayout.tsx` + `AppLayout.css` - 3列グリッド + ステータスバー
- `src/components/Layout/Splitter.tsx` - ドラッグリサイズ（列間・パネル間）
- `src/components/Column/TTColumnView.tsx` + `TTColumnView.css` - 列コンポーネント

**修正ファイル**:
- `src/App.tsx` - AppLayoutを描画
- `src/views/TTColumn.ts` - `FocusedPanel`プロパティ追加（PanelType型、setter でObserver通知）

**画面構成の詳細**:

#### レイアウト全体
```
┌─────────────────────────────────────────────────────┐
│ [Column1]  │S│  [Column2]  │S│  [Column3]          │  ← 列間Splitter(S)で幅変更可
│            │ │             │ │                      │
│  (3パネル) │ │  (3パネル)  │ │  (3パネル)           │
├─────────────────────────────────────────────────────┤
│ [StatusBar]  Column 1 | DataGrid                    │  ← 22px固定
└─────────────────────────────────────────────────────┘
```

- 最大3列がアプリ全幅を分割（スクロールなし）
- 列番号は表示上1ベース（内部Index 0,1,2 → 表示 1,2,3）
- レスポンシブ: <768px=1列, <1200px=2列, >=1200px=3列

#### パネル配置順序（上から下）
1. **DataGridPanel** - データ一覧
2. **TextEditorPanel** - テキスト編集（Monaco Editor）
3. **WebViewPanel** - Webコンテンツ表示

#### 各パネルの内部構造（タイトルバー統合型）
```
各パネル:
┌───────────────────────┐
│ [● ] DataGrid         │ ← タイトル行（18px、フォーカス時に ● 表示）
│ [Filter...          ] │ ← ツールバー（入力フィールド、タイトルバー内に統合）
├───────────────────────┤
│                       │ ← コンテンツ領域（border: 1px solid #333）
│   (Panel Content)     │
│                       │
└───────────────────────┘
```

- タイトルバーの中にタイトル行とツールバー（入力フィールド）を統合配置
- 各パネルのツールバー:
  - DataGridPanel: Filter（フィルタ式入力）
  - TextEditorPanel: Highlight（ハイライトキーワード入力）
  - WebViewPanel: Address（URL/プロトコル入力）

#### Splitter動作
- **縦方向**: パネル間Splitterはタイトルバー・ツールバーも含めて完全に隠すまで移動可能（MIN_RATIO=0）
- **横方向**: 列間Splitterも列を完全に隠すまで移動可能（MIN_COL_RATIO=0）

#### フォーカス管理
- アプリ全体で●マークは1つだけ表示（アクティブ列 × フォーカスパネル）
- パネルをクリック（mousedown）するとそのパネルにフォーカスが移動
- フォーカス移動時にTTApplication.ActiveColumnIndexとTTColumn.FocusedPanelが更新
- ステータスバーにアクティブ列とフォーカスパネル名を表示（例: `Column 1 | WebView`）

#### 共通UIスタイル
- スクロールバー: ダークテーマ（トラック`#1e1e1e`、サム`#424242`、ホバー`#555`）
- フォントサイズ: テーブル・タイトルバー等は11-12px

#### ステータスバー
- アプリ最下部に22px固定高で配置
- 青背景（#007acc）、11pxフォント
- 表示内容: `Column {1ベース番号} | {フォーカスパネル名}`

**検証**: 3列が横並びで表示。列間・パネル間のスプリッタでリサイズ可能（完全に隠すことも可能）。各パネルにタイトルバー+ツールバー統合。フォーカス●が1つだけ表示。ステータスバーにフォーカス情報。

---

### Phase 6: DataGridPanel - テーブル描画

**目標**: DataGridパネルの基本実装。react-windowで仮想スクロールテーブル。

**注意**: Phase 5でタイトルバー内にFilterツールバーを統合済み。DataGridFilter.tsxは不要（TTColumnView内のツールバーが担当）。

**新規作成ファイル**:
- `src/components/DataGrid/DataGridPanel.tsx` - パネルコンテナ（Observer購読・ソート・フィルタ・選択管理）
- `src/components/DataGrid/DataGrid.tsx` + `DataGrid.css` - react-window仮想スクロールテーブル

**修正ファイル**:
- `src/components/Column/TTColumnView.tsx` - DataGridPanelのコンテンツ領域にDataGridPanel配置
- `src/App.tsx` - テストデータ12件投入（Phase 12でStorageManager統合済み、データなし時のフォールバックとして残存）

**DataGrid実装詳細**:
- 列定義はTTDataCollectionの`ListPropertiesMin`（`ID,Name`）、`ColumnMapping`、`ColumnMaxWidth`から自動取得
- react-window `FixedSizeList`による仮想スクロール（行高20px、ヘッダ18px）
- 列幅: `ColumnMaxWidth`のch値をpx換算（1ch≒7px）、`-1`はflex（残り幅を均等分配）
- ヘッダクリックでソート切替（昇順/降順、インジケータ▲▼表示）
- 行クリックで選択（青ハイライト`#094771`）→ `TTColumn.SelectedItemID`に反映
- スクロールバーはダークテーマ（トラック`#1e1e1e`、サム`#424242`）
- 空状態時は「No items」表示

**検証**: 各列の上部パネルにテーブルが表示。テストデータ12件（ID + タイトル）の行が表示・選択可能。ソート切替動作。

---

### Phase 7: TextEditorPanel - Monaco統合

**目標**: Monaco Editorによるテキスト編集パネル。DataGrid行選択でコンテンツをロード・編集可能に。

**注意**: Phase 5でタイトルバー内にHighlightツールバーを統合済み。TextEditorHighlighter.tsxは不要。

**新規作成ファイル**:
- `src/components/TextEditor/TextEditorPanel.tsx` + `TextEditor.css` - パネルコンテナ（コンテンツ領域のみ）

**修正ファイル**:
- `src/components/Column/TTColumnView.tsx` - TextEditorPanelのコンテンツ領域にTextEditorPanel配置
- `src/App.tsx` - テストデータにcontent（Markdown文）を追加

**実装詳細**:

#### TextEditorPanel動作仕様
- `column.EditorResource`（アイテムID）の変更をObserverで監視
- EditorResource変更時、TTCollectionから該当TTDataItemを取得しContentをMonaco Editorにロード
- 編集内容はリアルタイムでTTDataItem.Contentに書き戻し
- `suppressChange` refでsetValue時のonChange発火を抑制（フィードバックループ防止）
- 未選択時は「No item selected」を中央表示

#### Monaco Editor設定
| 設定 | 値 |
|------|-----|
| language | markdown |
| theme | vs-dark |
| fontSize | column.FontSize（デフォルト13px） |
| minimap | disabled |
| wordWrap | on |
| lineNumbers | off |
| folding | enabled |
| scrollBeyondLastLine | false |
| automaticLayout | true |
| overviewRuler | hidden |
| renderLineHighlight | line |
| scrollbar | vertical 8px, horizontal 8px |
| padding | top 4px |

#### DataGrid→TextEditor選択連携（Phase 9を前倒し実装）
- DataGrid行クリック → `column.SelectedItemID` 設定
- TTColumn.SelectedItemIDセッター内で `EditorResource` を同期更新
- EditorResource変更 → TextEditorPanelのObserverが発火 → コンテンツロード

**検証**: DataGridで行クリック→TextEditorに当該アイテムのMarkdownコンテンツが表示・編集可能。

---

### Phase 8: WebViewPanel - iframe基盤

**目標**: WebViewパネル。iframe表示とMarkdownプレビュー。

**注意**: Phase 5でタイトルバー内にAddressツールバーを統合済み。WebViewAddrBar.tsxは不要。

**新規作成ファイル**:
- `src/components/WebView/WebViewPanel.tsx` + `WebView.css` - パネルコンテナ（コンテンツ領域のみ）
- `src/utils/markdownToHtml.ts` - Markdownをhtml変換

**修正ファイル**:
- `src/components/Column/TTColumnView.tsx` - WebViewPanelのコンテンツ領域にWebViewPanel配置

**検証**: 各列の中央パネルにiframe。Addressツールバー（タイトルバー内）にURL入力→ページ表示。Markdownプレビュー可能。

**実施**: 2026-04-02 完了。前セッションで実装済み。2026-04-03検証にて全機能動作確認。

---

### Phase 9: DataGrid→TextEditor 選択連携

**目標**: DataGrid行選択でTextEditorにコンテンツをロード。

**修正ファイル**:
- `src/views/TTColumn.ts` - SelectedItemID変更→EditorResource反映のObserver接続
- `src/components/DataGrid/DataGrid.tsx` - 行クリックで選択イベント発火
- `src/components/TextEditor/TextEditorPanel.tsx` - EditorResource変更でコンテンツロード

**検証**: DataGridで行をクリック→TextEditorに当該アイテムの内容が表示。編集可能。

**実施**: 2026-04-02 完了。前セッションで実装済み。2026-04-03検証にて全機能動作確認。

**追加変更** (2026-04-03):
- `src/components/Column/TTColumnView.tsx` - パネルタイトルバーに選択中アイテム情報を表示。形式: `パネル名 | ID | タイトル`（例: `● DataGrid | 2026-04-02-160000 | 仕様書v2の参照メモ`）。今後パネルごとに異なるアイテムを表示する際の識別用。

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

**実施**: 2026-04-03 完了。
- `src/components/DataGrid/DataGridPanel.tsx` - DataGridFilterによるテキストフィルタ実装（ID/Name/Keywordsを対象）。構文: space区切り=AND, comma区切り=OR, `-`接頭辞=NOT。（例: `メモ -写真` → 「メモ」含む AND 「写真」除外）。Phase 13のFilterParser新設は不要となった。
- `src/components/WebView/WebViewPanel.tsx` - コレクション変更購読を追加（TextEditor編集→Markdownプレビュー即時反映）。Markdownプレビュー内リンククリックによるパネル間連携（`http(s)://` → iframe表示、`filter:` → DataGridフィルタ設定、`item:` → TextEditorリソース変更）。
- TextEditor編集 → DataGrid行タイトル即時反映（TTDataItem.Content setter → updateNameFromContent → NotifyUpdated → 親コレクション伝播）確認済み。

**追加変更** (2026-04-03): TextEditorハイライト機能

新規作成:
- `src/utils/editorHighlight.ts` - Monaco Editorカスタムハイライトエンジン

修正:
- `src/components/TextEditor/TextEditorPanel.tsx` - ハイライト機能統合、Monaco組み込み`occurrencesHighlight`無効化

機能詳細:
1. **見出しカラー**: Markdown `#`レベル(H1-H6)ごとに青系6色で行全体を色分け表示。H1(シアン)→H2(ライトブルー)→H3(ロイヤルブルー)→H4(ペールブルー)→H5(ペリウィンクル)→H6(ラベンダーブルー)。コンテンツ変更時に自動再適用。
2. **キーワードハイライト**: Highlightツールバー入力に基づくハイライト。space区切り=同色グループ、comma区切り=異なる色グループ（最大8色ローテーション）。エディタ内背景色とツールバータグ表示を`KEYWORD_COLORS`で共通化。HighlighterKeyword変更・コンテンツ編集時に自動再適用。
3. **単語ハイライト**: カーソル位置のワードと同一文字列を全箇所ハイライト（2箇所以上の場合のみ）。ワード境界: 全角区切り文字（。、！？・～「」等）、文字種切り替わり（漢字↔カタカナ↔ひらがな↔ASCII）、括弧内テキスト（「」『』（）【】等）。

---

### Phase 11: バックエンド基盤 - Express + BigQuery

**目標**: REST APIサーバとBigQueryストレージ。

**新規作成ファイル**:
- `server/index.ts` - Express + WebSocket サーバ
- `server/tsconfig.json`
- `server/middleware/authMiddleware.ts`
- `server/routes/bigqueryRoutes.ts` - CRUD API（単一テーブル+categoryクラスタリング）
- `server/services/BigQueryService.ts` - BigQueryアクセス層

**検証**: `GET /api/bq/files` でBigQueryからデータ取得。POST/DELETEも動作。

**実施**: 2026-04-04 完了。

設計判断:
- **単一テーブル+クラスタリング方式を採用**: コレクション毎テーブル方式と比較検討した結果、データ巻き戻し時の整合性維持が容易な単一テーブル方式を選択。`category`列によるクラスタリングでアクセス速度を確保。テーブル分割は必要時に後から対応可能。
- **既存BQデータ保護**: テーブル作成は未存在時のみ（`ensureTableExists`でexistsチェック）。DROP/TRUNCATE操作なし。MERGE文によるUpsertで既存レコードの`created_at`を保持。

新規作成ファイル詳細:
- `server/index.ts` - Express 5 + WebSocket(`ws`)サーバ。ポート8080。静的ファイル配信（dist/）、SPA フォールバック、WebSocket `/ws` エンドポイント（content-updateブロードキャスト）。
- `server/tsconfig.json` - ES2020ターゲット、ESModules、`dist-server/`出力。
- `server/middleware/authMiddleware.ts` - HMAC-SHA256セッション認証。`APP_PASSWORD`環境変数設定時のみ有効。httpOnlyクッキー、30日有効期限。ローカル開発時は認証不要（パスワード未設定時はスルー）。
- `server/services/BigQueryService.ts` - データセット`thinktank`、テーブル`files`、キー`(file_id, category)`。MERGE文Upsert、concurrent update自動リトライ（最大3回、指数バックオフ2s/4s/6s）。テーブル新規作成時に`category`列クラスタリング設定。
- `server/routes/bigqueryRoutes.ts` - 60秒デバウンス書き込み、直列DMLキュー（concurrent DML防止）。

APIエンドポイント:
| メソッド | パス | 機能 |
|---------|------|------|
| GET | `/api/bq/files` | ファイル一覧（`?category=`、`?since=` オプション） |
| GET | `/api/bq/files/:id` | 単一ファイル取得 |
| POST | `/api/bq/files` | ファイル保存（Upsert、60sデバウンス） |
| DELETE | `/api/bq/files/:id` | ファイル削除 |
| GET | `/api/bq/ttsearch?q=` | 全文検索（CONTAINS_SUBSTR） |
| GET | `/api/bq/versions` | バージョン情報（キャッシュ整合性チェック用） |
| GET | `/api/bq/all` | 全データ取得（キャッシュ再構築用） |
| POST | `/api/bq/bulk` | 一括保存（Upsert、デバウンス） |

依存パッケージ追加: `express ^5.2.1`, `@google-cloud/bigquery ^8.1.1`, `ws ^8.19.0`, `dotenv ^17.3.1`, `@types/express`, `@types/node`, `@types/ws`

起動: `npm run build:server && npm run server:dev`

---

### Phase 12: ストレージサービス・同期基盤

**目標**: フロントエンドのストレージ抽象化とWebSocket同期。

**新規作成ファイル**:
- `src/services/storage/IStorageService.ts` - ストレージインターフェース（FileRecord型、`_dirty`フラグ含む）
- `src/services/storage/BigQueryStorageService.ts` - REST API経由BigQueryアクセス（fetch）
- `src/services/storage/IndexedDBStorageService.ts` - ブラウザIndexedDBローカルキャッシュ
- `src/services/storage/StorageManager.ts` - デュアルライト・オーケストレータ
- `src/services/sync/WebSocketService.ts` - WS接続・自動再接続
- `src/services/sync/SyncManager.ts` - リアルタイム同期制御

**修正ファイル**:
- `src/models/TTCollection.ts` - StorageManagerとの統合（`_doSave`/`LoadCache`）
- `src/models/TTDataItem.ts` - `LoadContent`/`SaveContent`をStorageManager/SyncManager経由に変更
- `src/App.tsx` - StorageManager初期化→LoadCache→SyncManager開始の非同期フロー。データなし時はテストデータにフォールバック
- `vite.config.ts` - `/api` → localhost:8080プロキシ、`/ws` → WebSocketプロキシ追加

**検証**: アイテム保存→BigQueryとIndexedDBの両方に書込。別タブで変更がリアルタイム反映。

**実施**: 2026-04-04 完了。

動作フロー:
1. アプリ起動 → `storageManager.initialize()`（IndexedDB + BigQuery接続確認）
2. `memos.LoadCache()` → StorageManagerからカテゴリ別データロード
3. データなし → テストデータフォールバック（12件）
4. `syncManager.start()` → WebSocket接続、他タブからの変更をリアルタイム反映
5. 編集保存 → IndexedDB即時（dirty付き） + BigQuery非同期 + WebSocketブロードキャスト

ストレージ詳細:
- `IndexedDBStorageService` - DB名`thinktank` v2、ObjectStore`files`（keyPath: file_id）。インデックス: `by_category`, `by_updated`, `by_dirty`。ダーティキュー操作メソッド（`saveAsDirty`, `getDirtyRecords`, `clearDirty`, `clearDirtyBatch`）。
- `BigQueryStorageService` - `/api/bq/*` エンドポイントへのfetchラッパー。
- `StorageManager` - デュアルライト制御。書込: IndexedDB即時(dirty=true) → BQ非同期(成功時dirtyクリア)。読込: ローカル優先 → リモート差分同期。

オフライン同期対策（2026-04-04追加実装）:
1. **ダーティキュー**: BQ送信失敗時にIndexedDBに`_dirty=true`で保持。次回接続時に`flushDirtyQueue()`で直列リトライ送信。
2. **タイムスタンプ比較マージ**: `loadAll()`時にローカル/リモートの`updated_at`を比較。ローカルが新しい→ローカル優先（BQに送信）。リモートが新しい→リモートで上書き。ローカルのみ存在→BQに送信。
3. **ルール**: 「新しい方が勝つ」（Last Write Wins）。コンフリクト検出UIは将来の拡張として保留。

WebSocket同期:
- `WebSocketService` - `ws://host/ws`接続。指数バックオフ自動再接続（1s→2s→4s...最大30s）。クライアントID（`crypto.randomUUID()`）で自分送信メッセージを除外。
- `SyncManager` - リモートcontent-update受信→IndexedDB更新+メモリ上TTDataItem反映。ローカル変更→`saveAndBroadcast()`でStorageManager保存+WebSocket送信。

---

### Phase 13: DataGridフィルタ - AND/OR/NOT式

**目標**: フィルタ式パーサーとリアルタイムフィルタリング。

**フィルタ構文**:
- スペース区切り = AND（グループ内の全キーワードを含む）
- カンマ(`,`)区切り = OR（いずれかのグループにマッチ）
- `-` 接頭辞 = NOT（そのキーワードを含まない）
- 例: `メモ -写真` → 「メモ」含む AND 「写真」除外
- 例: `会議 2026,メール` → （「会議」AND「2026」）OR（「メール」）
- 検索対象: `ID`, `Name`, `Keywords` の結合テキスト（大文字小文字区別なし）

**実装ファイル**:
- `src/components/DataGrid/DataGridPanel.tsx` - フィルタロジックをコンポーネント内に直接実装（`FilterParser.ts`の新設は不要）

**検証**: フィルタバーに式入力→リアルタイムで行が絞り込まれる。

**実施**: 2026-04-03 Phase 10と同時に完了。独立したフィルタパーサーは不要と判断し、DataGridPanel内にインライン実装。

---

### Phase 14: WebView URL駆動アーキテクチャ + ストレージ基盤

**目標**: WebViewをURL駆動に変更。フロントエンドサーバー（Vite）が `/view/*` リクエストを処理し、IndexedDBからデータ取得→Markdown→HTML変換→表示する自己完結型HTMLを返す。バックエンドサーバー不要で動作。同時にIndexedDB + BigQuery デュアルライト基盤、オフライン同期（ダーティキュー＋タイムスタンプマージ）、WebSocket同期を構築。

#### 14-A: ストレージ・同期基盤

**新規作成ファイル**:
- `src/services/storage/IStorageService.ts` - ストレージインターフェース（`FileRecord` 型定義、`_dirty` フラグ）
- `src/services/storage/IndexedDBStorageService.ts` - IndexedDB実装（DB名 `thinktank` v2、`files` ストア、`by_category`/`by_updated`/`by_dirty` インデックス、`saveAsDirty()`/`getDirtyRecords()`/`clearDirty()` メソッド）
- `src/services/storage/BigQueryStorageService.ts` - BigQuery REST API呼び出しラッパー
- `src/services/storage/StorageManager.ts` - デュアルライト管理（`saveFile()`: ローカルdirty保存→リモート非同期、`loadAll()`: ローカル＋リモートタイムスタンプ比較マージ、`flushDirtyQueue()`: 再接続時dirty送信）
- `src/services/sync/WebSocketService.ts` - WebSocket接続管理（指数バックオフ再接続、最大30秒）
- `src/services/sync/SyncManager.ts` - リモート更新→ローカル適用、ローカル変更→ブロードキャスト

**修正ファイル**:
- `src/models/TTCollection.ts` - `LoadCache()` で StorageManager 経由ロード、`_doSave()` で StorageManager 経由保存
- `src/models/TTDataItem.ts` - `LoadContent()`/`SaveContent()` を StorageManager/SyncManager 経由に変更

#### 14-B: Express + BigQuery バックエンドサーバー

**新規作成ファイル**:
- `server/index.ts` - Express 5 + WebSocket (`ws`) サーバーエントリポイント（ポート8080）
- `server/services/BigQueryService.ts` - BigQuery操作（データセット `thinktank`、テーブル `files`、キー `(file_id, category)`、MERGE upsert、カテゴリクラスタリング）
- `server/routes/bigqueryRoutes.ts` - CRUD API（60秒デバウンス、シリアルDMLキュー）
- `server/middleware/authMiddleware.ts` - HMAC-SHA256 cookie認証
- `server/tsconfig.json` - サーバー用TSConfig（ES2020、ESModules、出力先 `dist-server/`）

**重要制約**: 既存BigQueryデータは絶対に削除しない。DELETE/DROP/TRUNCATEは `deleteFile()` のみ（明示的単一レコード削除）。

#### 14-C: WebView URL駆動表示

**新規作成ファイル**:
- `src/view-templates/markdown.html` - 自己完結型HTMLテンプレート。ブラウザ側でURLパラメータからIndexedDBを参照し、markdownToHtmlでHTML変換して表示。アプリ内iframe・別ブラウザタブの両方で動作
- `src/utils/webviewUrl.ts` - URL生成・解析ユーティリティ（`buildViewUrl()`、`buildMarkdownUrl()`、`parseViewUrl()`、`isExternalUrl()`、`toFullUrl()`）

**修正ファイル**:
- `vite.config.ts` - Viteプラグイン `thinktank-view` 追加。`/view/markdown` リクエストに `markdown.html` テンプレートを返す。`/api`・`/ws` はバックエンド（localhost:8080）へプロキシ
- `src/views/TTColumn.ts` - `SelectedItemID` セッターで `buildMarkdownUrl()` を使い `_webViewUrl` を設定
- `src/components/WebView/WebViewPanel.tsx` - URL入力時は iframe (`src=url`) で表示。内部 `/view/*` URL・外部 `http(s)://` URL 両対応
- `src/components/Column/TTColumnView.tsx` - ↗ ボタンで `window.open(toFullUrl(url), '_blank')` により同じURLをブラウザ新タブで開く
- `src/components/Column/TTColumnView.css` - `.panel-toolbar-btn` スタイル追加
- `src/App.tsx` - テストデータをIndexedDBにも保存（`/view/markdown` 参照用）

**URL設計（拡張可能）**:
```
/view/markdown?category=Memos&id={id}   ← Markdownプレビュー
/view/chat?session={id}                  ← 将来: チャット表示
/view/search?q={keyword}&category={cat}  ← 将来: 検索結果
/view/related?id={id}                    ← 将来: 関連アイテム
```

**検証**: DataGridでアイテム選択→WebViewアドレスバーにURL表示→iframe内にMarkdown→HTML表示。↗ボタンで同じURLがブラウザ別タブで表示。バックエンド不要で動作。

---

### Phase 15: AIチャット基盤

**目標**: WebView内でAIチャットを行う機能。Phase 14のURL駆動アーキテクチャと同じ仕組み（`/view/chat`）で、自己完結型HTMLテンプレートによるチャットUIを実現。バックエンドのClaude APIを通じてAIとストリーミング会話。会話履歴はIndexedDBに保存。

#### 15-A: バックエンドチャットAPI

**新規作成ファイル**:
- `server/services/ChatService.ts` - Anthropic SDK（`@anthropic-ai/sdk`）ラッパー。`streamMessage()` でSSEストリーミング応答を返す。モデルは `ANTHROPIC_MODEL` 環境変数で設定可能（デフォルト `claude-sonnet-4-6`）
- `server/routes/chatRoutes.ts` - `POST /api/chat/:sessionId/messages` エンドポイント。リクエスト（`{ message, history, systemPrompt? }`）を受け、SSE（`text/event-stream`）でストリーミング応答。各イベントは `data: {"type":"delta","text":"..."}` 形式、完了時 `data: {"type":"done","text":"全文"}`

**修正ファイル**:
- `server/index.ts` - `createChatRoutes` インポート＋ `/api/chat` ルート登録、`chatService.initialize()` 呼び出し追加

**環境変数** (`server/.env`):
- `ANTHROPIC_API_KEY` - Claude APIキー（必須）
- `ANTHROPIC_MODEL` - モデル名（任意、デフォルト `claude-sonnet-4-6`）

**依存パッケージ追加**: `@anthropic-ai/sdk`

#### 15-B: チャットUIテンプレート

**新規作成ファイル**:
- `src/view-templates/chat.html` - 自己完結型チャットUI（`markdown.html` と同じ方式）。HTML + CSS + vanilla JS を1ファイルに格納
  - UIレイアウト: メッセージ一覧（スクロール可能）＋テキスト入力欄＋送信ボタン
  - ユーザーメッセージ: 右寄せ青バブル / AI応答: 左寄せダークバブル
  - Markdown変換: AI応答にmarkdownToHtml適用（見出し、リスト、コードブロック、太字等）
  - ストリーミング表示: `fetch` + `ReadableStream` でSSEを逐次パース、AI応答をリアルタイム描画（カーソルアニメーション付き）
  - IndexedDB読み書き: `file_id=sessionId`, `category='Chats'`, `file_type='chat'`, `content=JSON.stringify(会話履歴配列)`
  - セッションID: URLパラメータ `session` がない場合は `yyyy-MM-dd-HHmmss` 形式で自動生成
  - タイトル自動生成: 最初のユーザーメッセージの先頭40文字
  - Enter送信 / Shift+Enter改行 / テキストエリア自動リサイズ

**修正ファイル**:
- `vite.config.ts` - `templates.chat` にchatテンプレート読み込み追加（1行）
- `src/utils/webviewUrl.ts` - `buildChatUrl(sessionId)` ヘルパー関数追加

**チャットURL**: `/view/chat?session={sessionId}`
- WebViewアドレスバーに入力 → iframe内にチャットUI表示
- ↗ボタン → ブラウザ別タブで同じチャットを表示
- `/view/chat`（sessionなし） → 新規チャット開始（IDを自動生成）

**データフロー**:
```
① ユーザーがメッセージ入力・送信
② chat.html JS → IndexedDB に会話履歴保存
③ chat.html JS → POST /api/chat/{sessionId}/messages (SSE)
④ chatRoutes → ChatService → Anthropic Claude API
⑤ SSEストリーミング応答 → chat.html がリアルタイム描画
⑥ 応答完了 → IndexedDB にAI応答を追記保存
```

**検証**: WebViewアドレスバーに `/view/chat` 入力→チャットUI表示→メッセージ送信→AIストリーミング応答→会話履歴がIndexedDBに保存。↗ボタンでブラウザ別タブでも同じチャット表示。

#### 15-C: DataGrid複数選択（チェックボックス列）

**目標**: DataGridにチェックボックス列を追加し、複数アイテムを選択可能にする。選択データをAIチャットのコンテキストとして利用する基盤。

**修正ファイル**:
- `src/views/TTColumn.ts` - `_checkedItemIDs: Set<string>` 追加、`toggleChecked(id)`・`setAllChecked(ids, checked)`・`CheckedCount` メソッド/プロパティ追加
- `src/components/DataGrid/DataGrid.tsx` - チェックボックス列追加（固定幅26px）。ヘッダに全選択/全解除チェック、各行に個別チェック。チェッククリックは行選択（`onSelect`）と独立動作（`e.stopPropagation()`）。新Props: `checkedIds`, `onToggleCheck`, `onToggleAllCheck`
- `src/components/DataGrid/DataGridPanel.tsx` - `handleToggleCheck`・`handleToggleAllCheck` ハンドラ追加、DataGridに渡す
- `src/components/DataGrid/DataGrid.css` - `.datagrid-check-cell`/`.datagrid-check-header`/`.datagrid-check`/`.datagrid-check-on` スタイル追加（チェック済みは青色 `#4fc1ff`）

#### 15-D: DataGrid列表示の調整

**修正ファイル**:
- `src/models/TTDataCollection.ts` - `ListPropertiesMin` を `'ID,ContentType,Name'` に変更（種別列をIDとタイトルの間に配置）。ContentType列追加で「☐ | ID | 種別 | タイトル」の4列構成

**検証**: DataGridにチェックボックス列表示。個別チェック/全選択/全解除が動作。チェックと行選択は独立。列順は ☐ → ID → 種別 → タイトル。

---

### Phase 16: チャット-メモ統合

**目標**: DataGridチェック済みアイテム＋TextEditor選択テキストをコンテキストとしたAIチャット。チャット会話をメモとして保存。

#### 16-A: コンテキスト構築とチャット起動フロー

**修正ファイル**:
- `src/views/TTColumn.ts` - `_editorSelection: string` プロパティ追加（TextEditorの選択テキストを保持）。`buildChatContext()` メソッド追加（チェック済みアイテム＋エディタ選択テキストを `{ items: [{id, title, contentType, content}], selection: string }` 形式で返す）。`EditorSelection` セッターで選択有無の変化時は即通知、選択範囲変化時は200msデバウンスで `NotifyUpdated(false)` を呼び出し（行数表示更新用）。`_selectionDebounce: number` フィールド追加
- `src/components/TextEditor/TextEditorPanel.tsx` - `editor.onDidChangeCursorSelection()` イベントハンドラ追加。選択テキストを `column.EditorSelection` に反映
- `src/components/Column/TTColumnView.tsx` - `handleStartChat` コールバック追加。`buildChatContext()` でコンテキスト取得→セッションID（`yyyy-MM-dd-HHmmss`）生成→IndexedDB `_chat_context_{sessionId}` に一時保存→WebViewUrlに `/view/chat?session={id}` をセット。DataGridツールバーに💬ボタン追加（`column.CheckedCount > 0` 時のみ表示、アイコン左・チェック数右の `panel-toolbar-btn-chat` クラス）。TextEditorツールバーにも💬ボタン追加（`column.EditorSelection` が非空の時のみ表示、アイコン左・選択行数右）
- `src/components/Column/TTColumnView.css` - `.panel-toolbar-btn-chat`（`width: auto; padding: 0 6px; gap: 3px`）、`.chat-btn-icon`、`.chat-btn-count`（`color: #4fc1ff; font-size: 10px`）スタイル追加

#### 16-B: チャットUIテンプレート拡張（コンテキスト・メモ保存）

**修正ファイル**:
- `src/view-templates/chat.html` - 全面改修:
  - **コンテキストバー**: IndexedDB `_chat_context_{sessionId}` から読み込み、アイテム名・種別・エディタ選択テキスト・検出URLを表示。読込後一時レコードは削除
  - **URL自動検出**: コンテキストテキスト内のURL(`https?://...`)を正規表現で自動検出し、`POST /api/fetch-urls` でサーバー経由で内容取得
  - **システムプロンプト構築**: `buildSystemPrompt()` でチェック済みアイテム内容＋エディタ選択テキスト＋URL取得内容を結合し、AIへのシステムプロンプトとして送信
  - **チャット自動保存**: 各送受信後にIndexedDB `files` ストアへ `file_type: 'chat'`, `category: 'Chats'` で保存
  - **「メモに保存」ボタン**: 会話内容をMarkdown形式でまとめ、IndexedDB に新規メモとして保存。`file_type: 'memo'`, `category: 'memos'`。タイトルは `{最初のユーザーメッセージ先頭30文字} [Chat:{sessionId}]`。内容は `# Chat Summary [Chat:{sessionId}]` ヘッダー＋各メッセージの `### 🧑 User / ### 🤖 Assistant` セクション（話者がアイコン付きで一目で区別可能）
  - **postMessage通知**: メモ保存・チャット保存後に `window.parent.postMessage({ type: 'thinktank-item-saved', record })` で親ウィンドウに通知し、DataGridにアイテムを即反映

#### 16-C: URL内容取得API

**新規作成ファイル**:
- `server/routes/fetchRoutes.ts` - `POST /api/fetch-urls` エンドポイント。`{ urls: string[] }` を受け取り、最大10URL・10秒タイムアウトで内容取得。HTML はタグ除去してテキスト抽出（最大10000文字）。レスポンス: `{ results: [{ url, text?, error? }] }`

**修正ファイル**:
- `server/index.ts` - `createFetchRoutes` インポート・`/api` ルート登録追加
- `vite.config.ts` - 開発モードでリクエストごとにテンプレートファイルを再読み込みするよう修正（テンプレート編集の即反映）

#### 16-D: iframe→メインアプリ連携（DataGrid即反映）

**修正ファイル**:
- `src/components/WebView/WebViewPanel.tsx` - `window.addEventListener('message')` で `thinktank-item-saved` メッセージをリッスン。受信レコードの `category` からコレクションを特定（`TTModels.GetItem(category)` → 見つからなければ `DatabaseID` で検索）し、`AddOrUpdateFromRecord()` で即座に追加。`TTModels`, `TTDataCollection` インポート追加
- `src/models/TTCollection.ts` - `AddOrUpdateFromRecord(record: FileRecord)` メソッド新規追加（FileRecordからアイテムを追加/更新し `NotifyUpdated(false)` で通知）
- `src/view-templates/chat.html` - `category` を `'memos'`（小文字）に統一し `TTDataCollection.DatabaseID` と一致させる
- `src/App.tsx` - `loadTestData()` の `category` を `'memos'`（小文字）に統一

**検証**: DataGridで複数アイテムをチェック→💬ボタンクリック→WebViewにチャットUI表示。コンテキストバーにチェック済みアイテム一覧表示。メッセージ送信→AIがコンテキストを踏まえた応答をSSEストリーミングで返却。「メモに保存」→新規メモがIndexedDBに作成（タイトル: `{メッセージ} [Chat:yyyy-MM-dd-HHmmss]`、カテゴリ: `memos`）→DataGridに即反映。TextEditorでテキスト選択→💬ボタン表示（選択行数付き）→クリックでチャット起動。

#### 16-E: 旧アプリBQデータ移行と起動時自動差分同期

**目標**: 旧アプリのBigQueryデータ（category='Memo'）を新アプリのIndexedDB（category='memos'）に自動同期する仕組みを実装。別PCで起動しても自動的にBQからデータをロードする。毎回全件フェッチせず、個別アイテムのupdated_atを比較した差分同期とする。

**修正ファイル**:
- `server/services/BigQueryService.ts`:
  - `listFilesFull(category)` 追加 — カテゴリ別content付き全件取得（INNER JOINで重複排除）
  - `getVersions(category?)` 拡張 — カテゴリ引数を追加し、指定時は `WHERE category=@category` でフィルタ（軽量）
  - `getFilesByIds(fileIds, category?)` 追加 — 複数file_idを指定してcontent付きレコードを一括取得
- `server/routes/bigqueryRoutes.ts`:
  - `GET /api/bq/migrate?category=` 追加 — `listFilesFull()` でカテゴリ別全件取得
  - `GET /api/bq/versions?category=` 拡張 — カテゴリ別バージョン情報（file_id + updated_atのみ、軽量）
  - `POST /api/bq/fetch-by-ids` 追加 — `{ fileIds: string[], category?: string }` でcontent付きレコード一括返却
- `src/services/storage/StorageManager.ts`:
  - `syncCategory(localCategory, remoteCategory?)` 追加 — **差分同期アルゴリズム**:
    1. IndexedDBからローカルレコード取得
    2. `GET /api/bq/versions?category=` でBQのバージョン情報のみ取得（file_id + updated_atのみ、数KB程度）
    3. file_idごとにupdated_atを比較し「BQが新しい」または「BQのみ存在」するIDリストを特定
    4. 差分IDのみ `POST /api/bq/fetch-by-ids` でcontent付きフェッチ（500件単位バッチ）
    5. 取得レコードをカテゴリ変換・タイムスタンプ正規化してIndexedDBに保存（100件単位バッチ）
  - `normalizeBqTimestamp()` — BQの `{value: "..."}` 形式タイムスタンプを文字列に正規化
  - `convertRemoteRecord()` — リモートレコードをローカルカテゴリ・タイムスタンプ形式に変換
- `src/models/TTCollection.ts`:
  - `RemoteCategoryID: string = ''` プロパティ追加（BQ側カテゴリ名マッピング用）
  - `LoadCache()` 修正 — `storageManager.isRemoteAvailable` が true の場合 `syncCategory()` を呼び出し、false の場合はローカルのみ `listFiles()` を実行
- `src/models/TTModels.ts`:
  - `this.Memos.RemoteCategoryID = 'Memo'` 追加（BQ側は 'Memo'、IndexedDB側は 'memos' の差異を吸収）
- `src/App.tsx`:
  - テストデータ・手動マイグレーションコードを削除
  - `initStorage()` 内で `storageManager.initialize()` → `memos.LoadCache()`（自動同期含む）→ `syncManager.start()` の順で実行

**同期ログ出力例（初回起動）**:
```
[StorageManager] syncCategory(memos←Memo): BQ has 5525, local has 0, need fetch: 5525, local wins: 0
[StorageManager] syncCategory: fetched 5525 records from BQ, saved to IndexedDB
```
**2回目以降（同期済み）**:
```
[StorageManager] syncCategory(memos←Memo): BQ has 5525, local has 5525, need fetch: 3, local wins: 5522
[StorageManager] syncCategory: fetched 3 records from BQ, saved to IndexedDB
```

#### 16-F: アプリ一括起動コマンドとサーバー起動順序制御

**目標**: `npm run dev` 1コマンドでバックエンド・フロントエンドを正しい順序で起動。ViteがバックエンドAPIより先に起動してBQ同期が失敗する問題を解消。

**修正ファイル**:
- `package.json`:
  - `"dev"` スクリプトを変更: `npm run build:server && concurrently -n server,vite -c blue,green "npm run server:dev" "node server/wait-for-server.mjs && vite"`
  - `concurrently@^9.2.1` を devDependencies に追加
- `server/wait-for-server.mjs` 新規作成 — `http://localhost:8080/api/bq/versions` に500msごとにポーリングし、最大30秒待機後にViteを起動するヘルパースクリプト

**起動フロー**:
1. `npm run build:server` — サーバーTypeScriptをビルド（`dist-server/` 出力）
2. `concurrently` で並列起動:
   - **[server]**: Express + BigQuery + WebSocket (port 8080)
   - **[vite]**: `wait-for-server.mjs` でバックエンド起動確認後にVite起動 (port 5173)

**解消した問題**: Viteがバックエンドより先に起動し `BigQueryStorageService.initialize()` の `/api/bq/versions` が `ECONNREFUSED` で失敗 → `isRemoteAvailable=false` → BQ同期スキップ → ローカルデータのみ表示

#### 16-G: Chat API キー読み込み修正

**問題**: `dotenv` はデフォルトでシステム環境変数に既存キーがある場合に `.env` の値で上書きしない。`ANTHROPIC_API_KEY` が空値でシステム環境変数に存在する場合、`server/.env` の値が無視され `Chat API not available (503)` エラーが発生。

**修正ファイル**:
- `package.json` — `server:dev` スクリプトの `config({ path: 'server/.env' })` を `config({ path: 'server/.env', override: true })` に変更

**確認方法**: サーバー起動ログで `injecting env (3) from server\.env` および `Chat API initialized (model: claude-sonnet-4-6)` が出力されることを確認（変更前は `injecting env (2)` かつ `ANTHROPIC_API_KEY not set, Chat API disabled`）。

#### 16-H: TTChatsコレクションとTTKnowledge統合DataGrid

**目標**: AIチャット会話をIndexedDB + BigQueryの両方に保存（TTChatsコレクション）し、MemoとChatを1つのDataGridに統合表示するTTKnowledgeを実装する。

**背景**: チャット保存はIndexedDBのみだったため、BQ側に永続化されずデバイス間同期されていなかった。また、DataGridはMemoのみ表示しておりChat一覧が表示されなかった。

##### チャット保存のBQ二重書き込み

**修正ファイル**:
- `src/view-templates/chat.html` — `saveChat()` 関数を拡張:
  - IndexedDB `files` ストアへ `{ file_id: sessionId, file_type: 'chat', category: 'chats', ... , _dirty: true }` として即時保存
  - 非同期で `POST /api/bq/files` へ同一レコードを送信
  - BQ保存成功後に IndexedDB のレコードから `_dirty` フラグを削除（次回起動時の再送防止）
  - `category: 'Chats'`（旧）→ `category: 'chats'`（新・小文字に統一）
- `server/index.ts` — `express.json({ limit: '50mb' })` に拡張（チャット内容が大きい場合の `PayloadTooLargeError` 対策）

##### チャットタイトル正規化

**問題**: BQには `title` フィールドにチャット全履歴JSON（`[{"role":"user","content":"..."}]` 形式）が保存されていた。

**修正ファイル**:
- `src/models/TTCollection.ts` — `recordToItem()` 内でチャットタイトルを正規化:
  - `file_type === 'chat'` かつ `title` が `[` または `{` 始まりの場合、JSONとしてパースし、最初の `role==='user'` のメッセージの `content` 先頭40文字をタイトルとして使用
  - パース失敗時はそのまま（フォールバック）

##### md→memo 種別正規化

**修正ファイル**:
- `src/models/TTCollection.ts` — `recordToItem()` 内で `file_type` を表示用 `ContentType` に変換:
  - `'md'` / `'markdown'` / `'text'` → `'memo'` に正規化（DataGridの「種別」列に `md` ではなく `memo` を表示）

##### UTF-8 BOM除去

**修正ファイル**:
- `src/models/TTDataItem.ts` — `setContentSilent()` でコンテンツ先頭の `\uFEFF`（UTF-8 BOM）を除去してからセット（BOM付きmdファイルインポート時の表示崩れ対策）

##### TTKnowledge統合コレクション

**新規作成ファイル**:
- `src/models/TTKnowledge.ts` — `TTDataCollection` を継承した統合コレクションクラス:
  ```typescript
  export class TTKnowledge extends TTDataCollection {
    public SyncCategories: KnowledgeCategory[] = [];
    constructor() { super(); this.ItemSaveProperties = ''; } // 直接Save不要
    public override get HandledCategories(): string[] {
      return this.SyncCategories.map(c => c.localCategory);
    }
    public override async LoadCache(): Promise<void> {
      // SyncCategories を順に syncCategory() し、結果を _children に集約
    }
  }
  ```
  - `KnowledgeCategory: { localCategory: string; remoteCategory?: string }` インターフェース定義
  - 複数カテゴリ（'memos', 'chats'）を1つの配列に集約して DataGrid に提供

**修正ファイル**:
- `src/models/TTCollection.ts`:
  - `recordToItem()` を `private` → `protected` に変更（TTKnowledge でオーバーライド可能に）
  - `HandledCategories: string[]` ゲッターを追加（デフォルト: `[this.DatabaseID || this.ID]`）
  - `CollectionID` フィールド対応: recordToItem 内で `dataItem.CollectionID = record.category` をセット（アイテムの保存先カテゴリを保持）
- `src/models/TTModels.ts`:
  - `Memos: TTDataCollection` と `Chats: TTDataCollection` を削除
  - `Knowledge: TTKnowledge` を追加
  - `SyncCategories` を設定:
    ```typescript
    this.Knowledge.SyncCategories = [
      { localCategory: 'memos', remoteCategory: 'Memo' },   // BQ旧データ
      { localCategory: 'chats', remoteCategory: 'Chats' }, // BQ旧カテゴリ
      { localCategory: 'chats', remoteCategory: 'chats' }, // BQ新カテゴリ
    ];
    ```
  - DataGrid列マッピング: `'ID:ID,Name:タイトル,ContentType:種別,UpdateDate:更新日時'`
- `src/App.tsx`:
  - `models.Memos.LoadCache()` + `models.Chats.LoadCache()` → `models.Knowledge.LoadCache()` に統合
  - `syncManager` の `GetItem(fileId)` 検索対象も `Knowledge` に変更
- `src/components/WebView/WebViewPanel.tsx`:
  - `postMessage` の `category` 解決に `HandledCategories.includes(category)` を使用（TTKnowledgeが複数カテゴリを処理できるよう対応）
- `src/views/TTColumn.ts`:
  - `_dataGridResource: string = 'Knowledge'`（'Memos' → 'Knowledge'）
  - `GetCurrentCollection()` フォールバック: `models.Knowledge`

**検証**:
- DataGridにMemo（種別: memo）とChat（種別: chat）が混在して表示される
- 種別列に `md` ではなく `memo` が表示される
- チャットのタイトルがJSON文字列ではなく最初のユーザー発言の先頭40文字で表示される
- BQ同期ログに `syncCategory(memos←Memo)` と `syncCategory(chats←chats)` の両方が出力される

#### 16-I: DataGridチャットクリックによるチャットUI復元表示

**目標**: DataGridでチャットアイテムをクリックした際、Markdownビューではなくチャット専用UIを WebViewPanel に表示し、保存済み会話を復元する。

**実現方式**:
- `chat.html` の `loadChat()` は既に `sessionId`（= `file_id`）を URL パラメータから取得し、IndexedDB の `files` ストアから `chatHistory` を読み込んで `renderMessages()` で描画する実装が完成している
- `buildChatUrl(sessionId)` → `/view/chat?session={sessionId}` のユーティリティも既存

**修正ファイル**:
- `src/views/TTColumn.ts` — `SelectedItemID` セッターを拡張:
  ```typescript
  public set SelectedItemID(value: string) {
    if (this._selectedItemID === value) return;
    this._selectedItemID = value;
    this._editorResource = value;
    if (value) {
      const collection = this.GetCurrentCollection();
      const item = collection?.GetDataItem(value);
      if (item?.ContentType === 'chat') {
        this._webViewUrl = buildChatUrl(value);       // チャットUI復元
      } else {
        this._webViewUrl = buildMarkdownUrl(this._dataGridResource || 'Knowledge', value);
      }
    } else {
      this._webViewUrl = '';
    }
    this.NotifyUpdated(false);
  }
  ```
  - `buildChatUrl` を `webviewUrl.ts` からインポート追加

**検証**:
1. DataGrid でチャットアイテム（種別: chat）をクリック
2. WebViewPanel が `/view/chat?session={id}` を iframe で表示
3. `chat.html` が IndexedDB から該当 sessionId の会話履歴を読み込み
4. 保存済みチャット（ユーザー発言・AI応答の全ターン）が UI に復元表示される
5. 続きのメッセージ送信も可能（送信時は同一 sessionId で上書き保存）

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

#### Phase 18 実装内容

**新規作成ファイル**:
- `src/services/ColorTheme.ts` - ビジュアルテーマ定義と CSS 変数適用サービス

**修正ファイル**:
- `src/components/TextEditor/TextEditorPanel.tsx` - Monaco カスタムテーマ・`tt-markdown` トークナイザ・Folding
- `src/utils/editorHighlight.ts` - `applyHeadingHighlight` / 見出しCSS注入を削除（Monacoトークナイザに移行）
- `src/App.tsx` - モジュールレベルで `applyColorMode('DefaultOriginal')` 呼び出し追加
- `src/index.css` - `body` に `var(--tt-base-color)` / `var(--tt-editor-fg)` 適用
- `src/components/Layout/AppLayout.css` - `.app-layout` / `.app-statusbar` を CSS 変数化
- `src/components/Column/TTColumnView.css` - 全セレクタを `--tt-*` CSS 変数化
- `src/components/DataGrid/DataGrid.css` - 全セレクタを `--tt-*` CSS 変数化

**実装詳細**:

`ColorTheme.ts`:
- `DefaultDark` / `DefaultOriginal`（reference2 ラベンダー系）の 2 テーマを定義
- `applyColorMode(modeName)` が `document.documentElement` に `--tt-*` CSS 変数をすべてセット、`data-color-mode` 属性も更新
- デフォルトテーマは `DefaultOriginal`（起動時に `App.tsx` から呼び出し）

`TextEditorPanel.tsx`:
- モジュールフラグ `monacoSetupDone` で二重登録防止
- `beforeMount` ハンドラで `tt-markdown` 言語・Monarch トークナイザを登録
  - H1–H6 を色分け（my-dark: `40C040` / `FFB030` / `F080A0` / `5090D0` / `D08060` / `30B0B0`）
  - my-light: `008000` / `CC8500` / `DB7093` / `4682B4` / `A52A2A` / `008080`
- `my-dark` / `my-light` Monaco テーマを `defineTheme` で登録
- `MutationObserver` が `data-color-mode` 変化を検知 → `setMonacoTheme()` でテーマを切替
- 見出しスタックアルゴリズムによる `FoldingRangeProvider` を登録

#### Phase 18-A 追加修正: テーマ統合 CSS 変数・Splitter・スクロールバー・キーワードハイライト入力

**新規作成ファイル**:
- `src/components/Layout/Splitter.css` - Splitter を `var(--tt-border-color)` / hover で `var(--tt-title-bg)` に変更

**修正ファイル**:
- `src/components/Layout/Splitter.tsx` - インラインカラー削除、`Splitter.css` をインポート
- `src/components/DataGrid/DataGrid.css`:
  - `.datagrid-check-cell, .datagrid-check-header` の `border-right` を `var(--tt-border-color)` に変更
  - スクロールバー track/thumb/hover を `var(--tt-base-color)` / `var(--tt-border-color)` / `var(--tt-column-header-fg)` に変更
- `src/components/Column/TTColumnView.css` - キーワードハイライト表示用 CSS 追加（`.keyword-highlight-display` / `.keyword-highlight-word`）
- `src/components/Column/TTColumnView.tsx`:
  - `KeywordTagInput` コンポーネントを追加（TextEditor と同じ色付き背景スパンでキーワードを表示）
  - TextEditor ツールバーの `<input>` を `<KeywordTagInput>` に置換
  - 2 行目の `panel-toolbar-tags` div を削除（Editor 幅が狭くなる問題を解消）

`KeywordTagInput` 動作:
- **表示モード**（非フォーカス・値あり）: カンマ区切り各語を色付き背景スパンで表示（TextEditor のハイライトと同じ見た目）
- **編集モード**（クリック後）: 通常の `<input>` に切り替え、任意の位置を自由に編集可能（中間語の削除・変更も可）
- フォーカスアウトで表示モードに戻る

**検証**: ハイライタバーにキーワード入力→一致箇所がハイライト。セクションFold/Unfold。テーマ切替。キーワードが TextBox 内に色付き背景スパンで表示。クリックで編集モードに切替、任意の語を編集・削除可能。Splitter・スクロールバーがテーマ色に追従。

#### Phase 18-B 追加修正: KeywordTagInput フォーカスバグ修正

**修正ファイル**:
- `src/components/Column/TTColumnView.tsx`

**問題**: `KeywordTagInput` で値が空のとき `<input>` が表示されているが、クリックでフォーカスした後に 1 文字入力すると値が入り条件 `!editing && value.trim()` が true となり `<input>` がアンマウント→フォーカスを失う。

**修正**: `<input>` 要素に `onFocus={() => setEditing(true)}` を追加。クリック時点で `editing=true` にすることで値が入っても表示モードに切り替わらない。

#### Phase 18-C 追加修正: ハイライト適用範囲の拡大と設定

**目標**: TextEditor 以外の UI 領域（パネルタイトル・DataGrid・WebView・各ツールバー入力）にもキーワードハイライトを適用可能にし、項目ごとに ON/OFF を切り替えられるようにする。

**新規作成ファイル**:
- `src/utils/highlightSpans.tsx`
  - `highlightTextSpans(text, keyword)` : テキスト内キーワードを `KEYWORD_COLORS` で色付けした ReactNode に変換
  - `applyIframeHighlight(doc, keyword)` : 同一オリジン iframe の `contentDocument` 内テキストノードに DOM 操作でハイライト適用（`.tt-hl` マークで管理）

**修正ファイル**:
- `src/types/index.ts` - `HighlightTargets` インターフェース追加（`panelTitle` / `dataGrid` / `webView` / `dataGridToolbar` / `webViewToolbar` の 5 フラグ）
- `src/views/TTColumn.ts`
  - `_highlightTargets: HighlightTargets` プロパティ追加（デフォルトすべて `false`）
  - `toggleHighlightTarget(key)` メソッド追加
  - `SerializeState` / `RestoreState` に `HighlightTargets`（JSON文字列）を追加
- `src/components/DataGrid/DataGrid.tsx` - `highlightKeyword?: string` prop 追加。行セルのテキスト描画を `highlightTextSpans()` に対応
- `src/components/DataGrid/DataGridPanel.tsx` - `column.HighlightTargets.dataGrid` が ON のとき `highlightKeyword` を DataGrid に渡す
- `src/components/WebView/WebViewPanel.tsx`
  - `column.AddOnUpdate` パターンで `applyIframeHighlight` をキーワード変更時に再適用
  - iframe の `load` イベント + 既ロード済み即時実行（`readyState === 'complete'` チェック）でロード時ハイライト適用
  - `contentDocument.pointerdown` を監視してパネルフォーカス取得（同一オリジン）
- `src/components/Column/TTColumnView.tsx`
  - `HL_TARGET_DEFS` 定数（5 項目のトグルボタン定義）追加
  - `HighlightableInput` コンポーネント追加（非編集中にキーワードをインラインハイライト表示、クリックで編集可能）
  - TextEditor ツールバー右端に 5 つのトグルボタン [T][G][W][F][A] を追加
  - DataGrid / WebView ツールバー入力を `HighlightableInput` に置換
  - パネルタイトル行に `highlightTextSpans()` を適用（`panelTitle` ON 時）
- `src/components/Column/TTColumnView.css` - `.hl-target-btn` / `.hl-target-btn-on` / `.hl-target-toggles` / `.highlight-text-display` スタイル追加

**ハイライト対象ボタン**:
| ボタン | key | 対象 |
|--------|-----|------|
| T | `panelTitle` | 全パネルタイトル行テキスト |
| G | `dataGrid` | DataGrid 行セルテキスト |
| W | `webView` | WebView iframe 内テキスト（同一オリジン） |
| F | `dataGridToolbar` | DataGrid フィルタ入力テキスト |
| A | `webViewToolbar` | WebView アドレス入力テキスト |

**WebView ハイライトの技術的詳細**:
- `load` イベントリスナーを登録しつつ、effect 実行時点で既にロード済みの場合は `handleLoad()` を即時呼び出す（Vite HMR / 高速表示対策）
- キーワード変更は `AddOnUpdate` コールバック内で `iframeRef.current.contentDocument` を直接参照して再適用（`useEffect` 依存配列方式は `HighlightTargets` オブジェクト参照変化を正確に捉えられないため廃止）

**検証**: Highlight 入力にキーワード設定後、各トグルボタンを ON にすると対応箇所がハイライト。ボタン OFF で即解除。設定はセッション間で保持。WebView ロード後・ページ切替後も自動ハイライト適用。

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
- `src/components/UI/StatusBar.tsx` - ステータスバー（※基本のステータスバーはPhase 5でAppLayout内に実装済み。Phase 21で拡張）

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
