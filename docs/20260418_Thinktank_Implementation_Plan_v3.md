# Thinktank 実装プラン v3
**作成日**: 2026-04-18  
**変更点**: UIをObsidianライクなレイアウトに全面再設計

---

## Context

多忙・高齢ユーザー向けの**記憶・思考・判断支援アプリ**を新規開発する。  
UIを「リボン + 左右サブパネル + タブ付きメインパネル」構成に刷新する。

---

## 1. 目標

ユーザーの日々の入力（メモ・ファイル・写真・メール・AIとの会話）を全て記録・蓄積し、以下を実現する：

1. **記憶支援** - 「あの日何をした？」「あの件どうなった？」への想起補助
2. **思考支援** - 視点・材料の提示、概略説明の自動生成
3. **判断支援** - 意思決定のための構造化・過去類似判断の検索

---

## 2. UIレイアウト

```
┌─────────────────────────────────────────────────────────────────┐
│ [R] │ [左パネル]        │S│ [メインパネル]             │S│ [右パネル]     │
│ i  │                   │ │ [Tab1][Tab2][Tab3]   [+] │ │                │
│ b  │ アイコンメニュー   │ │──────────────────────────│ │ アイコンメニュー│
│ b  │──────────────────│ │                          │ │────────────────│
│ o  │ DataGrid          │ │   TextEditor             │ │ アウトライン   │
│ n  │ （ナビゲーター）   │ │   Markdown               │ │ プロパティ     │
│    │                   │ │   DataGridビュー          │ │ 関連アイテム   │
│    │                   │ │   グラフビュー            │ │ Chat           │
│    │                   │ │   Chatビュー              │ │                │
└─────────────────────────────────────────────────────────────────┘
```

- **リボン（最左辺）**: 縦並びアイコン。クリックで左パネルの種類を切替、または機能を実行
- **左パネル**: ボタン（リボン）で開閉可能なサブパネル。上部にアイコンメニュー。幅はSplitterで変更可能
- **メインパネル**: タブ付き。複数の「表示セット」を同時に開ける。タブは閉じられる
- **右パネル**: ボタン（リボン右端 or ツールバー）で開閉可能なサブパネル。上部にアイコンメニュー。幅はSplitterで変更可能
- **S**: Splitterバー（ドラッグでパネル幅を変更）

---

## 3. デザイン仕様

### カラーパレット（Obsidian / Tokyo Nightライク）

```css
--bg-primary:     #1e2030;   /* メイン背景 */
--bg-secondary:   #1a1b26;   /* サイドバー背景 */
--bg-panel:       #24283b;   /* カード・パネル背景 */
--bg-hover:       #2a3050;   /* ホバー背景 */
--bg-selected:    #2e3460;   /* 選択行背景 */
--text-primary:   #c0caf5;   /* メインテキスト */
--text-muted:     #565f89;   /* 補助テキスト・ラベル */
--text-accent:    #7aa2f7;   /* リンク・アクセント */
--text-highlight: #e0af68;   /* ハイライト・見出しH1 */
--border:         #292e42;   /* サブトルな区切り線 */
--border-focus:   #7aa2f7;   /* フォーカス枠 */
--radius:         6px;       /* 角丸の基本値 */
```

### デザイン原則

- **線で区切らない**: 機能領域は背景色差または `border-radius: 6px` の丸角ボックスで区別する
- **フォント**: `'Inter', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif`、基本13px
- **アイコン**: Lucide Icons（軽量・統一感）
- **スクロールバー**: 細く（幅6px）、背景に溶け込む色。ホバー時のみ目立たせる
- **トランジション**: パネル開閉 200ms ease、ホバー 120ms
- **ステータスバーなし**: 情報はパネルタイトル・タブに統合

---

## 4. アーキテクチャ概要

### コンポーネント階層（新設計）

```
TTApplication（最上位コントローラ）
├── TTLeftPanel（左サブパネル）
│   └── PanelType: 'navigator' | 'search' | 'tags' | 'recent'
├── TTMainPanel（メインパネル）
│   └── TTTab[]（各タブ）
│       └── ViewType: 'texteditor' | 'markdown' | 'datagrid' | 'graph' | 'chat'
└── TTRightPanel（右サブパネル）
    └── PanelType: 'outline' | 'properties' | 'related' | 'chat'
```

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | React 18 + TypeScript 5 + Vite 5 |
| エディタ | Monaco Editor (@monaco-editor/react) |
| Markdown | marked + highlight.js |
| 仮想リスト | @tanstack/react-virtual |
| グラフ表示 | react-force-graph |
| アイコン | lucide-react |
| Backend | Express 5 + Node.js + TypeScript |
| DB（クラウド）| Google BigQuery（単一テーブル + categoryクラスタリング） |
| DB（ローカル）| IndexedDB（オフラインキャッシュ） |
| リアルタイム同期 | WebSocket (ws) |
| AI | Claude API（@anthropic-ai/sdk） |

### 主要設計方針（v2から継承）

