# Phase 01: プロジェクト基盤・環境構築

## 前提条件
- Node.js 20以上、npm、git がインストール済み
- Google Cloudプロジェクト（以下「GCPプロジェクト」）が作成済み
- GCPプロジェクトID例: `thinktankweb-XXXXXXX`

## このフェーズの目標
Vite + React + TypeScript のフロントエンドと Node.js + Express のバックエンドが同一リポジトリで動作し、ブラウザに「Hello ThinktankWebCC」が表示できる状態を作る。

---

## 段01: プロジェクト初期化

以下の構成でプロジェクトを作成してください。

```
ThinktankWebCC/
  src/                   # フロントエンド(React)
  server/                # バックエンド(Node.js Express)
  public/
  index.html
  package.json           # フロントエンド用
  server/package.json    # バックエンド用
  vite.config.ts
  tsconfig.json
```

手順:
1. `npx create-vite@latest . --template react-ts` でViteプロジェクトを初期化
2. `src/index.css` にGoogle Fonts (Inter) を読み込むスタイルを設定
3. `src/App.tsx` を「Hello ThinktankWebCC」を表示するシンプルなコンポーネントに書き換え
4. `npm run dev` で起動し、ブラウザで動作確認

### 動作確認項目
- `http://localhost:5173` を開いて「Hello ThinktankWebCC」が表示されること

---

## 段02: バックエンドサーバー初期化

`server/` フォルダ内に Node.js + Express + TypeScript のバックエンドを構築してください。

1. `server/package.json` を作成し、以下の依存関係を追加:
   - express, cors, dotenv
   - @types/express, @types/cors, ts-node, typescript（dev）
2. `server/tsconfig.json` を作成
3. `server/src/index.ts` にシンプルなExpressサーバーを作成:
   - ポート: `process.env.PORT || 3001`
   - `GET /api/health` → `{ status: 'ok', timestamp: ... }` を返す
   - CORSを `http://localhost:5173` に許可
4. `server/src/routes/` フォルダを作成し、`healthRoutes.ts` で `/api/health` を定義

### 動作確認項目
- `node server/src/index.ts` (または ts-node) でサーバー起動後、`http://localhost:3001/api/health` にアクセスして `{"status":"ok"}` が返ること

---

## 段03: 起動スクリプト整備

以下のスクリプトを作成してください。

### `start-backend.bat` (Windows用)
```bat
@echo off
cd /d %~dp0
node --loader ts-node/esm server/src/index.ts
```

### `start-frontend.bat` (Windows用)
```bat
@echo off
cd /d %~dp0
npm run dev
```

### `package.json` への追記
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "server": "ts-node server/src/index.ts",
    "dev:all": "concurrently \"npm run server\" \"npm run dev\""
  }
}
```

`npm install --save-dev concurrently` も実行してください。

---

## 段04: 環境変数設定

`.env` ファイル（ルートと `server/` の両方）を設定してください。

**ルート `.env`（フロントエンド用）**
```
VITE_API_BASE_URL=http://localhost:3001
VITE_APP_TITLE=ThinktankWebCC
```

**`server/.env`（バックエンド用）**
```
PORT=3001
GCP_PROJECT_ID=thinktankweb-XXXXXXX
GOOGLE_SERVICE_ACCOUNT_KEY=<サービスアカウントJSONの内容をBase64エンコード>
FRONTEND_URL=http://localhost:5173
```

`.gitignore` に `.env` と `*.json`（サービスアカウント）を追加してください。

---

## 段05: Vite プロキシ設定

`vite.config.ts` に開発時のAPIプロキシを設定してください。

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
```

これにより、フロントエンドから `/api/xxx` へのリクエストがバックエンドへ転送されます。

### 動作確認項目
- フロントエンドから `fetch('/api/health')` を呼び出し、`{ status: 'ok' }` が返ること（ブラウザのDevToolsで確認）

---

## 段06: 基本ディレクトリ構造の整備

以下のフォルダ構造を作成してください（空の `index.ts` で構いません）。

