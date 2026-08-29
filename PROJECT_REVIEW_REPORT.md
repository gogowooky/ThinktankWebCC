# Thinktank プロジェクト大規模レビュー報告

**対象**: ブランチ `TTWeb260526` / `package.json` version `4.0.0`
**実施日**: 2026-08-29
**対象規模**: src 約26,750行（TS/TSX）、server 約1,700行、electron 約540行
**調査方法**: 静的コード読解 + 非破壊的な型チェック実行（`tsc -p tsconfig.json` / `tsc -p server/tsconfig.json` いずれも exit 0）
**前提**: 本レビューではコード・設定を一切変更していない。既存の設計意図（`CLAUDE.md`、各ファイル冒頭コメント、`docs/` 配下）を尊重して評価した。

> 表記ルール
> - 【事実】= コードから直接確認できたこと
> - 【推測】= 強い兆候はあるが実行時確認が必要
> - 【判断】= レビュアーの評価
> - 【提案】= 推奨対応
> 重要度: Critical / High / Medium / Low ／ 確信度: High / Medium / Low ／ 修正規模: Small / Medium / Large

---

## A. エグゼクティブサマリー

### 現在の健全性: ★★★★☆（5段階中4）

小規模〜中規模の個人開発プロジェクトとして、**アーキテクチャの骨格は明確で、責務分離の意図が一貫している**。特にストレージ抽象化・認証のフェイルクローズ設計・設定の単一定義（`PROP_SPECS`）は、この規模のプロジェクトとしては上出来である。2026-08-01 に実施された前回コードレビュー（`docs/260720 Thinktankすること/code_review_260801.md`）の Critical 指摘（無認証公開・任意パス起動・Markdown XSS）は**いずれもほぼ解消済み**で、指摘への対応サイクルが機能している。

一方で、**「動いているように見えて実は欠けている / 静かに壊れる」種類のリスク**が複数残っている。特にデータ損失に直結しうる経路（ウィンドウ終了時の未保存、複数端末の同時編集）と、AI 機能のプロバイダー間非対称（既定構成で中核機能が無効）は、機能追加を続ける前に手当てすべきである。

### 現在の開発規模に耐えられるか: **耐えられる（条件付き）**

現状の 4 パネル + メディア 7 種 + アクション 100 超 + 状態変数 200 超という規模は、現在のアーキテクチャで**破綻していない**。ただしテスト・Lint・CI がゼロであり、リグレッションの検出は完全に人間の目視に依存している。前回レビューの Markdown XSS は「検証されない `biome-ignore` コメント」が原因で長期間放置された。**この構造のまま機能追加を続けると、同種の "誰も検証していない前提" が蓄積する。**

### 次の機能追加を続けてよいか: **Phase 0（後述）を片付けてから続けてよい**

全面刷新は不要。段階的改善で対応可能。

### 最も優れている点

1. **ストレージバックエンド抽象化** — `IStorageBackend` + 3実装（Electron IPC / ローカル C# API / BigQuery）+ `StorageManager` の実行モード自動判定（`src/services/storage/StorageManager.ts:22-37`）。プラットフォーム差分がこの1点に閉じている。
2. **認証のフェイルクローズ設計** — `server/middleware/apiAuth.ts` の `assertApiAuthConfigured()` が公開環境で認証未設定なら**起動を中止**する（`server/index.ts:103-107`）。`deploy.ps1` は `-AccessModel` の明示を必須にし、既定値を設けていない。
3. **設定の単一定義** — `TTUIStateManager` の `PROP_SPECS`（`src/views/TTUIStateManager.ts:200-929`）。新規設定項目は1オブジェクト追加で読み取り・書き込み・シリアライズ・Undo対象化が完結する。

### 最も大きなリスク

1. **ウィンドウ終了時 / 保存失敗時の未保存データ損失**（`beforeunload` ハンドラーが存在しない） — Critical
2. **複数端末の同時編集による無警告の上書き**（BigQuery MERGE が無条件・バージョン照合なし） — High
3. **AI 機能がプロバイダー間で非対称**（既定 `anthropic` にツールがなく、"AIが自動でThinkを登録する" 中核機能が既定構成で丸ごと無効） — High
4. **テスト・Lint・CI がゼロ** — Vibe Coding を安全に続けるための土台が欠けている — High

### 最優先で行うべき3〜5項目

| # | 項目 | 重要度 | 規模 |
|---|---|---|---|
| 1 | `beforeunload` + Electron `before-quit` に未保存フラッシュ／確認を実装 | Critical | Small |
| 2 | 保存の同時実行対策（`updated_at` 楽観ロック or 保存前 `getContent` 差分確認） | High | Medium |
| 3 | AI ツールをプロバイダー非依存化、または非対応プロバイダー選択時に UI で明示 | High | Medium〜Large |
| 4 | 純粋関数群（`thinkFormat` / `tableFormat` / `dateUtils` / フィルタ / キーバインド解決）に vitest 導入 + `tsc --noEmit` を CI 化 | High | Medium |
| 5 | `fetchUrlMeta` の SSRF 対策（プライベート IP 帯ブロック + リダイレクト再検証） | High | Small |

### 全面刷新は必要か: **不要。段階的改善で十分。**

現アーキテクチャ（MVVM 風の VM 層 + Observer 通知 + シングルトン群 + ストレージ抽象化）は、この規模と目的に対して妥当である。刷新すべき箇所は無い。手を入れるべきは「通知の粒度」「状態の所在の一元化」「テストの土台」であり、いずれも既存構造の上で漸進的に改善できる。

---

## B. 現在のシステム構成

### B-1. 技術スタック

| 領域 | 採用技術 |
|---|---|
| デスクトップシェル | Electron 42（`electron/main.cjs` CJS 固定、`contextIsolation:true` / `nodeIntegration:false`） |
| フロントエンド | React 18.3 + TypeScript 5.5（strict）+ Vite 5.4 |
| エディタ | Monaco Editor 0.52（`@monaco-editor/react` 4.6、ローカルバンドル） |
| サーバー | Express 5.2（`server/` → `dist-server/` に `tsc` ビルド） |
| データストア | BigQuery（`thinktank.vault` テーブル、`@google-cloud/bigquery` 8.1）／ローカル C# API（port 8081）／Electron ローカル FS（JSON ファイル） |
| AI | `@anthropic-ai/sdk` 0.82 / `openai` 4.78 / `@google/generative-ai` 0.21（SSE ストリーミング） |
| その他 | `marked` 18 + `dompurify` 3.4 + `highlight.js` 11（Markdown）、`@tanstack/react-virtual`（仮想スクロール）、`react-force-graph`（動的 import）、`xlsx`（動的 import）、`googleapis`（Drive アップロード） |
| 配布 | electron-builder（Windows NSIS、`asar:false`）／Cloud Run（`Dockerfile` + `deploy.ps1`） |
| テスト/Lint | **なし**（テストファイル0、eslint/biome/prettier の設定ファイル0） |

### B-2. ディレクトリと責務

```
src/
  models/       データ層。TTNotifyBase→TTObject→TTCollection→TTVault、TTThink。永続化は StorageManager 経由
  views/        ビューモデル層（MVVM の VM）。TTApplication(ルート singleton)、4パネルVM、
                TTApplicationStatus、TTUIStateManager(設定/Undo)、TTShortcutManager(キーバインド)、
                TTActions(アクションレジストリ)、TTFocusedPanelActions + actions/*(アクション定義)
  services/     apiClient(接続先解決)、ChatApiService(SSE)、aiModels(許可リスト)、
                storage/(IStorageBackend + 3実装 + StorageManager)
  components/   React。Layout/、ThinktankPanel/、OverviewPanel/、WorkoutPanel/(+media/)、ReThinkPanel/
  hooks/        useAppUpdate(通知→再レンダリング)、useAppUpdate
  utils/        thinkFormat/tableFormat/dateUtils/keyboardUtils/markdownSanitize/defaultColor 等の純粋関数群
  contexts/     HighlightContext
server/
  index.ts      エントリ。loadEnv → CORS → 公開ルート → apiAuth → 各ルート → 静的配信
  middleware/apiAuth.ts   /api/* のアクセス制御（IAP JWT / 共有シークレット / フェイルクローズ）
  routes/       bigqueryRoutes / chatRoutes / driveRoutes / systemRoutes
  services/     BigQueryService / ChatService / driveService / VectorStoreService
  config/aiModels.ts   サーバー側のモデル許可リスト（クライアントと二重管理）
electron/
  main.cjs      メインプロセス。IPC(fs)、ローカルサーバー起動(パッケージ版)、CSP、BQ同期
  preload.cjs   contextBridge で electronAPI.storage を公開
docs/           要件・仕様・実装計画・過去レビュー（複数世代のスナップショット）
.thinktank/thinktank.md   AI チャットのシステムプロンプト（ペルソナ「エガ」+ ワークフロー）
```

### B-3. 主要モジュールとデータモデル

**データ階層**: `TTVault > Bundle > Think`（`Bundle` は `ContentType='bundle'` の `TTThink`。本文に ThinkID リストまたはフィルタ条件を持つ）。

**`TTThink`**（`src/models/TTThink.ts`）の主フィールド:

| フィールド | 意味 |
|---|---|
| `ID` | `yyyy-MM-dd-HHmmss` 形式（`TTVault.generateId`） |
| `ContentType` | `memo` / `bundle` / `table` / `links` / `chat` / `nettext`（`src/types/index.ts:23-29`） |
| `Content` / `_savedContent` | 本文（先頭行=タイトル）とその保存済みスナップショット。差分で `IsDirty` を判定 |
| `Metadata` / `_metadataSaved` | 表示・編集状態の JSON。別系統で `IsMetadataDirty` を判定 |
| `IsMetaOnly` | true = メタのみ取得済み、本文は未フェッチ（遅延ロード） |
| `Keywords` / `RelatedIDs` / `UpdatedAt` | 検索キーワード、関連ID、サーバー由来の更新日時 |

**永続化形式（BigQuery `thinktank.vault`）**: `file_id, file_type('md'固定), category, title, content, keywords, related_ids, size_bytes, is_deleted, created_at, updated_at, metadata(JSON)`。論理削除（`is_deleted`）。同一 `file_id` の履歴が複数行残り、`MAX(updated_at)` で最新を取る設計（`server/services/BigQueryService.ts:127-150`）。

### B-4. 主要データフロー

**設計意図の流れ**（`CLAUDE.md` 記載）:
```
ユーザー入力 → キーバインディング解決 → アクション生成 → 状態更新 → 永続化 → UI反映
```

**実際の流れ**（【事実】、コードから再構成）:

1. **キー入力** — `App.tsx:94` が `document.addEventListener('keydown', handler, {capture:true})` で全キーを捕捉 → `TTShortcutManager.handleKeyDown`。
2. **正規化** — `keyboardUtils.keyEventToStr(e)` が `ctrl+alt+shift+meta` + `e.key`（小文字化・別名マップ）を組み立てる。
3. **解決** — `_activeTable`（現在の focus + ExMode でフィルタ済みインデックス）から一致エントリを取得。3フェーズ（フォーカス固有 → ExMode グローバル → 通常グローバル）で `_processEvent`（`TTShortcutManager.ts:357-393`）。
4. **アクション実行** — action 文字列が
   - コロンなし → `TTActions.Execute(action)`（`src/views/TTActions.ts:30`）
   - `Panel.Property:value` → `TTUIStateManager.applyProperty(key, value)`
   - `ExMode:{name}` → `Application.Status.SetExMode`
5. **状態更新** — アクションの `Completion` が VM のプロパティを書き換え → `NotifyUpdated()`。
6. **永続化** —
   - Think 本文: `TTThink.SaveContent` → `StorageManager.save` → backend → BigQuery `MERGE` / ローカル FS / IPC
   - UI 設定: `TTUIStateManager` が `serialize()` して `localStorage['tt-ui-state-v4']` に保存（500ms デバウンス）。DataGrid/Card 経由で `__tt_ui_state__` Think を保存すると `onThinkSaved` → `_applyContent` で UI に反映
7. **UI 反映** — `NotifyUpdated` → `TTNotifyBase._updateListeners` → `useAppUpdate` の `dispatch` → React 再レンダリング。加えて `TTApplication` コンストラクタが `TTUIStateManager` のリスナー（`'ThinktankPanel.*'` 等のワイルドカード）を各パネルの `NotifyUpdated` に接続（`src/views/TTApplication.ts:70-81`）。

**AI チャットの経路**:
```
ChatMedia / AiChatView → ChatApiService.streamChat → apiFetch(POST /api/chat/messages)
 → chatRoutes: 許可リスト検証(isAllowedAiModel) + .thinktank/thinktank.md を system prompt に前置
 → ChatService.streamChatResponse: provider 分岐(anthropic/openai/gemini) → SSE 'delta'/'done'/'error'
 → クライアントで逐次 setMessages → onDone で TTThink(ContentType='chat') に保存
```
ツール（`saveThink` / `saveBundle` / `searchVault` 等7種）は **Gemini 分岐のみ実装**（`server/services/ChatService.ts:314-392`）。Gemini はツール結果を BigQuery へ直接書き込み、SSE の `done` で `createdFileId` を返しクライアントがその Think を開く。

### B-5. ローカル版／Web版の関係

| | PWA（ブラウザ） | ローカル（C# API） | Electron（パッケージ版） |
|---|---|---|---|
| 判定 | 既定 | `window.__THINKTANK_MODE__==='local'` | `window.electronAPI` あり |
| ストレージ | `BigQueryStorageBackend`（`/api/bq/*` 経由） | `LocalStorageBackend`（`http://localhost:8081`） | `ElectronStorageBackend`（IPC → `main.cjs` の fs） |
| サーバー | Cloud Run が同一オリジン配信 | 別プロセスの C# API | `main.cjs` が `dist-server` を子プロセス起動、UI もそこから配信 |
| 認証 | IAP / 共有シークレット / IAM | なし（ローカルのみ） | セッション毎のランダム鍵（`crypto.randomBytes(32)`）を preload 経由で注入 |
| 接続先解決 | 相対パス（vite proxy or 同一オリジン） | `LocalStorageBackend` が絶対 URL | `apiClient.ts` が `electronAPI.apiConfig.baseUrl` を使用 |

共通コードは `src/` ほぼ全体。プラットフォーム分岐は `StorageManager` コンストラクタ・`apiClient.resolveConfig`・`main.cjs` に集約されており、`src/components` 内の分岐は `StorageManager.instance.mode === 'electron'` チェックが数箇所（ファイルアップロード可否など）。

### B-6. テストとビルド

- `npm run build` = `tsc -p tsconfig.json && vite build`
- `npm run build:server` = `tsc -p server/tsconfig.json`
- `npm run electron:dev` = concurrently で server(8080) + vite(5173) + electron
- `npm run deploy` = `deploy.ps1`（Cloud Run、`-AccessModel` 必須）
- **テスト: なし。Lint: なし。CI 設定: なし。** 型チェックは本レビューで手動実行し両方通過を確認。

---

## C. 優秀な点

