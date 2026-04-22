# Thinktank 実装プラン v4
**作成日**: 2026-04-18  
**変更点**: PWA版とLocal版の同時開発、ストレージ抽象化、メタデータ先行同期、同期キューを追加

---

## 1. 目標

ユーザーの日々の入力（メモ・ファイル・写真・メール・AIとの会話）を全て記録・蓄積し、以下を実現する：

1. **記憶支援** - 「あの日何をした？」「あの件どうなった？」への想起補助
2. **思考支援** - 視点・材料の提示、概略説明の自動生成
3. **判断支援** - 意思決定のための構造化・過去類似判断の検索

---

## 2. システムアーキテクチャ（デュアルアプリ構成）

```
┌─────────────────────────┐          ┌──────────────────────────────┐
│        Browser          │          │  ThinktankLocal（WPF exe）    │
│  ┌───────────────────┐  │          │  ┌────────────────────────┐  │
│  │  ThinktankPWA     │  │          │  │  WebView2              │  │
│  │  (React SPA)      │◄─┼──────────┼──┤  ThinktankPWA (同上)   │  │
│  └───────┬───────────┘  │          │  └────────────┬───────────┘  │
│          │ IndexedDB    │          │               │ localhost:8081│
│  ┌───────▼───────────┐  │          │  ┌────────────▼───────────┐  │
│  │  Local Cache      │  │          │  │  C# Local API          │  │
│  └───────────────────┘  │          │  │  (ASP.NET Core)        │  │
└──────────┬──────────────┘          │  └────────────┬───────────┘  │
           │                         │               │ R/W          │
           │                         │  ┌────────────▼───────────┐  │
           │                         │  │  Local FS              │  │
           │                         │  │  (5,500 Markdown files)│  │
           │                         │  └────────────┬───────────┘  │
           │                         │               │ Sync Queue   │
           │                         └───────────────┼──────────────┘
           │ API calls                               │ Sync（非同期）
           ▼                                         ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Backend Server（Express / Cloud Run）           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  REST API + WebSocket + 差分同期エンドポイント              │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Google BigQuery  │
                    │  thinktank.files  │
                    └───────────────────┘
```

### 2つのアプリの違い

| 項目 | PWA版（ブラウザ） | Local版（WPF exe） |
|------|-----------------|-------------------|
| 起動 | ブラウザでURL | Thinktank.exe をダブルクリック |
| フロントエンド | 同一 ThinktankPWA | 同一 ThinktankPWA（WebView2内） |
| ストレージ | IndexedDB + BQ直接 | Local FS + 同期キュー→BQ |
| オフライン | IndexedDBキャッシュ | Local FSで完全動作 |
| 同期 | 起動時差分同期 | 常駐バックグラウンド同期 |
| 実行環境 | Windows/Mac/iOS | Windowsのみ |

### モード検出の仕組み

WPF側がWebView2を起動する際、次のJavaScriptを注入する:

```javascript
window.__THINKTANK_MODE__ = 'local';
window.__THINKTANK_LOCAL_API__ = 'http://localhost:8081';
```

React側は起動時にこの変数を確認し、ストレージバックエンドを切り替える。

---

## 3. 同期アーキテクチャ

### 3.1 メタデータ先行同期（Metadata-first Sync）

```
起動時:
① メタデータ（file_id + title + updated_at のみ）を全件フェッチ → 数KB
② ローカルのメタデータと比較 → 差分リストを特定
③ 差分アイテムは「要取得」フラグ付きでキャッシュ登録
④ アイテムを開いた時点で初めてcontentをフェッチ（オンデマンド）
```

### 3.2 同期シナリオ

| シナリオ | 実装方法 | 動作 |
|---------|---------|------|
| ① オフライン保存 | 同期キュー（Sync Queue） | ローカルに「未送信リスト」を蓄積。オンライン復帰時に順次送信 |
| ② クラウド更新の取り込み | ポーリング + プル | 起動時 + 5分ごとにメタデータをチェック。ローカルより新しければ差分ダウンロード |
| ③ 競合解決 | Last-Write-Wins | `updated_at`が新しい方を優先。同一分刻みの競合は `{id}_conflict_{device_id}.md` として保存 |

### 3.3 同期ステータス

常時UIに表示するインジケーター:

| 状態 | 表示 | 色 |
|------|------|----|
| 同期済み | ✓ Synced | `--text-muted`（薄い） |
| 同期中... | ↻ Syncing (3件) | `--text-accent`（青） |
| オフライン保存あり | ● 5 pending | `--text-highlight`（橙） |
| オフライン | ✗ Offline | `--text-muted`（薄い） |
| エラー | ⚠ Sync error | 赤 |

---

## 4. UIレイアウト（v3から継承）

```
┌─────────────────────────────────────────────────────────────────┐
│[R]│ [左パネル]         │S│ [メインパネル]              │S│[右パネル]│
│ i │                    │ │ [Tab1][Tab2]   [↻3]  [+] │ │         │
│ b │ アイコンメニュー    │ │────────────────────────── │ │アイコン  │
│ b │─────────────────  │ │                           │ │メニュー  │
│ o │ DataGrid           │ │  TextEditor / Markdown    │ │─────────│
│ n │ （ナビゲーター）    │ │  DataGrid / Graph / Chat  │ │アウトライン│
│   │                    │ │                           │ │プロパティ │
└─────────────────────────────────────────────────────────────────┘
  ↑                                                 タブバーに同期数表示
```

---

## 5. デザイン仕様（v3から継承）

```css
--bg-primary:     #1e2030;
--bg-secondary:   #1a1b26;
--bg-panel:       #24283b;
--bg-hover:       #2a3050;
--bg-selected:    #2e3460;
--text-primary:   #c0caf5;
--text-muted:     #565f89;
--text-accent:    #7aa2f7;
--text-highlight: #e0af68;
--border:         #292e42;
--radius:         6px;
```

- 線で区切らず背景色差・丸角ボックスで領域を分ける
- フォント: `'Inter', 'Hiragino Kaku Gothic ProN', system-ui`, 13px
- アイコン: lucide-react

---

## 6. データモデル

### BigQueryスキーマ（v4追加カラム）

```sql
CREATE TABLE `thinktank.files` (
  file_id      STRING    NOT NULL,
  title        STRING,
  file_type    STRING    NOT NULL,
  category     STRING,              -- クラスタリングキー
  content      STRING,              -- 本文（メタデータ同期時はNULL）
  keywords     STRING,
  related_ids  STRING,
  metadata     JSON,
  size_bytes   INT64,
  is_deleted   BOOL      DEFAULT FALSE,
  device_id    STRING,              -- NEW: 最終更新デバイスID
  sync_version INT64     DEFAULT 0, -- NEW: 競合検出用バージョン番号
  created_at   TIMESTAMP NOT NULL,
  updated_at   TIMESTAMP NOT NULL
) CLUSTER BY category;
```

### ストレージバックエンド抽象化

```typescript
// src/services/storage/IStorageBackend.ts
interface IStorageBackend {
  // メタデータのみ取得（高速）
  listMeta(category?: string): Promise<ItemMeta[]>;
  // 本文を含む完全取得（オンデマンド）
  getContent(fileId: string): Promise<string>;
  // 保存（同期キューに積む or BQに直接）
  save(record: FileRecord): Promise<void>;
  delete(fileId: string): Promise<void>;
  // 同期状態
  getSyncStatus(): SyncStatus;
}

// 実装クラス
// PwaStorageBackend     → IndexedDB + BQ REST API
// LocalStorageBackend   → C# local API (http://localhost:8081)
```

### TTDataItem（変更点）

```typescript
IsMetaOnly: boolean  // NEW: contentがまだ取得されていない
DeviceId: string     // NEW: 最終更新デバイスID
SyncVersion: number  // NEW: 競合検出用
```

### ビューモデル（v3から継承）

**TTTab**:
```typescript
ViewType: 'texteditor' | 'markdown' | 'datagrid' | 'graph' | 'chat'
ResourceID: string
IsLoading: boolean   // コンテンツのオンデマンドロード中
```

---

## 7. ディレクトリ構成

```
ThinktankWebCC/                      ← Reactフロントエンド（共通）
├── src/
│   ├── models/                      ← TTObject, TTCollection, TTDataItem...
│   ├── views/                       ← TTApplication, TTMainPanel...
│   ├── components/
│   │   ├── Layout/                  ← AppLayout, Ribbon, Splitter
│   │   ├── LeftPanel/               ← Navigator, Search, Tags, Recent
│   │   ├── MainPanel/               ← TabBar + views/
│   │   │   └── views/               ← TextEditorView, MarkdownView, DataGridView, GraphView, ChatView
│   │   ├── RightPanel/              ← Outline, Properties, Related, RightChatView
│   │   └── UI/                      ← ContextMenu, CommandPalette, SyncIndicator
│   ├── services/
│   │   └── storage/
│   │       ├── IStorageBackend.ts   ← 抽象インターフェース
│   │       ├── PwaStorageBackend.ts ← IndexedDB + REST API
│   │       ├── LocalStorageBackend.ts← C# local API呼び出し
│   │       ├── StorageManager.ts    ← モード検出・バックエンド切替
│   │       └── SyncQueueStore.ts    ← PWA側の未送信キュー管理
│   └── ...
├── server/                          ← クラウドバックエンド（Express）
│   ├── index.ts
│   ├── routes/
│   │   ├── bigqueryRoutes.ts        ← CRUD + 差分同期エンドポイント
│   │   ├── chatRoutes.ts
│   │   ├── searchRoutes.ts
│   │   └── ...
│   └── services/
│       ├── BigQueryService.ts
│       └── ...
└── ThinktankLocal/                  ← C# ローカルアプリ（新規）
    ├── ThinktankLocal.sln
    ├── ThinktankLocal/              ← WPF + WebView2 プロジェクト
    │   ├── App.xaml
    │   ├── MainWindow.xaml          ← WebView2ホスト
    │   └── ...
    └── ThinktankLocalApi/           ← C# REST APIプロジェクト
        ├── Program.cs               ← ASP.NET Core minimal API
        ├── Services/
        │   ├── LocalFsService.cs    ← Local FS R/W
        │   ├── SyncQueueService.cs  ← 同期キュー管理
        │   ├── SyncBackgroundService.cs ← 常駐同期プロセス
        │   └── ConflictResolver.cs  ← 競合解決
        └── Controllers/
            ├── FilesController.cs   ← /api/files CRUD
            └── SyncController.cs    ← /api/sync/status
```

