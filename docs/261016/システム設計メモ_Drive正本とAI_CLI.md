# システム設計メモ：Drive 正本 ＋ AI CLI ＋ 中継役 PC（最終案）

作成：2026-10-16　状態：**最終案（未実装）**。実装・データ変換・デプロイはまだ行っていない。

これまでの検討（`docs/ARCHITECTURE_DRIVE_FIREBASE.md`）を整理し、複雑さを減らすための次の2つの決定を取り入れた最終案である。

- **決定①　中継は「読み取り」と「AI」だけにする。** 保存は、どの端末からでも Drive に直接行い、衝突の検知で守る
- **決定②　中継役の PC は自動で選ばず、利用者が1台を指定する。** 自動の選出・引き継ぎ・昇格はしない

---

## 0. 決定事項

| 項目 | 決定 |
|---|---|
| データの正本 | Google Drive 上の、Thought ごとの `<thinkid>.md`（frontmatter は基本項目だけ）と `<thinkid>.support.json`（思考支援データ） |
| PC 版アプリ | Electron。Express を持たず、メインプロセスがファイル・索引・検索・AI CLI・Firebase を担当する |
| Web 版 | Firebase Hosting に置く静的な SPA。処理用のサーバーは持たない |
| AI | PC 版アプリがローカルの AI CLI を隔離して実行する。プロンプトはアプリが持つ。携帯では AI を使わない（DisplayMode=Edit） |
| 中継 | Firestore 経由で、利用者が指定した**中継役の PC**に、検索・一覧の差分・本文の取得・AI だけを依頼する。エンドツーエンドで暗号化する |
| 保存 | すべての端末が Drive に直接保存する。保存の直前に版を確かめて衝突を防ぐ |
| 廃止 | Express（`server/`）、BigQuery、Cloud Run、IAP、Secret Manager、サービスアカウント、Gemini File Search |
| 配布 | 他の人に配る前提。開発者は利用者のデータも AI の契約も預からない |

目標は、アカウント管理・API キー管理・処理用のサーバーの運用を開発者側からなくすことである。

---

## 1. 全体構成

```
                 ┌────────────── Firestore ──────────────┐
                 │ 端末の登録・中継役の指定・暗号化した依頼と応答 │
                 └───────────────────────────────────────┘
                   ▲ 依頼（読み取り・AIだけ）        ▲ 待ち受け
                   │                              │
 ┌─────────────────┴──┐                ┌──────────┴───────────┐     ┌──────────────────┐
 │ Web版                │                │ 中継役の PC（利用者が指定）│     │ その他の PC          │
 │ PCブラウザ：AIあり    │                │ ・G: を直接読み書き        │     │ ・G: を直接読み書き    │
 │ 携帯：Edit、AIなし    │                │ ・索引・検索・AI CLI       │     │ ・索引・検索・AI CLI   │
 │ ・保存は Drive に直接 │                │ ・Web版からの依頼を処理    │     │ ・中継はしない        │
 └─────────┬──────────┘                └──────────┬───────────┘     └─────────┬────────┘
           │ Drive API                            │ Drive for desktop（G:）        │ G:
           ▼                                      ▼                               ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ Google Drive：Thinktank/vault_ver2/*.md・*.support.json、media/、.thinktank/（索引・プロンプト・設定）│
 └─────────────────────────────────────────────────────────────────────────────────────┘
```

| 端末 | 読み取り | 保存 | 検索 | AI |
|---|---|---|---|---|
| 中継役の PC | G: から直接 | G: に直接 | 自分の索引 | 自分の CLI |
| その他の PC | G: から直接 | G: に直接 | 自分の索引 | 自分の CLI |
| Web 版（中継役がオンライン） | キャッシュ → 中継役から差分 | **Drive に直接** | **中継役の索引** | **中継役の CLI**（PC ブラウザのみ） |
| Web 版（中継役がオフライン） | キャッシュ → Drive の索引と差分 | Drive に直接 | Drive の全文検索 | 使えない |

---

## 2. PC 版アプリ

### 2.1 内部構成

```
PC版アプリ
├─ 画面（React）       app://thinktank/ から表示。IPC でメインプロセスに依頼するだけ
└─ メインプロセス（Node）
     ├─ Drive(G:) の .md / .support.json の読み書き、索引キャッシュ、検索
     ├─ AI CLI の実行（child_process）
     └─ Firebase：ログイン、端末の登録、（中継役なら）依頼の待ち受けと応答
```