1. **Observerパターン** - TTObject基底クラスの `NotifyUpdated()` で状態変更を通知、Reactが購読
2. **TTCollectionによるデータ管理** - CRUD・CSV直列化・デバウンス自動保存
3. **単一BigQueryテーブル** - `thinktank.files` テーブルに全データを格納、`category` 列でクラスタリング
4. **デュアルライト** - IndexedDB即時保存 → BigQuery非同期。ダーティキューで再送
5. **WebSocket同期** - マルチタブ・マルチデバイス間のリアルタイム更新
6. **ID = 作成日時** - `yyyy-MM-dd-HHmmss` 形式

---

## 5. データモデル

### 基底クラス（v2から変更なし）

**TTObject** - 全モデルの基底
```typescript
ID: string              // yyyy-MM-dd-HHmmss形式
Name: string
UpdateDate: string
// Observer: AddOnUpdate(), RemoveOnUpdate(), NotifyUpdated()
```

**TTCollection**（TTObject継承）
```typescript
_children: Map<string, TTObject>
DatabaseID: string
ColumnMapping: Record<string, string>
ColumnMaxWidth: Record<string, number>
// Add(), Remove(), Find(), Filter(), SaveCache(), LoadCache()
```

**TTDataItem**（TTObject継承）
```typescript
ContentType: 'memo' | 'chat' | 'url' | 'file' | 'photo' | 'email' | 'drive'
Content: string
Keywords: string
CollectionID: string
RelatedIDs: string
```

**TTKnowledge**（TTCollection継承）- MemoとChatを統合するコレクション

### ビューモデル（新設計）

**TTTab** - メインパネルの1タブ
```typescript
ID: string
Title: string
ViewType: 'texteditor' | 'markdown' | 'datagrid' | 'graph' | 'chat'
ResourceID: string          // 表示中のアイテムID
Filter: string              // DataGridビュー用フィルタ
HighlightKeyword: string    // ハイライトキーワード
IsDirty: boolean            // 未保存変更あり
```

**TTMainPanel**（TTObject継承）
```typescript
Tabs: TTTab[]
ActiveTabID: string
// OpenTab(), CloseTab(), SwitchTab(), NewTab()
// ActiveViewType: 現在アクティブなタブのViewType
```

**TTLeftPanel**（TTObject継承）
```typescript
IsOpen: boolean
Width: number               // px、localStorageで永続化
PanelType: 'navigator' | 'search' | 'tags' | 'recent'
Filter: string              // ナビゲーターフィルタ
SelectedItemID: string      // 選択中アイテム → メインパネルに反映
```

**TTRightPanel**（TTObject継承）
```typescript
IsOpen: boolean
Width: number
PanelType: 'outline' | 'properties' | 'related' | 'chat'
ChatMessages: ChatMessage[]
ChatInput: string
```

**TTApplication**（最上位）
```typescript
LeftPanel: TTLeftPanel
MainPanel: TTMainPanel
RightPanel: TTRightPanel
ActiveViewType: ViewType    // リボンメニューで切替、新タブ作成時のデフォルト
// OpenItem(id): 左パネル選択時にメインパネルで開く
// NewTabWithView(viewType): 新しいタブで指定ビューを開く
```

---

## 6. BigQueryスキーマ

