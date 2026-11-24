# Google Workspace 連携（GAS）の導入手順

Thinktank の AI ハーネス（Claude / ChatGPT / Gemini すべて共通）から、ご自身の **Gmail（読み取り）・Google カレンダー（読み取り）・Google Tasks / ToDo（読み取り）・Google ドライブ（読み書き）** を利用するための手順です。

GCP での OAuth アプリ作成や新たな Google アカウント設定は不要で、いまお使いの Google アカウントの Google Apps Script（GAS）だけで完結します。

## 安全設計
- **Gmail・Google カレンダー・Google Tasks**: 読み取り専用（メール送信・予定削除・タスク削除のコードは含まれていません）。
- **Google ドライブ**: 読み取り・新規作成・更新のみ（削除のコードは含まれていません）。
- **チーム実行の担当ワーカー**: ハーネスで書き込み禁止（`writableIds: []`）の担当 AI には Google ドライブの書き込みも自動で拒否されます。

---

## 手順（初回のみ・約5分）

1. [Google Apps Script](https://script.google.com/) を開き、「新しいプロジェクト」を作成する（名前例：`Thinktank Google Workspace 連携`）。
2. エディタに `scripts/gas/googleWorkspace.gs` の内容をすべて貼り付けて保存する。
3. **Google Tasks API を有効にする**:
   - 左メニューの「サービス」の横にある `+` をクリック。
   - **Tasks API**（識別子 `Tasks`）を選んで「追加」をクリック。
4. **合言葉を発行する**:
   - 上部の関数選択で `setupToken` を選び、「実行」をクリック。
   - 実行ログに表示された「Thinktank に入力する合言葉」を控える。
5. **権限を承認する**:
   - 関数選択で `authorize` を選び、「実行」をクリック。
   - Google アカウントの権限確認画面が出たら許可する（Gmail・Drive・Calendar・Tasks）。
6. **ウェブアプリとして公開する**:
   - 右上の「デプロイ」→「新しいデプロイ」→ 種類の歯車から「ウェブアプリ」を選択。
   - **次のユーザーとして実行**: `自分`
   - **アクセスできるユーザー**: `全員`
   - 「デプロイ」を押し、表示された **ウェブアプリの URL**（`https://script.google.com/macros/s/.../exec`）を控える。
7. **Thinktank に登録する**:
   - Thinktank の `Thinktank > 設定 > Google Workspace 連携（GAS）` に URL と合言葉を入力し、「接続テスト」→「保存」を押す。

---

## AI が使えるようになる MCP ツール
- `thinktank_google_gmail_search`: Gmail を検索してスレッド一覧と URL を取得
- `thinktank_google_gmail_read`: 指定スレッドの本文を取得
- `thinktank_google_calendar_events`: 指定期間の予定一覧を取得
- `thinktank_google_tasks_list`: Google Tasks（ToDo）のリストとタスクを取得
- `thinktank_google_drive_search`: Google ドライブのファイルを検索
- `thinktank_google_drive_read`: Google ドキュメント・スプレッドシート・テキスト系ファイルの内容を取得
- `thinktank_google_drive_write`: Google ドライブへ新規作成・更新・追記（削除不可）
