# linkファイル仕様（links 種別Thinkファイル）

状態: 実装済み（2026-10-30）。書式と判定は `src/utils/linkFormat.ts` に集約している。

## 1. 役割

- linkファイルは、web URL またはファイルパス **1件** に関する情報をまとめる Thinkファイル（ContentType = `links`）。
- 参照する側の本文からは `[link:{ID}]` のようなタグで引用する（`{ID}` は linkファイルの ThinkID）。

## 2. 書式

| 行 | 内容 |
|---|---|
| 1行目 | タイトル（webページのタイトル、ファイル名など） |
| 2行目 | 空行、または `=` の連続（新規作成時は `=`） |
| 3行目以降 | 下記の見出し構成の Markdown |

```
Example Domain
=
# Link
https://example.com/
# Affiliation
example.com
# Abstract
リンク先の概要
```

- `# Link` — リンク先の URL またはパス（1行）。
- `# Affiliation` — URL ならサーバーアドレス（`URL.host`。ポートがあれば含む）、パスなら「PC名:ルート」。
  - ルートは Windows のドライブ（`C:`）、UNC の共有（`\\server\share`）、Unix の最上位フォルダ（`/home`）。
  - PC名は Electron 版ではOSのホスト名。ブラウザ版ではホスト名を知る手段が無いため `unknown`。
  - ブラウザ版のファイルD&Dのようにファイル名しか取れない場合は空にする。
- `# Abstract` — リンク先の概要。作成時は空。
- 見出し名の大文字小文字、CRLF は読み取り時に問わない。

## 3. 参照タグ

タグ名はリンク先から `linkTagNameOf()` が決める（ホスト名は完全一致、https のみ）。

| タグ | 判定 |
|---|---|
| `gmail` | `mail.google.com` |
| `gdrive` | `drive.google.com`、`docs.google.com`（Docs/Sheets/Slides も Drive 上のファイル） |
| `gphoto` | `photos.google.com`、`photos.app.goo.gl` |
| `gnb` | `notebook.google.com`、`notebooklm.google.com`（旧 NotebookLM の保存済みリンク） |
| `path` | ドライブ・UNC・`/` で始まるパス、`file:` URI、スキームの無い文字列 |
| `link` | 上記以外（http の Google URL、`mailto:` なども含む） |

- タグ名の大文字小文字は問わない（`[GDrive:ID]` も可）。
- 値が ThinkID の形式のときだけ Link タグとして扱う。`[GMail:検索語]` のような値は
  `docs/261028/GMail_GDrive_AIタグ増設計画.md` の検索タグ用に残している。

### 参照側の動作

| 操作 | 動作 |
|---|---|
| DoOnCursorPos（ダブルクリック等） | リンク先を開く（`DoOnCursorPos:Link:Open`）。URL はブラウザ、パスはOS既定アプリ（PC版のみ）。http(s) 以外のURLは開かない |
| DoOnCursorPos:Menu の「Link」 | O) リンク先を開く / L) linkファイルを開く（`DoOnCursorPos:LinkFile:Open`） / D) タグを除く |
| Thinkファイルの Alt+ドロップ（Insert） | linkファイルならリンク先に応じた `[gdrive:ID]` 等、それ以外は従来どおり `[memo:ID]` を挿入 |

## 4. 作成

- Working のタイトル（リボン）とPane の外への URL/パスのドロップでは、新しい linkファイルを作成して表示する
  （`TTVault.CreateLinksThink`）。TextEditor本文へのドロップでは「そのまま挿入」または
  「linkファイルを作成して参照タグを挿入」をメニューで選ぶ（`TextEditor.CurrentEditor.DDInsert:*`）。
- Windowsの `.url`、Electron版の `.lnk` はショートカット自身ではなくリンク先を解決する。
- linkファイルを開いた Pane の本文へのドロップも、追記せず新しい linkファイルを作って Pane を差し替える（1リンク=1ファイル）。
- AI CLI の `thinktank_create_think`（category=links）の説明にも同じ書式を記載している。

## 5. 旧書式との互換

- 旧書式（1行目タイトル、以降に `* [タイトル](URL)` の箇条書きを並べたリンク集）は **読み取りだけ** 互換を保つ。
  `# Link` が無い linkファイルは、箇条書きの先頭のリンクをリンク先とみなす。
- 旧書式のファイルを新書式へ変換・分割・削除する処理は持たない（2026-10-30 ユーザー判断）。
