# Thinktank 実装プラン v5

**作成日**: 2026-04-25
**変更点**: AI支援思考支援UIに全面刷新、Local Application First方針、4パネル新UIアーキテクチャ

---

## 1. 目標

ユーザーの日々の入力（メモ・ファイル・写真・メール・AIとの会話）を記録・蓄積し、以下を実現する：

1. **記憶支援** - 「あの日何をした？」「あの件どうなった？」への想起補助
2. **思考支援** - AIが視点・材料を提示し、概略説明を自動生成
3. **判断支援** - 意思決定のための構造化・過去類似判断の検索

**V5の重点**: 多機能メモアプリを脱し、**AI支援による思考支援の枠組みをUIに明確に組み込む**。

---

## 2. 基本方針

### 2.1 Local Application First

- **ThinktankLocal**（WPF + WebView2）を先に完成させる
- PWA版（ブラウザアプリ）は後続フェーズで別途開発（本プランの対象外）

### 2.2 BigQueryテーブル

- `thinktank.vault` を使用（コピーのため内容変更可）

---

## 3. システムアーキテクチャ（Local Application）

```
┌──────────────────────────────────────────────┐
│   ThinktankLocal（WPF exe）                  │
│  ┌────────────────────────────────────────┐  │
│  │  WebView2                              │  │
│  │  ThinktankPWA（React SPA）             │  │
│  └──────────────────┬─────────────────────┘  │
│                     │ localhost:8081          │
│  ┌──────────────────▼─────────────────────┐  │
│  │  C# Local API（ASP.NET Core）          │  │
│  └──────────────────┬─────────────────────┘  │
│                     │ R/W                     │
│  ┌──────────────────▼─────────────────────┐  │
│  │  Local FS（Markdownファイル群）         │  │
│  └──────────────────┬─────────────────────┘  │
│                     │ Sync Queue              │
└─────────────────────┼────────────────────────┘
                      │ Sync（非同期）
              ┌───────▼────────┐
              │  Backend Server │
              │  (Express /     │
              │   Cloud Run)    │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │  Google BigQuery│
              │ thinktank.      │
              │ files260425     │
              └────────────────┘
```

> ① まずはLocalアプリ版（色付き）を構築する。Webアプリ版（赤文字＝後続）との整合は後で考慮する。

---

## 4. 概念モデル・データ階層

### 4.1 包含関係

```
TTVault（保管庫）
  └── 全TTThinkデータを保持（TTCollectionの派生クラス）
        ├── Think群（ContentType = memo / tables / links / chat / nettext）
        └── Thought群（ContentType = thought）
              └── Thoughts = Thought群のこと（Filter文字列で実現）
```

| 概念 | クラス | 説明 |
|------|--------|------|
| **Think** | `TTThink` | 個別データアイテム（BigQueryの1レコード）。**旧 `TTThink`** |
| **Thought** | `TTThink`（ContentType=`thought`）| ThinkIDのリストまたはTTVaultへのFilter文字列を本文に持つ |
| **Thoughts** | ― | TTVaultをContentType=`thought`でフィルターした集合（専用クラスなし）|
| **TTVault** | `TTVault` | 保管庫。全TTThinkを保持。`TTCollection<TTThink>`の派生クラス |

### 4.2 詳細仕様

**3-1) TTVault**
- `TTCollection<TTThink>` の派生クラス
- アプリは複数のTTVaultを管理可能（保管庫間のデータ移動は不可）
- LocalFS パス: `./../ThinktankLocal/vault/{ContentType}/{ID}.md`
- BigQuery: テーブル名 = `thinktank.vault`

**3-2) Thought**
- ContentType=`thought` の `TTThink` インスタンス
- 本文（Content）にThinkIDのリスト（`* ID`行）またはFilter文字列（`> filter`行）を保持
- 空本文 = フィルターなし = 全件対象

**3-3) Thoughts**
- TTVaultに対して `ContentType === 'thought'` でフィルターした結果
- 専用クラスは不要。`vault.GetThoughts()` で取得

**3-4) VaultID**
- `TTThink`（Think / Thought すべて）は所属TTVaultのIDを `VaultID` 属性に持つ

---

## 5. TTThinkのContentType一覧

| ContentType | 説明 | 表示可能形式 |
|-------------|------|-------------|
| `memo` | テキストメモ（markdown含む）| texteditor, markdown |
| `thought` | Thinkの集合（Thought）| texteditor, markdown, datagrid |
| `tables` | 複数テーブルを含むデータ（独自形式md）| texteditor, datagrid, card |
| `links` | URL/ローカルURI等へのリンク集 | texteditor, markdown, card |
| `chat` | AIとの対話記録 | texteditor, markdown, chat |
| `nettext` | ネット等からダウンロードしたテキスト | texteditor, markdown |

---

## 6. UIレイアウト（新4パネル構成）

UI全体像は `docs/TT.pptx` の **Slide #1** を参照のこと。

左から順に **ThinktankPanel → OverviewPanel → WorkoutPanel → ToDoPanel** が横並びに並ぶ構成。
WorkoutPanelが最も広い主作業エリア。

```
┌──────────────┬──────────────┬──────────────────────────────┬──────────────┐
│  Thinktank   │  Overview    │        Workout Panel         │    ToDo      │
│  Panel       │  Panel       │  [PanelRibbon: 右に追加 |    │    Panel     │
│              │              │              下に追加]        │              │
│  Thinktank   │  Overview    │  ┌────────────┬─────────┐   │    ToDo      │
│  Ribbon      │  Ribbon      │  │ WA0.Ribbon │WA1.Rib  │   │    Ribbon    │
│  ──────────  │  ──────────  │  │ WA0.Area   ├─────────┤   │  ──────────  │
│  Thinktank   │  Overview    │  │            │WA2.Rib  │   │    ToDo      │
│  Area        │  Area        │  │            │WA2.Area │   │    Area      │
│              │              │  └────────────┴─────────┘   │              │
│  [開閉]      │  [開閉]      │  （BSPツリーで動的分割）      │  [開閉]      │
└──────────────┴──────────────┴──────────────────────────────┴──────────────┘
```

### 開閉ボタン

**Thinktank / Overview / ToDo** の各 Panel の **Area部分**の表示・非表示を切り替える。
（Ribbonは常時表示）

---

## 7. 各パネルの機能仕様