```sql
CREATE TABLE `thinktank.files` (
  file_id     STRING    NOT NULL,
  title       STRING,
  file_type   STRING    NOT NULL,
  category    STRING,
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

## 7. ディレクトリ構成

```
ThinktankWebCC/
├── reference2/             # 現行コードの退避（参考）
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css           # CSS変数・グローバルリセット
│   ├── models/
│   │   ├── TTObject.ts
│   │   ├── TTCollection.ts
│   │   ├── TTDataItem.ts
│   │   ├── TTKnowledge.ts
│   │   ├── TTModels.ts
│   │   ├── TTStatus.ts
│   │   ├── TTAction.ts
│   │   └── TTEvent.ts
│   ├── views/
│   │   ├── TTApplication.ts
│   │   ├── TTMainPanel.ts
│   │   ├── TTTab.ts
│   │   ├── TTLeftPanel.ts
│   │   ├── TTRightPanel.ts
│   │   └── helpers/
│   │       ├── DateHelper.ts
│   │       └── TagParser.ts
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── AppLayout.tsx + .css      # 全体グリッド配置
│   │   │   ├── Ribbon.tsx + .css         # 最左辺アイコンリボン
│   │   │   └── Splitter.tsx + .css       # リサイズバー
│   │   ├── LeftPanel/
│   │   │   ├── LeftPanel.tsx + .css      # 左パネルコンテナ（開閉・幅）
│   │   │   ├── LeftPanelHeader.tsx       # アイコンメニュー行
│   │   │   ├── NavigatorView.tsx         # ナビゲーター（DataGrid）
│   │   │   ├── SearchView.tsx            # 検索パネル
│   │   │   ├── TagsView.tsx              # タグ一覧
│   │   │   └── RecentView.tsx            # 最近のアイテム
│   │   ├── MainPanel/
│   │   │   ├── MainPanel.tsx + .css      # タブバー + コンテンツ
│   │   │   ├── TabBar.tsx + .css         # タブ一覧・タブ操作
│   │   │   ├── views/
│   │   │   │   ├── TextEditorView.tsx    # Monaco Editor
│   │   │   │   ├── MarkdownView.tsx      # Markdownレンダリング
│   │   │   │   ├── DataGridView.tsx      # テーブル表示
│   │   │   │   ├── GraphView.tsx         # react-force-graph
│   │   │   │   └── ChatView.tsx          # CLIチャット
│   │   │   └── EmptyState.tsx            # タブなし時の表示
│   │   ├── RightPanel/
│   │   │   ├── RightPanel.tsx + .css     # 右パネルコンテナ
│   │   │   ├── RightPanelHeader.tsx      # アイコンメニュー行
│   │   │   ├── OutlineView.tsx           # アウトライン（見出し一覧）
│   │   │   ├── PropertiesView.tsx        # アイテムメタデータ
│   │   │   ├── RelatedView.tsx           # 関連アイテム
│   │   │   └── RightChatView.tsx         # チャット（右パネル版）
│   │   └── UI/
│   │       ├── ContextMenu.tsx
│   │       ├── CommandPalette.tsx
│   │       └── Toast.tsx
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
│   │       ├── NavigatorActions.ts
│   │       ├── EditorActions.ts
│   │       └── TabActions.ts
│   ├── hooks/
│   │   └── useAppUpdate.ts
│   ├── utils/
│   │   ├── csv.ts
│   │   ├── markdownToHtml.ts
│   │   ├── editorHighlight.ts
│   │   ├── highlightSpans.tsx
│   │   └── webviewUrl.ts
│   └── types/
│       └── index.ts
├── server/
│   ├── index.ts
│   ├── tsconfig.json
│   ├── wait-for-server.mjs
│   ├── middleware/authMiddleware.ts
│   ├── routes/
│   │   ├── bigqueryRoutes.ts
│   │   ├── chatRoutes.ts
│   │   ├── searchRoutes.ts
│   │   ├── relatedRoutes.ts
│   │   ├── fetchRoutes.ts
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
    ├── events.tsv
    └── menus.tsv
