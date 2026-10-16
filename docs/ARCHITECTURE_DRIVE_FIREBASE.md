# 構成変更の設計メモ：Drive 正本 ＋ AI CLI ＋ Firebase 中継（2026-10-15）

> **2026-10-16：最終案は [docs/261013/システム設計メモ_Drive正本とAI_CLI.md](261013/システム設計メモ_Drive正本とAI_CLI.md) に整理した。** この文書は検討の記録として残す。最終案では、中継を「読み取り」と「AI」だけにし（保存は全端末が Drive に直接）、中継役の PC は利用者が1台を指定する。データ変換の手順も最終案にまとめた。

状態：**構想段階（未実装）**。この文書は方針と論点の整理であり、実装・移行・デプロイはまだ行っていない。2026-10-16 更新：PC 版と Web 版の内部構成と同時開発の構成（§2.1〜§2.3）、CLI 設定の隔離とプロンプトのテンプレート（§7.1）、中継のエンドツーエンド暗号化と Firebase の運用（§7.2）、Drive トークンの更新（§8）を追記。

## 0. 決定事項と前提

| 項目 | 決定 |
|---|---|
| データの正本 | Google Drive 上の Thought ごとの `.md`（YAML frontmatter つき）。BigQuery は使わない |
| PC 版アプリの AI | ローカルの AI CLI を呼ぶ。CLI の導入・契約・ログインはユーザーに任せる |
| PC のブラウザ（Web 版）の AI | 常時起動している PC 版アプリに Firebase 経由で依頼を中継し、その PC の CLI で処理する |
| 携帯（Web 版）の AI | 使わない。DisplayMode=Edit で記録と閲覧に限る |
| Web 版 | 残す。アプリを入れていない PC と携帯から使える |
| 配布 | **他の人に配る前提**。各ユーザーは自分の Drive・自分の CLI 契約・自分の PC を使い、開発者がユーザーのデータや AI 契約を預からない |

目標は、アカウント管理・API キー管理・処理用のサーバーの運用を開発者側からなくすことである。

## 1. 現状（as-is）と Express が担っている機能

| 起動方法 | 画面の配信 | データ保存 | AI |
|---|---|---|---|
| ① `npm run dev`（ブラウザ） | Vite（5173） | BigQuery（Express 経由） | Express |
| ①' `npm run electron:dev` | Vite（5173） | ローカル `.md`（IPC 経由） | Express |
| ② Cloud Run（ブラウザ / PWA） | Express | BigQuery（Express 経由） | Express |
| ③ パッケージ版 Electron | Express（子プロセス） | ローカル `.md`（IPC 経由） | Express |

保存先の切り替えは画面側の `src/services/storage/StorageManager.ts` が行っている（`window.electronAPI` があれば Electron 用、なければ BigQuery 用）。`'local'` モード（C# API `:8081`）は WebView2 時代の名残で、使われていないはず。

Express（`server/index.ts`）が持っている機能の棚卸し。移行ではこれらの行き先をすべて決める必要がある。

| ルート | 内容 | 移行後の行き先 |
|---|---|---|
| `/api/bq/files*` | Thought の一覧・本文・保存・削除・検索・エクスポート | Drive の `.md`（§3） |
| `/api/bq/files/:id/think-support` | 思考支援メタデータ（BigQuery の `metadata` 列。`expectedVersion` による楽観ロックあり） | `<thinkid>.support.json`（§3.3） |
| `/api/think-support/conversations` | AI 会話（会話も Thought として BigQuery に保存） | 会話 Thought の `.md` ＋ AI 実行は CLI（§7） |
| `/api/think-support/progress`、`/external` | Bundle の進行状況・外部情報 | 同上（§3.3） |
| `/api/think-support/agents` | エージェントのジョブ | CLI（§7）。範囲は要検討 |
| `/api/think-support/file-search` | Gemini File Search（API キーが必要）。実装はストア一覧の確認と対応づけの記録だけ | 廃止し、資料をプロンプトに含める方式などに置き換える（§10） |
| `/api/chat` | 旧チャット（停止済み） | 削除 |
| `/api/drive/upload` | メディアのアップロード（サービスアカウント） | Drive の Vault 配下に直接置く（§3.4） |
| `/api/system/search-tags*`、`/open` | 検索タグ、ローカルファイルを開く | Electron メインプロセス（`shell.openPath` など）。Web 版では無効 |

