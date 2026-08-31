# レビュー対応 完了記録 — Phase 1・2・3（テスト / Lint / CI 基盤）

**対象**: `PROJECT_REVIEW_REPORT.md` の **D-6 / D-8 / F1-6 / F1-7**（「テスト・Lint・CI がゼロ」＋ 型の緩さ）
**実施日**: 2026-08-30（Phase 1・2）／ 2026-08-31（Phase 3）
**ブランチ**: `TTWeb260526`
**状態**: 完了。CI green 継続。

> このドキュメントは「テスト/Lint/CI 基盤」だけの完了記録である。
> `PROJECT_REVIEW_REPORT.md` の Phase 0 ブロッカー（D-1〜D-5）や、
> レビュー §F の他項目（beforeunload、楽観ロック、FilterPanel 統合、
> React.lazy 化 等）は**未着手**。§E を参照。

---

## A. 実施サマリー

### Phase 1 — Vitest + 純粋関数の単体テスト

| 追加 | 内容 |
|---|---|
| 依存 | `vitest` 4 / `@vitest/coverage-v8` / `jsdom` |
| 設定 | `vite.config.ts` に `test` ブロック。テスト時は `server/.env` を読み込まないガード |
| スクリプト | `npm run typecheck` / `test` / `test:watch` / `test:coverage` |
| テスト | 5 ファイル・**59 ケース** |

テスト対象（いずれも「壊れると静かにデータ・表示が破損する純粋関数」）:

| ファイル | 検証 |
|---|---|
| `src/utils/markdownSanitize.test.ts` | `<script>` / `onerror` / `<iframe>` / `javascript:` / `data:` の無害化、正当リンクの `target=_blank rel=noopener` 付与 |
| `src/utils/thinkFormat.test.ts` | `parseBundle` / `parseChat` / `parseLinks` / `splitContent` の serialize↔parse 往復。**D-5（サフィックス付き ID がキーワード扱いになる不整合）を "現状の挙動" として固定** |
| `src/utils/keyboardUtils.test.ts` | `normalizeKeyStr` / `parseMultiKey` / `keyEventToStr` |
| `src/utils/dateUtils.test.ts` | `parseRange` / `formatDateRangeJapanese`（日付シフト経路は TZ 依存のため対象外） |
| `src/views/TTWorkoutPanel.test.ts` | BSP ペインツリー関数 `addToFocused` / `removeLeaf` / `swapLeafs` / `collectAreaIds` |

### Phase 2 — ESLint 最小構成

「recommended セット」は既存コードに 5,700 件超の指摘（`no-undef` 3,112、`any` 1,050、全角スペース等）を出すため**採用せず**、バグに直結するルールだけを error にした。

| ルール | レベル | 目的 |
|---|---|---|
| `@typescript-eslint/no-floating-promises` | **error** | 保存 Promise の `await`/`catch` 漏れ（未保存データ損失）の静的検出 |
| `react-hooks/rules-of-hooks` | **error** | 条件付き Hook 呼び出し（クラッシュ） |
| `react-hooks/exhaustive-deps` | warn | 依存配列漏れ（既存 16 件・ブロックしない） |

`no-floating-promises` の既存違反 **25 件を修正**（挙動不変）:

- クライアント側 20 ファイル → `void` 付与。「この Promise は投げっぱなしで正しく、失敗は `src/App.tsx` の `unhandledrejection` ハンドラー（`SyncState='error'`）が受ける」という既存の設計意図を明示するもの。ランタイム挙動は変わらない。
- `server/index.ts` の `start()` → `.catch` + `process.exitCode = 1`（起動失敗を拾う実質改善）
- `ThinktankPanel` の同期後 `RefreshAll()` → `return` で外側の `.catch` に接続
- `MarkdownMedia.tsx` の死んでいた `biome-ignore` コメント → 説明コメントに置換

### CI（`.github/workflows/ci.yml`）

