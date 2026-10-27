# パネル改名 Discuss → Working 作業計画

対象: `DiscussPanel` → `WorkingPanel`、`DiscussSettingPanel` → `WorkingSettingPanel`（短縮名 `Discuss` → `Working`、`DiscussSetting` → `WorkingSetting`）。
状態: 計画のみ。コードは未変更（2026-10-27 時点）。

## 0. 前提と規模

- 現行コードに `Working` の利用箇所はない（衝突なし）。
- `Discuss` 122ファイル・約820箇所、`discuss`（CSSクラス・キー等）57ファイル・約490箇所。
- 過去2回の改名（Workout→Develop→Discuss）で入れた互換レイヤー `src/utils/panelNames.ts` がそのまま使える。

## 1. 互換レイヤーの方針

原則は過去2回と同じ「**読み込み境界で旧名→新名に正規化し、書き込みは新名のみ**」。保存済みデータの一括書き換え（マイグレーション）はしない。

| 対象 | 置き場所 | 方針 |
|---|---|---|
| UI状態キー・値（`DiscussPanel.Panes.Count` 等） | `TTUIStateManager.ts` → `canonicalPanelStatusKey` | 読み替え表に Discuss 系を追加。保存時は新キーで上書きされ自然に移行 |
| ショートカット定義（Focus/Action 列） | `TTShortcutManager.ts` → `canonicalPanelPrefix` | 同上。ユーザー編集済みCSVも読める |
| localStorage `thinktank.support.selection:<vault>:Discuss` | `useSupportSelection.ts` の `legacyOwners` | `Working: ['Discuss', 'Develop', 'Workout']` |
| localStorage `tt-ai-model-discuss` | `TTUIStateManager.ts` 137行付近 | 候補キー列に `tt-ai-model-working` を先頭追加、旧キーは読むだけ |
| Firestore の `TaskRelation.panel` | `taskRelation.ts` の検証 | `'Discuss' \| 'Develop' \| 'Workout'` を受理し `'Working'` に正規化。書き込みは `'Working'`（`TTVault.ts` 436行） |
| 管理チャットのタイトル `TODO:Discuss｜…` | `managedChat.ts` の正規表現 | 解析対象に `Working` を追加し、`Discuss` は読み替え。**既存タイトル文字列は書き換えない**（ユーザーの本文なので） |
| 表示モード値 `DiscussSettingPanel.Mode.Name=discuss` | `TTUIStateManager.ts` 46行・`discussSpecs.ts` 28行 | 旧値リストに `discuss` を残したまま `working` を追加 |
| カスタム DomainProfile の `panelRoles.Discuss` | `shared/domainProfile.ts` 722行のマージ | `obj.panelRoles?.Working ?? obj.panelRoles?.Discuss` で拾う |
| PC連携の `panelRole`（`'discuss'`） | `shared/relayProtocol.ts`・`promptBuilder.ts`・`relayAgent.cjs` | 下記「2段階リリース」 |

### `panelNames.ts` の変更イメージ

- `LEGACY_PANEL_NAMES` の行き先を全て `Working*` に変え、`Discuss*` を旧名として追加する（旧→旧→新の多段にはせず、全旧名を直接新名へ）。
- `canonicalPanelPrefix` の正規表現は、表のキーから組み立てる形にする（手書きの列挙をなくし、追加漏れを防ぐ）。長い名前から先に照合されるよう長さ順に並べる。
- `LEGACY_STATUS_KEYS` の `Discuss*` 行は、正規化後の名前（`WorkingPanel.Pane.Count` 等）で引けるように書き換える。
- 「`TextEditor.WorkoutNotes` を変換しない」型のテストを `Discuss`／`Working` についても追加する（単語境界の確認）。

### PC連携（Web⇔Electron）の2段階リリース

Web版とElectron版のバージョンがずれる期間があるため、通信値は2段階で切り替える。

1. **v2.7.0（受理の拡張）**: 両側で `panelRole` に `'working' | 'discuss'` を受理し、内部では `Working` に正規化する。**送信値は `'discuss'` のまま**。
2. **v2.7.x 以降（送信の切替）**: 両側が受理できるようになってから、送信値を `'working'` に変える。`'discuss'` の受理は当面残す。

`shared/` を変えたら `node scripts/build-electron-shared.mjs` を実行して Electron を再起動する。

## 2. 作業手順（層ごと・1手順＝1コミット目安）

各手順の終わりに `npx tsc --noEmit` とテストを通す。

### 手順0: 準備
- 現在ブランチの未コミット変更（`shared/promptBuilder.ts`、`shared/index.ts`、`electron/aiCliRunner.cjs`、mcp 関連）を先にコミットするか、別ブランチに分ける。
- 改名用ブランチを作る。現状の `Discuss` 出現数を記録しておく（完了確認に使う）。

