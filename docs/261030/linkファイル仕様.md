# linkファイル仕様（links 種別Thinkファイル）

状態: 実装済み（2026-10-30）。書式と判定は `src/utils/linkFormat.ts` に集約している。

## 1. 役割

- linkファイルは、web URL またはファイルパス **1件** に関する情報をまとめる Thinkファイル（ContentType = `links`）。
- 参照する側の本文からは `[link:{ID}]` のようなタグで引用する（`{ID}` は linkファイルの ThinkID）。

## 2. 書式

| 行 | 内容 |
|---|---|
| 1行目 | タイトル（webページのタイトル、ファイル名など） |
| 2行目 | 空行、または `=` の連続（新規作成時は `=` 30個） |
| 3行目以降 | 下記の見出し構成の Markdown |

```
Example Domain
==============================
# Caption
Example Domain
# Link
https://example.com/
# Affiliation
example.com
# 作成端末
pc_MYPC_a1b2c3
# Abstract
リンク先の概要
```

- `# Caption` — 参照タグの後ろに添える表示名（2026-11-08 追加）。作成時に次の値を入れる。
  | 種別 | 値 |
  |---|---|
  | GDrive | ファイル名またはフォルダー名 |
  | GMail | メールタイトル |
  | GPhoto | 撮影日を `yyyy-MM-dd` で。撮影場所が分かれば `yyyy-MM-dd(撮影場所)` |
  | path | ファイルは `File:{ファイル名}`、フォルダは `Folder:{フォルダー名}` |
  | link | リンク先タイトル。不明なら Affiliation の値 |
  - タイトルはブラウザからのドラッグに付く `text/html`（`<a>` のテキスト・aria-label）か、
    アドレスバーからのドラッグで作られる `.url` のファイル名から取る。タブ名の「 - Google ドライブ」
    「 - 〇〇@gmail.com - Gmail」等は外す。
  - GDrive・GMail は、設定されていれば利用者の GAS に名前・件名を問い合わせ、ドラッグ情報より優先する
    （`docs/261108/GASリンクタイトル取得.md`）。
  - GDrive・GMail・GPhoto もタイトルが分からなければ Affiliation の値にする。
  - GPhoto の撮影日はサムネイルの説明から読む。撮影場所はドラッグ情報に含まれないことが多く、
    分からなければ日付だけにする。
  - Caption 項の無い旧ファイルは、1行目のタイトル等から補って使う（`captionOfLinkFile`）。

- `# Link` — リンク先の URL またはパス（1行）。パスは `"C:\path\file.jpg"` のように引用符で囲む。
- `# Affiliation` — URL ならサーバーアドレス（`URL.host`。ポートがあれば含む）、パスなら
  `"(PC名)親フォルダ"`（例：`"(MYPC)C:\Users\me\Pictures"`）。
  - PC名は Electron 版ではOSのホスト名。ブラウザ版ではホスト名を知る手段が無いため `unknown`。
  - ブラウザ版のファイルD&Dのようにファイル名しか取れない場合は空にする。
- `# 作成端末` — linkファイルを作成した端末の id（2026-11-10 追加。`src/utils/deviceId.ts`）。
  - Electron 版は設定画面の PC連携に表示される Device ID（例 `pc_MYPC_a1b2c3`）。
  - ブラウザ版はブラウザごとに初回発行して localStorage に保存する `web_<16進8桁>`。
  - 作成時に書き、その後は変えない。この項の無い旧ファイルは空として読み、書き直しても項を足さない。
  - 最後に保存した端末は、本文ではなく metadata の `savedDeviceId` に記録される（全種別共通）。
- `# Abstract` — リンク先の概要。作成時は空。
- 見出し名の大文字小文字、CRLF は読み取り時に問わない。
- 読み取り時は旧来の引用符なしpath／Affiliationにも対応する。

## 3. 参照タグ

タグ名はリンク先から `linkTagNameOf()` が決める（ホスト名は完全一致、https のみ）。

