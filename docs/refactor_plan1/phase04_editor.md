# Phase 04: Editorパネル

## 前提条件
- Phase 01〜03 が完了していること
- `npm install @monaco-editor/react` が実行済み

## このフェーズの目標
Monaco Editorを使用したEditorパネルを完成させる。メモの読み込み・編集・保存、Folding、ハイライト、検索・置換が動作する状態を作る。

---

## 段57: Monaco Editorコンポーネント設置

`src/components/EditorView.tsx` を作成してください。

```typescript
import Editor from '@monaco-editor/react';

interface EditorViewProps {
  memoId: string;
  onContentChange: (content: string) => void;
  onEditorMount: (editor: any, monaco: any) => void;
  fontSize: number;
  wordWrap: 'on' | 'off';
  theme: string;
}
```

- 言語は `markdown` に設定
- テーマは `vs-dark` をベースに customTheme を定義
- エディター幅・高さを100%に設定
- `mousedown`/`keydown` イベントをインターセプトして TTApplication.UIRequestTriggeredAction へ渡す

---

## 段58: TTMemoクラス実装

`src/models/TTMemo.ts` を作成してください。

```typescript
import { TTObject } from './TTObject';

export class TTMemo extends TTObject {
  public Content: string = '';
  public Keywords: string = '';
  public UpdateDate: string = '';
  public Category: string = 'Memo';
  public IsLoaded: boolean = false;
  public IsDirty: boolean = false; // 未保存変更あり

  // APIからコンテンツを読み込む
  async LoadContent(): Promise<void>

  // APIへ保存（デバウンス制御あり）
  async SaveContent(): Promise<void>

  // コンテンツ変更を記録
  SetContent(content: string): void {
    this.Content = content;
    this.IsDirty = true;
    this.Name = content.split('\n')[0].trim() || this.ID;
    this.UpdateDate = new Date().toISOString();
  }
}
```

---

## 段59: TTMemosクラスの実装

`src/models/TTMemos.ts` を作成してください。TTCollectionを継承し、Firestoreの `tt_memos` コレクションと同期します。

```typescript
export class TTMemos extends TTCollection {
  public override get ClassName(): string { return 'TTMemos'; }

  constructor() {
    super();
    this.ItemSaveProperties = 'ID,UpdateDate,Name,Keywords';
    this.ListProperties = 'ID,UpdateDate,Name';
    this.ListPropertiesMin = 'Name,ID';
    this.ColumnMapping = 'ID:メモID,Name:タイトル,UpdateDate:更新日';
    this.ColumnMaxWidth = 'ID:18,Name:70,UpdateDate:18';
  }

  // BQの代わりにFirestore APIと同期
  public async LoadCache(): Promise<void>
  public async SyncWithFirestore(): Promise<boolean>
  public async getOrCreateMemo(id: string): Promise<TTMemo>
  protected CreateChildInstance(): TTMemo { return new TTMemo(); }
}
```

---

## 段60: TTPanelEditorBehavior実装

`src/Views/TTPanelEditorBehavior.ts` を作成してください。IPanelModeBehaviorを実装します。

```typescript
export class TTPanelEditorBehavior implements IPanelModeBehavior {
  readonly ModeName: PanelMode = 'Editor';
  private _editor: any = null; // Monaco editor instance
  private _panel: TTPanel;
  private _currentMemoId: string = '';

  OnAttach(panel: TTPanel): void
  OnDetach(): void

  // Monaco editor インスタンスを取得・設定
  SetEditorHandle(editor: any): void

  // メモのロードとEditor表示
  async LoadMemo(memoId: string): Promise<void>

  // エディター内容をメモに保存（デバウンスあり）
  SaveCurrentMemo(): void

  HandleKeyDown(context: ActionContext): boolean
  HandleMouseDown(context: ActionContext): boolean
  HandleTouchEvent(context: ActionContext): boolean

  // カーソル位置の操作
  SetCursorPos(value: string): void  // 'next/prev/first/last/nextline/prevline/linestart/lineend'
  GetCursorPos(): string

  // 検索
  OpenSearch(mode: 'search' | 'replace'): void
}
```

---

## 段61: EditorパネルからTTMemoをロードする流れ

`[Panel].Editor.Resource` の TTStatus が変更されたときに、メモをロードする処理を実装してください。

```typescript
// DefaultStatus.tsのapplyコールバック内:
models.Status.RegisterState(`${panel}.Editor.Resource`, 'thinktank', {
  apply: async (memoId, prev) => {
    const panel = app.GetPanel(panelName);
    await panel.EditorBehavior.LoadMemo(memoId);
  }
});
```

