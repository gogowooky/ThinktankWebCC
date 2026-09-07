# Thinktank

Thinktank — Electron + React + TypeScript + Express のデスクトップアプリ。
アイデアをVaultに蓄積し、AIとの対話で思考を補完する。

## 更新履歴

<!-- git-update スキルがコミットのたびにこの直下へ新しい順で追記する -->

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
