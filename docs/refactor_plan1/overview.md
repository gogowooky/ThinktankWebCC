# ThinktankWebCC 段階的開発指令書 — 総合概要・目次

## プロジェクト概要

本アプリケーション **ThinktankWebCC** は、個人用の知識管理・メモ管理WebアプリケーションをReact + TypeScript + Viteで構築し、Node.jsバックエンド経由でGoogle Cloud上のサービス（Firestore / Google Drive / Gmail / Gemini AI）と連携するSPAです。

## アーキテクチャ方針

| 層 | 技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite、Monaco Editor |
| バックエンド | Node.js + Express (TypeScript)、Cloud Run |
| データストア | **TTCollection毎に独立したFirestoreコレクション**（BigQuery既存テーブルは使用しない） |
| AIチャット | Google Gemini API（Memoとは別で管理: TTChats/TTChatコレクション） |
| ファイルストレージ | Google Drive (yyyy-mm-ddフォルダ) |
| メール連携 | Gmail API（指定タイトルフィルタ） |

## 開発原則

1. **段階的動作確認**: 各フェーズ完了時点でブラウザから動作確認できる中間製品を作る
2. **BigQuery既存テーブル不使用**: 新規にFirestoreを使用
3. **TTCollectionごとに独立DB**: Memos/Chats/Events/Editings/Status等を個別コレクションで管理
4. **AIチャット分離**: TTChats/TTChatコレクション（TTMemosとは別）で管理
5. **スマートフォン対応**: タッチイベント・レスポンシブ対応を各フェーズで考慮
6. **Google Driveファイル格納**: D&Dファイルはyyyy-mm-ddフォルダへ自動格納

## フェーズ一覧（全14フェーズ）

| フェーズ | ファイル | 内容 | 段番号 |
|---|---|---|---|
| Phase 01 | [phase01_foundation.md](./phase01_foundation.md) | プロジェクト基盤・環境構築 | 段01〜20 |
| Phase 02 | [phase02_backend.md](./phase02_backend.md) | バックエンドAPI・Firestore設計 | 段21〜35 |
| Phase 03 | [phase03_ui_framework.md](./phase03_ui_framework.md) | コアUIフレームワーク | 段36〜56 |
| Phase 04 | [phase04_editor.md](./phase04_editor.md) | Editorパネル | 段57〜75 |
| Phase 05 | [phase05_table.md](./phase05_table.md) | Tableパネル | 段76〜89 |
| Phase 06 | [phase06_webview.md](./phase06_webview.md) | WebViewパネル | 段90〜98 |
| Phase 07 | [phase07_event_action.md](./phase07_event_action.md) | イベント・アクションシステム統合 | 段99〜110 |
| Phase 07B | [phase07b_ui_events.md](./phase07b_ui_events.md) | PanelTitle・StatusBar UIイベント統合 | 段170〜177 |
| Phase 08+09 | [phase08_09_memo_ai.md](./phase08_09_memo_ai.md) | メモ管理・全文検索 + AIチャット機能 | 段111〜126 |
| Phase 10〜13 | [phase10_13_gdrive_gmail_mobile_deploy.md](./phase10_13_gdrive_gmail_mobile_deploy.md) | GDrive連携・Gmail連携・モバイル対応・デプロイ | 段127〜157 |
| Phase 14 | [phase14_bigquery.md](./phase14_bigquery.md) | BigQuery移行（Firestoreからの代替オプション） | 段158〜169 |

> **段番号について**: Phase07Bの段170〜177はPhase07の拡張として後から追加されたため、番号が飛んでいます。実施順序は Phase07 → Phase07B → Phase08+09 の順です。

## 各フェーズ指令書の利用方法

1. 各フェーズのmdファイルをAIに渡し、**段（ステップ）番号順**に依頼する
2. 各段の最後に「動作確認項目」を設けているので、実際にブラウザで確認してから次段へ進む
3. 機能拡張を追加したい場合は、該当フェーズの段の**末尾に追記**して指令する
4. 各フェーズのファイルを別AIセッションで使い回す際は冒頭の「前提条件」セクションを確認する

