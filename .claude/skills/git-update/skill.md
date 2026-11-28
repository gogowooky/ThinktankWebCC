---
name: git-update
description: 本アプリの更新分をGitHubに登録し、その際version情報を更新する。
---

以下は確認なしで自律的に進めること。
（`.claude/skills/git-update/skill.md` と `.agent/skills/git-update/skill.md` は同じ内容に保つ）

1. 変更をGitHubにコミットする

2. copyright.txtを以下に従って更新する（画面のステータスバーが読む）
　version: 3桁目を+1する（package.json の version も同じ値にする）
　copyright.year: コミット年
　branchName: コミットしたブランチ名
　commitPC: コミットしたPC名
　commitId: 1.のコミットID(先頭7桁)
　commitDateTime: 1.のコミット日時
　commitMessage: 1.のコミットメッセージ

3. CHANGELOG.mdの先頭（コメント行の直下）に、新しいエントリを追記する（新しい順）
　・見出し: `### v<バージョン> <コミットタイトル>`
　・日付、コミット番号
　・コミット内容: 箇条書きで3〜5行。詳しい経緯は書かない（コミットメッセージと git log にある）
　CHANGELOG.md は大きいので、全体を読まずに先頭の数十行だけを読んで追記する
　README.md には追記しない

4. 2.と3.を `chore: record v<バージョン> update` としてコミットし、GitHubにプッシュする
