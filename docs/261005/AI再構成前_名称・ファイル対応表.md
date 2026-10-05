# AI再構成前：名称・ファイル対応表

確認日：2026-10-05。確認基準は [現状整理](AI再構成前_現状整理.md) を参照。以下は名前を変更するための棚卸しであり、今回リネームは行わない。

## 1. ユーザー向け概念とコード上の名前

| 名前 | 現在の意味 | 注意点 |
| --- | --- | --- |
| Thinktank | アプリ名、および入口パネルの名前 | アプリ全体とThinktankPanelを文脈で区別する |
| Think／TTThink | 保存する１件の記録。本文・種別・ID・Metadata等を持つ | 独立した「Thought」という別の現行データモデルを指す名前ではない |
| Thought | 過去から残る概念・名称。ThoughtsList、CheckedThoughtIDs、D&Dのapplication/x-thought-id等 | 実体はThinkを扱う場合がある。古い単語という理由だけでは削除できない |
| Vault／TTVault | Thinkの保管庫と読み込み済み一覧 | 全件の本文が常に読み込み済みとは限らない |
| Bundle | ContentTypeがbundleのThink。明示ID、条件、除外等によって資料を束ねる | Bundleがすべて管理対象の課題であるとは限らない |
| 課題／Task | 目的・完了条件を持ち、取り組む対象として開始したBundle | 特別なTask ContentTypeはなく、BundleとMetadataで表す |
| TaskBundle／CreateTaskBundle | 課題用途のBundleを作る機能の名前 | 新しい独立モデル名ではない |
| 相談／Chat | Chat Thinkを使う対話 | 課題化は任意。対応Bundleのない相談もある |
| AIChat | AIとの会話機能の呼称。各パネルの表示名は「会話履歴」 | ContentType、タブ名、会話UIを混同しない |
| ASK | 新規相談の管理タイトル接頭辞 | 例：ASK:Thinktank｜新しい相談 |
| TASK | 課題に対応したChatの接頭辞 | タイトルをTASKに変えるだけでは課題化・ID対応を保存しない |
| TODO／PROJ／EVNT／LOOP | 旧の個別作業／プロジェクト／イベント／繰り返しタグ | 読込・絞り込み互換を維持。現行の種類別エンジンを意味しない |
| 担当パネル | 管理Chatタイトル等に保存されるThinktank／Seeds／Discuss／Harvest | 実際の担当者・チームメンバーとは異なる |
| サブ課題／Subtask | taskRelationで親に紐づく子Bundle | 単なるチェックリスト項目とは異なる |
| 専用Chat | 子Bundleに対応するChat。subtaskChatでIDを保存 | 同じ子課題について作成・再利用する |
| Seeds | Bundleの俯瞰パネル | 次のTaskSeedとは別概念 |
| TaskSeed | 会話から課題作成へ渡す目的・完了条件の２項目 | Seedsパネルの内部モデルではない |
| 課題の概要／ThinkValues | 目的等の７項目からなる本人確認済み記録 | 「現在の状況」はこの７項目にはない。旧記録のcurrentとは別 |
| 段階／stage | 課題概要の自由記述項目 | 段階別の到達状態、Chatタイトルの状態とは別 |
| 到達状態／Progress | 検討・意思決定・実行・検証それぞれの本人確認済み到達 | 単一の完了ステータスではない |
| 保留・再開 | 理由・再開条件・要約を伴う進捗記録 | 日付到来だけでは自動再開しない |
| 次の行動／nextAction | 課題概要の自由記述 | 担当・期限・状態を持つ複数Actionの台帳ではない |
| Proposal | AIの変更提案 | 人間の確定判断や保存済み状態とは別 |
| ContextSnapshot | Bundleの資料・状態を取り出した読取結果 | 取得時点のクライアント状態。保存先の最新トランザクションではない |
| ConversationContext | AIへ送る資料・手動状態・子課題等 | ContextSnapshotから送信形式へ変換。旧状態の一覧全体をそのまま送るわけではない |
| ConversationTurn／ConversationLog | 質問、回答、引用、送信時点のContext、モデル等／その履歴 | 普通のChatMessage配列とは保存形式が異なる |
| Agent／AgentJob | Bundle資料の要約・比較処理 | 継続PM、外部実行エージェント、定期監視とは別 |
| Artifact／成果物 | Agentの生成候補、または採用して新規Thinkへ保存した結果 | 生成成功と採用・保存を区別する |
| NotebookLM連携／External | 手動書き出しと外部Notebookの対応・準備記録 | 自動送信・同期は未実装 |
| File Search | 外部ストアの接続確認・Bundleとの対応 | 連携記録と実際の資料同期を区別する |
| Pane／TTDiscussArea | Discuss内の１つの表示・編集領域 | パネル自体とは別。Areaという名前は他パネルの本文領域にも使う |
| ContentType／category | 保存するThinkの種別 | memo、bundle、table、links、chat、html、nettext |
| MediaType | Thinkの見せ方、または設定種別に使う内部値 | panes、texteditor、markdown、datagrid、card、graph、html、chat |
| Status／Action／Shortcut | UI状態／アプリの処理／操作との対応 | AIの判断文・プロジェクトの状況・担当者へのActionと区別する |

