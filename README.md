# Thinktank

Thinktank — Electron + React + TypeScript + Express のデスクトップアプリ。
アイデアをVaultに蓄積し、AIとの対話で思考を補完する。

## 更新履歴

<!-- git-update スキルがコミットのたびにこの直下へ新しい順で追記する -->

### v1.5.18 feat: AI提案から課題概要反映・目的と完了条件の引継ぎ・サブ課題追加（ProposalReview・SubtaskProposal）
- 日付: 2026-09-16
- コミット番号: d2cd004

Bundleを参照したAIChat回答から「課題の概要に反映する内容を確認」を表示し、
本人確認後にまとめて保存するProposalReview UIとproposalReviewサービスを追加。
Thinktank相談の課題化時に目的・完了条件をChatから引継ぐSupportConversationフローを追加。
次の行動一覧からサブ課題を追加するSubtaskProposal・SubtaskList UIを追加。
TTVaultにBundle課題概要の部分更新・サブ課題追加・Chat-Bundle関連IDの操作を追加。
BundleStatusView・BundleConversation・SupportChat・ThinktankAreaを更新。
aiNeutralCore.test・SupportConversation.test・proposalReview.test・taskSeed.testを追加。
docs/ThinkSupport/20〜22・04_実装計画書・16_Thinktank相談・READMEを更新。変更: 25ファイル（+580行）。

### v1.5.17 docs: Chat本文とAIChat履歴の統合方針・動作・実データ照合記録を追加
- 日付: 2026-09-16
- コミット番号: a0355dc

Chat本文とAIChatのthinkConversations統合方針、旧形式の復元ルール、
保存失敗時の再試行挙動を整理したdocs/ThinkSupport/19を追加。
実データ照合記録（Chat ID 2026-09-09-141300、旧本文12件＋新会話1件）を記載。
docs/ThinkSupport/02_UI・04_実装計画書・13_P3_AIChat接続・READMEを更新。変更: 5ファイル。

### v1.5.16 feat: 会話インタビューの候補採用と保存フローを整備（conversationRecord・BundleConversation）
- 日付: 2026-09-16
- コミット番号: 1e241dc

conversationRecordに候補採用・拒否・修正の操作と採用履歴を追加。
conversationRoutesに採用操作エンドポイントと採用結果の会話保存を追加。
BundleConversation.tsxで候補の採用・拒否・修正UIを実装、採用済み項目の確認表示を整備。
ConversationService.tsのリクエスト形式を更新。
conversationRoutes.test・BundleConversation.testを更新。変更: 6ファイル（+75 / -16行）。

### v1.5.15 feat: AIインタビュー優先UIとGemini思考支援AI接続（BundleStatusView刷新・GeminiAdapter追加）
- 日付: 2026-09-16
- コミット番号: 22abd3b

Overview分析の先頭に「AIと整理する」を配置し、課題概要手入力・到達状態・Agent・
外部連携・File Search設定を「詳細な記録・進捗・連携」へ折りたたんだ。
AIProvider.tsにGeminiアダプターを追加（既定停止、実APIキー未設定）。
conversationRecord・ConversationService・conversationRoutesにインタビュー形式の
問い・候補・採用操作を追加。BigQueryServiceにGemini向けBQ書込を追加。
BundleConversation.tsx/cssを刷新（インタビューUI・採用操作・送信範囲表示を整理）。
BundleStatusView.tsx/css/testを大幅更新（折りたたみ構造・AIと整理タブを追加）。
OverviewArea・OverviewTabBar・SupportConversation・BundleAgent/External/Progress CSSを更新。
docs/ThinkSupport/17_AIインタビュー優先UI.md・18_Gemini思考支援AI.mdを追加。変更: 26ファイル（+386 / -122行）。

### v1.5.14 feat: Thinktank相談の課題化（AIChat選択から課題Bundleを作成してOverviewで開く）
- 日付: 2026-09-15
- コミット番号: bc295b0