| 評価対象 | 優れている理由 | 根拠 | 維持のための注意点 |
|---|---|---|---|
| **ストレージバックエンド抽象化** | プラットフォーム差分（BQ / C# API / Electron IPC）が `IStorageBackend` の5メソッドに閉じ、`StorageManager` の実行モード判定1箇所で切り替わる。上位層（`TTVault` / `TTThink`）はモードを知らない | `src/services/storage/IStorageBackend.ts`、`StorageManager.ts:22-37`、`TTThink.ts:99,119` | 新メソッドを足すときは3実装すべてに追加すること（インターフェースが強制する）。`syncFromServer` のように Electron 専用メソッドを `StorageManager` が型キャストで露出している箇所は増やさない |
| **認証のフェイルクローズ** | 「未設定ならスキップ」ではなく「公開環境で未設定なら起動中止」。IAP JWT は署名検証（`x-goog-authenticated-user-email` の署名なしヘッダーは使わない）、共有シークレットは `timingSafeEqual` で定数時間比較 | `server/middleware/apiAuth.ts:92-131`（`assertApiAuthConfigured`）、`:77-86`（`secretMatches`）、`server/index.ts:100-108` | この設計思想を将来の新エンドポイントにも適用する。`/api/system` の公開ルート（`createPublicSystemRoutes`）に副作用のあるものを足さない |
| **デプロイの「うっかり公開」防止** | `deploy.ps1` は `-AccessModel {IAP\|Private\|SharedSecret}` を `Mandatory=$true` にし、既定値なし。`--allow-unauthenticated` は `SharedSecret` 選択時のみ | `deploy.ps1:20-25,148-165` | 新しいアクセス方式を足すときも既定値を設けない |
| **Markdown サニタイズの分離と多層防御** | `marked` はサニタイザではないという事実を明記し、`DOMPurify` + スキーム許可リスト（`^(?:https?\|mailto\|tel):`）+ `afterSanitizeAttributes` フックで `target/rel` を後付け。DOM 依存を単体検証できるよう描画層から分離 | `src/utils/markdownSanitize.ts` 全体、特に `:40-58`（link renderer のエスケープ）、`:101-114` | ここは**最優先でテストを書く対象**（現状テストなし）。`nettext` 以外の経路が innerHTML に到達しないことを維持 |
| **設定の単一定義（`PROP_SPECS`）** | 200超の設定キーの「読み・書き・型・候補正規表現・説明」を1オブジェクトに集約。`_getProps` / `_applyProp` / `serialize` はこの定義を走査するのみ。新規項目追加が1オブジェクトで完結 | `src/views/TTUIStateManager.ts:153-165`（`PropSpec` 型）、`:200-929`、`:1129-1141` | `Record<ConfigKey, PropSpec>` の `ConfigKey` が `\| string` で潰れているため、キー名の typo が型で捕まらない（後述 D-8）。ここだけ補強すれば理想的 |
| **Vault 作成の失敗ロールバック** | Think 新規作成時、`StorageManager.save` が失敗したら**メモリ上の Think を削除**してから再送出。「サーバーに無い幻の Think」を残さない | `src/models/TTVault.ts:438-457`（`_createBundle`）、`:509-514`、`:645-650` | 全 `Create*Think` で同一パターンが踏襲されている。新しい作成系メソッドでも守ること |
| **遅延ロードの失敗安全設計** | `TTThink.LoadContent` は成功時のみ `IsMetaOnly=false` にする。一過性の通信失敗を「ロード済みだが空」として確定させない。`TTVault.LoadCache` も3回リトライ + 最終失敗時 `IsLoaded` を false のまま残す | `src/models/TTThink.ts:107-113`、`TTVault.ts:310-345` | この「失敗を確定させない」判断は良質。コメントで理由が残っている |
| **保存先の thinkId ピン留め** | エディタ保存は `area.ResourceID` ではなく content の出所 `thinkId` に固定。遅延保存がペイン表示切替をまたいでも別ファイルを上書きしない | `src/components/WorkoutPanel/WorkoutArea.tsx:208-232`、`TextEditorMedia.tsx:961-971` | 並行編集シナリオの数少ない配慮箇所。維持 |
| **BSP ペインツリーの純粋関数** | `addToFocused` / `removeLeaf` / `swapLeafs` / `collectAreaIds` が副作用なし・イミュータブル。参照等価で「変化なし」を返す | `src/views/TTWorkoutPanel.ts:88-149` | テストが最も書きやすい部分。今すぐ vitest を入れる価値が高い |
| **キーバインド解決のインデックス化** | `_keyIndex`（全件）と `_activeTable`（focus + ExMode でフィルタ済み）の2段。フォーカス変化・ExMode 変化・ショートカット更新時のみ再構築し、毎キーストロークは Map 参照1回 | `src/views/TTShortcutManager.ts:296-335` | 状態遷移が3種に限定されている前提。新しい「モード」を足すと再構築トリガーが増える |
| **Electron のセキュリティ設定** | `contextIsolation:true` / `nodeIntegration:false` / CSP を dev・本番の**両方**に適用 / ローカルサーバーは 127.0.0.1 バインド + セッション毎ランダム鍵 / `/api/system/open` は `explorer.exe`（`cmd /c start` ではない）+ 実行可能拡張子ブロックリスト + Cloud Run では未登録 | `electron/main.cjs:371-388,392-405`、`server/routes/systemRoutes.ts:12-17,140-146`、`server/index.ts:73-77` | 前回レビュー（C-2）の指摘が丁寧に反映されている |
| **コメントが WHY を語る** | 多くのコメントが「過去にこういうバグがあった / こう直した / だからこうしている」を記録。例: `TTThink.ts:107-113`、`apiClient.ts:8-14`、`TTShortcutManager.ts:186-194` | 各所 | Vibe Coding との相性が非常に良い。AI が変更理由を追える。**この習慣を維持することが最大の資産** |
| **前回レビューへの対応実績** | `code_review_260801.md` の Critical 3件（C-1 無認証公開 / C-2 任意パス起動 / C-3 Markdown XSS）が実質解消済み | `deploy.ps1`、`apiAuth.ts`、`systemRoutes.ts`、`markdownSanitize.ts` の現状 | フィードバックループが回っている証拠。本レビューの指摘も同様に処理できる見込み |

---

## D. 重要な指摘

### D-1. ウィンドウ終了時・保存失敗時に未保存の編集内容が失われる

- **重要度**: Critical / **確信度**: High / **修正規模**: Small / **推奨時期**: 今すぐ（Phase 0）
- **影響範囲**: 全エディタ（TextEditorMedia）、DataGridMedia、CardMedia、ChatMedia。PWA / ローカル / Electron 全モード
- **対象箇所**:
  - `src/components/WorkoutPanel/media/TextEditorMedia.tsx:956-972` — 自動保存は**3秒デバウンス**
  - `src/App.tsx:19-120` — `useEffect` 内のイベント登録に `beforeunload` が**存在しない**（`grep beforeunload src` → 0件）
  - `electron/main.cjs:512-517` — `before-quit` / `will-quit` / `window-all-closed` は `stopLocalServer()` を呼ぶのみ。レンダラーへの未保存確認の IPC 往復なし
  - `src/App.tsx:51-55` — 保存失敗は `unhandledrejection` → `app.Status.SetSyncState('error')` のみ
- **確認できた事実**:
  1. エディタ入力後、最後のキーストロークから3秒間はメモリ上にしか変更が無い。この間にウィンドウを閉じる / Electron を終了すると、確認ダイアログも保存も走らず失われる。
  2. 自動保存（`onSave`）が失敗した場合（オフライン、BQ エラー、`concurrent update` リトライ枯渇等）、`TextEditorMedia` はエディタ内容を保持し続け Ribbon に ● を出すが、**再試行のスケジュールは無い**。次の入力があるまで保存は再開されない。この状態でウィンドウを閉じると、失敗以降の全編集が無警告で失われる。
  3. `TTApplication.RefreshAll()`（表示更新ボタン）だけは `window.confirm` で未保存を警告する（`TTApplication.ts:178-184`）。つまり「ボタン経由の破棄」は守られているが「ウィンドウ終了」は守られていない。
- **問題になる理由**: 「メモ蓄積型エディタ」でユーザーデータの無警告消失は、機能バグの中で最も信頼を損なう。特に (2) は損失量が3秒に収まらず、オフライン作業中の全文を失いうる。
- **発生シナリオ**:
  - ユーザーが段落を書き終え、読み返しながら考えている（キー入力が止まって3秒以上）→ ここは保存済み。だが直後に1文字消して Cmd+W → 直近の削除が失われる（軽微）。
  - **深刻**: 出先でネット不通のまま Electron 版で長文を編集 → 自動保存が毎回失敗（ステータスバーに小さな ● と error アイコンのみ）→ 数十分後にアプリを閉じる → 全部消える。
- **推奨対応**:
  1. `window.addEventListener('beforeunload', ...)`: いずれかの `area.IsDirty` または `TTThink.IsDirty` が true なら `e.preventDefault()` で確認を出す。
  2. 可能なら `beforeunload` 内で同期的に `navigator.sendBeacon` か、`TextEditorMedia` の即時フラッシュ（デバウンスを待たず `onSave`）を試みる。
  3. Electron: `win.on('close', ...)` でレンダラーに `dirty?` を問い合わせ、dirty なら OS ダイアログ。
  4. 保存失敗時の**指数バックオフ再試行**（例: 5s / 15s / 60s）とオンライン復帰イベント（`window.addEventListener('online')`）でのフラッシュ。
- **対応しない場合のリスク**: ユーザーデータ損失。アプリの中心価値の毀損。

---

### D-2. 複数端末・複数ビルドの同時編集で無警告の上書きが起きる

- **重要度**: High（同一ユーザーが2端末を併用するなら Critical）/ **確信度**: High / **修正規模**: Medium / **推奨時期**: 次の機能追加前
- **影響範囲**: BigQuery バックエンド利用時（PWA、Electron の BQ 同期）。ローカル C# API / Electron FS 単独利用時は影響小
- **対象箇所**:
  - `src/models/TTThink.ts:116-143`（`SaveContent`）— 保存ペイロードに**ベースバージョン（`updatedAt` 等）を含めない**
  - `server/services/BigQueryService.ts:219-286`（`save`）— `MERGE ... WHEN MATCHED THEN UPDATE SET` を**無条件**で実行。`updated_at` の照合なし
  - `electron/main.cjs:177-184` — Electron の `syncFromServer` は `local.updatedAt >= meta.updatedAt` で**取得側だけ**スキップ判定。書き込み側（`storage:save`）には照合なし
- **確認できた事実**: Think の保存は last-write-wins。端末 A と端末 B が同じ Think を開き、A が保存 → B が（古い内容のまま）保存すると、A の変更は BigQuery 上で消える。B 側には何の通知も無い。`updated_at` の履歴行は残るが、UI からは復元導線が無い（`Application.Resource.RollbackFocusedThink` は `[未実装]` — `TTFocusedPanelActions.ts:699-710`）。
- **問題になる理由**: `CLAUDE.md` は「ローカルアプリとWebアプリの同時開発」を掲げており、同一ユーザーが PWA と Electron を併用するのは想定シナリオ。BQ time travel でデータは残るが、ユーザーには「消えた」ように見える。
- **発生シナリオ**: 会社の PC（Electron）で書きかけ、帰宅後スマホ（PWA）で開いて追記して保存 → 翌朝会社 PC で開くと前夜の追記が無い（会社 PC のメモリに古い内容が残っており、何か1文字直して保存した瞬間に上書き）。
- **推奨対応**:
  1. `SavePayload` に `baseUpdatedAt`（読み込み時の値）を追加。`BigQueryService.save` の `MERGE` に `AND target.updated_at = @base_updated_at` を付け、0行更新なら 409 を返す。
  2. クライアントは 409 で「サーバー側が新しい」ダイアログ（差分表示 or 「サーバー優先／自分優先」）。
  3. 最小対応: `SaveContent` の直前に `getContent` して `_savedContent` と比較、乖離があれば確認。
- **対応しない場合のリスク**: 静かなデータ損失。再現しにくく、原因究明が困難。

---

### D-3. AI 機能がプロバイダー間で非対称 — 既定構成で中核機能が無効

- **重要度**: High / **確信度**: High / **修正規模**: Large（正攻法）/ Small（UI で明示するだけ）/ **推奨時期**: 次の機能追加前
- **影響範囲**: AI チャット全般（Thinktank/Overview/ReThink/Workout/Pane 内 Chat）
- **対象箇所**:
  - `server/services/ChatService.ts:271-312` — anthropic / openai 分岐は**素のテキストストリームのみ**。ツール定義を渡していない
  - `server/services/ChatService.ts:314-392` — 7つのツール（`saveThink` / `saveBundle` / `saveTable` / `updateBundle` / `searchVault` / `getThink` / `fetchUrlContent`）は **Gemini 分岐のみ**
  - `server/config/aiModels.ts:17-26` — 既定は `AI_PROVIDER=anthropic`（`server/.env.example:2`）。許可リストには anthropic 4モデル / openai 1 / gemini 3
  - `.thinktank/thinktank.md` — システムプロンプトは「`saveThink` と `saveBundle` を並列実行して登録せよ」とツール前提でワークフローを記述
- **確認できた事実**: 既定の `anthropic` を選んだユーザーが AI に「Bundle を作って」と頼んでも、AI はツールを持たないためテキストで「作りました」と答えるだけで、BigQuery には何も登録されない。UI 上はプロバイダーによる差が示されない。
- **問題になる理由**: `CLAUDE.md` 冒頭「アイデアをVaultに蓄積し、AIとの対話で思考を補完する」、`.thinktank/thinktank.md` のワークフロー全体が「AI が自動で Think/Bundle/Links を登録する」前提。この中核機能が**既定構成では丸ごと動かない**。
- **発生シナリオ**: 新規ユーザーが `.env.example` の通り `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` を設定 → AI チャットで主題を相談 → AI「Bundle『妻の誕生日』を登録しました」→ Thinktank パネルを見ても何も無い。
- **推奨対応**:
  1. **正攻法**: ツール定義をプロバイダー非依存の中間表現（名前・説明・JSON Schema・実行関数）に切り出し、Anthropic `tools` / OpenAI `tools` / Gemini `functionDeclarations` へのアダプタを実装。実行部（`executeGeminiTool` の中身）は既に BigQuery 非依存に近いので流用可能。
  2. **暫定**: ツール非対応プロバイダー選択時、モデルセレクタや送信欄に「このモデルでは自動登録は行われません」と表示。`.thinktank/thinktank.md` の前置も分岐。
  3. `streamChatResponse` の第4・第5引数（`provider` / `model`）は `chatRoutes.ts:75` から渡っている（前回レビュー M-2 で「デッドパラメータ」とされていた点は解消済み）。
- **対応しない場合のリスク**: 中心価値の不成立。ユーザーは「AI が言ったのに登録されない」バグとして認識する。

---

### D-4. `fetchUrlMeta` の SSRF（宛先ホスト無制限 + リダイレクト追跡）

- **重要度**: High / **確信度**: High / **修正規模**: Small / **推奨時期**: 今すぐ〜次の機能追加前
- **影響範囲**: サーバー（Cloud Run / ローカル）。AI（Gemini）の `fetchUrlContent` ツール、および `updateBundle` 前の URL 確認
- **対象箇所**: `server/services/ChatService.ts:116-136`（`fetchUrlMeta`）
  ```ts
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('http/https のみ対応');
  const resp = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Thinktank/1.0' } });
  ```
