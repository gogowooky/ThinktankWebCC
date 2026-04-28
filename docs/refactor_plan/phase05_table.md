# Phase 05: Tableパネル

## 前提条件
- Phase 01〜04 が完了していること

## このフェーズの目標
TTCollectionの一覧をテーブル表示するTableパネルを実装する。TTMemosのメモ一覧を表示し、アイテムを選択してEditorで開けるようにする。

---

## 段76: TableViewコンポーネントの作成

`src/components/TableView.tsx` を作成してください。

```typescript
interface TableViewProps {
  collection: TTCollection;
  currentId?: string;
  onSelect: (id: string) => void;
  onInvoke: (id: string) => void;
  sortProperty: string;
  sortDir: 'Asc' | 'Desc';
  onSortChange: (prop: string, dir: 'Asc' | 'Desc') => void;
}
```

表示仕様:
- `ListProperties` で定義されたプロパティをカラムとして表示
- `ColumnMapping` でカラム表示名を変換
- `ColumnMaxWidth` でカラム最大幅を制限（左寄せ）
- 行境界線なし、行の高さ24px
- 奇数行と偶数行で背景色を交互に変更
- 選択行は強調色で表示
- カラムタイトルクリックでソート（昇順・降順）
- カラム幅はマウスドラッグで変更可能

---

## 段77: TTPanelTableBehaviorの実装

`src/Views/TTPanelTableBehavior.ts` を作成してください。

```typescript
export class TTPanelTableBehavior implements IPanelModeBehavior {
  readonly ModeName: PanelMode = 'Table';

  // 表示するコレクションの設定
  SetResource(collectionId: string): void

  // カーソル位置の移動
  SetCursorPos(value: string): void  // 'next/prev/first/last/+N/-N'
  GetCurrentId(): string

  // ソートの設定
  SetSortProperty(prop: string, dir: 'Asc' | 'Desc'): void

  // フィルター
  SetFilter(keyword: string): void

  HandleKeyDown(context: ActionContext): boolean
  HandleMouseDown(context: ActionContext): boolean
  HandleTouchEvent(context: ActionContext): boolean
}
```

---

## 段78: Table カーソル操作Actionの追加

DefaultActions.tsにTableカーソル操作Actionを追加してください。

```typescript
A('Table.Cursor.Next',    '次行へ', ...)
A('Table.Cursor.Prev',    '前行へ', ...)
A('Table.Cursor.First',   '先頭行へ', ...)
A('Table.Cursor.Last',    '最終行へ', ...)
A('Table.Cursor.Next10',  '10件次へ', ...)
A('Table.Cursor.Prev10',  '10件前へ', ...)
A('Table.Style.AdjustColumnWidth', 'カラム幅自動調整', ...)
```

---

## 段79: Tableデフォルトイベントの追加

DefaultEvents.ts のTable関連イベントを追加してください。

```typescript
E('*-Table-*-*', '',        'UP',     '[Panel].Table.CurPos:prev');
E('*-Table-*-*', '',        'DOWN',   '[Panel].Table.CurPos:next');
E('*-Table-*-*', '',        'HOME',   '[Panel].Table.CurPos:first');
E('*-Table-*-*', '',        'END',    '[Panel].Table.CurPos:last');
E('*-Table-*-*', '',        'LEFT2',  'Request.Table.InvokeDefault');
E('*-Table-*-*', '',        'RIGHT1', 'Request.Table.ContextMenu');
E('*-Table-*-*', '',        'ENTER',  'Request.Table.InvokeDefault');
```

---

## 段80: Request.Table.InvokeDefault Actionの実装

`src/Controllers/Actions/TableRequestActions.ts` を作成してください。

```typescript
A('Request.Table.InvokeDefault', 'テーブルアイテムを開く', async (ctx) => {
  // アクティブなTableパネルの選択アイテムを取得
  // アイテムのクラス（TTMemo/TTChat等）に応じて適切なActionを起動
  // TTMemo → Request.Memo.Open
  // TTCollection → Request.TTModel.Open（コレクション一覧を別パネルのTableに表示）
  return true;
});

A('Request.Memo.Open', 'メモを開く', async (ctx) => {
  // ExPanelが指定されている場合はExPanelの選択IDを取得
  // ActivePanelのEditorでメモを開く
  return true;
});
```

---

## 段81: パネル間連携（ExPanel）

TTApplicationにExPanel管理を実装してください。

```typescript
// ExModeが 'ExPanel:Shelf' の形式でExPanelを指定する
// TTApplication.ExPanelプロパティ: ExModeからパネル名を解決して返す
get ExFdPanel(): TTPanel {
  if (this.exMode.startsWith('ExPanel:')) {
    const name = this.exMode.replace('ExPanel:', '') as PanelName;
    return this._panels.get(name)!;
  }
  return this.ActivePanel;
}
```

DefaultEvents.ts に ExPanel設定イベントを追加:
```typescript
E('*-*-*-*', 'Alt', 'E', 'Application.ExMode:ExPanel:[Panel]');
```

---

## 段82: テーブルタイトルクリック処理

Tableパネルのカラムタイトルクリックで `UIRequestTriggeredAction` を呼び出すようにしてください。

```typescript
// ModelBrowser.tsxまたはTableView.tsxにて
onColumnTitleClick = (propName: string) => {
  const context: ActionContext = {
    Sender: `${panelName}-Table-Main`,
    Key: 'LEFT1',             // タイトルクリック
    RequestID: 'TableTitle',
    RequestTag: `[${panelName}:TableTitle]`,
    // ソートプロパティ情報も含める
  };
  app.UIRequestTriggeredAction(context);
}
```

