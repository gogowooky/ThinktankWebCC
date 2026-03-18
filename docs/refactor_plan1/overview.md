# ThinktankWebCC 段階的開発指令書 — 総合概要・目次

## プロジェクト概要

本アプリケーション **ThinktankWebCC** は、個人用の知識管理・メモ管理WebアプリケーションをReact + TypeScript + Viteで構築し、Node.jsバックエンド経由でGoogle Cloud上のサービス（BigQuery / Google Drive / Gmail / Gemini AI）と連携するSPAです。

## アーキテクチャ方針

| 層 | 技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite、Monaco Editor |
| バックエンド | Node.js + Express (TypeScript)、Cloud Run |
| データストア | **BigQuery**（`thinktank` データセット）を主体に使用。Firestoreは編集設定など高頻度更新用として補助的に使用可 |
| AIチャット | Google Gemini API（Memoとは別で管理: TTChats/TTChatコレクション） |
| ファイルストレージ | Google Drive (yyyy-mm-ddフォルダ) |
| メール連携 | Gmail API（指定タイトルフィルタ） |

> **【重要】本プロジェクトのデータストアはBigQueryを使用しています。**  
> Phase02（Firestore版）の段21〜35を実施する場合でも、その後必ずPhase14（BigQuery移行）を適用してください。  
> Phase01完了後にPhase14 → Phase03以降の順で進めるのが推奨フローです。

## 開発原則

1. **段階的動作確認**: 各フェーズ完了時点でブラウザから動作確認できる中間製品を作る
2. **BigQuery主体**: TTCollectionごとのテーブルをBigQueryに作成（データセット: `thinktank`）
3. **TTCollectionごとに独立テーブル**: tt_memos / tt_chats / tt_events / tt_editings 等を独立管理
4. **AIチャット分離**: TTChats（`tt_chats`テーブル）をTTMemosとは別に管理
5. **スマートフォン対応**: タッチイベント・レスポンシブ対応を各フェーズで考慮
6. **Google Driveファイル格納**: D&Dファイルはyyyy-mm-ddフォルダへ自動格納

## フェーズ一覧（全14フェーズ）

| フェーズ | ファイル | 内容 | 段番号 |
|---|---|---|---|
| Phase 01 | [phase01_foundation.md](./phase01_foundation.md) | プロジェクト基盤・環境構築 | 段01〜20 |
| Phase 02 | [phase02_backend.md](./phase02_backend.md) | バックエンドAPI・Firestore設計（→Phase14で代替） | 段21〜35 |
| Phase 03 | [phase03_ui_framework.md](./phase03_ui_framework.md) | コアUIフレームワーク | 段36〜56 |
| Phase 04 | [phase04_editor.md](./phase04_editor.md) | Editorパネル | 段57〜75 |
| Phase 05 | [phase05_table.md](./phase05_table.md) | Tableパネル | 段76〜89 |
| Phase 06 | [phase06_webview.md](./phase06_webview.md) | WebViewパネル | 段90〜98 |
| Phase 07 | [phase07_event_action.md](./phase07_event_action.md) | イベント・アクションシステム統合 | 段99〜110 |
| Phase 07B | [phase07b_ui_events.md](./phase07b_ui_events.md) | PanelTitle・StatusBar UIイベント統合 | 段170〜177 |
| Phase 08+09 | [phase08_09_memo_ai.md](./phase08_09_memo_ai.md) | メモ管理・全文検索 + AIチャット機能 | 段111〜126 |
| Phase 10〜13 | [phase10_13_gdrive_gmail_mobile_deploy.md](./phase10_13_gdrive_gmail_mobile_deploy.md) | GDrive連携・Gmail連携・モバイル対応・デプロイ | 段127〜157 |
| Phase 14 | [phase14_bigquery.md](./phase14_bigquery.md) | BigQuery移行（Phase02の代替・本プロジェクト推奨） | 段158〜169 |

> **段番号について**: Phase07Bの段170〜177はPhase07の拡張として後から追加されたため、番号が飛んでいます。実施順序は Phase07 → Phase07B → Phase08+09 の順です。

## TTModels 最終プロパティ一覧（完成形）

Phase03〜11で順次追加されるプロパティの**最終的な完成形**は以下のとおりです。  
別AIセッションで途中フェーズから開始する場合はこの一覧を参照してください。

```typescript
export class TTModels extends TTCollection {
  public Status: TTStatus;        // Phase03 段36でコア実装
  public Actions: TTActions;      // Phase03 段37
  public Events: TTEvents;        // Phase03 段38
  public Requests: TTRequests;    // Phase03 段39
  public Memos: TTMemos;          // Phase04 段59
  public Editings: TTEditings;    // Phase04 段69
  public Chats: TTChats;          // Phase09 段120（AIチャット専用、Memosとは独立）
  public Events_: TTEvents_;      // Phase08 段117（カレンダーイベント専用）
  public GMails: TTGMails;        // Phase11 段136
}
```

> **注**: `TTStatus.RegisterState` に `[Panels]` を含むキーを渡すと、  
> `Library`, `Index`, `Shelf`, `Desk`, `System`, `Chat`, `Log` の7パネル分に自動展開されます。  
> 例: `[Panels].Editor.Resource` → `Library.Editor.Resource`, `Index.Editor.Resource`, ... と展開されます。

## 各フェーズ指令書の利用方法

1. 各フェーズのmdファイルをAIに渡し、**段（ステップ）番号順**に依頼する
2. 各段の最後に「動作確認項目」を設けているので、実際にブラウザで確認してから次段へ進む
3. 機能拡張を追加したい場合は、該当フェーズの段の**末尾に追記**して指令する
4. 各フェーズのファイルを別AIセッションで使い回す際は冒頭の「前提条件」セクションを確認する
5. **BigQuery版で構築する場合**: Phase01 → Phase14（段158〜169）→ Phase03以降の順で進める