## 2. 目標構成（to-be）

```
                          ┌──────────── Google ────────────┐
                          │  Drive（.md の正本）             │
                          │  Firebase Hosting（Web版の配信） │
                          │  Firebase Auth（Googleログイン） │
                          │  Firestore（AI依頼の中継）       │
                          └────────────────────────────────┘
        ▲ Drive API              ▲ Firestore                ▲ Drive for desktop（G:）
        │                        │                          │ ＋ Firestore を監視
 ┌──────┴──────┐        ┌────────┴────────┐        ┌────────┴─────────┐
 │ 携帯ブラウザ  │        │ PCブラウザ        │        │ PC版アプリ（常時起動）│
 │ Web版(Edit)  │        │ Web版(AIあり)     │        │ Electron           │
 │ AIなし       │        │ AIは中継経由      │        │ AI CLI を直接実行    │
 └─────────────┘        └─────────────────┘        └──────────────────┘
```

- **配信用のサーバー**：Firebase Hosting（静的ファイルを置くだけ）
- **処理用のサーバー**：なし。Express・BigQuery・Cloud Run・IAP・Secret Manager・サービスアカウントは廃止する
- Web 版は1つの SPA にまとめ、「AI を使える状態か（中継先の PC がオンラインか）」「画面幅」で機能を出し分ける。携帯向けに別のビルドは作らない

### 2.1 PC 版アプリの内部構成：Express なし、メインプロセスがすべてを担当する

```
PC版アプリ（移行後）
├─ 画面（React）       app://thinktank/ から表示。IPC でメインプロセスに依頼するだけ
└─ メインプロセス（Node）
     ├─ Drive(G:) の .md / .support.json の読み書き・索引キャッシュ・検索
     ├─ AI CLI の実行（child_process）
     └─ Firebase：ログイン、Web版からの依頼の待ち受け、応答の書き戻し
```

| 処理 | 担当 | 理由 |
|---|---|---|
| Drive（G:）のファイルの読み書き、索引、検索 | メインプロセス（IPC 経由） | 画面側はファイルやプロセスを直接扱えないようにしておく。今の `storage:*` の IPC（`electron/main.cjs`）と同じやり方 |
| AI CLI の実行 | メインプロセス | 同上 |
| Firebase（Auth と Firestore） | メインプロセス | Web 版からの依頼の待ち受けは、ウィンドウを最小化したり閉じたりしても動き続ける必要がある。Firebase の JS SDK は Node.js でも動く |
| 画面の表示 | React | 今と同じ |

**Express は PC 版でも不要になる。** 今のパッケージ版は Express を子プロセスとして起動し、`http://127.0.0.1:PORT` から画面を配信している。`electron/main.cjs` には `file://` を使わない理由として、(1) `/api/...` がサーバーに届かない、(2) CSP をかけられない、の2つが書かれている。移行後は (1) は API がなくなるので消えるが、(2) は残る。さらに、Google ログインや Firebase Auth は許可する配信元（オリジン）の登録が必要で、`file://` は登録できない。

**必須：画面は Electron のカスタムプロトコル（例：`app://thinktank/`）で配信する。** `protocol.handle` で `dist/` のファイルを返す。

- ちゃんとした配信元として扱われ、CSP もかけられる
- ポートを開かないので、ほかのアプリから localhost 経由で覗かれない
- Express の子プロセスの起動、空きポートの検索、`server.env` の読み込みなどの処理を削除できる

Google ログインはカスタムプロトコルの配信元からは直接行えないので、システムのブラウザでログインして結果を受け取る方式（PKCE と loopback）にする（§7.2）。localhost で待ち受けるのはログインの間だけで、Express ではない。

開発中も Vite だけで画面を動かせるので、`npm run electron:dev` は Express・Vite・Electron の3つを起動する今の形から、Vite と Electron の2つに減る。

### 2.2 Web 版アプリの内部構成：ブラウザの中だけで完結する

```
Web版アプリ（移行後）  ※ Firebase Hosting から配信される静的ファイル（処理用のサーバーなし）
└─ ブラウザ（React SPA）
     ├─ 画面               携帯：DisplayMode=Edit（AIなし）／PC：AIあり
     ├─ 保存               DriveApiStorageBackend → Drive API で .md / .support.json を読み書き
     │                     ＋ .thinktank/index/ の索引、IndexedDB のキャッシュ、オフライン入力の一時保存
     ├─ 検索               索引（メタデータ）＋ Drive の全文検索（fullText contains）
     ├─ ログイン           Firebase Auth（Google ログイン）＋ Google Identity Services（Drive トークンの更新）
     └─ AI（PCのみ）       Firestore に暗号化した依頼を書き込み → PC版アプリの応答を受け取る
                           PC版アプリがオフラインなら AI の機能を止める
```