- **Express は持たない。** 今のパッケージ版は Express を子プロセスとして起動し、`http://127.0.0.1:PORT` から画面を配信している。移行後はその処理（起動、空きポートの検索、`server.env` の読み込み）を削除する
- **画面はカスタムプロトコル（`app://thinktank/`）で配信する。** `file://` では CSP をかけられず、Google ログインの配信元としても登録できないため。ポートを開かないので、ほかのアプリから localhost 経由で覗かれない
- **2つ目の起動を防ぐ。** `app.requestSingleInstanceLock()` を使い、2つ目は終了して1つ目のウィンドウを前面に出す（`second-instance`）。今の `electron/main.cjs` には入っていない
- **Google ログインはシステムのブラウザを経由する（PKCE と loopback）。** 結果を Firebase Auth に渡す（`signInWithCredential`）。localhost で待ち受けるのはログインの間だけ
- 開発中は Vite と Electron だけを起動する（今の `electron:dev` は Express・Vite・Electron の3つ）

### 2.2 中継役の指定（決定②）

- 初回の起動時にランダムな `deviceId` を作って userData に保存し、`users/{uid}/devices/{deviceId}` に登録する。PC 名は表示用にだけ使う
- 利用者が設定画面で「この PC を中継役にする」を選ぶと、`users/{uid}/settings/relay` に `{ deviceId, vaultId }` を書く。中継役は常に1台で、別の PC で選び直すと上書きされる
- 中継役の PC は、生きていることを示すため `devices/{deviceId}` の最終接続時刻を定期的に（例：15秒ごと）更新し、宛先が自分の依頼だけを処理する
- 中継役でない PC は、依頼を処理しない。G: を直接読み書きする普通の PC として動く
- **自動の選出・引き継ぎ・昇格はしない。** 中継役が止まっている間、Web 版は Drive に直接アクセスする（§4）

### 2.3 AI CLI

- `AIProvider` の仕組みに **CLI プロバイダ**を追加する（Claude Code、Codex CLI、Gemini CLI などを想定）。起動時にどの CLI があるかを調べ、なければ AI 以外の機能だけで動く
- 会話の履歴は CLI のセッション機能に頼らず、**アプリが毎回プロンプトに含めて渡す**（CLI を切り替えても会話が続くようにするため）
- 1回の呼び出しで数秒の起動時間がかかることを、画面設計の前提とする。ストリーミング表示は CLI ごとの出力形式（例：`--output-format stream-json`）を読む

**CLI 設定の隔離（必須）。** CLI は起動するとユーザーが用意した環境を自動で読み込む（Claude Code なら CLAUDE.md・スキル・MCP サーバー・プラグイン・フック・メモリ、Codex は `AGENTS.md`、Gemini CLI は `GEMINI.md`）。そのままだと、回答の形式（引用マーカー `[:>1]` や citations）が崩れる、MCP やツールを通じてメモが外部に送られたりファイルが変更されたりする、利用者ごとに結果がばらつく、という問題が起きる。

1. 普段は隔離して実行する：空の作業フォルダで起動し、指示はアプリから明示的に渡し、ツール・MCP・ユーザー設定を読み込まない
2. 利用者が選んだときだけ、自分の CLI 設定を使う。CLI に Vault フォルダを読ませる場合も、読み取りだけ・Vault フォルダだけに限る
3. 回答は必ずアプリ側で検証し、形式が崩れていたらやり直す
4. CLI 側に会話の履歴を残さない設定にする（記録は Thinktank の `.md` だけにする）

**プロンプトはアプリが持つ。** 思考補完・要約・Harvest などの指示（今の `server/services/AIProvider.ts` の `CONVERSATION_POLICY`）は、`.thinktank/prompts/` にテンプレートとして置く。PC 版でも中継でも同じ指示で動き、利用者が自分で直せる。

参考：API で呼ぶ場合は、CLAUDE.md・スキル・MCP・メモリは一切自動では使われず、アプリが送った system prompt・メッセージ・ツールだけが使われる。

---

## 3. Web 版

### 3.1 内部構成

```
Web版アプリ  ※ Firebase Hosting から配信される静的ファイル（処理用のサーバーなし）
└─ ブラウザ（React SPA）
     ├─ 画面        携帯：DisplayMode=Edit（AIなし）／PC：AIあり
     ├─ 読み取り    IndexedDB のキャッシュ → 中継役から差分（いなければ Drive の索引と差分）
     ├─ 保存        Drive API に直接（保存の直前に版を確かめる）
     ├─ 検索        中継役の索引（いなければ Drive の全文検索）
     ├─ AI          中継役の CLI（PC ブラウザで、中継役がオンラインのときだけ）
     └─ ログイン    Firebase Auth（Google ログイン）＋ Google Identity Services（Drive トークンの更新）
```

- `firebase deploy` で上げるのは `vite build` の結果（`dist/`）だけで、サーバー上でプログラムは動かない
- 携帯向けに別のビルドは作らず、1つの SPA で「画面幅」と「AI を使える状態か」で機能を出し分ける
- ローカルのファイルを開く、検索タグの取得など PC 版だけの機能は隠す

### 3.2 中継役がオンラインかどうかの判断