### 初期起動時の設定
- Deskパネルのみ初回起動時に `thinktank` IDのメモをロードする
- それ以外のパネルはローカルストレージの前回値を復元する

---

## 段62: Markdown Foldingの実装

`src/Views/EditorFoldingHelper.ts` を作成してください。

`#*` で始まる行（Markdownの見出し）をFoldingとして認識するカスタムFoldingプロバイダーをMonacoに登録してください。

```typescript
export function registerMarkdownFolding(monaco: any): void {
  monaco.languages.registerFoldingRangeProvider('markdown', {
    provideFoldingRanges(model) {
      // '#' の数によってネスト構造を決定
      // 閉じている見出しの直前行までをfoldingRangeとする
      const ranges = [];
      // ... 実装
      return ranges;
    }
  });
}
```

- `#*` の数でレベルを管理（`#` = レベル1、`##` = レベル2）
- 親Foldingを閉じると子も非表示
- Folding状態をTTEditingに保存

---

## 段63: キーワードハイライトの実装

`src/Views/EditorNavigationHelper.ts` に、キーワードハイライト機能を追加してください。

- `[Panel].Editor.Keyword` の値（カンマ区切りのグループ）に基づいてEditor内テキストをハイライト
- グループ1〜6に対して異なる蛍光色（背景色）を使用
- Monaco の `editor.deltaDecorations` APIを使用

```typescript
export function applyKeywordHighlights(
  editor: any,
  keywords: string,
  keywordColors: string
): void
```

---

## 段64: 検索・置換機能

`src/Views/EditorSearchHelper.ts` を作成してください。

- Monacoの `editor.getAction('editor.action.startFindWithArgs')` でポップアップ表示
- 状態: `[Panel].Editor.SearchMode` (None / Search / Replace)
- 次の状態へ: `next` コマンドで SearchMode を循環
- 大文字小文字区別: `[Panel].Editor.SearchCaption`
- 正規表現: `[Panel].Editor.SearchRegex`
- 単語単位: `[Panel].Editor.SearchWholeWord`

---

## 段65: Editorカーソル操作Actionの実装

`src/Controllers/Actions/EditorCursorActions.ts` を作成し、DefaultActions.tsからimportしてください。

```typescript
// カーソル移動
A('Editor.Cursor.NextLine',    '次の行', ...)
A('Editor.Cursor.PrevLine',    '前の行', ...)
A('Editor.Cursor.FirstLine',   '先頭行', ...)
A('Editor.Cursor.LastLine',    '最終行', ...)
A('Editor.Cursor.LineStart',   '行頭', ...) // 行頭→文書先頭
A('Editor.Cursor.LineEnd',     '行末', ...) // 行末→文書末尾
A('Editor.Cursor.NextRequest', '次のリクエストタグ', ...)
A('Editor.Cursor.PrevRequest', '前のリクエストタグ', ...)
```

---

## 段66: Folding操作Actionの実装

`src/Controllers/Actions/EditorFoldingActions.ts` を作成してください。

```typescript
A('Editor.Folding.Next',           '次のFolding', ...)
A('Editor.Folding.Prev',           '前のFolding', ...)
A('Editor.Folding.Open',           'Foldingを開く', ...)
A('Editor.Folding.Close',          'Foldingを閉じる（兄弟一括も含む）', ...)
A('Editor.Folding.OpenAllSibling', '兄弟Foldingをすべて開く', ...)
A('Editor.Folding.CloseAllSibling','兄弟Foldingをすべて閉じる', ...)
A('Editor.Folding.FirstSibling',   '最初の兄弟Foldingへ', ...)
A('Editor.Folding.LastSibling',    '最後の兄弟Foldingへ', ...)
```

---

## 段67: 行編集Actionの実装

`src/Controllers/Actions/EditorEditActions.ts` を作成してください。

```typescript
A('Editor.Edit.NextBullet',   '行頭文字を前へ（・→-→*→→→↓→なし）', ...)
A('Editor.Edit.PrevBullet',   '行頭文字を次へ', ...)
A('Editor.Edit.NextComment',  'コメント文字を前へ（; →> →>> →| →なし）', ...)
A('Editor.Edit.PrevComment',  'コメント文字を次へ', ...)
A('Editor.Edit.AddTab',       'インデント追加', ...)
A('Editor.Edit.RemoveTab',    'インデント削除', ...)
A('Editor.Edit.FoldingInit',  'Folding初期化', ...)
A('Editor.Edit.FoldingDown',  'Foldingレベル下げ（#追加）', ...)
A('Editor.Edit.FoldingUp',    'Foldingレベル上げ（#削除）', ...)
```