| 処理 | 担当 | PC 版アプリとの違い |
|---|---|---|
| Drive のファイルの読み書き | ブラウザから Drive API | PC 版は G: をファイルとして読む |
| 一覧の表示 | `.thinktank/index/` ＋ IndexedDB のキャッシュ ＋ 差分の取得（§4.2） | PC 版はローカルの索引キャッシュ（§4.1） |
| 検索 | 索引 ＋ Drive の全文検索（§5） | PC 版はメモリ上の走査（のちに SQLite FTS5） |
| AI | Firestore 経由で PC 版アプリに依頼（§7.2） | PC 版は CLI を直接実行 |
| ローカルのファイルを開く、検索タグなど | 使えない（隠す） | PC 版はメインプロセスが担当 |
| ログイン | Firebase Auth（ポップアップでよい） | PC 版はシステムのブラウザ経由（PKCE） |

保存・検索・AI の部分は、PC 版と Web 版で同じ `IStorageBackend` などの仕組みの裏側だけを差し替える。画面のコードは共通にする。

### 2.3 開発の構成：PC 版と Web 版を同時に開発するために

今は保存以外の処理をすべて Express が共通で引き受けているので、PC 版と Web 版で違うのは保存先だけである。移行後は処理の中心が PC 版のメインプロセスと Web 版のブラウザに分かれるので、そのまま進めると同じ処理を2回書くことになり、両者の動きがずれていく。すでに frontmatter の読み書きが `electron/mdFormat.cjs`、`src/utils/thinkFormat.ts`、`server/routes/bigqueryRoutes.ts` の3か所に分かれている。

**必須：共通にする部分と差し替える部分を、次のように分ける。**

```
shared/        純粋なロジック（PC 版・Web 版の両方で使う。Node にもブラウザにも依存しない）
               ・.md / .support.json の形式、frontmatter の読み書き
               ・索引の作成、全文検索（本文だけ）、衝突の検知
               ・プロンプトのテンプレートの組み立て、回答の検証
               ・中継の依頼・応答の形式、暗号化
src/           画面（React）。PC 版・Web 版で共通
src/platform/
   ├─ electron/  IPC でメインプロセスに依頼する実装
   └─ web/       Drive API・Firestore を直接呼ぶ実装
electron/      メインプロセス（PC 版だけ）：ファイル、CLI、Firebase の待ち受け
```

1. **差し替える部分はインターフェースにする。** 今の `IStorageBackend` と同じやり方を、保存・検索・AI・ログインに広げる。画面は「保存する」「AI に聞く」とだけ呼び、PC 版か Web 版かを意識しない
2. **機能の出し分けは1か所にまとめる。** 今は `window.electronAPI` の有無を6つのファイル（`src/main.tsx`、`src/services/apiClient.ts`、`StorageManager.ts`、`ElectronStorageBackend.ts`、`DiscussMenuRibbon.tsx`、`TextEditorMedia.tsx`）で直接調べている。これを機能の一覧（`platform.capabilities`：CLI を使えるか、ローカルのファイルを開けるか、AI が使える状態か、など）に置き換え、画面はそれだけを見る
3. **共通のロジックは `shared/` に1つだけ置く。** `electron/main.cjs` は CJS 固定なので（CLAUDE.md）、`shared/` の TypeScript をメインプロセス用にバンドルして読み込む仕組みを用意する（今の `server/` → `dist-server/` と同じ考え方）。CJS で書き直して二重にしない。今の `electron/*.cjs` にあるファイル形式の処理も `shared/` に移す
4. **同じテストを両方の実装で動かす。** 「保存して読み込むと同じ内容に戻る」「外で変更されていたら保存を止める」などの契約テストを1つ書き、PC 版と Web 版の両方の実装で実行する
5. **AI の依頼は PC 版でも Web 版でも同じ形にする。** PC 版は IPC で、Web 版は Firestore 経由で、同じ形の依頼をメインプロセスに渡す。プロンプトを組み立てて CLI を実行する処理はメインプロセスの1か所だけにする。中継（§7.2）は、PC 版で動いている処理をそのまま使う

