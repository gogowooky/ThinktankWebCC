# AI再構成前：固定UI機能一覧

確認日：2026-10-05。確認基準・制約は [現状整理](AI再構成前_現状整理.md) を参照。

「固定UI」は、Reactの画面構造、表示条件、ボタンの処理、候補の種類などがコードで決まっている機能を指す。値をユーザーが変更できる設定も、操作の種類・配置は固定UIに含める。以下のIDは棚卸し用であり、実際のAction名ではない。

## 1. 共通の画面機能

| ID | 機能 | 現在の動作・条件 | 主な実装 |
| --- | --- | --- | --- |
| U01 | ４パネルの配置 | 左からThinktank、Seeds、Discuss、Harvest | [AppLayout](../../src/components/Layout/AppLayout.tsx) |
| U02 | Think／Edit表示モード | Thinkでは４パネル、EditではSeeds・Harvestを隠し、Thinktank・Discussの会話タブも隠す。Edit切替時にSeedsの表示Bundleを退避・解除し、戻ると復元する | AppLayout、各TabBar |
| U03 | パネル開閉・幅調整 | 縦タブ、幅モード、Splitter。Shift付き開閉でパネル内のセクションをまとめて開閉 | [usePanelSectionsSetAll](../../src/hooks/usePanelSectionsSetAll.ts)、各Panel、AppLayout |
| U04 | チェック済みThinkの共有 | 一覧／Chatピッカーのチェックはパネル間で共有。閲覧・選択・チェックは別の状態 | [TTApplication](../../src/views/TTApplication.ts)、各Area |
| U05 | 出典・Thinkを開く | 会話の出典はDiscussに開く。課題BundleはSeedsに開く。クリック・D&D等の入口がある | [SupportConversation](../../src/components/ThoughtSupport/SupportConversation.tsx)、各一覧、Discuss |
| U06 | 表示・操作設定 | Status、Action、Shortcut、色、検索タグの仕組み。操作の受け口はコード、設定の一部はテキスト／Memoから読み込む | [TTUIStateManager](../../src/views/TTUIStateManager.ts)、[TTActions](../../src/views/TTActions.ts)、[TTShortcutManager](../../src/views/TTShortcutManager.ts) |

役割文を変えても、これらの配置や表示条件は自動変更されない。

## 2. Thinktank

入口：[ThinktankArea](../../src/components/ThinktankPanel/ThinktankArea.tsx)、[ThinktankTabBar](../../src/components/ThinktankPanel/ThinktankTabBar.tsx)、[ThinktankMenuRibbon](../../src/components/ThinktankPanel/ThinktankMenuRibbon.tsx)。

| ID | UI／操作 | 現在の動作 | 種類 |
| --- | --- | --- | --- |
| T01 | Think一覧タブ | Vault全体のThinkを一覧にする。Bundleも一覧内で扱う | 閲覧 |
| T02 | タイトル・日付絞り込み | タイトル／キーワード、作成日・更新日・範囲、履歴、条件クリア | 検索・表示 |
| T03 | コンテンツ検索・種別選択 | 保存先への本文検索、memo／bundle／table／links／chat／html／nettextの選択。Editでは基本編集対象の種別を優先 | 検索・表示 |
| T04 | 表示項目とソート／フィルター選択 | 列・並び順、表示する絞り込み欄を選ぶ | 表示設定 |
| T05 | 全チェック・チェックのみ表示 | 表示中の全選択／解除、チェック済みだけの表示、件数表示 | 選択 |
| T06 | Bundleを作成 | 検索条件／絞り込み条件とチェックしたIDからBundleを作る。単純なチェックIDだけの集合とは限らない | 保存 |
| T07 | チェック中のThinkを削除 | 確認ダイアログ後に削除し、Discussで開いている対象も閉じる | 保存・削除 |
| T08 | 表示更新／BigQuery同期 | 表示更新。同期ボタンはホスト側から同期処理が提供される場合に表示 | 読取・同期 |
| T09 | 会話履歴タブ | Thinktank担当のChatをVault内から表示し、選択したChatを共通AIChatで扱う | 対話 |
| T10 | 新規チャット | ピッカーの仮想行から `ASK:Thinktank｜新しい相談` を保存して選択 | 保存・対話 |
| T11 | 相談を課題として開始 | 課題名、会話由来の目的・完了条件を確認し、課題BundleとChatのID対応を保存してSeedsに開く。既存対応があれば再利用 | 思考支援 |
| T12 | 課題をSeedsで開く／関連付けを完了 | 課題化済みChatでは開始操作の表示を変える。TASKというタイトルだけでは対応Bundleを作らない | 思考支援 |
| T13 | 相談に類似した課題を調査 | 相談名・本人の発言と読み込み済み課題名・目的・完了条件の共通語を照合し、最大10件提示。候補を開いてもChatの対応先は変更しない | 思考支援 |
| T14 | 設定 | 表示拡大／縮小、Think／Edit切替、保管庫名の変更・履歴・保存、保存先の表示 | アプリ設定 |