```
src/
  models/           # データモデル
  Views/            # UIコンポーネント（Viewロジック）
  Controllers/      # コントローラー
    Actions/        # アクション定義
    Status/         # ステータス定義
    helpers/        # ヘルパー関数
  services/         # 外部APIサービス
  utils/            # ユーティリティ
  types/            # TypeScript型定義
  components/       # 汎用コンポーネント

server/src/
  routes/           # APIルート
  services/         # バックエンドサービス
  middleware/       # ミドルウェア
  utils/            # ユーティリティ
```

---

## 段07: 基本型定義の作成

`src/types/` に以下の型定義ファイルを作成してください。

### `src/types/index.ts`
```typescript
// パネル名の型
export type PanelName = 'Library' | 'Index' | 'Shelf' | 'Desk' | 'System' | 'Chat' | 'Log';

// パネル表示モードの型
export type PanelMode = 'Editor' | 'Table' | 'WebView';

// コレクション種別
export type CollectionType = 'TTMemos' | 'TTChats' | 'TTEvents' | 'TTEditings' | 'TTStatus' | 'TTActions' | 'TTRequests';

// TTObjectの基本インターフェース
export interface ITTObject {
  ID: string;
  Name: string;
  Description?: string;
}

// TTMemoの基本インターフェース
export interface ITTMemo extends ITTObject {
  Content: string;
  Keywords?: string;
  UpdateDate?: string;
  Category?: string;
}
```

---

## 段08: TTObjectクラス実装

`src/models/TTObject.ts` を作成してください。これはすべてのモデルの基底クラスです。

```typescript
export class TTObject {
  private _id: string = '';
  private _name: string = '';
  public Description: string = '';
  public _parent: TTObject | null = null;

  constructor() {}

  get ID(): string { return this._id; }
  set ID(val: string) { this._id = val; }

  get Name(): string { return this._name; }
  set Name(val: string) { this._name = val; }

  get ClassName(): string { return 'TTObject'; }

  // 通知用コールバック（Viewへの更新通知）
  private _onUpdated: (() => void) | null = null;
  public SetOnUpdated(cb: () => void) { this._onUpdated = cb; }
  public NotifyUpdated() { if (this._onUpdated) this._onUpdated(); }
}
```

---

## 段09: TTCollectionクラス実装

`src/models/TTCollection.ts` を作成してください。TTObjectを継承したコレクション基底クラスです。

```typescript
import { TTObject } from './TTObject';

export class TTCollection extends TTObject {
  protected _children: Map<string, TTObject> = new Map();
  public IsLoaded: boolean = false;
  public Count: number = 0;

  // コレクション設定プロパティ
  public ItemSaveProperties: string = '';
  public ListProperties: string = '';
  public ListPropertiesMin: string = '';
  public ColumnMapping: string = '';
  public ColumnMaxWidth: string = '';

  public AddItem(item: TTObject): void {
    (item as any)._parent = this;
    this._children.set(item.ID, item);
    this.Count = this._children.size;
  }

  public GetItem(id: string): TTObject | undefined {
    return this._children.get(id);
  }

  public GetItems(): TTObject[] {
    return Array.from(this._children.values());
  }

  public RemoveItem(id: string): void {
    this._children.delete(id);
    this.Count = this._children.size;
  }

  // ローカルストレージキャッシュ
  public async LoadCache(): Promise<void> {
    const key = `TT_${this.ID}_cache`;
    const cached = localStorage.getItem(key);
    if (cached) {
      // サブクラスで実装
    }
  }

  public async SaveCache(): Promise<void> {
    // サブクラスで実装
  }
}
```

---

## 段10: App.tsx のレイアウト骨格作成

`src/App.tsx` を3カラムレイアウトの骨格に置き換えてください。

- 左カラム: Library / Index パネル（縦に2分割）
- 中央カラム: Shelf / Desk / System パネル（縦に3分割）
- 右カラム: Chat / Log パネル（縦に2分割）
- 下部: StatusBar