---

## 8. 実装フェーズ

---

### Phase 1: プロジェクト初期化

**目標**: React + TypeScript + Viteプロジェクトと、C#ソリューション（スケルトン）を同時に作成する。

---

#### 前提条件

**.NET 8 SDK のインストール**（未インストールの場合）:
```powershell
winget install Microsoft.DotNet.SDK.8
# インストール後、新しいターミナルを開いて確認
dotnet --version  # → 8.x.xxx
```
> ⚠ インストール直後は PATH が反映されない。新しいターミナルを開くか、PowerShell で以下を実行してから `dotnet` を呼び出す:
> ```powershell
> $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
> ```

---

#### 作業

**① 既存コードの退避**
- `reference/` 以外の既存ソースを `reference2/` に移動

**② React プロジェクト初期化**

`package.json` の主要依存関係（v4.0.0）:
```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.7.0",
    "@tanstack/react-virtual": "^3.11.2",
    "react-force-graph": "^1.47.6",
    "lucide-react": "^0.474.0",
    "marked": "^15.0.7",
    "marked-highlight": "^2.2.1",
    "highlight.js": "^11.11.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}
```
> ⚠ `react-window` は削除。仮想スクロールは `@tanstack/react-virtual` に一本化。

`tsconfig.json` の緩和設定（段階的な型整備のため）:
```json
{
  "compilerOptions": {
    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

`src/vite-env.d.ts` に Window 拡張宣言を追加（モード検出に必要）:
```typescript
/// <reference types="vite/client" />

interface Window {
  __THINKTANK_MODE__?: 'pwa' | 'local'
  __THINKTANK_LOCAL_API__?: string
}
```

`src/index.css` にCSS変数（カラーパレット全量）を定義（Section 5 参照）。

`src/App.tsx` に Phase 1 検証ページを作成:
- `window.__THINKTANK_MODE__` / `window.__THINKTANK_LOCAL_API__` の読み取りと表示
- CSS変数のカラースウォッチ表示（パレット確認用）

**③ C# ソリューション作成**

ディレクトリ構成:
```
ThinktankLocal/
├── ThinktankLocal.sln
├── ThinktankLocal/               ← WPF + WebView2
│   ├── ThinktankLocal.csproj
│   ├── App.xaml / App.xaml.cs
│   └── MainWindow.xaml / MainWindow.xaml.cs
└── ThinktankLocalApi/            ← ASP.NET Core minimal API
    ├── ThinktankLocalApi.csproj
    ├── Program.cs
    └── LocalApiServer.cs         ← WPF から呼び出すラッパークラス（独立ファイル）
```

**`ThinktankLocalApi.csproj` の重要設定**:
```xml
<Project Sdk="Microsoft.NET.Sdk.Web">   <!-- ★ Microsoft.NET.Sdk では WebApplication が解決できないため必ず .Web を使用 -->
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>ThinktankLocalApi</RootNamespace>
    <!-- OutputType・FrameworkReference は Microsoft.NET.Sdk.Web が自動付与するため不要 -->
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Data.Sqlite" Version="8.0.0" />
  </ItemGroup>
</Project>
```

**`LocalApiServer.cs` を独立ファイルとして作成**:
> ⚠ `LocalApiServer` クラスを `Program.cs` 内の `namespace { }` ブロックに書くと `CS0246: WebApplication が見つかりません` エラーになる。必ず独立ファイルに分離する。
```csharp
// LocalApiServer.cs
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace ThinktankLocalApi;

public class LocalApiServer(int port = 8081)
{
    private WebApplication? _app;
    private readonly int _port = port;

    public Task StartAsync()
    {
        var args = new[] { $"--urls=http://localhost:{_port}" };
        var builder = WebApplication.CreateBuilder(args);
        builder.Services.AddCors(options =>
            options.AddDefaultPolicy(p => p
                .WithOrigins("http://localhost:5173", "http://localhost:4173")
                .AllowAnyHeader().AllowAnyMethod()));
        _app = builder.Build();
        _app.UseCors();
        _app.MapGet("/api/health", () => new { status = "ok", mode = "local" });
        _app.MapGet("/api/sync/status", () => new { pending = 0, isSyncing = false, isOnline = true });
        return _app.StartAsync();
    }

    public void Stop() => _app?.StopAsync().GetAwaiter().GetResult();
}
```

**`ThinktankLocal.csproj` のアイコン設定**:
> ⚠ Phase 1 では `Resources/app.ico` が存在しないため、`ApplicationIcon` と `Resource` をコメントアウトする。Phase 43 で実装。
```xml
<!-- <ApplicationIcon>Resources\app.ico</ApplicationIcon> -->  <!-- Phase 43 で追加 -->
<!-- <Resource Include="Resources\**" /> -->                   <!-- Phase 43 で追加 -->
```

---

**検証**:

```bash
# React SPA
npm run dev
# → http://localhost:5173 でカラースウォッチページが表示される
# → ブラウザコンソールに "[ThinktankLocal] Mode injected" は表示されない（pwa モード）

# C# API（別ターミナル）
cd ThinktankLocal
dotnet run --project ThinktankLocalApi
# → "Now listening on: http://localhost:5000" が表示される
```

APIレスポンスの確認:
```powershell
Invoke-RestMethod http://localhost:5000/api/health
# → { status: "ok", mode: "local", version: "4.0.0", timestamp: ... }

Invoke-RestMethod http://localhost:5000/api/sync/status
# → { pending: 0, isSyncing: false, isOnline: true, lastSyncAt: null }
```

ソリューション全体のビルド確認:
```powershell
cd ThinktankLocal
dotnet build ThinktankLocal.sln
# → ビルドに成功しました。0 個の警告 0 エラー
```

---

### Phase 2: データモデル基盤（TTObject・TTCollection）

**目標**: Observerパターンの基底クラスとコレクション管理クラスを実装する。

**新規作成**:
- `src/models/TTObject.ts`
- `src/models/TTCollection.ts`
- `src/utils/csv.ts`
- `src/types/index.ts`（`ItemMeta`, `FileRecord`, `SyncStatus`, `AppMode` 型定義を含む）

**検証**: コンソールでCRUDとObserver通知が動作する。

---

### Phase 3: アプリケーションモデル（TTDataItem・TTModels）

**目標**: 統一コンテンツモデルとアプリ全体のモデルルートを構築する。

**新規作成**:
- `src/models/TTDataItem.ts`（`IsMetaOnly`, `DeviceId`, `SyncVersion` フィールドを含む）
- `src/models/TTStatus.ts`
- `src/models/TTAction.ts`
- `src/models/TTEvent.ts`
- `src/models/TTModels.ts`

**検証**: TTModelsからMemoコレクションへのアイテム追加・取得が動作する。

---

### Phase 4: ビューモデル（TTMainPanel・TTLeftPanel・TTRightPanel・TTApplication）

**目標**: 新UIアーキテクチャのビューモデルを実装する。

**新規作成**:
- `src/views/TTTab.ts` - ViewType・ResourceID・IsLoading・IsDirty・DisplayTitle
- `src/views/TTMainPanel.ts` - タブ管理（OpenTab / CloseTab / SwitchTab / NewTab / CloseAllTabs / SetActiveTabDirty）
- `src/views/TTLeftPanel.ts` - IsOpen / Width / PanelType / Filter / SelectedItemID（Open/Close/Toggle/SwitchTo/SetFilter/SelectItem/SetWidth）
- `src/views/TTRightPanel.ts` - IsOpen / Width / PanelType / ChatMessages（Open/Close/Toggle/SwitchTo/SetWidth/AddChatMessage/ClearChat）
- `src/views/TTApplication.ts` - 最上位コントローラ（シングルトン）。AppMode / LocalApiUrl / Models / MainPanel / LeftPanel / RightPanel / OpenItem() / ActiveItem
- `src/views/helpers/DateHelper.ts`
- `src/hooks/useAppUpdate.ts` - TTObject Observer → React useReducer 接続

**修正**:
- `src/models/TTObject.ts` - `getNowString()` をミリ秒＋ランダムサフィックスに変更（ID重複防止）
- `src/types/index.ts` - 以下の型を追加
  - `ViewType`: `'texteditor' | 'markdown' | 'datagrid' | 'graph' | 'chat'`
  - `LeftPanelType`: `'navigator' | 'search' | 'tags' | 'recent'`
  - `RightPanelType`: `'outline' | 'properties' | 'related' | 'chat'`
  - `ChatMessage`: `{ id, role: 'user'|'assistant', content, timestamp }`

---

#### 実装詳細・仕様

**TTTab**:
```typescript
public get DisplayTitle(): string {
  return this.IsDirty ? `● ${this.Name}` : this.Name;
}
// ID: tab-{Date.now()}-{Math.random().toString(36).slice(2,7)} で一意に生成
```

**TTMainPanel.OpenTab()**:
- 同一 `ResourceID` + 同一 `ViewType` のタブが既に存在する場合はスイッチのみ（重複防止）
- 存在しない場合は新規タブを末尾に追加してアクティブにする

**TTRightPanel.AddChatMessage()**:
- メッセージ追加時に `IsOpen = true` を自動設定する（チャット送信でパネルを自動展開）
- メッセージ ID: `msg-${Date.now()}-${Math.random().toString(36).slice(2,7)}`（重複防止のためランダムサフィックス付き）

**TTApplication.OpenItem()**:
```typescript
// Models.Memos.GetDataItem(resourceId) でアイテムを検索
// → MainPanel.OpenTab() でタブを作成
// → IsMetaOnly=true の場合は tab.IsLoading=true → LoadContent() → IsLoading=false（Phase 13 以降）
// → LeftPanel.SelectItem(resourceId) で左パネルの選択を更新
```

**useAppUpdate()**:
```typescript
// TTObject の AddOnUpdate を購読し、通知を受けて React コンポーネントを強制再レンダリングする
export function useAppUpdate(obj: TTObject): void
```

---

#### ⚠️ 落とし穴・注意事項（再構築時に必須）

**① TTObject.getNowString() はミリ秒＋ランダムサフィックスが必須**

> テスト実行時に同一ミリ秒内で複数の `TTDataItem` が生成されると ID が重複する。
> `OpenTab()` の重複防止ロジックが誤発火し、新しいタブが追加されないバグが発生する。

```typescript
// ❌ 秒単位（重複する）
return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;

