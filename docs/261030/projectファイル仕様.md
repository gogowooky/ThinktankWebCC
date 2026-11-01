# projectファイル仕様（project 種別Thinkファイル）

状態: 実装済み（2026-10-30）。読み書きは `src/utils/thinkFormat.ts` の project 領域
（`serializeProject` / `parseProject` / `updateProjectTargets`）に集約している。

## 1. 書式

```
プロジェクト名
=
# 見通し
テーマ
# 状態
未着手
# 対象
[memo:2026-10-30-120000]: 設計メモ
[gdrive:2026-10-30-120500]: 仕様書
https://example.com/
"C:\docs\plan.md"
[Google:検索語]
# 現状把握用プロンプト
（現状を把握するためのAIへの指示）
# 進捗把握用プロンプト
（進捗を把握するためのAIへの指示）
# 実績把握用プロンプト
（実績を把握するためのAIへの指示）
# 条件
（条件）
# AIまとめ
[aiview:2026-10-30-130000]
# AI議論
[chat:2026-10-30-140000]
```

| 行・見出し | 内容 |
|---|---|
| 1行目 | タイトル（読み取り時は先頭の `>` / `>>` を除く） |
| 2行目 | `=` |
| `# 見通し` | 見通しの値だけを1行。作成時は `未設定` |
| `# 状態` | 状態の値だけを1行（`状態値：` は付けない）。作成時は `未着手` |
| `# 対象` | 各種タグ・URL・パスを1行に1件 |
| `# 現状把握用プロンプト` / `# 進捗把握用プロンプト` / `# 実績把握用プロンプト` | AIへの指示を自由記述（`PROJECT_PROMPT_HEADINGS`） |
| `# 条件` | 自由記述 |
| `# AIまとめ` | `[aiview:{ID}]` を `,` 区切りで並べた CSV（1行に1つでもよい）。先頭の CSV の先頭が要約の書き込み先（§5） |
| `# AI議論` | 1行に1つの `[chat:{ID}]` |

- 各項目の値は、見出し（`# 対象` など）の直後の行から、次の見出し・その項目の最初の空行・文書末のいずれか早い位置まで。
- 空行は現在の項目値だけを終了する。その後の通常行は自由記載として解析せず、後続のProject見出し（`# 状態`、`# 対象` 等）から項目の解析を再開する。
- したがって、文書先頭や項目間に空行があっても、その後の `# 対象` 等は有効なProject項目として読み取る。

## 2. `# 見通し` と `# 状態` の値

どちらも見出しの次の行に、下の候補のいずれか1つを値だけで書く。候補は `src/utils/thinkFormat.ts` に
定数として置いている。

| 見出し | 候補（定数） | 作成時 |
|---|---|---|
| `# 見通し` | `ビジョン`・`エリア`・`テーマ`・`タスク`・`アクション`・`未設定`（`PROJECT_OUTLOOKS`） | `未設定` |
| `# 状態` | `未着手`・`進行中`・`待機`・`保留`・`完了`・`中止`・`不明`・`ツール`（`PROJECT_STATES`） | `未着手` |

- `# 状態` に以前の `状態値：…` 形式（2026-10-30 まで）は使わない。`# 見通し` の自由記述も同日で廃止。
  既存ファイルは変換しない（`状態値：` 付きは読み取り時に外して同じ値として扱う）。
- Thinktank / Seeds の「Think一覧」は、種別フィルターが project だけのとき、種別の下に「状態」「見通し」の
  フィルターを出してこの2つの値で絞り込む（`readProjectStatus`・`useProjectStatusFilter`）。
  見出しが無い・候補外の値は、見通しは `未設定`、状態は `不明` として扱う。状態の `完了`・`中止` は既定で隠す。