```

---

## 8. 実装フェーズ

---

### Phase 1: プロジェクト初期化

**目標**: 空のVite + React + TypeScriptプロジェクトを構築する。

**作業**:
- 既存ソースを `reference2/` に退避
- Vite + React + TypeScript + Monaco Editor + react-force-graph + lucide-react + marked をセットアップ
- `index.css` にCSS変数（カラーパレット全量）を定義
- `src/main.tsx`, `src/App.tsx` 最小構成を作成

**検証**: `npm run dev` → ブラウザに「Thinktank」タイトルの空ページが表示される。CSS変数が適用されている。

---

### Phase 2: データモデル基盤（TTObject・TTCollection）

**目標**: Observerパターンの基底クラスとコレクション管理クラスを実装する。

**新規作成**:
- `src/models/TTObject.ts` - Observer基盤（AddOnUpdate / RemoveOnUpdate / NotifyUpdated）
- `src/models/TTCollection.ts` - Map管理、CSV直列化、5秒デバウンス自動保存
- `src/utils/csv.ts`
- `src/types/index.ts`

**検証**: コンソールでTTObject/TTCollectionのCRUDとObserver通知が動作する。

---

### Phase 3: アプリケーションモデル（TTDataItem・TTModels）

**目標**: 統一コンテンツモデルとアプリ全体のモデルルートを構築する。

**新規作成**:
- `src/models/TTDataItem.ts`
- `src/models/TTStatus.ts`
- `src/models/TTAction.ts`
- `src/models/TTEvent.ts`
- `src/models/TTModels.ts` - ルートシングルトン

**検証**: TTModelsシングルトンからMemoコレクションにアイテムを追加・取得できる。

---

### Phase 4: ビューモデル（TTTab・TTMainPanel・TTLeftPanel・TTRightPanel・TTApplication）

**目標**: 新UIアーキテクチャのビューモデルを実装する。

**新規作成**:
- `src/views/TTTab.ts` - タブ（ViewType・ResourceID・HighlightKeyword・IsDirty）
- `src/views/TTMainPanel.ts` - タブ管理（OpenTab / CloseTab / SwitchTab / NewTab）
- `src/views/TTLeftPanel.ts` - 左パネル（IsOpen / Width / PanelType / Filter / SelectedItemID）
- `src/views/TTRightPanel.ts` - 右パネル（IsOpen / Width / PanelType / ChatMessages）
- `src/views/TTApplication.ts` - 最上位コントローラ（LeftPanel / MainPanel / RightPanel を保持、OpenItem() で左パネル選択→メインパネルで開く）
- `src/views/helpers/DateHelper.ts`

**検証**: TTApplicationを初期化し、タブを開く・切り替える・閉じる操作がObserver通知を伴って動作する。

---

### Phase 5: Obsidianライクレイアウトシェル

**目標**: リボン・左右サブパネル・メインパネルの骨格UIを構築する。

**新規作成**:
- `src/components/Layout/AppLayout.tsx + .css` - CSS Grid: `[ribbon][left-panel][splitter][main-panel][splitter][right-panel]`
- `src/components/Layout/Ribbon.tsx + .css` - 縦並びアイコンリボン。上部グループ（ナビゲーター・検索・タグ・最近）と下部グループ（設定等）に分ける
- `src/components/Layout/Splitter.tsx + .css` - ドラッグによるパネル幅変更（横方向のみ）
- `src/components/LeftPanel/LeftPanel.tsx + .css` - 開閉アニメーション付きサイドパネルコンテナ
- `src/components/LeftPanel/LeftPanelHeader.tsx` - アイコンメニュー行（パネル種別切替）
- `src/components/RightPanel/RightPanel.tsx + .css` - 右パネルコンテナ
- `src/components/RightPanel/RightPanelHeader.tsx` - アイコンメニュー行
- `src/components/MainPanel/MainPanel.tsx + .css` - メインパネルコンテナ（タブバー + コンテンツエリア）
- `src/components/MainPanel/TabBar.tsx + .css` - タブ一覧・追加ボタン・クローズボタン
- `src/components/MainPanel/EmptyState.tsx` - タブなし時の中央表示
- `src/hooks/useAppUpdate.ts` - TTObjectのObserverをReact useReducerに接続

**デザイン詳細**:
- リボン幅: 44px固定。アイコン32px、アクティブ状態は `--bg-hover` 背景 + `--text-accent` 色
- 左右パネルのデフォルト幅: 260px。最小100px、最大600px
- タブバー: 高さ36px。アクティブタブは `--bg-panel` 背景 + 上辺に `--text-accent` ボーダー
- パネル開閉: `width: 0` → `width: Npx` のCSS transition（200ms ease）
- アウトラインや区切りではなく、`--bg-secondary`/`--bg-primary` の背景色差で領域を分ける

**検証**: リボンアイコンクリックで左パネルが開閉する。Splitterで幅を変更できる。右パネルも同様に動作する。タブバーにタブが表示される。

---

### Phase 6: 左パネル - ナビゲーター（DataGrid）

**目標**: 左パネルのナビゲーターにアイテム一覧を表示し、クリックでメインパネルでアイテムを開く。

**新規作成**:
- `src/components/LeftPanel/NavigatorView.tsx` - @tanstack/react-virtualによる仮想スクロールリスト

**仕様**:
- 各行: `[アイコン] タイトル` の形式（ContentTypeに応じたアイコン）
- フィルタ入力欄をパネルヘッダー直下に配置（プレースホルダ「絞り込み...」）
- フィルタ構文: スペース=AND、カンマ=OR、`-`=NOT
- 選択中アイテムは `--bg-selected` 背景
- アイテムクリック → `TTApplication.OpenItem(id)` → メインパネルに新タブで開く（既存タブがあれば切替）

**検証**: テストデータ12件が左パネルに表示される。フィルタが動作する。クリックでメインパネルにコンテンツが開く。

---

### Phase 7: メインパネル - TextEditorビュー（Monaco）

**目標**: メインパネルでMonaco Editorによるテキスト編集ビューを実装する。

**新規作成**:
- `src/components/MainPanel/views/TextEditorView.tsx`

**仕様**:
- Monaco設定: language=markdown、カスタムテーマ（`--bg-primary` 背景、`--text-primary` テキスト）
- minimap非表示、wordWrap=on、lineNumbers=off
- 編集内容はリアルタイムでTTDataItem.Contentに書き戻す（TabのIsDirtyをtrueに）
- Ctrl+S で保存（IsDirtyをfalseに、タブタイトルの `●` を消す）
- 未保存変更があるタブにはタブ名の前に `●` を表示

**検証**: 左パネルでアイテムを選択→TextEditorビューでコンテンツが開く・編集できる。

---

### Phase 8: メインパネル - Markdownビュー

**目標**: メインパネルでMarkdownレンダリングビューを実装する。

**新規作成**:
- `src/components/MainPanel/views/MarkdownView.tsx`
- `src/utils/markdownToHtml.ts` - markedによるMarkdown→HTML変換（GFMテーブル・シンタックスハイライト対応）

**仕様**:
- `--text-primary` / `--bg-primary` 配色でMarkdownをレンダリング
- 見出し(H1-H4)をカラー変数（`--text-highlight` 等）で色分け
- `[Memo:ID]` `[Chat:ID]` 等の独自タグもクリッカブルリンクとして表示
- 外部URL: 新タブで開く
- TextEditorビューとMarkdownビューはタブ内でトグル可能（右上の切替ボタン）

**検証**: アイテムのMarkdownが正しくレンダリングされる。テーブル・コードブロック・見出し色分けが動作する。

---

### Phase 9: メインパネル - DataGridビュー（テーブル表示）

**目標**: メインパネルでコレクション全体をテーブル形式で表示するビューを実装する。左パネルのナビゲーターより多くの列情報を表示する。

**新規作成**:
- `src/components/MainPanel/views/DataGridView.tsx`

**仕様**:
- @tanstack/react-virtualによる仮想スクロール
- 列: チェックボックス・ID・ContentType・タイトル・更新日時
- ヘッダクリックでソート切替
- フィルタ入力欄をビュー上部に配置（AND/OR/NOT構文）
- チェックボックスで複数選択→AIチャット起動ボタン💬を表示
- 行クリックでTextEditorビューのタブに切替/新規オープン

**検証**: DataGridビューに全アイテムが表示される。ソート・フィルタ・複数選択が動作する。

---

### Phase 10: メインパネル - グラフビュー（react-force-graph）

**目標**: アイテム間の関連をノードグラフで表示するビューを実装する。

**新規作成**:
- `src/components/MainPanel/views/GraphView.tsx`

**仕様**:
- `react-force-graph` を使用
- ノード: 各TTDataItem（ContentTypeに応じた色分け）
- エッジ: RelatedIDs / タグリンク（`[Memo:ID]` 等）を解析して接続
- ノードクリックで当該アイテムをメインパネルで開く
- ズーム・パン対応
- `--bg-primary` 背景。ノードラベルは `--text-muted` 色

**検証**: アイテム間の関連がグラフで表示される。ノードクリックでアイテムが開く。

---

### Phase 11: メインパネル - Chatビュー

**目標**: メインパネルでAIとのチャットビューを実装する。右パネルのChatビューと共通のデータモデルを使用する。

**新規作成**:
- `src/components/MainPanel/views/ChatView.tsx`

**仕様**:
- ユーザー発言: `> {text}` 右寄せ（`--text-accent` 色）
- AI応答: Markdownレンダリング（左側）
- ストリーミング表示（末尾カーソル点滅）
- 入力欄: 下部固定、Enter送信/Shift+Enter改行
- 会話履歴はIndexedDBに保存（file_type='chat', category='chats'）
- DataGridビューでチェックしたアイテムをコンテキストとして渡せる

**検証**: チャットビューでメッセージ送信→AIがストリーミング応答する。

---

### Phase 12: 右パネル - アウトライン・プロパティ・関連

**目標**: 右パネルの各ビューを実装する。

**新規作成**:
- `src/components/RightPanel/OutlineView.tsx` - アクティブタブのMarkdown見出し一覧。クリックで該当箇所にジャンプ
- `src/components/RightPanel/PropertiesView.tsx` - ID・ContentType・作成日時・更新日時・Keywords等を表示・編集
- `src/components/RightPanel/RelatedView.tsx` - RelatedIDsと同キーワードを持つアイテムの一覧
- `src/components/RightPanel/RightChatView.tsx` - コンパクトなチャットビュー（Phase 11と共通ロジック）

**仕様**:
- 右パネル上部のアイコンメニューで表示ビューを切替
- アウトライン: アクティブなTextEditorの内容から `#`見出しを抽出してリスト表示
- 関連: アクティブアイテムのRelatedIDsを解析してアイテムタイトルをリスト表示。クリックでナビゲート