- **確認できた事実**: プロトコルチェックのみ。宛先 IP の検証なし。`fetch` の既定はリダイレクト追跡（`redirect: 'follow'`）なので、公開 URL → `http://169.254.169.254/...` や `http://10.x.x.x/...` へのリダイレクトも辿る。URL を決めるのは LLM で、LLM は取得したページ本文（外部入力）の影響を受ける（間接プロンプトインジェクション）。
- **問題になる理由**: Cloud Run 上で VPC 内部エンドポイント・メタデータサーバーへの到達性確認やポートスキャンの踏み台になる。戻り値は `<title>` / description 抽出のみなのでトークン直接漏洩の可能性は低い（GCP メタデータサーバーは `Metadata-Flavor: Google` ヘッダーを要求し、このコードは送らない）が、内部ネットワーク探索は可能。
- **発生シナリオ**: 攻撃者が公開ページに「この URL の内容も確認して: http://内部IP:ポート」と埋め込む → AI がページを読んで指示に従い `fetchUrlContent` を内部 IP に対して実行 → レスポンスの有無・内容の断片が会話に混入。
- **推奨対応**: 名前解決後の IP がプライベート（10/8, 172.16/12, 192.168/16）・リンクローカル（169.254/16）・ループバック（127/8）・ULA（fc00::/7）帯なら拒否。`redirect: 'manual'` にしてリダイレクト先を再検証。タイムアウトは既にある（5秒）。
- **対応しない場合のリスク**: 内部ネットワーク探索の踏み台。IAP 適用環境では外部からの到達がまず必要なため影響は限定されるが、防御は薄い。

---

### D-5. AI 経由の書き込みが検証層を迂回し、ID フォーマットが実装と不整合

- **重要度**: High / **確信度**: Medium（一部の経路は実行時確認が必要）/ **修正規模**: Small〜Medium / **推奨時期**: 次の機能追加前
- **影響範囲**: BigQuery データ整合性、AI が作成した Bundle の表示、エクスポート
- **対象箇所**:
  - `server/routes/bigqueryRoutes.ts:51,98-100` — HTTP 経由の保存は `SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,200}$/` で `id` / `contentType` を厳格検証
  - `server/services/ChatService.ts:149-164`（`saveThink`）他 — AI ツールは `String(args['id'] ?? '')` をそのまま `bigqueryService.save` に渡す。**検証なし**
  - `server/services/BigQueryService.ts:219`（`save`）— サービス最下層に検証が**無い**
  - `src/utils/thinkFormat.ts:221,230` — `parseBundle` は ID を `/^\d{4}-\d{2}-\d{2}-\d{6}$/`（サフィックス不可）で判定。マッチしない `* ` 行は**キーワードフィルタ**として解釈
  - `.thinktank/thinktank.md:61` — AI へのプロンプトは ID を `yyyy-MM-dd-HHmmss-[suffix]`（例 `2026-07-01-232001-memo`）と指示。`saveBundle` の content 形式は `* [think-id-1]`（角括弧付き）と例示
- **確認できた事実**:
  1. 検証の口が HTTP ルートと AI ツールの2つあり、後者は無検証。`category` も `ContentType` の6値に制約されず任意文字列が入りうる。
  2. AI がプロンプト通りに `-memo` / `-bundle` サフィックス付き ID を生成すると、`parseBundle` の ID 正規表現（`-HHmmss$`）にマッチしない。→ AI が作った Bundle に AI が作った Think を紐付けても、`GetThinksForBundle` で ID として認識されず、`* 2026-07-01-232001-memo` が**キーワード検索語**として扱われる。
  3. `saveBundle` の content が角括弧付き（`* [id]`）だと、`parseBundle` が `s.slice(2)` で `[id]` を取り出し、やはり ID 正規表現にマッチしない。
  4. エクスポート時、`SAFE_ID_RE` を通らない ID は**無言でスキップ**される（`bigqueryRoutes.ts:180-184`）。ユーザーにはデータ欠落として現れる。
- **問題になる理由**: 「AI がデータを登録する」機能そのものが、ID 規約の不整合で成果物を正しくリンクできない可能性が高い。かつ検証の欠落で不正データが混入し、エクスポートで静かに欠ける。
- **発生シナリオ**: （D-3 で Gemini を選んだ前提）AI が主題から Bundle と3つの Think を並列登録 → Overview で Bundle を開くと Think が1つも表示されない（ID がキーワード扱い）。
- **推奨対応**:
  1. 検証を `BigQueryService.save()` に集約（`SAFE_ID_RE` + `category` の enum チェック）。書き込み口が2つある以上、最下層で守る。
  2. AI ツールの実行部で ID を正規化 or 検証。`parseBundle` の ID 正規表現とプロンプトの ID 形式を**一致させる**（どちらかに寄せる）。`.thinktank/thinktank.md` の `* [id]` 例示を `* id` に修正。
  3. `parseBundle` を、サフィックス付き ID（`-\w+$`）も受け付けるよう緩和するか、逆に `generateUniqueId` のフォールバックサフィックス（`-xxxx`、`TTVault.ts:705`）も含めて全 ID を厳密1形式に統一。
- **対応しない場合のリスク**: AI 登録機能の成果物が壊れる。エクスポートでのデータ欠落。

---

### D-6. テスト・Lint・CI が皆無 — Vibe Coding の安全網が無い

- **重要度**: High / **確信度**: High / **修正規模**: Medium / **推奨時期**: 次の機能追加前
- **影響範囲**: プロジェクト全体の変更安全性
- **対象箇所**: `git ls-files | grep -iE 'test|spec'` → 0件。`.eslintrc*` / `eslint.config*` / `biome.json` / `.prettierrc` → 0件。`package.json` の `devDependencies` に vitest/jest/eslint なし。にもかかわらずコード中に `eslint-disable-next-line` が複数（例 `WorkoutArea.tsx:298`、`ChatMedia.tsx:34`）
- **確認できた事実**:
  1. 変更のリグレッション検出が完全に人間の目視依存。
  2. 前回レビューの C-3（Markdown XSS）は「`marked` でサニタイズ済み」という**誤った `biome-ignore` コメント**が原因で長期放置された（`code_review_260801.md:57-74`）。抑制コメントを検証する仕組みが無かった。
  3. `tsc --noEmit` は本レビューで両プロジェクト通過を確認したが、これも自動実行されていない。
- **問題になる理由**: 純粋関数（`thinkFormat` のパーサ群、`tableFormat`、`dateUtils` の日付範囲計算、`keyboardUtils` の正規化、`markdownSanitize`）はロジック密度が高く、壊れると静かにデータや表示が破損する。ここが無防備。
- **推奨対応**:
  1. `vitest` を導入し、まず以下に単体テスト:
     - `thinkFormat`: `parseBundle` / `parseChat` / `parseLinks` / `splitContent` の往復（serialize→parse）
     - `dateUtils`: `computeDateRange` / `formatDateRangeJapanese`
     - `keyboardUtils`: `normalizeKeyStr` / `parseMultiKey` / `keyEventToStr`
     - `markdownSanitize`: `<script>` / `onerror` / `javascript:` / `data:` / `title="` ブレイクアウトが除去されること
     - `TTShortcutManager` の `matchesFocus` / `_mergeExModeKey`
     - `TTUIStateManager` の `_applyProp`（candidates 正規表現検証、toggle/next/prev）
  2. `eslint` + `typescript-eslint` を最小構成で導入（`no-floating-promises` だけでも保存漏れの検出に効く）。
  3. GitHub Actions（or ローカル pre-push フック）で `tsc --noEmit`（両方）+ `vitest run` + `eslint` を実行。
- **対応しない場合のリスク**: 同種の「検証されない前提」の蓄積。機能追加のたびにリグレッションリスクが単調増加。

---

### D-7. 通知の粒度がパネル単位 — Think 1件の保存で広域再レンダリング

- **重要度**: Medium（体感悪化・将来の並行レンダリング障害）/ **確信度**: High / **修正規模**: Medium〜Large / **推奨時期**: 近いうち
- **影響範囲**: 全パネルの描画パフォーマンス
- **対象箇所**:
  - `src/hooks/useAppUpdate.ts:10-19` — `NotifyUpdated()` で無条件 `dispatch`。購読キーが `Math.random()`
  - `src/models/TTNotifyBase.ts:15-22` — `NotifyUpdated` が親へ伝播（`propagateParent`）
  - `src/models/TTThink.ts:134-136` — 保存成功のたび `this._parent.NotifyUpdated(false)`（Vault へ）
  - `src/views/TTApplication.ts:70-81` — `TTUIStateManager` の `'ThinktankPanel.*'` 等ワイルドカードリスナーが各パネルの `NotifyUpdated` を呼ぶ
  - `src/components/ThinktankPanel/ThoughtsList.tsx`（`@tanstack/react-virtual` で仮想スクロール）
- **確認できた事実**: Think を1件保存 → `_parent.NotifyUpdated(false)` → Vault の全購読者（`ThinktankArea` / `OverviewArea` / `WorkoutArea` 群）が再レンダリング。加えて `applyProperty` が `app.NotifyUpdated(false)` を呼び、`TTApplication` の購読者も更新。仮想スクロールの努力が上位の全再描画で一部相殺される。
- **問題になる理由**: Think 数が増える（数千件）と、保存・カーソル移動・設定変更のたびに一覧全体の再計算が走る。購読キーが乱数のため、どのコンポーネントの購読かデバッグで追えない。
- **発生シナリオ**: 2,000件の Vault で、エディタ入力中の3秒ごとの自動保存が走るたびに Thinktank / Overview の一覧が再レンダリング。入力レイテンシとして体感される可能性。
- **推奨対応**:
  1. 短期: 購読キーを `useId()` に置換（デバッグ性）。`NotifyUpdated` に「変更カテゴリ」を渡し、`useAppUpdate` 側でフィルタ。
  2. 中期: `useSyncExternalStore` + セレクタへ移行し、必要な断面だけ購読。
  3. `TTThink.SaveContent` の `_parent.NotifyUpdated` は「一覧の1行のタイトル/更新日時」だけが変わるので、行単位の通知に細分化。
- **対応しない場合のリスク**: 規模拡大で体感悪化。React 18 の並行機能（`useTransition` 等）を入れると、React 外で `Metadata` を直接変更している箇所（`WorkoutArea.tsx:120-123`、`ChatMedia.tsx:179-181`、`MarkdownMedia` のスクロール保存）と競合しうる。

---

### D-8. `ConfigKey` / `ActionID` の型が `| string` で潰れ、キー名の typo が型で捕まらない

- **重要度**: Medium / **確信度**: High / **修正規模**: Small / **推奨時期**: 近いうち
- **影響範囲**: `TTUIStateManager`、`TTShortcutManager`、全アクション定義
- **対象箇所**:
  - `src/views/TTUIStateManager.ts:44-122` — `ConfigKey` は約90個の文字列リテラル union だが末尾 `| string` で**string に潰れる**
  - `src/views/TTUIStateManager.ts:200` — `const PROP_SPECS: Record<ConfigKey, PropSpec>` なので、キーの網羅性チェックも typo 検出も効かない
  - `src/views/TTAction.ts:12` — `export type ActionID = string;`（意図的。コメントで理由を説明）
- **確認できた事実**: `applyProperty('TextEditor.Minimap.IsVisble', ...)`（typo）を書いても型エラーにならず、実行時に `PROP_SPECS[key]` が `undefined` で**無言で無視**される（`_applyProp:1150-1151` の `if (!spec) return`）。ショートカットテーブルの action 列の typo も同様に `[未定義]` になるだけ。
- **問題になる理由**: 状態変数・アクションは「文字列で疎結合」なのが設計の柱だが、その代償として補完もチェックも無い。AI が新しいキーを追加するとき、既存キーの typo を発見できず、別名で重複定義しやすい。
- **推奨対応**:
  - `ConfigKey` から `| string` を外し、動的キーが必要な箇所だけ `ConfigKey | (string & {})` にする（補完を保ちつつ任意文字列も許容）。
  - `PROP_SPECS` を `satisfies Record<string, PropSpec>` にしつつ、キー集合を `keyof typeof PROP_SPECS` として再エクスポートし、`applyProperty` の引数型に使う。
  - `docs/Thinktank_Status-Action-Binding.md`（1,681行、状態変数の定義元ドキュメント）と `PROP_SPECS` の整合を検証するテストを追加。
- **対応しない場合のリスク**: 静かな no-op。重複定義。ドキュメントと実装の乖離が進行。

---

### D-9. 保存状態モデルが不完全 — `SyncState='error'` から回復せず、成功のフィードバックも無い

- **重要度**: Medium / **確信度**: High / **修正規模**: Small〜Medium / **推奨時期**: 近いうち
- **影響範囲**: ステータスバーの同期インジケータ、ユーザーの保存状況把握
- **対象箇所**:
  - `src/views/TTApplicationStatus.ts:21,35-39`（`_syncState`、`SetSyncState`）
  - `src/App.tsx:51-55` — `unhandledrejection` で `SetSyncState('error')`
  - `src/components/ThinktankPanel/ThinktankPanel.tsx:60-72` — `SetSyncState('syncing'/'synced'/'error')` は **Electron の手動同期ボタン経路のみ**
  - `src/components/Layout/ApplicationStatusBarArea.tsx:378-386` — アイコン表示
- **確認できた事実**:
  1. `SetSyncState('synced')` を呼ぶ経路は Electron の `syncFromServer` 成功時だけ。PWA / ローカルモードの通常保存では 'syncing' も 'synced' も**一度も設定されない**（常に既定の 'synced' 表示）。
  2. `unhandledrejection`（保存失敗を含む）が一度でも起きると 'error' 固定。手動同期ボタン（Electron のみ）以外に 'error' を解除する経路が無い。
  3. `TTThink` に「保存中 / 保存失敗」の per-Think 状態が無い。失敗は Ribbon の ● が消えないことでしか分からない。
- **問題になる理由**: `CLAUDE.md` のレビュー観点「保存前、保存中、保存済み、失敗などの遷移が明確か」に対し、遷移が実質「synced（既定）」と「error（片道）」の2状態しかない。ユーザーは自分の変更が保存されたか確信を持てない。
- **推奨対応**:
  - `TTThink` に `SaveState: 'clean' | 'dirty' | 'saving' | 'saved' | 'failed'` を持たせ、`SaveContent` の前後で遷移。
  - `SyncState` を派生値に（「どれか failed があれば error、どれか saving なら syncing、それ以外 synced」）。片道遷移をやめる。
  - Ribbon の ● を「保存中スピナー / 保存失敗（クリックで再試行）」に拡張。
- **対応しない場合のリスク**: ユーザーが保存漏れに気づけない。D-1 と複合すると損失に直結。

---

### D-10. IME 変換中にグローバルショートカットが発火・`preventDefault` しうる

- **重要度**: Medium / **確信度**: Medium（実行時確認が望ましい）/ **修正規模**: Small / **推奨時期**: 近いうち
- **影響範囲**: 日本語入力全般（Monaco エディタ、各入力欄）
- **対象箇所**:
  - `src/App.tsx:94` — `document.addEventListener('keydown', handleKeyDown, {capture:true})`
  - `src/views/TTShortcutManager.ts:252-257`（`handleKeyDown`）— `e.isComposing` / `keyCode===229` のチェックが**無い**（`grep isComposing src` → 0件）
  - `src/views/TTShortcutManager.ts:368-382` — フォーカス固有アクション（`*TextEditor`）と ExMode アクションは `_shouldHandle`（入力欄除外）を**バイパス**して `e.preventDefault()` + `e.stopPropagation()`