```
push / pull_request
  → actions/checkout@v5
  → actions/setup-node@v5 (Node 22, npm キャッシュ)
  → npm ci
  → npm run typecheck   (tsc: フロント + サーバー両方)
  → npm run lint        (eslint . — error のみ失敗、warning は許容)
  → npm run test        (vitest run — 59 件)
  → npm run build       (tsc + vite build)
```

Node 22 の理由: `electron@42` / `vitest@4` / `jsdom` が Node 22.12+ を要求。本番サーバー（`dist-server`）は Dockerfile の `node:20` で動くが、型チェックはコードを実行しないので影響なし。

### Phase 3 — ESLint を recommended 土台へ / ConfigKey の補完 / disable 検出の復帰（2026-08-31）

Phase 2 は「recommended セット不採用・error 2 本だけ」だった。Phase 3 で `eslint` +
`typescript-eslint` の **recommended を土台に採用**し、既存コードに大量に出るものは warn に固定、
ノイズなし（自動修正済み・件数 0）のものを error に格上げした。

**ルール構成（`eslint.config.js`）**

| レベル | ルール | 状態 |
|---|---|---|
| **error** | `@typescript-eslint/no-floating-promises` | 既存 0（Phase 2 で25件修正済み） |
| **error** | `react-hooks/rules-of-hooks` | 既存 0 |
| **error** | `prefer-const` | 3件を `--fix` で修正 → 0 |
| **error** | `no-irregular-whitespace`（コメント/文字列/テンプレは除外） | BOM 正規表現1件を `﻿` エスケープに修正 → 0 |
| **error** | `@typescript-eslint/no-empty-object-type` | `interface Props {}` 1件を `Record<never,never>` に → 0 |
| **error** | recommended 由来で既存 0 のもの（`no-unreachable` / `no-unused-expressions` / `ban-ts-comment` / `no-require-imports` 等） | 新規混入のみ止める |
| warn | `@typescript-eslint/no-explicit-any`（111件） | 負債の可視化 |
| warn | `@typescript-eslint/no-unused-vars`（30件、`^_` は除外） | 一部は本物の dead code |
| warn | `no-useless-escape`（5件） | ESLint が誤修正リスクで自動修正しない仕様のため手動対応まで warn |
| warn | `no-useless-assignment`（1件） | |
| warn | `react-hooks/exhaustive-deps`（16件） | Phase 2 から不変 |

**`--fix` の副作用**: 実際には不要だった `// eslint-disable-line react-hooks/exhaustive-deps` を
4 箇所自動削除（依存配列は元々網羅されていた）。

**`ignores` に追加**: `.agent/**` `.claude/**`（過去セッションの git worktree。数千の
stale ファイルが lint 対象になっていた。recommended の巨大な違反数の正体はこれだった）。

**`reportUnusedDisableDirectives`**: `off` → **`warn` に復帰**。recommended を入れたことで
`no-explicit-any` 等の disable コメントが「使用中」になり、誤検出のノイズが消えたため。

**ConfigKey の `| string`（D-8 の一部）**

`src/views/TTUIStateManager.ts` の `ConfigKey` 末尾 `| string` → **`| (string & {})`** に変更。
- 効果: `applyProperty('...')` 等の呼び出しで**既知キー約70個の補完が効く**ようになった
  （`| string` だとリテラル union が string に潰れて補完ゼロだった）。
- `PROP_SPECS` の型注釈は `Record<ConfigKey, PropSpec>` → `Record<string, PropSpec>` に
  （`(string & {})` は文字列インデックス signature を与えないため）。
- **限界**: これは補完のための緩和であり、typo の**型レベル拒否はしない**。完全な typo 検出には
  `PROP_SPECS` を単一の真実として再構成し、リテラル union を実キーと同期させる必要がある（§E に残す）。

