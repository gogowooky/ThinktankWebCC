# TT Stand 段階的開発指令書 — 総合概要（最終版）

## プロジェクトビジョン

**TT Stand** は、個人の記憶力・判断力をサポート＆活性化する知識ベースアプリケーションである。
過去の自分のメモ（テキスト、ファイル、写真、音声、動画、URL等）をLifeLog的に蓄積し、
AI Facilitatorが能動的に記憶の想起・パターン発見・思考の深化を促すことで、
「知識ベースの活用・蓄積アクティビティの刺激」を実現する。

## アーキテクチャ

| 層 | 技術 | 備考 |
|---|---|---|
| フロントエンド | React + TypeScript + Vite、Monaco Editor | 既存 |
| バックエンド | Node.js + Express (TypeScript)、Cloud Run | 既存 |
| データストア（主） | **BigQuery**（`thinktank` データセット） | 正本 (single source of truth) |
| データストア（ローカル） | **IndexedDB**（キャッシュ＋オフライン保管庫） | BQ失敗/オフライン時のフォールバック |
| ベクトル検索 | pgvector / Qdrant / BigQuery VECTOR_SEARCH | Phase 15 で導入 |
| AI | Gemini API / Claude API | チャット＋Facilitator |
| AI Embedding | text-embedding-3-small 等 | Phase 15 で導入 |
| ファイル | Google Drive (yyyy-mm-ddフォルダ) | メディアストレージ |
| メール | Gmail API | 指定タイトルフィルタ |
| 音声 | Web Speech API + Whisper API | Phase 21 で導入 |

## 開発原則

1. **段階的動作確認**: 各フェーズ完了時にブラウザで動作確認できる中間製品を作る
2. **BQ正本 + オフライン耐性**: BQをsingle source of truthとして維持。IndexedDBはキャッシュ＋SyncQueueでオフライン時の動作を保証。IsDirty/SyncQueue保護により編集中データは絶対に消さない
3. **TTCollectionごとに独立テーブル**: tt_memos / tt_chats / tt_entries 等
4. **統一エントリーモデル**: テキスト・画像・音声・動画・URLを同一スキーマで管理
5. **AIチャットとFacilitatorの分離**: TTChats（対話）とTTSuggestions（能動的提案）は独立
6. **マルチデバイス**: PC（フル機能）、モバイル（キャプチャ＋閲覧）、Watch（クイック入力）

---

## 全22フェーズ一覧（実施順序＝Phase番号）

> ★ = refactor_plan1から変更・拡張、☆ = TT Stand新規フェーズ
> 旧番号 = refactor_plan1でのPhase番号（既存コードやコメントとの対応用）

### 第I部: 基盤構築（Phase 01〜08）

| Phase | ファイル | 内容 | 段番号 | 旧番号 |
|---|---|---|---|---|
| **01** | [phase01_foundation.md](./phase01_foundation.md) | プロジェクト基盤・環境構築 | 段001〜020 | 旧01 |
| **02** ★ | [phase02_bigquery.md](./phase02_bigquery.md) | BigQuery データ基盤（拡張テーブル含む） | 段158〜169 | 旧14 |
| **03** | [phase03_ui_framework.md](./phase03_ui_framework.md) | コアUIフレームワーク | 段036〜056 | 旧03 |
| **04** | [phase04_editor.md](./phase04_editor.md) | Editorパネル | 段057〜075 | 旧04 |
| **05** | [phase05_table.md](./phase05_table.md) | Tableパネル | 段076〜089 | 旧05 |
| **06** | [phase06_webview.md](./phase06_webview.md) | WebViewパネル | 段090〜098 | 旧06 |
| **07** | [phase07_event_action.md](./phase07_event_action.md) | イベント・アクションシステム統合 | 段099〜110 | 旧07 |
| **08** | [phase08_ui_events.md](./phase08_ui_events.md) | PanelTitle・StatusBar UIイベント統合 | 段170〜177 | 旧07B |

### 第II部: データ基盤強化（Phase 09〜10）

| Phase | ファイル | 内容 | 段番号 | 旧番号 |
|---|---|---|---|---|
| **09** | [phase09_memo_search.md](./phase09_memo_search.md) | メモ管理・全文検索 | 段111〜118 | 旧08 |
| **10** ☆ | [phase10_offline.md](./phase10_offline.md) | オフライン耐性（BQ正本 + SyncQueue） | 段200〜214 | 新規 |

