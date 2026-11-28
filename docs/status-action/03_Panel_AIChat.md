# Panel AIChat =====================================================================================================
## Status：　261012　AIChat.ModelNames.Claude
Thinktank>設定>AIモデルで入力したモデル名（CSV）で、その1番目を送信に使う。既定は空（None）。
description:    各パネルのAIChatがClaudeのときのモデルID（CSV。先頭が選択中）
key:            AIChat.ModelNames.Claude
current:        None
default:        None
type:           string
candidates:     ^[^,]+(,[^,]+)*$
## Status：　261012　AIChat.ModelNames.OpenAI
Thinktank>設定>AIモデルで入力したモデル名（CSV）で、その1番目を送信に使う。既定は空（None）。
description:    各パネルのAIChatがOpenAIのときのモデルID（CSV。先頭が選択中）
key:            AIChat.ModelNames.OpenAI
current:        None
default:        None
type:           string
candidates:     ^[^,]+(,[^,]+)*$
## Status：　261012　AIChat.ModelNames.Gemini
Thinktank>設定>AIモデルで入力したモデル名（CSV）で、その1番目を送信に使う。既定は空（None）。
description:    各パネルのAIChatがGeminiのときのモデルID（CSV。先頭が選択中）
key:            AIChat.ModelNames.Gemini
current:        None
default:        None
type:           string
candidates:     ^[^,]+(,[^,]+)*$
## Status：　261030　AIChat.ModelNames.GNB
Thinktank>設定>AIモデルで入力したGemini NotebookのNotebook ID（CSV）で、その1番目を送信とリンクに使う。既定は空（None）。
description:    各パネルのAIChatがGNBのときのNotebook ID（CSV。先頭が選択中）
key:            AIChat.ModelNames.GNB
current:        None
default:        None
type:           string
candidates:     ^[^,]+(,[^,]+)*$
## Status：　261012　AIChat.ModelNames.Local
Thinktank>設定>AIモデルで入力したモデル名（CSV）で、その1番目を送信に使う。既定は空（None）。現時点でLocal AIは送信に使えない。
description:    各パネルのAIChatがLocalのときのモデルID（CSV。先頭が選択中）
key:            AIChat.ModelNames.Local
current:        None
default:        None
type:           string
candidates:     ^[^,]+(,[^,]+)*$
## Status：　261012　ThinktankPanel.AIChat.ModelName
AIChatでは、Status変数 "AIChat.ModelNames.{本ModelName}" からモデル名を取得して API通信する。
description:    ThinktankPanelのAIChatで用いるAIモデル名
key:            ThinktankPanel.AIChat.ModelName
current:        Claude
default:        Claude
type:           string
candidates:     ^(Claude|OpenAI|Gemini|GNB|Local)$
## Status：　261012　SeedsPanel.AIChat.ModelName
AIChatでは、Status変数 "AIChat.ModelNames.{本ModelName}" からモデル名を取得して API通信する。
description:    SeedsPanelのAIChatで用いるAIモデル名
key:            SeedsPanel.AIChat.ModelName
current:        Claude
default:        Claude
type:           string
candidates:     ^(Claude|OpenAI|Gemini|GNB|Local)$
## Status：　261012　WorkingSettingPanel.AIChat.ModelName
AIChatでは、Status変数 "AIChat.ModelNames.{本ModelName}" からモデル名を取得して API通信する。
description:    WorkingSettingPanelのAIChatで用いるAIモデル名
key:            WorkingSettingPanel.AIChat.ModelName
current:        Claude
default:        Claude
type:           string
candidates:     ^(Claude|OpenAI|Gemini|GNB|Local)$
## Status：　261012　WorkingPanel.AIChat.ModelName
AIChatでは、Status変数 "AIChat.ModelNames.{本ModelName}" からモデル名を取得して API通信する。
description:    WorkingPanelのAIChatで用いるAIモデル名
key:            WorkingPanel.AIChat.ModelName
current:        Claude
default:        Claude
type:           string
candidates:     ^(Claude|OpenAI|Gemini|GNB|Local)$
## Status：　261012　HarvestPanel.AIChat.ModelName
AIChatでは、Status変数 "AIChat.ModelNames.{本ModelName}" からモデル名を取得して API通信する。
description:    HarvestPanelのAIChatで用いるAIモデル名
key:            HarvestPanel.AIChat.ModelName
current:        Claude
default:        Claude
type:           string
candidates:     ^(Claude|OpenAI|Gemini|GNB|Local)$