// ✅ ミリ秒＋ランダムサフィックス（確実に一意）
const ms = String(now.getMilliseconds()).padStart(3, '0');
const rand = Math.random().toString(36).slice(2, 6);
return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}-${ms}-${rand}`;
// 例: 2026-04-19-153639-634-kv4l
```

**② TTRightPanel.AddChatMessage() でパネルを自動展開すること**

> テストは `AddChatMessage` 後に `IsOpen === true` を期待する。
> 実装しないと「チャットを送信しても右パネルが開かない」UXバグになる。

```typescript
// ✅ 正しい実装
this.ChatMessages = [...this.ChatMessages, msg];
if (!this.IsOpen) this.IsOpen = true;  // ← 必須
this.NotifyUpdated();
```

**③ TTApplication はシングルトンで子パネルの _parent を設定すること**

```typescript
this.MainPanel._parent = this;
this.LeftPanel._parent = this;
this.RightPanel._parent = this;
// → 子パネルの NotifyUpdated() が TTApplication まで伝播する
```

---

#### 検証（App.tsx に runPhase4Tests() として実装）

テストケース 14 項目がすべてパスすること:

| # | テスト | チェック内容 |
|---|--------|-------------|
| 1 | TTApplication: シングルトン | `Instance === Instance`、`AppMode = 'pwa'` |
| 2 | TTApplication: パネル初期化 | MainPanel / LeftPanel / RightPanel が存在する |
| 3 | TTMainPanel: NewTab | Tabs.length=1、ActiveTab.ID が一致 |
| 4 | TTMainPanel: OpenTab（新規） | Tabs.length=2、ResourceID が一致 |
| 5 | TTMainPanel: OpenTab（重複防止） | Tabs.length=2 のまま、既存タブへスイッチ |
| 6 | TTMainPanel: SwitchTab | ActiveTab.ID が指定タブに変わる |
| 7 | TTMainPanel: Observer 通知 | NewTab で mainNotified >= 1 |
| 8 | TTMainPanel: CloseTab | Tabs.length が 1 減り、隣タブがアクティブに |
| 9 | TTMainPanel: IsDirty + DisplayTitle | IsDirty=true で DisplayTitle が `●` で始まる |
| 10 | TTLeftPanel: Toggle | IsOpen が反転する |
| 11 | TTLeftPanel: SwitchTo | PanelType が変わり IsOpen=true |
| 12 | TTLeftPanel: SetFilter | Filter 文字列が更新される |
| 13 | TTRightPanel: AddChatMessage | messages=2、**IsOpen=true**（自動展開） |
| 14 | TTApplication: OpenItem | Tabs.length が増加、SelectedItemID が一致 |

---

### Phase 5: Obsidianライクレイアウトシェル

**目標**: リボン・左右サブパネル・メインパネルの骨格UIと同期インジケーターを構築する。

**新規作成**:
- `src/components/UI/SyncIndicator.tsx + .css` - 同期状態バッジ（タブバー右端に常時表示）
- `src/components/Layout/Splitter.tsx + .css` - ドラッグで幅変更するセパレーター
- `src/components/Layout/Ribbon.tsx + .css` - 縦並びアイコンリボン（44px 幅）
- `src/components/Layout/AppLayout.tsx + .css` - Flex レイアウト `[Ribbon][LeftPanel][Splitter][MainPanel][Splitter][RightPanel]`
- `src/components/LeftPanel/LeftPanelHeader.tsx` - タイトル＋閉じるボタン
- `src/components/LeftPanel/LeftPanel.tsx + .css` - 開閉アニメーション付きコンテナ
- `src/components/RightPanel/RightPanelHeader.tsx`
- `src/components/RightPanel/RightPanel.tsx + .css`
- `src/components/MainPanel/EmptyState.tsx + .css` - タブ 0 件時のウェルカム画面
- `src/components/MainPanel/TabBar.tsx + .css` - タブ一覧＋右端 SyncIndicator
- `src/components/MainPanel/MainPanel.tsx + .css` - TabBar＋コンテンツエリア

**変更**:
- `src/App.tsx` - Phase 4 テストページ → `<AppLayout />` に切り替え。テスト関数はデバッグ用として保持。`window.__runTests()` でコンソールから実行可能。

---

#### 実装詳細・仕様

**AppLayout のレイアウト構成**:
```
[Ribbon 44px固定][LeftPanel 可変][Splitter 4px][MainPanel flex:1][Splitter 4px][RightPanel 可変]
```
- CSS Flexbox（`display: flex`）で横並び
- LeftPanel / RightPanel は `IsOpen=false` のとき Splitter ごと非表示
- Splitter は `IsOpen` が true のときのみレンダリングする（条件付き）

**Ribbon のアイコン構成**:

| 位置 | アイコン（lucide-react） | 種別 | 操作 |
|------|------------------------|------|------|
| 上部 | `BookOpen` | navigator | `LeftPanel.SwitchTo('navigator')` |
| 上部 | `Search` | search | `LeftPanel.SwitchTo('search')` |
| 上部 | `Tag` | tags | `LeftPanel.SwitchTo('tags')` |
| 上部 | `Clock` | recent | `LeftPanel.SwitchTo('recent')` |
| 下部 | `List` | outline | `RightPanel.SwitchTo('outline')` |
| 下部 | `Link2` | related | `RightPanel.SwitchTo('related')` |
| 下部 | `Settings` | 設定 | Phase 30 以降 |

- アクティブ状態: `PanelType === type && IsOpen` のとき `--bg-selected` + `--text-accent`
- 同じアイコンを再クリックでパネルを閉じる（`SwitchTo()` の Toggle 仕様）

**LeftPanel / RightPanel の開閉アニメーション**:
```tsx
// IsOpen=false のとき width:0 へ CSS transition でアニメーション
style={{
  width: lp.IsOpen ? lp.Width : 0,
  minWidth: lp.IsOpen ? lp.Width : 0,
}}
// CSS: transition: width var(--transition-panel), min-width var(--transition-panel)
// overflow: hidden で中身をクリップ
```

**Splitter の実装**:
- `mousedown` で `lastX` を記録し `document` に `mousemove` / `mouseup` を登録
- `mousemove` で `delta = currentX - lastX` を計算し `onResize(delta)` を呼ぶ（delta 方式）
- `mouseup` でリスナーを解除
- ドラッグ中: `document.body.style.cursor = 'col-resize'` / `userSelect = 'none'` を設定
- ヒット領域: `::after { inset: 0 -3px }` で前後 3px 拡張
- AppLayout 側で delta を `LeftPanel.SetWidth(width + delta)` / `RightPanel.SetWidth(width - delta)` に接続
  - 右パネルは delta の符号が逆（`width - delta`）

**SyncIndicator の状態とアイコン**:

| state | アイコン（lucide-react） | 色 |
|-------|------------------------|-----|
| `synced` | `CheckCircle2` size=11 | `--sync-synced`（`--text-muted`） |
| `syncing` | `Loader2` + spin animation + 件数 | `--sync-syncing`（`--text-accent`） |
| `pending` | `●N` テキスト | `--text-highlight` |
| `offline` | `WifiOff` | `--text-muted` |
| `error` / `conflict` | `AlertCircle` | `--sync-error`（`--text-error`） |

- Phase 5 では `MainPanel` がダミーの `SyncStatus { state: 'synced' }` を渡す
- Phase 15 以降で `StorageManager.getSyncStatus()` に接続して差し替える

**TabBar の Props**:
```tsx
interface Props {
  tabs: ReadonlyArray<TTTab>;
  activeTabId: string;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  syncStatus: SyncStatus;
}
// タブ表示: tab.DisplayTitle（IsDirty 時に ● プレフィックス）
// 右端: <SyncIndicator status={syncStatus} />
```

**panel-header 共有スタイル**:
- `.panel-header` / `.panel-header__title` / `.panel-header__close` を `LeftPanel.css` に定義
- `RightPanelHeader` も同じ CSS クラスを使用（import は `LeftPanel.css` に依存しない独立スタイルとして実装するのが望ましい。次回は共通の `Panel.css` に抽出推奨）

---

#### ⚠️ 落とし穴・注意事項（再構築時に必須）

**① AppLayout に `flex: 1` と `min-height: 0` が必須**

> `#root` が `flex-direction: column` の flex コンテナ。  
> `AppLayout` に `flex: 1` がないと高さが縮んで Ribbon のアイコンだけが小さく表示される。

```css
/* ✅ 正しい AppLayout.css */
.app-layout {
  display: flex;
  flex: 1;        /* ← 必須: #root の縦方向に広がる */
  min-height: 0;  /* ← 必須: flex 子要素の縮小を許可 */
  width: 100%;
  overflow: hidden;
}
```

**② MainPanel に `min-width: 0` が必須**

> flex 子要素はデフォルトで `min-width: auto` のため、コンテンツ幅より縮まらない。  
> `min-width: 0` を設定しないとタブが増えた際にレイアウトが崩れる。