- `users/{uid}/settings/relay` の `deviceId` の `devices/{deviceId}` の最終接続時刻が、例えば 45 秒以内ならオンラインとみなす
- オンラインとみなしても応答がない場合に備えて、短い待ち時間（例：3 秒）で Drive 経由に切り替える
- 中継は読み取りと AI だけなので、失敗しても「Drive に問い合わせ直す」だけで済み、二重の書き込みは起きない（決定①の利点）

---

## 4. データ設計

### 4.1 配置

```
<利用者が選んだ Drive のフォルダ>/Thinktank/
├─ vault_ver2/                  BigQuery のテーブル名・今の Electron 版の保存先と名前を揃える
│   ├─ <thinkid>.md              Thought 本体
│   └─ <thinkid>.support.json    思考支援データ（あるものだけ）
├─ media/                       添付ファイル
├─ trash/                       削除済みの Thought（§10.4）
└─ .thinktank/
    ├─ vault.json               Vault の id・形式のバージョン
    ├─ index/                   Web 版用の索引（§5.2）
    ├─ prompts/                 AI のプロンプトのテンプレート（§2.3）
    └─ settings.json            端末をまたいで共有する設定
```

### 4.2 `.md` の形式（形式バージョン 1）

```
---
schema_version: 1
thinkid: 2026-10-16-093000
category: memo
title: タイトル
keywords: null
related_ids: null
created_at: '2026-10-16T09:30:00.000Z'
updated_at: '2026-10-16T09:30:00.000Z'
---
本文（タイトル行は含めない）
```

- frontmatter には**基本項目だけ**を置く：`schema_version`、`thinkid`、`category`、`title`、`keywords`、`related_ids`、`created_at`、`updated_at`
- `size_bytes` と `is_deleted` は持たない。`size_bytes` は G: で直接編集すると古くなるので、読むときに計算する。削除は `trash/` への移動で表す
- `category` は `memo` / `bundle` / `table` / `links` / `chat` / `nettext` / `html`（`server/services/vaultKey.ts` の `VALID_CATEGORIES`）
- 文字コードは UTF-8（BOM なし）。本文は変換も保存も**バイト単位でそのまま**扱う（改行コードを書き換えない）
- `updated_at` は版として使う（§6）

### 4.3 `.support.json` の形式（必須の分離）

```json
{
  "schemaVersion": 1,
  "thinkid": "2026-10-16-093000",
  "updatedAt": "2026-10-16T09:30:00.000Z",
  "metadata": { "thinkSupport": {}, "thinkConversations": {}, "thinkProgress": {} }
}
```

- 思考支援データは frontmatter に入れず、この別ファイルに置く。理由：外部連携などの履歴は上限が約 2MB の作りで、今の frontmatter の最大は 186KB ある（§10.1）。frontmatter に入れると本文の前に巨大な YAML が並び、G: から人が読んで保守しやすいという利点が損なわれる。また、本文と更新の頻度が違うので、ファイルを分けると衝突の範囲を狭められる
- `metadata` には、今の BigQuery の `metadata` 列の中身を**キーを解釈せずにそのまま**入れる。コードから分かっているキーは `thinkSupport`、`thinkConversations`、`thinkProgress`、`thinkExternal`、`thinkFileSearch`、`thinkAgentJobs`、`thinkAgentArtifact`、旧形式の `thoughtSupport`
- `thinkFileSearch` は機能を廃止しても、データは消さずに残す
- `.md` と同じく、保存の直前に版を確かめる（§6）。今の BigQuery の `expectedVersion` の役割をこれで置き換える
- 会話は今と同じく、Thought（`category: chat`）の `.md` として保存する

### 4.4 メディア

- `media/` の下に置き、本文からは相対パスで参照する
- 今のメディアは、サービスアカウントの Drive の `Thinktank/<日付>/` にあり、「リンクを知っている全員が閲覧可」になっている（`server/services/driveService.ts`）。移行では利用者の Drive に移す（§10.3）。新しい構成では公開リンクを作らない

---

## 5. 一覧・索引・検索

実測（2026-10-16、ローカルの旧 Vault）：**5,695 件、本文 25.3MB、frontmatter 1.9MB**。

### 5.1 PC 版：ローカルの索引キャッシュ

1. userData の下（Drive の外）に、ファイルごとの「更新日時・サイズ・パース結果（メタデータ・本文）」を保存しておく
2. 起動したら、まずキャッシュを読んで一覧をすぐ表示する
3. 裏でフォルダ内の更新日時だけを調べ、変わったファイルだけを読み直す

キャッシュは消しても作り直せるもので、正本ではない。Drive for desktop は**ミラーモード**か「オフラインで使用可能」に設定する前提とする（ストリーミングモードでは最初の作成がとても遅い）。外からの変更には、`fs.watch` に頼らず、ポーリングとアプリが前面に戻ったときの再確認で気づく。

### 5.2 Web 版