主な定義：[TTThink](../../src/models/TTThink.ts)、[TTVault](../../src/models/TTVault.ts)、[types](../../src/types/index.ts)、[managedChat](../../src/utils/managedChat.ts)、[taskSeed](../../src/services/taskSeed.ts)。

## 2. ４パネルの名前と旧名

| 現行名 | 旧名 | 現行の主なクラス／ディレクトリ |
| --- | --- | --- |
| Thinktank | 同名 | TTThinktankPanel、components/ThinktankPanel |
| Seeds | Overview | TTSeedsPanel、components/SeedsPanel |
| Discuss | Workout → Develop | TTDiscussPanel、components/DiscussPanel |
| DiscussSetting | WorkoutSetting → DevelopSetting | DiscussSettingArea。画面上の「Pane設定」と同義ではなく、各種設定と会話の宿主 |
| Harvest | ReThink | TTHarvestPanel、components/HarvestPanel |

旧保存値の変換は [panelNames](../../src/utils/panelNames.ts)、managedChat、taskRelation、UIState／Shortcut、選択・モデル設定等にある。保存データの互換名と、実際に改名できるファイル・変数を区別する。

`DiscussTabBar.tsx` の設定一覧定数は現在も `DEVELOP_SETTINGS` という名前。これは現行UIで使われる名称の残りであり、停止中の旧実装ではない。

## 3. 現行フロントエンド：対話・対象解決

