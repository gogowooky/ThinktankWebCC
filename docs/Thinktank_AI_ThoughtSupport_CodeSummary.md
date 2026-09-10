# AIChat思考支援：実装コードの読解サマリ（開発者向け）

作成日：2026-09-09
基準コミット：`677c0ee`（feat: AIChat思考支援の基盤実装）
目的：別AIが導入した "思考支援" 機能について、実装ソースとドキュメント6本
（Operation / QuickManual / Implementation / EntryUser_Manual / Shortcut_Plan /
UI_Recommendations）を読み合わせて把握した内容を記録する。

---

## 1. 何が変わったか（概要）

これまで各パネルが個別に持っていた「TODOチャット」処理を廃止し、4パネル＋Workout Pane で
共通の1コンポーネント `SupportChat` に統一した。相談の分類・担当パネル・状態・管理情報の
記録をユーザーではなくAIが行い、アプリが検証して保存する。

フロント・サーバー双方の変更。反映には再ビルド＋サーバー再起動（Electron はメイン
プロセス再起動）が必要。

### 主な新規・変更ファイル

| 区分 | ファイル |
|---|---|
| 中核ロジック | `src/services/thoughtSupport.ts` |
| 副作用適用 | `src/services/thoughtSupportEffects.ts` |
| UI（4パネル＋Pane共通） | `src/components/ThoughtSupport/SupportChat.tsx` / `.css` |
| 相談を開く | `src/services/openSupportChat.ts` |
| 一覧・選択フック | `src/hooks/useSupportChats.ts` / `src/hooks/useSupportSelection.ts` |
| タイトル解析 | `src/utils/managedChat.ts` |
| C#互換メタデータ封筒 | `src/services/storage/localMetadata.ts` |
| Bundle分析表示 | `src/components/OverviewPanel/BundleStatusView.tsx` |
| 各パネル結線 | `ThinktankArea.tsx` / `OverviewArea.tsx` / `ReThinkArea.tsx` / `WorkoutPanel.tsx` / `media/ChatMedia.tsx` |
| サーバー | `server/routes/chatRoutes.ts` / `server/services/ChatService.ts` / `server/services/geminiParts.ts` / `server/config/aiModels.ts` |
| Electron 保存 | `electron/vaultSave.cjs` / `electron/main.cjs` |
| モデル設定 | `src/services/aiModels.ts` |
| テスト | `src/services/thoughtSupport.test.ts` / `src/services/storage/thoughtSupportStorage.test.ts` / `src/components/ThoughtSupport/SupportChat.test.tsx` / `server/services/geminiParts.test.ts` / `src/services/aiModels.test.ts` / `src/components/ThinktankPanel/AiChatView.test.tsx` |

---

## 2. データ構造

### 2.1 管理Chatのタイトル（`utils/managedChat.ts`）

```
{種類}:{担当パネル}｜[{状態}]{相談名}
例: PROJ:Overview｜[進行中]交流会の準備
```

- 種類：`TODO`（個別作業）/ `PROJ`（複数課題）/ `ASK`（相談）/ `EVNT`（単発予定）/ `LOOP`（繰り返し）
- 担当：`Thinktank` / `Overview` / `Workout` / `ReThink`
- 状態：`未着手 / 進行中 / 待機 / 保留 / 完了 / 中止`（`MANAGED_STATES`）
- 区切りは全角 `｜` または半角 `|`、大文字小文字・旧小文字表記も許容
- 状態のない旧タイトルは `state: '状態未設定'` を返し、推測して補わない

### 2.2 管理情報レコード `Metadata.thoughtSupport`（`SupportRecord`）

これが管理情報の正本。回覧板Memoは必須にしない。主なフィールド：

- 目的系：`goal` / `completion`
- 進行系：`current` / `next` / `resume`(再開メモ) / `waiting` / `remaining`
- 判断系：`decisions` / `undecided` / `proposals`
- 関係：`bundleId` / `parentId` / `dependencies[]` / `loopId` / `occurrence` / `references[]`
- 繰り返し：`repeatRule` / `checklist`
- 日時：`due` / `scheduled` / `startsAt` / `endsAt` / `reviewAt` / `redisplayAt`
- 監査：`version` / `updatedAt`（要約更新）/ `confirmedAt`・`confirmationQuote`（本人確認）/ `handoff`
- 内部：`messages[]`（正確な会話復元用）/ `history[]`（変更前スナップショット）

