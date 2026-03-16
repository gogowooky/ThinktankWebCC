# Phase 07B: PanelTitle・StatusBarのUIイベント統合

## 前提条件
- Phase 07（段99〜110）が完了していること
- `TouchGestureRecognizer`（段103）が実装済みであること

## このフェーズの目標
PanelタイトルおよびStatusBarのマウス・タッチイベントを、パネルコンテンツと同じ `UIRequestTriggeredAction` に統合する。
これにより、`DefaultEvents.ts` にイベント登録するだけで任意のActionを割り当てられるようになる。

---

## イベントKey名の定義（設計方針）

PanelTitle・StatusBarのイベントは、通常の `LEFT1`/`RIGHT1` 等の前に識別プレフィックスを付与して区別する。

| 操作 | マウス | タッチ |
|---|---|---|
| シングルクリック/タップ | `PanelTitle_LEFT1` | `PanelTitle_TAP1` |
| ダブルクリック/ダブルタップ | `PanelTitle_LEFT2` | `PanelTitle_TAP2` |
| 右クリック(長押し) | `PanelTitle_RIGHT1` | `PanelTitle_LONGPRESS` |
| StatusBar シングル | `StatusBar_LEFT1` | `StatusBar_TAP1` |
| StatusBar ダブル | `StatusBar_LEFT2` | `StatusBar_TAP2` |
| StatusBar 右クリック(長押し) | `StatusBar_RIGHT1` | `StatusBar_LONGPRESS` |

Sender文字列は通常パネル（例: `Desk-Editor-Main-*`）と同じパネル名を使用する。

---

## 段170: PanelTitleコンポーネントへのイベント追加

`src/components/PanelTitle.tsx` にマウス・タッチイベントハンドラーを追加してください。

```typescript
import { TouchGestureRecognizer } from '../utils/touchGesture';

interface PanelTitleProps {
  panelName: PanelName;
  mode: PanelMode;
  title?: string;
  isActive?: boolean;
  app: TTApplication;
}

export function PanelTitle({ panelName, mode, title, isActive, app }: PanelTitleProps) {
  const gestureRef = useRef(new TouchGestureRecognizer());

  // マウスイベント（クリック回数をKey名に変換）
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); // パネル本体のhandleMouseDownへの伝播を止める
    const key = getPanelTitleMouseKey(e.button, e.detail);
    // 例: LEFT1, LEFT2, RIGHT1
    const context: ActionContext = {
      Sender: buildSenderString(app, panelName), // 'Desk-Editor-Main-*'
      Key: `PanelTitle_${key}`,
      Mods: getMods(e),
      RequestID: 'PanelTitle',
      RequestTag: `[PanelTitle:${panelName}]`,
      ScreenX: e.screenX,
      ScreenY: e.screenY,
    };
    app.UIRequestTriggeredAction(context);
  };

  // タッチイベント
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    gestureRef.current.onTouchStart(e.nativeEvent);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    const gesture = gestureRef.current.onTouchEnd(e.nativeEvent);
    if (!gesture) return;
    // TAP1 → PanelTitle_TAP1、TAP2 → PanelTitle_TAP2、LONGPRESS → PanelTitle_LONGPRESS
    const context: ActionContext = {
      Sender: buildSenderString(app, panelName),
      Key: `PanelTitle_${gesture.type}`,
      Mods: [],
      RequestID: 'PanelTitle',
      RequestTag: `[PanelTitle:${panelName}]`,
    };
    app.UIRequestTriggeredAction(context);
  };

  return (
    <div
      className={`panel-title ${isActive ? 'active' : ''}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={e => e.preventDefault()} // ブラウザデフォルトの右クリックメニュー抑制
    >
      <span className="panel-name">{panelName}</span>
      {title && <span className="panel-title-text"> | {title}</span>}
    </div>
  );
}
```

---

## 段171: StatusBarコンポーネントへのイベント追加

`src/components/StatusBar.tsx` に同様のマウス・タッチイベントハンドラーを追加してください。

```typescript
export function StatusBar({ app }: { app: TTApplication }) {
  const gestureRef = useRef(new TouchGestureRecognizer());

  const handleMouseDown = (e: React.MouseEvent) => {
    const key = getPanelTitleMouseKey(e.button, e.detail);
    const context: ActionContext = {
      Sender: buildSenderString(app), // アクティブパネルのSender
      Key: `StatusBar_${key}`,
      Mods: getMods(e),
      RequestID: 'StatusBar',
      RequestTag: `[StatusBar:${app.ActivePanel.Name}]`,
      ScreenX: e.screenX,
      ScreenY: e.screenY,
    };
    app.UIRequestTriggeredAction(context);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const gesture = gestureRef.current.onTouchEnd(e.nativeEvent);
    if (!gesture) return;
    const context: ActionContext = {
      Sender: buildSenderString(app),
      Key: `StatusBar_${gesture.type}`,
      Mods: [],
      RequestID: 'StatusBar',
      RequestTag: `[StatusBar:${app.ActivePanel.Name}]`,
    };
    app.UIRequestTriggeredAction(context);
  };

  return (
    <div
      className="statusbar"
      onMouseDown={handleMouseDown}
      onTouchStart={e => gestureRef.current.onTouchStart(e.nativeEvent)}
      onTouchEnd={handleTouchEnd}
      onContextMenu={e => e.preventDefault()}
    >
      {/* StatusBarの内容 */}
    </div>
  );
}
```

---

## 段172: ヘルパー関数の整備

`src/utils/eventHelpers.ts`（段101・102で作成済み）に以下を追加してください。

```typescript
// マウスボタン + クリック回数 → Key名（LEFT1/LEFT2/LEFT3/RIGHT1/...）
export function getPanelTitleMouseKey(button: number, detail: number): string {
  const side = button === 0 ? 'LEFT' : button === 2 ? 'RIGHT' : 'CENTER';
  const count = Math.min(detail, 3); // 1, 2, 3
  return `${side}${count}`;
}