| ファイル | 主な名前 | 役割 |
| --- | --- | --- |
| [ThoughtSupport/SupportChat.tsx](../../src/components/ThoughtSupport/SupportChat.tsx) | SupportChat、SupportChatRef | パネル／Paneの共通宿主。配色、下書き識別、フォーカス、中断を接続。save／旧スクロールAPIは空処理 |
| [ThoughtSupport/SupportConversation.tsx](../../src/components/ThoughtSupport/SupportConversation.tsx) | SupportConversation | Chatと課題のID対応、対象不明時の選択、Thinktankの課題化・類似課題UI |
| [ThoughtSupport/BundleConversation.tsx](../../src/components/ThoughtSupport/BundleConversation.tsx) | BundleConversation | 準備、履歴、質問、応答生成、保存、再試行、引用・候補、固定質問・参照情報の表示 |
| [DiscussPanel/media/ChatMedia.tsx](../../src/components/DiscussPanel/media/ChatMedia.tsx) | ChatMedia | ChatをDiscuss Paneで共通AIChatとして開く |
| [services/ConversationService.ts](../../src/services/ConversationService.ts) | ConversationClient、conversationContext、chatOnlyConversationContext | 接続確認、履歴、生成、保存、読込時のChat同期、送受信対象の照合 |
| [services/ContextService.ts](../../src/services/ContextService.ts) | ContextService、getBundleContext、ContextReadError | Bundle解決、資料読込、本文ハッシュ、欠落・競合・変更検出、子課題採取 |
| [services/contextTypes.ts](../../src/services/contextTypes.ts) | ContextSnapshot、ContextSource、ContextIssue、ContextStatement | 読取専用Snapshotの型と品質・出典情報 |
| [services/legacyContextAdapter.ts](../../src/services/legacyContextAdapter.ts) | 旧記録の変換 | thoughtSupport等の旧記録を出典付き読取情報として扱う |
| [services/chatTask.ts](../../src/services/chatTask.ts) | resolveChatTask、bindChatToTask | 課題のID対応を解決・保存。題名一致では判断せず、異なるIDは競合として扱う |
| [hooks/useSupportChats.ts](../../src/hooks/useSupportChats.ts) | useSupportChats、filterSupportChats | パネル担当と表示BundleによるChat一覧の範囲 |
| [hooks/useSupportSelection.ts](../../src/hooks/useSupportSelection.ts) | useSupportSelection | パネル別の選択保存・復元、openイベントの受取、旧名互換 |
| [hooks/useNewSupportChat.ts](../../src/hooks/useNewSupportChat.ts) | useNewSupportChat | Thinktank新規Chatを保存してから選択 |
| [services/openSupportChat.ts](../../src/services/openSupportChat.ts) | openSupportChat | 担当パネル・Bundleを開き、Chat選択を引き継ぐ |

## 4. 現行フロントエンド：採用・課題・進捗

| ファイル | 主な名前 | 役割 |
| --- | --- | --- |
| [services/startTaskFromChat.ts](../../src/services/startTaskFromChat.ts) | startTaskFromChat | 相談から課題開始。既存対応を再利用し、同じChatの同時作成をまとめる |
| [services/taskSeed.ts](../../src/services/taskSeed.ts) | TaskSeed、taskSeedFromConversation | 最新保存済み会話から目的・完了条件を引き継ぐ |
| [models/TTVault.ts](../../src/models/TTVault.ts) | CreateTaskBundle、CreateSubtaskFromConversation | 課題／子Bundle作成、関連記録、同じ候補の再利用 |
| [services/taskRelation.ts](../../src/services/taskRelation.ts) | TaskRelation、readTaskRelation | 親子ID・元Chat・元Turn・候補ID・担当パネル |
| [services/subtaskChat.ts](../../src/services/subtaskChat.ts) | ensureSubtaskChat、readSubtaskChat | 子課題専用Chatの作成・再利用と参照追加 |
| [services/subtaskProgress.ts](../../src/services/subtaskProgress.ts) | 子課題進捗の読取・集計 | 現行の確認済み到達状態を一覧に使う |
| [services/subtaskContext.ts](../../src/services/subtaskContext.ts) | captureSubtaskContext、captureProgressContext | 読み込み済み直接の子課題と対象自身の進捗を会話Contextへ採取 |
| [services/ThinkSupportService.ts](../../src/services/ThinkSupportService.ts) | ThinkSupportService | 課題概要の読込・保存。BQ APIと版照合 |
| [services/ProgressService.ts](../../src/services/ProgressService.ts) | ProgressService | 到達状態・保留・再開の読込・保存 |
| [services/proposalReview.ts](../../src/services/proposalReview.ts) | prepareProposalReview | 概要提案の対象、変更前、出典、既反映等を確認 |
| [services/similarTasks.ts](../../src/services/similarTasks.ts) | 類似課題検索 | 読み込み済み相談・課題の共通語による調査 |
| [ThoughtSupport/ProposalReview.tsx](../../src/components/ThoughtSupport/ProposalReview.tsx) | ProposalReview | 課題概要提案の差分確認・保存 |
| [ThoughtSupport/ProgressProposal.tsx](../../src/components/ThoughtSupport/ProgressProposal.tsx) | ProgressProposal | 会話由来の到達・保留／再開候補の確認・保存 |
| [ThoughtSupport/SubtaskProposal.tsx](../../src/components/ThoughtSupport/SubtaskProposal.tsx) | SubtaskProposal | 候補またはnextActionから子課題を追加 |
| [ThoughtSupport/SubtaskList.tsx](../../src/components/ThoughtSupport/SubtaskList.tsx) | SubtaskList | 親子ナビゲーション、子の進捗・残課題一覧 |
| [ThoughtSupport/SubtaskChatButton.tsx](../../src/components/ThoughtSupport/SubtaskChatButton.tsx) | SubtaskChatButton | 専用ChatをDiscussで開く入口 |
| [ThoughtSupport/SubtaskContextView.tsx](../../src/components/ThoughtSupport/SubtaskContextView.tsx) | SubtaskContextView、ProgressContextDetail | AIに渡す課題進捗の範囲と不明状態を表示 |
| [ThoughtSupport/SimilarTasks.tsx](../../src/components/ThoughtSupport/SimilarTasks.tsx) | SimilarTasks | 類似課題調査と候補をSeedsで開くUI |
| [ThoughtSupport/BundleProgress.tsx](../../src/components/ThoughtSupport/BundleProgress.tsx) | BundleProgress | 手動進捗フォーム、本人確認、履歴、競合比較 |
| [SeedsPanel/BundleStatusView.tsx](../../src/components/SeedsPanel/BundleStatusView.tsx) | BundleStatusView | Seeds「分析」。子課題・相談・概要・進捗・連携の入口をまとめる |
| [SeedsPanel/BundleThoughtSupport.tsx](../../src/components/SeedsPanel/BundleThoughtSupport.tsx) | BundleThoughtSupport | 課題概要７項目の手動編集・保存 |
| [SeedsPanel/ContextSnapshotView.tsx](../../src/components/SeedsPanel/ContextSnapshotView.tsx) | ContextSnapshotView、CONTEXT_LABELS | 資料・旧記録と出典の表示、項目ラベル |