　A（261012実装）：
　　■ AIChat.ModelNames.*（全パネル共通。src\services\aiChatModelStatus.ts）
　　　【261030 改】値は Thinktank>設定>AIモデル（ChatGPT / Gemini / Claude / GeminiNotebook(GNB) / Local の CSV 欄）で
　　　利用者が入力したものをそのまま一覧とし、先頭を送信に使う。
　　　GNB欄だけはモデルIDではなくNotebook IDを入力し、項目名のリンク先とnlm CLIへの問い合わせ先に使う。
　　　Notebook IDが未設定のとき、項目名はGemini Notebookのトップページへのリンクにする。
　　　各項目の右側には対応CLIの認証状態を「ログイン済」「未ログイン」で表示する。
　　　未ログインはブラウザ認証リンクとし、PC版では各CLIのログイン処理を開始、Web版では各サービスの
　　　ログインページを開く。Localの認証状態は「未設定」と表示する。
　　　GNB欄の入力ボックス直下には、CSV先頭のNotebook IDからnlm CLIで取得した
　　　「タイトル：{Notebookタイトル}」を表示する。
　　　サーバー（下記）は廃止済みで一覧の自動取得はしない。既定値も入れない（全社 None 始まり）。
　　　以下は 261012 時点の記録。
　　　値は API のモデルIDの CSV で、先頭が選択中。起動時にサーバーの
　　　/api/think-support/conversations/models（server\services\AIModelCatalog.ts）から各社の
　　　「今使える最新の主要モデル」を取得して設定し直す。保存済みの選択が一覧にあれば先頭に残し、
　　　一覧に無いIDは捨てる。一覧は各社のモデル一覧APIの結果をサーバーが24時間保持する
　　　（取得に失敗した社は前回の一覧。APIキーが無い社は None）。絞り込みの規則：
　　　　Claude … opus / sonnet / haiku の系列ごとに最新の版（同じ版なら日付なしの別名）
　　　　OpenAI … 最新の大版（gpt-6 等）の系統ごとに最新の版。codex・音声・検索などの用途別と日付付きは除く
　　　　Gemini … flash / pro / flash-lite ごとに最新の安定版（preview・exp・tts・image 等は除く）
　　　Local は現時点で常に None。
　　　2026-10-12 時点の実際の一覧：OpenAI = gpt-6-astra,gpt-6-luna,gpt-6.1-sol、
　　　Gemini = gemini-3.8-flash,gemini-2.5-pro,gemini-3.5-flash-lite、Claude は APIキーが認証エラー（401）で空。
　　■ {Panel}.AIChat.ModelName（パネルごと。WorkingSetting と Working の Pane は別々）
　　　会話の送信時に、このプロバイダの AIChat.ModelNames.* の先頭のモデルを指定して送る。
　　　サーバーは上記の一覧（許可リスト）にあるモデルだけを受け付け、その社と会話する
　　　（Claude の会話実装 AnthropicProvider を追加）。会話の記録の provider / model も送ったモデルになる。
　　　Thinktank>設定>Default AI のドロップダウン（ChatGPT / Claude / Gemini / GNB / Local）で選ぶ。
　　　項目と Status の対応：Thinktank → ThinktankPanel、Seeds → SeedsPanel、Working → WorkingSettingPanel、
　　　Harvest → HarvestPanel、Panes → WorkingPanel（各 .AIChat.ModelName）。会話画面には選択欄を置かない。
　　　送るモデルはそのプロバイダの AIChat.ModelNames.* の先頭（Thinktank>設定>AIモデルで入力）。
　　　旧版のパネル別の保存値（localStorage の tt-ai-model-*）は初回起動時に引き継ぐ。