// ActionContextのSender文字列を構築
// 'PanelName-Mode-SubMode-ExMode' の形式
export function buildSenderString(app: TTApplication, panelName?: PanelName): string {
  const panel = panelName ? app.GetPanel(panelName) : app.ActivePanel;
  const exMode = app.exMode || '*';
  return `${panel.Name}-${panel.State.mode}-Main-${exMode}`;
}

// KeyboardEvent / MouseEvent / TouchEvent からMods配列を取得
export function getMods(e: KeyboardEvent | MouseEvent | React.MouseEvent | React.KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  return mods;
}
```

---

## 段173: DefaultEvents.ts へのPanelTitle・StatusBarイベント登録

`src/Controllers/DefaultEvents.ts` に以下を追加してください。

```typescript
// --- PanelTitle イベント ---
// 左クリック: パネルをアクティブにする（既存のパネルクリック処理と共存させる）
E('*-*-*-*', '', 'PanelTitle_LEFT1',      'Application.Panel.Focus');

// 左ダブルクリック: パネルをZenモード（全画面）にする
E('*-*-*-*', '', 'PanelTitle_LEFT2',      'Application.Panel.ZenMode');

// 右クリック: パネルのコンテキストメニュー
E('*-*-*-*', '', 'PanelTitle_RIGHT1',     'Request.PanelTitle.ContextMenu');

// タッチ: タップ=フォーカス、ダブルタップ=Zenモード、長押し=コンテキストメニュー
E('*-*-*-*', '', 'PanelTitle_TAP1',       'Application.Panel.Focus');
E('*-*-*-*', '', 'PanelTitle_TAP2',       'Application.Panel.ZenMode');
E('*-*-*-*', '', 'PanelTitle_LONGPRESS',  'Request.PanelTitle.ContextMenu');

// --- StatusBar イベント ---
// 左クリック: StatusBarの詳細情報表示トグル
E('*-*-*-*', '', 'StatusBar_LEFT1',       'Application.StatusBar.ToggleDetail');

// 左ダブルクリック: ログパネルを開く
E('*-*-*-*', '', 'StatusBar_LEFT2',       'Application.Panel.Focus:Log');

// 右クリック: StatusBarのコンテキストメニュー
E('*-*-*-*', '', 'StatusBar_RIGHT1',      'Request.StatusBar.ContextMenu');

