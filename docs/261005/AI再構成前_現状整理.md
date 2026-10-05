# AI再構成前の現状整理

確認日：2026-10-05。対象：ブランチ `TTWebCC260926BigChange`、HEAD `248c6f909ae48651054d1605dd860cc85c6cc7df` と確認時点の作業中ファイル。

本書は、大きな再構成に入る前の棚卸しである。現行の配置や名称を将来の仕様として固定しない。前の対話で提案した「ループマネジメント」は、現状と区別して扱う。

## 1. 資料の構成

| 資料 | 内容 |
| --- | --- |
| 本書 | ４パネルの役割、実装と構想の違い、現状の要点 |
| [固定UI機能一覧](AI再構成前_固定UI機能一覧.md) | パネルごとの操作、共通AIChat、無効・仮置きのUI、再配置を検討する項目 |
| [名称・ファイル対応表](AI再構成前_名称・ファイル対応表.md) | 用語、コンポーネント、サービス、保存キー、API、旧実装の名前 |
| [役割テキスト化の検討](AI再構成前_役割テキスト化の検討.md) | パネルの役割をAPIの基本指示へ渡す方針と、アプリ側に必要な機能の境界 |

## 2. ４パネルの役割：これまでの方針と現在の実装

| パネル | これまでの思考支援上の役割 | 現在、実装されている主な機能 | 役割として未完成の部分 |
| --- | --- | --- | --- |
| Thinktank | 未整理の相談を受け止め、取り組む対象・目的を定める入口 | Vault全体のThink一覧・検索・絞り込み、Bundle作成、新規Chat、既存相談の再開、相談の課題化、類似課題の調査 | AIが全Vaultを自動探索して相談を分類・振り分ける仕組みは現行ルートにはない |
| Seeds | 指定Bundleの全体像、目的、論点、資料、サブ課題、現在地を俯瞰する | Bundle内Think一覧、資料の追加・除外、Bundle設定、「分析」で課題概要・親子課題・到達状態・資料処理ジョブ・外部連携を表示 | Workstream、担当、期限、依存関係、複数Actionを統合したProgram Masterはない |
| Discuss | 個別の課題を検討し、次の行動を具体化し、資料や成果物を作る | 複数Paneで資料編集・閲覧、ChatをPaneで開く、サブ課題専用Chat、共通AIChat、メモ・表・HTMLの作成や入出力 | 日次レビュー、前回Actionの追跡、結果に応じた計画更新を束ねる運営ループはない |
| Harvest | 目的・完了条件と現実の結果を照合し、継続・再検討・終了、残課題を整理する | Harvest担当Chatの一覧と共通AIChat、一覧の表示設定、設定の仮置き画面 | Harvest専用の結果照合、課題全体の終結、学習の抽出、次回ループへの引継ぎは未接続 |

各パネルの文章による役割は、設計資料および旧 `ROLE_POLICY` に存在する。現行AIがこの４つの役割文を受け取って動いているわけではない。

主な確認先：

- [ThinktankArea](../../src/components/ThinktankPanel/ThinktankArea.tsx)
- [SeedsArea](../../src/components/SeedsPanel/SeedsArea.tsx)、[BundleStatusView](../../src/components/SeedsPanel/BundleStatusView.tsx)
- [DiscussArea](../../src/components/DiscussPanel/DiscussArea.tsx)、[DiscussSettingArea](../../src/components/DiscussPanel/DiscussSettingArea.tsx)
- [HarvestArea](../../src/components/HarvestPanel/HarvestArea.tsx)
- [初期の枠組み](../ThinkSupport/01_思考支援の枠組み.md)、[相談と課題の役割](../ThinkSupport/30_相談と課題の役割と参照範囲.md)

## 3. 現行AIChatの実際の構成

４パネルとDiscussのChat Paneは、共通の `SupportChat → SupportConversation → BundleConversation` を使う。

会話生成は、クライアントの `ConversationClient`、サーバーの `ConversationService`、`AIProvider` を通る。AIには質問、対象資料・確認済み状態、直近最大６件の会話を渡す。生成した回答と会話の保存は別処理である。

