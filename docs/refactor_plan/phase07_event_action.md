# Phase 07: イベント・アクションシステム統合

## 前提条件
- Phase 01〜06 が完了していること

## このフェーズの目標
TTEvent/TTAction/TTRequestを統合した UIRequestTriggeredAction を完成させ、キーボード・マウス・タッチ・ドラッグ&ドロップを統一的に処理する。

---

## 段99: UIRequestTriggeredAction の完全実装

`src/Views/TTApplication.ts` の `UIRequestTriggeredAction` を完成させてください。

```typescript
async UIRequestTriggeredAction(context: ActionContext): Promise<void> {
  // ① TTEventsとのマッチング処理
  // Sender-Mode-SubMode-ExMode パターンで一致するイベントを検索
  const actionId = this.models.Events.FindMatchingAction(context);

  if (actionId) {
    // ② TTActionの実行
    const result = await this.models.Actions.Invoke(actionId, context);
    
    // StatusBarにアクション実行履歴を追記（→ActionName）
    this.AppendActionToStatus(actionId);
    return;
  }

  // ③ TTRequestsとのマッチング処理
  if (context.RequestTag) {
    const reqActionId = this.models.Requests.GetDefaultAction(context.RequestTag, context.RequestID);
    if (reqActionId) {
      await this.models.Actions.Invoke(reqActionId, context);
    }
  }
}
```

---

## 段100: TTEventパターンマッチングの実装

`src/models/TTEvent.ts` の `FindMatchingAction` を完成させてください。

パターン構造: `Sender-Mode-SubMode-ExMode`

- `*` は任意にマッチ
- Senderは `Library`, `Desk` など
- Modeは `Editor`, `Table`, `WebView`
- SubModeは `Main`, `Keyword` など
- ExModeは `ExPanel:Shelf` などのExモード名または `*`

マッチ優先順位: 具体的なパターン → ワイルドカード（後に登録されたものが優先）

---

## 段101: グローバルキーボードイベントの統合

`src/App.tsx` または `src/Views/TTApplication.ts` にグローバルKeyDownハンドラーを追加してください。

```typescript
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    // Monaco Editor内の場合はMonacoが処理するためスキップ（on Editor panels）
    const context: ActionContext = {
      Sender: buildSenderString(app), // '${activePanel}-${mode}-Main-${exMode}'
      Key: normalizeKey(e.key),       // 'UP'/'DOWN'/'ENTER'/'A'/'B'...
      Mods: getMods(e),               // ['Control', 'Alt', 'Shift']
    };
    app.UIRequestTriggeredAction(context);
    // Actionが消費した場合は e.preventDefault()
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [app]);
```

`normalizeKey` は `ArrowUp→UP`, `ArrowDown→DOWN`, `Enter→ENTER` 等に変換。

---

## 段102: マウスイベントの統合

各パネルコンポーネント（Panel.tsx）に `onMouseDown` を追加し、`UIRequestTriggeredAction` へ渡してください。

```typescript
const handleMouseDown = (e: React.MouseEvent) => {
  const clickKey = getMouseKey(e.button, e.detail); // LEFT1/LEFT2/RIGHT1 etc.
  const context: ActionContext = {
    Sender: `${panelName}-${mode}-Main-${exMode}`,
    Key: clickKey,
    Mods: getMods(e),
    ScreenX: e.screenX,
    ScreenY: e.screenY,
  };
  app.UIRequestTriggeredAction(context);
};
```

---

## 段103: タッチイベントの基本対応

Panel.tsx にタッチイベントハンドラーを追加してください。

```typescript
// touch-action: none でブラウザデフォルトのスクロールとの競合を避ける
// タッチで TAP1/TAP2/LONGPRESS/SWIPE_LEFT/SWIPE_RIGHT を認識
```

タッチジェスチャー認識ロジック (`src/utils/touchGesture.ts`):

```typescript
export class TouchGestureRecognizer {
  private startX: number;
  private startY: number;
  private startTime: number;
  private longPressTimer: ReturnType<typeof setTimeout> | null;

  onTouchStart(e: TouchEvent): void
  onTouchMove(e: TouchEvent): void
  onTouchEnd(e: TouchEvent): GestureResult

  // GestureResult: { type: 'TAP1'|'TAP2'|'LONGPRESS'|'SWIPE_LEFT'|... }
}
```