```css
.main-panel {
  flex: 1;
  min-width: 0;  /* ← 必須 */
}
```

**③ Splitter は `IsOpen` のときのみレンダリング**

```tsx
// ✅ IsOpen=false のとき Splitter を非表示にする
{app.LeftPanel.IsOpen && <Splitter onResize={handleLeftResize} />}
```

> Splitter を常時レンダリングすると `IsOpen=false` でも幅 4px の隙間が残る。

**④ `panel-header` スタイルは LeftPanel.css に定義**

> 現実装では `.panel-header` 系のクラスが `LeftPanel.css` に書かれており、  
> `RightPanelHeader` もこれに依存している。  
> 次回再構築時は `src/components/shared/Panel.css` などに独立させること。

---

#### 検証条件

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | Ribbon のナビアイコンをクリック | 左パネルが開く（`IsOpen=true`, `PanelType='navigator'`）|
| 2 | 同じアイコンを再クリック | 左パネルが閉じる |
| 3 | 別の種別（検索等）をクリック | `PanelType` が変わり開いた状態を維持 |
| 4 | 左パネルの `×` ボタン | パネルが閉じる |
| 5 | Splitter をドラッグ | 左パネル幅が変更される（180〜600px でクランプ） |
| 6 | Ribbon 下部のアイコンをクリック | 右パネルが開く |
| 7 | タブが 0 件 | EmptyState（「Thinktank」）が表示される |
| 8 | タブバー右端 | SyncIndicator（薄い ○）が常時表示 |

---

### Phase 6: 左パネル - ナビゲーター（仮想スクロールリスト）

**目標**: 左パネルのナビゲーターにアイテム一覧を表示し、クリックでメインパネルで開く。

**新規作成**:
- `src/components/LeftPanel/NavigatorView.tsx` - @tanstack/react-virtual 仮想スクロールリスト
- `src/components/LeftPanel/NavigatorView.css` - ナビゲーター・フィルタ・行スタイル

**更新**:
- `src/components/LeftPanel/LeftPanel.tsx` - `PanelType === 'navigator'` 時に NavigatorView をレンダー
- `src/App.tsx` - `seedTestData()` 関数を追加（起動時に10件のサンプルアイテムを投入）
- `src/views/TTLeftPanel.ts` - デフォルト幅を 260px → **330px** に変更
- `src/views/TTRightPanel.ts` - デフォルト幅を 240px → **310px** に変更

**仕様**:
- 各行: `[アイコン] タイトル [更新日]` 形式、行高さ固定 **36px**
- ContentTypeアイコン（lucide-react）: memo=FileText / chat=MessageCircle / file=Paperclip / photo=Image / email=Mail / drive=HardDrive / url=Link
- フィルタ欄（AND/OR/NOT構文）: スペース区切り=AND、`OR` キーワード=OR、`NOT` キーワード=次トークンを除外
- フィルタ対象フィールド: `item.Name + " " + item.Keywords`（小文字比較）
- アイテム数表示: フィルタ時は `N / M 件`、非フィルタ時は `M 件`
- ソート: `UpdateDate` 降順（新しい順）、`localeCompare` で文字列比較（`yyyy-MM-dd-HHmmss-mmm-rand` 形式なので正しく並ぶ）
- `IsMetaOnly=true` のアイテムは `opacity: 0.5` で薄く表示
- クリック → `TTApplication.OpenItem(id, 'texteditor')` → メインパネルに新タブで開く
- キーボード: `Enter` キーでも同じ動作（`role="button"` + `tabIndex={0}`）
- 仮想スクロール: `useVirtualizer`（overscan=5）で大量アイテムでもパフォーマンス維持

**seedTestData() の仕様** (`src/App.tsx`):
```typescript
function seedTestData(): void {
  const memos = TTApplication.Instance.Models.Memos
  if (memos.Count > 0) return  // 重複投入防止（HMR対策）
  const samples = [/* 10件のサンプル */]
  samples.forEach(({ content, contentType }) => {
    const item = new TTDataItem()
    item.ContentType = contentType
    item.Content = content
    item.markSaved()   // IsDirty=false にする
    memos.AddItem(item)
  })
}
seedTestData()  // モジュールレベルで呼び出し
```
> ⚠ `memos.Count > 0` チェックが必須。HMR（Hot Module Replacement）でモジュールが再評価される際に重複投入されるのを防ぐ。

**AND/OR/NOT フィルタ実装**:
```typescript
function matchesFilter(item: TTDataItem, filter: string): boolean {
  if (!filter.trim()) return true;
  const text = `${item.Name} ${item.Keywords}`.toLowerCase();
  const orGroups = filter.split(/\bOR\b/i);
  return orGroups.some(group => {
    const tokens = group.trim().split(/\s+/).filter(Boolean);
    return tokens.every(token => {
      if (token.toUpperCase() === 'NOT') return true;
      const notIdx = tokens.indexOf(token) - 1;
      const isNot = notIdx >= 0 && tokens[notIdx].toUpperCase() === 'NOT';
      return isNot ? !text.includes(token.toLowerCase()) : text.includes(token.toLowerCase());
    });
  });
}
```

**UpdateDate 表示フォーマット**:
```typescript
function formatDate(updateDate: string): string {
  // "2026-04-19-153639-634-kv4l" → "04/19"
  const parts = updateDate.split('-');
  if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
  return '';
}
```

**⚠ 実装上の落とし穴**:

1. **`useAppUpdate` を2回呼ぶ必要がある**  
   NavigatorView は `app.Models.Memos`（アイテム追加・削除で更新）と `app.LeftPanel`（フィルタ・選択状態で更新）の両方を購読しなければならない。どちらか一方だけだとフィルタ変更やアイテム追加が反映されない。
   ```tsx
   useAppUpdate(app.Models.Memos);
   useAppUpdate(app.LeftPanel);
   ```

2. **仮想スクロールのコンテナは `position: relative` が必須**  
   `useVirtualizer` の各アイテムは `position: absolute; top: vItem.start` で配置されるため、外側ラッパーに `position: relative` と `height: virtualizer.getTotalSize()` が必要。
   ```tsx
   <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
     {virtualizer.getVirtualItems().map(vItem => (
       <div style={{ position: 'absolute', top: vItem.start, left: 0, right: 0, height: ITEM_HEIGHT }}>
   ```

3. **`navigator__list` の CSS に `flex: 1; overflow-y: auto` が必須**  
   LeftPanel の高さから フィルタ欄・件数表示を除いた残り全体をリストが占有する必要がある。`flex: 1` を付けないと仮想スクロールの高さ計算がずれる。

4. **デフォルトパネル幅はスクリーンサイズに合わせて要調整**  
   `TTLeftPanel.Width = 330` / `TTRightPanel.Width = 310` は 1920px 幅モニター基準。小さい画面では `SetWidth()` の clamp 範囲（左: 180〜600、右: 180〜500）内で調整する。

**検証条件**:
- [ ] 左パネルを開く（Ribbon ナビゲーターアイコン）と 10 件のサンプルアイテムが表示される
- [ ] フィルタ欄に入力するとリアルタイムに絞り込まれ件数表示が更新される（例: "react" → 該当件数/10件）
- [ ] `OR` 構文（例: "react OR vue"）・`NOT` 構文（例: "react NOT test"）が正しく動作する
- [ ] アイテムをクリックすると `TTApplication.OpenItem` が呼ばれる（コンソールログで確認）
- [ ] UpdateDate 降順（新しい順）でソートされている
- [ ] 左パネル幅デフォルト330px・右パネル幅デフォルト310pxで表示される

---

### Phase 7: メインパネル - TextEditorビュー

**目標**: Monaco Editorによるテキスト編集ビューを実装する。

**新規作成**:
- `src/components/MainPanel/views/TextEditorView.tsx`

**仕様**:
- `IsMetaOnly=true` のタブを開いた場合: スピナー表示 → コンテンツをオンデマンドフェッチ → 表示
- Ctrl+S で保存（StorageManager経由）
- 未保存変更: タブタイトルに `●` を表示

**検証**: アイテムを開きTextEditorでコンテンツが表示・編集できる。Ctrl+Sで保存できる。

---

### Phase 8: メインパネル - Markdownビュー

**目標**: markedによるMarkdownレンダリングビューを実装する。

**新規作成**:
- `src/components/MainPanel/views/MarkdownView.tsx`
- `src/components/MainPanel/views/MarkdownView.css`
- `src/utils/markdownToHtml.ts`
- `src/components/MainPanel/ViewToolbar.tsx`
- `src/components/MainPanel/ViewToolbar.css`

**更新**:
- `src/components/MainPanel/MainPanel.tsx` - ViewToolbar + MarkdownView 分岐を追加
- `src/views/TTMainPanel.ts` - `SetActiveTabViewType()` メソッドを追加
- `src/App.tsx` - `seedTestData()` に `[Memo:ID]` クロスリファレンスを追加

**仕様詳細**:

**markdownToHtml.ts**:
- `marked v18` の `parse()` を使用（同期でstring返却）
- `[Memo:ID]` タグを **前処理** で `[title](memo://ID)` に変換してから marked に渡す
  - コードブロック（``` ``` ```）・コードスパン（`` ` `` ）内は変換しない（プレースホルダー退避方式）
- **後処理** で `<a href="memo://ID">` を `<a class="md-memo-link" data-memo-id="ID" href="#">` に差し替え
- 外部リンク（`https?://`）に `target="_blank" rel="noopener noreferrer"` を付与
- marked v18 の Renderer API は引数が `{href, title, tokens}` 形式に変更されており、
  カスタムレンダラーを使う場合は `parser.parseInline(tokens)` が必要。
  **後処理（正規表現）方式の方が安定しているため採用した。**

```typescript
// 前処理: [Memo:ID] → [title](memo://ID)
// 後処理: <a href="memo://ID"> → <a class="md-memo-link" data-memo-id="ID" href="#">
export function markdownToHtml(markdown: string, options?: MarkdownToHtmlOptions): string
```