- **確認できた事実**: 変換確定前のキーストローク（ブラウザは `keydown` を `keyCode:229` / `e.key:'Process'` 等で発火。Chromium は実キーを返すこともある）に対し、`*TextEditor` フォーカス時の `Ctrl+N`（カーソル下移動）や `Alt+*` の ExMode トリガーが一致すると発火し得る。キャプチャフェーズ + `stopPropagation` なので Monaco / IME に届く前に握る。
- **問題になる理由**: 日本語圏向けアプリで、変換中の候補選択や確定操作が奪われると入力体験が壊れる。`normalizeKeyName('Process')` は `'process'` になりまず一致しないが、Chromium が実キーを返すケースと `Alt`/`Ctrl` 併用時に危うい。
- **推奨対応**: `handleKeyDown` の先頭に `if (e.isComposing || e.keyCode === 229) return;` を追加。念のため `compositionstart` / `compositionend` でフラグ管理。
- **対応しない場合のリスク**: 特定キー配列 / IME で「変換中に勝手にカーソルが動く / モードに入る」不具合。再現条件が環境依存で切り分けが難しい。

---

### D-11. キーバインドが `e.key`（レイアウト依存）— 記号・数字段・Mac で破綻しうる

- **重要度**: Medium / **確信度**: Medium / **修正規模**: Medium / **推奨時期**: 将来（多環境対応が必要になった時点）
- **影響範囲**: 非 US キーボード、Mac、記号を含むショートカット
- **対象箇所**:
  - `src/utils/keyboardUtils.ts:65-77`（`keyEventToStr`）— `e.key` を使用（`e.code` = 物理キーではない）
  - `docs/DefaultShortcut.md:113-116` — `Alt+Shift+!`、`Alt+Shift+""""`、`Alt+Shift+#`、`Alt+Shift+$` 等、Shift + 数字段の**文字**に依存
  - `docs/DefaultShortcut.md` 全体 — `meta`（Mac の Cmd）を使うエントリが無い。すべて `ctrl`
- **確認できた事実**:
  1. `Alt+Shift+!` は US 配列で Shift+1 の出力。JP 配列では Shift+1 = `!` なので偶然一致するが、Shift+2 系（`"` / `@`）等は配列で変わる。`Alt+Shift+""""`（CSV エスケープ後 `alt+shift+"`）は US では Shift+' なので配列依存。
  2. Mac では Cmd = `meta`、Ctrl = `ctrl`。全ショートカットが `ctrl` 固定なので Mac ユーザーは Windows 流（Ctrl）で操作することになる（動作はするが非ネイティブ、`Ctrl+N` 等が OS と競合）。
  3. `parseMultiKey` / `normalizeKeyStr` は `meta` を扱えるので、テーブル側で `meta+` を書けば対応可能。仕組みはある。
- **問題になる理由**: 現状は Windows / Electron / 特定配列前提で「たまたま動いている」。`CLAUDE.md` のレビュー観点「Windows、macOS、Linux、ブラウザ間の差異」「修飾キーやキーボード配列への対応」に対し、`e.code`（物理キー）ベースの正規化が無い。
- **推奨対応**:
  - 記号・数字段のショートカットは `e.code`（`Digit1`, `Slash` 等）ベースに移行するか、少なくとも「物理キー指定」の記法（`code:Digit1` 等）をテーブルでサポート。
  - Mac 対応が視野に入るなら、`ctrl` を「主モディファイア」の抽象にして OS ごとに `ctrl`/`meta` へ解決するレイヤーを1枚入れる。
  - 現状の「キー入力 → アクション文字列」の分離は既に良好（テーブル駆動）。壊れているのは**キー入力の正規化**だけなので、そこを差し替えれば済む。
- **対応しない場合のリスク**: 非 US 配列ユーザー / Mac ユーザーで一部ショートカットが効かない・別のショートカットが暴発する。

---

### D-12. その他（まとめて記載、個別重要度 Medium〜Low）

| ID | 指摘 | 重要度/確信度 | 根拠 | 対応 |
|---|---|---|---|---|
| D-12a | **`Dockerfile` builder ステージが `COPY . .`、`.dockerignore` に `*.env` / `server/.env` が無い** → API キー入りの `server/.env` が builder イメージレイヤーに焼き込まれる（runner には来ないが Cloud Build のキャッシュに残りうる） | Medium / Medium | `Dockerfile:11`、`.dockerignore`（node_modules / .git / dist / dist-server / thinktankweb-*.json / .agent / .claude / electron のみ） | `.dockerignore` に `*.env`、`server/.env`、`.env*` を追加。`docs`、`src`、`public` など runner に不要なものも builder では要るので `COPY` を絞るのは別途 |
| D-12b | **派生値を独立した状態として保持** — `TTThinktankPanel.FilteredThoughts` / `TTOverviewPanel.FilteredThoughts` は React コンポーネントがフィルタ計算結果を VM に書き戻すスナップショット。`Filter.CursorPos` 系 getter がこれを読む（`TTUIStateManager.ts:281-355`） | Medium / Medium | `TTThinktankPanel.ts:67`、`TTUIStateManager.ts:281` | フィルタ結果は VM 側で純粋関数として算出（`applyFilter`）し、コンポーネントは読むだけにする。カーソル位置の真実は ID（`CurrentItemID`）1本に |
| D-12c | **設定の所在が分散** — `localStorage['tt-layout-mode']` を `App.tsx:72`、`TTUIStateManager.ts:549,599,707`、他で直接読む。値のセンチネルが `'simple'` / `'sipoc'` という非対称な文字列（`TTUIStateManager.ts:708`）。zoom / AI モデルも別 localStorage キーで PROP_SPECS 外・Undo 対象外 | Medium / High | 上記各行 | 全設定を `PROP_SPECS` 経由に一本化。`get`/`set` の中で localStorage を触るのは可だが、読み出し口を `getProperty` に統一 |
| D-12d | **`WorkoutPanel.Panes.Layout` / `.Display` を設定ドキュメントに JSON 文字列で混入** — ランタイムのペイン構成（開いている Think）が、ユーザー編集可能な `__tt_ui_state__` テーブルにシリアライズされ、`set` が `TTWorkoutArea` を無検証で再構築（削除済み Think ID を参照しうる） | Medium / Medium | `TTUIStateManager.ts:884-928` | ペイン構成は UI ランタイム状態として別管理（別 localStorage キー or セッション限り）。設定ドキュメントは「設定」だけに |
| D-12e | **`ThinktankFilterPanel` ↔ `OverviewFilterPanel` がほぼ完全コピー**（実測 差分3行）、`SearchBar` 対も差分9行。両 CSS が `.unified-filter-*` をグローバルスコープに二重定義 | Medium / High | `diff` 実測。クラス名が既に `unified-` | `src/components/common/FilterPanel/` に1本化。CSS も1ファイル。ref 型を `FilterPanelRef` に統一。約400行削減 |
| D-12f | **`any` / 型アサーションが98箇所**（`TextEditorMedia.tsx` 27、`textEditorFoldingActions.ts` 9、`textEditorDateActions.ts` 8）。Monaco 内部 API 依存が主因 | Medium / High | `grep -rE ':\s*any\|as any' src` | `monaco.editor.IStandaloneCodeEditor` の拡張 interface を1つ定義。folding/contribution へのアクセスをそこに集約 |
| D-12g | **`_applyContent` の後方互換リネーム regex が約40件、無制限に増加**（`TTUIStateManager.ts:1196-1230`）。スキーマバージョンによる打ち切りが無く、毎ロードで全 replace を実行 | Medium / Medium | `TTUIStateManager.ts:1196` | localStorage キー（`tt-ui-state-v4`）にバージョンを持たせ、旧バージョンからのマイグレーションを1回だけ実行して新形式で書き戻す。以降 regex 列はスキップ |
| D-12h | **`exportStatus` がモジュールスコープの可変グローバル**（`bigqueryRoutes.ts:42-47`）。Cloud Run の複数インスタンスで進捗が取得元インスタンス依存 | Low / High | `bigqueryRoutes.ts:42` | エクスポートはローカル専用機能。Cloud Run では無効化するか、進捗を返さない設計に |
| D-12i | **`console.*` が src 内47箇所**、本番ビルドでもそのまま。Vault 内容やエラー詳細が DevTools に残る（`console.log('[TTVault] LoadCache: ...')` 等） | Low / High | `grep -rE 'console\.' src` | vite の `esbuild.drop: ['console']`（本番のみ）or ロガー抽象化 |
| D-12j | **`CLAUDE.md` が参照する `docs/requirements.md` / `docs/concept.md` が存在しない**（実体は `docs/260606_memos/requirements.md`、`docs/260606_memos/concept.md`。メモリには `docs/concept.txt` とあるがそれも無い） | Low / High | `CLAUDE.md:8` vs `git ls-files` | `CLAUDE.md` の参照先を実在パスに修正。`docs/` に複数世代のスナップショットが混在しているので「現行版はどれか」を明示 |
| D-12k | **`generateUniqueId` が衝突時に時刻を1秒ずつ遡る**（`TTVault.ts:694-706`）。同秒に複数作成すると、新しい Think の ID が数秒前のタイムスタンプになり、ID 順ソート = 作成順が崩れる | Low / Medium | `TTVault.ts:703` | 遡るのではなく進める、または ID に連番サフィックスを付ける。ソートで作成順を前提にしている箇所（`ThoughtsList` の並び等）への影響を確認 |
| D-12l | **サービスアカウント鍵 `thinktankweb-483408-9548b5a08345.json` がリポジトリルートに存在**（`.gitignore` の `thinktankweb-*.json` と `.dockerignore` で除外済み・未追跡は確認済み）。ただし `.gitignore` パターンを1行変えるだけで露出しうる位置 | Low / High | `git status` / `git ls-files` で未追跡を確認済み | 鍵はリポジトリ外（`~/.config/` 等）に移動し、`GOOGLE_SERVICE_ACCOUNT_KEY_FILE` でそこを指す |
| D-12m | **`lowercase claude.md` がリポジトリに追跡されている**（`CLAUDE.md` とは別ファイル。Windows は大文字小文字非区別なので混乱の元） | Low / Medium | `git ls-files \| grep -i claude.md` → `claude.md` | 内容を確認し不要なら削除、必要なら `CLAUDE.md` に統合 |
| D-12n | **Anthropic の `max_tokens: 4096` ハードコード**（`ChatService.ts:281`）。長い応答が途中で切れる。リトライ・タイムアウトも provider 分岐ごとにバラバラ（Gemini のみ5ターンループ） | Low / Medium | `ChatService.ts:281` | provider 非依存のパラメータ（`maxTokens` / `timeout` / `retries`）を1箇所で管理（D-3 の中間表現化と併せて） |

---

## E. 分野別レビュー

### E-1. 状態管理

**良い点**
- VM 層（`views/`）とデータ層（`models/`）の分離が明確。`TTNotifyBase` の Observer が両層共通の通知基盤。
- `PROP_SPECS` による設定の単一定義。UI 状態・色設定・ペイン構成が1つのテーブルにシリアライズされ、DataGrid で直接編集 → Ctrl+S で反映という一貫した操作モデル。
- Undo/Redo（`TTUIStateManager`、50段）が設定変更全体に効く。
- `IsLoaded` フラグで「未ロード時の書き込みによるデータ消失」を防ぐ設計（`TTCollection.ts:19-22`）。

**懸念点**
- **状態の種類が混在**: `WorkoutPanel.Panes.Layout`（ランタイム UI）と `TextEditor.Minimap.IsVisible`（永続設定）と `Application.FocusedArea.Name`（`isConst`、DOM から算出する派生値）が同じ `PROP_SPECS` に同居。`isConst` フラグで区別してはいるが、寿命（セッション限り / 永続 / 派生）が型で表現されていない。
- **同じ意味の状態が複数箇所**: `CheckedThoughtIDs` が Thinktank/Overview/Workout の3 VM にほぼ同一実装（`ToggleCheck` も3つ）。実体は `SharedState` オブジェクト共有だが、setter が他パネルの `NotifyUpdated` を手動で呼ぶ（`TTThinktankPanel.ts:34-43`、`TTWorkoutPanel.ts:166-175`）。5個目の consumer を足すと全 setter 修正。
- **派生値を状態化**: D-12b（`FilteredThoughts`）。
- **状態の所在が分散**: D-12c（`tt-layout-mode` 直読み）。
- **不正な状態の組み合わせ**: `Application.FocusedPanel.Name` が `simple` モードで `Overview`/`ReThink` を取りうる（`getValues` は除外するが、`set` は文字列を検証せず `app.FocusedColumn = v`）。
- **非同期競合**: D-2（同時保存）。`TextEditorMedia` の外部更新反映（`:232-244`）は「ローカル未編集時のみ」ガードで一定守られているが、`onThinkSaved` → `_applyContent` → `_emit` の連鎖が `applyProperty` 実行中に再入する可能性は精査が必要（`_applying` フラグで一応ガード）。
- **命名の一貫性**: `IsAreaOpen` / `ToggleArea` / `OpenArea` は統一されているが、`SetViewMode` を持つパネルと持たないパネル（`TTThinktankPanel` は `ViewMode` 直代入も可）が混在。`ThinktankViewMode` / `OverviewViewMode` / `WorkoutViewMode` / `ReThinkViewMode` が別 union で `PANEL_VIEW_MODES`（`TTFocusedPanelActions.ts:32-38`）と `getValues` に二重定義。

**推奨事項**
1. 状態を「ドメイン（Think の内容・Metadata）／永続設定（PROP_SPECS の非 isConst）／セッション UI（ペイン構成・フォーカス）／派生（FilteredThoughts・CursorPos）」の4カテゴリに分類し、それぞれ置き場所を1つに決める（D-12b, D-12c, D-12d）。
2. `CheckedThoughtIDs` を `TTApplication` 直下の1状態にし、各パネルは getter で参照するだけにする。
3. `ViewMode` union と順序定義を1ファイルに集約。

### E-2. アクション

**良い点**
- `TTAction`（定義）/ `TTActionItem`（実行コンテキスト、`Result` / `Allow` / `Mods`）/ `TTActions`（レジストリ）の分離。
- `Completion(item)` が `void | Promise<void>` を返せ、`TTActions.Execute` が sync/async 両対応でエラーを `item.Result` に格納（例外を投げない）。
- ExMode という「モディファイア押下中だけ有効な一時モード」の抽象が、複雑なショートカット体系を素直に表現。
- 同一ハンドラを複数 ActionID で登録するパターン（`Application.Status.ExMode:X` と `ExMode:X`、`:Toggle` と `:toggle`）で、テーブル側の表記揺れを吸収（`TTFocusedPanelActions.ts:225-233,539-542`）。
- D&D の疑似キー（`ThinkFileDrag` 等）を「ActionID 解決だけ ShortcutManager が担い、preventDefault と実行は Drop ハンドラー」と役割分担（`TTShortcutManager.ts:26-45` のコメントが詳細）。

**懸念点**
- **アクション追加が複数箇所修正を要する場合がある**: `WorkoutPanel.FocusedPane.Mode:Next` は (1) `TTActions.Register`（`TTFocusedPanelActions.ts:466`）(2) `PROP_SPECS['WorkoutPanel.FocusedPane.Mode']` の `getFocusedPaneAllowedModes`（`TTUIStateManager.ts:173-192`）(3) `PANEL_VIEW_MODES`（`TTFocusedPanelActions.ts:32-38`）の3箇所に知識が分散。
- **UI イベントが直接ビジネスロジックを呼ぶ箇所**: React コンポーネントから `think.SaveContent()` を直接呼ぶ箇所が多数（`OverviewArea.tsx:279,443`、`ReThinkArea.tsx:99`、`ThinktankArea.tsx:389` 等）。アクション層を経由しないため、`TTShortcutManager` の `SetLastActionDisplay` にも乗らず、Undo にも入らない。
- **実行可能条件の表現**: `item.Result = '[対象なし]'` のような文字列で失敗を返すのみ。「このアクションは今実行可能か」を事前に問う API が無い（メニューの enabled/disabled 制御が各コンポーネント任せ）。
- **Undo との相性**: エディタ操作は Monaco の Undo、UI 設定は `TTUIStateManager` の Undo、Think の削除・作成は**Undo 不可**。`Application.Resource.RollbackFocusedThink` は `[未実装]`。
- **`[未実装]` アクションが登録済み**: `RollbackFocusedThink` / `RollbackAll`（`TTFocusedPanelActions.ts:699-722`）は UI の受け皿だけ存在。ショートカット / メニューから呼べてしまう。

