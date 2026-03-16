# Phase 06: WebViewパネル

## 前提条件
- Phase 01〜05 が完了していること

## このフェーズの目標
WebViewパネルを実装する。Markdownプレビュー、/ttsearch全文検索、URL表示が動作する状態を作る。

---

## 段90: WebViewパネルコンポーネント作成

`src/components/WebViewPanel.tsx` を作成してください。

```typescript
interface WebViewPanelProps {
  panelName: PanelName;
  url: string;
  editorContent?: string; // Keyword未設定時のMarkdownプレビュー用
  onNavigate: (url: string) => void;
}
```

- `<iframe>` を使用してsandbox制限付きで表示
- キーボードイベントを親ウィンドウへ転送
- `url` が空の場合、`editorContent`（同パネルのEditorのMarkdown）をHTMLに変換して表示

---

## 段91: MarkdownプレビューユーティリティTの実装

`src/utils/markdownToHtml.ts` を作成してください。

- 見出し（#〜######）、太字、斜体、コードブロック、インラインコード、リスト、引用、水平線、段落を変換
- **テーブル記法** (`|col1|col2|`) をHTMLテーブルに変換
- リンク `[text](url)` を `<a>` タグに変換
- XSS対策としてHTMLエスケープを実施
- 変換結果にCSSスタイルを埋め込んだ完全なHTMLドキュメントとして返す

---

## 段92: /ttsearch 全文検索サービスの実装

`server/src/routes/ttsearchRoutes.ts` を作成してください。

```
GET /ttsearch?q=キーワード
```

- Firestoreの `tt_memos` コレクションから `name` と `content` を検索
- 結果をHTML形式で返す（WebViewで表示）
- 1件あたりの表示フォーマット:
  ```
  メモID: タイトル (リンク)
  検索語を含むスニペット（前後100文字）
  ```
- 検索語を太字でハイライト
- リンクに `data-memo-id` 属性をつけてクリック時にEditorで開けるようにする

---

## 段93: WebViewキーイベント転送

WebViewのiframe内でのキーイベントを親ウィンドウへ転送する実装を追加してください。

```javascript
// iframe内に注入するスクリプト
document.addEventListener('keydown', (e) => {
  parent.postMessage({
    type: 'keydown',
    key: e.key,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey
  }, '*');
});
```

親ウィンドウ側でpostMessageを受け取ってTTApplication.UIRequestTriggeredActionに渡す。

---

## 段94: WebViewリンクナビゲーション

WebView内のリンククリックインターセプトを実装してください。

- `[Memo:xxx]` 形式のリクエストタグリンクのクリック → `Request.Memo.Open`
- `/ttsearch?q=xxx` → 同WebViewで検索結果を表示
- 絶対URL（`http://...`）→ 新しいブラウザタブで開く
- 相対URL（`/...`）→ 同WebViewで表示

---

## 段95: TTPanelWebViewBehaviorの実装

`src/Views/TTPanelWebViewBehavior.ts` を作成してください。

```typescript
export class TTPanelWebViewBehavior implements IPanelModeBehavior {
  readonly ModeName: PanelMode = 'WebView';

  // URL設定・ナビゲーション
  SetResource(urlOrKeyword: string): void

  // Keyword.Query Action実装
  ApplyKeywordQuery(keyword: string): void

  // WebViewページ内リンクカーソル制御
  SetCursorPos(value: string): void // 'next/prev/first/last'

  HandleKeyDown(context: ActionContext): boolean
  HandleTouchEvent(context: ActionContext): boolean
}
```

---

## 段96: WebViewデフォルトイベントの追加

DefaultEvents.ts にWebView関連イベントを追加してください。

```typescript
E('*-WebView-*-*', '',    'ENTER',   'WebView.Keyword.Query');
E('*-WebView-*-*', 'Alt', 'S',       'Application.WebView.Search');
E('*-WebView-*-*', '',    'TAB',     'WebView.Cursor.Next');
E('*-WebView-*-*', 'Shift','TAB',    'WebView.Cursor.Prev');
```

---

## 段97: Keyword.Query Actionの実装

```typescript
A('WebView.Keyword.Query', 'WebViewキーワード検索', async (ctx) => {
  const kw = panel.State.webViewKeyword;
  if (kw.startsWith('http') || kw.startsWith('/')) {
    // URLとしてWebViewに適用
    panel.WebViewBehavior.SetResource(kw);
  } else {
    // /ttsearch?q=urlencode(keyword) として検索
    panel.WebViewBehavior.SetResource(`/ttsearch?q=${encodeURIComponent(kw)}`);
  }
  // Keywords一覧にも追加（重複の場合は最終行に移動）
  return true;
});
```

---

## 段98a: WebViewモード時のPanelTitle情報更新

WebViewモードのPanelTitleに以下の情報を渡してください（段12の `PanelTitleProps` に対応）。

**渡す情報:**
- `url` — 現在WebViewに表示中のURL またはキーワード文字列

**表示フォーマット（再掲）:**
```
○ [パネル名] | URL
```

**実装方針:**

`TTPanelWebViewBehavior` にパネルタイトル用の情報を返すゲッターを追加してください。

```typescript
// TTPanelWebViewBehavior.ts に追加
public get PanelTitleInfo(): { url: string } {
  return { url: this._currentUrl ?? '' };
}
```

`Panel.tsx` の WebViewモード描画部分でこのゲッターを使い、`PanelTitle` へPropsとして渡します。

```typescript
// Panel.tsx の描画部分（WebViewモード時）
const webViewInfo = behavior instanceof TTPanelWebViewBehavior
  ? behavior.PanelTitleInfo
  : { url: '' };

<PanelTitle
  panelName={name}
  mode="WebView"
  isActive={isActive}
  isDirty={false}
  url={webViewInfo.url}
  app={app}
/>
```

- `SetResource(urlOrKeyword)` が呼ばれるたびに `_currentUrl` を更新し `app.NotifyRedraw()` を呼ぶ
- URLが長い場合は `text-overflow: ellipsis` で末尾を省略表示（CSS側で対応）

---

## 段98: Phase06 動作確認チェックリスト

- [ ] WebViewパネルでMarkdownプレビューが表示されること（EditorのMarkdownをHTML変換）
- [ ] テーブル記法のMarkdownが正しく変換されること
- [ ] Keyword欄に `/ttsearch?q=xxx` を入力してEnterで検索結果が表示されること
- [ ] 検索結果のリンクをクリックしてEditorパネルにメモが表示されること
- [ ] Keyword欄に通常テキストを入力するとttsearch検索が実行されること
- [ ] PanelTitleに `○ [パネル名] | URL` が表示されること
- [ ] Keyword欄でURLを変更するとPanelTitleのURLも更新されること

---

**前フェーズ**: [Phase 05: Tableパネル](./phase05_table.md)
**次フェーズ**: [Phase 07: イベント・アクションシステム](./phase07_event_action.md)