### 7.1 ThinktankPanel

**役割**: データソース管理、Think抽出、Thought管理

| エリア | 機能 |
|--------|------|
| ThinktankArea | Thoughts（Thoughtの一覧）表示。Filterとチェックで選択 |
| ThinktankRibbon | 機能用ボタン群（基盤整備後に順次実装）|

**主要操作**:

- Thought一覧を表示・選択（FilterとチェックボックスでThought絞り込み）
- Think抽出 → Thoughtデータ作成
- LocalPC/ThinktankPanel からのD&D取り込み
- thoughtデータの分析・管理

### 7.2 OverviewPanel

**役割**: 選ばれた1つのThought（Thinkの集合）の閲覧・編集・分析

| エリア | 機能 |
|--------|------|
| OverviewArea | 選択Thoughtの全体表示・編集・分析。全文検索で選択 |
| OverviewRibbon | 機能用ボタン群（基盤整備後に順次実装）|

**主要操作**:

- 選択Thoughtの表示（表形式・グラフ形式・テキストエディタ・マークダウン）
- Thoughtの閲覧・編集・分析
- 全文検索で対象選択

### 7.3 WorkoutPanel

**役割**: 選ばれたいくつかのThinkデータの閲覧・編集

**WorkoutArea構成**:

- エリア数・分割数に制限なし（BSP ツリーで動的管理）
- 各WorkoutAreaは独立した Ribbon + Area を持つ
- 初期状態は1エリアがパネル全体を占有
- **右に追加**: フォーカス中エリアを縦分割して右側に新エリアを追加
- **下に追加**: フォーカス中エリアを横分割して下側に新エリアを追加
- メディア種別によるレイアウト特別ルールなし（すべて均等に分割）

**レイアウト方式（BSP ツリー）**:

- LayoutNode = LeafNode（単一エリア）または SplitNode（縦/横分割＋2子ノード）の再帰構造
- 分割比率は Splitter ドラッグでリアルタイム変更（ポインターキャプチャ方式）
- エリア削除時はツリーが自動縮小（兄弟ノードが親の位置を引き継ぐ）

**フォーカス**:

- クリックしたエリアがフォーカスエリアになる（Ribbonが青強調）
- 「右に追加」「下に追加」はフォーカスエリアを分割する
- 追加したエリアが自動的にフォーカスを引き継ぐ

**表示ルール**:

- 各WorkoutAreaのTitleをマウスでドラッグ → 他エリアにドロップでコンテンツ入れ替え
- Splitterでエリアサイズ変更可能

**表示形式（メディア）**:

| メディア | 説明 |
|----------|------|
| texteditor | Monaco Editorによるテキスト編集 |
| markdown | Markdownレンダリング表示 |
| datagrid | テーブル形式一覧（列ソート・フィルター付き）|
| card | カード形式の一覧表示 |
| graph | react-force-graphによるノードグラフ表示 |

### 7.4 ToDoPanel

**役割**: 選ばれたThought/Thinkの次の展開についての分析・相談

| エリア | 機能 |
|--------|------|
| ToDoArea | think/thoughtsの展開・することの考察。AIとの相談 |
| ToDoRibbon | 機能用ボタン群（基盤整備後に順次実装）|

**主要操作**:

- thoughtの次の展開・することの相談（AI対話）
- thinkデータの分析

---

## 8. Ribbon仕様

各パネルのRibbonはアプリケーション機能用のアイコンボタン群。

- **アプリの基盤整備が完了したら、1つずつ機能を組み込む**
- 初期実装は最小限のボタン（開閉含む）のみ
- アイコンライブラリ: lucide-react

---

## 9. デザイン仕様

色スタイル見本は `docs/TT.pptx` の **Slide #5〜#18** を参照のこと。
詳細な色コードは `docs/TT_Color.txt` に抽出済み。

### 9.1 カラーテーマ一覧（TT.pptx Slide #5〜#18）

各スライドが1テーマ（ダーク〜ライトの5〜6色グラデーション）を示す。

| Slide | style-name | テーマ名 | ダーク色 | ライト色 |
|-------|-----------|----------|---------|---------|
| #5  | gray | グレー | `#3F3F3F` | `#D0D0D0` |
| #6  | light-gray | ライトグレー | `#808080` | `#F2F2F2` |
| #7  | yellow | イエロー | `#FBC02D` | `#FFFDE7` |
| #8  | indigo-dark | インディゴ（ダーク）| `#3949AB` | `#F9FAFF` |
| #9  | indigo-light | インディゴ（ライト）| `#5C6BC0` | `#FAFBFF` |
| #10 | purple | パープル | `#9575CD` | `#F8F2FF` |
| #11 | rose | ローズ/レッド | `#994D4D` | `#FFF5F5` |
| #12 | orange | オレンジ | `#E67E22` | `#FFFCF5` |
| #13 | green-dark | ダークグリーン | `#1E4620` | `#E2EFDA` |
| #14 | green-sage | セージグリーン | `#4B6A4C` | `#F2F8F0` |
| #15 | blue-dark | ダークブルー | `#073763` | `#E8F1F8` |
| #16 | blue-light | ライトブルー | `#3D85C6` | `#F4F8FB` |
| #17 | orange-dark | ダークオレンジ | `#CC5200` | `#FFF2E6` |
| #18 | orange-light | ライトオレンジ | `#FF9933` | `#FFFAF5` |

### 9.2 パネル別テーマ割り当て案

| パネル | テーマ | Ribbon背景 | Area背景 |
|--------|--------|-----------|---------|
| ThinktankPanel | blue-dark | `#073763` | `#E8F1F8` |
| OverviewPanel | indigo-dark | `#3949AB` | `#F9FAFF` |
| WorkoutPanel | gray | `#3F3F3F` | `#D0D0D0` |
| ToDoPanel | green-dark | `#1E4620` | `#E2EFDA` |

> テーマ変更は `docs/TT_Color.txt` を参照して CSS変数を更新する。

### 9.3 CSS変数（ベース定義）