**推奨事項**
1. コンポーネントからの直接 `SaveContent` を「保存アクション」経由に寄せられないか検討（少なくとも `SetLastActionDisplay` は通す）。
2. `TTAction` に任意の `canExecute?(): boolean` を足し、メニュー/パレットの enabled 制御に使う。
3. `WorkoutPanel.FocusedPane.Mode` の許可リストを1箇所（`ContentType → MediaType[]` マップ）に集約。

### E-3. キーバインディング

**良い点**
- テーブル駆動（`docs/DefaultShortcut.md` を `?raw` import、またはユーザー Think `__tt_shortcuts__`）。「キー入力」と「実行アクション」が既に分離されている。
- `focus`（`*` / `Workout*` / `*TextEditor` のパターンマッチ）× `exmode` の2軸でコンテキスト別バインドを表現。
- `_activeTable` のインデックス化で毎キーストロークのコストが低い（E 冒頭「優秀な点」参照）。
- `parseMultiKey` の `|` 区切り + `\|` エスケープ + CSV 層のエスケープ規約の切り分けをコメントで明示（`keyboardUtils.ts:32-43`）。
- `_heldMods` の window レベル追跡 + `blur` で全解除（`TTShortcutManager.ts:201-213`）— D&D 中のモディファイア判定の不安定さへの対処。
- DEFAULT_SHORTCUTS がコード内にあり、テーブル未定義時のフォールバックが効く（`TTShortcutManager.ts:95-108,477-481`）。

**懸念点**
- **キー正規化がレイアウト依存**: D-11。`e.key` ベースで `e.code` を使わない。
- **IME 未考慮**: D-10。
- **同一キーへの複数割り当ての扱い**: `_processEvent` は candidates を順に試し、`Allow=false` で打ち切る。`DefaultShortcut.md` には実際に重複行がある（`:38-39` は完全重複、`:25-28` は `Alt+P` / `Alt+ArrowUp` が同一アクション）。意図的な多重定義と事故の区別がつかない。競合検出・警告 UI が無い。
- **無効な設定 / 未知のアクションの挙動**: action が未登録なら `[未定義]` を `SetLastActionDisplay` に出すのみ（`TTShortcutManager.ts:430-434`）。ユーザーが `__tt_shortcuts__` を壊しても気づきにくい。
- **デフォルトとユーザー設定のマージ**: `_loadFromContent` は「テーブルに無い key の DEFAULT を補完、key が同一ならテーブル優先」（`TTShortcutManager.ts:477-481`）。key 単位のマージなので、DEFAULT の `ctrl+z`（`focus:'*'`）をユーザーが `focus:'Workout'` で再定義すると DEFAULT が消える（key が同じ）。focus が違えば別物なのに。
- **アクション削除・改名時の互換性**: マイグレーション機構が無い。`__tt_shortcuts__` に古い ActionID が残ると `[未定義]` になるだけ。
- **キーイベントの解除**: `App.tsx` の `useEffect` cleanup で全リスナー解除。`WorkoutArea.tsx:144` の `handleGlobalSave` も cleanup あり。`TTShortcutManager` コンストラクタの `window.addEventListener('keydown', sync, {capture:true})` は**解除されない**（singleton なので実害は薄いが、`resetInstance` 相当が無い）。
- **テスト可能性**: `matchesFocus` / `_mergeExModeKey` / `parseMultiKey` / `normalizeKeyStr` は純粋関数でテスト容易。だが**テストが無い**。

**推奨事項**
1. `e.code`（物理キー）ベースの正規化オプションを追加（D-11）。
2. `handleKeyDown` 冒頭で IME ガード（D-10）。
3. 設定画面に「競合表示」（同一 focus+exmode+key に複数 action）と「未知の action 警告」。
4. マージを `(focus, exmode, key)` の三つ組単位に。
5. 上記純粋関数群に単体テスト（D-6）。

### E-4. エディタ／メモ管理

**良い点**
- `TTThink` の `Content`/`_savedContent`（本文 dirty）と `Metadata`/`_metadataSaved`（表示状態 dirty）の2系統分離。
- `TTThink.normalize`（CRLF/CR → LF）で改行コード差を吸収してから dirty 判定（`TTThink.ts:167-169`）。
- 保存先の thinkId ピン留め（C 表参照）。
- 外部からの `think.Content` 更新を「エディタ未編集時のみ」反映するガード（`TextEditorMedia.tsx:232-244`）。
- `FileHistory`（ペイン毎の Load 履歴、最大30、位置管理）で「戻る/進む」ナビゲーション。
- `setContentSilent` で BOM 除去（`TTThink.ts:78`）。

**懸念点**
- **ウィンドウ終了時の未保存**: D-1（Critical）。
- **同時編集**: D-2（High）。
- **クラッシュ復旧**: 自動保存が3秒デバウンスのみ。ローカルの下書きスナップショット（`localStorage` へのエディタ内容の定期退避）が無い。Electron のクラッシュ = 直近3秒〜（保存失敗中なら全て）消失。
- **`nettext` の巨大ファイル / 文字コード**: `getContent` は文字列を丸ごとメモリに。巨大ファイル（数MB）のガードが無い。文字コードは backend が UTF-8 前提。
- **XSS / HTML 表示**: `MarkdownMedia` は `markdownSanitize` 経由で安全（C 表参照）。`AiChatView` はメッセージを `{msg.content}`（React エスケープ）でプレーン表示（`AiChatView.tsx:180,197`）— 安全。**到達経路は塞がれている。**
- **メモの ID / 日時管理**: ID = 作成時刻。`UpdatedAt` はサーバー由来。`created_at` はサーバーが ID から逆算（`bigqueryRoutes.ts:101-107`）。ID にサフィックスが付くケース（AI 生成、衝突フォールバック）で日付パースが外れると `created_at` が「今」になる。
- **大量メモの性能**: `GetThinks()` は毎回 `GetItems().filter(instanceof)`。`GetThinksForBundle` は `allThinks` を毎回舐めて Map 構築。数千件で N 回呼ばれると効く。仮想スクロールはあるが上位再描画で相殺（D-7）。
- **削除・復元・履歴**: 論理削除（`is_deleted`）。BQ には履歴行が残るが**復元 UI が無い**（`RollbackFocusedThink` 未実装）。
- **データ形式のバージョン管理**: Think 本文にスキーマバージョンが無い。`bundle` / `chat` / `links` のパース形式が変わったら旧データが壊れる。`_applyContent` のような後方互換 regex は UI 設定にはあるが Think 本文には無い。

**推奨事項**（優先度順）
1. D-1（`beforeunload` + 保存失敗リトライ）。
2. エディタ内容の `localStorage` への定期退避（thinkId + 内容 + タイムスタンプ）。起動時に「未保存の下書きがあります」復旧。
3. D-2（楽観ロック）。
4. `RollbackFocusedThink` の実装（BQ time travel）。少なくとも「BQ に履歴が残っている」旨をユーザーに示す。
5. Think 本文にスキーマバージョン行（`bundle` 等）を検討。

### E-5. AI

**良い点**
- AI コードが `server/services/ChatService.ts` と `src/services/ChatApiService.ts` に局所化。エディタ機能とは疎結合。
- モデル許可リスト（`server/config/aiModels.ts` + `src/services/aiModels.ts`）で「クライアントが任意の文字列を送っても拒否」。
- API キーはサーバーのみ（`process.env`）。クライアントには露出しない。`deploy.ps1` は `--update-secrets` で Secret Manager 参照。
- SSE でストリーミング、`AbortController` でキャンセル、`res.writableEnded` チェックで切断後の write を防止（`ChatService.ts:262-265`）。
- システムプロンプトを `.thinktank/thinktank.md`（バージョン管理下）で管理。
- チャット履歴を `ContentType='chat'` の Think として保存し、`parseChat`/`serializeChat` で往復。

**懸念点**
- **プロバイダー間非対称**: D-3（High）。
- **SSRF**: D-4（High）。
- **検証迂回 + ID 不整合**: D-5（High）。
- **モデル許可リストの二重管理**: `server/config/aiModels.ts` と `src/services/aiModels.ts` を手動同期（前者のコメントに明記）。片方だけ更新すると齟齬。
- **AI 出力の本文反映前検証**: Gemini のツールは AI が生成した `content` をそのまま BQ に保存。Markdown 構文チェックも ID 検証も無い（D-5）。
- **ユーザー編集中の上書き**: AI が `updateBundle` で既存 Bundle を更新する際、ユーザーがその Bundle をエディタで開いて編集中でも、サーバー側は無条件上書き（D-2 と同根）。
- **プロンプトインジェクション**: `fetchUrlContent` が外部ページ本文を取得 → AI に渡る。取得結果は `<title>`/description のみなので影響は限定的だが、`fetchUrlMeta` の抽出が緩い正規表現（`ChatService.ts:125-130`）。
- **ログ**: `console.error('[ChatService] [${provider}] stream error:', message)` はエラーメッセージのみ。本文は出していない。ただし `console.log('[TTVault] LoadCache: N items')` 等、他所で件数やエラー詳細が出る（D-12i）。
- **利用量 / 料金 / レート制限**: サーバー側にレート制限が無い。無認証で `/api/chat` が叩ければ課金直撃だが、`apiAuth` のフェイルクローズ + IAP で公開経路は塞がれている。ローカル / IAP 内では無制限。
- **AI 無効化時の通常機能**: AI を使わなくてもエディタ・Vault は完全動作（AI は独立サービス）。○
- **再現性 / テスト**: AI 応答のテストは無い。ツール実行部（`executeGeminiTool`）は BQ をモックすればテスト可能な構造。

**推奨事項**
1. D-3 → D-5 → D-4 の順で対応。
2. モデル許可リストを1ファイルにし、サーバーがそれを import（またはビルド時コピー）。
3. `updateBundle` / `saveThink` の実行前に「対象がエディタで編集中か」をチェックする仕組み（クライアント dirty 状態をサーバーは知らないので、少なくとも `updated_at` 照合で D-2 の対策に乗せる）。

### E-6. ローカル版／Web版

**良い点**
- プラットフォーム抽象化が `IStorageBackend` + `StorageManager` + `apiClient` の3点に集約。
- Web 専用 API（`navigator.serviceWorker`）は `main.tsx:22` で `!window.electronAPI` ガード。
- ローカル専用 API（`electronAPI.storage`）は `window.electronAPI` の有無で分岐。
- `/api/system/open`（任意パス起動）は Cloud Run では**登録しない**（`server/index.ts:73-77`）。
- `apiClient.resolveConfig` が「パッケージ版 Electron のみ絶対 URL + 鍵、それ以外は相対パス」を1関数で判定（コメントで file:// 問題を説明）。

**懸念点**
- **共通機能の修正が片方にしか反映されないリスク**: `splitContent` が `src/utils/thinkFormat.ts` と `electron/main.cjs:30-34` に**別実装**で存在。片方だけ直すと Electron 保存とサーバー保存で title/body の切り出しがズレる。
- **プラットフォーム別テスト**: 無し。3モードの動作差を検証する手段が `TT_SELFTEST=1`（`main.cjs:424-466`）の手動プローブのみ。
- **配布・アップデート**: `useAppUpdate.ts`（フックとは別の `src/hooks/useAppUpdate.ts`）と `src/hooks/useAppUpdate.ts`... 実際は `useAppUpdate.ts` 1つ。アプリ更新チェックは `src/hooks/useAppUpdate.ts` ではなく別。electron-builder の autoUpdater 設定は見当たらず（`publish never`）。手動配布前提。
- **バージョン互換性**: `package.json` version `4.0.0`、`copyright.txt` に別バージョン（`v1.4.36`）。2系統のバージョン番号があり、どちらが「アプリのバージョン」か不明瞭。
- **C# ローカル API**: このリポジトリに実体が無い（`docs/reference/` に PowerShell / C# の参照コードはあるが別プロジェクト）。`LocalStorageBackend` が叩く `http://localhost:8081` のサーバーは外部管理。整合性検証ができない。

**層分けの実現度評価**（`CLAUDE.md` の観点に対して）:

| 層 | 実現度 | コメント |
|---|---|---|
| ドメイン / 中核ロジック | ○ | `models/` + `utils/` の純粋関数。ただし `models` が `StorageManager` を直接 import（`TTThink.ts:12`）しており完全な純粋層ではない |
| アプリケーションサービス | △ | `views/` が VM 兼サービス。`TTApplication` の `OpenBundle` 等は良いが、React コンポーネントが `SaveContent` を直接呼ぶ経路が多くサービス層を貫通 |
| UI | ○ | `components/`。ただしビジネスロジック（フィルタ計算、保存）がコンポーネント内に散在 |
| プラットフォーム抽象化 | ◎ | `IStorageBackend` + `StorageManager` + `apiClient`。この規模では十分 |
| Web / ローカル / 永続化実装 | ○ | 3 backend + Electron main。`splitContent` 重複だけ要修正 |
| AI プロバイダー実装 | △ | `ChatService` 内の if 分岐。プロバイダー非依存の中間表現が無い（D-3） |

**推奨事項**
1. `splitContent` を Electron 側でも `dist-server` or 共有モジュールから読む（重複解消）。
2. バージョン番号を `package.json` に一本化。
3. 3モードのスモークテスト手順を `docs/` に明文化（`TT_SELFTEST` の拡張）。

### E-7. コード品質

**良い点**
- ファイル分割の粒度が概ね適切。1,000行超は `TTUIStateManager`（1,521・大半は宣言的な `PROP_SPECS`）、`TextEditorMedia`（1,110）、`WorkoutSettingArea`（1,107）、`DataGridMedia`（1,033）、`WorkoutPanel`（954）の5つ。
- アクション定義を `views/actions/textEditor*.ts` に機能別分割。
- コメントが WHY 中心（`CLAUDE.md` の規約が守られている）。
- `tsc strict` 通過。`noFallthroughCasesInSwitch` 有効。

**懸念点**
- **`any` 98箇所**（D-12f）。
- **循環依存の痕跡**: `TTFocusedPanelActions.ts:736-737` のコメント「`markdownHeadings.ts` に分離済み（`TTUIStateManager.ts` との循環 import を解消するため）」。過去に循環があり、対処済みだが、`models → services/storage → (実質) 全体` の依存方向は残る。
- **巨大コンポーネント**: `TextEditorMedia`（1,110行、`useEffect` 多数、Monaco デコレーション計算がインライン）。`DataGridMedia`（1,033行）。これらの `React.lazy` 化は前回レビュー M-4 で提案されたが未対応（`grep 'React.lazy\|lazy(' src` → 確認要）。
- **重複コード**: D-12e（FilterPanel）。`ToggleCheck` の3実装。`splitContent` の2実装。
- **暗黙的グローバル状態**: `window.ttApp`（`TTApplication.ts:87`）、`window.__runTests`（`App.tsx:103`）、`window.__THINKTANK_MODE__` / `window.__THINKTANK_LOCAL_API__`。
- **副作用の発生場所**: `TTModels` コンストラクタが `this.Vault.LoadCache()` を発火（`TTModels.ts:32`）。singleton の getter アクセスでネットワーク I/O が始まる。テストで `TTModels.Instance` に触れると即 fetch。
- **イベントリスナー解除**: `App.tsx` は cleanup 完備。`TTShortcutManager` コンストラクタの window リスナーは解除経路なし（singleton なので実害小）。
- **設定値・マジックナンバー**: `max_tokens: 4096`、自動保存 `3000`ms、Undo `50`、FileHistory `30`、`_debounceTimer` `500`ms、`focusSelector` の `setTimeout(50)` などが散在。定数化されているものと直値のものが混在。

