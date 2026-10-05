# Develop から Discuss への名称変更

## 方針

`Workout` を改名する前のブランチには戻らず、現行コードの `Develop` を `Discuss` に改名する。現行ブランチには最初の名称変更後の修正も含まれるため、戻して再実装するより変更範囲が小さく、後続の修正を保持できる。

| 旧名 | 新名 |
| --- | --- |
| Develop / DevelopPanel | Discuss / DiscussPanel |
| DevelopSetting / DevelopSettingPanel | DiscussSetting / DiscussSettingPanel |
| `develop` のCSSクラス・変数 | `discuss` |

画面上の設定名「Pane設定」、`MediaType` の `panes`、`TaskSeed` は変更しない。READMEの過去の更新履歴と `docs/261001/`、`docs/ThinkSupport/` の当時の記録も維持する。

## 保存済みデータの互換性

- Chatタイトルの所有者 `Workout` / `Develop` は `Discuss` として読み、新規の所有者は `Discuss` で保存する。
- サブ課題の `taskRelation.panel` は旧値 `Workout` / `Develop` を受け入れ、新規値は `Discuss` にする。
- UI状態、テーマ色、フォーカス名、ステータスバー一覧、ショートカットの旧キー `Develop*` と `Workout*` は読み込み時に新しいキーへ正規化する。
- パネル別Chat選択とAIモデル選択は旧localStorageキーから復元し、以降は `Discuss` のキーで保存する。

## 検証

- `npm run typecheck`
- `npm test`（78ファイル、546テスト）
- `npm run build`
- `npm run build:server`

いずれも成功。ビルドは分離worktreeの出力先への書き込み権限が必要だったため、権限を付けて実行した。