---

## 段68: 日付挿入Action(Editor.Date.Action)

`src/Controllers/Actions/EditorDateActions.ts` を作成してください。

```typescript
A('Editor.Date.Action', '日付操作', async (ctx) => {
  // カーソル位置のタグを確認
  // 日付タグ([DateTag])であればExModeをExDateTimeに変更
  // それ以外の場合、現在日時をカーソル位置に挿入
  // フォーマット: [yyyy-mm-dd]（曜日・時刻なし）
});

// ExDateTimeモード中のAction
A('DateTime.ChangeFormat.Date',    '日付フォーマット変更', ...)
A('DateTime.ChangeDetail.Weekday', '曜日表示切替', ...)
A('DateTime.ChangeDetail.Time',    '時刻表示切替', ...)
A('DateTime.Shift.Next1d',         '翌日', ...)
A('DateTime.Shift.Prev1d',         '前日', ...)
A('DateTime.Shift.Next1m',         '翌月', ...)
A('DateTime.Shift.Prev1m',         '前月', ...)
A('DateTime.Shift.Next1y',         '翌年', ...)
A('DateTime.Shift.Prev1y',         '昨年', ...)
```

---

## 段69: TTEditing クラス実装

`src/models/TTEditing.ts` を作成してください。

```typescript
export class TTEditing extends TTObject {
  public FoldingLines: string = ''; // 折りたたまれた行番号カンマ区切り
  public CaretPos: string = '';     // MonacoのcaretposJSON
  public WordWrap: boolean = false;
  public Keywords: string = '';
  public KeywordColor: string = '';
}

export class TTEditings extends TTCollection {
  // IDはメモIDに対応
  // Firestore: /tt_editings/{memoId}
  public async SaveEditing(memoId: string, editing: TTEditing): Promise<void>
  public async LoadEditing(memoId: string): Promise<TTEditing | null>
  protected CreateChildInstance(): TTEditing { return new TTEditing(); }
}
```

---

## 段70: メモ保存時のTTEditing保存

メモをロード・保存するとき、TTEditingも連動して保存・復元するようにしてください。

**ロード時:**
1. メモコンテンツをEditorに設定
2. 同じIDのTTEditingを取得
3. FoldingLines（折りたたみ状態）を復元
4. CaretPos（カーソル位置）を復元
5. WordWrap/Keywords/KeywordColorを復元

**保存時:**
1. メモコンテンツをFirestoreへ保存（60秒デバウンス）
2. TTEditing（Folding状態・カーソル位置・Keywords等）を保存

---

## 段71: 新規メモ作成Action

`Application.Memo.Create` を完成させてください。

```typescript
// 新規メモのテンプレート
const id = generateMemoId(); // 'yyyy-mm-dd-HHmmss'
const title = `No Title - ${id}`;
const content = `${title}\n${'='.repeat(50)}\n`;

// TTMemosに追加
// DeskパネルのEditorに表示
// [Panel].Editor.Resource を新規IDに設定
```

---

## 段72: Editorマウスイベント処理

`src/Views/TTPanelEditorBehavior.ts` にMonacoのマウスイベント処理を追加してください。

```typescript
editor.onMouseDown((e) => {
  const context: ActionContext = {
    Sender: `${panelName}-Editor-Main`,
    Key: clickCountToKey(e.event.leftButton, e.event.rightButton, e.event.detail),
    Mods: getMods(e.event),
    ScreenX: e.event.browserEvent.screenX,
    ScreenY: e.event.browserEvent.screenY,
  };
  // カーソル位置のリクエストタグ(TTRequest)を解決してcontextに追加
  const requestTag = resolveRequestTagAtPosition(e.target.position);
  if (requestTag) {
    context.RequestTag = requestTag;
  }
  app.UIRequestTriggeredAction(context);
});
```

clickCountToKey: `LEFT1`/`LEFT2`/`LEFT3`/`RIGHT1`/`RIGHT2`/`RIGHT3` を返す

---

## 段73: りリンクタグのクリック処理

`src/Views/EditorRequestHelper.ts` を作成してください。

```typescript
// Requestタグ([Memo:xxx], [Search:xxx]等)のクリック時処理
export function resolveRequestTagAtPosition(
  editor: any,
  position: { lineNumber: number; column: number }
): string | null

// Requestタグを装飾として登録（ホバー表示も含む）
export function registerRequestDecorations(
  editor: any,
  requests: TTRequests
): void
```