---

## 3. AIとのやりとり（`SupportChat.tsx` + `SUPPORT_POLICY`）

- アプリ専用JSON契約でAIが応答：
  `{ reply, readIds, search, operation:{kind,panel,state,title,record}, evidence, createBundle, linkIds, children[], artifact }`
- リクエストに `thoughtSupport: true` を付与（`ChatApiService.streamChat` → `chatRoutes` →
  `streamChatResponse`）。サーバーは思考支援時に
  - thinktank 設定プロンプトを連結しない（`systemPrompt` のみ）
  - Gemini の `functionDeclarations`（旧BigQuery直書きツール）を渡さない
- Anthropic / OpenAI / Gemini に同一契約。
- 読み取り→書き込みループ最大5周：`search` / `readIds`（1応答あたり最大8件）で必要な記録だけ
  取得してから `operation` を出す。全Vault本文の一括送信はしない。
  - カタログは最大120件の `{id,title,type,updatedAt}` のみ、`totalAvailable` で件数
  - `search` は `StorageManager.search`（全文）＋タイトル/キーワード一致、参照範囲内に限定
  - `readIds` は `allowed` マップ（対象Chat＋参照範囲＋`references`＋発言内 `[chat:ID]`）内のみ、
    本文は先頭16000文字
- 説明の長さ（`短く、一つずつ` / `標準` / `詳しく`）を localStorage 保持し `userPreference` で渡す。

---

## 4. 保存前の検証（`planSupportUpdate`）

モデルに触れる前に実行。AI応答は version も timestamp も権威として扱わない。

| 検証 | 内容 |
|---|---|
| enum | `kind` / `panel` / `state` の値チェック。`kind` と `panel` は同時指定必須 |
| テキスト長 | 各テキスト項目 12000 文字以下 |
| 参照配列 | `references` / `dependencies` は文字列配列・100件以下・重複除去 |
| 日時 | ISO 形式・実在する暦日・`Date.parse` 有限。`startsAt ≤ endsAt` |
| 根拠引用ゲート | `decisions` 変更または `完了`/`中止` への遷移は `evidence` にユーザー当該発言の部分文字列（2文字以上、または全文一致）が必須 |
| 終了時 | `remaining` の記録が必須（なければ「なし」） |
| 担当変更 | 既存の `panel` と異なる変更は `handoff` の記録が必須 |
| 採番 | `version = old.version + 1`。`evidence` 成立時のみ `confirmedAt` / `confirmationQuote` を更新。実質変更があるときのみ `updatedAt` を更新 |

検証失敗時は会話だけ保存し、その応答の管理変更・副作用は一切適用しない
（SupportChat 側で `planSupportUpdate` を try し、失敗なら `finalAnswer = { reply }` に落とす）。

---

## 5. 保存の安全性（`saveSupportTurn`）

- ユーザー入力は外部モデル呼び出しの前に保存（`retry.current` に設定してから即実行）
- 相談ごとのインプロセスロック `locks: Set<think.ID>`
- 楽観的排他：`think.Content === expectedContent && old.version === expectedVersion` を
  満たさなければ拒否（「相談が別の場所で更新されました」）
- `operationId` 一致が `history` にあれば no-op（冪等リトライ）
- 保存失敗時は `Content` / `Metadata` をロールバック
- 毎ターン `history` にスナップショット（`operationId` / `at` / 旧タイトル / 旧レコード）を追記
- 会話は「読めるChat本文（`serializeChat`）」と「`Metadata` の `messages` 配列」の両方に保存。
  `supportMessages()` は本文と再直列化結果が一致する場合のみ配列を採用し、TextEditor で
  本文編集された場合は本文（`loadChatFromThink`）を優先

---

## 6. 副作用の適用（`thoughtSupportEffects.ts`）

`createBundle` / `children` / `artifact` / `linkIds` の実行：

