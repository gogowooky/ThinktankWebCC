# Phase 09: メモ管理・全文検索

## 前提条件
- Phase 01〜08 が完了していること

> **重要: Firestore → BigQuery 読み替え**
> 本ファイルは refactor_plan1（Firestore前提）から引き継いだ内容です。
> 本プロジェクトでは **Phase 02 で BigQuery をデータストアとして構築済み** のため、
> 以下の読み替えを適用してください:
>
> | 本ファイルの記述 | 読み替え先 |
> |---|---|
> | `SyncWithFirestore` | `SyncWithBigQuery`（`/api/bq/files` を使用） |
> | `/api/memos` | `/api/bq/files?category=Memo` |
> | `Firestoreから削除` | BigQuery の `deleted: true` フラグ更新 |
> | `Firestoreの deleted: true` | BigQuery の `deleted` BOOL列 |
> | `Firestoreでは全文検索が困難` | BigQuery `CONTAINS_SUBSTR` で全文検索 |
> | `Algolia/Elasticsearch` | Phase 15 でベクトル検索を追加予定 |
> | `Firestore: /tt_events` | BigQuery `tt_events` テーブル（Phase 02 で作成済み） |
> | `Firestore APIは段27で実装済み` | BigQuery APIは Phase 02（段158〜169）で実装済み |
> | `メモ一覧がFirestoreから取得されて` | メモ一覧がBigQueryから取得されて |

## このフェーズの目標
メモのCRUD全体を安定させ、全文検索を改善する。カレンダーやキーワードタグ機能を整備する。

---

## 段111: メモ一覧のFirestore同期の完成

`src/models/TTMemos.ts` の `SyncWithFirestore` を完成させてください。

フロー:
1. `/api/memos`（一覧取得APIを呼ぶ、IDとタイトルと更新日のみ）
2. 既存のキャッシュと比較して追加・更新・削除
3. 変更があれば `NotifyUpdated()` を呼ぶ
4. 成功したらローカルストレージキャッシュも更新

**重要**: メモ本文（Content）は必要になるまで取得しません（遅延ロード）。

---

## 段112: メモ保存デバウンスの完成

メモ保存の1分デバウンスを完全に実装してください。

```typescript
// TTMemo.ts
private static _pendingSaves: Map<string, ReturnType<typeof setTimeout>> = new Map();

public scheduleSave(): void {
  const key = this.ID;
  if (TTMemo._pendingSaves.has(key)) {
    clearTimeout(TTMemo._pendingSaves.get(key)!);
  }
  const timer = setTimeout(async () => {
    await this.SaveContent();
    TTMemo._pendingSaves.delete(key);
  }, 60000); // 60秒
  TTMemo._pendingSaves.set(key, timer);
}
```

ブラウザが閉じられる前に `beforeunload` イベントで即時保存も実装してください。

---

## 段113: メモ削除 / 復元機能

以下のActionを実装してください。

```typescript
A('Application.Memo.Delete', 'メモを削除', async (ctx) => {
  // 選択中メモのIDを取得
  // 確認ダイアログを表示
  // Firestoreから削除
  // TTMemosから削除
  // 次のメモをEditorに表示
  return true;
});
```

削除は物理削除ではなく、Firestoreの `deleted: true` フラグで論理削除にしてください。

---

## 段114: 全文検索の改善

`server/src/routes/ttsearchRoutes.ts` の全文検索を改善してください。

改善内容:
- Firestoreでは全文検索が困難なため、**バックエンドサイドで `content` フィールドをインメモリでフィルタリング**
- 件数制限: 最大200件
- スニペット: 検索語の前後100文字を最大5つ抽出
- 検索語のハイライト（`<strong>` タグで太字）

> 注: 将来的にはFirestore の拡張検索（Algolia/Elasticsearch）への移行も検討してください。

---

## 段115: キーワードタグの管理

`[Panel].Editor.Keywords` の複数行キーワードを管理する仕組みを完成させてください。

- Keywords（複数行）の更新ルール:
  - 追加テキストがKeywords内に含まれる場合 → その行を最終行に移動
  - 含まれない場合 → 最終行に追加
  - Keyword（単一行）= Keywordsのカーソル行のテキスト
- フォーカスが外れたとき: 空白行・重複行を自動削除

---

## 段116: ImportAction (/ttsearch以外のインポート)

以下のActionを追加してください。

```typescript
A('Application.Memo.ImportFromText', 'テキストからメモ作成', async (ctx) => {
  // DroppedDataのtext または クリップボードのテキストを
  // 新規メモとして作成し、Editorに表示する
  return true;
});
```

---

## 段117: カレンダー表示用TTEventsコレクション

`src/models/TTEvents_.ts`（カレンダーイベント）を作成してください。

```typescript
export class TTEvents_ extends TTCollection {
  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Name,EventDate,Category';
    this.ListProperties = 'ID,EventDate,Name,Category';
    this.ColumnMapping = 'ID:ID,EventDate:日時,Name:タイトル,Category:カテゴリ';
    this.ColumnMaxWidth = 'ID:18,EventDate:18,Name:50,Category:15';
  }
  // Firestore: /tt_events を使用
}
```

イベントの作成・表示は TTMemo のパターンと同様。Firestore APIは段27で実装済み。

---

## 段118: Phase 09 動作確認チェックリスト

- [ ] メモ一覧がBigQueryから取得されてTableに表示されること
- [ ] メモ編集後1分で自動保存、ブラウザを閉じる前に即時保存が動作すること
- [ ] メモの論理削除が動作し、一覧から消えること
- [ ] 全文検索で複数のキーワードが含まれるメモが検索できること
- [ ] Keywords欄の追加・重複削除が正しく動作すること

---

**前フェーズ**: [Phase 08: UIイベント統合](./phase08_ui_events.md)
**次フェーズ**: [Phase 10: オフライン耐性](./phase10_offline.md)

---
---