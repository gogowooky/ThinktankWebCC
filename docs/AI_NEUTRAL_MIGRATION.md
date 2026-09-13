# AI-neutral 移行計画・保全記録（2026-09-13）

## 起点と保全範囲

- 対象: gogowooky/ThinktankWebCC。開始時は detached HEAD `f0ca98ce5ba21a65bd771eb82a465e0f0558ef67`、未コミット変更なし。
- `git ls-remote` で GitHub の TTWeb260526 が `e3f9fb9899bc119e31e75f69b134365471c04f3c` と確認できた。開始時より文書更新2コミット先。
- 最新版から `codex/ai-neutral-foundation` を作成。他の作業領域・ブランチは変更しない。
- Git履歴に元のソースがあり、今回の旧UI/API実装は `.legacy` ファイルにも保持。過去の会話本文、thoughtSupport、未反映処理、保存形式は移行・削除しない。
- **実データのバックアップは未確認**。TTVault の既定 LocalFS は `../ThinktankLocal/vault`。Electron側の実際の保存先、BigQuery/Driveの運用データ、ブラウザ保存設定はGit保全の対象外。実データへの接続・移行・デプロイは今回行わない。データ移行前には実際の保存先を特定し、バックアップと復元確認が必要。
- 既存 VectorStoreService.initialize にあった tt_embeddings 自動削除の呼び出しを停止。AI停止に伴うデータ削除は行わない。

## 実際の構造と初期3段階

1. 最新版保全確認: 上記の照合と専用ブランチ作成。
2. AIChat停止: Thinktank / Overview / Workout / ReThink と Workout ChatMedia は共通 SupportChat を利用。これを履歴閲覧専用に置換。旧実装は SupportChat.legacy.tsx に隔離。入力・モデル選択・AIによる関連ファイル作成・再試行・管理変更を現行UIから実行させない。既存の会話選択、本文閲覧、目的等の管理情報表示は残す。保存ボタンは閲覧専用と明示して無効化。
   - ChatApiService.streamChat はネットワーク送信せず停止を通知。
   - サーバー /api/chat/providers は全社 false、POST /api/chat/messages は AI_DISABLED / 503。キー設定の有無にかかわらず停止。現行ルートからChatService/SDKを読み込まない。
   - モデル可用性フックはHTTP問い合わせを行わない。
   - 旧SSEクライアント・サーバールートも .legacy に保存。これは再有効化スイッチではない。将来接続する際は新サービス境界を経由する。
3. 非AI回帰確認: 型検査、フロント/サーバービルド、既存テストに加え、直接API拒否、各パネルの履歴閲覧で保存/AI通信が発生しないこと、起動時の旧テーブル保全をテストする。実環境での保存・再読込の確認は別途必要。

## 次の実装単位（未実装）

### A. ContextService

Bundle は独立モデルではなく ContentType=bundle の TTThink。既存 TTVault.GetThinksForBundleAsync を資料解決の入口にする。検索条件を持つBundleは動的なので、評価日時と解決済みThink IDをスナップショットに含める。

読み取り専用 getBundleContext(bundleId) から、Bundle識別子・タイトル、資料Think ID/本文/更新版、目的、段階、暫定結論、本人の決定、未解決事項、次の行動、完了条件を返す。各項目には出典Think IDを付ける。現行thoughtSupportからの読み取りアダプターを先に作り、既存メタデータを書き換えない。読み込み失敗や欠落資料は明示し、別Bundleや全Vaultへ自動拡張しない。複数会話の決定が競合する場合は並記する。

完了条件: 同じスナップショットをOverview/Conversation/Agentで共有でき、Bundle外漏出、部分ロード、競合、非破壊読み取りをテストできる。

### B. Overviewの資料・進行表示

資料一覧、引用元Thinkへの移動、上記7項目を中心にする。現在は履歴パネルに既存情報を常時表示した段階。NotebookLM型の新Overview全体はまだ実装していない。暫定結論と本人の確定判断は混同しない。

完了状態は検討完了／意思決定完了／実行完了／検証完了／保留を別フィールドまたは段階として設計する。既存の「完了」をどれに対応させるかは自動判断しない。段階を単一選択にするか、独立した達成状態にするかを確認してから永続化する。

### C. ConversationService / AgentService / AIProvider

- ConversationService: ContextSnapshotを入力にテキスト対話。後で音声セッションを追加。
- AgentService: 調査・分析・ファイル処理。実行計画、進捗、成果物、引用、適用差分を返す。会話保存とツール実行を分け、適用は別操作。
- AIProvider: サーバー側の能力宣言（text/voice/tools/files）と実行・中断・エラーを共通化。OpenAI/Claude/Gemini/LAN Local AIをアダプター化。UIは能力と目的を基準にし、APIキーをブラウザへ渡さない。
- 統括AIは次の行動・終結条件の提案役。本人の決定や完了を無条件に確定させない。

完了条件: providerなしでも全基本機能が使える。キャンセル、部分失敗、再試行の重複抑止、引用整合性を各サービス単位で検証する。

### D. NotebookLM / File Search同期（設計案）

Bundleを正本とし1 Bundle=1 Notebookを基本にする。同期レコードは vaultId/bundleId、接続先種別、notebookIdまたはstoreId、thinkId、sourceIdまたはdocumentId、contentHash、lastSyncedAt、同期状態/エラーを保存する。ハッシュの対象・正規化方式・バージョンも記録する。

Thinktankが作成したNotebookは保存済みの安定IDで再関連付けする。名前だけで確定しない。外部Notebookは取得可能なSource情報を取り込み、会話や構造の完全復元は約束しない。削除伝播や上書きは初期同期に含めず、競合は確認待ちにする。

Gemini File Searchを採用するなら Bundle↔Store、Think↔Document、回答の引用↔Think IDを対応させる。Bundle内資料のみの回答と外部検索の回答を別モードにし、外部情報を勝手に正本へ追加しない。

これは同期実装前の案であり、各サービスの現行API能力・認証・制約は未検証。採用前に公式仕様を調査する。NotebookLM UI埋め込みは行わない。

## 実施前に確認する判断

- 実データのバックアップ/復元確認と、メタデータ移行の範囲。
- 完了状態の意味と既存データへの対応。
- 外部同期先、資料送信範囲、削除・競合時の扱い。
- AI実行再開、モデル選定、外部に影響するAgent操作、運用環境への反映。

今回これらの仕様確定・データ移行・外部同期・デプロイは行っていない。

## 検証結果

- 型検査成功、フロントエンド/サーバーのビルド成功。フロントビルドは既存の大きなchunkに対する警告あり。
- 既存と今回追加分の24ファイル194テスト成功。追加の非AI基本操作テスト1件も成功（計195件）。Workout分割操作・保存メタデータ互換性の既存テストを含む。
- 基本操作テストの保存先はモック。実Vaultの保存/再読込、実ブラウザ・Electronでの手動操作は未確認。これを運用環境の動作保証やデータバックアップ完了とは扱わない。
- ContextService、ConversationService、AgentService、Provider抽象化、Notebook同期は次段階の計画であり未実装。
