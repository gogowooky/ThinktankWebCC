# projectファイル仕様（project 種別Thinkファイル）

状態: 実装済み（2026-10-30）。読み書きは `src/utils/thinkFormat.ts` の project 領域
（`serializeProject` / `parseProject` / `updateProjectTargets`）に集約している。

## 1. 書式

```
プロジェクト名
=
# 見通し
（自由記述）
# 状態
状態値：未着手
# 対象
[memo:2026-10-30-120000]: 設計メモ
[gdrive:2026-10-30-120500]: 仕様書
https://example.com/
"C:\docs\plan.md"
[Google:検索語]
# プロンプト
（AIへの指示）
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
| `# 見通し` | 自由記述 |
| `# 状態` | `状態値：…`（作成時は `未着手`） |
| `# 対象` | 各種タグ・URL・パスを1行に1件 |
| `# プロンプト` / `# 条件` | 自由記述 |
| `# AIまとめ` | 1行に1つの `[aiview:{ID}]` |
| `# AI議論` | 1行に1つの `[chat:{ID}]` |

## 2. `# 対象`

- Thinkファイルは `[種別:ID]: タイトル`（タイトルは省略可）。種別はThinkのContentType。
- linkファイルは `[link:ID]`。リンク先に応じた `[gmail:ID]` `[gdrive:ID]` `[gphoto:ID]` `[gnb:ID]` `[path:ID]`
  も書ける（docs/261030/linkファイル仕様.md）。`[links:ID]` は廃止。
- URL・パス・検索タグ（`[Google:語]` 等）のようにThink参照でない行もそのまま並べられる。
- Seedsへのドロップ等で対象を更新すると、Think参照の行だけを書き直し、それ以外の行は残す。
  既存の `[gdrive:ID]` 等の詳しいLinkタグ名は書き直しでも保つ。新しく載せる linkファイルは `[link:ID]`。
- `# AIまとめ` / `# AI議論` に載っているThinkは `# 対象` へ重複させない。

## 3. 参照の読み取り

- `parseProject().ids` は本文のどこかに書かれたThink参照すべて（Projectへの所属判定に使う）。
  `aiSummaryIds` / `aiDiscussionIds` は `# AIまとめ` / `# AI議論` の参照だけ。
- 本文中の `[aiview:ID]` と、値がThinkIDの `[chat:ID]` は、DoOnCursorPos でそのThinkを開く。
  値がIDでない `[chat:語]` は従来どおりchat検索。

## 4. 廃止した項目と互換

- 廃止: `# 状態` の `最終評価日：`、`# 出力先`、`# 評価内容`、`# 評価日時`、`[links:ID]` タグ。
- 既存ファイルに残る廃止項目は読み取りで害が無いため、変換・削除はしない。
  `[links:ID]` はThink参照・Linkタグとして読み、`# 対象` を書き直すときに `[link:ID]` へ置き換える。
- `# 対象` の見出しが無い旧形式は本文全体からThink参照を拾い、対象を更新するときに新書式で作り直す。
- AI CLI（MCP）からProjectへThinkを紐づけるときも同じタグ名（links は `link`）を使う
  （`shared/vaultFormat.ts` の `projectTargetTag`）。