T11〜T13は [SupportConversation](../../src/components/ThoughtSupport/SupportConversation.tsx) で `panelName === 'Thinktank'` を条件に配置されている。役割文をSeedsに移しても、この操作はSeedsに現れない。

## 3. Seeds

入口：[SeedsArea](../../src/components/SeedsPanel/SeedsArea.tsx)、[SeedsTabBar](../../src/components/SeedsPanel/SeedsTabBar.tsx)、[SeedsMenuRibbon](../../src/components/SeedsPanel/SeedsMenuRibbon.tsx)。

| ID | UI／操作 | 現在の動作 | 種類 |
| --- | --- | --- | --- |
| S01 | Bundleの選択・D&D | 単体Bundleは選択し、Thinkやチェックした複数項目は選択Bundleへ追加。条件付きBundleへの追加では現在の一致結果を明示IDへ展開して保存する | 対象選択・保存 |
| S02 | Think一覧タブ | 選択Bundle内のThinkを一覧表示。タイトル、日付、本文、種別、列、ソート、チェックの操作を持つ | 閲覧・検索 |
| S03 | チェック中の項目をBundleから除外 | 明示参照から外し、条件で再包含されないよう除外IDも保存する。Vaultからの削除とは別 | 保存 |
| S04 | Bundle設定をクリア | パネルの選択対象を解除する。Bundle自体の削除ではない | 対象選択 |
| S05 | 設定タブ | Bundleタイトルの変更・保存、ID・日付・種別、参照Think数・Filter・ID一覧 | 設定・保存 |
| S06 | 会話履歴タブ | 選択Bundle内のSeeds担当Chatを共通AIChatで扱う | 対話 |
| S07 | 分析タブ：「この課題の状況」 | 目的・進捗・資料・関連相談をまとめた `BundleStatusView`。内部モード名は `graph` | 思考支援・閲覧 |
| S08 | AIと整理する／AIChatで相談する | Bundle内のChatや子課題の専用Chatを開く。タイトル上の担当パネル等に従って移動する | ナビゲーション |
| S09 | サブ課題一覧・親課題へ戻る | 直接の子課題、段階別の到達数、保留、残課題、根拠を表示。子の専用Chatを作成・再利用してDiscussで開く | 思考支援 |
| S10 | Chatタイトルによる状況一覧 | 未着手／進行中／待機／保留／完了／中止ごとに相談を表示。一部の補足は旧 `thoughtSupport` を読む | 閲覧 |
| S11 | 課題の概要 | 目的、段階、暫定結論、決定事項、残る論点、次の行動、完了条件の７項目を手動編集。出典、本人確認、保存競合の比較を扱う | 思考支援・保存 |
| S12 | 進行と到達状態 | 検討／意思決定／実行／検証を別々に記録。保留、根拠、残課題、再開条件・要約、再確認日、履歴、競合比較、JSON書き出し | 思考支援・保存 |
| S13 | 資料の処理ジョブ | 要約／比較を選択し、追加依頼と資料範囲を確認して登録・実行・再実行・中断。候補をMarkdown保存、または確認後に新規Thinkへ追加 | 思考支援・AI処理 |
| S14 | NotebookLMへ手動で渡す | 連携先URL・アカウント識別、資料取得、対応表とMarkdown書き出し、準備記録、変更差分、履歴・復元を扱う | 外部連携 |
| S15 | Gemini File Searchの確認・対応保存 | 有効化状況・ストア一覧とページ取得、接続確認の中断、接続ID別のストア登録／変更／解除、履歴書き出し | 外部連携 |
| S16 | 参照資料と過去の記録 | Snapshot、読み込めた件数、欠落・競合・未保存、旧記録の出典を確認する | 閲覧・検証 |