### 第III部: AI基盤（Phase 11〜12）

| Phase | ファイル | 内容 | 段番号 | 旧番号 |
|---|---|---|---|---|
| **11** ★ | [phase11_ai_chat_context.md](./phase11_ai_chat_context.md) | AIチャット + コンテキストソース + 対話トリガー | 段119〜126 | 旧09 |
| **12** ☆ | [phase12_ai_facilitator_v1.md](./phase12_ai_facilitator_v1.md) | AI Facilitator v1（リコール・自動タグ・リマインダー） | 段260〜278 | 新規 |

> **Phase 12 完了 = マイルストーン M3: TT Stand のコア体験成立**

### 第IV部: LifeLog化 + 知的検索（Phase 13〜16）

| Phase | ファイル | 内容 | 段番号 | 旧番号 |
|---|---|---|---|---|
| **13** ☆ | [phase13_unified_entry.md](./phase13_unified_entry.md) | 統一エントリーモデル・メディア取り込み | 段220〜238 | 新規 |
| **14** ★ | [phase14_gdrive.md](./phase14_gdrive.md) | Google Drive連携（メディアストレージ） | 段127〜132 | 旧10 |
| **15** ☆ | [phase15_vector_search.md](./phase15_vector_search.md) | ベクトル検索・セマンティックサーチ | 段240〜254 | 新規 |
| **16** ☆ | [phase16_rich_output.md](./phase16_rich_output.md) | 出力モード拡張（Timeline・Graph・TTS） | 段280〜298 | 新規 |

### 第V部: 外部連携 + デプロイ（Phase 17〜19）

| Phase | ファイル | 内容 | 段番号 | 旧番号 |
|---|---|---|---|---|
| **17** | [phase17_gmail.md](./phase17_gmail.md) | Gmail連携 | 段133〜139 | 旧11 |
| **18** ★ | [phase18_mobile.md](./phase18_mobile.md) | スマートフォン・タブレット対応 | 段140〜147 | 旧12 |
| **19** | [phase19_deploy.md](./phase19_deploy.md) | デプロイ・仕上げ | 段148〜157 | 旧13 |

### 第VI部: 高度AI + クロスプラットフォーム（Phase 20〜22）

| Phase | ファイル | 内容 | 段番号 | 旧番号 |
|---|---|---|---|---|
| **20** ☆ | [phase20_ai_facilitator_v2.md](./phase20_ai_facilitator_v2.md) | AI Facilitator v2（パターン・ダイジェスト・ソクラテス） | 段300〜318 | 新規 |
| **21** ☆ | [phase21_quick_capture.md](./phase21_quick_capture.md) | クイックキャプチャ（ブラウザ拡張・音声入力） | 段320〜336 | 新規 |
| **22** ☆ | [phase22_cross_platform.md](./phase22_cross_platform.md) | クロスプラットフォーム（ネイティブモバイル・Watch） | 段340〜358 | 新規 |

### 補足資料

| ファイル | 内容 |
|---|---|
| [appendix_ai_context_triggers.md](./appendix_ai_context_triggers.md) | AIコンテキストソースと対話トリガーの詳細設計（Phase 11, 12 の補足） |
| [appendix_phase10_implementation.md](./appendix_phase10_implementation.md) | Phase 10 実装ガイド — 現行コードのギャップ分析と具体的変更箇所 |
| [appendix_plan1_modifications.md](./appendix_plan1_modifications.md) | refactor_plan1 既存フェーズへの変更点まとめ |

---

## 旧Phase番号との対応表