**検証**: アクティブなTextEditorの見出しがアウトラインパネルに表示される。見出しクリックでエディタがスクロールする。

---

### Phase 13: バックエンド基盤（Express + BigQuery）

**目標**: REST APIサーバーとBigQueryストレージを構築する。

**新規作成**:
- `server/index.ts` - Express 5 + WebSocket(ws)サーバー（ポート8080）
- `server/tsconfig.json`
- `server/middleware/authMiddleware.ts` - HMAC-SHA256 Cookie認証
- `server/services/BigQueryService.ts` - MERGE文Upsert、concurrent update自動リトライ（指数バックオフ）
- `server/routes/bigqueryRoutes.ts` - CRUD API（60秒デバウンス書き込み、直列DMLキュー）

**APIエンドポイント**:
| メソッド | パス | 機能 |
|---------|------|------|
| GET | `/api/bq/files` | ファイル一覧（`?category=`, `?since=`） |
| GET | `/api/bq/files/:id` | 単一ファイル取得 |
| POST | `/api/bq/files` | ファイル保存（Upsert） |
| DELETE | `/api/bq/files/:id` | ファイル削除 |
| GET | `/api/bq/ttsearch?q=` | 全文検索 |
| GET | `/api/bq/versions` | バージョン情報（差分同期用） |
| POST | `/api/bq/fetch-by-ids` | 複数IDで一括取得 |
| POST | `/api/bq/bulk` | 一括保存 |

**重要**: 既存BigQueryデータは削除しない。テーブルが存在しない場合のみ作成。

**検証**: `GET /api/bq/files` でBigQueryからデータ取得できる。

---

### Phase 14: ストレージ・同期基盤（IndexedDB + WebSocket）

**目標**: フロントエンドのストレージ抽象化、IndexedDBオフラインキャッシュ、WebSocket同期を実装する。

**新規作成**:
- `src/services/storage/IStorageService.ts` - FileRecord型・`_dirty`フラグ
- `src/services/storage/IndexedDBStorageService.ts` - DB名`thinktank`、`files`ストア、`by_category`/`by_dirty`インデックス
- `src/services/storage/BigQueryStorageService.ts` - REST APIラッパー
- `src/services/storage/StorageManager.ts` - デュアルライト管理（IndexedDB即時 → BQ非同期）
- `src/services/sync/WebSocketService.ts` - 指数バックオフ自動再接続
- `src/services/sync/SyncManager.ts` - リモート更新→ローカル適用