**開発のしかた**

- Vite の開発サーバーは1つ。ブラウザで `localhost:5173` を開けば Web 版、Electron で同じ URL を開けば PC 版として動く。起動するのは Vite と Electron だけ（§2.1）
- Firestore と Auth は Firebase Emulator Suite を使い、手元の PC だけで試す。PC 版とブラウザを同じ PC で同時に起動すれば、中継もその場で試せる
- Drive API にはエミュレーターがないので、開発用の Google アカウントとフォルダを用意するか、ローカルのフォルダを Drive に見立てた偽の実装を作ってテストに使う

**今より手間が増える点**

- **リリースが2系統になる。** PC 版は electron-builder、Web 版は `firebase deploy`。片方だけ更新されることがあるので、**中継の依頼の形式とファイル形式にバージョン番号を入れ**、古い PC 版と新しい Web 版の組み合わせでも壊れないようにする
- **ログインの方式が違う。** Web 版はポップアップ、PC 版はシステムのブラウザ経由（PKCE）。共通にできないので、それぞれ作ってテストする

## 3. データ設計

### 3.1 配置

```
<ユーザーが選んだ Drive フォルダ>/Thinktank/
├─ vault_ver2/            Thought ごとの .md（今の Electron 版と同じフラットな構成）
│   ├─ <thinkid>.md
│   └─ <thinkid>.support.json   思考支援データ（§3.3。あるものだけ）
├─ media/                 添付ファイル
└─ .thinktank/
    ├─ index/             Web 版用の索引（§4.2）
    └─ settings.json      端末をまたいで共有する設定
```

フォルダ名は、今の Electron 版の保存先（`%APPDATA%\thinktank\thinktank\vault_ver2`）と、BigQuery エクスポートの構成に合わせる。

### 3.2 ファイル形式

今の Electron 版の形式（`parseFrontmatter` / `saveVaultRecord`）をもとにする。frontmatter には一覧と検索に必要な基本項目（id、タイトル、タグ、作成・更新日時、種別など）だけを入れ、本文は frontmatter の後に置く。思考支援データは frontmatter に入れない（§3.3）。

### 3.3 思考支援データと会話

今は BigQuery の `metadata` 列に入っていて、`expectedVersion` で楽観ロックしている。

**必須：思考支援データは別ファイル `<thinkid>.support.json` に保存し、`.md` の frontmatter には入れない。**

- 外部連携や File Search の対応づけの履歴は上限が約 2MB の作りで、frontmatter に入れると本文の前に巨大な YAML が並び、G: から人が読んで保守しやすいという利点が損なわれる
- 本文と思考支援データは更新の頻度が違うので、ファイルを分けると同時編集の衝突の範囲を狭められる
- frontmatter には、一覧と検索に必要な基本項目（§3.2）だけを置く
- `.support.json` も `.md` と同じく、保存の直前に版を確かめる（§6）。今の `expectedVersion` の役割をこれで置き換える

移行では、BigQuery の `metadata` 列のうち基本項目以外を `.support.json` に書き出す。今の Electron 版は基本項目以外のキーをすべて frontmatter に展開している（`electron/mdFormat.cjs`、`electron/vaultSync.cjs`）ので、この処理も分けるように直す。

**処理の経路も切り替える。** 思考支援データ（`src/services/ThinkSupportService.ts`）、会話、進行状況、外部連携、File Search の対応づけは、今は Electron 版でも `StorageManager` を通らず、Express 経由で BigQuery に直接書き込んでいる。これらを保存の仕組み（`IStorageBackend`）を通すように直す。

会話は、今と同じく「会話も Thought の1つ」として `.md` で保存する。

### 3.4 メディア

`media/` の下に置き、本文からは相対パスで参照する。サービスアカウントによるアップロードは廃止する。

## 4. 起動・一覧の速さ

実測（2026-10-15、Electron 版の Vault）：**5,695 件、合計 27.2 MB、最大 1 MB**。

### 4.1 PC 版アプリ：ローカルの索引キャッシュ

1. userData の下（Drive の外）に、ファイルごとの `更新日時・サイズ・パース結果（メタデータ・本文）` を保存しておく
2. 起動したら、まずキャッシュを読んで一覧をすぐ表示する
3. 裏でフォルダ内の更新日時だけを調べ、変わったファイルだけを読み直す