---

## 段83: ソートActionの追加

```typescript
A('Table.SortCol.1.Asc', 'カラム1昇順', ...)
// ... Table.SortCol.(1-5).(Asc/Desc/Rev) を追加
A('Table.SortProp.1.Asc', 'プロパティ1昇順', ...)
// ... Table.SortProp.(1-5).(Asc/Desc/Rev) を追加
```

---

## 段84: 初期パネル設定の実装

DefaultStatus.ts に初期パネル設定を追加してください。

```
Libraryパネル: Table, Thinktank
Indexパネル:   Table, Memos
Shelfパネル:   Table, Memos
Deskパネル:    Editor, Thinktank
Systemパネル:  Editor, Thinktank
Chatパネル:    Table, Chats
Logパネル:     Table, Status
```

初期起動時のみ上記設定を使い、以降はローカルストレージの前回値を使います。

---

## 段85: コマンドパレット風UIの実装

`src/components/CommandPalette.tsx` を作成してください。

```typescript
interface CommandPaletteProps {
  isOpen: boolean;
  suggestions: { id: string; label: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
  position: { x: number; y: number };
}
```

- テキスト入力で候補を絞り込み
- 矢印キーで候補を選択
- EnterまたはクリックでAction実行
- ESCで閉じる
- 画面外に出ないよう位置を自動調整
- フォーカスがはずれたら閉じる
- イベント発生位置（Caret位置またはマウス位置）に表示

---

## 段86: コンテキストメニューの実装

`Request.Table.ContextMenu` を実装してください。

```typescript
A('Request.Table.ContextMenu', 'テーブルコンテキストメニュー', async (ctx) => {
  // 選択アイテムに対応するDefaultAction以外のAction一覧を取得
  // CommandPaletteをコンテキストメニューとして表示
  // ユーザー選択後にActionを実行
  return true;
});
```

---

## 段87: TableパネルからEditorへの連携テスト

以下のシナリオをすべて動作するようにしてください。

1. DeskパネルがEditor/thinktankを表示している状態で、IndexパネルのTableにMemosを表示
2. IndexパネルのTableでメモをダブルクリック
3. DeskパネルのEditorに選択したメモが表示される

---

## 段88: Tableパネルキーワードフィルター

`[Panel].Table.Resource` のKeyword欄に入力した文字列でTableをフィルタリングする機能を実装してください。

- `Name` または `Keywords` フィールドを対象にインクリメンタル検索
- フィルター中は行数をPanelTitleに `(表示数/全件数)` で表示

---

## 段89a: Tableモード時のPanelTitle情報更新

TableモードのPanelTitleに以下の情報を渡してください（段12の `PanelTitleProps` に対応）。

**渡す情報:**
- `resourceName` — 表示中コレクション名（`TTCollection.Name`）
- `itemCount` — フィルター後の表示行数
- `totalCount` — コレクションの全件数（`TTCollection.Count`）
- `cursorId` — 現在カーソルが指している行のID（`[Panel].Table.CurrentID`）

**表示フォーマット（再掲）:**
```
○ [パネル名] | リソース名(表示件数/全件数) | カーソル位置ID
```

**実装方針:**

`TTPanelTableBehavior` にパネルタイトル用の情報を返すゲッターを追加してください。

```typescript
// TTPanelTableBehavior.ts に追加
public get PanelTitleInfo(): {
  resourceName: string;
  itemCount: number;
  totalCount: number;
  cursorId: string;
} {
  const col = this._currentCollection;
  return {
    resourceName: col?.Name ?? '',
    itemCount:    this._filteredItems.length,
    totalCount:   col?.Count ?? 0,
    cursorId:     this.GetCurrentId(),
  };
}
```

`Panel.tsx` の Tableモード描画部分でこのゲッターを使い、`PanelTitle` へPropsとして渡します。

```typescript
// Panel.tsx の描画部分（Tableモード時）
const tableInfo = behavior instanceof TTPanelTableBehavior
  ? behavior.PanelTitleInfo
  : { resourceName: '', itemCount: 0, totalCount: 0, cursorId: '' };

<PanelTitle
  panelName={name}
  mode="Table"
  isActive={isActive}
  isDirty={false}
  resourceName={tableInfo.resourceName}
  itemCount={tableInfo.itemCount}
  totalCount={tableInfo.totalCount}
  cursorId={tableInfo.cursorId}
  app={app}
/>
```

- カーソル移動・フィルター変更・コレクション同期完了のたびに `app.NotifyRedraw()` を呼ぶ
- 全件ロード完了前は `totalCount` が暫定値になるため、ロード完了後に再描画してカウントを更新する

---

## 段89: Phase05 動作確認チェックリスト

- [ ] IndexパネルのTableにTTMemos一覧が表示されること
- [ ] 矢印キーで選択行が移動すること
- [ ] ダブルクリックでDeskパネルにメモが表示されること
- [ ] カラムタイトルクリックでソートが動作すること
- [ ] Keyword欄入力でフィルタリングが動作すること
- [ ] パネル比率変更後のテーブル表示が崩れないこと
- [ ] コマンドパレットが右クリックで表示されること
- [ ] PanelTitleに `○ [パネル名] | リソース名(表示件数/全件数) | カーソル位置ID` が表示されること
- [ ] カーソルを動かすとPanelTitleのカーソル位置IDが更新されること
- [ ] フィルタリング後に表示件数が変化し全件数は変わらないこと（例: `Memos(12/5512)`）

---

**前フェーズ**: [Phase 04: Editorパネル](./phase04_editor.md)
**次フェーズ**: [Phase 06: WebViewパネル](./phase06_webview.md)
