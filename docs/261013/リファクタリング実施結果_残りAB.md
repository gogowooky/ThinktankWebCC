# 残りA/Bのリファクタリング実施結果 — 2026-10-13

[事前調査](./リファクタリング事前調査.md)の残り **A3〜A8・B3〜B5** を実施しました。開始時点は `53a1863`、追跡対象の作業ツリーは変更なしでした。前段のC1・B1・B2・A1・A2は[前回の実施結果](./リファクタリング実施結果.md)を参照してください。

## 変更内容

| ID | 実施内容 | 維持・確認した契約 |
| --- | --- | --- |
| A3 | 4パネルの共有チェック更新・トグル・開閉・AI選択と購読を `panelBehavior` に共通化。 | 既存の公開メソッド、共有参照、兄弟パネル→Status→呼出元の通知順、Seeds固有動作。 |
| A4 | Discussの8方向挿入を方向・対象範囲を指定する `InsertArea` と呼出側helperへ集約。既存8メソッドは互換入口として保持。 | アクションID、焦点・配置、空パネルでの新規保存待ち、保存失敗時にペインを増やさない動作。 |
| A5 | Think作成5経路の登録・Count・キャッシュ・保存・巻戻し・通知を `_createThink` に集約。保存応答の更新版を保持し、固定ID置換の失敗時には元の項目を復元。 | メタデータ複製、保存完了後の通知、Bundleリンク失敗時の保存済み子の保持とリンク再試行。通常保存は作成時の更新版を使用。 |
| A6 | JSON応答・HTTPエラー読取を共通化。純粋な型・validator等10ファイルを `server/contracts` へ分離し、フロントは直接参照。 | 個別の対象ID・版・応答形状検証、409専用例外、復旧文言。旧servicesパスはre-export互換入口として保持。serverの出力先・梱包構成は維持。 |
| A7 | Bundleの読込・メタデータ・版確認・CAS委譲をRepositoryへ、会話3保存URLの追記・再送判定・容量検証を共通関数へ集約。 | URLごとの対象検証、会話IDの再送比較、100件・容量上限、楽観ロック、Chat本文マージ、Agentのclone・再試行・中断。 |
| A8 | 設定定義を領域別registryへ、Discuss設定を5種別UIと親のstate hookへ分離。DataGridの表編集・一覧・色選択、TextEditorの内容変換・折畳・provider・装飾を責務別に分離。 | 設定登録順・保存キー・既定値・移行、状態寿命、DOM・色、公開Ref、Monaco登録・装飾・フォーカス。 |
| B3 | 旧コレクションCSV API・空FlushCache・表示/保存用の旧プロパティ・専用factory、Vaultの未使用パス補助、テスト専用LatestBundleContextReaderを削除。参照がなくなったcsv.ts/CsvValueも削除。 | 現行のCRUD・LoadCache・tableFormatのCSV・ContextServiceの読取/取消/並行処理は維持。 |
| B4 | 旧AI・SSEコードと専用テスト13ファイルを[参照用スナップショット](../legacy-ai/2026-10-13/README.md)へ隔離。現行用の型を独立させ、thoughtSupportは互換読込へ縮小。旧SDK3種と専用の間接依存をlockから整理。 | 旧本文・メタデータ・未反映記録、設定移行、現行AIProvider・会話・Agent・FileSearch、停止用APIとshim。保持パッケージの版変更なし。 |
| B5 | 空のVectorStoreService・専用テスト・起動配線・専用getterを除去。 | BigQueryの既存テーブル・データへの操作なし。 |

大型ファイルの入口は次の規模になりました。処理を責務別のファイルへ移したもので、機能を省略した行数ではありません。

| ファイル | 変更前 | 変更後 |
| --- | ---: | ---: |
| TTUIStateManager.ts | 1,717行 | 622行 |
| DiscussSettingArea.tsx | 1,227行 | 55行 |
| DataGridMedia.tsx | 1,041行 | 38行 |
| TextEditorMedia.tsx | 1,173行 | 786行 |

## 検証

- 全回帰テスト：**101ファイル・664件すべて成功**。旧専用テストの隔離に加え、通知順、8方向挿入、作成失敗・復元、HTTP応答、CAS・再送、設定寿命・保存順、表編集、Monacoの登録・装飾・折畳の回帰確認を追加。
- 未使用Props/importと型の最終整理後、設定関連の既存・新規5件も再確認して成功。
- `npm run typecheck`：成功。
- `npm run build:server`：成功。生成物のみのディレクトリであることを確認してclean後に再生成し、旧VectorStore・ChatService・geminiParts・旧ルート/モデル定義が出力に残っていないことを確認。
- `npm run build`：最終整理後も成功。従来の大きなチャンク・静的/動的import混在の警告あり。
- ESLint：33 errors /130 warnings。エラー33件は変更前と同じ未変更ファイル（TTPanelAreaWidth.test.tsの21件、一時スライド補助スクリプトの12件）。警告は前回の162件から32件減少。変更対象に新規エラーなし。C6の検査基盤整理は対象外。
- `git diff --check`：成功。
- 独立レビューで変更由来の問題なし。contracts10ファイルの実体、設定登録70要素の順序と定義、設定5画面のJSX、DataGrid/TextEditorの移動処理を旧実装と静的比較。
- 保全17ファイルのSHA-256一致、隔離13ファイルの元パス不在を確認。スナップショットはGitによる改行変換を無効にして原文バイトを保持。

## 範囲と限界

前回同様、テスト子プロセスの一時ディレクトリをworkspaceのtmpへ向け、ビルドとローカル通信を使う全テストを権限制限外で実行しました。依存削除はoffline・package-lock-only・ignore-scriptsで行い、保持パッケージの版変更はありません。

実Vault・BigQuery・Drive上のデータ削除・移行、外部AIの実行、デプロイ、ブラウザ/Electron実機での手動操作は行っていません。未選択のC2〜C7の挙動修正は含めていません。