**推奨事項**
1. `TextEditorMedia` / `DataGridMedia` の `React.lazy` 化（メディアは排他表示なので初期バンドル削減効果大）。
2. Monaco 拡張 interface を1つ定義して `any` を集約（D-12f）。
3. `TTModels` の副作用をコンストラクタから `init()` メソッドに出す（テスト容易性）。
4. マジックナンバーを `constants.ts` に集約。

### E-8. テスト

**現状**: テスト0、Lint設定0、CI0。→ D-6。

**良い点**: 純粋関数の分離が進んでおり（`utils/` 配下、`TTWorkoutPanel` の BSP 関数、`markdownSanitize`）、**テストを書き始める土台はできている**。

**懸念点**: リグレッション検出が目視のみ。前回レビューの XSS が誤コメントで放置された前例。

**推奨事項**: G 節参照。

### E-9. セキュリティとプライバシー

**良い点**
- 認証フェイルクローズ（`apiAuth.ts`）、IAP JWT 署名検証、`timingSafeEqual`。
- `deploy.ps1` の `-AccessModel` 必須化。
- BigQuery 全クエリパラメータ化（`@fileId` 等）。
- エクスポートのパストラバーサル検証（`SAFE_ID_RE` + `path.resolve(...).startsWith(exportDir)`、`bigqueryRoutes.ts:198-203`）。
- `/api/system/open` の拡張子ブロックリスト + `explorer.exe` + Cloud Run 非登録。
- Markdown サニタイズ（`markdownSanitize.ts`）。
- Electron `contextIsolation` / CSP 両モード / セッション鍵。
- サービスアカウント鍵の gitignore / dockerignore。

**懸念点**
- **SSRF**: D-4。
- **検証迂回**: D-5。
- **`server/.env` の Docker レイヤー焼き込み**: D-12a。
- **`console.*` に情報**: D-12i。
- **`exportStatus` グローバル**: D-12h。
- **レート制限なし**: `/api/chat` に流量制御が無い（公開経路は IAP で塞がれているが、多層防御としては薄い）。
- **CORS**: `http://localhost:5173` のみ許可（`server/index.ts:39`）。適切。
- **入力検証**: HTTP ルートは `SAFE_ID_RE`。AI ツールは無検証（D-5）。`chatRoutes` の `messages` は `Array.isArray` チェックのみで各要素の `role`/`content` を検証しない。
- **破損データの読み込み**: `main.cjs` の `listMeta` は JSON パース失敗を種類別集計して継続（良い）。`TTUIStateManager._applyContent` は不正 CSV を Markdown パースにフォールバック。`parseBundle` は不正行を静かにスキップ。全体に「壊れても落ちない」志向で、これは○。ただし「壊れたことをユーザーに伝えない」面も。
- **オフライン**: `TTVault.LoadCache` は3回リトライ後 `IsLoaded` を false のまま。オフライン起動時の UX は「読み込み中…」のまま or 空。`window.addEventListener('online')` でのリカバリが無い。

**推奨事項**: D-4, D-5, D-12a を対応。`/api/chat` に簡易レート制限。`chatRoutes` の `messages` 要素検証。

### E-10. パフォーマンス

**良い点**
- 仮想スクロール（`@tanstack/react-virtual`）。
- `react-force-graph`（1.8MB）と `xlsx`（429KB）は動的 import 済み（前回レビューで確認）。
- Monaco はローカルバンドル（CDN 依存なし）。
- `TTShortcutManager` のインデックス化で毎キーストロークのコスト低。
- `NO_CANDIDATES` 定数で毎キーストロークの `?? []` 割り当てを回避（`TTShortcutManager.ts:73`）。

**懸念点**
- **初期バンドル**: 前回レビュー時点で `index.js` 1.65MB（Monaco + highlight.js 全言語）。`React.lazy` 未使用（D-12f、E-7）。要再測定。
- **広域再レンダリング**: D-7。
- **`serialize()` の頻度**: `applyProperty` / `_scheduleSave` / undo/redo のたびに 200+ の `PropSpec.get(app)` を実行。一部は DOM クエリ（`getFocusName(document.activeElement)`、`document.querySelectorAll('.workout-area')`）。設定変更が連続すると効く。
- **`_saveToLocalStorage` の重複**: `applyProperty` が末尾で直接呼び、かつ app 更新リスナー経由の `_scheduleSave`（500ms デバウンス）も走る。1変更で最大2回の全文シリアライズ + localStorage write。
- **`GetThinksForBundle` の毎回全舐め**: `allThinks` の filter + Map 構築を毎呼び出し。キャッシュ（`_bundleThinksCache`）はあるが async 版の結果のみ。

**推奨事項**（早すぎる最適化は避けつつ）
1. `React.lazy`（メディア群）— 効果が明確なので実施推奨。
2. `serialize()` を「isConst でないキーのみ」に絞る（永続化に isConst = 派生値は不要）。
3. `applyProperty` の直接 `_saveToLocalStorage` を削り、デバウンス経路に一本化。
4. D-7（通知粒度）は規模が数千件を超えてから本格対応で可。

### E-11. 開発・配布環境

**良い点**
- `npm run electron:dev` が concurrently で3プロセスを協調起動、`wait-on` で順序制御。
- `deploy.ps1` が丁寧（シークレット検証、区切り文字チェック、`--update-env-vars`/`--update-secrets` を使い既存を消さない配慮）。
- `CLAUDE.md` に「やってはいけないこと」（`dist-server` 手動編集、`main.cjs` の ESM 化、`electron:dev` 多重起動）。

**懸念点**
- **`dist` / `dist-server` / `release` / `release2` がワーキングツリーに存在**（gitignore 済み）。`git status` はクリーンだが、古いビルド成果物が残っている可能性。
- **`build:server` の手動性**: `CLAUDE.md` が「サーバー変更後は必ず `npm run build:server`」と明記するほど、忘れやすい。`electron:dev` が `dist-server` の古いコードを動かす。
- **CI 無し**: D-6。
- **`copyright.txt` の別バージョン系**: `v1.4.36` / `commitId`。`git-update` skill が更新する模様。`package.json` の `4.0.0` と二重。

**推奨事項**
1. `server:dev` を `tsx` / `ts-node` 直実行にして `build:server` 忘れを構造的に排除（or `electron:dev` に `build:server` を前段追加）。
2. GitHub Actions で `tsc` × 2 + `vitest` + `eslint`。
3. バージョン一本化。

### E-12. ドキュメント

**良い点**
- `docs/` に要件・仕様・実装計画・過去レビューが揃っている。
- `docs/Thinktank_Status-Action-Binding.md`（1,681行）が状態変数の定義元。
- `docs/DefaultShortcut.md` がキーバインドの定義元（コードから `?raw` import）。
- 各ファイル冒頭コメントが充実。

**懸念点**
- **`CLAUDE.md` の参照先が実在しない**: D-12j。
- **`docs/` に複数世代のスナップショット**（`260402` / `260418 v2-v5` / `260507 V6` / `260606` / `260720`）が混在。「現行の正」がどれか不明。
- **`docs/Thinktank_Status-Action-Binding.md` と `PROP_SPECS` の整合が未検証**（D-8）。1,681行の手書きドキュメントとコードの同期は破綻しやすい。
- **`docs/ThinktankWeb_MappingSheet.md` / `_Implementation.md` / `_Manual.md`** の鮮度不明。
- キーバインドのレイアウト依存・IME 挙動が文書化されていない（D-10, D-11）。

**推奨事項**
1. `CLAUDE.md` の参照先修正 + 「現行ドキュメントは `docs/260606_Thinktank仕様書/` と `docs/Thinktank_Status-Action-Binding.md`」等の明示。
2. 旧世代を `docs/archive/` に隔離。
3. `Status-Action-Binding.md` を「`PROP_SPECS` から自動生成」に切り替えられないか検討（`serialize()` が既に近いものを出力する）。

### E-13. Vibe Coding の安全性

**良い点**
- コメントが「過去のバグと対処」を記録 → AI が変更理由を追える。
- `CLAUDE.md` に禁止事項・パネル構成・コンポーネント命名規約。
- `PROP_SPECS` / アクションレジストリ / ショートカットテーブルという「1箇所に足す」構造 → AI が拡張場所を見つけやすい。
- 前回レビューへの対応実績 → フィードバックが機能。

**懸念点**
- **「AI が既存の仕組みを見落として別方式を追加する」リスクが高い箇所**:
  - 保存: `think.SaveContent()` を直接呼ぶ既存箇所が多数あるため、AI は「保存アクション」の存在に気づかず直接呼びを増やす。
  - フィルタ: `FilteredThoughts` の書き戻しパターンを踏襲して派生値の状態化を増やす。
  - キー正規化: `e.key` ベースを踏襲して `e.code` 対応が遠のく。
  - モデル許可リスト: 2ファイル手動同期を知らずに片方だけ更新。
- **`ConfigKey` / `ActionID` の型が緩い**（D-8）→ AI が typo キーを追加しても型で止まらない。
- **禁止事項の明文化はあるが「触ってはいけない境界」が曖昧**: 例「`markdownSanitize.ts` のサニタイズ経路は削るな」「`apiAuth` はフェイルクローズを崩すな」が `CLAUDE.md` に無い。
- **変更後の必須検証**: `CLAUDE.md` は `build:server` のみ言及。`tsc --noEmit`（フロント）、（あれば）テストの記載が無い。
- **1回の作業範囲**: ガイダンス無し。`TTUIStateManager` や `TextEditorMedia` のような1,000行超ファイルへの部分変更を丸ごと投げると影響範囲が読めない。

**推奨事項**: H 節の「AI 開発ガードレール」を `CLAUDE.md` に追記。

---

## F. 改善ロードマップ

### Phase 0：機能追加前に確認すべき重大事項

| 項目 | 目的 | 対象 | 依存 | 期待効果 | リスク | 完了条件 |
|---|---|---|---|---|---|---|
| **F0-1. `beforeunload` + 保存失敗リトライ**（D-1） | 未保存データ損失の防止 | `App.tsx`、`TextEditorMedia.tsx`、`electron/main.cjs` | なし | データ損失経路を塞ぐ | `beforeunload` で同期処理を重くしすぎない | dirty 時にウィンドウを閉じると確認が出る／保存失敗が指数バックオフで再試行される／オンライン復帰でフラッシュ |
| **F0-2. 保存の楽観ロック**（D-2） | 同時編集の無警告上書き防止 | `TTThink.SaveContent`、`SavePayload`、`BigQueryService.save`、`bigqueryRoutes` | なし | 端末併用時の損失防止 | 既存データの `updated_at` 形式差（`{value: string}` オブジェクト）の扱い | 古いベースで保存すると 409 → ユーザーに選択を提示 |
| **F0-3. AI プロバイダー非対称の明示 or 解消**（D-3） | 中核機能が既定で無効な状態の解消 | `ChatService.ts`、`chatRoutes.ts`、モデルセレクタ UI | なし | 「登録されない」バグの解消 | 中間表現化は規模大。まず UI 明示で暫定 | 非対応プロバイダー選択時に UI で明示される／または全プロバイダーでツールが動く |
| **F0-4. AI 書き込みの検証集約 + ID 整合**（D-5） | 不正データ混入とリンク切れの防止 | `BigQueryService.save`、`executeGeminiTool`、`parseBundle`、`.thinktank/thinktank.md` | F0-3 | AI 登録機能の成果物が正しくリンクされる | ID 形式変更は既存データへの影響確認が必要 | AI が作った Bundle に AI が作った Think が表示される／検証を通らない書き込みが 400 |
| **F0-5. `fetchUrlMeta` の SSRF 対策**（D-4） | 内部ネットワーク探索の踏み台化防止 | `ChatService.ts:116` | なし | 攻撃面の縮小 | 正当な短縮 URL のリダイレクトを弾く可能性 | プライベート/リンクローカル/ループバック IP への到達が拒否される |
| **F0-6. `.dockerignore` に env 追加**（D-12a） | ビルドレイヤーへの秘密焼き込み防止 | `.dockerignore` | なし | 秘密漏洩リスク低減 | なし | `server/.env` が Docker build context から除外される |

**Phase 0 の想定工数**: F0-1・F0-5・F0-6 は各半日以内。F0-2・F0-4 は1〜2日。F0-3 は暫定（UI 明示）なら半日、正攻法なら別途 Phase 2。

### Phase 1：小さく安全に改善できる項目（数時間〜数日、既存挙動を変えにくい）

| 項目 | 目的 | 期待効果 | 完了条件 |
|---|---|---|---|
| F1-1. IME ガード（D-10） | 変換中のショートカット暴発防止 | 日本語入力体験の安定 | `handleKeyDown` 冒頭で `e.isComposing` 早期 return |
| F1-2. `SyncState` の双方向遷移化（D-9） | 保存状態の可視化 | ユーザーが保存漏れに気づける | 保存成功で 'synced'、失敗で 'failed'、回復で 'synced' |
| F1-3. `console.*` の本番除去（D-12i） | 情報漏洩・ノイズ削減 | DevTools に Vault 情報が残らない | vite の `esbuild.drop` or ロガー化 |
| F1-4. `splitContent` 重複解消（E-6） | Electron とサーバーの保存整合 | 片方修正漏れの排除 | `main.cjs` が共有実装を使う |
| F1-5. `CLAUDE.md` 参照先修正（D-12j） | ドキュメント整合 | AI/新規開発者の混乱防止 | 参照先が実在パス |
| F1-6. 純粋関数の単体テスト着手（D-6 一部） | リグレッション検出の土台 | `markdownSanitize` / `thinkFormat` / `keyboardUtils` を保護 | vitest 導入 + 上記3ファイルのテスト |
| F1-7. `tsc --noEmit` ×2 の CI 化 | 型崩れの自動検出 | PR 前に型エラーを検出 | GitHub Actions or pre-push |
| F1-8. `[未実装]` アクションの UI 非表示（D-12 / E-2） | 混乱防止 | 呼べないアクションが見えない | `RollbackFocusedThink` 等をメニューから除外 or 実装 |

### Phase 2：次の主要機能追加前に行う項目