## 5. 現行サーバー・AI・外部連携

| ファイル | 主な名前 | 役割 |
| --- | --- | --- |
| [server/services/AIProvider.ts](../../server/services/AIProvider.ts) | AIProvider、ProviderInput、CONVERSATION_POLICY、schema、configuredProvider | 共通基本指示、AI応答形式、OpenAI／Geminiアダプター、設定による無効化 |
| [server/services/ConversationService.ts](../../server/services/ConversationService.ts) | ConversationService、verifyContextHashes | AI生成と本文ハッシュ、引用、提案のサーバー検証 |
| [server/services/conversationRecord.ts](../../server/services/conversationRecord.ts) | ConversationContext／Answer／Turn／Log、validateContext／Turn、mergeConversationTranscript | 共通の送信・保存形式、検証、Chat本文への会話展開 |
| [server/services/conversationPresentation.ts](../../server/services/conversationPresentation.ts) | conversationPresentation | 検証済み引用を表示用Thinkリンクにする |
| [server/services/thinkSupportRecord.ts](../../server/services/thinkSupportRecord.ts) | THINK_FIELDS、ThinkValues、ThinkSupportRecord | 課題概要の７項目と本人確認済み保存形式 |
| [server/services/progressRecord.ts](../../server/services/progressRecord.ts) | MILESTONES、ProgressInput／Event／Log、progressReview | 到達状態履歴、保留・再開、機械的な見直し候補 |
| [server/services/lifecycleProposals.ts](../../server/services/lifecycleProposals.ts) | SubtaskCandidate、PauseCandidate、schema、validate関数 | 分解・保留／再開候補の型、件数・引用等の検証 |
| [server/services/subtaskContext.ts](../../server/services/subtaskContext.ts) | SubtaskContext、ProgressContext、SUBTASK_REVIEW_QUESTION | 子課題の範囲・不明状態の検証、固定見直し質問 |
| [src/services/AgentClient.ts](../../src/services/AgentClient.ts)、[server/services/AgentService.ts](../../server/services/AgentService.ts)、[agentRecord](../../server/services/agentRecord.ts) | AgentClient／Service、AgentJob／Log／Attempt、AGENT_KINDS／STATUS | 要約・比較ジョブ、実行・中断・再試行・候補適用 |
| [ThoughtSupport/BundleAgent.tsx](../../src/components/ThoughtSupport/BundleAgent.tsx) | BundleAgent | ジョブの登録・実行・採用UI |
| [src/services/ExternalService.ts](../../src/services/ExternalService.ts)、[externalBackup](../../src/services/externalBackup.ts)、[server/services/externalRecord.ts](../../server/services/externalRecord.ts) | ExportManifest、ExternalInput／Event／Log、exportDiff | 手動資料書き出し、外部対応、差分、履歴復元 |
| [ThoughtSupport/BundleExternal.tsx](../../src/components/ThoughtSupport/BundleExternal.tsx) | BundleExternal | NotebookLM向け手動連携UI |
| [src/services/FileSearchClient.ts](../../src/services/FileSearchClient.ts)、[server/services/FileSearchProvider.ts](../../server/services/FileSearchProvider.ts)、[fileSearchRecord](../../server/services/fileSearchRecord.ts) | FileSearchClient／Provider、FileSearchPage | 接続・能力・ストア一覧確認 |
| [server/services/FileSearchBindingService.ts](../../server/services/FileSearchBindingService.ts)、[fileSearchBindingRecord](../../server/services/fileSearchBindingRecord.ts) | BindingInput／Event／Log／State | Bundleと外部ストアの対応、版・アクセス確認 |
| [ThoughtSupport/FileSearchConnection.tsx](../../src/components/ThoughtSupport/FileSearchConnection.tsx)、[BundleFileSearchBinding](../../src/components/ThoughtSupport/BundleFileSearchBinding.tsx) | FileSearchConnection、BundleFileSearchBinding | 接続確認と対応編集UI |
| [server/services/BigQueryService.ts](../../server/services/BigQueryService.ts)、[metadataCodec](../../server/services/metadataCodec.ts) | saveThinkSupport、applyAgentArtifact、decodeMetadata | Metadataの競合を考慮した保存、成果物追加、JSON型列／YAMLの読込 |