ThinktankのAIChatで選択したChatを課題Bundleとして登録する操作を追加。
「この相談を課題として始める」ボタンから課題名を確認・編集し「作成してOverviewで開く」で保存。
課題Bundleの先頭行に課題名、Bundle本文の*行と関連IDにChatIDを保存。
会話本文はBundle複製せず選択Chatのまま維持。
TTVaultにBundle作成とChatID登録メソッドを追加（TTVault.ts）。
SupportConversation・SupportChat・ThinktankAreaを更新。
SupportConversation.test/aiNeutralCore.testにテストを追加。
docs/ThinkSupport/16_Thinktank相談の課題化.mdを追加。変更: 9ファイル（+124行）。

### v1.5.13 fix: BundleConversation の連続対話修正（回答保存後の自動再取得）
- 日付: 2026-09-15
- コミット番号: 15e8f5e

回答保存成功後に履歴・参照資料・接続状態を自動再取得し、2回目の送信を可能にした。
保存のみの再試行が成功した場合も同様に再取得を実行。
準備失敗時は「再試行」を表示し、質問下書きを保持して再取得だけ行う（AIは呼ばない）。
画面切替後は追加の再取得を行わない。BigQuery以外では自動準備を実行しない。
UIテストに2回目の送信・下書き保持・既存テスト補完を追加（BundleConversation.test.tsx）。
docs/ThinkSupport/15_連続対話と課題ライフサイクル.mdを追加。変更: 4ファイル（+75行）。

### v1.5.12 refactor: P3 AIChatのUI整理と会話ルート機能拡充（Bundle選択統合・切替廃止）
- 日付: 2026-09-15
- コミット番号: c071e14

AIChat内の「AIに相談する」「これまでの会話」切替とBundle選択重複UIを廃止。
各画面の既存Bundle選択を相談対象として活用し、パネル別のChat表示範囲を整理。
conversationRoutes・ConversationServiceにBQ向けChatファイル一覧取得・会話保存を追加。
BigQueryServiceにconversation向けBQ書込を追加、conversationRecordを更新。
SupportChat・SupportConversation・BundleConversationのUI/ロジックを整理・簡素化。
Overview/ReThink/Thinktank/Workout各AreaとMenuRibbonを更新。
useSupportChats・ConversationService・index.css・BundleStatusView.cssを更新。
変更: 33ファイル（+436 / -273行）。

### v1.5.11 fix: Workout>AIChatの文字色が地色に埋もれる問題を修正
- 日付: 2026-09-15
- コミット番号: b6a6dcc

