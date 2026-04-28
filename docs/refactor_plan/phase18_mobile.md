# Phase 18: スマートフォン・タブレット対応

## 前提条件
- Phase 01〜17 が完了していること

## このフェーズの目標
スマートフォン・タブレットで最適な表示と操作を実現する。デバイス種別と向きに応じてパネル構成・モード・レイアウトを自動切り替えし、スワイプとボトムナビゲーションで操作できる状態を作る。

---

## 段140: デバイス判定ユーティリティ

`src/utils/deviceUtils.ts` を作成してください。

```typescript
export const deviceUtils = {
  isTouchDevice(): boolean {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  },

  isMobile(): boolean {
    return /iPhone|Android|Mobile/.test(navigator.userAgent) && this.isTouchDevice();
  },

  isTablet(): boolean {
    return this.isTouchDevice() && !this.isMobile();
  },

  getViewportSize(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
  }
};
```

---

## 段141: レスポンシブレイアウトの実装

### デバイス・向きによるパネル構成

| デバイス | 向き | 使用パネル | 表示方法 |
|---|---|---|---|
| タブレット | **縦置き** | Shelf・Desk・System | Shelf と Desk を上下2分割 |
| タブレット | **横置き** | Index・Desk・Log | Index と Desk を左右2分割 |
| スマホ | 縦/横 | Index・Desk・Log | Desk を Zenモード（全画面） |
| PC | — | 全7パネル | 通常の3カラムレイアウト |

### 各パネルのモード固定（タッチデバイス）

| パネル | モード | Resource / URL |
|---|---|---|
| Desk | **Editor固定** | 前回のメモ |
| Shelf / Index | **Table固定** | `Memos`（TTMemosコレクション） |
| System / Log | **WebView固定** | `/ttmarkdown`（同パネルEditorのMarkdownプレビュー） |

### CSSメディアクエリ

`src/index.css` にメディアクエリを追加してください。

```css
/* ---- タブレット縦置き: Shelf上 + Desk下、System非表示枠 ---- */
@media (min-width: 641px) and (max-width: 1024px) and (orientation: portrait) {
  .app-container {
    display: grid;
    grid-template-rows: 1fr 2fr auto; /* Shelf:Desk = 1:2 */
    grid-template-columns: 1fr;
    height: 100dvh;
  }
  /* 使用するパネルのみ表示 */
  .panel[data-panel="Shelf"] { grid-row: 1; display: flex; flex-direction: column; }
  .panel[data-panel="Desk"]  { grid-row: 2; display: flex; flex-direction: column; }
  /* System は MobileSwipe で表示切替（デフォルト非表示） */
  .panel[data-panel="System"].swipe-visible { grid-row: 1; display: flex; flex-direction: column; }
  /* 不要パネルを非表示 */
  .panel:not([data-panel="Shelf"]):not([data-panel="Desk"]):not([data-panel="System"]) { display: none; }
  .mobile-bottom-nav { display: flex; }
}

/* ---- タブレット横置き: Index左 + Desk右、Log非表示枠 ---- */
@media (min-width: 641px) and (max-width: 1366px) and (orientation: landscape) {
  .app-container {
    display: grid;
    grid-template-columns: 1fr 2fr; /* Index:Desk = 1:2 */
    grid-template-rows: 1fr auto;
    height: 100dvh;
  }
  .panel[data-panel="Index"] { grid-column: 1; display: flex; flex-direction: column; }
  .panel[data-panel="Desk"]  { grid-column: 2; display: flex; flex-direction: column; }
  /* Log は MobileSwipe で表示切替（デフォルト非表示） */
  .panel[data-panel="Log"].swipe-visible { grid-column: 1; display: flex; flex-direction: column; }
  .panel:not([data-panel="Index"]):not([data-panel="Desk"]):not([data-panel="Log"]) { display: none; }
  .mobile-bottom-nav { display: flex; }
}

/* ---- スマートフォン: DeskのみZenモード ---- */
@media (max-width: 640px) {
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100dvh;
  }
  .panel { display: none; }
  .panel.active-zen { display: flex; flex: 1; flex-direction: column; } /* Desk */
  /* スワイプで表示する Index / Log */
  .panel.swipe-visible { display: flex; flex: 1; flex-direction: column; }
  .mobile-bottom-nav { display: flex; }
}

/* PC: ボトムナビを非表示 */
@media (min-width: 1025px) {
  .mobile-bottom-nav { display: none; }
}
```