- ID は `support-{SHA-256(sourceId:key)}`（`effectId`）で決定的 → リトライで重複作成しない
- 永続ジャーナル `Metadata.supportPendingEffects`（`{answer, sources, operationId}`）を
  応答と同一書き込みで保存。SupportChat の「保存を再試行」で `applySupportEffects` を再開、
  「関連ファイルの作成を中断…」で `supportCancelledEffects` へ退避して打ち切り（作成済みは残す）
- 複数ファイルを単一トランザクションにしない。作れたものは残し、残りの登録を完了させる方式
- `children`：`{kind}:Workout｜[未着手]{title}` の chat を作成し、`parentId` / `loopId`
  （`occurrence` がある場合）/ `occurrence` / `references=[source]` を `saveSupportTurn` で設定
- `artifact`：`memo` / `table` / `html` / `links` を作成し `Metadata.supportSource`
  （`chatId` / `chatVersion` / `operationId` / `generatedAt` / 参照資料の `id`+`updatedAt`）を付与 → 鮮度追跡
- 最後に source の `references` へ作成物IDを追記、`supportPendingEffects` を削除
- `linkIds` があるのに登録先 Bundle がなければエラー（「相談でBundleを作成してください」）

### 取り消し（`undoSupportChange`）

「直前の管理変更を戻す」＝`history` を逆順に辿り、タイトルかテキスト項目が現在と異なる
最初のスナップショットへ `title` と `record` を戻す。会話・作成済み資料は削除しない。
保存中・`supportPendingEffects` 残存中は不可。

---

## 7. 担当引き継ぎ（handoff）の挙動

AIが `operation.panel` でタイトルの担当を書き換えても、会話は現在表示中のパネルに
とどまる（`useSupportChats` が `t.ID === selectedId` の相談を一覧から落とさない）。
`SupportChat` は「担当を〜に引き継ぎました。このまま相談を続けられます。」を表示し、
次ターンの system prompt に新担当の `ROLE_POLICY[owner]` を渡す。ユーザーの画面移動・
タグ編集は不要。ユーザー自身が別パネルや Bundle分析「この相談を続ける」から開くことも可能。

---

## 8. パネル別の参照範囲（`useSupportChats`）

| パネル | 一覧・参照範囲 |
|---|---|
| Thinktank | 全Vault の Thinktank 担当管理Chat＋Pane 以外で開始された未分類Chat（`Metadata.supportOrigin` が設定済みかつ `'Pane'` 以外）。どのパネルで話し始めても分類前の相談は Thinktank に集まる。AIカタログは `__` 始まり以外の全Think |
| Overview | 設定 Bundle 内 Chat のみ（`GetThinksForBundleAsync`）。Bundle 未設定なら選択を促し全Vaultへ拡大しない |
| Workout | Bundle 内 Chat＋`bundleId` を持たない単独管理Chat |
| ReThink | Bundle ありならその範囲、なければ全 ReThink 担当管理Chat |

- 相談の `bundleId` はレコードに固定。画面で Bundle を切り替えても進行中の相談の
  所属・参照範囲は変えない（`capturedBundle` は最初の送信時に確定）
- ユーザー発言中の `[chat:ID]` は `allowed` への追加参照としてのみ扱い、Bundle 切り替えとはしない
- `bundleId` が付いた相談で送信すると Overview が自動でその Bundle を開く

---

## 9. Workout Chat Pane（自由対話）

`ChatMedia.tsx` が `SupportChat` を `pane` フラグ付きで描画。

- `operation` / `createBundle` / `linkIds` / `children` を禁止（`artifact` 作成のみ可）
- system prompt に「自由対話Pane。管理情報への反映は専用操作で本人が対象を選ぶ」を注入
- 「結果を相談につなぐ」（`reflect`）＝選んだ管理Chatに `references` へ当該Pane Chat ID を追加し、
  `undecided` に「個別相談の成果を確認する [chat:ID]（本人の決定としては未反映）」を追記するだけ。
  決定は登録しない。重複防止キー `pane-{think.ID}-{version}`

---

## 10. Bundle分析「この課題の状況」（`BundleStatusView`）