| 新Phase | 旧Phase | 段番号 | 備考 |
|---|---|---|---|
| 01 | 01 | 001〜020 | 変更なし |
| 02 | 14 | 158〜169 | BigQueryを先行実施。拡張テーブル追加 |
| 03 | 03 | 036〜056 | 変更なし |
| 04 | 04 | 057〜075 | 変更なし |
| 05 | 05 | 076〜089 | 変更なし |
| 06 | 06 | 090〜098 | 変更なし |
| 07 | 07 | 099〜110 | 変更なし |
| 08 | 07B | 170〜177 | 変更なし |
| 09 | 08 | 111〜118 | 変更なし |
| 10 | — | 200〜214 | ☆新規: オフライン耐性 |
| 11 | 09 | 119〜126 | ★拡張: Claude API + コンテキスト + トリガー |
| 12 | — | 260〜278 | ☆新規: AI Facilitator v1 + リマインダー |
| 13 | — | 220〜238 | ☆新規: 統一エントリー |
| 14 | 10 | 127〜132 | ★拡張: メディアストレージ強化 |
| 15 | — | 240〜254 | ☆新規: ベクトル検索 |
| 16 | — | 280〜298 | ☆新規: 出力モード拡張 |
| 17 | 11 | 133〜139 | 変更なし |
| 18 | 12 | 140〜147 | ★拡張: PWA Share Target |
| 19 | 13 | 148〜157 | 変更なし |
| 20 | — | 300〜318 | ☆新規: AI Facilitator v2 |
| 21 | — | 320〜336 | ☆新規: クイックキャプチャ |
| 22 | — | 340〜358 | ☆新規: クロスプラットフォーム |

> **段番号について**: refactor_plan1 の既存段番号はコード内コメントとの互換性のため維持しています。
> 新規フェーズは200番台以降を使用し、番号に余裕を持たせて中間挿入可能です。

---

## マイルストーン

| # | Phase完了 | 到達する体験 |
|---|---|---|
| **M1** | Phase 09 | メモの読み書き・検索がBigQuery+ローカルキャッシュで動作 |
| **M2** | Phase 10 | ネット切断時もメモの閲覧・編集可能。未保存変更は復帰時に自動同期 |
| **M3** | **Phase 12** | **TT Stand誕生: AIが過去メモを能動的に提示し、自動タグ付け・リマインダーが動作** |
| **M4** | Phase 14 | LifeLog化: テキスト以外（画像・音声・URL等）も統一的に蓄積可能 |
| **M5** | Phase 15 | 知的検索: 「あの時考えたこと」のような曖昧な検索が可能 |
| **M6** | Phase 16 | 豊かな出力: Timeline・Graph・TTS等のマルチモーダル出力 |
| **M7** | Phase 19 | 本番稼働: Cloud Runにデプロイ、モバイル対応 |
| **M8** | Phase 20 | 知的パートナー: パターン検出・週次ダイジェスト・ソクラテス式問いかけ |
| **M9** | Phase 22 | どこでもキャプチャ: ブラウザ拡張・音声入力・Apple Watch対応 |

---

## TTModels 最終プロパティ一覧

```typescript
export class TTModels extends TTCollection {
  // --- Phase 03〜07 (基盤) ---
  public Status: TTStatus;
  public Actions: TTActions;
  public Events: TTEvents;
  public Requests: TTRequests;
  public Editings: TTEditings;

  // --- Phase 09 (メモ管理) ---
  public Memos: TTMemos;

  // --- Phase 11 (AIチャット) ---
  public Chats: TTChats;
  public AIContext: TTAIContext;       // AIコンテキストソース設定

  // --- Phase 12 (AI Facilitator v1) ---
  public Suggestions: TTSuggestions;  // AIからの提案・リコール
  public Reminders: TTReminders;      // リマインダー

  // --- Phase 13 (統一エントリー) ---
  public Entries: TTEntries;          // テキスト以外を含む統一エントリー

  // --- Phase 15 (ベクトル検索) ---
  public Embeddings: TTEmbeddings;    // Embeddingインデックス管理

  // --- Phase 17 (Gmail) ---
  public GMails: TTGMails;

  // --- Phase 20 (AI Facilitator v2) ---
  public Digests: TTDigests;          // 週次・月次ダイジェスト
}
```

## BigQuery テーブル一覧

```
thinktank (データセット)
├── files           ← 既存（後方互換のため残す）
├── tt_memos        ← Phase 02
├── tt_chats        ← Phase 02
├── tt_events       ← Phase 02
├── tt_editings     ← Phase 02
├── tt_gmails       ← Phase 02
├── tt_ai_context   ← Phase 11 (AIコンテキストソース設定)
├── tt_suggestions  ← Phase 12 (AI提案履歴)
├── tt_reminders    ← Phase 12 (リマインダー)
├── tt_entries      ← Phase 13 (統一エントリー)
├── tt_embeddings   ← Phase 15 (Embeddingメタデータ)
└── tt_digests      ← Phase 20 (ダイジェスト)
```

## ストレージ優先順位（Phase 10 以降）