```css
/* 背景 */
--bg-primary:       #1e2030;
--bg-secondary:     #1a1b26;
--bg-panel:         #24283b;
--bg-hover:         #2a3050;
--bg-selected:      #2e3460;

/* テキスト */
--text-primary:     #c0caf5;
--text-muted:       #565f89;
--text-accent:      #7aa2f7;
--text-highlight:   #e0af68;
--text-success:     #9ece6a;
--text-warning:     #ff9e64;
--text-error:       #f7768e;

/* ボーダー・UI */
--border:           #292e42;
--radius:           6px;
--transition-panel: 200ms ease;

/* パネル別テーマ色（TT_Color.txtのテーマから設定）*/
--thinktank-ribbon-bg: #073763;
--thinktank-area-bg:   #E8F1F8;
--overview-ribbon-bg:  #3949AB;
--overview-area-bg:    #F9FAFF;
--workout-ribbon-bg:   #3F3F3F;
--workout-area-bg:     #D0D0D0;
--todo-ribbon-bg:      #1E4620;
--todo-area-bg:        #E2EFDA;
```

### 9.4 デザイン原則

- 線で区切らず、**背景色差・丸角ボックス**で領域を分ける
- フォント: `'Inter', 'Hiragino Kaku Gothic ProN', system-ui`, 13px
- アイコン: lucide-react
- 各パネルは異なるカラーテーマで視覚的に区別する

---

## 10. データモデル

### 10.1 ファイルフォーマット（すべて `.md`）

**memo / nettext**

```
タイトル（1行目）
（自由なmarkdownテキスト）
```

**thought**（Thinkの集合）

```
タイトル（1行目）
> フィルター条件式（省略可）
* ThinkのID情報（省略可）
（その他自由記載）
```

- `>` 行 = フィルター条件式（保存された検索クエリ）
- `*` 行 = 個別ThinkのID

**tables**

```
タイトル（1行目）
## テーブルタイトル
列名csv行

データcsv行
## テーブルタイトル2
列名csv行

データcsv行
...
```

**links**

```
タイトル（1行目）
* URL or URI（1件1行）
（その他自由記載）
```

**chat**

```
タイトル（1行目）
## ユーザー発話
AI発話（自由記載）
## ユーザー発話
...
```

### 10.2 ファイルID形式

```
yyyy-MM-dd-hhmmss
```

同秒衝突時：1秒ずつ遡って空いているIDを割り当て

### 10.3 TTThinkの主要フィールド（旧 TTThink → V5より TTThink に改名）

```typescript
// src/models/TTThink.ts  (旧: src/models/TTThink.ts)
ID:          string    // ファイルID（yyyy-MM-dd-hhmmss）
VaultID:     string    // NEW: 所属TTVaultのID
ContentType: string    // memo / thought / tables / links / chat / nettext
Title:       string    // タイトル（1行目）
Content:     string    // 本文
Keywords:    string    // キーワード
RelatedIDs:  string[]  // 関連アイテムID
IsMetaOnly:  boolean   // コンテンツ未取得フラグ
IsDirty:     boolean   // 未保存変更フラグ
CreatedAt:   string
UpdatedAt:   string
```

### 10.4 TTVaultの主要フィールド

```typescript
// src/models/TTVault.ts（extends TTCollection<TTThink>）
ID:   string   // 保管庫ID
Name: string   // 保管庫名（= BigQueryテーブル名 / LocalFSフォルダ名）

// TTCollectionから継承
GetItems(): TTThink[]
AddItem(item: TTThink): void
RemoveItem(id: string): void

// TTVault独自メソッド
GetThoughts(): TTThink[]
  // → ContentType='thought'のみ返す（= Thoughtsの実装）
GetThinksForThought(thoughtId: string): TTThink[]
  // → Thoughtが参照するThink群を返す（IDリスト or Filter適用）
```

---

## 11. データストレージ仕様

### 11.1 BigQueryスキーマ（thinktank.vault）

```sql
-- BigQuery テーブル: thinktank.vault
-- ※ thinktank.files260425 からのコピー。内容変更可。
CREATE TABLE `thinktank.vault` (
  file_id      STRING    NOT NULL,
  title        STRING,
  file_type    STRING    NOT NULL,
  category     STRING,              -- ContentType（vault_id兼ねる将来設計あり）
  content      STRING,
  keywords     STRING,
  related_ids  STRING,
  metadata     JSON,
  size_bytes   INT64,
  is_deleted   BOOL      DEFAULT FALSE,
  vault_id     STRING,              -- NEW: TTVaultのID（ALTER TABLE で追加）
  created_at   TIMESTAMP NOT NULL,
  updated_at   TIMESTAMP NOT NULL
) CLUSTER BY category;
```

### 11.2 LocalFSパス構造

```
./../ThinktankLocal/vault/          ← 同期データのLocal保存先
  {ContentType}/
    {ID}.md                         ← 例: memo/2026-04-25-103000.md
```

> `ThinktankWebCC/` と `ThinktankLocal/` が同一親ディレクトリにある前提。
> LocalStorageBackend は `./../ThinktankLocal/vault` を起点として R/W する。

---

## 12. ディレクトリ構成

```
ThinktankWebCC/                        ← Reactフロントエンド
├── src/
│   ├── models/                        ← TTObject, TTCollection, TTThink, TTVault
│   ├── views/                         ← TTApplication, TTThinktankPanel, TTOverviewPanel,
│   │                                     TTWorkoutPanel, TTToDoPanel, TTWorkoutArea
│   ├── components/
│   │   ├── Layout/                    ← AppLayout（4パネル構成）
│   │   ├── ThinktankPanel/            ← ThinktankRibbon, ThinktankArea, ThoughtsList
│   │   ├── OverviewPanel/             ← OverviewRibbon, OverviewArea
│   │   ├── WorkoutPanel/              ← WorkoutPanel, WorkoutArea（最大6個）
│   │   │   └── media/                 ← TextEditorMedia, MarkdownMedia, DataGridMedia,
│   │   │                                 CardMedia, GraphMedia, ChatMedia
│   │   ├── ToDoPanel/                 ← ToDoRibbon, ToDoArea
│   │   └── UI/                        ← SyncIndicator, ContextMenu, CommandPalette
│   ├── services/
│   │   └── storage/
│   │       ├── IStorageBackend.ts
│   │       ├── LocalStorageBackend.ts ← C# local API (http://localhost:8081)
│   │       └── StorageManager.ts
│   └── hooks/
│       └── useAppUpdate.ts
├── server/                            ← クラウドバックエンド（Express）
│   ├── index.ts
│   ├── routes/
│   │   ├── bigqueryRoutes.ts
│   │   ├── chatRoutes.ts
│   │   └── searchRoutes.ts
│   └── services/
│       ├── BigQueryService.ts
│       └── ChatService.ts
└── ThinktankLocal/                    ← C# ローカルアプリ
    ├── ThinktankLocal.sln
    ├── ThinktankLocal/                ← WPF + WebView2
    │   ├── App.xaml
    │   └── MainWindow.xaml
    └── ThinktankLocalApi/             ← ASP.NET Core minimal API
        ├── Program.cs
        ├── LocalApiServer.cs
        └── Services/
            ├── LocalFsService.cs
            ├── SyncQueueService.cs
            └── SyncBackgroundService.cs
```

