# AIハーネス実装計画（project × AIWork）

状態: §5 は推奨案で確定（2026-11-22）。Phase 0〜3 実装済み（2026-11-22、仕様は `docs/261030/projectファイル仕様.md` §6）。
Phase 4 以降は未実装。Phase 1・2 の受け入れ試験のうち、実機（実際の AI CLI）での確認はまだ。
Phase 3 の「道具」の検査は、CLI のバージョン変化ではなくログインの有無を見る（実際に起きた故障に合わせた）。
Phase 2 の承認は AIChat の提案の一覧に置いたボタンで行う（新しい入力フォームは作らない）。
参照: 記事「自分の代わりに動くAgentへ。Claude CodeとCodexで作る自律改善ハーネス」
（https://zenn.dev/nttdata_tech/articles/9562962cc181a1 、2026-11-19 公開）と、ChatGPTとの壁打ち（2026-11-21〜22）。

## 0. 目的と方針

- 目的: 一度伝えた方針・決定・訂正を、翌日に別の chat・別の AI CLI から仕事を再開しても引き継げるようにする。
  記事の芯である「プロンプトを磨くより、置き場（構造）を作る」をThinktankで実現する。
- 新しいファイル種別は作らない。**project＝タスクの定義**、**chat＝会話の原本**、**AIWork（旧AIView）＝記録・文脈の置き場**で表す。
- 結果が決まる処理（参照の解決、文字数、更新の有無、関連付け）はアプリが行い、AIには判断と文章だけを任せる（記事の script-first）。
- 記録を書くのは1人だけ。担当（ワーカー）のAIは記録を書かない。
- 画面（`src/`）にオーケストレーションを置き、PC版（IPC）・Web版（PC連携の中継）・ローカル運用モードのどれでも同じ動きにする。
  既存の `src/services/projectSummary.ts` と同じ配置。

## 1. 用語の対応

