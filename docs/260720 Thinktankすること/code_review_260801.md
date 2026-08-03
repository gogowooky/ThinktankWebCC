# Thinktank コードレビュー

**実施日**: 2026-08-01
**対象**: ブランチ `TTWeb260526` / v4.0.0 — src 20k行・server 1.7k行・electron 240行

全体としてサーバー層は堅実。BigQuery は全クエリ・パラメータ化済み、エクスポートのパストラバーサル検証あり、ストレージ backend のエラー処理も適切、サービスアカウント鍵は gitignore/dockerignore 済み。一方で **公開デプロイ経路とレンダリング層に重大なリスクが集中**している。

---

## 🔴 Critical

### C-1. 本番デプロイが「認証なしで全 API 公開」になる構成

`deploy.ps1` と `package.json` の `deploy` スクリプトは `--allow-unauthenticated` でデプロイするが、`--set-env-vars` を一切指定していない。一方 `server/middleware/apiAuth.ts:28` は:

```ts
if (!SHARED_SECRET) { next(); return; }   // 未設定なら認証を素通し
```

`API_SHARED_SECRET` は `.env.example` で空、`server/loadEnv.ts` 自身が「Cloud Run では server/.env は含まれない」と明記している。つまり **Cloud Run 側で手動設定しない限り、デフォルトで全 `/api/*` が無認証公開**される。露出するもの:

- `/api/bq/files` — Vault 全件の読み取り・書き込み・削除
- `/api/chat/messages` — ANTHROPIC/GEMINI/OPENAI キーの第三者利用（課金直撃）
- `/api/drive/upload` — 自分の Drive への任意ファイル投入
- `/api/system/open` — 後述（C-2）

「未設定時はスキップ」はフェイルオープン。**フェイルクローズに反転**する。

```ts
// 本番（Cloud Run = K_SERVICE 存在）では未設定なら起動を中止
if (!SHARED_SECRET && process.env['K_SERVICE']) {
  throw new Error('[apiAuth] API_SHARED_SECRET is required in Cloud Run');
}
```

併せて deploy スクリプトに `--set-env-vars API_SHARED_SECRET=...` を追加するか、Secret Manager 参照 (`--set-secrets`) に切り替える。

### C-2. `/api/system/open` — 任意パスの起動エンドポイント

`server/routes/systemRoutes.ts:47-77` は受け取った文字列を検証せずに OS のシェル起動に渡す。

```ts
const [cmd, args] = platform === 'win32'
  ? ['cmd', ['/c', 'start', '', filePath]]   // filePath は無検証
```

2点ある。

1. **設計上、任意の実行ファイルが起動できる。** `C:\...\evil.exe` や UNC パス `\\attacker\share\payload.exe` を渡せばそのまま実行される。C-1 と組み合わさると無認証 RCE。
2. **コメントのインジェクション対策の主張が Windows 分岐では成立しない。** 「execFile + 引数配列でコマンドインジェクションを防ぐ」とあるが、起動対象が `cmd.exe` 自身で `/c` を渡す場合、Node が引数をクォートしても cmd.exe が再パースする。Node の cmd メタ文字エスケープ（CVE-2024-27980 対応）は解決先が `.bat`/`.cmd` の時のみ適用され、`cmd` 直接起動には効かない。`"` を含むペイロードで `&` 等の注入余地が残る。

**対策**:
- この API は Electron ローカル用途なので、そもそも Cloud Run 向けサーバーに載せない（`app.use` を Electron モード限定にする）
- 許可ディレクトリ配下のホワイトリスト + 拡張子ブロックリスト（`.exe/.bat/.cmd/.ps1/.scr` 等）を必須化
- Windows 分岐を `cmd /c start` ではなく `explorer.exe <path>` かネイティブ shell.openPath 相当に置換

### C-3. Markdown レンダリングの XSS（コメントの前提が誤り）

`src/components/WorkoutPanel/media/MarkdownMedia.tsx:102`:

```tsx
// biome-ignore lint/security/noDangerouslySetInnerHtml: marked でサニタイズ済み
dangerouslySetInnerHTML={{ __html: html }}
```