**ActionID**: `export type ActionID = string` のまま（`src/views/TTAction.ts` のコメントが
理由を明記: アクションは多数ファイルで動的登録されるため単一のリテラル一覧を持てない）。
実行時の `[未定義]` 表示が安全機構。将来 `DefaultShortcut.md` の action がすべて登録済みかを
検証するテストを足すのが実務的（§E）。

### 副産物として得た教訓

- **npm 11 / Windows の `npm install` は `package-lock.json` に推移依存を書き漏らすことがある**（初回 CI が `esbuild` 欠落で失敗）。`npm ci --dry-run` は同一プラットフォームでは検出できない。
  → **依存を追加したら `rm -rf node_modules package-lock.json && npm install` で作り直し、本物の `npm ci` で確認する。**
- 本番の初期バンドル `index.js` は約 5MB（gzip 1.4MB）。前回レビュー推定（1.65MB）より大きい。`React.lazy` 未使用（`PROJECT_REVIEW_REPORT.md` D-12f / E-10）。

---

## B. 今後の機能開発はどう変わるか（結論）

### これまで

- コードを変更 → 手元で（気が向けば）動作確認 → コミット → プッシュ。**機械的なゲートはゼロ。**
- パーサ・サニタイザ・キー正規化などの純粋関数の退行は、**偶然か、ユーザーが後で気づく**まで検出されない。
- 実際、前回レビューの XSS は「`marked` がサニタイズする」という**誤ったコメントが誰にも検証されないまま長期間固定化**されたのが原因。
- `build:server` を忘れると古いサーバーコードが動く（`CLAUDE.md` がわざわざ一節を割いて警告している）。
- `tsc` を手元で回さなければ、型エラーのある変更が `main` に入りうる。
- 新しい `SaveContent()` をエラー処理なしで書いても無言。実行時の unhandledrejection まで気づけない。

### 今

| 変化 | 具体的に何が起きるか |
|---|---|
| **プッシュのたびに 4 つのゲートが自動実行される** | typecheck ×2 / lint / テスト59件 / build。どれか壊れると GitHub 上に赤い ✗ と通知。「壊したかどうか」を、覚えていなくても客観的に知れる |
| **純粋関数の退行が即座に落ちる** | `parseBundle` / `renderMarkdown` / `normalizeKeyStr` / `computeDateRange` / BSP 関数を編集して挙動が変わると、該当テストが失敗して CI が赤くなる |
| **サニタイズ経路がロックされた** | `<script>` / `onerror` / `javascript:` 等を通してしまう変更は CI で必ず失敗する。前回の XSS 退行と同じ事故はもう起きない |
| **新しい握り漏れ Promise が build を止める** | 将来 `think.SaveContent()` を `void`/`.catch`/`await` なしで書くと `no-floating-promises` (error) で CI 失敗。マージできない |
| **条件付き Hook のバグが build を止める** | `react-hooks/rules-of-hooks` (error) |
| **`build:server` 忘れ級のバグが減る** | CI が `tsc -p server/tsconfig.json` を回すので、少なくともサーバー側の型崩れは検出される |
| **手元の検証ループができた** | `npm run typecheck && npm run lint && npm test` が（キャッシュ温間で）数秒。開発中は `npm run test:watch` |
| **リファクタリングが安全になった** | レビューが「テスト不足でリファクタしにくい」と指摘した層のうち、**純粋関数層（`utils/` / BSP / サニタイザ）は安全網ができた**。例: D-5（Bundle の ID 形式修正）は、現状の挙動を固定したテストがあるので、それを意図的に更新しながら直せる |
| **AI 支援開発（Vibe Coding）が意味のある形で安全になった** | レビュー E-13 の懸念（「AI が既存の仕組みを見落として別方式を追加」「誤ったコメントが検証されず固定化」）に対し、**AI の変更も同じ 4 ゲートを通る**。AI 自身が `npm test` を回して自己チェックもできる |

**要するに**: 変更が「本当に完了したか」の判定が、人間の記憶と目視だけに依存していた状態から、**プッシュすれば機械が最低限のチェックをする**状態になった。特に「一度直した安全対策（サニタイズ・保存の握り）を、後の変更が知らずに崩す」タイプの事故に強くなった。