S11〜S16の主要機能は「詳細な記録・進捗・連携」の折りたたみ内に置かれている。S11／S12／S13／連携記録の保存はBigQuery対応を条件とする部分がある。

S13の新規Think追加はBundle資料定義や到達状態の変更とは別処理。S14は手動書き出しであり、NotebookLMとの自動同期ではない。S15は接続・対応の保存であり、資料のアップロード・同期・検索を実施した記録ではない。

主な実装：[BundleStatusView](../../src/components/SeedsPanel/BundleStatusView.tsx)、[BundleThoughtSupport](../../src/components/SeedsPanel/BundleThoughtSupport.tsx)、[SubtaskList](../../src/components/ThoughtSupport/SubtaskList.tsx)、[BundleProgress](../../src/components/ThoughtSupport/BundleProgress.tsx)、[BundleAgent](../../src/components/ThoughtSupport/BundleAgent.tsx)、[BundleExternal](../../src/components/ThoughtSupport/BundleExternal.tsx)、[FileSearchConnection](../../src/components/ThoughtSupport/FileSearchConnection.tsx)、[BundleFileSearchBinding](../../src/components/ThoughtSupport/BundleFileSearchBinding.tsx)。

## 4. Discuss

入口：[DiscussPanel](../../src/components/DiscussPanel/DiscussPanel.tsx)、[DiscussArea](../../src/components/DiscussPanel/DiscussArea.tsx)、[DiscussTabBar](../../src/components/DiscussPanel/DiscussTabBar.tsx)、[DiscussSettingArea](../../src/components/DiscussPanel/DiscussSettingArea.tsx)。

| ID | UI／操作 | 現在の動作 | 種類 |
| --- | --- | --- | --- |
| D01 | 複数Pane | Thinkの閲覧・編集、フォーカス、Splitter、Paneタイトルのドラッグ、資料のD&D、閉じる | 作業領域 |
| D02 | Pane設定 | 左右上下に分割／端へ追加、フォーカスPane削除、全Pane削除、選択Bundle外のPane削除、幅・高さの均等化 | 配置操作 |
| D03 | メディア切替 | ContentTypeに応じてTextEditor、Markdown、DataGrid、Card、Graph、HTML、Chatを切り替える | 表示 |
| D04 | TextEditor | Monacoで編集、保存、見出し・折りたたみ・ハイライト・検索タグ・リンク等の既存エディタ操作 | 編集 |
| D05 | メモ・テキスト・HTML入出力 | 新規メモ、テキスト／HTML読込、表示中資料のファイル保存 | ファイル入出力 |
| D06 | BigQuery Export・Restore | 保存済みThinkのローカル書き出し、対象ThinkまたはBQ全体の１時間前への復元操作。具体的な確認処理はAction側で行う | 保存先管理 |
| D07 | 音声入力 | TextEditor向け音声入力のON／OFF・入力取消。ブラウザ対応を条件とする | 入力 |
| D08 | キー・色・検索タグ設定 | Vaultの名前付きMemoから読込、Defaultへリセット。実際の読込規則はAction側の実装が正 | 設定 |
| D09 | エディタ表示・文字設定 | 行番号、Wordwrap、ミニマップ、全角スペース、Unicode表示、括弧対応、基本色、見出し・タグ・グループ等の色 | 表示設定 |
| D10 | Markdown表示 | 整形・コード表示・見出し折りたたみ。編集はTextEditor。折りたたみ状態を共有 | 閲覧 |
| D11 | DataGrid／Card | tableは表または行カード、bundleは参照Thinkの一覧。表ではセル編集・行追加・ソート・保存等を扱う | 閲覧・編集 |
| D12 | Graph表示 | ThinkのRelatedIDsとBundle参照の関係グラフ | 閲覧 |
| D13 | HTML表示・新規作成 | ソース編集、新規HTML、隔離したiframeプレビュー | 成果物・閲覧 |
| D14 | テーブル入出力 | 新規table、CSV／XLSX読込、表示中tableのCSV保存 | ファイル入出力 |
| D15 | 会話履歴（設定領域） | 選択Bundle内のDiscuss担当Chatを選択し、共通AIChatで対話 | 対話 |
| D16 | Chat Pane | Chat ThinkをPaneで開き、同じ共通AIChatを使う。対応BundleがなければChat単独の相談を許す | 対話 |
| D17 | サブ課題専用Chat | Seedsから子課題のChatを作成・再利用し、Discussへ引き継ぐ | 思考支援 |
| D18 | Markdown／Card／Graph設定タブ | タブはあるが専用設定画面は「今後追加予定」。各メディアの表示機能自体は存在する | 仮置きUI |