各機能のAPIは次節のrouteファイルが公開する。CSSは見た目、`.test.ts`／`.test.tsx` は検証であり、役割の基本指示や本体機能とは別に扱う。

## 6. 保存キーとAI応答の名前

| Metadataのキー | 主な保存先 | 現在の内容 |
| --- | --- | --- |
| thinkSupport | 課題Bundle | schemaVersion、revision、values（７項目）、sources、author=human、confirmedAt、updatedAt |
| thinkConversations | Chat。APIにはBundle直下の互換経路もある | ConversationTurn配列、送信Snapshot、質問、回答、引用、提案、Provider／モデル |
| thinkProgress | 課題Bundle | 本人確認済みProgressEventの履歴 |
| thinkAgentJobs | Bundle | ジョブ、実行履歴、結果候補、採用先 |
| thinkAgentArtifact | 成果物Think | jobId、bundleId、contentHash |
| thinkExternal | Bundle | 外部連携先と書き出し準備・対応表の履歴 |
| thinkFileSearch | Bundle | 接続IDごとのストア登録・変更・解除の履歴 |
| taskOrigin | 課題Bundle | 起点chatId |
| taskContext | Chat | 対応bundleId、必要に応じてpreviousKind |
| taskRelation | 子Bundle | parentId、chatId、turnId、panel=Discuss、candidateId（任意） |
| subtaskChat | 専用Chat | 対応する子bundleId |
| thoughtSupport | 旧Chat／Bundle | 旧SupportRecord。現在の読取互換・一部表示にも使う |
| supportOrigin | 旧等のChat | 旧Chatの由来。管理タイトルのないChatをThinktank一覧へ含める判定にも使う |
| supportPendingEffects／supportSource | 旧記録 | 旧の副作用処理待ち／成果物由来。現行の会話生成経路の新しい契約ではない |