---

## 13. 実装フェーズ

---

### Phase 1〜3: 引継ぎ・更新（v4実装済み基盤）

**対象**: TTObject / TTCollection / **TTDataItem → TTThink** / TTVault / TTModels

#### クラス名変更

| v4 クラス名 | v5 クラス名 | 変更内容 |
|-------------|-------------|----------|
| `TTDataItem` | `TTThink` | 全面リネーム。`src/models/TTDataItem.ts` → `src/models/TTThink.ts` |
| `TTVault` | `TTVault` | `TTCollection<TTThink>`の派生クラスとして再確認・整備 |

**移行**: import全箇所を一括置換。

#### TTThinkへのVaultID追加

```typescript
VaultID: string  // 所属TTVaultのID（新規追加）
```

#### TTVaultの整備

- `TTCollection<TTThink>` の派生クラスであることを確認・必要なら修正
- `GetThoughts()` メソッド追加: ContentType=`thought`のアイテム一覧を返す（=Thoughts）
- `GetThinksForThought(thoughtId)` メソッド追加: Thoughtが参照するThink群を返す

#### ContentType定義の更新

v4の `memo / chat / pickup / link / table` を v5仕様に変更する：

| v4 ContentType | v5 ContentType | 備考 |
|----------------|----------------|------|
| `memo` | `memo` | 変更なし |
| `chat` | `chat` | 変更なし |
| `pickup` | `thought` | Thinkの集合（ThinkIDリスト or Filterを本文に持つ）|
| `link` | `links` | 複数形に変更 |
| `table` | `tables` | 複数形に変更 |
| -（新規）| `nettext` | ネットからダウンロードしたテキスト |

**検証**: TTVaultから各ContentTypeのアイテム追加・取得が動作する。GetThoughts()が正しく返る。

---

### Phase 4: 新ビューモデル（4パネル構成）

**目標**: 新UIアーキテクチャのビューモデルを実装する。

**新規作成**:

- `src/views/TTWorkoutArea.ts` - 1つのWorkoutAreaを管理
  - `MediaType`: `'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph' | 'chat'`
  - `ResourceID`: 表示中のThinkデータID
  - `IsLoading`: コンテンツロード中
  - `Title`: 表示タイトル
  - 位置情報は持たない（BSP ツリーが管理する）

- `src/views/TTWorkoutPanel.ts` - WorkoutArea群の管理（BSP ツリー方式）
  - `Areas`: WorkoutArea[]（上限なし）
  - `Layout`: `LayoutNode | null` — BSP ツリーのルートノード
  - `FocusedAreaId`: フォーカス中エリアID
  - `AddFirst(resourceId, mediaType, title)`: 最初のエリアを追加（Layout=LeafNode）
  - `AddRight(resourceId, mediaType, title)`: フォーカスエリアを縦分割して右に追加
  - `AddBelow(resourceId, mediaType, title)`: フォーカスエリアを横分割して下に追加
  - `RemoveArea(areaId)`: Area削除＋ツリー縮小＋フォーカス更新
  - `FocusArea(areaId)`: フォーカス切り替え
  - `SwapAreas(fromId, toId)`: ドラッグ&ドロップによるコンテンツ入れ替え
  - `SetMediaType(areaId, mediaType)`: メディアタイプ変更

  LayoutNode の型定義:
  ```typescript
  type LayoutNode = LeafNode | SplitNodeData;
  interface LeafNode     { id: string; type: 'leaf'; areaId: string; }
  interface SplitNodeData { id: string; type: 'split'; direction: 'v'|'h'; first: LayoutNode; second: LayoutNode; }
  ```

- `src/views/TTThinktankPanel.ts` - ThinktankPanel管理
  - `IsAreaOpen`: ThinktankArea開閉状態
  - `ToggleArea()`: 開閉切り替え
  - `SelectedThoughtID`: 現在選択中のThoughtID
  - `Filter`: 絞り込みテキスト

- `src/views/TTOverviewPanel.ts` - OverviewPanel管理
  - `IsAreaOpen`: OverviewArea開閉状態
  - `ToggleArea()`
  - `ThoughtID`: 表示中のThoughtID
  - `MediaType`: 表示形式

- `src/views/TTToDoPanel.ts` - ToDoPanel管理
  - `IsAreaOpen`: ToDoArea開閉状態
  - `ToggleArea()`
  - `LinkedThoughtID`: 連携中のThoughtID
  - `ChatMessages`: AIとの会話履歴

- `src/views/TTApplication.ts` - 更新
  - `ThinktankPanel`: TTThinktankPanel
  - `OverviewPanel`: TTOverviewPanel
  - `WorkoutPanel`: TTWorkoutPanel
  - `ToDoPanel`: TTToDoPanel
  - `OpenThought(thoughtId)`: ThoughtをOverviewPanelで開く
  - `OpenThinkInWorkout(thinkId, mediaType)`: ThinkをWorkoutAreaで開く

**検証**: 各パネルの開閉・選択・WorkoutAreaの追加・削除が動作する。

---

### Phase 5: 4パネルレイアウトシェル

**目標**: 新4パネルUIの骨格をCSSで構築する。

**新規作成**:

- `src/components/Layout/AppLayout.tsx + .css` - 4パネルグリッドレイアウト
- `src/components/Layout/PanelRibbon.tsx + .css` - 共通Ribbonコンポーネント（縦アイコンバー）
- `src/components/Layout/PanelArea.tsx + .css` - 共通Area（開閉アニメーション付き）
- `src/components/Layout/Splitter.tsx + .css` - ドラッグリサイズセパレーター

**レイアウト仕様**:

```css
.app-layout {
  display: grid;
  grid-template-columns: [thinktank] auto [workout] 1fr [overview-todo] auto;
  grid-template-rows: [top] auto [workout] 1fr;
  height: 100vh;
}
/* ThinktankPanel: 左列、全行 */
/* OverviewPanel: 右列上部 */
/* ToDoPanel: 右列下部 */
/* WorkoutPanel: 中央列、全行 */
```

**開閉アニメーション**:

```css
.panel-area {
  overflow: hidden;
  transition: height var(--transition-panel), width var(--transition-panel);
}
.panel-area--closed {
  height: 0; /* または width: 0（縦横方向による）*/
}
```

**検証**:

- [ ] 4パネルが正しいグリッド位置に表示される
- [ ] 各パネルの開閉ボタンでAreaが開閉アニメーションする
- [ ] WorkoutPanelが中央に広がる

---

### Phase 6: ThinktankPanel実装

**目標**: Thoughts一覧の表示・選択機能を実装する。

**新規作成**:

- `src/components/ThinktankPanel/ThinktankPanel.tsx + .css`
- `src/components/ThinktankPanel/ThinktankRibbon.tsx`
- `src/components/ThinktankPanel/ThinktankArea.tsx`
- `src/components/ThinktankPanel/ThoughtsList.tsx + .css` - Thoughts一覧（仮想スクロール）
- `src/components/ThinktankPanel/ThoughtsFilter.tsx` - Filter + チェックボックス選択

**仕様**:

- Thoughts一覧: ContentType=`thought` のアイテムを一覧表示
- 行形式: `[チェック] [アイコン] タイトル [更新日]`、行高さ 36px
- Filter欄: AND/OR/NOT構文対応
- チェックで複数Thought選択可能
- アイテムクリック → `TTApplication.OpenThought(id)`
- 仮想スクロール: `@tanstack/react-virtual`（overscan=5）

**検証**:

- [ ] Thoughts一覧が表示される
- [ ] Filterで絞り込みが動作する
- [ ] クリックでOverviewPanelが更新される
- [ ] ThinktankArea開閉が動作する

---

### Phase 7: WorkoutPanel基盤実装

**目標**: BSP ツリー型レイアウトによる WorkoutArea の動的分割管理、ドラッグ移動、スプリッターによるリサイズを実装する。

**新規作成**:

- `src/components/WorkoutPanel/WorkoutPanel.tsx + .css` - BSP ツリー再帰レンダリングコンテナ
- `src/components/WorkoutPanel/WorkoutArea.tsx + .css` - 個別WorkoutArea（Ribbon+コンテンツ）
- `src/components/WorkoutPanel/WorkoutAreaRibbon.tsx + .css` - MediaType切り替え + ドラッグハンドル + フォーカス表示
- `src/components/WorkoutPanel/WorkoutAreaEmpty.tsx + .css` - エリアなし時の空表示
- `src/components/WorkoutPanel/WorkoutPanelRibbon.tsx + .css` - 「右に追加」「下に追加」ボタンのパネルリボン
- `src/components/WorkoutPanel/WorkoutHSplitter.tsx + .css` - 横分割用 Splitter

**BSP ツリーレンダリング構造**:

```
WorkoutPanel
  └─ LayoutView（再帰コンポーネント）
       ├─ node.type === 'leaf'  → WorkoutArea を直接レンダリング
       └─ node.type === 'split' → SplitView（flex レイアウト）
              ├─ split-pane（flex: ratio）+ LayoutView（再帰）
              ├─ Splitter（direction:'v'）or WorkoutHSplitter（direction:'h'）
              └─ split-pane（flex: 1-ratio）+ LayoutView（再帰）
```

分割比率は `splitRatios: Record<nodeId, 0〜1>` として React state で管理し、Splitter の `onResize` デルタをコンテナサイズで正規化して更新する。

**WorkoutPanelRibbon**:

- 「右に追加」ボタン（SVGアイコン: 縦分割イメージ）: `AddRight` を呼ぶ
- 「下に追加」ボタン（SVGアイコン: 横分割イメージ）: `AddBelow` を呼ぶ。エリアなし時は disabled
- フォーカス中エリア名をリボン右端に表示

**ドラッグ移動**:

- WorkoutAreaのRibbonにあるドラッグハンドルをマウスでドラッグ
- Ghost（カーソル追従タイトル表示）+ Drop target エリアを太枠（3px）で強調
- ドロップで `SwapAreas(fromId, toId)` を呼びコンテンツを入れ替え
- `overAreaIdRef`（useRef）で stale closure を回避

**スプリッター（ポインターキャプチャ方式）**:

- `Splitter.tsx`（縦）・`WorkoutHSplitter.tsx`（横）ともに `setPointerCapture` を使用
- カーソルがパネル枠外に出ても制御が維持される（枠外逃げなし）

**検証**:

- [ ] 最初のエリアがパネル全体を占有して表示される
- [ ] 「右に追加」でフォーカスエリアが縦分割される
- [ ] 「下に追加」でフォーカスエリアが横分割される
- [ ] クリックでフォーカスが切り替わり Ribbon が青強調される
- [ ] エリア閉じでツリーが縮小し、残エリアが領域を引き継ぐ
- [ ] Titleドラッグ＆ドロップでエリアコンテンツが入れ替わる
- [ ] Splitterドラッグでサイズが変更できる（枠外逃げなし）

---

### Phase 8: Think表示メディア実装

**目標**: WorkoutAreaで使用する5種の表示メディアを実装する。

**新規作成**:

- `src/components/WorkoutPanel/media/TextEditorMedia.tsx` - Monaco Editor
- `src/components/WorkoutPanel/media/MarkdownMedia.tsx` - Markdownレンダリング
- `src/components/WorkoutPanel/media/DataGridMedia.tsx + .css` - テーブル形式一覧
- `src/components/WorkoutPanel/media/CardMedia.tsx + .css` - カード形式一覧
- `src/components/WorkoutPanel/media/GraphMedia.tsx` - react-force-graphノードグラフ
- `src/components/WorkoutPanel/media/ChatMedia.tsx + .css` - AIチャット（UIのみ）

**各メディアの仕様**:

**TextEditorMedia**:

- Monaco Editor（v4 TextEditorViewの流用・移植）
- Ctrl+S で保存
- 未保存変更時にTitleに `●` を表示

**MarkdownMedia**:

- marked + highlight.js（v4 MarkdownViewの流用・移植）
- h1=ゴールド / h2=ブルー / h3=グリーン

**DataGridMedia**:

- @tanstack/react-virtual による仮想スクロール
- 列: チェック / ContentType / タイトル / 更新日
- 上部にFilterテキストボックス

**CardMedia**:

- カード形式（タイトル・抜粋・ContentTypeアイコン）
- 2列グリッド表示

**GraphMedia**:

- react-force-graph（v4 GraphViewの流用・移植）
- RelatedIDsとthoughtの参照をエッジとして描画

**ChatMedia**:

- ユーザー発言（右）/ AI応答Markdown（左）
- SSEストリーミング表示
- 入力欄: 下部固定
- Phase 14（AIチャットAPI）実装後に接続

**WorkoutAreaRibbonのMediaType切り替えボタン**:

| アイコン | MediaType | 対応ContentType |
|---------|-----------|-----------------|
| `FileText` | texteditor | すべて |
| `Eye` | markdown | memo/thought/links/chat/nettext |
| `Table` | datagrid | thought/tables/links |
| `LayoutGrid` | card | tables/links |
| `Share2` | graph | すべて |
| `MessageCircle` | chat | chat |

**検証**:

- [ ] 各メディアタイプでThinkデータが表示される
- [ ] WorkoutAreaのRibbonでMediaTypeを切り替えられる
- [ ] TextEditorMediaでCtrl+S保存が動作する（ローカル保存）

---

### Phase 9: OverviewPanel実装

**目標**: 選択ThoughtをOverviewPanelで表示・分析する。

**新規作成**:

- `src/components/OverviewPanel/OverviewPanel.tsx + .css`
- `src/components/OverviewPanel/OverviewRibbon.tsx`
- `src/components/OverviewPanel/OverviewArea.tsx`
- `src/components/OverviewPanel/ThoughtSummary.tsx` - Thought要約表示
- `src/components/OverviewPanel/ThoughtAnalysis.tsx` - Think一覧・グラフ・分析

**仕様**:

- `TTApplication.OpenThought(id)` でOverviewPanelに表示
- OverviewAreaはThought全体の表示モードを切り替え:
  - `markdown`: thoughtファイルのMarkdownレンダリング
  - `datagrid`: Thinkの一覧表示（DataGridMedia相当）
  - `graph`: Thinkの関係グラフ（GraphMedia相当）
- 全文検索テキストボックスで検索・対象変更

**検証**:

- [ ] Thoughtを選択するとOverviewAreaに内容が表示される
- [ ] OverviewAreaの表示モード切り替えが動作する
- [ ] OverviewArea開閉が動作する

---

### Phase 10: ToDoPanel実装

**目標**: Think/Thoughtsの次の展開についてAIと相談するパネルを実装する。

**新規作成**:

- `src/components/ToDoPanel/ToDoPanel.tsx + .css`
- `src/components/ToDoPanel/ToDoRibbon.tsx`
- `src/components/ToDoPanel/ToDoArea.tsx`
- `src/components/ToDoPanel/ToDoChat.tsx` - AIとの相談チャット（ChatMediaを転用）

**仕様**:

- ToDoAreaは選択中のThought/ThinkのコンテキストでAIと対話
- コンテキストバー: 現在連携しているThought/Think名を表示
- Phase 14（AIチャットAPI）実装後に実際のAI応答を接続
- Phase 10時点ではUIのみ（モックレスポンス）

**検証**:

- [ ] ToDoAreaにチャットUIが表示される
- [ ] ToDoArea開閉が動作する
- [ ] コンテキストバーに選択中Thoughtの名前が表示される

---

### Phase 11: WPF + WebView2コンテナ（Local App Shell）

**目標**: WPFアプリケーションのシェルを構築し、WebView2でReact SPAを表示する。

**前提条件**:

- **.NET 8 SDK**（Windows x64）のインストールが必要
  - ダウンロード: https://dotnet.microsoft.com/download/dotnet/8.0 → SDK → Windows → x64 インストーラー
  - インストール後、PowerShellを再起動してPATHに `C:\Program Files\dotnet` が通っていることを確認
  - 確認コマンド: `dotnet --version`
- **NuGetパッケージ**: `Microsoft.Web.WebView2`（dotnet restoreで自動取得）

**プロジェクト配置**:

`ThinktankWebCC/` と同一親ディレクトリに `ThinktankLocal/` を作成する（兄弟関係）。

```
Documents/
├── ThinktankWebCC/    ← React フロントエンド（本リポジトリ）
└── ThinktankLocal/    ← C# ローカルアプリ（Phase 11 で新規作成）
```

**新規作成**:

- `ThinktankLocal/ThinktankLocal.sln` - ソリューションファイル（ThinktankLocal + ThinktankLocalApi を含む）
- `ThinktankLocal/ThinktankLocal/ThinktankLocal.csproj` - WPF プロジェクト（net8.0-windows、Microsoft.Web.WebView2参照）
- `ThinktankLocal/ThinktankLocal/app.manifest` - DPI対応（PerMonitorV2）・UAC設定
- `ThinktankLocal/ThinktankLocal/App.xaml` - Applicationエントリポイント（StartupUri不使用、OnStartupでMainWindowを生成）
- `ThinktankLocal/ThinktankLocal/App.xaml.cs` - C# local API起動 → WebView2起動 → JS変数注入
- `ThinktankLocal/ThinktankLocal/MainWindow.xaml` - フルスクリーンWebView2（WindowStyle="None"、WindowState="Maximized"）
- `ThinktankLocal/ThinktankLocal/MainWindow.xaml.cs` - WebView2ナビゲーション＋NavigationCompletedでJS注入
- `ThinktankLocal/ThinktankLocalApi/ThinktankLocalApi.csproj` - ASP.NET Core スタブ（Phase 12 で本実装）
- `ThinktankLocal/ThinktankLocalApi/Program.cs` - `/api/health` のみのスタブ（ソリューションビルドを通すため必須）

> **注意**: ソリューションに ThinktankLocalApi が含まれるため、Phase 12 実装前でも当プロジェクトのスタブが存在しないとビルドが通らない。

**App.xaml.cs の起動シーケンス**:

1. `ThinktankLocalApi.exe` が存在すれば起動（ない場合はスキップ）
2. `MainWindow` を生成・表示
3. WPF終了時に API プロセスを Kill