MediaType候補は [DiscussMenuRibbon](../../src/components/DiscussPanel/DiscussMenuRibbon.tsx) の配列で固定される。ChatにはTextEditor／Chat、BundleにはTextEditor／DataGrid／Markdown／Card／Graph、HTMLにはソース／HTML表示など、対象種別による違いがある。

D07の音声入力と、思考支援AIの音声対話は別の機能。後者のP7は未実装。

## 5. Harvest

入口：[HarvestArea](../../src/components/HarvestPanel/HarvestArea.tsx)、[HarvestTabBar](../../src/components/HarvestPanel/HarvestTabBar.tsx)、[HarvestMenuRibbon](../../src/components/HarvestPanel/HarvestMenuRibbon.tsx)。

| ID | UI／操作 | 現在の動作 | 種類 |
| --- | --- | --- | --- |
| H01 | 会話履歴タブ | 選択Bundle内のHarvest担当Chatを一覧・選択する | 閲覧・対話 |
| H02 | 共通AIChat | 対応課題の資料を使って対話・提案確認を行える。Harvest専用の基本指示はない | 対話 |
| H03 | 表示更新・列・ソート・フィルター | Chat一覧の表示を変更する | 表示設定 |
| H04 | アイテム選択クリア | 選択中Chatを解除 | 選択 |
| H05 | 手動保存アイコン | 表示されるが無効。会話保存は共通AIChat側の処理 | 無効UI |
| H06 | 設定タブ | 「Harvest設定は今後追加予定です」という仮置き | 仮置きUI |

結果と期待の比較、終了・継続の正式な確認、成果・知見の整理、次回へ戻す処理の専用UIはない。現在ある共通の「進行を見直す質問」は、Harvest専用の検証・終結機能が完成したことを意味しない。

## 6. 共通AIChatの固定UI

Thinktank、Seeds、Discuss設定、Discuss Chat Pane、Harvestに共通。配置や条件は [SupportConversation](../../src/components/ThoughtSupport/SupportConversation.tsx) と [BundleConversation](../../src/components/ThoughtSupport/BundleConversation.tsx) で決まる。

| ID | 表示／操作 | 動作・条件 |
| --- | --- | --- |
| C01 | Chatピッカー | Chat名・作成日・更新日・読込済み本文・種類・タイトル状態で絞る。列・ソート、チェック、D&D。通常最大５行、フォーカス外は選択した１行に縮む。Pane内にはこの一覧を置かない |
| C02 | 対象確認 | ChatとBundleのID対応を解決。複数候補では選択を求め、ID競合や削除済み対象では送信を止める |
| C03 | 会話履歴・引用 | 質問／回答、根拠不足、資料本文と一致する引用を表示し、出典Thinkへ移動 |
| C04 | 入力・送信 | Enterで送信、Shift+Enterで改行、IME入力の保護。質問上限4000文字。入力を履歴スクロールから分離 |
| C05 | 準備・生成の中断 | 資料・履歴の準備中断、応答生成の中断、待機・失敗表示 |
| C06 | 回答保存の再試行・書き出し | 保存できなかった回答を保持し、AIを再呼出しせず保存を再試行、JSON書き出し |
| C07 | 課題概要への反映 | AI提案の変更前後・理由を確認し、「この内容で反映」。bundle-onlyの提案だけを対象とする |
| C08 | 到達状態・保留／再開候補 | 最新回答の候補を確認、根拠・残課題・再開条件等を編集し、本人の判断として記録 |
| C09 | サブ課題候補の追加 | 最新回答の最大５候補を１件ずつ採用。候補がなければnextAction提案を子課題にする入口。担当はDiscussに固定 |
| C10 | この会話の記録を表示 | 会話ごとのJSON・送信時点の記録を別ダイアログで確認し、書き出す |
| C11 | 条件・機能・参照情報 | 操作と参照情報を折りたたむ。Shift付き操作で子区分を畳む |
| C12 | 相談のアクション | Thinktankでは課題化・類似課題調査を配置 |
| C13 | サブ課題への分解を相談する質問を入力 | Thinktank以外でBundleがある場合に固定質問文を入力する。押した時点では送信・作成しない |
| C14 | 進行を見直す質問を入力 | Thinktank以外に固定質問文を配置。課題全体の完了は確定しない |
| C15 | 子課題を含めて次の行動を整理する質問を入力 | Thinktank以外でBundleがある場合。読み込み済みの直接の子課題の確認済み記録を使う |
| C16 | 続きから相談する質問を入力 | Thinktank以外でBundleがある場合。再開要約用の固定文を入力。自動で保留を解除しない |
| C17 | 参照情報 | サーバーのProvider／モデル、対象、資料件数、課題の到達状態、子課題、欠落・不明点、資料本文 |
| C18 | BigQuery制約の案内 | 対応モードでない場合に案内。AI停止中は履歴・参照情報の確認を残す |

