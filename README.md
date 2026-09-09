# Thinktank

Thinktank — Electron + React + TypeScript + Express のデスクトップアプリ。
アイデアをVaultに蓄積し、AIとの対話で思考を補完する。

## 更新履歴

<!-- git-update スキルがコミットのたびにこの直下へ新しい順で追記する -->

### v1.4.57 feat: Chat一覧に種類・状態フィルタを追加、AIChat入力欄に説明選択と管理変更取り消しを移設
- 日付: 2026-09-09
- コミット番号: c26c861

`src/components/ThinktankPanel/ChatListFilters` を新設し、管理Chatを種類
（TODO/PROJ/ASK/EVNT/LOOP/未分類）と状態（未着手〜中止/状態未設定）のアイコンで
絞り込めるようにした。初期表示は全種類・完了/中止のみ非表示で、`ThinktankChatMemoPicker`
の「完了・中止も表示」チェックを置き換え。`FilterSelectDialog` に「種類」「状態」の
表示切替（type 非表示時のみ有効）を追加。`AiChatView` は入力欄フォーカス時に
「説明の長さ」セレクタと「直前の管理変更を戻す」（返信アイコン）を表示し、`SupportChat`
ヘッダーから移設した。`docs/Thinktank_AI_EntryUser_Manual` を新UIに合わせて更新し、
開発者向け読解サマリ `docs/Thinktank_AI_ThoughtSupport_CodeSummary` を追加。
テスト182件パス、型検査成功。

### v1.4.56 feat: AIChat思考支援の基盤実装（ThoughtSupport）と各パネル整理、AIモデル設定を追加
- 日付: 2026-09-09
- コミット番号: 677c0ee

運用仕様案に沿って、相談ごとにAIが必要な視点を選ぶ思考支援の基盤を追加した。
`src/components/ThoughtSupport/`（SupportChat）と関連 hooks/services
（`thoughtSupport` / `thoughtSupportEffects` / `openSupportChat` / `useSupportChats` /
`useSupportSelection` / `storage/localMetadata`）を新設し、Thinktank・Overview・
ReThink・Workout の各 Area／SettingArea と ChatMedia の共通ロジックを ThoughtSupport
側へ寄せて整理（大幅な行数削減）。AIモデル設定を `server/config/aiModels.ts` と
`src/services/aiModels.ts` に集約し、Gemini 向け `geminiParts` を追加。Electron に
`vaultSave.cjs` を追加し `main.cjs` を整理。あわせて実装内容・確認方法、簡易ユーザー
マニュアル各種、推奨ショートカット案、追加UI案、初心者ガイド（`docs/slides/`）を
追加した。`.gitignore` に MS Office 一時ロックファイル（`~$*`）を追加。
テスト179件パス、型検査・server ビルド成功。

### v1.4.55 feat: Think一覧・種別フィルタのHTMLアイコンをfile-codeに統一、思考支援運用仕様案を追加
- 日付: 2026-09-08
- コミット番号: 8d6b5db

Thinktank/Overview の Think一覧で、種別フィルタのアイコンと一覧各行の種別アイコンについて、
`html` を `Globe` から `FileCode`（file-code）に変更し、フィルタと一覧行の表記を統一した。
`nettext`（WebText）は従来どおり `Globe` のまま。
あわせて、これまでの議論を統合した運用仕様案
`docs/Thinktank_AI_ThoughtSupport_Operation.md` を追加（今回は文書化のみで、将来仕様を
実装済みとは扱わない）。

### v1.4.54 feat: HTML Media対応、BundleStatusView、managedChatを追加
- 日付: 2026-09-07
- コミット番号: 401ff2e

思考支援UIを追加（詳細はdocs/ThoughtSupport_UI_Plan.md参照）。
Overview「Bundle分析」に「この課題の状況」を追加し、対象Bundle配下の管理Chatを
タイトル解析（種類:担当｜[状態]タイトル、TODO/PROJ/ASK/EVNT/LOOPを認識）した
状態別一覧として表示、各行からWorkoutで元Thinkを開けるようにした。
Memo/Chat/Tableと同じContentTypeとして`html`を新設し、隔離iframe（スクリプト・
フォーム送信・外部通信は禁止、閲覧専用）でのHTML表示とテキストエディタでの
ソース編集を切り替え可能にした。TextEditor設定から`.html`/`.htm`の取り込み・
書き出しにも対応。既存142件のテストに加えHTML保存・再読込テストを1件追加。

### v1.4.53 feat(texteditor): SearchTagのVaultメモ読込を追加、KeyBinding.Loadのマージ不整合を修正
- 日付: 2026-09-07
- コミット番号: f93fffa

TextEditor.SearchTag.Load/Reset を追加。Vault内の「ThinktankSearchTag」というMemoを
検索し、docs/DefaultSearchTag.mdと同じID,Description,URL形式でタグ定義を上書きする
（id一致分のみ置換、他は維持）。DefaultSearchTag.mdはサーバーAPI経由で配信されるため
サーバーは無改修とし、クライアント側の2消費モジュールにサーバー取得分とVault上書き分を
分けて持たせ、idキーでマージするよう変更した。
あわせて、TextEditor.KeyBinding.Loadが従来「メモに書かれていないショートカットが消える」
不整合な挙動だった問題を修正（現在の設定へid一致分だけをマージするmergeContent()を新設）。
Workout>TextEditor設定>設定に「タグ設定」項目を追加し、「Color設定」は「色設定」に改名。

### v1.4.52 chore(git-update): README.md追記項目にコミット済みバージョン番号を追加
- 日付: 2026-09-07
- コミット番号: 3522995

git-updateスキル（.claude/skills/git-update/skill.md、.agent/skills/git-update/skill.md）を
更新し、README.mdへ追記するエントリに「コミットしたバージョン番号」を含めるようにした。
以後のエントリは見出しに `v{version}` を付す形式になる。

### docs: 完了済みの実装依頼を各カタログセクションへ整理・統合
- 日付: 2026-09-07
- コミット番号: 0b8a204

docs/Thinktank_Status-Action-Binding.md の先頭にある実装依頼欄（AIへの指示欄）で
対応完了していたエントリ（TextEditor.CurrentEditor.CursorPos:Focus、
ToolBar.HighlighterMode.Text の Content/Title 絞り込みキーワードフラグ2件）を、
それぞれ該当するカタログセクション（# TextEditor Cursor、# Status）へ移動・統合し、
依頼欄を次の依頼に備えて整理した。

### feat(texteditor): Vaultメモからキー設定・色設定を読み込むアクションを追加
- 日付: 2026-09-06
- コミット番号: da7e0ff

TextEditor.KeyBinding.Load/Reset と TextEditor.ColorBinding.Load/Reset を追加。
Vault内の「ThinktankKeyBinding」「ThinktankColorBinding」というMemoを検索し、
見つかればそれぞれショートカット設定・色設定を上書きする（Resetは各Defaultファイルに戻す）。
色設定側は多数プロパティの一括適用でUndoスタックがスパムされないよう、
TTUIStateManagerにpushUndoを迂回できるapplyProperties()を新設。
Workout>TextEditor設定>設定に「キー設定」「Color設定」項目（Star/Powerアイコン）を追加し、
docs/Thinktank_Status-Action-Binding.mdに4アクションをカタログ追記した。