---

## 段104: ドラッグ&ドロップの実装

各パネルコンポーネントにDrag&Dropイベントを追加し、`UIRequestTriggeredAction` へ渡してください。

```typescript
const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  const context: ActionContext = {
    Sender: `${panelName}-${mode}-Main`,
    Key: 'DROP',
    Mods: getMods(e),
    DroppedData: {
      files: Array.from(e.dataTransfer.files),
      text: e.dataTransfer.getData('text/plain'),
      urls: e.dataTransfer.getData('text/uri-list'),
    }
  };
  app.UIRequestTriggeredAction(context);
};
```

ドロップされたファイルをGoogle Driveへ格納するActionは Phase10で実装します。
ここでは `Application.Drop.Default` のスタブとして `console.log` で受け取ったことを確認するだけでOK。

---

## 段105: Request.Editor.InvokeDefault / ContextMenu の実装

```typescript
A('Request.Editor.InvokeDefault', 'Editorリクエスト実行', async (ctx) => {
  // Editorのカーソル位置またはctx.RequestTagのタグを解決
  // GetDefaultAction(tag) でデフォルトActionを取得して実行
  return true;
});

A('Request.Editor.ContextMenu', 'Editorコンテキストメニュー', async (ctx) => {
  // タグに対応するAction一覧（Default以外）を取得
  // CommandPaletteを表示してユーザーに選択させ実行
  return true;
});
```

---

## 段106: StatusBarへのAction履歴表示

StatusBarコンポーネントを更新して、実行されたActionの履歴を右側に表示してください。

```
[アクティブパネル: Desk | Editor]  [Server: OK]  → Editor.Date.Action → Request.Memo.Open
```

最大3件のAction名を `→` で連結して表示します。

---

## 段107: ExMode の実装

TTApplicationにExMode管理を追加してください。

```typescript
// ExModeの種類例:
// '' = 通常モード
// 'ExPanel:Shelf' = ShelfパネルをExPanelとして指定
// 'ExDateTime' = 日付編集モード
// 'ExVoice' = 音声入力モード

public SetExMode(exMode: string): void {
  this.exMode = exMode;
  this.NotifyRedraw();
}

// Modifier Keyが全て離されたとき: ExModeをリセット
public OnKeyUp(e: KeyboardEvent): void {
  if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
    if (this.exMode.startsWith('Ex') && !this.exMode.startsWith('ExPanel')) {
      this.SetExMode('');
    }
  }
}
```

---

## 段108: Application.Panel.Focus Action の実装

```typescript
A('Application.Panel.Focus', 'パネルフォーカス', async (ctx) => {
  // ctx.RequestTag の値（例: 'Library'）またはActionIDのサフィックスからパネル名を取得
  // 指定パネルをアクティブパネルに設定
  // Application.Current.Panel を更新
  return true;
});
```

---

## 段109: Application.Current.Mode Action の実装

```typescript
A('Application.Current.Mode', 'モード切り替え', async (ctx) => {
  // アクティブパネルのモードを切り替え
  // 'next' → Editor→Table→WebView→Editor の順に循環
  // 'prev' → 逆順
  // 直接指定: 'Editor'/'Table'/'WebView'
  return true;
});
```

---

## 段110: Phase07 動作確認チェックリスト

- [ ] `Alt+1〜7` でパネルフォーカスが切り替わること
- [ ] `Alt+M` でモードが循環すること
- [ ] Editor上で `Ctrl+Space` でリクエストタグのInvokeDefaultが実行されること
- [ ] Editor上で右クリックでコンテキストメニューが表示されること
- [ ] Table上でダブルクリックでメモが開くこと
- [ ] タッチデバイスでのTAP1/SWIPE動作が認識されること
- [ ] ファイルをドロップしてconsole.logでDropイベントが確認できること
- [ ] StatusBarにAction実行履歴が表示されること

---

**前フェーズ**: [Phase 06: WebViewパネル](./phase06_webview.md)
**次フェーズ**: [Phase 08: メモ管理・全文検索](./phase08_memo_search.md)