---

## C. 変わっていないこと（スコープの正直な明示）

| 項目 | 状態 |
|---|---|
| **コンポーネント / UI ロジックのテスト** | ほぼゼロ。59 件は純粋関数 5 モジュールのみ。1,000 行級コンポーネント（`TextEditorMedia` / `DataGridMedia` / `WorkoutPanel`）、VM 層（`TTUIStateManager` / `TTShortcutManager` / 各パネル VM）、ストレージ backend、AI サービスは未カバー。ここの退行は依然として手動検出 |
| **Phase 0 ブロッカー（D-1〜D-5）** | 未対応。CI はこれらを守らない（設計上の欠落であって "退行" ではないため）。§E 参照 |
| **`no-explicit-any` / `no-unused-vars` 等のコード品質 Lint** | 未強制（Phase 3）。`any` 98 箇所はそのまま |
| **E2E / 統合テスト** | なし。「編集 → リロード → 内容が残る」等のシナリオは手動 |
| **`ConfigKey` / `ActionID` の `| string` 型無効化** | 未対応。typo したキー名は今も無言で no-op |
| **CI はアプリを実行しない** | build 成功 = アプリが動く、ではない。プレビューでの動作確認は引き続き手動 |
| **`void` = D-1 解決ではない** | 25 件の `void` は「握り漏れを明示した」だけ。保存失敗時のリトライ・ユーザー通知は D-1 / D-9 の課題のまま |

---

## D. 次の機能開発で守ること

`CLAUDE.md` / `PROJECT_REVIEW_REPORT.md` §H のガードレールに加えて:

1. **新しい純粋関数（`utils/` 等）を書いたら、隣に `*.test.ts` を追加する。** 既存の 5 ファイルがテンプレート。
2. **パーサ / サニタイザ / キー正規化を触るときは、既存テストが仕様書。** 挙動を変えるべきなら、テストを**意図的に**更新してから実装する。
3. **新しい非同期呼び出しは必ず Promise を処理する**（`await` / `void` / `.catch`）。しないと CI が落ちる。
4. **プッシュ前に手元で** `npm run typecheck && npm run lint && npm test`（数秒）。
5. **CI が赤いうちは「完了」ではない。** `git-update` でプッシュしたら GitHub の Actions タブを確認し、赤ければ直す。
6. **npm 依存を追加したら** `rm -rf node_modules package-lock.json && npm install` → `npm ci` で確認してからコミット（§A の教訓）。
7. **`react-hooks/exhaustive-deps` の warning を新規に増やさない**（既存 16 件は許容。将来 error 化する）。

---

## E. 残タスク

### Phase 0（機能追加前に対応すべきブロッカー — 未着手）

`PROJECT_REVIEW_REPORT.md` §D / §F の Phase 0:

| ID | 概要 | 重要度 | 状態 |
|---|---|---|---|
| D-1 | `beforeunload` 不在 → 未保存データ損失 | Critical | **一部対応（2026-08-31）**。下記参照 |
| D-2 | BigQuery MERGE 無条件・バージョン照合なし → 複数端末の同時編集で無警告上書き | High | 未対応 |
| D-3 | AI ツールが Gemini 分岐のみ → 既定 `anthropic` で「AI が自動で Think 登録」が動かない | High | 未対応（本番は `AI_PROVIDER=gemini` のため実害は限定的） |
| D-4 | `fetchUrlMeta` の SSRF（プライベート IP 帯ブロックなし） | High | 未対応 |
| D-5 | AI 書き込みが `SAFE_ID_RE` 検証を迂回、ID 形式が `parseBundle` と不整合 | High | 未対応 |

**D-1 一部対応（2026-08-31）— "無警告消失" を止めた**

