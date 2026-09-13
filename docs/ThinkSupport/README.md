# Thinktank 思考支援設計文書

作成日：2026-09-13。現状確認の基準：`f69259c`（`codex/ai-neutral-foundation`）。

本書群は、現行ソースから確認したUI・データ構造と、本タスクでの議論を整理した設計資料である。画面の実機確認や外部APIの実証を完了した仕様書ではない。

| 文書 | 内容 |
|---|---|
| [01 思考支援の枠組み](01_思考支援の枠組み.md) | アプリの目的、AIの責務、共通コンテキスト、進行と終結 |
| [02 UIの機能と役割](02_UIの機能と役割.md) | 現在の4パネル、操作の役割、現状の制約、将来の配置案 |
| [03 NotebookLM連携と対話インターフェイス](03_NotebookLM連携と対話インターフェイス.md) | 同期、ID対応、検索範囲、テキスト・音声・Agentの接続案 |
| [04 実装計画書](04_実装計画書.md) | 段階別成果物、依存関係、受け入れ条件、未決事項 |
| [05 P1実装記録](05_P1実装記録.md) | 読み取り専用ContextServiceの実装・制約・検証進捗 |
| [06 P2実装記録](06_P2実装記録.md) | Overviewの手動編集・BQ保存・競合比較と検証進捗 |

## 記述の区分

- **現状**：基準コミットのソースで確認できる実装。
- **合意方針**：会話で採用した方向。実装済みであることは意味しない。
- **設計案**：次の実装に向けた提案。データ仕様など重要な判断は確定前に確認する。
- **要確認**：運用環境、外部サービスの能力、未合意の仕様。

## 共通の前提

1. 思考支援の中心は、資料から問いを整理し、本人が判断・行動・検証できるようにすること。
2. Bundleを正本として扱う。名称・IDのNotebookへの変更は将来の検討事項とし、今回の実装計画には含めない。独立した内部Notebookモデルの導入も未決定である。
3. 旧AI実行は停止済み。既存の会話とメタデータを保全し、履歴を閲覧できる。
4. ContextServiceはP1として、手動編集可能なOverviewはP2として追加実装。実環境でのP2受け入れ確認は未完了。ConversationService、AgentService、AIProvider、NotebookLM同期は未実装。
5. BQデータは`C:\Users\gogow\Documents\Thinktank_20260913`へ保存済みとの本人報告があり、MarkdownとJSON各5,491件の配置を確認済み。内容照合・復元確認、実環境での基本操作確認は未完了。
6. Thinkの保存先は当面BigQueryを維持する。

従来の保全記録と検証結果は [AI-neutral移行記録](../../docs/AI_NEUTRAL_MIGRATION.md) を参照する。本書群はその記録を置き換えず、設計を具体化する。

## 現状確認に使った主なソース

- [画面全体の配置](../../src/components/Layout/AppLayout.tsx)
- [Bundleと資料の解決](../../src/models/TTVault.ts)
- [既存の思考支援メタデータ](../../src/services/thoughtSupport.ts)
- [会話履歴の共通UI](../../src/components/ThoughtSupport/SupportChat.tsx)
- [Overviewの表示切替](../../src/components/OverviewPanel/OverviewArea.tsx)
- [Bundleの状況表示](../../src/components/OverviewPanel/BundleStatusView.tsx)
- [Workoutの表示形式](../../src/components/WorkoutPanel/WorkoutArea.tsx)
- [ReThinkの現行機能](../../src/components/ReThinkPanel/ReThinkArea.tsx)
- [AI APIの停止境界](../../server/routes/chatRoutes.ts)
