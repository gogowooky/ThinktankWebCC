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

## フェーズ一覧（全13フェーズ、約250段）

| フェーズ | ファイル | 内容 | 段数目安 |
|---|---|---|---|
| Phase 01 | phase01_foundation.md | プロジェクト基盤・環境構築 | 〜20段 |
| Phase 02 | phase02_backend.md | バックエンドAPI・Firestore設計 | 〜30段 |
| Phase 03 | phase03_ui_framework.md | コアUIフレームワーク | 〜30段 |
| Phase 04 | phase04_editor.md | Editorパネル | 〜25段 |
| Phase 05 | phase05_table.md | Tableパネル | 〜20段 |
| Phase 06 | phase06_webview.md | WebViewパネル | 〜15段 |
| Phase 07 | phase07_event_action.md | イベント・アクションシステム | 〜25段 |
| Phase 08 | phase08_memo_search.md | メモ管理・全文検索 | 〜20段 |
| Phase 09 | phase09_ai_chat.md | AIチャット機能 | 〜20段 |
| Phase 10 | phase10_gdrive.md | Google Drive連携 | 〜15段 |
| Phase 11 | phase11_gmail.md | Gmail連携 | 〜15段 |
| Phase 12 | phase12_mobile.md | スマートフォン対応 | 〜15段 |
| Phase 13 | phase13_deploy.md | デプロイ・仕上げ | 〜10段 |

## 各フェーズ指令書の利用方法

1. 各フェーズのmdファイルをAIに渡し、**段（ステップ）番号順**に依頼する
2. 各段の最後に「動作確認項目」を設けているので、実際にブラウザで確認してから次段へ進む
3. 機能拡張を追加したい場合は、該当フェーズの段の**末尾に追記**して指令する
4. 各フェーズのファイルを別AIセッションで使い回す際は冒頭の「前提条件」セクションを確認する
