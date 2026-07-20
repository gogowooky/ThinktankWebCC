
# AIへの指示
・本ファイルは、本アプリケーション各Panelに設置されたAI Chat機能を連携利用して、ユーザーのTODO支援機能（AiTodo機能）を定義するためのDiscussion Boardファイルです。
・Header行単位で本ファイルの記載整備をしてください。
・Header行に[要対応]とあるsectionが記載整備対象です。　次の同レベルHeader行までの範囲を記載整備してください。
・対象範囲のテキスト内に行頭に 指示> とあるのはAIへの指示ですので、指示に従って対応してください。
・範囲内のSubHeader行で[完了]とある場合は、そのSubHeaderの範囲内は記載変更しないでください。
・上記以外のHeader行は情報参照対象ですが、記載整備の対象外です。
・記載整備が完了したら[要対応]をyyyy/MM/dd [整備完了]に書き換えてください。

# 2026/07/20 [整備完了]
指示> AI Chatがあるパネルの名前を以下に記載してください

- **Thinktankパネル** — `ThinktankArea.tsx` が `AiChatView`（`src/components/ThinktankPanel/AiChatView.tsx`）を使用
- **Overviewパネル** — `OverviewArea.tsx` が同じ `AiChatView` を再利用
- **WorkoutSettingパネル** — `WorkoutSettingArea.tsx` が同じ `AiChatView` を「AI相談」として使用
- **Workout 各Pane（Thinkごとのメディアタブ）** — `WorkoutTabBar.tsx` の `chat` タイプ（表示名「AI相談」）から `media/ChatMedia.tsx` が起動。Think単位でAnthropic SSEストリーミングによる対話を行う
- **ReThinkパネル** — `ReThinkArea.tsx` 配下の `ReThinkChat.tsx` が独自のAIチャットUIを実装（Claude Codeスタイルの下部固定入力欄）

※ `AiChatView`（Thinktank/Overview/WorkoutSetting）と `ChatMedia`（Workout各Pane）と `ReThinkChat`（ReThink）は、いずれも `services/ChatApiService.ts` の `streamChat` を共通利用しているが、UIコンポーネントとしては3系統に分かれている。

# 本アプリのTODO支援機能の概要説明 =======================================================================================

# 追加実装すべき機能 ====================================================================================================

# 各パネルのAIChatへの指示プロンプト =====================================================================================
## Thinktankパネル


## Overviewパネル


## WorkoutSettingパネル


## Workout 各PaneのAIChat


## ReThinkパネル


# ========================================================================================================================