**オフライン同期**:
- BQ失敗時は `_dirty=true` でIndexedDBに保持 → 次回接続時にflushDirtyQueue()
- ローカル/リモートの `updated_at` 比較で「新しい方が勝つ」マージ

**検証**: アイテム保存→IndexedDBとBQの両方に書き込まれる。別タブの変更がリアルタイム反映される。

---

### Phase 15: データ差分同期と起動フロー

**目標**: BigQueryとの起動時差分同期と、順序保証された起動フローを実装する。

**修正**:
- `server/services/BigQueryService.ts` - `getVersions(category?)`, `getFilesByIds()` を追加
- `src/services/storage/StorageManager.ts` - `syncCategory()` を追加（BQバージョン情報のみ先取得→差分IDのみcontent付きフェッチ）
- `package.json` - `concurrently` でバックエンド起動確認後にViteを起動する `dev` スクリプト
- `server/wait-for-server.mjs` - バックエンド起動完了をポーリングで待つヘルパー

**検証**: 初回起動でBQからデータが差分同期される。`npm run dev` 1コマンドで正しい順序で起動できる。

---

### Phase 16: TTKnowledge統合コレクション

**目標**: MemoとChatを1つのナビゲーターに統合表示するTTKnowledgeコレクションを実装する。

**新規作成**:
- `src/models/TTKnowledge.ts` - TTCollectionを継承。`SyncCategories` で複数カテゴリを集約

**修正**:
- `src/models/TTModels.ts` - `Knowledge: TTKnowledge` を追加（SyncCategories: memos/chats）
- `src/models/TTCollection.ts` - `recordToItem()` でchatsタイトルをユーザー発言先頭40文字から生成。`file_type='md'/'text'` を `'memo'` に正規化

**検証**: ナビゲーターにMemoとChatが混在表示される。

---

### Phase 17: AIチャットAPI

**目標**: Claude APIを使ったSSEストリーミングチャットAPIをバックエンドに実装する。

**新規作成**:
- `server/services/ChatService.ts` - Anthropic SDK、SSEストリーミング応答
- `server/routes/chatRoutes.ts` - `POST /api/chat/:sessionId/messages`
- `server/routes/fetchRoutes.ts` - `POST /api/fetch-urls`（URL内容取得プロキシ）

**環境変数** (`server/.env`):
- `ANTHROPIC_API_KEY`（dotenvは `override: true` で読み込む）
- `ANTHROPIC_MODEL`（デフォルト `claude-sonnet-4-6`）

**検証**: チャットビューからメッセージを送信→SSEでAI応答が逐次返される。

---

### Phase 18: チャット-メモ統合

**目標**: DataGridビューでチェックしたアイテムをコンテキストとしてチャットを起動し、会話をメモとして保存する。チャットデータをBQにも永続化する。

**修正**:
- `src/views/TTMainPanel.ts` - `StartChatWithContext(checkedIds, editorSelection)` でチャットタブを開く
- `src/components/MainPanel/views/ChatView.tsx` - コンテキストバー表示（チェック済みアイテム一覧）。「メモに保存」ボタン（会話をMarkdown形式で新規メモとして保存）。BQへの保存も実行
- `src/views/TTApplication.ts` - メモ保存後にナビゲーターを更新

**検証**: DataGridビューでアイテムをチェック→💬ボタン→チャットビューが開きコンテキスト表示。「メモに保存」→ナビゲーターに即反映。

---

### Phase 19: TextEditorタグシステム

**目標**: Monaco Editor内のクリッカブルタグを実装する。

**新規作成**:
- `src/views/helpers/TagParser.ts`
- `src/services/TagLinkProvider.ts` - Monaco用リンクプロバイダ

**タグ一覧**:
| タグ | 動作 |
|------|------|
| `[Memo:yyyy-MM-dd-HHmmss]` | 当該メモをメインパネルで開く |
| `[Chat:yyyy-MM-dd-HHmmss]` | チャットビューで開く |
| URL（`https://...`） | ブラウザ新タブで開く |
| `[yyyy-MM-dd]` | ナビゲーターに日付フィルタを設定 |
| `[search:キーワード]` | 検索パネルを開く |

**検証**: エディタ内タグが色付き・クリッカブル。クリックで対応アクションが実行される。

---

### Phase 20: TextEditorハイライト・Folding・テーマ

**目標**: Monacoカスタムトークナイザによる見出し色分け、Folding、ビジュアルテーマを実装する。

**新規作成**:
- `src/services/ColorTheme.ts` - CSS変数テーマ定義。`applyColorMode()` でdocumentに適用

**修正**:
- `src/components/MainPanel/views/TextEditorView.tsx` - `tt-markdown` カスタム言語・Monarchトークナイザ登録（H1-H6を `--text-highlight` 等CSS変数ベースで色分け）。見出しFoldingRangeProvider登録
- `src/utils/editorHighlight.ts` - キーワードハイライト（スペース=AND色グループ、カンマ=別色グループ）。カーソル位置ワードの自動ハイライト