| タグ | 判定 |
|---|---|
| `gmail` | `mail.google.com` |
| `gdrive` | `drive.google.com`、`docs.google.com`（Docs/Sheets/Slides も Drive 上のファイル） |
| `gphoto` | `photos.google.com`、`photos.app.goo.gl` |
| `gnb` | `notebook.google.com`、`notebooklm.google.com`（旧 NotebookLM の保存済みリンク） |
| `file` | ドライブ・UNC・`/` で始まるパス、`file:` URI、スキームの無い文字列のうちファイル |
| `dir` | 同じくパスのうちフォルダ（Caption が `Folder:` で始まるもの） |
| `link` | 上記以外（http の Google URL、`mailto:` なども含む） |

- パスのタグ名は `linkTagOfFile()` が linkファイルの Caption から決める（2026-11-08 に `path` から分けた）。
  既存の `[path:ID]` は読み取りだけ互換を保つ。

- タグ名の大文字小文字は問わない（`[GDrive:ID]` も可）。
- 値が ThinkID の形式のときだけ Link タグとして扱う。`[GMail:検索語]` のような値は
  `docs/261028/GMail_GDrive_AIタグ増設計画.md` の検索タグ用に残している。

### 参照側の動作

| 操作 | 動作 |
|---|---|
| DoOnCursorPos（ダブルクリック等） | リンク先を開く（`DoOnCursorPos:Link:Open`）。URL はブラウザ、パスはOS既定アプリ（PC版のみ）。http(s) 以外のURLは開かない |
| DoOnCursorPos:Menu の「Link」 | O) リンク先を開く / L) linkファイルを開く（`DoOnCursorPos:LinkFile:Open`） / D) タグを除く |
| Thinkファイルの Alt+ドロップ（Insert） | linkファイルならリンク先に応じた `[gdrive:ID]` 等、それ以外は従来どおり `[memo:ID]` を挿入 |

- `gmail`・`gdrive`・`link`・`file`・`dir` のタグを作るときは、タグの後ろに半角空白と Caption を添える
  （例：`[gdrive:ID] 見積書.pdf`、`[file:ID] File:plan.md`、`[dir:ID] Folder:Pictures`）。`gphoto`・`gnb` は添えない。

## 4. 作成

- Working のタイトル（リボン）とPane の外への URL/パスのドロップでは、新しい linkファイルを作成して表示する
  （`TTVault.GetOrCreateLinksThink`）。TextEditor本文へのドロップでは「そのまま挿入」または
  「linkファイルを作成して参照タグを挿入」をメニューで選ぶ（`TextEditor.CurrentEditor.DDInsert:*`）。
- 作成前に同じリンク先の linkファイルを探し、あれば新しく作らずそれを開く／そのタグを挿入する
  （`TTVault.FindLinksThink`）。Windowsのパスは区切り・大文字小文字・末尾区切りを問わず、URLは完全一致で比べる。
  新しく作る linkファイルは Metadata の `linkTarget` にリンク先を控え、本文を読まずに照合できるようにする。
  `linkTarget` の無い旧ファイルは本文を読んで確かめる。
- Windowsの `.url`、Electron版の `.lnk` はショートカット自身ではなくリンク先を解決する。
- linkファイルを開いた Pane の本文へのドロップも、追記せず新しい linkファイルを作って Pane を差し替える（1リンク=1ファイル）。
- AI CLI の `thinktank_create_think`（category=links）の説明にも同じ書式を記載している。

## 5. 旧書式との互換

- 旧書式（1行目タイトル、以降に `* [タイトル](URL)` の箇条書きを並べたリンク集）は **読み取りだけ** 互換を保つ。
  `# Link` が無い linkファイルは、箇条書きの先頭のリンクをリンク先とみなす。
- 旧書式のファイルを新書式へ変換・分割・削除する処理は持たない（2026-10-30 ユーザー判断）。