| 状態 | アイコン | 見通し | アイコン |
|---|---|---|---|
| 未着手 | circle | ビジョン | telescope |
| 進行中 | circle-play | エリア | globe |
| 待機 | circle-pause | テーマ | house |
| 保留 | circle-minus | タスク | package |
| 完了 | circle-check | アクション | clapperboard |
| 中止 | circle-x | 未設定 | dot |
| 不明 | circle-dashed | | |
| ツール | pocket-knife | | |

## 3. `# 対象`

- 見出し直後の1行目に `*` だけを書くと、その projectファイルは Vault の全ファイルを対象とする（`targetsAllThinks`）。Thinktank / Seeds の Think一覧はロード中の project の配下として全ファイルを出す。
  `*` は Think 参照ではないので `parentProjectid` は付かない。# 対象 を書き直しても `*` は1行目に残る。
  配下の project が `*` のときも、それを含む project の対象は全ファイルになる。
- Thinkファイルは `[種別:ID]: タイトル`（タイトルは省略可）。種別はThinkのContentType。
- linkファイルは `[link:ID]`。リンク先に応じた `[gmail:ID]` `[gdrive:ID]` `[gphoto:ID]` `[gnb:ID]` `[path:ID]`
  も書ける（docs/261030/linkファイル仕様.md）。`[links:ID]` は廃止。
- URL・パス・検索タグ（`[Google:語]` 等）のようにThink参照でない行もそのまま並べられる。
- Seedsへのドロップ等で対象を更新すると、Think参照の行だけを書き直し、それ以外の行は残す。
  既存の `[gdrive:ID]` 等の詳しいLinkタグ名は書き直しでも保つ。新しく載せる linkファイルは `[link:ID]`。
- `# AIまとめ` / `# AI議論` に載っているThinkは `# 対象` へ重複させない。
- Seeds>Think一覧は、Seedsに設定された projectファイルの `# 対象` に直接記載されたファイルだけを表示する。
  子projectファイル自身は表示するが、その子projectの `# 対象` は再帰展開しない。`# AIまとめ` / `# AI議論` の参照も表示対象に含めない。
- Workingで新しいThinkファイルを作成したときは、Seedsに設定中の projectファイルの `# 対象` へそのThink参照を追加する。Seedsのprojectが未設定の場合は追加しない。

## 4. 参照の読み取り

- `parseProject().ids` は各Project項目の値範囲に書かれたThink参照すべて（Projectへの所属判定に使う）。
  `aiSummaryIds` / `aiDiscussionIds` は `# AIまとめ` / `# AI議論` の参照だけ。
- 本文中の `[aiview:ID]` と、値がThinkIDの `[chat:ID]` は、DoOnCursorPos でそのThinkを開く。
  値がIDでない `[chat:語]` は従来どおりchat検索。

### root（タイトル「Thinktank」の projectファイル）

Thinktank>プロジェクトの「root」で開く（無ければ作る）projectファイル（`ROOT_PROJECT_TITLE`）。
Thinktank パネルにだけ設定でき、Seeds には設定しない（Think一覧から開く・ドロップ・Status 等、どの経路でも無視する）。

### 親projectの記録（`metadata.parentProjectid`）

projectファイルに組み込まれた Think の metadata に、親となる projectファイルの ID を `parentProjectid`（string）として記録する
（`src/models/TTVault.ts` の `SyncParentProjectIds`）。組み込み＝各Project項目の値範囲で参照されること（`parseProject().ids`）。

- 最初に組み込んだ projectファイルを親として保つ。参照している Think のうち、親の記録が無いもの
  （記録先の projectファイルが Vault に無くなったものを含む）にだけ、その projectファイルの ID を記録する。
  別の projectファイルに組み込んでも、記録済みの親は置き換えない。
- 参照が外れたとき、記録がその projectファイルのときだけ消す。projectファイルを削除したときも同様。
  消えた後は、その Think を参照している別の projectファイルが次に保存されたときに、そちらが親になる。