---

## 段142: 起動時のデバイス別パネル初期化

タッチデバイス起動時に、デバイス種別と向きに応じてパネルのモード・Resourceを自動設定してください。

```typescript
// TTApplication.ts のコンストラクタ内
export class TTApplication {
  private _mobileLayout: 'pc' | 'tablet-portrait' | 'tablet-landscape' | 'mobile' = 'pc';

  constructor() {
    this._initMobileLayout();
    window.addEventListener('orientationchange', () => this._initMobileLayout());
    window.addEventListener('resize', () => this._initMobileLayout());
  }

  private _initMobileLayout(): void {
    const { width, height } = deviceUtils.getViewportSize();
    const isPortrait = height > width;
    const isMobile   = deviceUtils.isMobile();
    const isTablet   = deviceUtils.isTablet();

    if (isMobile) {
      this._mobileLayout = 'mobile';
      // Desk: Editor固定 / Zenモード
      this.SetZenMode('Desk');
      this._setMobilePanelModes();
    } else if (isTablet && isPortrait) {
      this._mobileLayout = 'tablet-portrait';
      this._setTabletPortraitModes();
    } else if (isTablet && !isPortrait) {
      this._mobileLayout = 'tablet-landscape';
      this._setTabletLandscapeModes();
    } else {
      this._mobileLayout = 'pc';
    }
    this.NotifyRedraw();
  }

  // モード・Resource の設定（共通）
  private _applyMobilePanelDefaults(): void {
    const S = this.models.Status;
    // Desk: Editorモード固定
    S.SetValue('Desk.Current.Mode', 'Editor');
    // Shelf / Index: TableモードでMemos固定
    S.SetValue('Shelf.Current.Mode', 'Table');
    S.SetValue('Shelf.Table.Resource', 'Memos');
    S.SetValue('Index.Current.Mode', 'Table');
    S.SetValue('Index.Table.Resource', 'Memos');
    // System / Log: WebViewモードで /ttmarkdown 固定
    S.SetValue('System.Current.Mode', 'WebView');
    S.SetValue('System.WebView.Keyword', '/ttmarkdown');
    S.SetValue('Log.Current.Mode', 'WebView');
    S.SetValue('Log.WebView.Keyword', '/ttmarkdown');
  }

  private _setMobilePanelModes(): void { this._applyMobilePanelDefaults(); }
  private _setTabletPortraitModes(): void { this._applyMobilePanelDefaults(); }
  private _setTabletLandscapeModes(): void { this._applyMobilePanelDefaults(); }
}
```

> **重要**: モバイル時はパネルのモード切替（`Alt+M` 等）を無効化し、固定モードを維持してください。

---

## 段143: ボトムナビゲーション（モバイル共通）

`src/components/MobileNav.tsx` を作成してください。タブレット・スマホ共通で画面下部に固定表示します。

### 表示内容

パネル切り替えアイコンに加え、以下の操作ボタンを配置してください。

| ボタン | アイコン案 | 動作 |
|---|---|---|
| 音声入力 On/Off | 🎤 / 🔇 | `Application.Voice.Input` を `on`/`off` でトグル |
| 文字削除 | ⌫ | アクティブEditorにBackspaceを送信 |
| ペースト | 📋 | クリップボードからEditorにテキスト貼り付け |
| コピー | 📄 | Editor選択テキストをクリップボードにコピー |