各パネルはとりあえず `<div className="panel" data-panel="xxx">Panel Name</div>` で表示。

`src/index.css` に以下のスタイルを追加:
- CSS変数でカラー定義（ダークテーマ）
- `.app-container` のグリッドレイアウト
- `.panel` の基本スタイル（border、background、padding）

### 動作確認項目
- ブラウザにて7つのパネル領域と StatusBar が表示されること
- ウィンドウサイズを変えても崩れないこと

---

## 段11: CSS変数によるテーマ定義

`src/index.css` に完全なテーマ変数を定義してください。

```css
:root {
  /* カラーパレット（ダークテーマ） */
  --color-bg-primary: #1e1e2e;
  --color-bg-secondary: #2a2a3e;
  --color-bg-panel: #252535;
  --color-bg-panel-title: #1a1a2e;
  --color-text-primary: #cdd6f4;
  --color-text-secondary: #a6adc8;
  --color-text-accent: #89b4fa;
  --color-border: #313244;
  --color-selected: #45475a;
  --color-active: #89b4fa22;

  /* サイズ */
  --panel-title-height: 28px;
  --statusbar-height: 22px;
  --font-size-base: 14px;
  --font-family: 'Inter', 'Noto Sans JP', sans-serif;
}
```

Google Fonts のリンクを `index.html` の `<head>` に追加:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Noto+Sans+JP:wght@300;400;500&display=swap" rel="stylesheet">
```

---

## 段12: パネルタイトルコンポーネント作成

`src/components/PanelTitle.tsx` を作成してください。

### Props設計

```typescript
interface PanelTitleProps {
  panelName: PanelName;
  mode: PanelMode;
  isActive?: boolean;
  isDirty?: boolean;       // 未保存変更がある場合 true（●マーク表示用）
  // Editorモード用
  memoId?: string;         // 表示中メモのID
  memoTitle?: string;      // 表示中メモの1行目タイトル
  // Tableモード用
  resourceName?: string;   // 表示中コレクション名
  itemCount?: number;      // フィルター後の表示件数
  totalCount?: number;     // コレクション全件数
  cursorId?: string;       // 現在のカーソル行のID
  // WebViewモード用
  url?: string;            // 表示中URL またはキーワード
  app: TTApplication;      // イベント連携用（Phase07B以降）
}
```

### モード別表示フォーマット

| モード | 表示形式 |
|---|---|
| Editor | `<●> [パネル名] \| memoID \| タイトル` |
| Table | `<●> [パネル名] \| リソース名(表示件数/全件数) \| カーソル位置ID` |
| WebView | `<●> [パネル名] \| URL` |

- `<●>` は `isDirty=true` のとき `●`（塗り）、`false` のとき `○`（抜き）を表示
- 各セクションは `|` で区切り、`text-overflow: ellipsis` で長い文字列を省略
- `isActive` の場合は背景色を強調表示
- クリック・タッチイベントは `app.UIRequestTriggeredAction` へ渡す（Phase07B参照）

### 実装例（骨格）

```typescript
export function PanelTitle({ panelName, mode, isActive, isDirty,
    memoId, memoTitle, resourceName, itemCount, totalCount, cursorId,
    url, app }: PanelTitleProps) {

  const dirtyMark = isDirty ? '●' : '○';

  const subtitle = (() => {
    if (mode === 'Editor') {
      return `${memoId ?? ''} | ${memoTitle ?? ''}`;
    } else if (mode === 'Table') {
      const count = (totalCount !== undefined)
        ? `(${itemCount ?? 0}/${totalCount})`
        : '';
      return `${resourceName ?? ''}${count} | ${cursorId ?? ''}`;
    } else {
      return url ?? '';
    }
  })();

  return (
    <div className={`panel-title ${isActive ? 'active' : ''}`}>
      <span className="panel-title-dirty">{dirtyMark}</span>
      <span className="panel-title-name">[{panelName}]</span>
      <span className="panel-title-subtitle" title={subtitle}>
        {subtitle}
      </span>
    </div>
  );
}
```

> **注**: `app` プロパティへのイベント連携（クリック・タッチ）は Phase07B（段170）で追加します。
> この段では表示ロジックのみ実装し、`onClick` を暫定で受け付けるだけで構いません。

---

## 段13: StatusBarコンポーネント作成

`src/components/StatusBar.tsx` を作成してください。

```typescript
interface StatusBarProps {
  message?: string;
  activePanel?: string;
  mode?: string;
  action?: string;
}
```

- 横一列のバー（高さ22px）
- 左: アクティブパネル名 + モード
- 中央: メッセージ
- 右: アクション履歴（→ で連結）

---

## 段14: パネルサイズ管理（スプリッター）

`src/components/Splitter.tsx` を作成してください。

- 縦スプリッター（左右カラム間）と横スプリッター（パネル上下間）を実装
- マウスドラッグで各カラム・パネルの幅/高さを変更
- 比率をlocalStorageに保存（キー: `TT_PanelRatio`）
- 初期比率: `左:中央:右 = 1:4:1`、中央縦: `1:3:1`

### 動作確認項目
- 各スプリッターをドラッグしてパネルサイズが変更できること
- リロード後も前回のサイズが復元されること

---

## 段15: Dockerfileの作成

フロントエンドとバックエンドを統合したDockerfileを作成してください。

```dockerfile
FROM node:20-slim
WORKDIR /app