キャッシュは消しても作り直せるもので、正本ではない。Drive for desktop は**ミラーモード**か「オフラインで使用可能」に設定する前提とする。ストリーミングモードでは、ファイルを開くたびにダウンロードが起きて、最初の作成がとても遅くなる。

### 4.2 Web 版：Drive 上の索引

Drive API で frontmatter を読むには1ファイルにつき1回のリクエストが要る（5,695 回）ので、そのままでは実用にならない。

- `.thinktank/index/` に、メタデータの一覧（JSON）を置く
- 複数の端末が1つのファイルを同時に書き換えて衝突しないよう、**端末ごとに分けたファイル（シャード）＋読むときに合成する**方式を基本とする。PC 版アプリが動いていれば、定期的に全体を作り直してまとめる
- 一覧を開くときは、索引を読んでから `files.list`（`modifiedTime`）で差分を確かめ、索引より新しいファイルだけを読む
- Web 版も IndexedDB にキャッシュを持ち、2回目以降は差分だけを読む

## 5. 検索

- 索引を作る段階で frontmatter と本文を分け、**全文検索の対象は本文だけ**にする（YAML が検索に引っかかる問題への対策）
- タイトルやタグは `tag:` や `title:` のように項目を指定して検索する
- PC 版：まずはメモリ上で走査する（今の規模で数十 ms）。目安として 100 MB を超える、または体感で遅くなったら、**SQLite FTS5（trigram）**の検索用索引に移る。これも作り直せるキャッシュとして扱う
- Web 版：Drive の全文検索（`fullText contains`）を使う。YAML も対象に含まれるので、結果を索引と照合して絞り込む

## 6. 同時編集と衝突

レビューで Phase 0 のブロッカーに挙げた「同時編集による上書き」は、Drive に移すとより重要になる（Drive は排他制御をしない）。

- 保存の直前に、読み込んだときの版（PC：更新日時とハッシュ、Web：Drive の `modifiedTime` や `version`）と今の版を比べ、外で変更されていたら保存を止めて利用者に選んでもらう
- Drive for desktop が作る衝突ファイル（`(1)` 付きなど）を見つけて知らせる
- PC 版は外からの変更に気づくため、`fs.watch` に頼らず、ポーリングとアプリが前面に戻ったときの再確認を組み合わせる
- Web 版のオフライン入力は IndexedDB に一時保存し、つながったときに上の手順で衝突を確かめてから送る

## 7. AI

### 7.1 PC 版アプリ：AI CLI を直接使う

- 既存の `AIProvider` の仕組みに **CLI プロバイダ**を追加する（Claude Code、Codex CLI、Gemini CLI などを想定）。起動時にどの CLI があるかを調べ、なければ AI 以外の機能だけで動く
- 会話の履歴は、CLI のセッション機能に頼らず、**アプリが毎回プロンプトに含めて渡す**。CLI を切り替えても会話が続くようにするためである
- **CLI のツール機能（ファイル編集・コマンド実行）は無効にする**か、読み取りだけに制限する
- ストリーミング表示は、CLI ごとに出力形式（例：`--output-format stream-json`）を読む
- 1回の呼び出しで数秒の起動時間がかかることを、画面設計の前提とする

**CLI 設定の隔離（必須）。** API と違い、CLI は起動するとユーザーが用意した環境を自動で読み込む（Claude Code なら CLAUDE.md、スキル、MCP サーバー、プラグイン、フック、メモリ。Codex は `AGENTS.md`、Gemini CLI は `GEMINI.md` など、CLI ごとに違う）。これは次の点で危険になる。

- ユーザーの指示が Thinktank の指示とぶつかり、回答の形式（引用マーカー `[:>1]` や citations など、今の `CONVERSATION_POLICY` が求めるもの）が崩れる
- MCP やツールを通じて、メモの内容が外部に送られたり、ファイルが変更されたりする
- 同じ依頼でも、ユーザーによって結果がばらつく

そのため、次のようにする。

1. **普段は隔離して実行する。** 空の作業フォルダで起動し、指示はアプリから明示的に渡し、ツール・MCP・ユーザー設定を読み込まない。正確なオプションは CLI ごとに確認する（§10-5）
2. **ユーザーが選んだときだけ、自分の CLI 設定を使う。** 「自分のスキルと MCP を使う」という設定を用意し、オンにした場合だけ隔離を外す。CLI に Vault フォルダを読ませる場合（§10-3）も、読み取りだけに限り、対象を Vault フォルダに限る
3. **回答は必ずアプリ側で検証する。** API のようにツールのスキーマで形式を強制できるとは限らないので、形式を検証し、崩れていたらやり直す