- 契機: projectファイルの保存（本文の手編集・Seedsへのドロップ・除外・Think の追加）、projectファイルの作成、
  AI CLI（MCP）からの更新。保存前の構成が分からない場合（本文未取得のまま更新を受けた等）は、付けるだけで消さない。
- 記録の失敗は projectファイルの保存を失敗にしない（警告ログのみ）。
- 既存の組み込みには一括では付けない。各 projectファイルが次に保存されたとき、親の記録が無い参照先に付く。

## 5. AIView サブパネルの要約（AIViewファイル）

各パネルの AIView サブパネルは、ロード中の projectファイルの要約を AIViewファイル（ContentType `aiview`）として表示する
（`src/components/AiPanels/AiPanels.tsx`・`src/services/projectSummary.ts`）。

- リボンは左端に cpu-ai のボタン、右端に表示形式アイコン（TextEditor のみ）。表示は TextEditor だけ。
- ロード中の projectファイル: Thinktank・Seeds はそれぞれのプロジェクトサブパネルにロードしたもの。
  両パネルの設定は独立し、どちらかで登録を解除してももう一方の設定は維持する。
  Working・Harvest は自前で持たないので Seeds のものを使う。

| パネル | ボタン | 使うプロンプト | AI に渡すもの |
|---|---|---|---|
| Thinktank / Seeds | 現状要約 | `# 現状把握用プロンプト` | 全対象ファイルの現時点の内容 |
| Working | 進捗要約 | `# 進捗把握用プロンプト` | 全対象ファイルと、各ファイルの最新の snapshot との差分 |
| Harvest | 実績要約 | `# 実績把握用プロンプト` | 全対象ファイルと、各ファイルの最古の snapshot との差分 |

- どれも projectファイルのタイトル・`# 見通し`・`# 状態`・`# 条件` も渡す。
- 全対象ファイル: `GetThinksForProjectAsync` の結果（配下の project を何段でもたどる。`*` なら全ファイル）から、
  この projectファイル自身の `# AIまとめ`・`# AI議論` に載っているものを除いたもの。
  `*` で全ファイルを対象にしているとき（配下の project が `*` の場合も）は、どの projectファイルにも名指しされていない
  ファイルを、1か月以内に更新されたものに限る。
- snapshot は `users/{uid}/vaults/{vaultId}/thinks/{thinkid}/snapshots/` の文書（`listSnapshots`）。今は `current` の1件だけなので
  最新と最古は同じになる。snapshot が無いファイルは「比較できない」と添えて現在の内容を渡す。差分の無いファイルは名前だけを渡す。
- AI に渡す文字数は1ファイル 6,000 字・全体 200,000 字まで。超えた分は省略したと書いて渡す。
- AI は既存の AI CLI 呼び出し（PC版は IPC、Web版は PC連携の中継の `ai.conversation`）。

### 書き込み先と書き込み方

- `# AIまとめ` の見出し直後にある先頭の CSV の、先頭のタグの AIViewファイルに追記する（`firstAiViewId`）。
- 読み取れない（タグが無い・Vault に無い・aiview でない）ときは、AI に依頼する前にアプリが AIViewファイル（タイトル行だけ）を作り、
  そのタグを先頭の CSV の先頭に加える（`addAiViewIdToHead`。`# AIまとめ` が無ければ `# AI議論` の前に見出しごと加える）。
  MCP の `thinktank_create_think` で作ると `# 対象` に載ってしまうため、ここだけはアプリが行う。
- 要約の書き込みは AI CLI が MCP で行う。依頼文で、`thinktank_get_record` で AIViewファイルを読み、`thinktank_update_think` で
  タイトルを projectファイルに揃え、今回の記録を先頭に置いて既存の記録を後ろにそのまま続けた本文に置き換えるよう指示する。
  この依頼で書き換えるのは AIViewファイルだけにさせる。