- `src/utils/unsavedGuard.ts`（新規）: 開いている TextEditor ペインの「保留中の自動保存を即実行する」関数のレジストリ。
- `src/App.tsx`: `beforeunload` で `area.IsDirty` を確認し、未保存があればブラウザ標準の離脱確認で止める。
  `pagehide` / `visibilitychange:hidden` で保留中の自動保存（3秒デバウンス待ち）を先行フラッシュ。
  `window.__ttHasUnsavedChanges()` / `window.__ttFlushAllSaves()` を公開。
- `electron/main.cjs`: `win.on('close')` で上記 window 関数を `executeJavaScript` で呼び、未保存があれば
  「保存して終了 / 保存せず終了 / キャンセル」ダイアログを出す（Electron は browser の beforeunload だけでは
  ダイアログを出さないため）。
- `src/components/WorkoutPanel/media/TextEditorMedia.tsx`: 既存の autoSaveRef のフラッシュ関数を
  レジストリにも登録し、Promise を返すように変更（呼び出し側が完了を待てる）。
- 検証: `unsavedGuard.test.ts`（5件）+ 実ブラウザで「dirty → beforeunload が preventDefault」「clean → 素通し」を確認。

**未対応（D-1 の残り）**: 保存失敗時の指数バックオフ再試行・`online` イベントでのフラッシュ。
これは D-9（`SyncState` が error から回復しない）と一体で対応するのが素直。

→ D-2〜D-5 は新機能追加の前に着手することを引き続き推奨。テスト基盤ができたので、修正時の回帰は今なら検出できる（例: D-5 修正 → `thinkFormat.test.ts` を更新）。

### Lint 強化 — Phase 3 で対応済み / 残り

**対応済み（2026-08-31、§A 参照）**
- recommended（eslint + typescript-eslint）を土台に採用。error/warn を仕分け。
- `prefer-const` / `no-empty-object-type` / BOM 正規表現を修正して error 化。
- `reportUnusedDisableDirectives` を `warn` に復帰。
- `ConfigKey` の `| string` → `| (string & {})`（補完が効くように）。

**残り（急がない）**
- warn の削減: `no-explicit-any`（111）を段階的に減らして warn→error。
  Monaco 用の拡張 interface を 1 本定義すると `TextEditorMedia.tsx` の分がまとめて消える。
- `no-unused-vars`（30）を精査 — 一部は本物の dead code。
- `no-useless-escape`（5）の正規表現を手で潰して error 化。
- **D-8 の本丸**: `PROP_SPECS` を単一の真実に再構成し、`ConfigKey` のリテラル union を
  実キーと同期（今の union には廃止済みキーが約29個混じっている）。これで typo の型レベル拒否が可能に。
- `ActionID` の安全網: `DefaultShortcut.md` の全 action が `TTActions` に登録済みかを検証するテスト。

### テスト拡充（機能追加のたびに）

`PROJECT_REVIEW_REPORT.md` §G の 6〜16 番:
キーバインド解決（`TTShortcutManager`）、`_applyProp` の candidates 検証、`_applyContent` のマイグレーション regex、`tableFormat` 往復、`GetThinksForBundle` の循環参照、日付シフト（TZ 固定して）など。

---

## 付録: コミット履歴（このブランチ）

| commit | 内容 | copyright |
|---|---|---|
| `2cb35fc` | `PROJECT_REVIEW_REPORT.md` 追加（レビュー本体） | v1.4.38 |
| `d22d642` | Phase 1: Vitest + テスト59件 + CI | v1.4.38 |
| `0525c61` | CI 修正: `package-lock.json` 再生成 + Node 22 / actions v5 | v1.4.39 |
| `395fe1b` | Phase 2: ESLint 最小構成 + `no-floating-promises` 25件修正 | v1.4.40 |
| `ba2d797` | この完了記録を追加 | v1.4.41 |
| （本コミット） | Phase 3: ESLint recommended 土台化 + ConfigKey 補完 + `reportUnusedDisableDirectives` 復帰 | — |