**プロンプトはアプリが持つ（Thinktank 自身の「スキル」）。** 思考補完・要約・Harvest などの指示（今の `server/services/AIProvider.ts` の `CONVERSATION_POLICY` に当たるもの）は、Drive の `.thinktank/prompts/` などにテンプレートとして置く。

- PC 版の CLI でも、Web 版から中継した場合（§7.2）でも、同じ指示で動く
- CLI の種類によって結果が変わりにくくなる
- ユーザーがテンプレートを自分で直せる

参考：API で呼ぶ場合は、CLAUDE.md・スキル・MCP・メモリなどは一切自動では使われず、アプリが送った system prompt・メッセージ・ツールだけが使われる。今の Thinktank も、固定の `CONVERSATION_POLICY` と、回答の形式を固定するためのツール（Anthropic の場合 `think_support_answer`）だけを送っている。

### 7.2 PC ブラウザの Web 版：Firebase による中継

```
Web版 ──(1)依頼を作成──▶ Firestore ◀──(2)変更を監視── PC版アプリ
      ◀─(4)応答を受信──           ──(3)CLI実行・応答を書き込み─▶
```

Firestore のデータ構造（案）：

```
users/{uid}/devices/{deviceId}      PC版アプリの登録情報（名前、最終接続時刻、使える CLI）
users/{uid}/requests/{requestId}    依頼：種類、パラメータ、状態、作成時刻、宛先の deviceId
users/{uid}/requests/{requestId}/chunks/{n}   応答の断片（ストリーミング表示用）
```

- **ペアリング**：PC 版アプリも同じ Google アカウントで Firebase Auth にログインすれば、同じ `uid` の Web 版からの依頼だけを受け取れる。セキュリティルールで、`users/{uid}` を本人しか読み書きできないように制限する
- **依頼の内容を限定する**：Web 版から自由なプロンプトや CLI の引数を送らせない。依頼の「種類」（例：思考補完、要約、Harvest）と、対象 Thought の id・利用者の入力文だけを受け取り、**プロンプトは PC 版アプリの中で組み立てる**
- **PC がオフラインのとき**：`devices` の最終接続時刻で判断し、Web 版は「PC がオフラインです」と表示して AI の機能を止める
- **データの後始末**：依頼と応答にはメモの内容が含まれるので、完了したら削除する。消し忘れに備えて Firestore の TTL ポリシーも設定する
- Electron で Google ログインを行うには、ポップアップ方式（`signInWithPopup`）ではなく、**システムのブラウザを開いて loopback へリダイレクトする方式（PKCE）**で認証し、その結果を Firebase Auth に渡す（`signInWithCredential`）
- 待ち受け（`onSnapshot`）はメインプロセスで行い（§2.1）、ウィンドウの状態に関係なく動かす。生きていることを示すため、`devices/{deviceId}` の最終接続時刻を定期的に更新する

処理の流れ：

```
① Web版：users/{uid}/requests/{id} に依頼を書き込む（状態 = pending）
② PC版アプリ：onSnapshot で変更をすぐに受け取る
③ PC版アプリ：状態を running にし、CLI を実行し、応答を chunks に少しずつ書き込む
④ Web版：chunks の変更を受け取り、画面に流す（ストリーミング風の表示）
⑤ PC版アプリ：状態を done にし、依頼と応答を削除する
```

**必須：中継する内容はエンドツーエンドで暗号化する。** Firestore のデータは、プロジェクトの管理者（開発者）なら Firebase のコンソールから読める。他の人に配る以上、利用者のメモの内容を開発者が読める状態にしてはならない。

- 最初のペアリングのとき（PC 版アプリが表示する QR コードを Web 版で読むなど）に、Web 版と PC 版アプリの間で鍵を交換する
- Firestore には暗号文だけを置く。依頼の種類や状態など、中継に必要な最小限の項目だけを平文にする
- 鍵は各端末の中だけに保存し、Drive や Firestore には置かない
- これにより、開発者も Google も中継の中身を読めない。「完了したら削除する」方針と合わせて、プライバシーポリシーに明記する