C07：[ProposalReview](../../src/components/ThoughtSupport/ProposalReview.tsx)。C08：[ProgressProposal](../../src/components/ThoughtSupport/ProgressProposal.tsx)。C09：[SubtaskProposal](../../src/components/ThoughtSupport/SubtaskProposal.tsx)。

## 7. 無効・未接続・再検討候補

以下は現状の判断材料であり、削除・移動の決定ではない。

| 対象 | 現状 | 検討できる変更 |
| --- | --- | --- |
| 各パネルの手動Chat保存 | 無効ボタン。`SupportChat.save()` は空処理 | 自動保存の案内に統一、またはボタン削除 |
| モデル選択の配線 | 各パネルから `modelSelector` を渡すが現行SupportChatは使用せず、共通会話要求にも送らない | サーバー設定として整理するか、実際の切替機能として接続する |
| 旧会話スクロールAPI | `scrollToPrevUser`／`scrollToNextUser` は現行SupportChatでは空処理 | 必要なナビゲーションとして実装し直すか、受け口を整理する |
| Thinktank以外の新規Chat行 | 行は表示されるがChat作成は行わない | 非表示、全パネル共通作成、対象Bundle付き作成などを選ぶ |
| 固定質問ボタンC13〜C16 | 操作の名称・文・配置がコードにある | 役割テキスト／設定から読込、自然言語対話に統合、共通操作に整理 |
| 担当Discuss固定 | 子課題のデータ型、作成、一覧、Chat引継ぎに固定がある | パネルの役割変更時には担当と表示先の規則も見直す |
| Harvest・一部メディアの仮置き設定 | 専用設定の内容がない | 必要項目を実装、またはタブを減らす |
| Seedsに集まった管理フォーム | 俯瞰、概要、進捗、ジョブ、外部連携が同居 | 俯瞰・運営・検証・接続設定に応じて配置を選び直す |

UIを削除することと、保存記録・API・機能本体を削除することは別の判断である。移動候補は共通コンポーネントと保存処理を持つものが多く、配置を変更して既存データを使い続けることもできる。

## 8. ループマネジメントに必要だが専用UIがない機能

| 機能 | 現行の近い機能 | 初期配置の候補（未決定） |
| --- | --- | --- |
| Program Charter・判断基準・権限 | 課題概要７項目 | Seedsの概要、共通設定 |
| Workstream・マイルストーン・担当・依存関係 | 親子課題、到達状態 | Seedsの俯瞰 |
| 複数Actionの採用・担当・期限・期待結果 | nextActionの自由記述、サブ課題追加 | Discussの対話付随操作、Seedsの一覧 |
| 前回Actionの追跡・日次／週次レビュー | 会話履歴、固定の見直し質問 | Discuss |
| 報告・出来事と対象／Actionの関連付け | Think追加、Bundle参照 | Thinktank、Discuss |
| 期待結果と実際の比較・検証記録 | 検証の到達状態、根拠資料 | Harvest |
| 課題全体の終了・継続・残課題の引継ぎ | 段階別進捗、保留・再開 | Harvestから共通記録を更新 |
| 各回のループ履歴と知見の再利用 | ConversationTurn、ProgressEvent | Harvestの振り返り、Seedsの現在地 |
| パネルの役割テキスト編集・版の確認 | 旧ROLE_POLICYのみ | 設定画面 |

タイマーによる自動起動、外部報告の自動取込、外部への送信はUIの追加だけでは完成せず、起動・連携・権限・実行結果を扱うアプリ側の仕組みが必要になる。