| 観点 | 現状 |
| --- | --- |
| AIの基本指示 | `server/services/AIProvider.ts` の共通 `CONVERSATION_POLICY` |
| パネル別役割の送信 | 未実装。生成要求にパネルの役割文や役割の版番号はない |
| パネルごとの違い | Chat一覧の対象、配色、下書きの識別、課題化操作の有無など、アプリ側の条件分岐 |
| AIへの参照対象 | Chatに対応する課題Bundle。課題化前の相談はChat単独。Seedsで表示中のBundleを会話の参照先へ流用しない |
| AI応答 | 回答、根拠不足、引用、課題概要の変更案、到達状態候補、サブ課題候補、保留・再開候補 |
| 記録への反映 | アプリの採用・確認操作を通して保存する |
| Providerとモデル | サーバーの `THINK_SUPPORT_AI_*` 設定で決定。現行会話要求にパネルのモデル選択値は送られない |
| 保存先の制約 | 現行思考支援UIのAI対話・専用の概要／進捗等の保存はBigQueryモードが中心。一般のThink保存とは対応範囲が異なる |

確認先：[SupportChat](../../src/components/ThoughtSupport/SupportChat.tsx)、[SupportConversation](../../src/components/ThoughtSupport/SupportConversation.tsx)、[クライアント会話](../../src/services/ConversationService.ts)、[サーバー会話](../../server/services/ConversationService.ts)、[AIProvider](../../server/services/AIProvider.ts)。

## 4. 表示名・旧実装とのずれ

| 名前・表示 | 実際の状態 |
| --- | --- |
| 「会話履歴」 | 保存履歴の閲覧に加えて、条件を満たせば共通AIChatで追加送信できる |
| 「会話履歴は閲覧専用です」 | 手動保存ボタンの無効化・ツールチップに使われる文言。共通AIChat全体を閲覧専用にするフラグではない |
| Seeds「分析」、内部値 `graph` | `BundleStatusView` による課題状況の表示。Discussの関係グラフ `GraphMedia` とは別の機能 |
| 「新規チャット」行 | 共通ピッカーは各パネルに行を表示するが、実際に新規Chatを作成する接続はThinktankにある。Seeds・Discuss設定・Harvestでは選択解除になる |
| `ROLE_POLICY` | パネル別役割文はあるが、参照するのは旧 `SupportChat.legacy.tsx`。現行AIには渡していない |
| `.thinktank/thinktank.md` | 停止中の旧Chatルート用。現行思考支援AIの設定ファイルではない |
| `thoughtSupport` と `thinkSupport` | 別の保存形式。前者は旧記録、後者は現在の本人確認済み課題概要 |
| Chatタイトルの `[完了]` | 表示・絞り込み用の状態。現在の本人確認済み到達状態や課題全体の完了を保証しない |
| `Agent` | Bundle資料の要約・比較ジョブ。プログラムを継続管理するPMや監視スケジューラではない |
| `LOOP`、`repeatRule` | 旧タグ・旧記録に存在する。現行の定期実行エンジンが実装済みという意味ではない |

ここを整理せずに名前だけを再利用すると、実装済み機能と構想を混同しやすい。

## 5. 今回の調査範囲と変更範囲

現在のソース、import、APIの送受信項目、保存キー、主要な画面分岐を確認した。CSS・テストは対応ファイルとして扱い、個々の色値やすべてのエディタショートカットは一覧化していない。エディタ操作の詳細は [Status／Action対応表](../Thinktank_Status-Action-Binding.md) と [ショートカット](../DefaultShortcut.md) を参照する。

本書群はソース上の棚卸しであり、実ブラウザ・実AI・実BigQuery・公開環境での通し検証を今回行った記録ではない。環境変数の有効化状態や公開環境の状態は再確認していない。

確認時点にはREADME、HarvestArea、AppLayout、ローカル設定等に既存の作業中変更があった。本書群はその作業ツリーを対象とし、既存の変更を保持した。今回追加するのは４つの整理資料だけであり、アプリの配置・名称・動作は変更していない。

役割のテキスト化、UIの再配置、削除、追加は、別の設計・実装段階として扱う。