**モード注入**:

```javascript
// WebView2の NavigationCompleted イベントで注入
window.__THINKTANK_MODE__ = 'local';
window.__THINKTANK_LOCAL_API__ = 'http://localhost:8081';
```

**ビルド・実行コマンド**:

```powershell
cd "C:\Users\{ユーザー名}\Documents\ThinktankLocal"
dotnet build                                                   # ビルド
dotnet run --project ThinktankLocal\ThinktankLocal.csproj     # 実行（Vite起動済みであること）
```

**検証**:

- [ ] `dotnet build` が警告・エラー0で完了する
- [ ] WPFアプリが起動してReact SPA（http://localhost:5173）が表示される
- [ ] DevToolsでJS変数が注入されていることを確認

---

### Phase 12: C# Local API（LocalFS連携）

**目標**: C# ASP.NET Core minimal APIでLocalFS Markdownファイルの操作を実装する。

**新規作成/更新**（v4 Phase 21相当、引継ぎ・整備）:

- `ThinktankLocalApi/Services/LocalFsService.cs`
  - LocalFS パス: `{datafolder}/{保管庫名}/{ContentType}/{ID}.md`
- `ThinktankLocalApi/Controllers/FilesController.cs`

**APIエンドポイント**:

| メソッド | パス | 機能 |
|---------|------|------|
| GET | `/api/files/meta` | メタデータのみ一覧（content除く）|
| GET | `/api/files/:id/content` | 本文のみ取得 |
| GET | `/api/files` | フルレコード一覧 |
| POST | `/api/files` | 保存（Upsert）|
| DELETE | `/api/files/:id` | 削除 |
| GET | `/api/files/search?q=` | 全文検索 |
| GET | `/api/health` | ヘルスチェック |

**検証**:

- [ ] `/api/files/meta` でメタデータ一覧が取得できる
- [ ] ファイル保存・削除が動作する
- [ ] React SPAからAPIを呼び出してデータが表示される

---

## Phase 12時点での想定状況

### リポジトリ構成と役割分担

| リポジトリ | 内容 | 主要技術 |
|-----------|------|---------|
| **ThinktankWebCC** | React SPA（UI全体）＋ Expressバックエンド（BigQuery/AI） | React 18, Vite, Node.js/Express, @anthropic-ai/sdk |
| **ThinktankLocal** | WPFシェル（WebView2コンテナ）＋ LocalFS API | .NET 8, WPF, WebView2, ASP.NET Core |

**依存関係**:
- `ThinktankLocal` は `ThinktankWebCC` の React SPAを WebView2 で表示する。React SPA が先に動いている必要がある。
- `ThinktankWebCC`（React SPA単体）は `ThinktankLocal` に依存しない。ブラウザで直接開いても動作する。
- 両リポジトリは `Documents/` 配下に兄弟ディレクトリとして配置する。

**PWA化との関連**:
- React SPA（ThinktankWebCC）はそのままPWAとして配信可能。`ThinktankLocal` は不要になる。
- PWAモードでは `window.__THINKTANK_MODE__` が未設定となり、`StorageManager` が `PwaStorageBackend`（BigQuery経由）に切り替わる（Phase 13実装）。

---

### 現在のアプリ起動方法

**ローカルアプリモード（開発時）**:

```
① npm run dev:vite        # Vite dev server @ localhost:5173（ThinktankWebCC）
② npm run server:dev      # Express server @ localhost:8080（BigQuery/AI API）
③ dotnet run --project ThinktankLocalApi\ThinktankLocalApi.csproj
                          # LocalFS API @ localhost:8081（ThinktankLocal）
④ dotnet run --project ThinktankLocal\ThinktankLocal.csproj
                          # WPF + WebView2 → localhost:5173 を表示
```

④の起動時に WebView2 が `window.__THINKTANK_MODE__ = 'local'` と `window.__THINKTANK_LOCAL_API__ = 'http://localhost:8081'` を注入する。

**各サーバーの役割**:

| ポート | プロセス | 役割 |
|-------|---------|------|
| 5173 | Vite (Node.js) | React SPA の配信 |
| 8080 | Express (Node.js) | BigQuery CRUD・AI チャット API |
| 8081 | ThinktankLocalApi (.NET) | LocalFS Markdown ファイルの読み書き |

**PWA化で変わる点**:
- ① Vite の代わりにクラウドホスティング（Cloud Run 等）から SPA を配信
- ③④ ThinktankLocal の起動が不要になる
- StorageManager が LocalStorageBackend → PwaStorageBackend に切り替わり、データアクセスはすべて ② の Express 経由（BigQuery）になる

---

### データの置き場所と同期

```
【LocalFSモード（現在）】
  ThinktankLocal/vault/{vaultId}/{contentType}/{id}.md
        ↑ 読み書き
  LocalFsService（ASP.NET Core, port 8081）
        ↑ REST API
  React SPA（LocalStorageBackend ← Phase13で実装）

【BigQueryモード（Phase13以降）】
  Google BigQuery: thinktank.vault テーブル
        ↑ MERGE Upsert
  BigQueryService（Express, port 8080）
        ↑ REST API
  React SPA（PwaStorageBackend ← Phase13で実装）

【同期（Phase15以降）】
  LocalFS ──[SyncQueue]──► BigQuery（非同期・バックグラウンド）
  起動時: BigQueryの更新日時チェック → 差分をLocalFSに取り込み
```

**Phase 12時点の状態**:
- LocalFS の読み書きAPIは完成・検証済み
- BigQuery接続・同期は未実装（Phase 13・15で実装予定）
- React SPA の StorageManager / LocalStorageBackend は未実装（Phase 13で実装予定）
- データはLocalFSにのみ存在し、BigQueryとは切り離された状態

---

### Phase 13完了後の起動方法

#### Localアプリとして起動

```
① npm run dev:vite        # Vite dev server @ localhost:5173
② npm run server:dev      # Express server @ localhost:8080（BigQuery/AI API）
③ dotnet run --project ThinktankLocalApi\ThinktankLocalApi.csproj
                          # LocalFS API @ localhost:8081
④ dotnet run --project ThinktankLocal\ThinktankLocal.csproj
                          # WPF + WebView2 → localhost:5173 を表示
```