- **中継役がオンライン**：IndexedDB のキャッシュをすぐ表示し、「前回以降の差分」を中継役に問い合わせる
- **中継役がオフライン**：`.thinktank/index/` のメタデータの索引（全体で約 1〜2MB）を読み、`files.list` で索引より新しいファイルだけを読む
- 索引は PC 版アプリ（どの PC でもよい）が更新する。複数の PC が同時に書き換えて衝突しないよう、**端末ごとのファイル（シャード）＋読むときに合成する**方式にする

### 5.3 検索

- 索引を作る段階で frontmatter と本文を分け、**全文検索の対象は本文だけ**にする
- タイトルやタグは `tag:` や `title:` のように項目を指定して検索する
- PC 版：メモリ上で部分一致の走査をする（今の規模で数十 ms）。目安として 100MB を超えたら SQLite FTS5（trigram）の検索用索引に移る（これも作り直せるキャッシュ）
- Web 版：中継役がオンラインなら中継役の索引で検索する（結果と質は PC 版と同じ）。オフラインなら Drive の全文検索（`fullText contains`）で補い、結果を索引と照合して YAML だけに当たったものを除く。**Drive の検索で日本語の部分一致がどの程度効くかは要検証**（§13）。足りなければ、本文をまとめたファイルを携帯にも取り込む案を追加する

---

## 6. 保存と衝突（決定①）

すべての端末が Drive に直接保存する。Drive は排他制御をしないので、レビューで Phase 0 のブロッカーに挙げた「同時編集による上書き」への対策が必須になる。

- 保存の直前に、読み込んだときの版（PC：`updated_at` とファイルのハッシュ、Web：`updated_at` と Drive の `version`／`modifiedTime`）と今の版を比べる。外で変更されていたら保存を止め、利用者に選んでもらう（今の Electron 版の `baseUpdatedAt` の確認と同じ考え方）
- Drive for desktop が作る衝突ファイル（`(1)` 付きなど）を見つけて知らせる
- Web 版のオフライン入力は IndexedDB に一時保存し、つながったときに上の手順で衝突を確かめてから保存する
- AI の回答（会話の Thought）も、中継役は返すだけで、**保存は依頼した端末が Drive に直接行う**

---

## 7. 中継（決定①②）

### 7.1 中継する依頼の種類

| 種類 | 内容 |
|---|---|
| `search` | 全文検索・項目指定の検索 |
| `listDiff` | 指定した時刻以降に変わった Thought のメタデータ |
| `getBody` | 指定した Thought の本文と `.support.json` |
| `ai.*` | 思考補完・要約・Harvest など（決めた種類だけ） |

**保存の依頼は中継しない。** Web 版から自由なプロンプトや CLI の引数は送らせず、依頼の種類・対象の id・利用者の入力文だけを受け取り、プロンプトは中継役の PC の中で組み立てる。

### 7.2 Firestore のデータ構造

```
users/{uid}/devices/{deviceId}                PC の登録情報（表示名、最終接続時刻、使える CLI、vaultId）
users/{uid}/settings/relay                    中継役の指定 { deviceId, vaultId }
users/{uid}/requests/{requestId}              依頼：種類、状態、宛先の deviceId、作成時刻、暗号文
users/{uid}/requests/{requestId}/chunks/{n}   応答の断片（暗号文。ストリーミング表示用）
```

処理の流れ：

```
① Web版：requests に依頼を書く（状態 = pending、宛先 = 中継役の deviceId）
② 中継役の PC：onSnapshot で受け取る（メインプロセスで常に待ち受ける）
③ 中継役の PC：状態を running にし、処理して chunks に少しずつ書く
④ Web版：chunks を受け取って画面に流す
⑤ 中継役の PC：状態を done にし、依頼と応答を削除する（消し忘れに備えて TTL ポリシーも設定）
```

- Firestore の1件の上限は 1MB なので、大きな本文は分割して送る
- 依頼と応答の形式にはバージョン番号を入れ、古い PC 版と新しい Web 版の組み合わせでも壊れないようにする

### 7.3 エンドツーエンド暗号化（必須）

Firestore のデータは、プロジェクトの管理者（開発者）なら Firebase のコンソールから読める。他の人に配る以上、利用者のメモの内容を開発者が読める状態にしてはならない。

- 最初のペアリングのとき（中継役の PC が表示する QR コードを Web 版で読むなど）に鍵を交換する
- Firestore には暗号文だけを置き、依頼の種類・状態・宛先など中継に必要な最小限だけを平文にする
- 鍵は各端末の中だけに保存し、Drive や Firestore には置かない
- プライバシーポリシーに、中継の内容は暗号化され、処理が終わると削除されることを明記する

### 7.4 Firebase の運用

- **セキュリティルール**：`users/{uid}` の下は `request.auth.uid == uid` の本人だけが読み書きできる
- **App Check**：正規のアプリ以外からのアクセスを防ぐ
- Web 版に埋め込む Firebase の設定（`apiKey` など）は識別子であり、秘密の情報ではない
- **料金**：Spark（無料）プランの範囲で個人の利用は収まる見込み。配布すると全員分の利用量が開発者のプロジェクトにかかるので、利用者が増えたら Blaze プランに移り、予算アラートを設定する。Cloud Functions は使わない
- 開発とテストには Firebase Emulator Suite を使う