**Firebase のセキュリティの考え方。** サーバーを置かないので、ブラウザと PC 版アプリが Firestore に直接アクセスする。安全は次の2つで守る。

- **セキュリティルール**：`users/{uid}` の下は、`request.auth.uid == uid` の本人だけが読み書きできるようにする
- **App Check**：正規のアプリ以外からのアクセスを防ぐ（配布する場合は入れる）

Web 版に埋め込む Firebase の設定（`apiKey` など）は「どのプロジェクトか」を示す識別子で、秘密の情報ではない。今の Express のようにサーバーに秘密の鍵を隠す仕組みとは考え方が逆である。

**料金と負担。** Spark（無料）プランは 1 日あたりの無料枠（目安：Firestore の読み取り 5 万回・書き込み 2 万回、保存 1GB。Hosting の保存 10GB・転送 360MB。正確な値は使い始める前に公式で確認する）を超えると止まる。1 回の AI 依頼は数十回の書き込みなので、個人なら十分収まる。ただし**配布すると全員分の利用量が開発者のプロジェクトにかかり、費用は開発者が負担する。** 利用者が増えたら Blaze（従量課金）プランに移り、予算アラートを設定する。Cloud Functions は使わない（処理用のサーバーになるうえ、Blaze が必要になる）。

**開発とテスト**には Firebase Emulator Suite を使い、本番のプロジェクトに触れずにルールと中継の動作を確かめる。

### 7.3 携帯の Web 版

AI は使わない。DisplayMode=Edit で記録・閲覧・簡単な編集を行う。

## 8. 認証と Drive へのアクセス権限 — **最大の検証課題**

| 利用形態 | Drive へのアクセス方法 | 必要な認証 |
|---|---|---|
| PC 版アプリ | Drive for desktop のフォルダ（G:）をファイルとして読み書き | Drive には不要。中継のために Firebase Auth は必要 |
| Web 版 | ブラウザから Drive API | Google OAuth |

**問題：Drive の権限の範囲。** 他の人に配る場合、`drive.file`（アプリが作ったファイルや、ユーザーが選んだファイルだけにアクセスできる）を使えば Google の厳しい審査を避けられる。しかし、**PC 版アプリが G: にファイルとして書き込んだ新しいファイルは「Web 版のアプリが作ったファイル」とは見なされず、Web 版から見えない可能性が高い**。ドライブ全体にアクセスする `drive` 権限は審査対象（restricted）で、毎年のセキュリティ評価（CASA）が必要になり、個人で配る規模では負担が大きい。

選択肢（実装の前に必ず検証する）：

- **A.** Web 版で Google Picker を使い、ユーザーに Vault フォルダを選んでもらう。そのとき、**フォルダの中の既存ファイルや、あとから外で作られたファイルにも `drive.file` でアクセスできるか**を確かめる
- **B.** PC 版アプリもファイルとしてではなく Drive API（`drive.file`、同じ Google Cloud プロジェクトの OAuth クライアント）で書き込み、すべてのファイルを「このアプリが作ったもの」にする。G: から読む・既存のファイルを編集する分には問題ないが、**利用者が G: で新しく作ったファイルは、アプリが取り込むまで Web 版から見えない**
- **C.** `drive` 権限を使い、審査を受ける（配布の規模が大きくなってから検討する）

開発中や少人数での試用なら、審査前の「テスト」状態で `drive` 権限を使える（テストユーザーは 100 人まで）。ただし外部ユーザーのトークンが 7 日で切れる。

**Drive のアクセストークンの更新（必須）。** Web 版で Firebase Auth の Google ログインと同時に Drive の権限を要求すると、ログイン時に Drive 用のアクセストークンも得られる。しかしこれは約 1 時間で切れ、**Firebase は自動で更新しない**。Web 版では Google Identity Services を併用し、トークンが切れる前に（または切れたときに）取り直す。PC 版で Drive API を使う場合（選択肢 B）も、メインプロセスでリフレッシュトークンを安全に保存して更新する（OS の資格情報ストアなどを使う）。

Firebase のプロジェクトは Google Cloud のプロジェクトでもあるので、Drive の権限の同意画面と審査も同じプロジェクトで行う。

## 9. 配布に必要なもの