```typescript
export function MobileNav({ app }: { app: TTApplication }) {
  const isVoiceOn = app.models.Status.GetValue('Application.Voice.Input') === 'on';

  const handleVoiceToggle = () =>
    app.models.Actions.Invoke('Application.Voice.Toggle', {});
  const handleDelete = () =>
    app.models.Actions.Invoke('Editor.Input.Backspace', {});
  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    app.models.Actions.Invoke('Editor.Input.InsertText', { text });
  };
  const handleCopy = () =>
    app.models.Actions.Invoke('Editor.Input.CopySelection', {});

  return (
    <div className="mobile-bottom-nav">
      {/* 音声入力 */}
      <button className={`nav-btn ${isVoiceOn ? 'active' : ''}`}
              onClick={handleVoiceToggle}>{isVoiceOn ? '🔇' : '🎤'}</button>
      {/* 文字削除 */}
      <button className="nav-btn" onClick={handleDelete}>⌫</button>
      {/* ペースト */}
      <button className="nav-btn" onClick={handlePaste}>📋</button>
      {/* コピー */}
      <button className="nav-btn" onClick={handleCopy}>📄</button>
    </div>
  );
}
```

DefaultActions / DefaultEvents に以下を追加してください。

```typescript
// Actions
A('Application.Voice.Toggle', '音声入力トグル', async (ctx) => {
  const cur = models.Status.GetValue('Application.Voice.Input');
  models.Status.SetValue('Application.Voice.Input', cur === 'on' ? 'off' : 'on');
  return true;
});
A('Editor.Input.Backspace',     'Backspace送信',         async (ctx) => { /* Editor.execCommand('deleteLeft') */ return true; });
A('Editor.Input.InsertText',    'テキスト挿入',           async (ctx) => { /* Editor.executeEdits insert ctx.text */ return true; });
A('Editor.Input.CopySelection', '選択テキストをコピー',   async (ctx) => { /* navigator.clipboard.writeText */ return true; });
```

---

## 段144: タッチジェスチャーによるパネル切り替え

Phase07の `TouchGestureRecognizer` を拡張し、デバイス・向き別のスワイプ挙動を実装してください。

### スワイプ仕様

| デバイス | スワイプ方向 | 切り替え |
|---|---|---|
| タブレット縦置き | **上スワイプ** | `Shelf+Desk` → `Desk+System` へ（Systemが上に出る） |
| タブレット縦置き | **下スワイプ** | `Desk+System` → `Shelf+Desk` へ（Shelfが上に出る） |
| タブレット横置き | **左スワイプ** | `Index+Desk` → `Desk+Log` へ（Logが左に出る） |
| タブレット横置き | **右スワイプ** | `Desk+Log` → `Index+Desk` へ（Indexが左に出る） |
| スマホ | **左スワイプ** | `Index` → `Desk` → `Log` の順に表示 |
| スマホ | **右スワイプ** | `Log` → `Desk` → `Index` の順に表示 |

### フォーカス方針
- **Deskには常にフォーカスがある**（`Application.Current.Panel` は常に `Desk`）
- Shelf / Index / System / Log への操作は **ExPanelモード** として扱う
  - 例: IndexのTableをタップ → ExModeを `ExPanel:Index` に設定して操作

### DefaultEvents.ts への追加

```typescript
// --- モバイルスワイプ ---
// スマホ: 左右スワイプでパネル順に切り替え
E('*-*-*-*', '', 'SWIPE_LEFT',  'Mobile.Panel.SwipeNext');
E('*-*-*-*', '', 'SWIPE_RIGHT', 'Mobile.Panel.SwipePrev');
// タブレット縦置き: 上下スワイプで上パネル切り替え
E('*-*-*-*', '', 'SWIPE_UP',    'Mobile.Panel.SwipeUp');
E('*-*-*-*', '', 'SWIPE_DOWN',  'Mobile.Panel.SwipeDown');
// ロングプレス: コンテキストメニュー
E('*-*-*-*',    '', 'PanelTitle_LONGPRESS', 'Request.PanelTitle.ContextMenu');
E('*-Editor-*-*', '', 'LONGPRESS', 'Request.Editor.ContextMenu');
E('*-Table-*-*',  '', 'LONGPRESS', 'Request.Table.ContextMenu');
```