```
読み取り:  BigQuery (正本) → IndexedDB (キャッシュ / オフラインフォールバック)
書き込み:  BigQuery (正本) → 失敗時: IndexedDB + SyncQueue → オンライン復帰時flush
検索:      BigQuery CONTAINS_SUBSTR (オンライン) / IndexedDBローカル検索 (オフライン)
メディア:  Cache API (サムネイル) / Google Drive (原本、オンライン)
保護:      SyncQueueにあるメモ + IsDirtyなメモ → BQ同期で上書きしない
```

## AI対話アーキテクチャ

### コンテキストソース（Phase 11 で導入）
- 現在のメモ（既定で有効）
- Google Driveの指定フォルダ（文書群をテキスト化してプロンプトに注入）
- NotebookLMノートブック（ソース文書のDrive ID参照 or エクスポート取り込み）
- 関連メモ群（ベクトル検索で類似メモ、Phase 15以降）
- タグ指定メモ群

### 対話トリガー（Phase 12 で導入）
| トリガー | 起動者 | 例 |
|---|---|---|
| リマインダー | ユーザー設定 | 「3日後にStomagen進捗確認」、メモ内 [Remind:yyyy-mm-dd] タグ |
| アラート/お知らせ | AI Facilitator | 「1年前のメモ」「パターン検出」「週次ダイジェスト」 |
| ユーザー質問 | 直接入力 | テキスト入力、音声入力（Alt+V）、コンテキスト付き（Alt+A） |

すべてのトリガーは Chatパネル のNotification Centerに集約され、チャットに遷移する。

---

## 各フェーズ指令書の利用方法

1. 各フェーズのmdファイルをAIに渡し、**段（ステップ）番号順**に依頼する
2. 各段の最後に「動作確認項目」を設けているので、ブラウザで確認してから次段へ進む
3. 機能拡張を追加したい場合は、該当フェーズの段の末尾に追記して指令する
4. 別AIセッションで使い回す際は冒頭の「前提条件」セクションを確認する
5. **Phase 11, 12 の実装時は `appendix_ai_context_triggers.md` も併せてAIに渡す**
6. **Phase 10 の実装時は `appendix_phase10_implementation.md` も併せてAIに渡す**（現行コードの具体的変更箇所を記載）
7. **Phase 09 は Firestore 前提の記述が残っています**。冒頭の読み替え表に従い BigQuery API に置き換えて実装してください

## 既存コードベースからの開始ガイド

現在の ThinktankWebCC（TTWebCC-260303 ブランチ）は、Phase 01〜09 の大部分が既に実装済みです（約14,700行のTypeScript）。ゼロから全Phaseを実施する必要はありません。

### 実装済みの機能（差分確認のみ）

| Phase | 実装状況 | 対応が必要な差分 |
|---|---|---|
| 01 (基盤) | ✅ 完了 | なし |
| 02 (BigQuery) | ✅ 完了 | tt_entries, tt_embeddings 等の**拡張テーブル追加のみ** |
| 03 (UIフレームワーク) | ✅ 完了 | なし |
| 04 (Editor) | ✅ 完了 | なし |
| 05 (Table) | ✅ 完了 | なし |
| 06 (WebView) | ✅ 完了 | なし |
| 07 (Event/Action) | ✅ 完了 | なし |
| 08 (UIイベント) | ✅ 完了 | なし |
| 09 (メモ管理) | ✅ 大部分完了 | SyncWithBigQuery, 全文検索は動作済み。キーワードタグ・カレンダーの差分確認 |

### 推奨開始手順

既存コードベースからTT Standを構築する場合:

1. **Phase 02 の差分実施**（1〜2日）: 拡張テーブル（tt_entries, tt_suggestions, tt_reminders, tt_ai_context, tt_embeddings, tt_digests）をBigQueryに追加
2. **Phase 09 の差分確認**（1日）: 段111〜118で未実装の項目がないか確認
3. **Phase 10 から本格実装を開始**: `appendix_phase10_implementation.md` に現行コードの具体的な変更箇所を記載済み

この手順なら **Phase 12（M3: TT Stand誕生）到達まで約5〜7週** に短縮できます。

```
既存コード差分確認 (3〜5日)
  ↓
Phase 10: オフライン耐性 (5〜7日)
  ↓
Phase 11: AIチャット+コンテキスト (7〜10日)
  ↓
Phase 12: AI Facilitator v1 (7〜10日)
  ↓
★ M3: TT Stand 誕生
```