---

## 段74: Editorデフォルトイベントの追加

DefaultEvents.ts のEditor関連イベントを追加してください（一部抜粋）。

```typescript
// Editorキーバインド（一部）
E('*-Editor-*-*', '',         'UP',     '[Panel].Editor.CurPos:prevline');
E('*-Editor-*-*', '',         'DOWN',   '[Panel].Editor.CurPos:nextline');
E('*-Editor-*-*', '',         'HOME',   'Editor.Cursor.LineStart');
E('*-Editor-*-*', '',         'END',    'Editor.Cursor.LineEnd');
E('*-Editor-*-*', 'Alt',      'T',      'Editor.Date.Action');
E('*-Editor-*-*', 'Alt',      'F',      'Editor.Folding.Next');
E('*-Editor-*-*', 'Control',  'SPACE',  'Request.Editor.InvokeDefault');
E('*-Editor-*-*', 'Control',  'RIGHT1', 'Request.Editor.ContextMenu');
E('*-Editor-*-*', '',         'LEFT2',  'Request.Editor.InvokeDefault');
E('*-Editor-*-*', 'Alt',      'B',      'Editor.Edit.NextBullet');
E('*-Editor-*-*', 'Alt',      'C',      'Editor.Edit.NextComment');
E('*-Editor-*-*', 'Alt',      'RIGHT',  'Editor.Edit.FoldingDown');
E('*-Editor-*-*', 'Alt',      'LEFT',   'Editor.Edit.FoldingUp');
```

---

## 段75a: Editorモード時のPanelTitle情報更新

EditorモードのPanelTitleに以下の情報を渡してください（段12の `PanelTitleProps` に対応）。

**渡す情報:**
- `memoId` — 現在Editorに表示中のメモID
- `memoTitle` — メモ本文の1行目テキスト（`TTMemo.Name` を使用）
- `isDirty` — `TTMemo.IsDirty`（未保存変更フラグ）

**表示フォーマット（再掲）:**
```
● [パネル名] | memoID | タイトル
```

**実装方針:**

`TTPanelEditorBehavior` にパネルタイトル用の情報を返すゲッターを追加してください。

```typescript
// TTPanelEditorBehavior.ts に追加
public get PanelTitleInfo(): {
  memoId: string;
  memoTitle: string;
  isDirty: boolean;
} {
  const memo = this._currentMemo;
  return {
    memoId:    memo?.ID ?? '',
    memoTitle: memo?.Name ?? '',
    isDirty:   memo?.IsDirty ?? false,
  };
}
```

`Panel.tsx` の Editorモード描画部分でこのゲッターを使い、`PanelTitle` へPropsとして渡します。

```typescript
// Panel.tsx の描画部分（Editorモード時）
const editorInfo = behavior instanceof TTPanelEditorBehavior
  ? behavior.PanelTitleInfo
  : { memoId: '', memoTitle: '', isDirty: false };

<PanelTitle
  panelName={name}
  mode="Editor"
  isActive={isActive}
  isDirty={editorInfo.isDirty}
  memoId={editorInfo.memoId}
  memoTitle={editorInfo.memoTitle}
  app={app}
/>
```

- メモをロードしたとき（`LoadMemo` 完了後）と、編集内容が変わったとき（`IsDirty` 変化時）に再描画を行う
- 再描画は `app.NotifyRedraw()` を呼ぶことで行う

---

## 段75: Phase04 動作確認チェックリスト

- [ ] EditorパネルにMonaco Editorが表示されること
- [ ] DeskパネルでデフォルトメモID `thinktank` のメモが表示されること（なければ空のエディター）
- [ ] テキストを編集して60秒後に自動保存が動作すること
- [ ] `#` で始まる行でFoldingが機能すること
- [ ] キーワードハイライトが動作すること（[Panel].Editor.Keyword に値を設定して確認）
- [ ] `Ctrl+F` で検索ポップアップが開くこと
- [ ] `Alt+T` で現在日時が挿入されること
- [ ] 新規メモ作成（`Ctrl+N`）が動作すること
- [ ] メモリロード後にFolding状態・カーソル位置が復元されること
- [ ] PanelTitleに `○/● [パネル名] | memoID | タイトル` が表示されること
- [ ] テキスト編集時にPanelTitleの `○` が `●` に変わること
- [ ] 保存完了後にPanelTitleの `●` が `○` に戻ること

---

**前フェーズ**: [Phase 03: コアUIフレームワーク](./phase03_ui_framework.md)
**次フェーズ**: [Phase 05: Tableパネル](./phase05_table.md)