### DefaultActions.ts への追加

```typescript
A('Mobile.Panel.SwipeNext', 'スマホ: 次パネル表示', async (ctx) => {
  // layout='mobile': Index→Desk→Log の順にスワイプ表示
  // layout='tablet-landscape': Index+Desk ↔ Desk+Log を切り替え
  return true;
});
A('Mobile.Panel.SwipePrev', 'スマホ: 前パネル表示', async (ctx) => { return true; });
A('Mobile.Panel.SwipeUp',   'タブレット縦: 上パネル切り替え', async (ctx) => {
  // Shelf+Desk → Desk+System (`.swipe-visible` クラスを付け替え)
  return true;
});
A('Mobile.Panel.SwipeDown', 'タブレット縦: 下パネル切り替え', async (ctx) => { return true; });
```

---

## 段145: スマートフォン向けエディター調整

モバイルデバイスでのMonaco Editor使用上の問題を解決してください。

- スマートフォン（`isMobile()`）では Monaco の代わりに **`<textarea>` ベースのシンプルなエディター**を使用
  - 理由: MonacoはモバイルIME・仮想キーボードとの相性が悪い
- タブレット（`isTablet()`）では Monaco をそのまま使用
- 切り替えは `EditorView.tsx` 内で `deviceUtils.isMobile()` で判定
- モバイル時はパネルのモードが Editor 固定のため、`textarea` エディターが常に表示される

---

## 段146: PWA対応

`public/manifest.json` を作成してください。

```json
{
  "name": "ThinktankWebCC",
  "short_name": "Thinktank",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1e1e2e",
  "theme_color": "#89b4fa",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`index.html` に `<link rel="manifest" href="/manifest.json">` を追加。
アイコン画像 `icon-192.png` / `icon-512.png` を `public/` に配置してください。

---

## 段147: Phase12 動作確認チェックリスト

**PC:**
- [ ] 全7パネルが3カラムで表示されること
- [ ] ボトムナビゲーションが非表示であること

**タブレット縦置き（iPad縦等）:**
- [ ] ShelfとDeskが上下2分割で表示されること
- [ ] ShelfパネルがTableモード・Memos一覧表示であること
- [ ] SystemパネルがWebViewモード・`/ttmarkdown`表示であること
- [ ] 上スワイプでSystemが上に表示（Shelf非表示）になること
- [ ] 下スワイプでShelfが上に戻ること

**タブレット横置き（iPad横等）:**
- [ ] IndexとDeskが左右2分割で表示されること
- [ ] IndexパネルがTableモード・Memos一覧表示であること
- [ ] LogパネルがWebViewモード・`/ttmarkdown`表示であること
- [ ] 左スワイプでLogが左に表示（Index非表示）になること
- [ ] 右スワイプでIndexが左に戻ること

**スマートフォン（iPhone/Android）:**
- [ ] DeskパネルのみZenモード（全画面）で表示されること
- [ ] DeskがEditorモード固定であること
- [ ] 左右スワイプで Index ↔ Desk ↔ Log が切り替わること
- [ ] Desk以外（Index/Log）のタップ操作がExPanelモード扱いになること

**ボトムナビゲーション（タブレット・スマホ共通）:**
- [ ] 🎤 ボタンで音声入力のOn/Offが切り替わること
- [ ] ⌫ ボタンでEditorの文字が削除されること
- [ ] 📋 ボタンでクリップボードのテキストがEditorに貼り付けられること
- [ ] 📄 ボタンでEditorの選択テキストがコピーされること

**共通:**
- [ ] ロングプレスでコンテキストメニューが表示されること
- [ ] PWAとしてホーム画面に追加してスタンドアロン起動できること

---

**前フェーズ**: [Phase 11: Gmail連携](./phase11_gmail_in_phase08_09.md)
**次フェーズ**: [Phase 13: デプロイ・仕上げ](./phase13_deploy.md)

---
---