**PC 版アプリ**
- 初回設定：Vault フォルダの選択、Google ログイン（中継を使う場合）、AI CLI の有無の確認と導入手順の案内
- Windows のコード署名（署名がないと SmartScreen に警告される）
- 自動アップデート（electron-updater と GitHub Releases など）
- パッケージに秘密情報を含めない（今の `server.env` の扱いを廃止する）
- Express（`dist-server`）を同梱しない。画面はカスタムプロトコルで配信する（§2.1）

**Web 版**
- Firebase プロジェクト（Hosting、Auth、Firestore、App Check）。利用者が増えたら Blaze プランと予算アラート（§7.2）
- Google OAuth の同意画面、プライバシーポリシー、利用規約のページ
- 権限の範囲の決定と、必要に応じた Google の審査（§8）

**ユーザーが自分で用意するもの**：Google アカウント、Drive for desktop（PC 版）、AI CLI とその契約（AI を使う場合）

## 10. 未決事項・要検証

1. **Drive の権限の範囲（§8）** — 構成全体を左右する。最初に検証する
2. （決定済み：思考支援データは `<thinkid>.support.json` に分ける。§3.3）
3. Gemini File Search の扱い — 今の実装は、ストア一覧の確認と Bundle との対応づけの記録だけで、資料のアップロード・検索・AI の回答への利用は未実装。やめても失われる機能は小さい。代わりに、Bundle の資料をプロンプトに直接含めるか、CLI に Vault フォルダを読み取り専用で読ませる（§7.1 のツール制限の例外として、読み取りと Vault フォルダに限る）
4. AgentService（エージェントのジョブ）を CLI でどこまで再現するか
5. 対応する CLI の範囲と、それぞれの出力形式・隔離の方法（system prompt の指定、ツール・MCP・ユーザー設定を読み込まない方法、CLI 側に履歴を残さない方法）。§7.1
6. 定額契約の CLI を、利用者本人が自分の PC 経由で中継して使うことが、各社の利用規約に合っているかの確認
7. Firebase 無料枠（Spark プラン）で足りるか。読み書きの回数の見積もり
8. Web 版のオフライン入力をどこまで対応するか
9. 既存の BigQuery データ（`vault_ver2` と思考支援メタデータ）の移行方法と、移行前のバックアップ・復元確認
10. エンドツーエンド暗号化の方式：ペアリングの手順（QR コードなど）、鍵の保存場所、端末を追加・紛失したときの扱い（§7.2）
11. 「自分の CLI 設定を使う」設定をオンにしたときに、どこまで許可するか（§7.1）

## 11. 移行の順序（案）

1. **検証**：§8 の Drive 権限（Picker とフォルダ、`drive.file` で見える範囲）、§10-6 の利用規約、CLI の非対話実行を、小さな試作で確かめる
2. **開発の土台**：`shared/` と `src/platform/` を作り、`shared/` をメインプロセス用にバンドルする仕組みを用意する。ファイル形式の処理を `shared/` に集め、`window.electronAPI` の直接の判定を `platform.capabilities` に置き換え、契約テストを書く（§2.3）
3. **データ移行**：BigQuery の内容を Drive の `.md` に書き出す（既存の `/api/bq/files/export` を活用できる）。バックアップと復元を確認する
4. **PC 版アプリ**：Vault の保存先を選べるようにし、索引キャッシュと衝突検知を入れる。この時点で BigQuery への同期は止める
5. **PC 版の AI**：CLI プロバイダ（隔離実行とアプリ側のプロンプトのテンプレートを含む）をメインプロセスに追加し、思考支援・会話のデータを Drive 側に移す
6. **PC 版から Express を外す**：画面をカスタムプロトコルで配信し、Express の子プロセスの起動と `server.env` の読み込みを削除する。`electron:dev` を Vite と Electron だけにする
7. **Web 版**：`IStorageBackend` に `DriveApiStorageBackend` を追加して `BigQueryStorageBackend` を置き換え、Firebase Hosting と Auth に載せ替える。Drive のトークン更新を入れる
8. **中継**：Firestore を使った依頼と応答の仕組みを、エンドツーエンド暗号化とペアリングを含めて、PC 版アプリ（メインプロセス）と Web 版の両方に実装する。セキュリティルールと App Check を設定する
9. **廃止**：Express（`server/`）、BigQuery、Cloud Run、IAP、Secret Manager、サービスアカウントを止め、`StorageManager` の `'local'` モードなど使われていないコードを削除する
10. **配布の準備**：コード署名、自動アップデート、初回設定、OAuth の同意画面と審査