---

## 8. 認証と Drive の権限 — **最大の検証課題**

| 利用形態 | Drive へのアクセス | 認証 |
|---|---|---|
| PC 版アプリ | Drive for desktop のフォルダ（G:）をファイルとして読み書き | Drive には不要。Firebase Auth は中継と端末の登録に使う |
| Web 版 | ブラウザから Drive API | Google OAuth（Firebase Auth ＋ Google Identity Services） |

**問題：** 配布するなら、Google の厳しい審査（restricted、毎年の CASA）を避けるため `drive.file`（アプリが作ったファイルや、利用者が選んだファイルだけ）を使いたい。しかし **PC 版が G: に作った新しいファイルは、Web 版から見えない可能性が高い。** 実装の前に必ず検証する。

- **A.** Web 版で Google Picker を使って Vault フォルダを選んでもらい、フォルダ内の既存のファイルや、あとから G: で作られたファイルに `drive.file` でアクセスできるかを確かめる
- **B.** PC 版も Drive API（同じ Google Cloud プロジェクトの OAuth クライアント）で書き込み、すべてのファイルを「このアプリが作ったもの」にする。ただし利用者が G: で新しく作ったファイルは、アプリが取り込むまで Web 版から見えない
- **C.** `drive` 権限を使い、審査を受ける（配布の規模が大きくなってから検討する）

開発中や少人数での試用なら、審査前の「テスト」状態で `drive` 権限を使える（テストユーザーは 100 人まで、外部ユーザーのトークンは 7 日で切れる）。

**Drive のトークンの更新（必須）。** Firebase Auth の Google ログインで得られる Drive 用のアクセストークンは約 1 時間で切れ、Firebase は自動で更新しない。Web 版は Google Identity Services で取り直す。B を選んで PC 版が Drive API を使う場合は、リフレッシュトークンを OS の資格情報ストアに保存して更新する。

Firebase のプロジェクトは Google Cloud のプロジェクトでもあるので、OAuth の同意画面と審査も同じプロジェクトで行う。

---

## 9. 開発の構成

今は保存以外の処理を Express が共通で引き受けているが、移行後は処理の中心が PC 版のメインプロセスと Web 版のブラウザに分かれる。そのまま進めると同じ処理を2回書くことになる。すでに frontmatter の読み書きが `electron/mdFormat.cjs`、`src/utils/thinkFormat.ts`、`server/routes/bigqueryRoutes.ts` の3か所に分かれている。

```
shared/        純粋なロジック（Node にもブラウザにも依存しない）
               ・.md / .support.json の形式、frontmatter の読み書き、形式バージョンの変換
               ・索引の作成、全文検索（本文だけ）、衝突の検知
               ・プロンプトのテンプレートの組み立て、AI の回答の検証
               ・中継の依頼・応答の形式、暗号化
src/           画面（React）。PC 版・Web 版で共通
src/platform/
   ├─ electron/  IPC でメインプロセスに依頼する実装
   └─ web/       Drive API・Firestore を直接呼ぶ実装
electron/      メインプロセス（PC 版だけ）
scripts/convert-vault/   一回限りのデータ変換ツール（§10）
```

1. 差し替える部分（保存・検索・AI・ログイン）はインターフェースにする（今の `IStorageBackend` と同じやり方）
2. 機能の出し分けは `platform.capabilities` の1か所にまとめる。今は `window.electronAPI` の有無を6つのファイルで直接調べている
3. 共通のロジックは `shared/` に1つだけ置く。`electron/main.cjs` は CJS 固定（CLAUDE.md）なので、`shared/` をメインプロセス用にバンドルして読み込む。CJS で書き直して二重にしない
4. 「保存して読み込むと同じ内容に戻る」「外で変更されていたら保存を止める」などの契約テストを、PC 版と Web 版の両方の実装で動かす
5. AI の依頼は、PC 版では IPC で、Web 版では中継で、同じ形でメインプロセスに渡す
6. Drive API にはエミュレーターがないので、開発用の Google アカウントとフォルダ、またはローカルのフォルダを Drive に見立てた偽の実装を使う
7. リリースは PC 版（electron-builder）と Web 版（`firebase deploy`）の2系統になる。ファイル形式と中継の形式にバージョン番号を入れて、組み合わせのずれに耐えるようにする

---

## 10. 今の Thought ファイルの変換

### 10.1 現状の確認結果（2026-10-16）

**正本は BigQuery の `thinktank.vault_ver2` である。**