現在の `ThinkValues` のフィールド名は `goal`、`stage`、`provisionalConclusion`、`decisions`、`openQuestions`、`nextAction`、`completionCriteria`。

到達状態の段階は `consideration`、`decision`、`execution`、`verification`。値は `unrecorded`、`achieved`、`reconsider`、`unnecessary`。旧Chatタイトルの `未着手／進行中／待機／保留／完了／中止` と別の軸である。

| AI応答のフィールド | 内容 | 反映先・動作 |
| --- | --- | --- |
| reply | 本人向けの回答 | 会話表示・保存 |
| insufficientEvidence | 根拠不足の表示 | 資料や子課題の不明状態でもサーバーが追加判定 |
| citations | thinkIdと本文の原文引用 | 本文と照合し、hash・引用位置を保存 |
| proposals | 概要のfield、変更案after、理由reason | サーバーがbeforeを付与。７項目以外は扱えない |
| progressProposals | milestone、reach、userQuote、reason | 今回の本人発言を根拠に候補化し、UIで確認後に進捗保存 |
| subtaskCandidates | id、title、goal、completionCriteria、reason | 最大５件。確認後に子Bundle追加 |
| pauseCandidates | paused、userQuote、reason、resumeCondition、resumeSummary | 最大１件。確認後に保留／再開記録 |

現在の上限例：資料Contextは最大120000文字、会話履歴は100Turn・約2MBの制限、進捗履歴は100Event。長期間の運営ループに使う際は履歴の分割・圧縮・保持方針を設計し直す必要がある。

## 7. APIの名前

| ルートファイル | 主なAPI | 内容 |
| --- | --- | --- |
| [bigqueryRoutes](../../server/routes/bigqueryRoutes.ts) | GET／PUT `/api/bq/files/:id/think-support` | 課題概要の読込・保存 |
| [conversationRoutes](../../server/routes/conversationRoutes.ts) | GET `/api/think-support/conversations/status`、POST `…/turns` | 接続確認・生成 |
| conversationRoutes | GET `…/bundles/:id`、`…/chats/:chatId`、`…/chats/:chatId/bundles/:bundleId` | 対象ごとの会話読込 |
| conversationRoutes | PUT `…/bundles/:id/turns/:turnId`、`…/chats/:chatId/turns/:turnId`、`…/chats/:chatId/bundles/:bundleId/turns/:turnId` | 対象ごとの会話保存 |
| [progressRoutes](../../server/routes/progressRoutes.ts) | GET／PUT `/api/think-support/progress/bundles/:id` | 到達状態・保留／再開 |
| [agentRoutes](../../server/routes/agentRoutes.ts) | GET `/api/think-support/agents/status`、GET `…/bundles/:id`、POST `…/jobs`、POST `…/bundles/:id/jobs/:jobId/:action`、GET `…/bundles/:id/jobs/:jobId/artifact` | ジョブ・実行・中断・成果物採用・成果物読込 |
| [externalRoutes](../../server/routes/externalRoutes.ts) | GET／PUT `/api/think-support/external/bundles/:id` | 外部連携・準備記録 |
| [fileSearchRoutes](../../server/routes/fileSearchRoutes.ts) | GET `/api/think-support/file-search/status`、`…/stores`、GET／PUT `…/bundles/:id/binding` | 能力・ストア一覧・対応保存 |
| [chatRoutes](../../server/routes/chatRoutes.ts) | GET `/api/chat/providers`、POST `/api/chat/messages` | 旧Chat入口を停止する境界。新しい思考支援AIの生成入口ではない |

Prefix登録は [server/index.ts](../../server/index.ts)。`thinkSupportRoutes.test.ts` というテスト名はあるが、課題概要のroute本体はbigqueryRoutesにある。