**MarkdownView.tsx のアーキテクチャ**:
- `MarkdownView`（外側） → `MarkdownBody`（内側サブコンポーネント）の2層構造
- **重要**: `useAppUpdate(item)` を条件分岐の中で呼ぶと React の rules-of-hooks 違反になる。
  `item` が存在する場合のみマウントされる `MarkdownBody` コンポーネント内で `useAppUpdate` を呼ぶことで回避する。
  ```tsx
  // ❌ NG（hooks ルール違反）
  if (item) useAppUpdate(item);

  // ✅ OK（MarkdownBody は item が存在する場合のみマウントされる）
  function MarkdownBody({ item }: { item: TTDataItem }) {
    useAppUpdate(item);  // 常に呼ばれる位置
    // ...
  }
  export function MarkdownView({ tab }) {
    const item = ...;
    return item ? <MarkdownBody item={item} /> : null;
  }
  ```
- `[Memo:ID]` リンクのクリックはイベント委譲（`e.target.closest('a.md-memo-link')`）で処理し、`app.OpenItem(id, 'texteditor')` を呼ぶ

**ViewToolbar.tsx**:
- タブが開いている間、コンテンツエリア上部に常時表示
- [編集]（Pencil アイコン）/ [プレビュー]（Eye アイコン）トグルボタン
- クリックで `mp.SetActiveTabViewType(viewType)` を呼び出す
- MainPanel.tsx の `main-panel__content` 内に配置（TabBar の下、エディタの上）

**MainPanel.tsx の分岐ロジック**:
```tsx
{mp.ActiveTab ? (
  <>
    <ViewToolbar viewType={mp.ActiveTab.ViewType} onSwitch={vt => mp.SetActiveTabViewType(vt)} />
    {mp.ActiveTab.ViewType === 'texteditor' ? (
      <TextEditorView key={mp.ActiveTab.ID} tab={mp.ActiveTab} />
    ) : mp.ActiveTab.ViewType === 'markdown' ? (
      <MarkdownView key={mp.ActiveTab.ID} tab={mp.ActiveTab} />
    ) : (
      /* 今後実装のビュー種別プレースホルダー */
    )}
  </>
) : null}
```
> `key={tab.ID}` でタブ切り替え時に必ず再マウントし、Monaco のコンテンツをリセットする。

**TTMainPanel.SetActiveTabViewType()**:
```typescript
public SetActiveTabViewType(viewType: ViewType): void {
  const tab = this.ActiveTab;
  if (!tab || tab.ViewType === viewType) return;
  tab.ViewType = viewType;
  this.NotifyUpdated();
}
```

**MarkdownView.css の見出し色分け**:
| 要素 | CSS 変数 | 色 |
|---|---|---|
| `h1` | `--text-highlight` | `#e0af68`（ゴールド） |
| `h2` | `--text-accent` | `#7aa2f7`（ブルー） |
| `h3` | `--text-success` | `#9ece6a`（グリーン） |
| `strong` | `--text-warning` | `#ff9e64`（オレンジ） |
| `a.md-memo-link` | `--text-success` | グリーン・破線下線 |

**seedTestData() のクロスリファレンス追加方法**:
- TTDataItem の ID は生成時に確定するため、先にアイテムを全て生成してから ID を使って `[Memo:PLACEHOLDER]` を実 ID に差し替える方式を採用。
```typescript
const reactTs = addItem('# React と TypeScript\n...', 'memo')
const observer = addItem('# Observer パターン\n[Memo:PHASES_ID] 全体で使われている。', 'memo')
// ...全アイテム生成後
const replacePlaceholders = (content: string) =>
  content.replace(/\[Memo:REACT_TS_ID\]/g, `[Memo:${reactTs.ID}]`)
         .replace(/\[Memo:OBSERVER_ID\]/g,  `[Memo:${observer.ID}]`)
         // ...
for (const item of [thinktank, observer, bigquery, virtual, sync]) {
  item.setContentSilent(replacePlaceholders(item.Content))
  item.markSaved()
}
```

**⚠ 実装上の落とし穴**:

1. **marked v18 の Renderer API 変更**  
   v18 では `renderer.link` の引数が `{href, title, text}` から `{href, title, tokens}` に変更。
   `text` を得るには `this.parser.parseInline(tokens)` が必要。
   カスタムレンダラーは避け、**後処理（正規表現）方式**を採用すること。

2. **useAppUpdate を条件分岐の中で呼ばない**  
   `if (item) useAppUpdate(item)` は rules-of-hooks 違反でランタイムエラーになる。
   「item が存在する場合のみマウントされるサブコンポーネント」に hook を移すことで解決する。

3. **[Memo:ID] のサンプルデータ追加方法**  
   TTDataItem の ID は `super()` 呼び出し時に生成されるため、コンテンツ内で相互参照する際は
   全アイテムを先に生成してから ID を差し替える必要がある。
   ハードコードした ID を使うと ID フォーマット（`yyyy-MM-dd-HHmmss-mmm-rand`）の整合性が崩れるので避けること。

4. **ViewToolbar はタブが開いている場合のみ表示**  
   `mp.Tabs.length === 0` の EmptyState 表示時には ViewToolbar を出さない。
   `mp.ActiveTab` の存在確認後に `<>ViewToolbar + View</>` をレンダーする構造にする。

**検証条件**:
- [ ] アイテムを開いて [プレビュー] ボタンをクリックすると Markdown がレンダリングされる
- [ ] h1=ゴールド / h2=ブルー / h3=グリーンで色分けされている
- [ ] `[Memo:ID]` リンクがグリーンの破線付きで表示される
- [ ] `[Memo:ID]` リンクをクリックすると対象アイテムが新タブで開く
- [ ] [編集] ボタンで Monaco Editor に戻れる
- [ ] 別タブに切り替えても各タブの viewType が独立して保持される

---

### Phase 9: メインパネル - DataGridビュー

**目標**: コレクション全体をテーブル形式で表示するビューを実装する。

**新規作成**:
- `src/components/MainPanel/views/DataGridView.tsx`

**仕様**:
- 列: チェックボックス・ContentType・タイトル・更新日時・同期状態
- **同期状態列**: `IsMetaOnly=true` はグレー（未取得）、`dirty` はオレンジ（未送信）、正常は表示なし
- チェックした複数アイテム→💬ボタンでAIチャット起動

**検証**: DataGridビューに全アイテムが表示される。同期状態列が機能する。

---

### Phase 9Ex1: データモデル・UI構造の再定義

**目標**: TTDataItemの種別定義、保管庫（TTVault）、左端ツールバー＋左パネル、pickupタブ設計を実装する。

---

#### データモデル

##### ContentType の値変更（TTDataItem）

`ContentType` 属性の値を以下に変更する（属性名は変更なし）：

| ContentType | 用途 | 追記 |
|---|---|---|
| `memo` | テキストメモ | 可 |
| `chat` | AIとの対話記録 | 可（既存chatを継続した場合は上書き保存） |
| `pickup` | アイテム集合（フィルターまたはID一覧） | 可 |
| `link` | URL/ローカルURI/Google Drive等へのリンク集 | 可 |
| `table` | 複数テーブルを含むデータ（独自形式md） | 可 |

##### ファイルフォーマット（すべて `.md`）

**memo**
```
タイトル（1行目）
（自由なmarkdownテキスト）
```

**chat**
```
タイトル（1行目）
# ユーザー発話
AI発話（自由記載）
# ユーザー発話
...
```

**pickup**
```
タイトル（1行目）
> フィルター条件行（省略可）
* アイテムID行（省略可）
（その他自由記載）
```
- `>` 行 = フィルター条件（保存された検索クエリ）
- `*` 行 = 個別データのID
- 両方共存可能
- 空のpickup = フィルターなし = 全件対象

**link**
```
タイトル（1行目）
* URL or URI（1件1行）
（その他自由記載）
```

**table**
```
タイトル（1行目）

# テーブルタイトル

列名csv行（省略可）
データcsv行
データcsv行

# テーブルタイトル2

...（複数テーブル可）
```
- `#` テーブルタイトル行の前後に空行
- 列名csv行の前にも空行

##### ファイルID形式

```
yyyy-MM-dd-hhmmss
```
- 同秒衝突時：1秒ずつ遡って空いているIDを割り当て

---

#### 保管庫（TTVault）

- `TTVault` クラスを新規実装（`src/models/TTVault.ts`）
- アプリは複数保管庫を管理（保管庫間のデータ移動は不可）
- LocalFS パス構造: `{datafolder}/{保管庫名}/{ContentType}/{ID}.md`
- BigQuery 構造: テーブル名=保管庫名、`file_type(.md)` / `category(ContentType)` カラムを持つ

---

#### 左端ツールバー＋左パネル

##### ツールバー（左端アイコンバー）5ボタン

| ボタン | 左パネル内容 |
|---|---|
| ① pickup設定 | フォーカスpickupタブの設定 |
| ② メディア設定 | フォーカスメディアの設定 |
| ③ 履歴 | 表示済みpickupタブの履歴一覧 |
| ④ フィルター | 保管庫フィルタリング＋新規タブ作成 |
| ⑤ 全文検索 | 保管庫全文検索＋新規タブ作成 |

##### ①パネル（pickup設定）
- フォーカスpickupタブに紐づくpickupデータの情報: ID / アイテム数 / タイトル
- DataGrid Filter用: pulldown履歴付きtextbox
- DataGrid: pickupデータの子アイテム一覧（カラム: チェック / ID / タイトル / ContentType / 更新日）
  - チェック列: タブで現在表示中のアイテムはチェック表示

##### ②パネル（メディア設定）
- チェックボタン（変更不可）: フォーカスメディアの表示データがpickupに含まれるか示す
- 表示データのタイトル
- メディア選択ボタン: ContentTypeに対応する利用可能なメディアへの切り替えボタン群
- ハイライト用: 履歴付きtextbox（表示中メディア内のキーワードハイライト）

