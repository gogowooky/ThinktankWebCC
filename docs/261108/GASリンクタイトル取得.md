# GAS によるリンクタイトル取得

状態: 実装済み（2026-11-08）。

## 1. 目的

GDrive・GMail の linkファイルを作るとき、`# Caption` と1行目に
ファイル名・フォルダー名・メール件名を入れる。

ブラウザからのドラッグ情報にはページのタイトルが入ってこない。また Thinktank の OAuth クライアントは
`drive.file` しか持たず、Gmail の権限も持たない。そこで、利用者が自分のアカウントに置いた
Google Apps Script（GAS）に問い合わせる。GAS は利用者本人の権限で動くため、
Thinktank 側の権限追加や Google の審査は要らない。

## 2. 構成

| 場所 | 役割 |
|---|---|
| `scripts/gas/linkTitle.gs` / `appsscript.json` | GAS 本体。合言葉が一致した要求にだけ名前・件名を返す |
| `src/services/linkTitleService.ts` | URL から ID を取り出して GAS に問い合わせる |
| `TTVault.GetOrCreateLinksThink` | linkファイルを新しく作るとき、ドラッグ情報にタイトルが無ければ GAS に問い合わせる |
| 設定 > リンクタイトル取得（GAS） | GAS の公開URLと合言葉の入力・接続テスト（端末ごとに localStorage へ保存） |

- 問い合わせは POST（本文 `text/plain` の JSON）。`{ token, kind, id }` を送り、`{ ok, title }` を受け取る。
  `text/plain` にするのは CORS のプリフライトを避けるため（GAS のウェブアプリは OPTIONS に応答しない）。
- 時間切れ（8秒）・未設定・失敗のときは作成を止めず、これまでどおり Affiliation の値を Caption にする。
- 公開URLは `https://script.google.com/macros/s/…/exec` の形だけを受け付け、合言葉を他のホストへ送らない。
- PC版の CSP（`electron/main.cjs`）に `script.google.com` と `script.googleusercontent.com` を許可している。

## 3. URL から ID を取り出す規則

| 種別 | URL | GAS へ送る内容 |
|---|---|---|
| GDrive | `/file/d/{id}`、`/document/d/{id}` 等の `/d/{id}`、`/folders/{id}`、`?id={id}` | `drive`。ファイルとして読めなければフォルダとして読む |
| GMail | `#inbox/{16桁の16進}` 等の旧形式 | `gmailThread` |
| GMail | `#inbox/FMfcg…` 等の新形式 | 40文字（母音を除く英字）の40進を復元すると `f:{10進のスレッドID}` になるので、16進に直して `gmailThread` |
| GMail | `?permthid=thread-f:{10進}`、`?permmsgid=msg-f:{10進}`、`?th={16進}` | `gmailThread` / `gmailMessage` |

- 新形式の復元方法は Google の公開仕様ではなく、公開されている解析例
  （`FMfcgxvzLhhSPCtzSXwHlfFgGQtTjVKn` → `thread-f:1617567580158230396` → `1672c124d784ff7c`）で確かめたもの。
  `thread-a:` 系など復元できない形式は問い合わせない。
- GPhoto は GAS に標準の機能がなく、写真を読む API も制限されているため対象外。

## 4. 導入手順（利用者が1回だけ行う）

1. <https://script.google.com/> で「新しいプロジェクト」を作る（名前は例えば「Thinktank リンクタイトル」）。
2. 「プロジェクトの設定」で「appsscript.json マニフェスト ファイルをエディタで表示する」をオンにする。
3. エディタの `コード.gs` に `scripts/gas/linkTitle.gs` の内容を、`appsscript.json` に
   `scripts/gas/appsscript.json` の内容を貼り付けて保存する（拡張サービス Gmail API はマニフェストで有効になる）。
4. 関数 `authorize` を選んで「実行」し、Drive・Gmail の読み取りを許可する。
   「このアプリは Google で確認されていません」と出たら「詳細」→「（安全ではないページ）に移動」で進む
   （自分で作ったスクリプトなので問題ない）。
5. 関数 `setupToken` を実行し、実行ログに出る合言葉を控える。
   ログに出ない場合は、左の歯車「プロジェクトの設定」→ 下部の「スクリプト プロパティ」にある
   `THINKTANK_TOKEN` の値が合言葉（ここで自分で好きな値に書き換えてもよい）。
   `THINKTANK_TOKEN` が無ければ「スクリプト プロパティを追加」で、プロパティ名 `THINKTANK_TOKEN`、
   値に推測されにくい長い文字列（英数字30文字以上など）を入れて「スクリプト プロパティを保存」する。
6. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」。
   「次のユーザーとして実行: 自分」「アクセスできるユーザー: 全員」でデプロイし、ウェブアプリの URL を控える。
7. Thinktank の 設定 > リンクタイトル取得（GAS） に URL と合言葉を入れて「接続テスト」→「保存」。
   PC版とブラウザ版は保存先が別なので、それぞれで入力する。

スクリプトを書き換えたときは「デプロイを管理」で新しいバージョンを選び直す（URL は変わらない）。

## 5. 権限と安全性

- GAS の権限は `drive.readonly`（ファイル名・フォルダー名を読む）と `gmail.metadata`（件名などのヘッダーだけ。本文は読めない）。
- 「アクセスできるユーザー: 全員」のため、URL と合言葉の両方を知る人は件名・ファイル名を1件ずつ問い合わせられる。
  返すのは名前・件名の1項目だけで、一覧や本文は返さない。漏れた疑いがあれば `setupToken` を再実行して合言葉を変える。
- 合言葉は端末の localStorage に保存し、Firestore には保存しない。