| 項目 | 目的 | 依存 | 期待効果 |
|---|---|---|---|
| F2-1. `ConfigKey` / `PROP_SPECS` の型強化（D-8） | typo・重複定義の型検出 | なし | AI が安全にキーを追加できる |
| F2-2. `CheckedThoughtIDs` の一元化（E-1） | 状態重複の解消 | なし | consumer 追加が1箇所で済む |
| F2-3. `FilteredThoughts` の派生値化（D-12b） | 状態の真実を1本に | F2-1 | カーソル位置のバグ排除 |
| F2-4. 設定の localStorage 直読み一掃（D-12c） | 状態の所在の一元化 | F2-1 | zoom・layout・AI モデルも Undo 対象・単一経路 |
| F2-5. AI ツールのプロバイダー非依存化（D-3 正攻法） | 全モデルで中核機能が動く | F0-3, F0-4 | Anthropic 既定で登録が機能 |
| F2-6. モデル許可リストの単一化（E-5） | 二重管理の解消 | F2-5 | 片方更新漏れの排除 |
| F2-7. `FilterPanel` / `SearchBar` の common 統合（D-12e） | 重複コード解消 | なし | 約400行 + CSS 削減、片側漏れの排除 |
| F2-8. メディア群の `React.lazy` 化（E-7, E-10） | 初期バンドル削減 | なし | 起動時間短縮 |
| F2-9. エディタ内容の localStorage 退避（E-4） | クラッシュ復旧 | F0-1 | Electron クラッシュでも直近が復旧可能 |
| F2-10. キーバインド競合表示・マージ改善（E-3） | 設定の信頼性 | なし | ユーザーが競合を認識できる |
| F2-11. 純粋関数テストの拡充（D-6） | リグレッション網羅 | F1-6 | 状態遷移・アクション・キー解決をカバー |

### Phase 3：中長期的な設計改善（規模拡大時に必要）

| 項目 | 目的 | 依存 |
|---|---|---|
| F3-1. 通知粒度の細分化（`useSyncExternalStore` + セレクタ）（D-7） | 数千件規模での描画性能 | F2-2, F2-3 |
| F3-2. `e.code` ベースのキー正規化 + Mac 対応（D-11） | 多環境対応 | F2-10 |
| F3-3. Think 本文のスキーマバージョニング + マイグレーション（E-4） | データ形式の進化に耐える | なし |
| F3-4. 保存アクションの一本化（コンポーネント直呼びの排除）（E-2） | サービス層の一貫性 | F2-4 |
| F3-5. `Status-Action-Binding.md` の自動生成化（E-12） | ドキュメントとコードの同期 | F2-1 |
| F3-6. Think 削除・復元の Undo 対応 / BQ time travel UI（E-4） | データ操作の可逆性 | なし |
| F3-7. `TTModels` の副作用をコンストラクタから分離（E-7） | テスト容易性 | F2-11 |

---

## G. テスト追加計画（優先順位順）

前提: `vitest` を導入。`jsdom` 環境。DOM 依存の薄い純粋関数から着手。

### 最優先（データ損失・セキュリティ・中核機能に直結）

1. **`markdownSanitize.ts`** — `<script>alert(1)</script>`、`<img onerror=...>`、`[x](javascript:alert(1))`、`[x](data:text/html,...)`、`[x](/path "onmouseover=alert(1))`（title ブレイクアウト）、`<iframe>` が**すべて無害化される**こと。`http`/`https`/`mailto`/`tel` リンクは `target="_blank" rel="noopener noreferrer"` 付きで残ること。`renderMarkdownSections` の `<details>` ラッパーに埋め込む値が数値のみであること。
2. **`thinkFormat.ts`** — `parseBundle` / `serializeBundle` の往復同一性。`* <ID>` 行の ID 判定（現行正規表現の境界: サフィックス付き ID がキーワード扱いになる**現状の挙動を明記**するテスト → D-5 修正時にこのテストを更新）。`parseChat` / `serializeChat` の往復。`splitContent` の改行なし/CRLF ケース。
3. **保存失敗パス（`TTThink.SaveContent`）** — `StorageManager.save` が reject したとき、(a) 例外が再送出される (b) `markSaved()` されない（`IsDirty` が true のまま）(c) `_savedContent` が更新されない。
4. **楽観ロック（F0-2 実装後）** — 古いベースバージョンでの保存が 409 になり、クライアントが上書きしない。
5. **AI ツール実行部（`executeGeminiTool`、BQ モック）** — `saveBundle` の content 形式と `parseBundle` が整合すること（D-5）。不正 `category` / `id` が拒否されること（F0-4 実装後）。

### 高優先（主要機能の破壊防止）

6. **キーバインド解決（`TTShortcutManager`）** — `matchesFocus`（`*` / `Workout*` / `*TextEditor` / 完全一致）。`_mergeExModeKey`（`shift+z` + `ctrl+alt` → `ctrl+alt+shift+z`）。`_rebuildActiveTable` が focus/exmode でフィルタした結果。同一キーに複数エントリがあるとき `Allow=false` で打ち切ること。
7. **`keyboardUtils`** — `normalizeKeyStr`（順不同モディファイア、別名 `up`→`arrowup`）。`parseMultiKey`（`ctrl+z|ctrl+\|`）。`keyEventToStr`（`Control` 単独は null）。IME（`isComposing`）ガード（F1-1 実装後）。
8. **`TTUIStateManager._applyProp`** — candidates 正規表現による値検証（不正値は無視）。`toggle` / `next` / `prev` の循環。`isConst` キーへの書き込みが no-op。存在しないキーが no-op（現状）→ 型強化後はコンパイルエラー。
9. **`_applyContent` のマイグレーション regex** — 旧キー名（`Application.KeyboardFocused.AreaName` 等）が新キーに変換されて適用されること。旧 Highlighter/Heading の分割キーが統合 Style に集約されること。
10. **`dateUtils.computeDateRange` / `formatDateRangeJapanese`** — 相対指定（「先週」「今月」等）の境界。`GetThinksForBundle` の日付フィルタが依存。
11. **BSP ツリー（`TTWorkoutPanel`）** — `addToFocused` / `removeLeaf` / `swapLeafs` / `MoveArea` の各方向。1ペインを削除して 0 になったとき `null`。`collectAreaIds` の順序。
12. **`TTVault.GetThinksForBundle`（sync/async）** — ID 直指定 / キーワードフィルタ / 除外 ID（`- <ID>`）/ ネスト bundle / 循環参照（`visited` セット）/ 「条件なし = 全件」。

### 中優先（回帰の早期検出）

13. **`markdownSections` / `markdownHeadings`** — 見出し階層の解析、コードフェンス内の `#` を見出しにしない、`editorLineOffset`。
14. **`tableFormat.parseTableContent` / `tableSectionToContent`** — DataGrid の保存往復。RFC4180 エスケープ。
15. **フィルタ計算（`ThinktankArea` / `OverviewArea` のフィルタロジックを純粋関数に抽出してから）** — タイトル/キーワード一致、種別フィルタ、チェックのみ表示。
16. **`aiModels.isAllowedAiModel`** — 許可リスト内/外。`provider`/`model` の型不一致。

### E2E（重要シナリオ、Playwright 等・後回し可）

- 編集 → 3秒待つ → リロード → 内容が残っている。
- 編集 → 即リロード（3秒以内）→ 確認ダイアログ（F0-1 実装後）。
- オフライン化 → 編集 → オンライン化 → 保存される（F0-1）。
- キーバインド競合（同一キー2アクション）→ 期待通り1つだけ発火。
- ExMode: `Alt+A` → `Q` でパネル開閉、`Alt` を離すと ExMode 解除。
- AI チャットで「Bundle を作って」→ Vault に Bundle と Think が出現し、Bundle を開くと Think が表示される（D-3, D-5 修正後）。
- データ形式更新後、旧形式の `__tt_ui_state__` を読み込んでも UI が壊れない。

### CI で防げる問題

- `tsc --noEmit`（フロント + サーバー）: 型崩れ。
- `eslint`（`no-floating-promises` だけでも）: `SaveContent()` の await 漏れ = 保存漏れ。
- `vitest run`: 上記1〜16。
- （任意）`vite build` の成功 + バンドルサイズの上限チェック。

---

## H. AI 開発ガードレール案

以下を `CLAUDE.md` に追記することを推奨する（本レビュー時点では変更しない）。

### H-1. 作業前に読むべきファイル

```markdown
## AI が作業を始める前に読むファイル

### 常に
- CLAUDE.md（このファイル）
- src/views/TTApplication.ts（VM のルート構造）

### 状態を追加・変更するとき
- src/views/TTUIStateManager.ts の PROP_SPECS（全設定の定義元）
- docs/Thinktank_Status-Action-Binding.md（状態変数の仕様）

### アクションを追加するとき
- src/views/TTAction.ts / TTActions.ts（型とレジストリ）
- src/views/TTFocusedPanelActions.ts（登録の実例）
- src/views/actions/ 配下（機能別のアクション定義）

### キーバインドを追加するとき
- docs/DefaultShortcut.md（定義元。コードが ?raw import している）
- src/views/TTShortcutManager.ts の冒頭コメント（書式の全仕様）
- src/utils/keyboardUtils.ts（正規化）

### 保存・データを触るとき
- src/models/TTThink.ts（SaveContent / LoadContent / dirty 判定）
- src/models/TTVault.ts（Create*Think のロールバックパターン）
- src/services/storage/IStorageBackend.ts（3実装すべてに影響）

### AI 機能を触るとき
- server/services/ChatService.ts（プロバイダー分岐）
- server/config/aiModels.ts と src/services/aiModels.ts（許可リストは2ファイル手動同期）
- .thinktank/thinktank.md（システムプロンプト）

### Markdown 表示を触るとき
- src/utils/markdownSanitize.ts（サニタイズ経路。絶対に迂回しない）
```

### H-2. 新しい状態を追加するときのルール

```markdown
- 設定・UI 状態は必ず TTUIStateManager の PROP_SPECS に1オブジェクトとして追加する。
  独立した localStorage キーや VM の生プロパティを新設しない
  （既存の tt-layout-mode / zoom / AI モデルは例外的にそうなっているが、真似しない）。
- 派生可能な値（他の状態から計算できる値）は状態にしない。getter か純粋関数で算出する。
  FilteredThoughts のように「Reactが計算してVMに書き戻す」パターンを増やさない。
- 同じ意味の状態を複数の VM に置かない。共有が必要なら TTApplication 直下に1つ置き、
  各パネルは getter で参照する。
- isConst: true は「読み取り専用の派生値・フォーカス等」に限る。永続化されない。
- 追加後、docs/Thinktank_Status-Action-Binding.md にも記載する（または自動生成の対象にする）。
```

### H-3. 新しいアクションを追加するときのルール

```markdown
- ActionID は 'Category.Property:Value' 形式。既存の命名（FocusedPanel.* / TextEditor.* /
  WorkoutPanel.* / Application.*）に合わせる。
- 状態を変えるだけのアクションは TTUIStateManager.applyProperty(key, value) を呼ぶ薄いラッパーにする。
  ビジネスロジックを Completion に直書きしない。
- Completion は例外を投げてよい（TTActions.Execute が捕捉して item.Result に入れる）。
- 実装が未完成なアクションを登録しない（[未実装] を返すだけのアクションはメニュー/ショートカットから
  呼べてしまう）。
- UI コンポーネントから think.SaveContent() 等のドメイン操作を直接呼ばない。
  可能な限りアクション経由にし、SetLastActionDisplay を通す。
```

### H-4. キーバインディングを追加するときのルール

```markdown
- docs/DefaultShortcut.md にテーブル行を追加する。コードの DEFAULT_SHORTCUTS は最小限に留める。
- focus 列は必ず指定する（'*' は「入力欄では無効」を意味することに注意。
  エディタ内でも効かせたいなら *TextEditor、常時なら ExMode を使う）。
- 記号キー・数字段キー（Shift+数字など）はキーボードレイアウト依存で壊れやすい。
  避けるか、レビューで環境依存性を明記する。
- 同一 (focus, exmode, key) に複数 action を登録しない（競合検出の仕組みが未実装）。
- 既存キーの再定義は focus/exmode が完全一致する場合のみ DEFAULT を上書きする点に注意。
- 追加後、実機（できれば JP/US 配列両方）で発火を確認する。
```

### H-5. Web／ローカル差分を追加するときのルール

```markdown
- プラットフォーム分岐は StorageManager.instance.mode / window.electronAPI の有無 で行い、
  src/components 内に分岐を散らさない。
- ファイル操作・ストレージ・通知の新機能は IStorageBackend か新しい抽象インターフェースに定義し、
  3実装（Electron / Local / BigQuery）すべてに実装する（片方だけ実装しない）。
- 共通ロジック（パース、フォーマット）を electron/main.cjs に別実装でコピーしない
  （splitContent が既にそうなっている。増やさない）。
- Web 専用 API（serviceWorker, IndexedDB 等）は !window.electronAPI ガードで囲む。
- ローカル専用 API（electronAPI.storage, /api/system/open）を Cloud Run 向けサーバーに載せない。
```

### H-6. AI 機能を変更するときのルール

```markdown
- モデルを追加するときは server/config/aiModels.ts と src/services/aiModels.ts の両方を更新する。
- ツール（関数呼び出し）を追加するときは、現状 Gemini 分岐にしかツールが無いことを認識する。
  Anthropic（既定プロバイダー）にも同じツールを実装しないと、既定構成で動かない機能になる。
- AI が生成した ID / category / 本文を検証なしで BigQuery に書かない
  （BigQueryService.save に検証を集約する方針）。
- 外部 URL を取得する処理（fetchUrlMeta 等）はプライベート IP 帯をブロックする。
- API キーをクライアントに渡さない。ログに本文・キーを出さない。
- AI を無効化しても通常機能が動くことを維持する（AI は独立サービス）。
```

### H-7. データ形式を変更するときのルール

```markdown
- Think 本文の形式（bundle / chat / links / table のパース規則）を変えるときは、
  旧形式のデータを読み込むマイグレーションを用意する。
- BigQuery スキーマ変更は server/services/BigQueryService.ts の ensureTableExists() /
  initialize() を確認する。既存データは論理削除の履歴行として残る前提。
- localStorage の tt-ui-state-v4 の形式を変えるときはキー名のバージョンを上げ、
  旧バージョンからの1回きりのマイグレーションを書く（_applyContent の regex 列を増やし続けない）。
- 形式変更後、旧データでの読み込みテストを追加する。
```

### H-8. 禁止事項（既存の「やってはいけないこと」に追記）

```markdown
- markdownSanitize.ts のサニタイズ経路（DOMPurify + スキーム許可リスト）を迂回しない。
  dangerouslySetInnerHTML を新規に追加しない。
- apiAuth.ts のフェイルクローズ（公開環境で認証未設定なら起動中止）を緩めない。
- deploy.ps1 の -AccessModel 必須（既定値なし）を崩さない。
- AI ツールの書き込みを無検証にしない。
- 保存処理（SaveContent 系）の Promise を握り潰さない（await するか catch で表示する）。
- TTThink / TTVault が React や DOM に依存するコードを追加しない。
```

### H-9. 変更後に必ず実行する確認

```markdown
## 変更後の必須確認

1. npm run build:server（server/ を変更した場合）
2. npx tsc -p tsconfig.json --noEmit（src/ を変更した場合）
3. npx tsc -p server/tsconfig.json --noEmit（server/ を変更した場合）
4. （テスト導入後）npx vitest run
5. npm run electron:dev で起動し、変更箇所の動作を実機確認
6. 保存を伴う変更なら「編集 → リロード → 内容が残る」を確認
7. キーバインド変更なら実キーで発火確認
```

### H-10. レビュー時のチェックリスト

```markdown
- [ ] 新しい状態は PROP_SPECS に入っているか（生プロパティ/独自 localStorage を新設していないか）
- [ ] 派生値を状態にしていないか
- [ ] 保存の Promise を await/catch しているか
- [ ] IStorageBackend に足したメソッドを3実装すべてに実装したか
- [ ] AI モデル許可リストを両ファイル更新したか
- [ ] AI 書き込みに検証があるか
- [ ] dangerouslySetInnerHTML を追加していないか / サニタイズ経由か
- [ ] キーバインドの focus/exmode を指定したか、レイアウト依存キーを避けたか
- [ ] 1,000行超ファイルへの変更は影響範囲を説明できるか
- [ ] コメントに WHY を書いたか（WHAT は書かない）
- [ ] tsc ×2 が通るか
```