### 手順1: 互換レイヤーとテスト（先に入れる）
- `panelNames.ts` を上記の方針で拡張し、`panelNames.test.ts`・`TTUIStateManager.panelNames.test.ts`・`useSupportSelection.panelNames.test.tsx`・`managedChat.test.ts`・`taskRelation.test.ts` に「Discuss → Working」のケースを追加する。
- この時点では内部名がまだ `Discuss` なので、テストは「新名」を期待値にした失敗状態で書いておき、手順3で緑になるようにする。または手順1と3を1コミットにまとめる。

### 手順2: shared 層（型・プロファイル・プロトコル）
- `shared/domainProfile.ts`: `PanelId`・`PanelRoleKey`・`panelRoles.Discuss`・`panelAffinity`・カスタムプロファイルのマージ。
- `shared/promptBuilder.ts`: 既定値 `'Discuss'`。
- `shared/relayProtocol.ts`: 受理側の拡張のみ（送信値はまだ変えない）。
- `shared/shared.test.ts`。
- `electron/relayAgent.cjs` の既定値（受理側）。
- shared-dist を作り直す。

### 手順3: ロジック層（views / services / utils / models）
- クラス名・ファイル名: `TTDiscussPanel.ts`→`TTWorkingPanel.ts`、`TTDiscussArea.ts`、`insertDiscussPane.ts`、`settings/discussSpecs.ts`、関連テスト。
- `TTApplication.ts` のプロパティ `app.DiscussPanel` → `app.WorkingPanel`（参照が多いので型検査で網羅）。
- 文字列: `getFocusName.ts`、`TTFocusedPanelActions.ts`、`TTShortcutManager.ts`（既定ショートカット）、`settings/*Specs.ts` の設定キー、`panelBehavior.ts`、`panelTheme.ts`、`panelAreaWidth.ts`、`thoughtSupport.ts` の `PANELS`、`taskRelation.ts`、`managedChat.ts`、`TTVault.ts`、`ConversationService.ts`、`openSupportChat.ts`。
- 型 `DiscussViewMode` などの型名。

### 手順4: コンポーネント層（TSX・フォルダ）
- `src/components/DiscussPanel/` → `src/components/WorkingPanel/`、中のファイル名を `Working*` に変更（`git mv` で履歴を残す）。`settings/useDiscussSettingsState.ts`、`DiscussSettings.test.tsx` も含む。
- import パスの更新。`App.tsx`・`AppLayout.tsx`・`SeedsArea.tsx`・`ThinktankArea.tsx` などパネル外からの参照。

### 手順5: CSS 層（型検査で検出できないため慎重に）
- クラス名 `discuss-*`、CSS 変数 `--*discuss*` を `working-*` に変更（`src/index.css` 14箇所、`DiscussSettingArea.css` 71箇所など約440箇所）。
- 置換後に「TSX 内の className 文字列」と「CSS セレクタ」を突き合わせて未使用・未定義を洗い出す（grep で `discuss` が 0 件になることを確認）。
- テーマ色のステータスID（`Discuss.Theme.Color` 等）は手順1の互換レイヤーで旧保存値を読む。

### 手順6: 表示文言
- 画面上の「Discuss」表記、AI の役割プロンプト本文中の「（Discussパネル）」。
- 表示名を英語の `Working` にするか日本語表記にするかは未決事項（下記）。

### 手順7: ドキュメント
- `CLAUDE.md`（パネル構成・変更前の注意の `src/components/DiscussPanel/`）、`docs/requirements.md`、`docs/concept.md` の該当箇所。
- README の改名履歴（リリース時に `/git-update` で記録）。
- メモリの「パネル名」関連の記述があれば更新。

### 手順8: 検証
- `npx tsc --noEmit`、全テスト、Vite ビルド、shared-dist 再生成。
- **旧データでの起動確認**: 改名前のバージョンで保存した UIState・localStorage・ショートカットCSV・サブ課題・管理チャットを持つ Vault で起動し、色・Pane構成・選択チャット・AIモデル・ショートカット・サブ課題一覧が引き継がれることを確認する。
- PC連携: 新Electron×旧Web、旧Electron×新Web の両方でAI依頼が通ることを確認する。
- 残存確認: `Discuss|discuss` の grep 結果が互換レイヤーとそのテスト、旧版の記録（README履歴）だけになっていること。

### 手順9（後日）: 送信値の切替
- PC連携の両側に v2.7.0 が行き渡ったら、`panelRole` の送信値を `'working'` に変える。

## 3. 決定事項（2026-10-27）

1. 表示名は英語の `Working`。
2. 管理チャットのタイトルは新規作成分だけ `TODO:Working｜`。既存タイトルは書き換えない。
3. CSS クラス名・CSS 変数も `working` に改名する（手順5を実施）。
4. `isWorking` 等の別の意味で `Working` を使わない規約を CLAUDE.md に追加済み。
5. 旧名（Workout/Develop/Discuss）の互換レイヤーは、ユーザーが削除を指示するまで残す。