// タッチ対応
E('*-*-*-*', '', 'StatusBar_TAP1',        'Application.StatusBar.ToggleDetail');
E('*-*-*-*', '', 'StatusBar_TAP2',        'Application.Panel.Focus:Log');
E('*-*-*-*', '', 'StatusBar_LONGPRESS',   'Request.StatusBar.ContextMenu');
```

---

## 段174: 対応Actionの実装

`src/Controllers/Actions/` に以下を追加してください。

```typescript
// Application.Panel.ZenMode: 指定パネルをZenモード（全画面）にする
A('Application.Panel.ZenMode', 'Zenモード切り替え', async (ctx) => {
  const panelName = extractPanelFromTag(ctx.RequestTag); // [PanelTitle:Desk] → 'Desk'
  const current = app.ZenPanel;
  app.SetZenMode(current === panelName ? null : panelName); // トグル
  return true;
});

// Request.PanelTitle.ContextMenu: パネルタイトルのコンテキストメニュー
A('Request.PanelTitle.ContextMenu', 'パネルメニュー', async (ctx) => {
  // メニュー項目例:
  // - モード切替 (Editor / Table / WebView)
  // - Zenモード
  // - パネル比率リセット
  // - このパネルのリソース一覧
  // CommandPaletteで選択させてActionを実行
  return true;
});

// Application.StatusBar.ToggleDetail: StatusBarの詳細情報トグル
A('Application.StatusBar.ToggleDetail', 'StatusBar詳細表示', async (ctx) => {
  // StatusBarの表示内容をトグル（簡易表示 ⇔ 詳細表示）
  // 詳細: サーバー状態・メモ件数・最終保存時刻 などを追加表示
  return true;
});

// Request.StatusBar.ContextMenu: StatusBarのコンテキストメニュー
A('Request.StatusBar.ContextMenu', 'StatusBarメニュー', async (ctx) => {
  // メニュー項目例:
  // - カラーモード切替
  // - フォントサイズ変更
  // - サーバー接続状態確認
  // - キャッシュクリア
  return true;
});
```

ヘルパー関数:
```typescript
function extractPanelFromTag(tag?: string): PanelName | null {
  // '[PanelTitle:Desk]' → 'Desk'
  const m = tag?.match(/\[PanelTitle:([^\]]+)\]/);
  return (m?.[1] as PanelName) ?? null;
}
```

---

## 段175: DefaultRequests.ts への登録

`src/Controllers/DefaultRequests.ts` に以下を追加してください。

```typescript
// PanelTitleタグにマッチ: [PanelTitle:Desk] など
R('PanelTitle', 'パネルタイトル操作', '\\[PanelTitle:([^\\]]+)\\]');

// StatusBarタグにマッチ: [StatusBar:Desk] など
R('StatusBar', 'ステータスバー操作', '\\[StatusBar:([^\\]]+)\\]');
```

---

## 段176: ブラウザデフォルト右クリックメニューの抑制

アプリ全体でブラウザのデフォルト右クリックメニューを抑制してください。

```typescript
// src/App.tsx の useEffect に追加
useEffect(() => {
  const suppressContextMenu = (e: MouseEvent) => e.preventDefault();
  document.addEventListener('contextmenu', suppressContextMenu);
  return () => document.removeEventListener('contextmenu', suppressContextMenu);
}, []);
```

---

## 段177: Phase07B 動作確認チェックリスト

- [ ] **PanelTitle 左クリック**: パネルがアクティブになること (PC・SP共通)
- [ ] **PanelTitle 左ダブルクリック**: Zenモード（全画面表示）に切り替わること
- [ ] **PanelTitle 右クリック / 長押し**: コンテキストメニューが表示されること
- [ ] **PanelTitle タップ (モバイル)**: パネルフォーカスが切り替わること
- [ ] **PanelTitle ダブルタップ (モバイル)**: Zenモードに切り替わること
- [ ] **StatusBar 左クリック**: 詳細情報が表示・非表示されること
- [ ] **StatusBar 左ダブルクリック**: Logパネルにフォーカスが移ること
- [ ] **StatusBar 右クリック / 長押し**: コンテキストメニューが表示されること
- [ ] ブラウザのデフォルト右クリックメニューが全エリアで抑制されること
- [ ] 各イベントがStatusBarのアクション履歴に記録されること

---

**前フェーズ**: [Phase 07: イベント・アクションシステム統合](./phase07_event_action.md)
**次フェーズ**: [Phase 08〜09: メモ管理・AIチャット](./phase08_09_memo_ai.md)