- 列：`thinkid`、`file_type`（固定値 `md`）、`category`、`title`、`content`（本文。タイトル行を含まない）、`keywords`、`related_ids`、`size_bytes`、`is_deleted`、`created_at`、`updated_at`（TIMESTAMP）、`metadata`（STRING か JSON。環境によって違う）
- 一覧などの問い合わせは「`thinkid` ごとに `updated_at` が最新の行」を採用する作りになっている。同じ `thinkid` の行が複数ある可能性を前提に変換する

**ローカルの旧 Vault（`%APPDATA%\thinktank\thinktank\vault_ver2`）は正本として使わない。**

- `.md` が 5,695 件、同じ名前の `.json` が 5,695 件。最終更新は 2026-09-27
- frontmatter のキーが camelCase（`id`、`contentType`、`relatedIds`、`sizeBytes`、`isDeleted`、`createdAt`、`updatedAt`、43 件だけ `metadata`）で、今の `electron/mdFormat.cjs` が想定する snake_case（`thinkid`、`category` など）と一致しない
- `.json` は本文（`content`）を含む同じ内容の写しで、旧形式の名残と考えられる
- そのため、**照合用のバックアップ**としてだけ扱う（§10.5）

**データの特徴**（ローカルの旧 Vault で測定）

- `thinkid` は 5,688 件が `yyyy-MM-dd-HHmmss` 形式。残り 7 件は特別な名前（`__xx_...__` 形式のシステム用のメモなど）。どちらも変換の対象にする
- frontmatter の大きさは、中央値 238 バイト、99% が 430 バイト以下、最大 186KB（metadata が大きいもの数件）。§4.3 の分離の根拠
- metadata のキーは §4.3 のとおり
- メディアはサービスアカウントの Drive にあり、本文から `webViewLink` で参照されている

### 10.2 変換の方針

- **起点は BigQuery。** 書き込みを止めた（凍結した）状態の BigQuery から、一回限りの変換ツール（`scripts/convert-vault/`）で形式バージョン 1 のファイルを作る
- **ファイル形式の処理は `shared/` を使う。** 変換ツールとアプリで同じコードを使い、変換したファイルがアプリで正しく読めることを保証する
- **元のデータを変更しない。** BigQuery は読み取りだけ。出力は新しいフォルダ（ステージング）に書き、確認してから Drive に置く
- **何度実行しても同じ結果になる**ようにし、やり直せるようにする
- **データを消さない。** 削除済みの Thought は `trash/` に、廃止した機能のデータ（`thinkFileSearch` など）も `.support.json` に残す

### 10.3 変換の規則

| BigQuery の列 | 変換先 | 規則 |
|---|---|---|
| `thinkid` | ファイル名 `<thinkid>.md` と frontmatter の `thinkid` | 今のエクスポートと同じ安全な id の判定（`SAFE_ID_RE`）を通らないものは変換せず、報告に載せる |
| `category` | frontmatter の `category` | `VALID_CATEGORIES` にないものは報告に載せる（変換はするが要確認） |
| `title` | frontmatter の `title` | YAML として安全に書き出す（改行や記号を含んでも壊れないように） |
| `content` | `.md` の本文 | **バイト単位でそのまま**。改行コードも変えない |
| `keywords`、`related_ids` | frontmatter | そのまま（空は `null`） |
| `created_at`、`updated_at` | frontmatter | ISO 8601 の文字列（UTC、ミリ秒まで）。`updated_at` は版として使う |
| `metadata` | `.support.json` の `metadata` | STRING なら JSON として解釈、JSON 型ならそのまま。空なら `.support.json` を作らない。解釈できないものは報告に載せ、元の文字列を `.support.json` の `rawMetadata` に残す |
| `is_deleted = true` | `trash/<thinkid>.md` | 削除済みとして `trash/` に置く |
| `file_type`、`size_bytes` | 持たない | `file_type` は常に `md`。`size_bytes` は読むときに計算する |
| 同じ `thinkid` の古い行 | 持たない | 最新の行だけを変換する。複数あった `thinkid` は報告に載せる |

**メディアの規則**

- 本文の中の、サービスアカウントの Drive のリンク（`webViewLink`）を抜き出し、一覧を作る
- 各ファイルを利用者の Drive の `media/<日付>/` にコピーする
- 本文のリンクは、変換の時点では書き換えない（元のファイルが残っている間は見られるため）。Phase 1 の中で、相対パスに書き換える処理を別に行う。書き換えの前後の対応表は `.thinktank/media-map.json` に残す
- コピーと書き換えが終わってから、元のファイルの公開リンク（「リンクを知っている全員」）を外す

### 10.4 手順