`THINK_SUPPORT_AI_ENABLED`、`THINK_SUPPORT_AI_PROVIDER`、`THINK_SUPPORT_AI_MODEL` は現行AI用。古い `AI_PROVIDER`／モデル選択UIだけを変えても、現行会話の設定が変わるとは限らない。

## 8. 旧実装・未接続・混同しやすいファイル

| ファイル・名前 | 状態 | 扱い |
| --- | --- | --- |
| [SupportChat.legacy.tsx](../../src/components/ThoughtSupport/SupportChat.legacy.tsx) | 現行パネルの宿主ではない | 旧SupportAnswer、操作・分類・担当変更・副作用の実装を保全 |
| [thoughtSupport.ts](../../src/services/thoughtSupport.ts) | 混在 | PANELS、KINDS、SupportPanel、旧記録読取等は現行でも使用。SUPPORT_POLICY／ROLE_POLICYと旧更新プロトコルは現行AIの基本指示ではない |
| [thoughtSupportEffects.ts](../../src/services/thoughtSupportEffects.ts) | 旧経路の副作用処理 | 旧のBundle・子Chat・成果物の作成。現行の子Bundle作成と同一ではない |
| [ChatApiService.ts](../../src/services/ChatApiService.ts) | 停止用のstreamChat | 旧呼出しに停止エラーを返す |
| [ChatApiService.legacy.ts](../../src/services/ChatApiService.legacy.ts) | 旧クライアント | 旧ストリーミング実装を保全 |
| [chatRoutes.legacy.ts](../../server/routes/chatRoutes.legacy.ts)、[ChatService.ts](../../server/services/ChatService.ts) | 旧サーバー経路 | 現行のchatRoutesはこれを呼ばない |
| [.thinktank/thinktank.md](../../.thinktank/thinktank.md) | 旧ルートの指示ファイル | 現行役割設定に転用するなら、新しい読込とAPI接続が必要 |
| [AiChatView.tsx](../../src/components/ThinktankPanel/AiChatView.tsx) | 旧UIと型定義 | 現行SupportChatはRef・モデル選択の型を参照するが、この会話画面本体を描画しない |
| [ThinktankAiView.tsx](../../src/components/ThinktankPanel/ThinktankAiView.tsx) | 初期の仮置き | 現行ThinktankAreaから呼ばれない |
| [HarvestChat.tsx](../../src/components/HarvestPanel/HarvestChat.tsx) | 旧UI | 現行HarvestAreaはSupportChatを描画し、HarvestChatは呼ばない |
| docs/ThinkSupport/01〜30 | 実装・議論の履歴 | 後の資料が前の仕様を更新。旧パネル名が残る |
| [全体像と今後の方針](../261001/思考支援_全体像と今後の方針.md) | 直前の現状整理 | 基準コミットとパネル名が今回と異なる。本書と併せて参照 |

`ThoughtSupport`（UIディレクトリ）、`thinkSupport`（現行保存キー）、`thoughtSupport`（旧保存キー）、`think-support`（API Prefix）は同じ綴りではない。名前を統一する場合は、コードの内部名、保存形式、公開API、旧データ互換を別々に扱う。

## 9. 名前の変更を検討するときの単位

| 変更対象 | 同時に確認するもの |
| --- | --- |
| パネル名 | 表示ラベル、ファイル、クラス、CSS、Status／Action／Shortcut、タイトル、localStorage、旧名変換 |
| 機能名 | UIラベル、固定質問、基本指示、AI応答schema、検証、採用操作 |
| 課題・進捗のデータ名 | Metadata、schemaVersion、読込互換、保存API、本文展開、export／復元 |
| Agentの意味 | 既存の要約・比較ジョブと新しい運営機能の関係 |
| Seeds／TaskSeed | パネル名と課題作成の引継ぎ値を分離して説明 |

将来のProgram Master、Workstream、Action、LoopRun、Decision等は現行の確定したモデル名ではない。新しい名称は、現行概念との対応・統合・廃止を決めてから採用する。