④起動時にWebView2が `window.__THINKTANK_MODE__ = 'local'` を注入 → StorageManagerがLocalStorageBackendを選択 → LocalFS（C# API経由）でデータ読み書き。

#### PWAとして起動（開発時）

```
① npm run dev:vite        # Vite dev server @ localhost:5173
② npm run server:dev      # Express server @ localhost:8080
→ ブラウザで http://localhost:5173 を直接開く
```

`window.__THINKTANK_MODE__` が未注入 → StorageManagerがPwaStorageBackendを選択 → BigQuery（Express経由）でデータ読み書き。

#### モード比較

| | Localアプリ | PWA（開発時） |
|---|---|---|
| データ | LocalFS | BigQuery |
| 入口 | WPF exe（WebView2） | ブラウザ直接 |
| ③④の起動 | 必要 | 不要 |
| モード判定 | `__THINKTANK_MODE__ = 'local'`（WebView2注入） | 未設定 |

> **②のExpressサーバーはどちらのモードでも必要**（AIチャットAPIはPhase 14でExpressに実装されるため）。

---

### Phase 13: BigQueryバックエンド（Express + thinktank.vault）

**目標**: クラウドバックエンドをBigQuery `thinktank.vault` に接続する。

**新規作成/更新**（v4 Phase 14相当、引継ぎ・整備）:

- `server/index.ts` - Express 5（ポート8080）
- `server/services/BigQueryService.ts` - MERGE文Upsert・自動リトライ
- `server/routes/bigqueryRoutes.ts` - CRUDエンドポイント

**LocalStorageBackend（src/services/storage/LocalStorageBackend.ts）**:

- C# local API経由でLocalFSを操作
- `window.__THINKTANK_LOCAL_API__` のURLを使用

**StorageManager（src/services/storage/StorageManager.ts）**:

```typescript
const mode = window.__THINKTANK_MODE__ === 'local' ? 'local' : 'pwa';
const backend = mode === 'local'
  ? new LocalStorageBackend(window.__THINKTANK_LOCAL_API__)
  : new PwaStorageBackend(); // PWA版は後続フェーズ
```

**検証**:

- [ ] LocalモードでLocalFSからデータを取得してThoughts一覧に表示できる
- [ ] BigQueryからデータを取得できる（バックエンド経由）

---

### Phase 14: AIチャットAPI

**目標**: Claude APIを使ったSSEストリーミングチャットAPIを実装し、ChatMediaとToDoPanelに接続する。

**新規作成**:

- `server/services/ChatService.ts` - @anthropic-ai/sdk、SSEストリーミング
- `server/routes/chatRoutes.ts` - `POST /api/chat/messages`

**環境変数** (`server/.env`):

```
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

**コンテキスト渡し仕様**:

- ToDoPanel: 選択中Thought + 関連Think群をシステムプロンプトに含める
- ChatMedia: 表示中ThinkデータをコンテキストとしてAIに渡す

**検証**:

- [ ] ToDoPanelからメッセージを送信するとSSEでAI応答が返る
- [ ] ChatMediaからメッセージを送信するとAI応答が返る

---

### Phase 15: Local FS ↔ BigQuery同期

**目標**: LocalFSのデータをBigQueryに非同期同期する。

**新規作成**:

- `ThinktankLocalApi/Services/SyncQueueService.cs` - 未送信キュー管理（SQLite）
- `ThinktankLocalApi/Services/SyncBackgroundService.cs` - バックグラウンド同期プロセス

**同期フロー**:

1. LocalFSへの書き込み → SyncQueueに追加
2. バックグラウンドで順次BigQueryへ送信
3. 起動時: BigQueryの更新日時チェック → 差分をLocalFSに取り込み

**同期インジケーター（UI）**:

| 状態 | 表示 | 色 |
|------|------|----|
| 同期済み | ✓ Synced | `--text-muted` |
| 同期中 | ↻ Syncing | `--text-accent` |
| 未送信あり | ● N pending | `--text-highlight` |
| オフライン | ✗ Offline | `--text-muted` |
| エラー | ⚠ Error | `--text-error` |

**検証**:

- [ ] LocalFSにファイル保存するとSyncQueueに追加される
- [ ] オンライン時にBigQueryへ送信される
- [ ] UIに同期状態が表示される

---

### Phase 16以降: 各RibbonボタンA機能の段階的実装

アプリ基盤整備（Phase 15まで）が完了したら、各パネルのRibbonボタンに機能を1つずつ組み込む。

**実装候補（優先度順に決定）**:

| フェーズ | 機能 |
|---------|------|
| Phase 16 | ThinktankRibbon: データソースからのThink抽出（LocalPC D&D） |
| Phase 17 | ThinktankRibbon: 全文検索でThought選択 |
| Phase 18 | OverviewRibbon: Thought分析（AI要約生成）|
| Phase 19 | WorkoutRibbon: nettext取り込み（URL→ダウンロード）|
| Phase 20 | WorkoutRibbon: Think → Thought作成補助 |
| Phase 21+ | Mail Server連携、外部AI連携、File Server連携 |

---

## 14. v4からの主な変更点まとめ

| 項目 | v4 | v5 |
|------|----|----|
| 開発方針 | PWA版とLocal版の同時開発 | **Local Application First**（PWAは後続） |
| UIパネル構成 | 左パネル・メインパネル（タブ）・右パネル | **4パネル**（Thinktank / Overview / Workout / ToDo）|
| メインパネル | タブ方式（OpenItem → タブ追加） | **WorkoutArea方式**（BSP ツリーで無制限分割、ドラッグ移動）|
| ContentType | memo/chat/pickup/link/table | **memo/thought/tables/links/chat/nettext** |
| データクラス | TTDataItem | **TTThink**（リネーム）|
| データ概念 | なし | **TTVault > Thoughts > Thought > Think** の階層を明確化。VaultID追加 |
| AIチャット | 右パネルまたはメインパネルタブ | **ToDoPanel**（次の展開相談）と各**ChatMedia** |
| Ribbon | 左端ツールバー（5ボタン）+左パネル切り替え | **各パネルのRibbon**（機能ボタン、段階的実装）|
| BigQuery | thinktank.files / thinktank.files260425 | **thinktank.vault** |
| LocalFSパス | {datafolder}/{保管庫名}/... | **./../ThinktankLocal/vault/** |
| PWA開発項目 | フェーズに含む | **本プランから除外** |