| 手順 | 内容 | 確認すること |
|---|---|---|
| 0. バックアップ | BigQuery のテーブルをスナップショットし、JSONL でも書き出して保存する。ローカルの旧 Vault を圧縮して保存する。サービスアカウントの Drive のメディアの一覧を作る | 復元できることを試す（スナップショットから別のテーブルに戻せるか） |
| 1. 事前調査 | BigQuery で、`category` ごとの件数、同じ `thinkid` の行の数、`is_deleted` の件数、`metadata` の型と大きさ、`content` の最大の大きさ、`SAFE_ID_RE` を通らない id を調べる | 想定外の値がないか |
| 2. 試し変換 | ステージングのフォルダに変換する。ファイルは書くが Drive には置かない | 報告（件数、スキップ、要確認）を読む |
| 3. 検証 | 下の「検証の項目」をすべて満たすまで、変換ツールを直して 2 に戻る | すべて合格 |
| 4. 書き込みの凍結 | 今の Web 版・PC 版からの保存を止める（読み取り専用にする） | 凍結の後に BigQuery の `updated_at` の最大値が変わっていない |
| 5. 本変換 | 凍結した BigQuery から、もう一度ステージングに変換し、検証を繰り返す | すべて合格 |
| 6. Drive への配置 | ステージングのフォルダを `G:\…\Thinktank\` にコピーし、Drive の同期が終わるのを待つ | Drive 上の件数がステージングと同じ |
| 7. メディアの移行 | §10.3 のメディアの規則のとおりにコピーする | 一覧の全ファイルがコピーされた |
| 8. 切り替え | 新しい PC 版・Web 版で Drive の Vault を開く | 一覧の件数、いくつかの Thought の表示、検索 |
| 9. BigQuery の保管 | 読み取り専用のまま一定期間（例：3 か月）残す。削除はその後に別途判断する | — |

**検証の項目**

- 件数：BigQuery の「最新の行」の件数 ＝ `vault_ver2/` の `.md` の件数 ＋ `trash/` の件数 ＋ スキップした件数
- 本文：すべての Thought で、`.md` の本文のバイト列が BigQuery の `content` と一致する（ハッシュで比べる）
- 項目：`title`、`category`、`keywords`、`related_ids`、`created_at`、`updated_at` が一致する
- 思考支援データ：`.support.json` の `metadata` を JSON として読んだ結果が、BigQuery の `metadata` と同じ内容になる
- 往復：`shared/` のパーサーで読み、書き出し、もう一度読んだ結果が変わらない
- アプリでの確認：新しい PC 版で、代表的な Thought（memo、bundle、chat、table、links、nettext、html、システム用のメモ）を開いて表示を確かめる

### 10.5 ローカルの旧 Vault との照合

- 旧 Vault の各ファイルの `id` と `updatedAt` を、BigQuery の `thinkid` と `updated_at` と比べる
- **旧 Vault のほうが新しいもの**、**旧 Vault にしかないもの**を一覧にする（旧 Vault が最後に使われたのは 2026-09-27 なので、通常はないはず）
- 一覧に載ったものは自動では取り込まず、利用者が内容を見て判断する

### 10.6 移行期間の注意

- **PC 版を Drive に切り替えた時点で、今の Web 版（BigQuery）は古くなる。** 携帯で使えない期間ができないよう、Phase 1 と Phase 2 は変換済みのステージングのコピーを使って開発し、**両方ができあがってから手順 4〜8 の切り替えを行う**
- 凍結（手順 4）から切り替え（手順 8）までは書き込みができない。所要時間を試し変換で測り、短く済む時間帯に行う

---

## 11. 廃止するもの

| 対象 | 時期 |
|---|---|
| Express（`server/`、`dist-server/`）、PC 版の Express の子プロセス、`server.env` | Phase 1（PC 版）〜 Phase 2（Web 版）の完了時 |
| BigQuery | 切り替え後、読み取り専用で一定期間保管してから判断（§10.4 手順 9） |
| Cloud Run、IAP、Secret Manager | Phase 2 の完了時 |
| サービスアカウントと、その Drive のメディア | メディアの移行（§10.3）と公開リンクの解除が終わってから |
| Gemini File Search（`/api/think-support/file-search`） | Phase 1。データは `.support.json` に残す |
| `StorageManager` の `'local'` モード（C# API `:8081`、WebView2 時代の名残） | Phase 1 |
| `/api/chat`（停止済みの旧チャット） | Phase 1 |

Express の各ルートの行き先：`/api/bq/files*` → Drive の `.md`、`/api/bq/files/:id/think-support` と `/api/think-support/{conversations,progress,external,agents}` → `.support.json` ＋ PC 版の CLI、`/api/drive/upload` → `media/`、`/api/system/search-tags*` と `/open` → PC 版のメインプロセス（Web 版では無効）。

思考支援データ（`src/services/ThinkSupportService.ts`）、会話、進行状況、外部連携は、今は Electron 版でも `StorageManager` を通らず Express 経由で BigQuery に直接書いている。これらを保存の仕組み（`IStorageBackend`）を通すように直す。

---

## 12. 配布

**PC 版**
- 初回設定：Vault フォルダの選択、Google ログイン、AI CLI の有無の確認と導入手順の案内、（任意で）中継役の指定とペアリング
- Windows のコード署名、自動アップデート（electron-updater と GitHub Releases など）
- パッケージに秘密情報も Express も含めない

**Web 版**
- Firebase プロジェクト（Hosting、Auth、Firestore、App Check）、OAuth の同意画面、プライバシーポリシーと利用規約のページ
- Drive の権限の範囲の決定と、必要なら Google の審査（§8）

**利用者が自分で用意するもの**：Google アカウント、Drive for desktop、（AI を使う場合）AI CLI とその契約

---

## 13. 段階的な実装計画

| 段階 | 内容 | 完了したときにできること |
|---|---|---|
| **0. 検証** | §8 の Drive の権限（A/B/C）、Drive の検索での日本語の部分一致、CLI の隔離実行と履歴を残さない設定、定額契約の CLI を本人の PC で中継して使うことが各社の規約に合うか | 構成の前提が確かめられる |
| **1. PC 版と変換の準備** | `shared/` と `src/platform/` の土台、契約テスト。変換ツールと試し変換・検証（§10.4 の手順 0〜3）。PC 版を Drive の Vault に対応（索引キャッシュ、衝突の検知、`.support.json`）。Express を外す（カスタムプロトコル、単一起動）。CLI プロバイダ（隔離、プロンプトのテンプレート） | PC 版が新しい構成で、ステージングのコピーを使って動く |
| **2. Web 版と切り替え** | `DriveApiStorageBackend`、Drive の索引と差分、IndexedDB のキャッシュ、衝突の検知つきの保存、Drive の全文検索。Firebase Hosting と Auth、Drive のトークン更新。携帯の Edit モード。**ここで §10.4 の手順 4〜8 の切り替えを行う** | サーバーなしで、PC 版と携帯の両方が Drive の Vault を使う。Cloud Run と BigQuery への書き込みが止まる |
| **3. 中継** | 端末の登録、中継役の指定、`search`・`listDiff`・`getBody`・`ai.*` の中継、エンドツーエンド暗号化とペアリング、セキュリティルールと App Check | PC のブラウザで AI が使え、中継役がオンラインなら検索の質が PC 版と同じになる |
| （4. 必要になったら） | 保存の中継、中継役の自動の選出と引き継ぎ、2 台目の PC を依頼側にする仕組み | 衝突が実際に問題になった場合だけ検討する |

各段階は単独で役に立つ。段階 4 は、段階 3 まで使ってみて必要だと分かった場合だけ作る。

---

## 14. 複雑さの評価と単純化の判断

検討の途中では、「Web 版からの保存も中継役に依頼する」「代表の PC をリースで自動的に選び、止まったら別の PC が引き継ぐ」「2 台目の PC を依頼側にする」案があった。これらは次の理由で採用しない（段階 4 に回す）。

- **保存を中継しても、衝突への対策は減らない。** 中継役がいないときは Drive に直接保存するので、§6 の衝突の検知はどのみち必要になる。そのうえで保存を中継すると、「応答がない（保存されたか分からない）」「途中で中継役が止まった」「オフラインの間に書かれた内容を取り込む」といった問題を追加で解く必要がある
- **自動の選出と引き継ぎは、分散システムの中でも特に難しい。** 止まったと判断する時間、引き継いだ PC が Drive の同期に追いついているか、同時の起動、ネットワークが一時的に切れて 2 台が両方とも代表だと思う場合などを、正しく扱いテストするのが難しい
- **経路の数だけテストが増える。** 保存 1 つに 3 通りの経路と、それぞれの失敗や切り替えの場面ができる

決定①②により、中継は「失敗しても問い合わせ直せばよい」読み取りと AI だけになり、中継役は利用者が指定した 1 台に固定される。複雑さの大部分がこれで消え、今の Web 版の軽快さと検索の質は、中継役がオンラインの間はほぼ保てる。

---

## 15. 未決事項・要検証

1. **Drive の権限の範囲（§8）** — 構成全体を左右する。最初に検証する
2. Drive の全文検索で、日本語の部分一致がどの程度効くか（§5.3）
3. 対応する CLI の範囲と、それぞれの出力形式・隔離の方法・履歴を残さない方法（§2.3）
4. 定額契約の CLI を、利用者本人が自分の PC 経由で中継して使うことが、各社の利用規約に合っているか
5. AgentService（エージェントのジョブ）を CLI でどこまで再現するか
6. エンドツーエンド暗号化の方式：ペアリングの手順、鍵の保存場所、端末の追加・紛失時の扱い（§7.3）
7. 「自分の CLI 設定を使う」をオンにしたときに、どこまで許可するか（§2.3）
8. Firebase の無料枠で足りるか。中継の読み書きの回数の見積もり（§7.4）
9. Web 版のオフライン入力をどこまで対応するか（§6）
10. BigQuery の事前調査（§10.4 手順 1）の結果に応じた、変換の規則の追加
11. メディアのリンクを相対パスに書き換える時期と方法（§10.3）