##### ③パネル（履歴）
- これまで表示したpickupタブの履歴一覧
- アイテムを選択 → そのpickupを新規タブで生成・表示

##### ④パネル（フィルター）
- 保管庫のpulldown選択肢
- Filter用 pulldown履歴付きtextbox ＋「フィルター作成」ボタン
- 保管庫の全データ表示用DataGrid（filterテキストでリアルタイム絞り込み）
- 「フィルター作成」押下 → 絞り込まれたアイテム群から新規pickupファイルを作成し、新規タブで表示

##### ⑤パネル（全文検索）
- 保管庫のpulldown選択肢
- 検索キーワード用 履歴付きtextbox ＋「全文検索ヒット作成」ボタン
- 全文検索ヒットアイテム表示用DataGrid
- 「全文検索ヒット作成」押下 → ヒットアイテム群から新規pickupファイルを作成し、新規タブで表示

---

#### メインパネル（pickupタブ）

##### タブの構造

各タブは1つのpickupデータ（ContentType=`pickup`）を持つ：

| プロパティ | 内容 |
|---|---|
| `GroupID` | pickupデータのResourceID |
| `CurrentItemID` | 現在表示中のアイテムID |
| `ViewType` | 現在のメディア種別 |
| `NavigationHistory` | 表示履歴（← → 用） |

- pickupデータのアイテム一覧を1件ずつ表示
- タイトルバーの ← → で前後のアイテムに移動

##### 起動時タブ
- 空のpickupファイルで1タブ作成
- 空pickup = フィルターなし = 全保管庫・全データ対象
- 初期表示メディア: DataGrid

##### タイトルバー（分割なし）
- 左寄せ: ← → ボタン（表示データ履歴の行き来）

##### メディアとContentTypeの対応

| メディア | 対応ContentType | 備考 |
|---|---|---|
| texteditor | memo / chat / pickup / link / table | 編集・閲覧 |
| markdown | memo / chat / pickup / link | 閲覧のみ |
| datagrid | pickup / link / table | 編集・閲覧 / 上部にfilter textbox |
| graph | memo / chat / pickup / link / table | 閲覧のみ（関係グラフ）/ 上部にfilter textbox |
| chat | chat（新規・既存継続） | CLI風表示 / 上部に履歴付きtextbox |

##### マルチペイン
- 現フェーズはシングルペイン（1タブ1ペイン）
- 将来フェーズで最大3列×2行に拡張予定

---

**実装対象**:
- `TTDataItem.ContentType` の型定義を `memo/chat/pickup/link/table` に変更
- `TTVault` クラスの新規実装（`src/models/TTVault.ts`）
- `LeftPanelType` の種別定義変更（5種類: pickup-settings / media-settings / history / filter / fulltext-search）
- `TTTab` に `GroupID`, `CurrentItemID`, `NavigationHistory` を追加
- 左端ツールバーコンポーネント（`src/components/LeftToolbar/LeftToolbar.tsx`）
- 各左パネルコンポーネント（PickupSettingsPanel / MediaSettingsPanel / HistoryPanel / FilterPanel / FulltextSearchPanel）

**検証**: 左端ツールバーの各ボタンで対応左パネルが開閉できる。pickupタブが起動時に生成され、← → でダミーデータをナビゲートできる。

---

### Phase 10: メインパネル - グラフビュー（react-force-graph）

**目標**: アイテム間の関連をノードグラフで表示する。

**新規作成**:
- `src/components/MainPanel/views/GraphView.tsx`

**仕様**:
- `react-force-graph` を使用
- ノード: TTDataItem（ContentTypeに応じた色分け）
- エッジ: RelatedIDs / `[Memo:ID]` タグの解析から生成
- ノードクリックでアイテムをメインパネルで開く
- `--bg-primary` 背景

**検証**: アイテム間の関連がグラフで表示される。ノードクリックでアイテムが開く。

---

### Phase 11: メインパネル - Chatビュー

**目標**: AIとのチャットビューを実装する（バックエンド未接続でUIのみ）。

**新規作成**:
- `src/components/MainPanel/views/ChatView.tsx`

**仕様**:
- ユーザー発言 `>` プレフィックス（右）/ AI応答 Markdownレンダリング（左）
- ストリーミング表示（カーソル点滅）
- 入力欄: 下部固定

**検証**: UIが表示される（レスポンスはモックデータで確認）。

---

### Phase 12: 右パネル（アウトライン・プロパティ・関連）

**目標**: 右パネルの各ビューを実装する。

**新規作成**:
- `src/components/RightPanel/OutlineView.tsx` - Markdown見出し一覧。クリックでジャンプ
- `src/components/RightPanel/PropertiesView.tsx` - ID・種別・日時・Keywords・同期状態・device_id
- `src/components/RightPanel/RelatedView.tsx` - RelatedIDsを解析してリスト表示
- `src/components/RightPanel/RightChatView.tsx` - コンパクトチャットビュー

**検証**: アクティブアイテムの見出しがアウトラインパネルに表示される。プロパティに同期状態が表示される。

---

### Phase 13: ストレージ抽象化レイヤー

**目標**: PWA版とLocal版でストレージバックエンドを切り替える抽象化レイヤーを実装する。

**新規作成**:
- `src/services/storage/IStorageBackend.ts` - インターフェース定義（`listMeta()`, `getContent()`, `save()`, `delete()`, `getSyncStatus()`）
- `src/services/storage/PwaStorageBackend.ts` - IndexedDB + REST API経由BQ（後のフェーズで実装）
- `src/services/storage/LocalStorageBackend.ts` - C# local API (`http://localhost:8081`) 経由
- `src/services/storage/StorageManager.ts` - `window.__THINKTANK_MODE__` を読み取り、適切なバックエンドを返す

**モード検出ロジック**:
```typescript
const mode = (window as any).__THINKTANK_MODE__ === 'local' ? 'local' : 'pwa';
const backend = mode === 'local'
  ? new LocalStorageBackend((window as any).__THINKTANK_LOCAL_API__)
  : new PwaStorageBackend();
```

**検証**: PWAモード（通常ブラウザ）とLocalモード（モック注入）でそれぞれ異なるバックエンドが選択される。

---

### Phase 14: クラウドバックエンド（Express + BigQuery）

**目標**: REST APIサーバーとBigQueryストレージを構築する。

**新規作成**:
- `server/index.ts` - Express 5 + WebSocket（ポート8080）
- `server/middleware/authMiddleware.ts` - HMAC-SHA256 Cookie認証
- `server/services/BigQueryService.ts` - MERGE文Upsert・concurrent update自動リトライ
- `server/routes/bigqueryRoutes.ts` - CRUD API

**APIエンドポイント**:
| メソッド | パス | 機能 |
|---------|------|------|
| GET | `/api/bq/meta` | **メタデータのみ**一覧（content除く、高速） |
| GET | `/api/bq/files/:id/content` | **本文のみ**オンデマンド取得 |
| GET | `/api/bq/files` | フルレコード一覧（バッチ用） |
| POST | `/api/bq/files` | 保存（Upsert） |
| DELETE | `/api/bq/files/:id` | 削除 |
| GET | `/api/bq/versions` | バージョン情報（差分同期用） |
| POST | `/api/bq/fetch-by-ids` | 複数IDで一括取得 |
| GET | `/api/bq/ttsearch?q=` | 全文検索 |

**重要**: 既存BigQueryデータは削除しない。`device_id`, `sync_version` カラムは ALTER TABLE で追加。

**検証**: `/api/bq/meta` でメタデータのみ取得できる。`/api/bq/files/:id/content` で本文だけ取得できる。

---

### Phase 15: PWAストレージ実装（IndexedDB + WebSocket）

**目標**: PwaStorageBackend の実装を完成させる。IndexedDBキャッシュとWebSocket同期を構築する。

**新規作成**:
- `src/services/storage/IndexedDBService.ts` - DB名`thinktank` v3、`files_meta`（メタデータ）と `files_content`（本文）の2ストアに分離
- `src/services/sync/WebSocketService.ts` - 指数バックオフ自動再接続
- `src/services/sync/SyncManager.ts` - リモート更新→ローカル適用
- `src/services/storage/SyncQueueStore.ts` - 未送信キュー（IndexedDB `sync_queue` ストア）

**PwaStorageBackend の動作**:
- `save()`: `files_meta` に即時保存（dirty=true）→ `sync_queue` に追加 → BQ非同期送信（成功でdirtyクリア）
- `listMeta()`: IndexedDB `files_meta` から返す（BQ比較は差分同期フェーズで実施）
- `getContent()`: IndexedDB `files_content` を確認 → なければ `/api/bq/files/:id/content` でフェッチ → キャッシュ

**検証**: アイテム保存→IndexedDB（メタ・本文別ストア）とBQの両方に書き込まれる。本文は開いた時のみフェッチされる。

---

### Phase 16: メタデータ先行差分同期

**目標**: 起動時に軽量なメタデータのみを同期し、本文はオンデマンドで取得する仕組みを実装する。

**修正**:
- `server/routes/bigqueryRoutes.ts` - `GET /api/bq/versions?category=` を拡張（file_id + updated_at + device_idのみ返す）
- `src/services/storage/StorageManager.ts` - `syncMeta(category?)` を追加

**差分同期アルゴリズム**:
```
1. BQから全アイテムの { file_id, updated_at } のみフェッチ（数KBオーダー）
2. IndexedDB files_meta と比較
3. BQが新しい / BQにのみ存在 → IsMetaOnly=true でfiles_metaに登録（内容は未取得）
4. ローカルが新しい → sync_queueに追加（BQへ送信）
5. ローカルにのみ存在 → BQへ送信
```

**検証**: 起動時に数KBのメタデータのみ同期される。ナビゲーターに全件表示（未取得は薄色）。アイテムを開くと本文がフェッチされ表示される。

---

### Phase 17: TTKnowledge統合コレクション + BQデータ移行

