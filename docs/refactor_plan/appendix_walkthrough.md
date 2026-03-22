# ThinktankWebCC 段階的開発指令書群 — 完成ウォークスルー

## 作成したもの

既存のThinktankWebCCアプリを**ゼロから段階的に再構築**するための指令書群を作成しました。
合計 **13フェーズ・157段** に分割しており、各段が1つのAI依頼単位になっています。

## 作成ファイル一覧

| ファイル | フェーズ | 段数 | 内容 |
|---|---|---|---|
| [overview.md](./overview.md) | なし | なし | 全体目次・アーキテクチャ方針 |
| [phase01_foundation.md](./phase01_foundation.md) | Phase 01 | 段01〜20 | プロジェクト基盤・環境構築 |
| [phase02_backend.md](./phase02_backend.md) | Phase 02 | 段21〜35 | バックエンドAPI・Firestore設計 |
| [phase03_ui_framework.md](./phase03_ui_framework.md) | Phase 03 | 段36〜56 | コアUIフレームワーク |
| [phase04_editor.md](./phase04_editor.md) | Phase 04 | 段57〜75 | Editorパネル |
| [phase05_table.md](./phase05_table.md) | Phase 05 | 段76〜89 | Tableパネル |
| [phase06_webview.md](./phase06_webview.md) | Phase 06 | 段90〜98 | WebViewパネル |
| [phase07_event_action.md](./phase07_event_action.md) | Phase 07 | 段99〜110 | イベント・アクションシステム |
| [phase08_09_memo_ai.md](./phase08_09_memo_ai.md) | Phase 08〜09 | 段111〜126 | メモ管理 + AIチャット |
| [phase10_13_gdrive_gmail_mobile_deploy.md](./phase10_13_gdrive_gmail_mobile_deploy.md) | Phase 10〜13 | 段127〜157 | GDrive・Gmail・モバイル・デプロイ |

## 主要な設計方針（ご要望を反映）

| ご要望 | 対応内容 |
|---|---|
| BigQuery既存テーブルは使用しない | Firestore（TTCollection毎に独立コレクション）を採用 |
| AIチャットをMemoとは別で管理 | TTChats/TTChatコレクション（/tt_chats）として独立管理（段119〜126） |
| データはTTCollection毎に分ける | /tt_memos /tt_chats /tt_events /tt_editings などに分離（段21） |
| D&DファイルをGDriveのyyyy-mm-ddフォルダに格納 | 段129にて実装指令 |
| 規定タイトルのGmailを読み取り管理 | 段133〜138にて GMAIL_FILTER_SUBJECT による絞り込み実装 |
| スマートフォンUIへの対応 | Phase12（段140〜147）でレスポンシブ・タッチ対応・PWA対応 |

## 使い方

1. overview.md を最初に読んで全体像を把握する
2. 各フェーズのmdファイルをAIに渡して、段番号順に1段ずつ依頼する
3. 各段末尾の「動作確認項目」をブラウザで確認する
4. 機能追加したい場合は、該当段の末尾に追記して再度AIに依頼する