**検証**: Markdown見出しがH1-H6で色分け表示。セクションFold/Unfold動作。キーワードハイライト動作。

---

### Phase 21: ハイライト適用範囲の拡大

**目標**: ナビゲーター・アウトライン・Markdownビューにもキーワードハイライトを適用する。

**新規作成**:
- `src/utils/highlightSpans.tsx` - テキスト内キーワードをReactNodeに変換

**修正**:
- `src/views/TTTab.ts` - `HighlightTargets` フラグ（navigator / markdownView / outline）を追加
- `src/components/LeftPanel/NavigatorView.tsx` - `highlightTextSpans()` 対応
- `src/components/MainPanel/views/MarkdownView.tsx` - ハイライト対応
- `src/components/RightPanel/OutlineView.tsx` - ハイライト対応
- `src/components/MainPanel/views/TextEditorView.tsx` - ツールバーにハイライト対象トグルボタン追加

**検証**: キーワード設定後、各トグルをONにすると対応箇所がハイライトされる。

---

### Phase 22: 全文検索パネル

**目標**: 左パネルの検索ビューでメモ・チャット横断の全文検索を実装する。

**新規作成**:
- `src/components/LeftPanel/SearchView.tsx` - 検索入力 + 結果リスト
- `server/routes/searchRoutes.ts` + `server/services/SearchService.ts` - BigQuery全文検索API

**仕様**:
- 入力後エンター or 200msデバウンスで検索実行
- 結果リストは `--bg-panel` カードで表示（タイトル + マッチした文脈スニペット）
- 結果クリックでメインパネルにアイテムを開く

**検証**: 検索パネルでキーワード入力→結果リスト表示。クリックでアイテムが開く。

---

### Phase 23: 関連コンテンツ

**目標**: 右パネルの関連ビューで現在のアイテムに関連するアイテムを表示する。

**新規作成**:
- `server/routes/relatedRoutes.ts` + `server/services/RelatedService.ts` - キーワード重複度 + 日付近接性による関連度計算

**修正**:
- `src/components/RightPanel/RelatedView.tsx` - アクティブアイテムの関連アイテムをリスト表示

**検証**: アイテムを開くと右パネルの関連ビューに関連アイテムが表示される。

---

### Phase 24: アクション・状態管理基盤

**目標**: コンテキストベースのアクション管理とReactとの接続を構築する。

**設計方針**:
- コンテキスト文字列: `{PanelArea}-{ViewType}-{Status}` 形式（例: `Main-TextEditor-*`, `Left-Navigator-*`）
- Action → TTApplication → TTMainPanel / TTLeftPanel / TTRightPanel の経路のみ

**新規作成**:
- `src/controllers/DefaultStatus.ts`
- `src/controllers/DefaultActions.ts`
- `src/controllers/actions/ApplicationActions.ts` - タブ操作・パネル開閉
- `src/controllers/actions/NavigatorActions.ts` - ナビゲーター操作
- `src/controllers/actions/EditorActions.ts` - TextEditor操作
- `src/controllers/actions/TabActions.ts` - タブ切替・新規・クローズ

**修正**:
- `src/views/TTApplication.ts` - `DispatchAction()`, `GetContext()` メソッド追加

**検証**: ActionをDispatchしてタブが開く・閉じる操作が動作する。

---

### Phase 25: イベントシステム（キーボードショートカット）

**目標**: キーイベントをコンテキストに応じてActionに繋ぐ。TSVファイルでキーバインドを管理する。

**新規作成**:
- `src/controllers/DefaultEvents.ts`
- `ui-design/events.tsv` - キーバインド定義

**TSVフォーマット**:
```tsv
# Context              Mods     Key    ActionID                       Comment
*-*-*                  Control  N      Tab.New                        新規タブ
*-*-*                  Control  W      Tab.Close.Active               タブを閉じる
*-*-*                  Control  Tab    Tab.Next                       次のタブ
*-TextEditor-*         Control  S      Editor.Save                    保存
*-*-*                  Control  P      Application.CommandPalette.Show コマンドパレット
Left-Navigator-*                Delete Navigator.Item.Delete          アイテム削除
```

**修正**:
- `src/components/Layout/AppLayout.tsx` - グローバルkeydownリスナー登録

**検証**: 各ショートカットが動作する。TextEditor使用中は通常文字入力が阻害されない。

---

### Phase 26: コンテキストメニューとコマンドパレット

**目標**: 右クリックメニューとコマンドパレットを実装する。

**新規作成**:
- `src/components/UI/ContextMenu.tsx` - コンテキストメニュー（`--bg-panel` 背景、`--radius` 角丸、`--border` 薄枠）
- `src/components/UI/CommandPalette.tsx` - コマンドパレット（中央オーバーレイ、検索可能なアクション一覧）
- `ui-design/menus.tsv` - コンテキストメニュー定義