**marked はサニタイザではない。** `sanitize` オプションは v5 で削除済みで、v18 の `parse()` は生 HTML をそのまま通す。抑制コメントの根拠が事実と異なる。

到達経路も実在する。`nettext` は型定義上「ネット等からダウンロードしたテキスト」（`src/types/index.ts:29`）で、`MarkdownMedia.tsx:73` が nettext を明示的に扱っている。**外部由来テキストが無害化なしで innerHTML に流れる。**

さらに linkRenderer（`MarkdownMedia.tsx:20-25`）が `href` と `title` を未エスケープで文字列連結しており、`javascript:` スキームと `title="..."` からの属性ブレイクアウトも通る。

被害が大きい理由は Electron 側。`electron/preload.cjs` が `electronAPI.storage` を全公開しているため、XSS 成立時に Vault の全読み取り・上書き・削除ができ、さらに `syncFromServer(任意URL)` で**攻撃者サーバーの内容をローカル Vault に書き込ませられる**（`electron/main.cjs` の `storage:syncFromServer` は URL を検証せず、取得結果を `fs.writeFileSync` する）。

加えて **CSP が本番に存在しない**。`electron/main.cjs` の CSP 設定は `if (isDev)` ブロック内だけで、パッケージ版には一切適用されない。`index.html` にも meta CSP がない。開発時だけ緩い CSP があり本番は無防備、という逆転状態。

**対策**:

```bash
npm i dompurify @types/dompurify
```

- `md.parse()` の結果を `DOMPurify.sanitize()` に通す
- linkRenderer では href をスキーム検証（`http:`/`https:`/`mailto:` のみ）＋属性値を HTML エスケープ
- CSP は `isDev` の外に出し、本番は `default-src 'self'` ベースに
- `syncFromServer` は main プロセス側で許可オリジンを検証

---

## 🟠 Major

### M-1. SSRF — AI ツール `fetchUrlContent`

`server/services/ChatService.ts:113-136` の `fetchUrlMeta` はプロトコルが http/https かのみ確認し、宛先ホストを制限しない。Cloud Run 上では `http://169.254.169.254/computeMetadata/v1/...` や VPC 内部エンドポイントに到達する。戻り値が `<title>`/description 抽出のみなのでトークン直接漏洩の可能性は低いが、**内部ネットワークの到達性確認・ポートスキャンの踏み台**になる。しかも URL を決めるのは LLM で、LLM は取得したページ本文（＝外部入力）の影響を受ける。

**対策**: 名前解決後の IP がプライベート/リンクローカル/ループバック帯なら拒否、リダイレクト追跡は `redirect: 'manual'` で止めて再検証。

### M-2. AI プロバイダ間の機能が非対称（既定プロバイダでツールが動かない）

`server/services/ChatService.ts` の 7 つのツール（saveThink / saveBundle / saveTable / updateBundle / searchVault / getThink / fetchUrlContent）は **Gemini 分岐にしか実装されていない**。Anthropic・OpenAI 分岐は素のテキストストリームのみ。ところが既定は `AI_PROVIDER=anthropic`（`server/.env.example`）。

つまり**既定構成では「AIが自動でThinkを登録する」中核機能が丸ごと無効**で、UI からは区別がつかない。「AIとの対話で思考を補完する」というアプリの中心価値に直結する不整合。

加えて `streamChatResponse(messages, systemPrompt, res, provider?, model?)` の第4・第5引数は `server/routes/chatRoutes.ts:59` から渡されておらず、実質デッドパラメータ。

**対策**: ツール定義をプロバイダ非依存の中間表現に切り出し、各 SDK 形式へのアダプタ（Anthropic `tools` / OpenAI `tools`）を実装。当面対応しないなら、非対応プロバイダ選択時に UI で明示する。

### M-3. 入力検証がレイヤー間で不整合 — LLM 経由の書き込みが検証を迂回

`server/routes/bigqueryRoutes.ts:51` は `SAFE_ID_RE` で `id`/`contentType` を厳格検証する。しかし `server/services/ChatService.ts:149-160` の `saveThink` は:

```ts
const id       = String(args['id']       ?? '');
const category = String(args['category'] ?? 'memo');
await bigqueryService.save({ file_id: id, category, ... });  // 検証なし
```

**同じテーブルに、検証を通らない ID/category が入り得る。** 結果として export 時に「不正 ID」として無言でスキップされ（`bigqueryRoutes.ts:172`）、ユーザーにはデータ欠落として現れる。`category` も型 `ContentType` の 6 値に制約されず任意文字列が入る。

**対策**: 検証はルート層ではなく `BigQueryService.save()` に置く。書き込み口が2つある以上、共通の最下層で守るのが正解。

### M-4. 初期バンドル 1.65MB / 総計 3.9MB、コード分割がほぼ皆無

```
index-6jxVDcMt.js           1,647KB   ← 初期ロード
react-force-graph-*.js      1,796KB   ← 動的import済み(GraphMedia) ✓
xlsx-*.js                     429KB   ← 動的import済み(WorkoutPanel) ✓
index-*.css                    80KB
```

force-graph と xlsx は動的 import されていて適切（`GraphMedia.tsx:27`, `WorkoutPanel.tsx:472`）。問題は残る 1.65MB で、**`React.lazy` / `Suspense` の使用箇所がゼロ**。Monaco Editor 一式と highlight.js の全言語定義が初期チャンクに同梱されている。

**対策**:
- `TextEditorMedia`（Monaco）・`DataGridMedia`・`CardMedia` を `React.lazy` 化 — メディアは排他表示なので効果が大きい
- highlight.js を全言語 import から必要言語のみの登録に変更（数百KB規模）
- `vite.config.ts` に `build.rollupOptions.output.manualChunks` で vendor 分離

### M-5. コンポーネントの完全コピー — ThinktankPanel ↔ OverviewPanel

diff で実測した結果:

| ファイル対 | 行数 | 差分行 |
|---|---|---|
| `ThinktankFilterPanel.tsx` ↔ `OverviewFilterPanel.tsx` | 196 | **9**（名前・CSS import・displayName のみ） |
| `ThinktankFilterPanel.css` ↔ `OverviewFilterPanel.css` | 219 | **2** |
| `ThinktankSearchBar.tsx` ↔ `OverviewSearchBar.tsx` | 125 | 19 |

FilterPanel は Props 定義・状態・JSX・ロジックすべてが同一で、実質バイト単位のコピー。しかも**両 CSS が同じ `.unified-filter-*` クラスをグローバルスコープに二重定義**しており、片方の修正がもう片方に漏れる（読み込み順で後勝ちする）状態。クラス名が既に `unified-` を名乗っている以上、共通化が当初の意図だったはず。

**対策**: `src/components/common/FilterPanel/` に1つへ統合。CSS も1ファイルに。ref 型は `FilterPanelRef` に一本化。それだけで約 400行 + CSS 219行が消える。

### M-6. 再レンダリングの粒度がパネル単位

`src/hooks/useAppUpdate.ts` は購読オブジェクトの `NotifyUpdated()` で無条件に `dispatch` する。`TTThink.SaveContent` は保存のたびに `this._parent.NotifyUpdated()` を呼ぶため、**Think 1件の保存で Vault 購読者（ThinktankArea / OverviewArea / WorkoutArea 全体）が丸ごと再レンダリング**される。仮想スクロールを入れている（`ThoughtsList.tsx:159`）努力が、上位の全再描画で相殺されている。

また購読キーが `Math.random()` 生成で、デバッグ時にどのコンポーネントの購読か追跡できない。`useId()` に置き換えるか、変更キーを絞った選択的購読（`useSyncExternalStore` + セレクタ）への移行を推奨。

---

## 🟡 Minor

### m-1. 型安全性