Workoutパネルは地色がリボン色（濃色）のため PanelArea.css が明るい文字色を継がせるが、
AIChat面だけは明るい地色（--workout-area-bg）に切り替わるため文字が読めなくなっていた。
.support-chat-host に .support-chat と同じ文字色(#2c3e6f)を明示し、タブ（AIに相談する／
これまでの会話）と相談ビューの双方を4パネル横断で同一配色に統一。
あわせて SupportConversation の select と BundleConversation の textarea の地色を
--bg-primary（暗色テーマ用 #1e2030）から AiChatView 入力欄と同じ明色系に変更し、
文字色が濃いOverview等で黒地に黒文字になっていた逆向きの不具合も解消。
Overview/Workout/ReThink の3パネルで文字色 rgb(44,62,111) の一致を実機確認（コントラスト比 約9:1）。
変更: 2ファイル（+12行 -3行）。CSSのみのためサーバービルドは不要。

### v1.5.10 feat: P6 BundleとFile Searchストアの対応管理を追加（FileSearchBindingService）
- 日付: 2026-09-14
- コミット番号: 6016010

FileSearchBindingServiceとfileSearchBindingRecordでBundle・Vault・ストアIDの対応を保存・変更・解除。
BundleFileSearchBinding UIを追加し、BundleStatusViewに統合。
FileSearchProvider・fileSearchRoutesにストア対応APIを追加。
FileSearchClientにバインディング操作メソッドを追加。
FileSearchConnection・BundleExternal・SupportChat/SupportConversationを更新。
資料アップロード・検索・外部ストア作成削除は未実装。
docs/ThinkSupport/14_P6ストア対応の保存.mdを追加。変更: 19ファイル（+404行）。

### v1.5.9 feat: P3 AIChatへの資料付き対話接続とSupportConversation追加
- 日付: 2026-09-14
- コミット番号: d9b0f29

各パネル（Thinktank/Overview/Workout/ReThink）のAIChatに「資料に基づく対話」「旧会話の履歴」切替を追加。
SupportConversation.tsxで新対話入口（Bundle選択・送信範囲確認）を実装（SupportConversation.css/test）。
BundleConversation.tsxを更新し、SupportConversationとの接続を整備。
SupportChat.tsxに切替ロジックを追加、AiChatView/SupportChat/ChatMediaのCSS微調整。
docs/ThinkSupport/13_P3_AIChat接続.mdを追加。変更: 12ファイル（+179行）。

### v1.5.8 fix: AiChatView・SupportChatのCSS調整（右パディング縮小・コンテキスト欄の最大高さ制限）
- 日付: 2026-09-14
- コミット番号: e0bf0c1

AiChatView: 右パディングを12px→8pxに縮小（スクロールバーとの余白過多を解消）。
SupportChat context欄: flex:0 0 auto → flex:0 1 auto＋max-height:45%＋overflow-y:autoに変更し、
決定事項が伸びて会話ログを押し出す問題を解消。

### v1.5.7 feat: P6外部資料連携の基盤実装（externalRecord・FileSearchProvider・BundleExternal）
- 日付: 2026-09-14
- コミット番号: 65efc13

OverviewにBundle「外部資料連携」UIを追加（BundleExternal.tsx/css）。
外部資料URLとMarkdown書き出しを保存するexternalRecord.ts・externalRoutesを実装。
Gemini File Search接続確認のためのFileSearchProvider・fileSearchRoutesを追加。
FileSearchConnection UIで読み取り専用の接続状態を確認できるよう実装。
ExternalService・externalBackupでクライアント側サービスを整備。
SupportChat・AiChatView・ChatMedia・WorkoutSettingAreaのCSS更新。
実API呼出し・自動同期・デプロイは未実施。
docs/ThinkSupport/11_P6実装記録・12_P6復元とFileSearch接続確認を追加。変更: 29ファイル（+1,015行）。

### v1.5.6 feat: P5 AgentServiceとBundle内資料ジョブ処理の基盤実装（AgentService・BundleAgent）
- 日付: 2026-09-14
- コミット番号: 0c56044

BundleメタデータのthinkAgentJobs領域にジョブを保存するagentRecord.tsを追加。
AgentServiceで要約・比較ジョブの登録・実行・中断・再試行・成果物管理を実装。
agentRoutesで /api/think-support/agent を既存認証内側に登録。
OverviewにBundleAgent UIを追加（BundleAgent.tsx/css）。
BigQueryServiceにAgent向けBQ書込を追加。
外部検索・NotebookLM同期・音声・実API呼出しは未実施。
docs/ThinkSupport/10_P5実装記録.mdを追加。変更: 16ファイル（+739行）。

### v1.5.5 feat: P4進行・到達状態と再開支援の基盤実装（progressRecord・BundleProgress）
- 日付: 2026-09-14
- コミット番号: 29c7eeb

到達状態を検討/意思決定/実行/検証の4項目で記録するprogressRecord.tsを追加。
ProgressServiceとprogressRoutesで保存・取得APIを実装。
OverviewにBundleProgress UIを追加（BundleProgress.tsx/css）。
BundleConversation・BundleStatusViewを更新。
実データ移行・外部AI送信・デプロイは未実施。
docs/ThinkSupport/09_P4実装記録.mdを追加。変更: 15ファイル（+475行）。

### v1.5.4 feat: P3引用付きテキスト対話の基盤実装（AIProvider・ConversationService・BundleConversation）
- 日付: 2026-09-14
- コミット番号: 0c9785f

AIProviderインターフェイスと停止Provider・OpenAIアダプターを追加（server/services/AIProvider.ts）。
ConversationServiceとconversationRecordで会話・引用・提案の保存を実装。
会話ルート /api/think-support/conversations を既存認証内側に登録（conversationRoutes.ts）。
OverviewにBundleConversation UIを追加（BundleConversation.tsx/css）。
src/services/ConversationService.tsでクライアント側サービスを実装。
実API送信・AIキー有効化・デプロイは未実施（停止Providerのまま）。
docs/ThinkSupport/08_P3実装記録.mdを追加。変更: 15ファイル（+788行）。

### v1.5.3 feat: AI-neutral基盤への移行とP2 Overview・ThinkSupport記録の整備
- 日付: 2026-09-14
- コミット番号: e0ab98f

SupportChat・ChatApiService・ContextServiceをAI-neutral構成へリファクタした。
BundleThoughtSupport・ContextSnapshotViewを新設し、OverviewにBundleコンテキスト表示を追加。
chatRoutes・bigqueryRoutes・BigQueryServiceに思考支援記録API（thinkSupportRecord）を追加。
useAiProviderAvailability・TTVaultの整理と、各パネル（Overview/ReThink/Thinktank/Workout）の
TabBar・Areaを更新。legacy/archive/testファイルを保存。
docs/ThinkSupport/に07_P0-P2統合記録と docs/AI_NEUTRAL_MIGRATION.md を追加。
変更: 46ファイル（1,949行追加 / 583行削除）。

### v1.5.2 docs: 思考支援の設計文書群（docs/ThinkSupport/）を追加
- 日付: 2026-09-13
- コミット番号: 99dfe78

現行ソースから確認したUI・データ構造と、検討した方針・設計案を整理した資料7件を追加した。
実機確認や外部API実証を終えた仕様書ではなく、記述は「現状／合意方針／設計案／要確認」に
区分してある。現状確認の基準は `codex/ai-neutral-foundation` の `f69259c`。
`README.md`（文書構成・記述の区分・共通の前提・確認に使ったソース）、
`01_思考支援の枠組み.md`（目的・AIの責務・共通コンテキスト・進行と終結）、
`02_UIの機能と役割.md`（現在の4パネル・操作の役割・制約・将来の配置案）、
`03_NotebookLM連携と対話インターフェイス.md`（同期・ID対応・検索範囲・テキスト/音声/
Agentの接続案）、`04_実装計画書.md`（段階別成果物・依存関係・受け入れ条件・未決事項）、
`05_P1実装記録.md`（読み取り専用ContextServiceの実装・制約・検証進捗）、
`06_P2実装記録.md`（Overviewの手動編集・BQ保存・競合比較と検証進捗）の構成。
コード変更は無し。

### v1.5.1 docs: 過去の計画・仕様・メモ類を整理し、docs を現行参照分のみに絞る
- 日付: 2026-09-13
- コミット番号: 6edde31

役目を終えた設計資料・レビュー報告・作業メモを76件削除した。残したのはコードから
実際に参照している4件のみ：`docs/DefaultShortcut.md` と `docs/DefaultColor.md`
（起動時に `?raw` で読み込む）、`docs/DefaultSearchTag.md`（`server/routes/systemRoutes.ts`
がリクエストのたびに直接配信する）、`docs/Thinktank_Status-Action-Binding.md`
（Action/Status の仕様書）。
削除したのは `PROJECT_REVIEW_REPORT*.md`（2件）、`docs/260507_Implementation Plans/`（6件）、
`docs/260606_Thinktank仕様書/`（8件）、`docs/260606_memos/`（14件）、
`docs/260720 Thinktankすること/`（3件）、`docs/reference/`（28件）、および
`docs/slides/`・`readme.txt`・`ThinktankWeb_*.md`・`Thinktank_AI_*.md`・
`ThoughtSupport_UI_Plan.md`・`CloudRun_Deploy.md` ほか。
`src/` `server/` `electron/` `vite.config.ts` が参照する docs パスは上記4件のみで、
削除対象への参照が無いことを確認した。内容は git 履歴から復元できる。
型検査・server ビルド・テスト187件パス。

### v1.4.59 docs: Status-Action-Binding に未記載のAction/Statusを追記し記載の齟齬を解消
- 日付: 2026-09-11
- コミット番号: 10ec1bb

TTActions レジストリ（src/views/TTActions.ts）と TTUIStateManager の PROP_SPECS を
docs/Thinktank_Status-Action-Binding.md と突き合わせ、登録済みで未記載だった Action 13件 /
Status 3件を、ファイルのフォーマット（## Action：／## Status：＋ description / key /
current / default / type / candidates）に従って追記した。
追記した Action は Application.Resource.RollbackFocusedThink・RollbackAll（BigQuery time
travel の復元APIが未実装でUIの受け皿のみである旨を明記）、Application.Date:Next・:Prev
（対応する Status が PROP_SPECS に未登録で実行しても値が変化しない旨を明記）、
Application.Status.ExMode:None、短縮表記の ExMode:ExApp・:ExOpt・:None、
Application.FocusedArea.Name:next・:prev（小文字登録）。
追記した Status は WorkoutPanel.Panes.Count（旧 WorkoutPanel.Pane.Count からのリネーム履歴
だけが残り定義本体が無かった）、TextEditor.Bullet.StyleNum、TextEditor.Comment.StyleNum。
IsVisible 系6つのトグルは :Toggle / :toggle の両ActionIDが同一ハンドラに解決される旨を
注記だけにとどめ、重複エントリは作っていない。
あわせて記載の齟齬を解消した。ToolBar.HighlighterMode.Text:AddContentSearchKeywordFlag と
:AddTitleSearchKeywordFlag はコード上 PROP_SPECS の Status なので見出しを Action から
Status へ修正。コードに実体が無い FocusedPanel.Filter.ContentType:Action（実体は
FocusedPanel.Filter.FocusedIcon:Action）と TextEditor.FoldingHeader（色の実体は
docs/DefaultColor.md の TextEditor.FoldingHeader.*）は削除した。
色系 Status は DEFAULT_COLOR_ENTRIES から動的生成され docs/DefaultColor.md で一括定義する
既存方針のため、個別追記の対象外とした。
本ファイルは TTUIStateManager が ?raw で取り込んで起動時に解釈するため、CRLF を維持している。


### v1.4.58 feat: バンドル列・再開カードの上下分割・設定Loadのリセット方式化とAIChatの配色調整
- 日付: 2026-09-10
- コミット番号: de9ebce

Think一覧・AIChat一覧に「バンドル」列（対象Bundle名）を追加。`src/utils/bundleNames.ts`
で thinkID→Bundle名を O(n) で一度だけ構築し、ソートのコンパレータと描画は `Map.get` のみに
することで、`supportRecord()`（約30項目の生成）が O(n log n) 回走るのを避けた。列順は
バンドル/タイトル/作成日(ID)/更新日/種別/キーワード/関連ID。
「前回・現在・次」は `<details>` をやめ、Chatエリアを上下に分割する構成へ変更。会話ログと
同じ表示部を使うため `AiChatView` から `AiChatLog` を切り出して共有し、区切りは他の
スプリッターと同じ作り（通常色=パネル色、hover=FocusingBorder）のセパレーターにした
（既定は高さ0で非表示、ドラッグで表示量を決める）。処置結果・エラー表示に「×」ボタンを
追加し、表示が空のときはヘッダー帯自体を隠すようにした。ヘッダー背景を `--support-area-bg`
で明示して Workout だけ暗色だった不整合を解消し、エラー文字色を4パネル一律で暗くして
コントラストを 1.7〜1.9:1 から 4.9〜5.7:1（WCAG AA）へ改善。
`SUPPORT_POLICY` に「挨拶や意図確認だけでは operation を出さず未分類のままにする」
「`record.current`/`next` は毎回1文80文字以内で更新する」を追加。`useSupportChats` は
Pane以外で開始した未分類Chatを Thinktank 一覧へ集約するようにした。
`SupportRecord.history` は直近20件で頭打ちにし、冪等判定用の operationId は `appliedOps`
に200件まで別途保持（実測で34ターン100KBまで肥大化していたため）。
`TextEditor.{KeyBinding,ColorBinding,SearchTag}.Load` を「Defaultへリセットしてから適用」
に変更し、実行回数によらず常に Default + Memo になるようにした。
あわせてパネル初期幅を調整（Thinktank/Overview 280、ReThink 320、Workout設定 220）。
テスト187件パス、型検査・本番ビルド成功。

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