各管理Chatを `MANAGED_STATES`＋「状態未設定」で束ね、行ごとに
`goal / current / next / decisions / undecided / proposals / waiting / reviewAt`、
`isReviewDue` なら「再確認・再提示の時期です」、`confirmedAt` / `updatedAt` を表示。
［記録を開く］（`onOpen`）と［この相談を続ける］（`openSupportChat` で担当パネルの
AIChat を chat モードで開き `thinktank-support-open` イベントを発火）。

`isReviewDue`：`reviewAt` / `redisplayAt` のいずれかが現在時刻以下。SupportChat ヘッダーと、
Thinktank / ReThink の未選択時「再確認：…」リストにも使われる。

---

## 11. ストレージ対応

| 保存先 | 方式 |
|---|---|
| BigQuery | 既存 metadata 列＋更新日時競合検出 |
| Electron | metadata を保存・同期対象化。保存ロック＋更新日時照合＋一時ファイル置換（`electron/vaultSave.cjs`） |
| C# Local API | metadata 列がないため、本文先頭の予約コメント `<!-- thinktank-metadata-v1:{URLエンコードJSON} -->` に格納し、アプリ返却時に `unpackLocalMetadata` で分離。壊れた封筒は上書きせずエラー。プロセス間の原子性は保証しない |

`TTVault.LinkThinksToBundle`（新規 public）：重複ID をスキップし、保存失敗時に Bundle 本文を
ロールバック。`_linkThinkToBundle` は対象不在・本文未読込時に return ではなく throw する変更。

---

## 12. 付随変更（AIモデル）

- モデル設定を `server/config/aiModels.ts` / `src/services/aiModels.ts` に集約
- `resolveGeminiModel`：`gemini-2.5-flash`（および未指定）→ `gemini-3.5-flash` へ移行。
  未知IDは変更しない。`isAllowedAiModel` も解決後の値で照合
- `server/services/geminiParts.ts`：ストリームチャンクの `parts` から text / functionCall を
  収集し、`functionResponse`（call id 付き）を構築。複数パート・並列ツール呼び出しに対応
- `utils/thinkFormat.isTodoChatThink`：旧文字列プレフィックス一致から
  `parseManagedChatTitle` ＋ prefix 由来の担当名照合に変更

---

## 13. テスト・限界

- 現ツリーで 18 テストファイル / 179 件パス、型検査・server ビルド成功
  （`Implementation.md` は執筆時点の 15 / 170 と記載）
- テストは模擬AI応答。実サービスAIが自然な会話から常に適切に分類・確認・引き継ぎする
  保証はない。運用開始時は小さな実例で説明の長さ・確認頻度を調整する
- 主なテスト観点：共通解析、担当変更後の継続と役割切替、参照範囲固定、Pane の管理変更拒否、
  根拠のない完了・決定変更の拒否、並行更新の拒否、保存失敗ロールバック、operation 重複排除、
  多行メッセージの正確復元、Bundle / 各回作成のリトライで重複を作らないこと、
  C#互換メタデータの本文非露出と再オープン後の古い保存拒否

### 未実装（提案・将来）

- アプリ終了中の通知、無人での LOOP 各回自動生成、外部予約・送信
- HTML からのアプリ状態変更（現状は閲覧専用）
- ショートカット追加（`Thinktank_AI_Shortcut_Plan.md` は提案のみ。`AiChatView` の Enter
  判定に IME 変換中の分岐がない点も要対応と明記）
- `Thinktank_AI_UI_Recommendations.md` の各案（文字付き送信ボタン、相談名中心の現在地表示、
  保存状態・下書き表示、次の一手の常時表示、反映プレビュー等）

---

## 関連資料

- [運用仕様案](Thinktank_AI_ThoughtSupport_Operation.md)
- [実装内容と確認方法](Thinktank_AI_ThoughtSupport_Implementation.md)
- [簡易ユーザーマニュアル](Thinktank_AI_ThoughtSupport_QuickManual.md) / [かんたんマニュアル](Thinktank_AI_ThoughtSupport_Manual_Simple.md)
- [はじめてのThinktank](Thinktank_AI_EntryUser_Manual.md)
- [推奨ショートカット](Thinktank_AI_Shortcut_Plan.md) / [追加UI案](Thinktank_AI_UI_Recommendations.md)