**目標**: MemoとChatを統合するTTKnowledgeを実装する。既存BQデータ（category='Memo'）を新カテゴリ（'memos'）にマッピングする。

**新規作成**:
- `src/models/TTKnowledge.ts` - SyncCategories で複数カテゴリを集約

**修正**:
- `src/models/TTModels.ts` - `Knowledge: TTKnowledge` を追加
- `src/models/TTCollection.ts` - chatsタイトルを正規化、`file_type='md'/'text'` → `'memo'` に正規化

**検証**: ナビゲーターにMemoとChatが混在表示される。

---

### Phase 18: AIチャットAPI（クラウドバックエンド）

**目標**: Claude APIを使ったSSEストリーミングチャットAPIを実装する。

**新規作成**:
- `server/services/ChatService.ts` - @anthropic-ai/sdk、SSEストリーミング
- `server/routes/chatRoutes.ts` - `POST /api/chat/:sessionId/messages`
- `server/routes/fetchRoutes.ts` - `POST /api/fetch-urls`（URL内容取得プロキシ）

**環境変数** (`server/.env`):
- `ANTHROPIC_API_KEY`（override: true で読み込む）
- `ANTHROPIC_MODEL`（デフォルト `claude-sonnet-4-6`）

**検証**: チャットビューからメッセージ送信→SSEでAI応答が逐次返される。

---

### Phase 19: チャット-メモ統合

**目標**: DataGridビューでチェックしたアイテムをコンテキストとしてチャット起動。会話をメモとして保存する。

**修正**:
- `src/views/TTMainPanel.ts` - `StartChatWithContext(checkedIds, editorSelection)` 追加
- `src/components/MainPanel/views/ChatView.tsx` - コンテキストバー表示。「メモに保存」ボタン。BQへの保存も実行
- `src/views/TTApplication.ts` - メモ保存後にナビゲーターを更新

**検証**: 複数アイテムをチェック→💬でチャット起動→「メモに保存」→ナビゲーターに即反映。

---

### Phase 20: WPF + WebView2 コンテナ（Local版シェル）

**目標**: WPFアプリケーションのシェルを構築し、WebView2でThinktankPWAを表示する。

**新規作成**:
- `ThinktankLocal/ThinktankLocal/MainWindow.xaml` - フルスクリーンWebView2を持つシンプルなウィンドウ
- `ThinktankLocal/ThinktankLocal/App.xaml.cs` - 起動時にC# local APIサーバーを別スレッドで起動
- WebView2のNavigationCompletedイベントで `window.__THINKTANK_MODE__` と `window.__THINKTANK_LOCAL_API__` を注入

**仕様**:
- WebView2はビルド済みのReact SPA（`dist/` フォルダ）を `file://` または 内蔵ローカルサーバーで表示
- WPF起動 → C# API起動（port 8081）→ WebView2で React SPA ロード → JS変数注入
- タイトルバー: `Thinktank - {syncStatus}` をリアルタイム更新

**検証**: WPFアプリが起動し、WebView2内でThinktankPWAが表示される。ブラウザDevToolsでJS変数が注入されていることを確認。

---

### Phase 21: C# Local APIサーバー（Local FSとの連携）

**目標**: C# ASP.NET Core minimal APIで、ReactからのAPI呼び出しをLocal FSのMarkdownファイル操作に変換する。

**新規作成**:
- `ThinktankLocal/ThinktankLocalApi/Program.cs` - ポート8081で起動。CORSはlocalhost許可
- `ThinktankLocal/ThinktankLocalApi/Services/LocalFsService.cs`

**Local FS仕様**:
- Markdownファイルの格納先: `%USERPROFILE%\Documents\Thinktank\` （設定可能）
- ファイル名: `{file_id}.md`（例: `2021-11-09-095808.md`）
- メタデータはファイル先頭のFrontmatter（YAML）に格納
  ```yaml
  ---
  title: タイトル
  file_type: memo
  category: memos
  keywords: キーワード
  device_id: pc-home-001
  sync_version: 42
  updated_at: 2026-04-18T09:30:00Z
  ---
  （本文）
  ```
- `FileSystemWatcher` でフォルダを監視。外部ツールによる変更を検出してSync Queueに追加

**APIエンドポイント（C# Local API）**:
| メソッド | パス | 機能 |
|---------|------|------|
| GET | `/api/files/meta` | メタデータ一覧（Frontmatterのみ読み取り、高速） |
| GET | `/api/files/:id/content` | 本文取得（Frontmatter除く） |
| POST | `/api/files` | 保存（ファイル書き込み + Sync Queueに追加） |
| DELETE | `/api/files/:id` | 削除（ファイル削除 + Sync Queueに追加） |
| GET | `/api/sync/status` | 同期状態取得 |

**検証**: `GET /api/files/meta` でLocal FSの全Markdownファイルのメタデータが返される。`POST /api/files` でファイルが作成される。

---

### Phase 22: C# 同期キュー + バックグラウンド同期

**目標**: Local FSの変更を同期キューで管理し、バックグラウンドで自動的にクラウドバックエンドに同期する。

**新規作成**:
- `ThinktankLocal/ThinktankLocalApi/Services/SyncQueueService.cs`
  - 同期キューをSQLiteファイル（`sync_queue.db`）で管理
  - `Enqueue(fileId, operation)` で追加
  - `GetPending()` で未送信リストを取得
  - 成功時に `MarkDone(id)` で削除
- `ThinktankLocal/ThinktankLocalApi/Services/SyncBackgroundService.cs`
  - `IHostedService` として実装（常駐バックグラウンドサービス）
  - ネット接続を `HttpClient` でポーリング監視（30秒ごと）
  - 接続確認時にキューを順次消費してクラウドバックエンド（`/api/bq/files`）へ送信
  - 失敗時はリトライキューに戻す（指数バックオフ）
  - 起動時にクラウドメタデータを取得し、クラウドが新しいアイテムをLocal FSに追加

**同期ログ例**:
```
[SyncQueue] 保存: 2026-04-18-093000 → キューに追加 (pending: 3)
[SyncBg] ネット接続確認 → オンライン
[SyncBg] pending 3件を送信中...
[SyncBg] 2026-04-18-093000 → BQ保存成功 (pending: 2)
[SyncBg] 全件送信完了 (pending: 0)
```

**検証**: アイテムを保存→Local FSに書き込み→同期キューに追加→30秒以内にBQに同期される。オフライン時は保存のみ成功し、オンライン復帰後に自動送信される。

---

### Phase 23: 競合解決とデバイスID管理

**目標**: 同一アイテムが複数デバイスで同時更新された場合の競合を検出・解決する。

**新規作成**:
- `ThinktankLocal/ThinktankLocalApi/Services/ConflictResolver.cs`
- `src/services/storage/ConflictDetector.ts`（PWA側）

**アルゴリズム**:
```
1. デバイスID生成: 初回起動時に UUID を生成し、ファイル/localStorage に永続化
2. 保存時: { file_id, device_id, sync_version, updated_at } を記録
3. 同期時: BQの sync_version とローカルの sync_version を比較
   - ローカルの sync_version == BQの sync_version → 差分なし（正常更新）
   - ローカルの sync_version < BQの sync_version AND BQのupdated_at > ローカルのupdated_at → BQ優先（上書き）
   - 両方とも updated_at が「最後の同期時刻」以降 → 競合
4. 競合時: ローカルファイルを `{id}_conflict_{device_id}_{timestamp}.md` として保存 + UI通知
```

**修正**:
- `src/components/UI/SyncIndicator.tsx` - 競合ファイルが存在する場合は `⚠ 競合あり` を表示

**検証**: 同じアイテムを2デバイスで編集→同期→競合ファイルが生成され、UIに警告が表示される。

---

### Phase 24: 同期状態UIの完成

**目標**: SyncIndicatorとPropertiesViewの同期状態表示を完成させる。

**修正**:
- `src/components/UI/SyncIndicator.tsx` - `StorageManager.getSyncStatus()` をObserverで購読してリアルタイム更新
- `src/components/RightPanel/PropertiesView.tsx` - アイテムの同期状態詳細（device_id・sync_version・最終同期時刻）を表示
- `src/components/MainPanel/TabBar.tsx` - 未送信件数バッジをタブバー右端に表示

**Local版追加**:
- `ThinktankLocal/ThinktankLocal/MainWindow.xaml.cs` - タイトルバーに同期状態を表示（`Thinktank - ✓ Synced` / `Thinktank - ● 3 pending`）

**検証**: 保存→「● 1 pending」表示→同期完了→「✓ Synced」に戻る。オフライン時は「✗ Offline」表示。

---

### Phase 25: TextEditorタグシステム

**目標**: Monaco Editor内のクリッカブルタグを実装する。

**新規作成**:
- `src/views/helpers/TagParser.ts`
- `src/services/TagLinkProvider.ts`

**タグ一覧**:
| タグ | 動作 |
|------|------|
| `[Memo:yyyy-MM-dd-HHmmss]` | 当該メモをメインパネルで開く |
| `[Chat:yyyy-MM-dd-HHmmss]` | チャットビューで開く |
| URL（`https://...`） | ブラウザ新タブで開く |
| `[yyyy-MM-dd]` | ナビゲーターに日付フィルタを設定 |
| `[search:キーワード]` | 検索パネルを開く |

**検証**: タグが色付き・クリッカブル。クリックで対応アクションが実行される。

---

### Phase 26: TextEditorハイライト・Folding・テーマ

**目標**: Monacoカスタムトークナイザによる見出し色分け、Folding、ビジュアルテーマを実装する。

**新規作成**:
- `src/services/ColorTheme.ts` - CSS変数テーマ定義

**修正**:
- `src/components/MainPanel/views/TextEditorView.tsx` - `tt-markdown` カスタム言語・FoldingRangeProvider登録

**検証**: Markdown見出しがH1-H6で色分け表示。セクションFold/Unfold動作。

---