**検証**: ナビゲーター右クリック→コンテキストメニュー。Ctrl+P→コマンドパレット。

---

### Phase 27: タグ一覧・最近のアイテムパネル

**目標**: 左パネルのタグビューと最近のアイテムビューを実装する。

**新規作成**:
- `src/components/LeftPanel/TagsView.tsx` - Keywordsから抽出したタグ一覧。クリックでナビゲーターをフィルタ
- `src/components/LeftPanel/RecentView.tsx` - UpdateDate降順のアイテムリスト（最近50件）

**検証**: タグ一覧が表示される。タグクリックでナビゲーターが絞り込まれる。

---

### Phase 28: レスポンシブ/モバイル対応

**目標**: スマホ・タブレット対応。小画面ではサイドパネルを非表示にし、ボトムナビで操作する。

**修正**:
- `src/components/Layout/AppLayout.tsx` - メディアクエリで小画面ではリボン・左右パネルを非表示
- `src/components/Layout/AppLayout.css` - `< 768px` でシングルカラム表示
- ボトムナビゲーション追加（主要操作へのショートカット）

**検証**: ブラウザリサイズでレイアウトが自動調整される。

---

### Phase 29: Google Drive連携

**目標**: ファイルD&DをGoogle Driveに保存し、タグをメモに挿入する。

**新規作成**:
- `server/routes/driveRoutes.ts` + `server/services/DriveService.ts`

**検証**: ファイルD&D→Google Driveにアップロード→`[File:ID]`タグが挿入される。

---

### Phase 30: Gmail連携

**目標**: 規定タイトルのGmailアイテムをアプリ内で閲覧・管理する。

**新規作成**:
- `server/routes/gmailRoutes.ts` + `server/services/GmailService.ts`
- メインパネルの新ViewType: `email`

---

### Phase 31: Google Photos連携

**目標**: 写真のリンク管理とメインパネル内表示。

**新規作成**:
- `server/routes/photosRoutes.ts` + `server/services/PhotosService.ts`
- メインパネルの新ViewType: `photo`

---

### Phase 32: 記憶支援機能

**目標**: 日付ベースの想起支援とタイムライン表示。

- チャットビューで「先週の火曜日何をした？」→当該日のメモ・活動一覧を含むAI応答
- メインパネルの新ViewType: `timeline`（時系列でメモ・チャット・イベントを表示）

---

### Phase 33: 思考支援機能

**目標**: 視点・材料の提示と概略説明の自動生成。

- チャットAPIの思考支援プロンプトテンプレートを追加（要約・多角的視点・関連素材収集）

---

### Phase 34: 判断支援機能

**目標**: 意思決定の構造化支援。

- チャットAPIの判断支援プロンプト（メリット/デメリット/基準の構造化）
- メインパネルの新ViewType: `decision`（構造化判断表示）

---

### Phase 35: 状態永続化

**目標**: アプリ状態（開いているタブ・パネル幅・フィルタ等）をlocalStorageに保存し、起動時に復元する。

**修正**:
- `src/views/TTMainPanel.ts` - タブ状態のシリアライズ/復元
- `src/views/TTLeftPanel.ts` / `TTRightPanel.ts` - 幅・開閉状態の永続化
- `src/views/TTApplication.ts` - `SerializeState()` / `RestoreState()` 追加

**検証**: ブラウザ閉じ→再開で開いているタブ・パネル幅・フィルタが復元される。

---

## 9. ユーザーフロー

```
ナビゲーター（左パネル）
    │
    └──→ メインパネルでアイテムを開く
           │
           ├── [TextEditor] 編集 → Ctrl+S 保存 → ナビゲーター更新
           ├── [Markdown] プレビュー → タグクリック → 別タブでナビゲート
           ├── [DataGrid] 複数選択 → 💬 → チャットタブでAI対話
           ├── [Graph] ノードクリック → 関連アイテムをタブで開く
           └── [Chat] AI対話 → 「メモに保存」→ ナビゲーターに追加
```

---

## 10. マイルストーン

| マイルストーン | 完了フェーズ |
|--------------|-------------|
| プロジェクト起動・空ページ表示 | Phase 1 |
| Obsidianライクシェル（リボン・左右パネル・タブ） | Phase 5 |
| ナビゲーター + TextEditor連携 | Phase 7 |
| 全ビュー（Markdown・DataGrid・Graph・Chat）動作 | Phase 11 |
| バックエンド接続・データ永続化 | Phase 14 |
| BQ差分同期・起動フロー | Phase 15 |
| AIチャット動作 | Phase 17 |
| タグ・ハイライト・Folding | Phase 20 |
| 全文検索・関連発見 | Phase 23 |
| ショートカット・コマンドパレット | Phase 26 |
| モバイル対応 | Phase 28 |
| 外部連携（Drive / Gmail / Photos） | Phase 31 |
| 記憶・思考・判断支援 | Phase 34 |
| フルアプリ完成 | Phase 35 |

---

## 11. 起動方法

```bash
# フロントエンド + バックエンド同時起動
npm run dev

# バックエンドのみ
npm run server:dev

# ビルド確認
npm run build
```
