---
name: git-update
description: GitHubに更新分を登録し、その際version情報を更新する。
---

以下は確認なしで自律的に進めること。

Githubにコミットする

copyright.txtを以下に従って更新する
　version: 3桁目を+1する
　copyright.year: コミット年
　commitPC: コミットしたPC名
　commitID: コミットID(先頭7桁)
　commitDateTime: コミット日時
　commitDateTime: コミットメッセージ

README.mdの先頭（見出し直下）に、以下を新しいエントリとして追記する（新しい順）
　・コミットしたバージョン番号、コミットタイトル
　・コミット日、コミット番号
　・コミット内容
README.mdが存在しない場合は新規作成する

Githubにプッシュする
