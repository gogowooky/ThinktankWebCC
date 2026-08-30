# レビュー対応 完了記録 — Phase 1・2（テスト / Lint / CI 基盤）

**対象**: `PROJECT_REVIEW_REPORT.md` の **D-6 / F1-6 / F1-7**（「テスト・Lint・CI がゼロ」への対応）
**実施日**: 2026-08-30
**ブランチ**: `TTWeb260526`
**状態**: 完了。CI 3 回連続 green（`19b70da` 時点で全ステップ通過）

> このドキュメントは「テスト/Lint/CI 基盤」だけの完了記録である。
> `PROJECT_REVIEW_REPORT.md` の Phase 0 ブロッカー（D-1〜D-5）や、
> Phase 1/2 に挙がっていた他項目（beforeunload、楽観ロック、FilterPanel 統合、
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

| ID | 概要 | 重要度 |
|---|---|---|
| D-1 | `beforeunload` 不在 + 保存失敗リトライなし → 未保存データ損失 | Critical |
| D-2 | BigQuery MERGE 無条件・バージョン照合なし → 複数端末の同時編集で無警告上書き | High |
| D-3 | AI ツールが Gemini 分岐のみ → 既定 `anthropic` で「AI が自動で Think 登録」が動かない | High |
| D-4 | `fetchUrlMeta` の SSRF（プライベート IP 帯ブロックなし） | High |
| D-5 | AI 書き込みが `SAFE_ID_RE` 検証を迂回、ID 形式が `parseBundle` と不整合 | High |

→ これらは新機能追加の前に着手することを引き続き推奨。テスト基盤ができたので、修正時の回帰は今なら検出できる（例: D-5 修正 → `thinkFormat.test.ts` を更新）。

### Phase 3（Lint 強化 — 急がない）

- recommended ルールの段階導入（`prefer-const` → `no-explicit-any` を warn 固定 → …）。
- `--fix` で自動修正できるもの（164 件）を一括適用してから警告を絞る。
- `reportUnusedDisableDirectives` を `off` → `warn` に戻す（recommended 導入と同時）。
- Monaco 用の拡張 interface を 1 本定義して `any` を集約（`TextEditorMedia.tsx` の 27 件が主対象）。
- `ConfigKey` の `| string` を `ConfigKey | (string & {})` にして typo を型で検出。

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