- `any` / `as any` / `@ts-ignore` が **95箇所**。集中しているのは `TextEditorMedia.tsx`（22）、`TTUIStateManager.ts`（10）、`textEditorFoldingActions.ts`（9）。Monaco の内部 API 依存が主因なので、`monaco.editor.IStandaloneCodeEditor` の拡張 interface を1つ定義すれば大半が解消する。
- **`ConfigKey` の union が実質無効**（`TTUIStateManager.ts:118`）。末尾の `| string` により約90個の文字列リテラルが型チェックされていない。動的キーが必要なら `ConfigKey | (string & {})` にすると補完を保ちつつ拡張できる。
- 同一概念の型が不一致: `ItemMeta.metadata` は `Record<string, any>`、`FileRecord.metadata` は `Record<string, unknown>`（`types/index.ts:64,71`）。`FileRecord extends ItemMeta` なので後者の宣言は前者を上書きしており、意図が曖昧。

### m-2. テスト・Lint が皆無

テストファイル 0、`eslint`/`biome`/`prettier` の設定ファイル 0。にもかかわらずコード中に `biome-ignore` コメントが存在する（`MarkdownMedia.tsx:101`）。**この抑制コメントが誰にも検証されないまま C-3 の誤った前提を固定化した**のは象徴的。せめて `thinkFormat.ts` / `tableFormat.ts` / `dateUtils.ts` / `applyFilter` といった純粋関数群には vitest を入れる価値がある（ロジック密度が高く、テストが容易）。

### m-3. パッケージ版 Electron で検索タグ機能が動作しない見込み

`src/views/actions/textEditorCursorContentActions.ts:27` は相対 URL `fetch('/api/system/search-tags')` を使う。パッケージ版は `loadFile()` で `file://` オリジンなので `file:///api/...` に解決され失敗する。`server/routes/systemRoutes.ts` のコメントは「パッケージ版Electronでも動くように」認証前へ移したと説明しているが、**認証の問題ではなくプロトコルの問題なので解決していない**。エラーは catch されユーザーに通知されるため実害は機能欠落のみだが、コメントの前提は誤り。

### m-4. 陳腐化したコメント・ドキュメント

- `electron/main.cjs` の CSP コメントが「Monaco は CDN から取得する」と述べているが、`monacoSetup.ts:25` が `loader.config({ monaco })` でローカルバンドル済み。CSP の `https://cdn.jsdelivr.net` 許可は不要で、削るべき攻撃面。
- `CLAUDE.md` が参照する `docs/requirements.md` と `docs/concept.md` は **どちらも存在しない**（docs/ 配下は別名のファイル群）。

### m-5. その他

- `console.*` が src 内 40箇所、本番ビルドでもそのまま出力される。Vault の内容やエラー詳細が DevTools に残る。
- `bigqueryRoutes.ts:44` の `exportStatus` はモジュールスコープの可変グローバル。Cloud Run の複数インスタンスでは進捗が取得元インスタンスに依存し、正しく返らない。
- `MarkdownMedia.tsx:80-88` の `handleScroll` はモデルオブジェクト（`think.Metadata`）を React 管理外で直接変更している。動くが、状態の所在が二重化しており将来の並行レンダリングで問題化し得る。

---

## 推奨対応順

| # | 対応 | 効果 | 規模 |
|---|---|---|---|
| 1 | `apiAuth` をフェイルクローズ化 + deploy に secret 設定 | C-1 解消、C-2 の露出を封鎖 | 小 |
| 2 | `/api/system/open` を Electron 限定 + パス許可リスト | C-2 解消 | 小 |
| 3 | DOMPurify 導入 + linkRenderer エスケープ + 本番 CSP | C-3 解消 | 小 |
| 4 | `BigQueryService.save()` に ID/category 検証を集約 | M-3 解消 | 小 |
| 5 | `fetchUrlMeta` に IP 帯域ブロック | M-1 解消 | 小 |
| 6 | FilterPanel/SearchBar を common に統合 | M-5、約600行削減 | 中 |
| 7 | メディア群を `React.lazy` 化 + highlight.js 絞り込み | M-4、初期バンドル大幅減 | 中 |
| 8 | ツール定義のプロバイダ非依存化 | M-2 解消 | 大 |

1〜5 はいずれも局所的な変更で、**半日程度で Critical 3件と Major 2件が片付く**。ここから着手することを推奨。