- 書き込みは PC版では MCP の通知で画面へ反映され、Web版では正本を読み直して確かめる（最大10秒待つ）。
  AI CLI が書き込まなかった（MCP が使えない等）ときは、AI の回答をアプリが同じ書式で追記し、AIView にその旨を表示する。
- AIViewファイルの書式（`src/utils/aiViewFormat.ts`）。現状・進捗・実績の要約ごとに「# [yyyy-MM-dd] ○○要約」のタイトル行を作り、
  次の行に「(AIモデル名)」、要約はその次の行から書く。同じファイルに新しいものを先頭にして並べる。
  要約の中の見出しは `##` 以下（アプリが追記するときは `#` を1段下げる）。
- AIモデル名は、AI CLI を起動する側（PC版の main プロセス・中継役PC）が依頼文の `{{AI_MODEL}}`（`AI_MODEL_PLACEHOLDER`）を
  置き換えて渡す（`resolveModelLabel`）。指定モデル → CLI の利用者設定の既定モデル（codex は `~/.codex/config.toml` の `model`、
  claude は `~/.claude/settings.json` の `model`）→「CLI名（既定モデル）」の順に決める。

```
プロジェクト名
# [2026-10-31] 進捗要約
(gpt-5.6-sol)
（要約）

# [2026-10-30] 現状要約
(gpt-5.6-sol)
（要約）
```

- 作成中は AIView のリボンの直下に段階（対象ファイルの読み込み・AI CLI の要約と書き込み・書き込みの確認）と経過秒数を出し、
  終わったら結果（AI CLI が書き込んだ／アプリが追記した／失敗）を出す。サブパネルを切り替えても作成は続き、戻ると続きを表示する。
- リボン右端の TextEditor アイコンは、Pane の TextEditor アイコンと同じく Shift+クリックで YAML＋本文 表示、クリックで通常表示
  （プロジェクトサブパネルも同じ。別のファイルをロードすると通常表示に戻る）。

### AI CLI への MCP の渡し方（`electron/aiCliRunner.cjs` の `buildCliArgs`）

| CLI | 渡し方 |
|---|---|
| claude | `--restricted --strict-mcp-config --mcp-config <file> --allowedTools mcp__thinktank__*`（`--safe-mode` は MCP も無効にするため、MCP を渡すときは使わない） |
| codex | `-c mcp_servers.thinktank.command/args/env` と `default_tools_approval_mode="approve"`（作業ディレクトリの `.codex/config.toml` は信頼済みでないため読まれない。exec は承認を求められない） |
| antigravity | 作業ディレクトリの `.agents/mcp_config.json` と `--settings {"permissions":{"allow":["mcp(thinktank/*)"]}}`（ヘッドレスでは MCP が自動で拒否される） |

- AIViewファイルは AI だけが書き、利用者は編集できない（UI では読み取り専用）。内容を変えたいときは projectファイルの
  プロンプトを直して作り直すか、AIChat で AI に編集させる（AIChat は今後整備）。

## 6. 廃止した項目と互換

- 廃止: `# 見通し` の自由記述、`# 状態` の `状態値：` 表記と `最終評価日：`、`# 出力先`、`# 評価内容`、`# 評価日時`、`[links:ID]` タグ、`# プロンプト`（2026-10-31 に現状把握用・進捗把握用・実績把握用の3つへ分割）。
- 既存ファイルに残る廃止項目は読み取りで害が無いため、変換・削除はしない。
  `[links:ID]` はThink参照・Linkタグとして読み、`# 対象` を書き直すときに `[link:ID]` へ置き換える。
- Project見出しが一つも無い旧形式は本文からThink参照を拾う。`# 対象` が無いファイルへ対象を追加するときは、自由記載を残したまま `# 対象` を挿入する。
- AI CLI（MCP）からProjectへThinkを紐づけるときも同じタグ名（links は `link`）を使う
  （`shared/vaultFormat.ts` の `projectTargetTag`）。