### H-11. 1回の AI 作業に渡す変更範囲

```markdown
- 1回の依頼は「1つの関心事」に限る（新機能1つ、バグ1つ、リファクタ1種類）。
- 以下のファイルへの変更は、変更前に「何を・どこを・なぜ」を明示させ、影響範囲を列挙させてから着手:
  - src/views/TTUIStateManager.ts（1,521行、全設定の中枢）
  - src/components/WorkoutPanel/media/TextEditorMedia.tsx（1,110行、Monaco 連携）
  - src/views/TTShortcutManager.ts（キー処理の中枢）
  - src/models/TTThink.ts / TTVault.ts（データ層。壊すとデータ損失）
  - server/services/ChatService.ts（プロバイダー分岐）
- 大規模変更（層またぎのリファクタ、状態モデルの変更）は Phase 単位に分割し、
  各 Phase で tsc + テスト + 実機確認を挟む。
- 変更後の diff は「機能追加 diff」と「リファクタ diff」を分けてコミットする
  （人間がレビューしやすくするため）。
```

---

## I. 未確認事項と質問

重要度順。回答により対応方針・優先度が変わるものを上に。

| # | 質問 | なぜ重要か（回答でどの判断が変わるか） |
|---|---|---|
| 1 | **同一ユーザーが複数端末（PWA + Electron 等）を日常的に併用しているか？** | 併用しているなら D-2（同時編集の上書き）は Critical。単一端末運用なら High で Phase 2 送りでも可 |
| 2 | **AI チャットで実際に使っているプロバイダーは？（`AI_PROVIDER` の実値）** Gemini を使っているなら D-3 の緊急度は下がる | Gemini 運用なら D-3 は「他プロバイダーで使えないだけ」。Anthropic 運用なら「中核機能が動いていない」= 最優先 |
| 3 | **本番（Cloud Run）は現在どの `-AccessModel` でデプロイされているか？IAP か？** | IAP なら D-4（SSRF）・D-12h の外部露出リスクは大幅減。SharedSecret 公開なら要注意 |
| 4 | **Vault の現在の Think 件数は？（数百 / 数千 / 数万）** | D-7（再レンダリング粒度）・E-10 の優先度。数百なら Phase 3、数千超なら Phase 2 |
| 5 | **ローカル C# API（port 8081）は現在も使っているか？このリポジトリ外のどこで管理しているか？** | 使っていないなら `LocalStorageBackend` と関連分岐を削除でき、プラットフォーム分岐が2系統に減る。整合性検証の対象も減る |
| 6 | **Electron 版の配布方法は？（手動 / autoUpdater / 未配布）** | 未配布なら D-1 の Electron 側対応の緊急度は下がる。配布済みなら既存ユーザーのデータ損失リスク |
| 7 | **`docs/` のどれが「現行の正」か？特に `Thinktank_Status-Action-Binding.md` は最新か？** | D-8（型強化）とドキュメント自動生成の方針が変わる |
| 8 | **Monaco の内部 API（folding contribution 等）への依存は、Monaco バージョン固定前提か？** | `any` 集約（D-12f）の方針。バージョン固定なら拡張 interface で十分。追従前提なら別の抽象が要る |
| 9 | **`nettext`（外部取り込みテキスト）は実際に使われている機能か？取り込み経路は？** | 使われていないなら Markdown XSS の到達経路が実質なくなり、`markdownSanitize` の優先度は「予防」に留まる。使われているなら現状維持で正しい |
| 10 | **`copyright.txt` の `v1.4.x` 系と `package.json` の `4.0.0` の関係は？どちらがユーザー向けバージョンか？** | バージョン一本化（E-11）の方針。リリースノート・サポートの基準 |
| 11 | **`RollbackFocusedThink` / `RollbackAll`（BQ time travel 復元）は実装予定があるか？** | E-4 の「削除・復元・履歴」の設計。実装予定なら Phase 2、無しなら UI から除去 |
| 12 | **CI を回せる環境はあるか？（GitHub / GitLab / ローカルフックのみ）** | D-6 の実現方法。GitHub Actions か pre-push か |

---

## J. 最終判断

### 1. 現状のまま機能追加を続けられるか

**Phase 0（F0-1〜F0-6）を先に片付ければ、続けてよい。**
Phase 0 抜きで機能追加を続けるのは推奨しない。理由は、未保存データ損失（D-1）と同時編集上書き（D-2）が「機能を足すほど遭遇機会が増える」種類のリスクであり、後から遡って直すコストが上がるため。Phase 0 は合計で3〜5営業日程度と見積もる。

### 2. 先に修正すべきブロッカーがあるか

**ある（Phase 0）。** 特に:
- **D-1（`beforeunload` 未実装 + 保存失敗リトライなし）** — データ損失。半日で着手可能。
- **D-2（同時編集の無警告上書き）** — 質問1の回答次第で Critical。
- **D-3（AI プロバイダー非対称）** — 質問2の回答次第。Anthropic 運用なら中核機能が動いていないため、機能追加より先。

セキュリティ面（D-4, D-5, D-12a）は、質問3で IAP 運用が確認できれば「近いうち」に格下げ可。

### 3. 現在のアーキテクチャを維持すべきか

**維持すべき。全面刷新は不要かつ有害。**
- MVVM 風の VM 層 + Observer 通知 + シングルトン + ストレージ抽象化は、この規模（src 27k 行）と目的（個人のメモ蓄積 + AI 補完）に対して適正。
- `PROP_SPECS` / アクションレジストリ / ショートカットテーブルという「宣言的に1箇所へ足す」構造は、継続的な機能追加と AI 開発の両方に向いている。
- 刷新ではなく、既存構造の上で「通知粒度」「状態の所在」「型の厳格さ」「テストの土台」を漸進的に強化する。

### 4. 段階的リファクタリングで対応可能か

**可能。** F 節のロードマップ（Phase 0→1→2→3）がそのまま段階的リファクタの計画になる。各 Phase は独立して価値があり、途中で止めても機能追加を再開できる。破壊的変更（状態モデルの再編、通知機構の差し替え）は Phase 2〜3 に隔離され、それぞれテストを前提条件にしている。

### 5. 次に着手すべき具体的な3項目

1. **`beforeunload` ハンドラー + 保存失敗の指数バックオフ再試行 + オンライン復帰フラッシュ**（D-1 / F0-1）。`src/App.tsx` の `useEffect` にリスナー追加、`TextEditorMedia.tsx` に即時フラッシュ経路、`electron/main.cjs` に `win.on('close')` の未保存確認。**半日。データ損失経路を塞ぐ最優先。**
2. **`vitest` 導入 + `markdownSanitize` / `thinkFormat` / `keyboardUtils` の単体テスト + `tsc --noEmit` ×2 の CI 化**（D-6 / F1-6, F1-7）。**1〜2日。以降の全変更の安全網。**
3. **保存の楽観ロック**（D-2 / F0-2）: `SavePayload` に `baseUpdatedAt` を追加、`BigQueryService.save` の `MERGE` に `updated_at` 照合、0行更新で 409、クライアントで競合ダイアログ。**1〜2日。** （質問1で単一端末運用と確認できたら、優先度を Phase 2 に下げ、代わりに D-3 の暫定対応=非対応プロバイダーの UI 明示を3番目に繰り上げる）

### 6. 今は変更しない方がよい箇所

- **`markdownSanitize.ts`** — 前回レビューの指摘を受けて丁寧に作られている。テストを足す以外は触らない。
- **`server/middleware/apiAuth.ts`** — フェイルクローズ設計が正しい。IAP JWT 検証・定数時間比較を崩さない。
- **`deploy.ps1` の `-AccessModel` 必須化** — 「うっかり公開」を構造的に防いでいる。既定値を足さない。
- **`IStorageBackend` の5メソッド構成** — 抽象の粒度が適切。メソッドを安易に増やさない。
- **`TTThink.LoadContent` / `TTVault.LoadCache` の「失敗を確定させない」ロジック** — コメント付きで理由が明確。並行してリトライ機構だけ足すのは可だが、既存の失敗安全設計は維持。
- **ExMode の仕組み（`TTShortcutManager` + `TTApplicationStatus`）** — 一見複雑だが、モディファイア押下中だけ有効な一時モードという要件を素直に表現している。キー正規化（`e.key` → `e.code`）は差し替えてよいが、ExMode 自体の設計は変えない。
- **BSP ペインツリー（`TTWorkoutPanel` の純粋関数群）** — イミュータブルで正しい。テストを足すだけ。
- **`PROP_SPECS` の構造** — `| string` による型の緩さ（D-8）だけ直せば、この「単一定義」パターンは維持すべき資産。

---

## 付録: 主要状態の一覧（抜粋）

`PROP_SPECS`（約200エントリ）から代表的なものを抜粋。完全版は `src/views/TTUIStateManager.ts:200-996` と `docs/Thinktank_Status-Action-Binding.md`。

| 状態名 | 所有者 | 用途 | 更新元 | 参照元 | 永続化 | ライフサイクル | 懸念 |
|---|---|---|---|---|---|---|---|
| `TTThink._content` | `TTThink` | メモ本文 | エディタ / AI / ロード | 全メディア | BigQuery / FS | Think 生存中 | 同時編集で上書き（D-2）、終了時損失（D-1） |
| `TTThink.Metadata` | `TTThink` | 表示状態（折畳・スクロール位置・highlightWord） | React コンポーネント（直接変更） | メディア | BigQuery `metadata` 列 | Think 生存中 | React 管理外で変更（E-1）、並行レンダリングで問題化しうる |
| `TTThink.IsDirty` / `IsMetadataDirty` | `TTThink`（getter） | 未保存判定 | `Content`/`Metadata` 変更 | Ribbon の ●、`RefreshAll` | 非永続 | 保存で解消 | 「保存中」「失敗」状態が無い（D-9） |
| `checkedIds`（`SharedState`） | `TTApplication`（共有オブジェクト） | チェック選択 | 各パネルの `ToggleCheck` | 4パネル、AI 相談、Bundle 作成 | `Application.CheckedItem.IDs` として localStorage | セッション | 3 VM に重複実装（E-1） |
| `TTThinktankPanel.FilteredThoughts` | `TTThinktankPanel` | カーソルアクション用の一覧スナップショット | React コンポーネントが書き戻す | `Filter.CursorPos` 系 getter | 非永続 | フィルタ変更まで | 派生値の状態化（D-12b）、staleness |
| `TTThinktankPanel.CurrentItemID` | `TTThinktankPanel` | 一覧のカーソル位置 | カーソルアクション、クリック | `Filter.CursorPos`、開くアクション | `ThinktankPanel.CurrentItem.ID` | セッション | 一覧に存在しない ID になりうる（getter で吸収） |
| `TTWorkoutPanel.Layout` | `TTWorkoutPanel` | BSP ペインツリー | Add/Remove/Move/Swap Area | `WorkoutArea` 描画、ペイン移動アクション | `WorkoutPanel.Panes.Layout`（JSON 文字列） | セッション（が設定ドキュメントに混入） | ランタイム状態が設定に混在（D-12d）、復元時に削除済み ID 参照 |
| `TTWorkoutPanel.FocusedAreaId` | `TTWorkoutPanel` | フォーカス中ペイン | `FocusArea` / クリック | 多数のアクション、`FocusedPane.*` getter | `WorkoutPanel.FocusedPane.ID`（isConst） | セッション | — |
| `TTApplicationStatus.ExMode` | `TTApplicationStatus` | 一時ショートカットモード | `SetExMode`（アクション）、`ClearExMode`（keyup） | `TTShortcutManager._rebuildActiveTable` | 非永続 | モディファイア押下中 | keyup 取りこぼし時に `blur` で解除（対処済み） |
| `TTApplicationStatus.SyncState` | `TTApplicationStatus` | 同期インジケータ | Electron 同期、`unhandledrejection` | ステータスバー | 非永続 | セッション | 'error' から回復せず、通常保存で 'synced' にならない（D-9） |
| `TextEditorSettings.*`（Minimap, WordWrap, 色設定 等） | `TTWorkoutPanel.TextEditor` | エディタ表示設定 | 設定パネル、ショートカット（ExOpt）、DataGrid 編集 | 全エディタペイン | `localStorage['tt-ui-state-v4']` + `__tt_ui_state__` Think | 永続 | Undo 対象。全ペイン共通（ペイン別設定は不可） |
| `localStorage['tt-layout-mode']` | localStorage 直 | Normal/Simple レイアウト | `Application.PanelDisplay.Mode` set、`seedMobileDisplayDefaults` | `App.tsx`、`TTUIStateManager` getValues、複数箇所で直読み | localStorage | 永続 | PROP_SPECS 外の直読みが分散（D-12c）、センチネル値 `'sipoc'` |
| `AIChatProvider` / `AIChatModel` | 各パネル VM | AI モデル選択 | モデルセレクタ | `ChatApiService.streamChat` | `localStorage['tt-ai-model-*']`（パネル別） | 永続 | PROP_SPECS 外、Undo 対象外、パネルごとに別キー |

### 主要な状態遷移

**ExMode**:
```
None ──(Alt+A / Alt+O / Alt+T 等のキー → ExMode:X アクション)──> ExApp / ExOpt / ExDate ...
  │                                                                    │
  │<──(モディファイアキー keyup、または window blur、または ExMode:None)──┘
```
`SetExMode(name, modKey)` で `_exModeModKey` に押下中モディファイアを記録。`_rebuildActiveTable` がそのモディファイアを各ショートカットキーに自動付加。

**Think の保存状態（現状）**:
```
clean ──(編集)──> dirty ──(3秒デバウンス or Ctrl+S or メディア切替)──> [SaveContent]
                    │                                                     │
                    │                                              成功 ──┴──> clean（markSaved）
                    │                                              失敗 ──────> dirty のまま（再試行スケジュールなし）
                    │
                    └──(ウィンドウ終了)──> ★データ損失（確認なし）
```

**Think の保存状態（F0-1 / F1-2 適用後の推奨）**:
```
clean ─編集─> dirty ─debounce─> saving ─成功─> saved ─(次の編集)─> dirty
                                   │
                                   └─失敗─> failed ─(5s/15s/60s バックオフ or online イベント)─> saving
dirty/failed + ウィンドウ終了 ─> beforeunload で確認ダイアログ
```

**アプリ起動フロー**:
```
main.tsx: seedMobileDisplayDefaults() / applyAppZoom()（描画前）
  → App.tsx useEffect:
     TTApplication.Instance 生成（→ TTModels.Instance → Vault.LoadCache() 発火）
     TTUIStateManager.init(app)（localStorage から即時復元）
     TTShortcutManager.init(app)
     registerFocusedPanelActions(app)
     Promise.all([UIState.ensureThinkExists, Shortcut.ensureThinkExists])（DefaultShortcut.md / Status-Action-Binding.md を ?raw から適用）
       → iPhone なら Simple モード + WordWrap 強制
     グローバルリスナー登録（keydown capture / click / wheel / focusin / blur / unhandledrejection）
  → Vault データ到着 → NotifyUpdated → 各パネル再レンダリング
```

---

*本レビューは静的コード読解と型チェックに基づく。実行時挙動（同時編集の実際の競合、IME 環境での発火、各プラットフォームでの動作差）は未検証であり、「確信度: Medium」以下の指摘は実機確認を推奨する。*