### Phase 27: ハイライト適用範囲の拡大

**目標**: ナビゲーター・Markdownビュー・アウトラインにもキーワードハイライトを適用する。

**新規作成**:
- `src/utils/highlightSpans.tsx`

**修正**:
- `src/views/TTTab.ts` - `HighlightTargets` フラグ追加
- Navigator / MarkdownView / OutlineView にハイライト対応

**検証**: キーワード設定後、各トグルをONにすると対応箇所がハイライトされる。

---

### Phase 28: 全文検索パネル

**目標**: 左パネルの検索ビューでメモ・チャット横断の全文検索を実装する。

**新規作成**:
- `src/components/LeftPanel/SearchView.tsx`
- `server/routes/searchRoutes.ts` + `server/services/SearchService.ts` - BigQuery全文検索
- Local版: `ThinktankLocalApi` に `GET /api/files/search?q=` を追加（ローカルファイルをgrep）

**検証**: 検索パネルでキーワード入力→結果リスト表示。PWA版はBQ検索、Local版はローカルgrep。

---

### Phase 29: 関連コンテンツ

**目標**: 右パネルの関連ビューでアクティブアイテムに関連するアイテムを表示する。

**新規作成**:
- `server/routes/relatedRoutes.ts` + `server/services/RelatedService.ts`

**検証**: アイテムを開くと関連アイテムがリスト表示される。

---

### Phase 30: アクション・状態管理基盤

**目標**: コンテキストベースのアクション管理を構築する。

**新規作成**:
- `src/controllers/DefaultStatus.ts`
- `src/controllers/DefaultActions.ts`
- `src/controllers/actions/` (ApplicationActions, NavigatorActions, EditorActions, TabActions)

**修正**:
- `src/views/TTApplication.ts` - `DispatchAction()`, `GetContext()` 追加

---

### Phase 31: イベントシステム（キーボードショートカット）

**目標**: コンテキストに応じたキーバインドをTSVで管理する。

**新規作成**:
- `src/controllers/DefaultEvents.ts`
- `ui-design/events.tsv`

**主要ショートカット**:
```tsv
*-*-*        Control  N    Tab.New
*-*-*        Control  W    Tab.Close.Active
*-TextEditor-*  Control  S    Editor.Save
*-*-*        Control  P    Application.CommandPalette.Show
```

---

### Phase 32: コンテキストメニューとコマンドパレット

**新規作成**:
- `src/components/UI/ContextMenu.tsx`
- `src/components/UI/CommandPalette.tsx`
- `ui-design/menus.tsv`

---

### Phase 33: タグ一覧・最近のアイテムパネル

**新規作成**:
- `src/components/LeftPanel/TagsView.tsx` - Keywords抽出タグ一覧
- `src/components/LeftPanel/RecentView.tsx` - UpdateDate降順（最近50件）

---

### Phase 34: レスポンシブ/モバイル対応（PWA版）

**修正**:
- メディアクエリで小画面では左右パネルを非表示、ボトムナビを表示
- PWA版のみ対象（Local版はWindows専用）

---

### Phase 35: Google Drive連携

**新規作成**:
- `server/routes/driveRoutes.ts` + `server/services/DriveService.ts`

---

### Phase 36: Gmail連携

**新規作成**:
- `server/routes/gmailRoutes.ts` + `server/services/GmailService.ts`

---

### Phase 37: Google Photos連携

**新規作成**:
- `server/routes/photosRoutes.ts` + `server/services/PhotosService.ts`

---

### Phase 38: 記憶支援機能

- チャットAPIの記憶拡張プロンプト（日付範囲クエリ連携）
- メインパネルの新ViewType: `timeline`（時系列表示）

---

### Phase 39: 思考支援機能

- 要約・多角的視点・関連素材収集プロンプトテンプレート

---

### Phase 40: 判断支援機能

- メリット/デメリット/基準の構造化プロンプト
- メインパネルの新ViewType: `decision`

---

### Phase 41: 状態永続化

**目標**: アプリ状態（開いているタブ・パネル幅・フィルタ等）を永続化し、起動時に復元する。

**修正**:
- `src/views/TTMainPanel.ts` - タブ状態のシリアライズ/復元
- `src/views/TTLeftPanel.ts` / `TTRightPanel.ts` - 幅・開閉状態の永続化（localStorage）
- Local版: WPFの `Properties.Settings` に幅・状態を保存

---

### Phase 42: クラウドデプロイ（Cloud Run）

**目標**: PWA版をCloud Runにデプロイする。

**新規作成**:
- `Dockerfile` - バックエンドサーバーコンテナ（Express + TypeScript、`dist/` をビルドして同梱）
- `cloudbuild.yaml` - Cloud Build設定

**デプロイ構成**:
```
Cloud Run (backend):
  - Express APIサーバー
  - ポート8080
  - BigQuery接続（Workload Identity）

Firebase Hosting or Cloud Run (frontend):
  - Viteでビルドした React SPA
  - `dist/` の静的ファイルを配信
```

**環境変数（Cloud Run）**:
- `GOOGLE_CLOUD_PROJECT`
- `BQ_DATASET`
- `ANTHROPIC_API_KEY`
- `APP_PASSWORD`（認証用）

**検証**: ブラウザでCloud RunのURLにアクセス→アプリが表示される。BigQueryとの連携が動作する。

---

### Phase 43: ポータブルZIP（Local版パッケージ化）

**目標**: 非ITユーザー向けに「解凍してexeをダブルクリックするだけ」で動くパッケージを作成する。

**作業**:
- `dotnet publish` で自己完結型の単一exeとしてビルド（.NET RuntimeをBundled）
- Reactビルド成果物（`dist/`）をexeに埋め込み、または同梱フォルダとして配置
- `setup.bat` を作成（初回のみ: 設定ファイル生成、APIキー入力）
- ZIP圧縮して配布

**配布物**:
```
Thinktank_vX.X.zip
├── Thinktank.exe       ← 自己完結型（.NET Runtime内蔵）
├── dist/               ← React SPA（またはexeに埋め込み）
├── setup.bat           ← 初回設定スクリプト
└── README.txt          ← 起動方法（2行）
```

**検証**: ZIPを解凍→`Thinktank.exe` を起動→アプリが表示される。`setup.bat` でAPIキーを設定できる。

---

## 9. 技術スタック一覧

| レイヤー | 技術 |
|---------|------|
| Frontend | React 18 + TypeScript 5 + Vite 5 |
| エディタ | Monaco Editor (@monaco-editor/react) |
| Markdown | marked + highlight.js |
| 仮想リスト | @tanstack/react-virtual |
| グラフ表示 | react-force-graph |
| アイコン | lucide-react |
| Cloud Backend | Express 5 + Node.js + TypeScript |
| Local Backend | ASP.NET Core 8 minimal API + C# |
| Local UI Shell | WPF + WebView2（Windows専用） |
| DB（クラウド）| Google BigQuery（単一テーブル + category クラスタリング） |
| DB（ローカル）| IndexedDB（PWA）/ SQLite（Local同期キュー）/ Local FS Markdown |
| リアルタイム | WebSocket (ws) |
| AI | Claude API（@anthropic-ai/sdk） |
| デプロイ | Cloud Run + Firebase Hosting |

---

## 10. マイルストーン

| マイルストーン | 完了フェーズ |
|--------------|-------------|
| プロジェクト起動 | Phase 1 |
| Obsidianライクシェル（リボン・左右パネル・タブ・SyncIndicator） | Phase 5 |
| 全ビュー動作（TextEditor/Markdown/DataGrid/Graph/Chat） | Phase 11 |
| ストレージ抽象化（PWA/Localモード切替） | Phase 13 |
| クラウドバックエンド + メタデータ先行同期 | Phase 16 |
| AIチャット動作 | Phase 18 |
| **WPF + WebView2 + C# Local API** | Phase 21 |
| **同期キュー + バックグラウンド同期** | Phase 22 |
| **競合解決 + 同期状態UI完成** | Phase 24 |
| タグ・ハイライト・Folding | Phase 26 |
| 全文検索・関連発見 | Phase 29 |
| ショートカット・コマンドパレット | Phase 32 |
| 外部連携（Drive / Gmail / Photos） | Phase 37 |
| 記憶・思考・判断支援 | Phase 40 |
| **Cloud Runデプロイ** | Phase 42 |
| **ポータブルZIP** | Phase 43 |

---

## 11. 起動方法

### PWA版（開発）
```bash
npm run dev
# フロントエンド: http://localhost:5173
# バックエンド: http://localhost:8080
```

### PWA版（本番）
```bash
# Cloud Runにデプロイ済みのURLにアクセス
https://thinktank.example.com
```

### Local版（開発）
```bash
# ターミナル1: クラウドバックエンド（任意）
npm run server:dev

# ターミナル2: C# Local API
cd ThinktankLocal
dotnet run --project ThinktankLocalApi

# ターミナル3: WPFアプリ（または通常のブラウザでlocalhost:5173でReactを開く）
dotnet run --project ThinktankLocal
```

### Local版（配布）
```
1. Thinktank_vX.X.zip を解凍
2. setup.bat を実行（初回のみ）
3. Thinktank.exe を起動
```

---

## 12. 前提・制約事項

- **Local版はWindows専用**（WebView2がWindowsのみ）。将来的にはMac版（WKWebView）を検討可能
- **ローカルMarkdownの格納先**: デフォルトは `%USERPROFILE%\Documents\Thinktank\`。設定で変更可能
- **既存5,500件のMarkdownファイル**: 初回起動時にFrontmatterが付いていないファイルを自動検出し、Frontmatterを付加してからSync Queueに追加する初期移行スクリプトを `Phase 21` で実装
- **競合解決UIは将来の拡張**: Phase 23では競合ファイルの作成とUI通知のみ。マージUIはスコープ外
- **C# Local APIのAPIキー**: `server/.env` と同じ `ANTHROPIC_API_KEY` を `appsettings.json` で管理