| 記事 | Thinktank | 備考 |
|---|---|---|
| タスク（TASK.md） | project（`# 見通し` がタスク・アクション等） | 状態は `# 状態`（既存の候補） |
| セッション | chat ファイル | 1つの project に複数の chat をひも付ける（`# AI議論`） |
| AIの1回の応答 | 実行（AI CLI の1回の呼び出し） | Thinktank の CLI 呼び出しは非対話の1回きり（codex exec 型） |
| 規約（AGENTS.master.md） | project の規約欄（親から子へ適用） | §3.2 |
| 台帳（registry/workspaces.yaml） | project の一覧・検索、`# 条件`・`# 対象`、親子関係 | 恒久的な作業フォルダは持たない |
| 作業場所（Work/） | 実行ごとの一時ディレクトリ（既存の `createRunSandboxDir`） | 次回も使う成果物は Think として保存し、`# 対象` から辿れるようにする |
| log.md | `# log` の AIWork | 経緯（何をした・何を決めた・なぜ） |
| STATUS.md | `# status` の AIWork | 現在地（1画面） |
| DECISIONS.md | `# decision` の AIWork | 現在有効な決定の一覧。載っていない決定は「未決」 |
| BOARD.md / board.jsonl | `# board` の AIWork | 担当別の進捗・報告・検証状態 |
| PROFILE.md / INDEX.md / inbox/INBOX.md | `# PROFILE` / `# INDEX` / `# INBOX` の AIWork | root project（タイトル「Thinktank」）に置き、全 project が継承 |
| projects/・styles/・knowledge/ | `# projects` / `# styles` / `# knowledge` の AIWork | 複数可（CSV） |
| agents/*.md（役割） | 役割 project（`# 状態` = `ツール`） | §3.7 |
| hooks（SessionStart / Stop / SessionEnd） | アプリの実行前処理／実行後チェック／chat の関連付け | CLI 自体の hooks 機能は使わない（§3.4） |
| harness-doctor・診断レポート | アプリ内の点検処理と、`# doctor` の AIWork | §3.8 |
| Git の履歴・差分 | AIWork のスナップショットと版比較 | 実行PCごとの Git は不要（§3.3） |

## 2. projectファイルへの追加項目

既存の書式（`docs/261030/projectファイル仕様.md`）に、次の見出しを加える。値は AIWork の参照タグ。

```
# 規約
（このprojectと配下に適用する働き方。自由記述）
# log
[aiwork:ID]
# status
[aiwork:ID]
# decision
[aiwork:ID]
# board
[aiwork:ID]
# PROFILE
[aiwork:ID]
# INDEX
[aiwork:ID]
# INBOX
[aiwork:ID]
# projects
[aiwork:ID],[aiwork:ID]
# styles
[aiwork:ID],[aiwork:ID]
# knowledge
[aiwork:ID],[aiwork:ID]
```

| 見出し | 件数 | 主に置く project | 子での扱い |
|---|---|---|---|
| `# 規約` | 自由記述 | どこでも | 親→子の順に連結して適用（子が後＝優先） |
| `# log` / `# status` / `# decision` / `# board` | 1 | タスクの project | 継承しない（project 固有） |
| `# PROFILE` / `# INDEX` / `# INBOX` | 1 | root | 子に無ければ最も近い祖先のものを使う |
| `# projects` / `# styles` / `# knowledge` | 複数 | どこでも | 祖先から子までの和集合。ただしAIに渡すのは INDEX で選んだものだけ（§3.2） |
| `# doctor` | 1 | root のみ | 診断レポート（§3.8） |

- 読み書きは `src/utils/thinkFormat.ts` の project 領域に集約する（`parseProject` に役割別の ID を加える）。
- これらの参照も `parseProject().ids` に含め、親project の記録（`parentProjectid`）の対象にする。`# 対象` へは重複させない。
- 項目が無い project は従来どおり動く（全項目任意）。

## 3. 設計

### 3.1 AIWork（旧 AIView）

- 画面上の呼び名を AIWork にする。保存データの ContentType は `aiview` のまま変えない（既存ファイルの変換なし）。
- 参照タグは新規に `[aiwork:ID]` を書き、`[aiview:ID]` も同じものとして読む（互換は削除しない）。
- 従来の AIView（`# AIまとめ` の要約）はそのまま残す。`# AIまとめ` も AIWork の一用途として扱う。
- AIWork は利用者が直接編集しない（現状どおり読み取り専用）。変更は AI の書き込みか、承認した提案の適用で行う。
- 役割ごとの書式（`src/utils/aiViewFormat.ts` を拡張）:

| 役割 | 書き方 | 次の実行で AI に渡す範囲 |
|---|---|---|
| log | 追記式。「# [yyyy-MM-dd HH:mm] 実行の要約」＋モデル名＋本文（観点・判断と理由・エラーと対処）。末尾にアプリが「関連chat・変更したThink」を付ける | 直近の数件。それより古いものは必要なときにAIが MCP で読む |
| status | 置き換え式。フェーズ・直近の成果・未了・次の行動・期限 | 全文 |
| decision | 置き換え式。決定ごとに「決定・理由・根拠（chat／発言）・日付」 | 全文 |
| board | 置き換え式。ゴール・完了条件と、行ごとに「ID・状態・担当（役割project）・作業・報告・根拠・検証」 | 全文（チーム実行時） |
| PROFILE / INDEX | 置き換え式 | 常に全文 |
| projects / styles / knowledge | 置き換え式 | INDEX で選ばれたものだけ |
| INBOX | 置き換え式。項目ごとに出典（元のメール・スレッドの参照）を必須にする | 受信整理の依頼のときだけ |

### 3.2 実行前の文脈組み立て（記事の SessionStart）

AIに依頼する前に、アプリが対象 project から次の順で組み立てる（記事の「常に読むもの」と階層化）。

1. 規約: root から対象 project までの `# 規約` を親→子の順に連結。
2. PROFILE・INDEX: 最も近い祖先のもの（それぞれ全文）。
3. 対象 project の status・decision（全文）と log の直近数件。
4. 対象 project の `# 条件`・`# 対象`（既存の要約処理と同じ集め方）。
5. projects / styles / knowledge のうち、INDEX の記載と依頼の種類から選んだもの。
   最初はアプリの規則で選ぶ（対象 project 自身の `# projects`／`# styles` は常に含める。knowledge は INDEX から AI が MCP で読む）。
6. 書き込みの指示（どの AIWork を、どの書式で更新するか）と、書き込んでよい AIWork の ID 一覧。

- 依頼文の作成は `buildProjectSummaryMessage` と同じ形で、新しい `src/services/harness/` に置く。
- 文字数: 1ファイル・全体の上限は既存の要約処理に合わせ、超えた分は省略したと明記する。

### 3.3 AIWork の版と差分（Git の代わり）

- AI またはアプリが AIWork を書き換える直前に、その AIWork のスナップショットを自動で作る（前回のスナップショットから変わっていないときは作らない）。
  既存の `StorageManager.createSnapshot`（Firestore・ローカル運用モードの両方）を使う。
- AIWork の画面に「版の比較」を加える。スナップショット（と現在の内容）から2つを選び、既存の `src/utils/lineDiff.ts` で差分を表示する。
  「この版に戻す」は、戻す前の内容をスナップショットに残してから行う。
- 保持数は AIWork 1件あたり上限を設け（例: 50世代）、古いものから消す。手動のスナップショット（カメラボタン）は消さない。
  （Phase 0 では未実装。特定のスナップショットを消す API が無いため、Phase 1 以降で追加する）

### 3.4 実行後チェック（記事の Stop）と chat の関連付け（記事の SessionEnd）

- 実行後チェック（アプリが判定）:
  - log に今回の実行の記録（実行IDまたは日時のタイトル行）が先頭に加わったか。
  - status が更新されたか（決定・未了に変化があった実行の場合）。
  - 書き込みが許可した AIWork 以外に及んでいないか。
- 足りなければ、一度だけ同じ chat で追加の依頼を出す。依頼文には「何を書けば終われるか」のチェックリストを入れる
  （例:「log に今回の判断と理由を追記」「status の次の行動を更新」「決定があれば decision に追加」）。
- 2回目も足りなければ、それ以上は求めない。アプリが AI の回答から最小限の log を追記し、画面に「記録が不完全」と表示する
  （既存の要約処理の「アプリが追記した」と同じ扱い）。
- chat の関連付け: その chat が対象 project の `# AI議論` に無ければ加え、chat の metadata（`taskContext.bundleId`）にも project ID を記録する。
  要約を書き損ねても、元の会話へ辿れるようにするため。

### 3.5 書き込みの制限（記録を書くのは1人だけ）

- 1回の実行で書き込んでよい AIWork を、アプリが ID で指定する。MCP サーバーへ環境変数（例: `THINKTANK_WRITABLE_IDS`）で渡し、
  `thinktank_update_think` はそれ以外への書き込みを拒否する（`electron/aiCliRunner.cjs` の `prepareSandboxMcpConfig`・`electron/mcpServer.cjs`）。
  記事では規約上の約束だったところを、Thinktank では仕組みで守る。
- まとめ役の実行だけが log・status・decision・board を書ける。担当の実行は書き込み不可（回答で結果を返すだけ）。
- PROFILE・INDEX・projects・styles・knowledge・規約は、AI からは直接書かせない（§3.6 の提案と承認を通す）。
- 同じ AIWork を複数の画面・実行から同時に書くときは、既存の楽観ロック（`expectedVersion`）で衝突を検出し、読み直して再試行する。

### 3.6 訂正の振り分け（提案と承認）

AI は回答に「訂正の提案」を付けられる。アプリは提案を一覧にし、利用者が承認したものだけを適用する。

| 訂正の種類 | 行き先 |
|---|---|
| どの作業にも共通する好み | PROFILE |
| 特定の業務のやり方 | styles（該当がなければ新しい AIWork を作る提案） |
| project の現況 | projects |
| 繰り返し出る技術の罠・手順 | knowledge |
| 働き方のルール | 該当 project の `# 規約` |

- 提案の形式（`shared/contracts/` に追加）: 種類・行き先の AIWork ID（新規なら名前）・変更前・変更後・本人の発言（引用）・理由。
  本人の発言は今回の依頼文に含まれることを検査する（既存の `validateProgressProposals` と同じ考え方）。
- 承認すると、アプリが行き先を更新し、最後に必ず INDEX を更新する（記事の「連鎖は INDEX で終わらせる」）。
  INDEX の更新内容（項目の追加・更新日）もアプリが決める。
- 「今回だけ」の指示は提案にしない。log に残すだけにする（依頼文で AI に区別させる）。
- 失敗から足したルールも規約の既定値に入れる:
  - 見出しだけで要対応と判断しない（INBOX の項目は出典と照合した根拠を必須にする）。
  - 日付で一律に退避しない（退避するのは終わった経緯だけ）。

### 3.7 役割とチーム（共有ボード）

- 役割は project で定義する: タイトル＝役割名、`# 状態` = `ツール`、`# 規約` に担う仕事と返す内容、`# 条件` に AI CLI・モデル。
  記事の初期セット（読む・探す／調べる／下書き／確かめる／仕分ける／批評する）を雛形として用意する。
- チーム実行の流れ（アプリが進行役を担う）:
  1. まとめ役の実行が、ゴール・完了条件と分担（行ごとの役割 project・作業）を構造化した回答で返す。
  2. アプリが board に行を作り、担当の実行を起動する（既存の同時実行数の制限 `setMaxConcurrentCliProcesses` を使う）。
  3. 担当の回答（報告と根拠）を、アプリがその行に書く（担当自身は書かない）。
  4. まとめ役の検証の実行が、根拠を確かめた行を verified にし、log・status を書く。
- 人に戻す場面は4つ（破壊的な操作・外部への送信・範囲の変更・価値判断が必要な完了判定）。該当する行は blocked にして通知し、
  ほかの行は進める。
- board が「委譲の記録」（記事の delegations.jsonl）を兼ねる。行ごとに実行ID・役割・モデル・開始と終了を残す。

### 3.8 点検（harness-doctor）

- アプリ内の点検処理。常駐はせず、起動時（またはその日の最初の実行時）に前回の点検日を見て、7日を過ぎていれば実行する。
- 結果は root の `# doctor` の AIWork に書く（実行ごとに先頭へ追記。版はスナップショットで残る）。報告だけで、直さない。
- 最初の検査項目:

| 区分 | 検査 |
|---|---|
| 参照 | project の各項目の ID が存在し、AIWork（aiview）であるか |
| 字数 | PROFILE・INDEX 3,000字、projects 5,000字、styles・knowledge 3,000字、INBOX 10,000字 |
| INDEX | INDEX に載っているのに無い AIWork／ある AIWork が INDEX に無い（両方向） |
| 鮮度 | `# 状態` が進行中の project で status が7日以上未更新。projects が30日以上未更新 |
| 原本 | `# AI議論` と chat の `taskContext` の食い違い（両方向） |
| INBOX | 出典の無い項目 |
| 道具 | AI CLI のバージョンが前回の点検から変わった |

- 冒頭に「検査しないもの」（内容どうしの矛盾、PROFILE が本人の考えに合っているか等）を書く。clean は「検査の範囲で異常なし」の意味。
- 検査項目は、実際に起きた故障を足していく（記事の方針）。

### 3.9 記事の残りの記録の扱い

| 記事の記録 | Thinktank での扱い |
|---|---|
| TASK.md の `touched`・`outputs` | MCP サーバーが実行ごとに書き換え・作成した Think を数え、アプリが log の記録の末尾に「変更したThink」「作成したThink」として付ける。作成した Think は従来どおり `# 対象` に載る |
| TASK.md の `sessions` | `# AI議論` の chat 一覧（§3.4） |
| sessions.jsonl | chat ファイルそのもの＋`# AI議論`＋chat の `taskContext`。所在を別の台帳に書かない |
| delegations.jsonl | board の行（§3.7） |
| journal/INDEX.md | project の一覧・検索（既存の Think一覧と状態・見通しフィルター）。ファイルとしては作らない |
| daily（日次はポインタのみ） | 保存しない。その日に更新された log の記録を集めて表示する「日次一覧」をアプリが作る（必要になったら AIWork に書き出す） |
| weekly（週報の自動下書き） | 週次の改善ループの project が、1週間分の log から下書きを作り、その project の log に残す（§4 Phase 5） |
| registry/ の機能トグル | 設定画面の項目にする（ハーネス機能の ON/OFF、点検の間隔など） |
| 観測コピー（出典＋ハッシュ） | `# 対象` の外部資料を AI に渡すとき、出典と内容のハッシュを log の記録に残す（既存の ConversationSource の `contentHash` と同じ方式）。書き戻しはしない |

## 4. 進め方（段階）

記事13章の「始めの3つ」と、合意した優先順位（訂正の置き場を先に、週次の改善は後）に沿う。各段階は「実証済み」を完了とする
（検知の仕組みは、実際に故障を起こして検知できるまで確かめる）。

### Phase 0: 置き場をつくる
- `parseProject`／書き出しに §2 の項目を追加。`[aiwork:ID]` の読み書きと `[aiview:ID]` 互換。
- 項目に AIWork が無いとき、アプリが作って参照を加える処理（既存の `addAiViewIdToHead` と同じ方式）。
- AIWork の書き換え前の自動スナップショットと、版の比較・戻す UI（§3.3）。
- 画面の呼称を AIWork に（`AiPanels`・リボン・ツールチップ）。
- `docs/261030/projectファイル仕様.md` の更新。
- 完了の確認: 既存の project が変わらず読めること、項目の追加と削除で他の項目が壊れないこと（テスト）。

### Phase 1: 一件の project を翌日に再開できる（13章の①②）
- AIChat サブパネル（現在は仮置き）を、ロード中の project を対象にした対話として実装する。
- 実行前の文脈組み立て（§3.2）、書き込みの制限（§3.5）、実行後チェック（§3.4）、chat の関連付け。
- MCP の変更: 書き込み許可 ID の制限、実行ごとの変更・作成 Think の記録。
- 完了の確認（受け入れ試験）:
  1. ある project で方針を一つ決め、chat に元の発言、log に判断理由、decision に決定、status に残作業が残る。
  2. 翌日、別の chat から同じ project で「続きから」と依頼する。
  3. 別の AI CLI でも、規約・決定・残作業を正しく読み、「なぜその方針か」と聞くと元の発言（chat）を示せる。
  4. log の書き込みを意図的に妨げると、一度だけ追加の依頼が出て、それでも書かれなければ「記録が不完全」と表示される。

### Phase 2: 訂正を次回の前提に変える（13章の③）
- PROFILE・INDEX・INBOX を root に用意（雛形つき）。
- 訂正の提案の形式・検証・承認 UI・適用と INDEX 更新（§3.6）。
- 字数の上限を表示し、超えそうなときは分割を提案させる。
- 完了の確認: 「今後は○○して」と伝えると提案が出て、承認後に別の chat で守られる。「今日だけ」は提案にならない。

### Phase 3: 点検（harness-doctor）
- §3.8 の検査と `# doctor` への報告、起動時の周期実行。
- 完了の確認: 各検査について、故障を作って検出されることを確かめる（参照切れ・字数超過・INDEX のずれ・status の放置・chat の関連付け漏れ）。

### Phase 4: 役割とチーム
- 役割 project の雛形、チーム実行（§3.7）、board の表示、人に戻す場面の通知。
- 完了の確認: 「朝のまとめ」相当の依頼で、担当が並行して動き、検証済みの行だけが確定し、価値判断の行で止まって待つ。

### Phase 5: 週次の改善ループ
- 週次の改善 project（harness-review を先、skill-mining は後）。1週間分の log・chat・`# doctor` を読み、
  根拠の project ID 付きで改善案を出す。採用・見送りとその理由を log に残す（見送った判断も残す）。
- 日次一覧・週報の下書き（§3.9）。
- 完了の確認: 同じ指示を3回以上していると、styles への追加が提案される。見送った案は次回に同じ提案をしない。

## 5. 決めておきたいこと（推奨案つき）

| 論点 | 推奨 | 他の案 |
|---|---|---|
| 規約を書く見出し | 新しく `# 規約` を設ける。既存の3つの把握用プロンプトは要約専用のまま | 既存のプロンプト見出しに書く |
| 参照タグ名 | 新規は `[aiwork:ID]`、`[aiview:ID]` も読む | `[aiview:ID]` のまま |
| PROFILE・INDEX・INBOX の置き場 | root（タイトル「Thinktank」）の project に置き、全体で継承 | project ごとに置く |
| decision への書き込み | まとめ役が自動で書く（本人の発言を根拠に付ける）。取り消しは版の比較から戻す | 提案と承認を通す |
| ハーネス機能の既定 | 設定で ON にした project だけ（`# log` 等の項目がある project） | 全 project で常に有効 |

### 5.1 運用の流れで決めたこと（2026-11-22）

新しい入力フォームは作らず、既存の UI（projectファイルの TextEditor、Think一覧の状態アイコンとフィルター、Seeds、AIView・AIChat サブパネル、chat）で運用する。

| 場面 | 決定 |
|---|---|
| 立ち上げ・詳細の入力 | projectファイルを作って Seeds にロードし、`# 対象`（ドロップ）・`# 規約`（目的・ゴール・完了条件）・`# 条件`（AI CLI・モデル・Skill・MCP）を本文に書く。ハーネスの AIWork は起動時にアプリが作る |
| ループの起動 | `# 状態` を「進行中」にして保存する、または project にひも付く chat（AIChat）で「始めて」と送る。どちらでも起動する。一時停止は「保留」、やめるときは「中止」 |
| 中間状態 | 進行中＝AI が作業中、待機＝利用者の返答待ち。AIView に status、AIChat に AI の質問と返答、詳細は `[aiwork:ID]` から log・decision・board を開く |
| 待機の知らせ方 | Think一覧の状態アイコンだけにする（OS の通知は出さない） |
| 完了 | AI は完了条件を満たしたら「待機」にして、chat で完了してよいかを要約つきで確認する。利用者が承認したら「完了」にする |

## 6. 影響範囲（見込み）

- `src/utils/thinkFormat.ts`・`src/utils/aiViewFormat.ts`（書式）
- `src/services/harness/`（新規: 文脈組み立て・実行後チェック・訂正の提案・点検・チーム進行）
- `src/components/AiPanels/`（AIWork の呼称、AIChat の実装、版の比較、提案の承認）
- `shared/contracts/`（訂正の提案・board の行・実行の記録の型と検証）→ 変更後は `node scripts/build-electron-shared.mjs`
- `shared/mcpProtocol.ts`・`electron/mcpServer.cjs`・`electron/aiCliRunner.cjs`（書き込み許可 ID、変更 Think の記録）→ Electron 再起動が必要
- `docs/261030/projectファイル仕様.md`（項目の追記）
- 新しい HTTP サーバーは作らない。Web版は既存の PC連携の中継（`ai.conversation`）を使う。