# バックエンド依存関係
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# フロントエンドビルド
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# バックエンドのビルド済みフロントエンド配信設定
# server/src/index.ts に静的ファイル配信を追加

EXPOSE 8080
CMD ["node", "--loader", "ts-node/esm", "server/src/index.ts"]
```

`server/src/index.ts` に静的ファイル配信を追加:
```typescript
import path from 'path';
app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});
```

---

## 段16: `.gitignore` の整備

```gitignore
node_modules/
dist/
dist-server/
.env
*.json (サービスアカウントキー)
*.json.bak
~$*
.DS_Store
```

---

## 段17: README.md の作成

プロジェクトルートに `README.md` を作成してください。

内容:
- プロジェクト概要
- 起動方法（開発時・本番時）
- 必要な環境変数一覧
- デプロイ方法（Cloud Run）

---

## 段18: フロントエンド・バックエンドの疎通確認コンポーネント

`src/components/HealthCheck.tsx` を作成し、`App.tsx` の StatusBar 付近に一時的に配置してください。

- 起動時に `/api/health` を fetch し、ステータスを StatusBar のメッセージエリアに表示
- 成功: 「Server: OK」
- 失敗: 「Server: OFFLINE」

### 動作確認項目（Phase01完了確認）
- バックエンド・フロントエンドともに起動できること
- `/api/health` の結果が StatusBar に表示されること
- 7パネル + StatusBar のレイアウトが表示されること

---

## 段19: Firestore接続の準備（バックエンド）

`server/src/services/firestoreService.ts` を作成してください。

```typescript
import { Firestore } from '@google-cloud/firestore';

let _db: Firestore | null = null;

export function getFirestore(): Firestore {
  if (!_db) {
    _db = new Firestore({
      projectId: process.env.GCP_PROJECT_ID,
      // サービスアカウントキーは環境変数から
    });
  }
  return _db;
}
```

`npm install @google-cloud/firestore` をバックエンド側に追加してください。

---

## 段20: Phase01 動作確認チェックリスト

以下がすべて確認できたらPhase01完了です。

- [ ] `npm run dev` でブラウザが起動し、7パネルレイアウトが表示される
- [ ] `start-backend.bat` でバックエンドが起動し `/api/health` が応答する
- [ ] StatusBar に「Server: OK」が表示される
- [ ] パネルスプリッターをドラッグしてサイズが変わり、リロード後も保持される
- [ ] `.env` が `.gitignore` され、gitに含まれない
- [ ] Dockerfileが存在し、`docker build` がエラーなく完了する

---

**次フェーズ**: [Phase 02: バックエンドAPI・Firestore設計](./phase02_backend.md)
