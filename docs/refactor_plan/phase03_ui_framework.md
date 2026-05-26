# Phase 03: コアUIフレームワーク

## 前提条件
- Phase 01・02 が完了していること
- 7パネルレイアウトとStatusBarが表示されていること

## このフェーズの目標
TTModels（アプリケーションデータモデル）、TTStatus（状態管理）、TTAction（アクション管理）、TTEvent（イベント管理）を実装し、パネルの切り替えやアクティブパネル管理が動作する状態を作る。

---

## 段36: TTStatusクラス実装

`src/models/TTStatus.ts` を作成してください。

```typescript
import { TTCollection } from './TTCollection';

/**
 * 状態アイテムの設定インターフェース
 * config に文字列を渡した場合はその値が Default 値として扱われる
 */
export interface TTStateConfig {
  /** デフォルト値を返す関数（id: 状態キー） */
  Default?: (id: string) => string;
  /** 値を検証する関数。false を返すと SetValue がキャンセルされる */
  Test?: (id: string, value: string) => boolean;
  /** 値変更時にViewへ反映する副作用関数 */
  Apply?: (id: string, value: string) => void;
  /** 登録時に監視処理を開始する関数（Firestore購読・TTApplication変化の検知等） */
  Watch?: (id: string) => void;
  /** 値を動的に計算して返す関数。設定時は GetValue でこちらが優先される */
  Calculate?: (id: string) => string;
}

export class TTStatus extends TTCollection {
  private _items: Map<string, TTStateConfig & { value: string }> = new Map();

  /**
   * 状態の登録。`[Panels]` を含むキーは 7パネル分を自動展開して登録する
   * @param id     状態キー（例: 'Application.Current.Panel', '[Panels].Editor.Resource'）
   * @param desc   説明文字列
   * @param config 文字列の場合はその値をデフォルト値として使用、
   *               オブジェクトの場合は TTStateConfig として扱う
   */
  RegisterState(
    id: string,
    desc: string,
    config: string | TTStateConfig
  ): void

  // 値の取得（Calculate が設定されている場合はその計算結果を返す）
  GetValue(id: string): string

  // 値の設定（Test が false を返す場合は変更せず、Apply を呼び出す）
  SetValue(id: string, value: string): void

  // Apply のみを呼び出す（Test をスキップする場合）
  ApplyValue(id: string, value: string): void

  // ローカルストレージから復元
  LoadCache(): Promise<void>

  // ローカルストレージへ保存
  SaveCache(): Promise<void>
}
```

> **重要**: `Test` はユーザーが入力した値の検証（数値チェック、選択肢チェック等）に使用します。
> `Apply` は値変更後のView反映（CSS変更・パネル操作等）に使用します。
> `Watch` は登録時に一度だけ呼ばれ、外部状態（TTApplication・Firestoreリアルタイム更新）を
> TTStatus に反映する購読処理を開始することに使用します。

### `[Panels]` 自動展開の仕様

`RegisterState` に `[Panels]` を含むキーを渡すと、内部で以下のように7パネル分に展開して登録します。

```typescript
// 呼び出し例:
models.Status.RegisterState('[Panels].Editor.Resource', '表示中メモID', 'thinktank');

// 内部で以下の7キーに自動展開される:
// 'Library.Editor.Resource' = 'thinktank'
// 'Index.Editor.Resource'   = 'thinktank'
// 'Shelf.Editor.Resource'   = 'thinktank'
// 'Desk.Editor.Resource'    = 'thinktank'
// 'System.Editor.Resource'  = 'thinktank'
// 'Chat.Editor.Resource'    = 'thinktank'
// 'Log.Editor.Resource'     = 'thinktank'
```

実際のコードパターン:

```typescript
const PANELS: PanelName[] = ['Library', 'Index', 'Shelf', 'Desk', 'System', 'Chat', 'Log'];

RegisterState(id: string, desc: string, config: string | TTStateConfig): void {
  if (id.includes('[Panels]')) {
    for (const panel of PANELS) {
      const expandedId = id.replace('[Panels]', panel);
      this._registerSingle(expandedId, desc, config);
    }
  } else {
    this._registerSingle(id, desc, config);
  }
}
```

---

## 段37: TTActionクラス実装

`src/models/TTAction.ts` を作成してください。

```typescript
export interface ActionContext {
  Sender?: string;       // パネル名
  Key?: string;          // キー名 (LEFT1, RIGHT1, UP, DOWN, ENTER, ESC, ...)
  Mods?: string[];       // モディファイア (Control, Alt, Shift)
  ScreenX?: number;
  ScreenY?: number;
  RequestID?: string;
  RequestTag?: string;
  DroppedData?: any;
  [key: string]: any;
}

export type ActionFunction = (context: ActionContext) => boolean | Promise<boolean>;

export class TTAction {
  public ID: string = '';
  public Name: string = '';
  public fn: ActionFunction;
  constructor(id: string, fn: ActionFunction) { this.ID = id; this.fn = fn; }
}

export class TTActions extends TTCollection {
  private _models: any;
  constructor(models: any) { super(); this._models = models; }

  AddAction(id: string, name: string, fn: ActionFunction): void
  GetAction(id: string): TTAction | undefined
  async Invoke(id: string, context: ActionContext): Promise<boolean>
}
```

---

## 段38: TTEventクラス実装

`src/models/TTEvent.ts` を作成してください。

```typescript
export interface TTEventDefinition {
  // パターン例: '*-Editor-Main-*' → Sender-Mode-SubMode-ExMode
  senderPattern: string;
  modPattern: string;     // '' = 任意, 'Control' = Ctrl必須
  keyPattern: string;     // 'UP', 'DOWN', 'ENTER', 'LEFT1', etc.
  actionId: string;       // 実行するTTActionのID
}

export class TTEvents extends TTCollection {
  private _events: TTEventDefinition[] = [];

  AddEvent(
    senderPattern: string,
    modPattern: string,
    keyPattern: string,
    actionId: string
  ): void

  // contextに合致するイベントを検索してactionIdを返す
  FindMatchingAction(context: ActionContext): string | null
}
```

---

## 段39: TTRequestクラス実装

`src/models/TTRequest.ts` を作成してください。

```typescript
export class TTRequest {
  public ID: string = '';
  public Name: string = '';
  public Determinant: string = ''; // 正規表現文字列
  public _regex: RegExp | null = null;

  public Match(tag: string): RegExpMatchArray | null
}

export class TTRequests extends TTCollection {
  private _models: any;
  constructor(models: any) { super(); this._models = models; }

  AddRequest(id: string, name: string, determinant: string): void

  // tagとDeterminantがマッチする子アイテムを検索してデフォルトActionのIDを返す
  GetDefaultAction(tag: string, requestId?: string): string | null

  // tagとマッチするAction一覧を返す（Default以外）
  GetActions(tag: string): string[]
}
```

---

## 段40: TTModelsクラス実装

`src/models/TTModels.ts` を作成してください。以下のコレクションを保有するシングルトンです。

```typescript
export class TTModels extends TTCollection {
  public Status: TTStatus;
  public Actions: TTActions;
  public Events: TTEvents;
  public Memos: TTMemos;
  public Chats: TTChats;       // 新規: AIチャット専用
  public Events_: TTEvents_;   // 新規: イベント(カレンダー)専用
  public Editings: TTEditings;
  public Requests: TTRequests;

  private static _instance: TTModels;
  public static get Instance(): TTModels

  constructor() {
    // 各コレクションを初期化
    // DefaultStatus/Actions/Events/Requests を初期化
    // キャッシュをロード
  }
}
```

**重要**: `TTChats` はTTMemosとは独立したコレクションとして管理します。

---

## 段41: TTPanel・TTApplication型定義

`src/types/panel.ts` を作成してください。

```typescript
export interface PanelState {
  name: PanelName;
  mode: PanelMode;
  resource: string;       // 表示中のコレクションID or メモID
  keyword: string;
  keywords: string;
  isActive: boolean;
  width: number;
  height: number;
  zIndex: number;
}

export interface AppState {
  panels: Record<PanelName, PanelState>;
  activePanel: PanelName;
  exMode: string;         // 'ExPanel:Shelf' などのExモード
  colorMode: string;
  fontSize: number;
}
```

---

## 段42: TTApplicationクラス（コア）実装

`src/Views/TTApplication.ts` を作成してください。

このクラスはアプリケーション全体のコントローラーです。

```typescript
export class TTApplication {
  private models: TTModels;
  private _panels: Map<PanelName, TTPanel>;
  public State: AppState;
  public exMode: string = '';        // ExMode文字列（Phase07 段107で実装）
  public ZenPanel: PanelName | null = null; // Phase07B 段174で追加

  // アクティブパネルの取得・設定
  get ActivePanel(): TTPanel
  SetActivePanel(name: PanelName): void
  GetPanel(name: PanelName): TTPanel
  
  // ExPanel（補助パネル）
  get ExFdPanel(): TTPanel  // ExModeが 'ExPanel:Shelf' の場合 Shelfパネルを返す、なければActivePanel

  // 統合イベント処理（キーボード・マウス・タッチすべてを受け付ける）
  UIRequestTriggeredAction(context: ActionContext): Promise<void>

  // TTStatus変更の通知受け取り
  OnStatusChanged(key: string, value: string): void

  // Viewへの再描画通知（ReactのforceUpdateをセットして呼び出す）
  NotifyRedraw: () => void;  // ← コールバック形式で宣言

  // Zenモード切り替え（Phase07B段174で実装）
  SetZenMode(panelName: PanelName | null): void
}
```

> **React側との接続方法**: `App.tsx` で `TTApplication` インスタンスを生成した後、  
> `useReducer` の dispatch または `useState` の setter を `app.NotifyRedraw` にセットする。  
> これにより TTApplication 内から `this.NotifyRedraw()` を呼ぶだけで React が再描画される。  
> 実装は段49の `App.tsx` 統合で行う（`app.NotifyRedraw = forceUpdate` の形式）。

---

## 段43: TTPanel クラス実装

`src/Views/TTPanel.ts` を作成してください。

```typescript
export class TTPanel {
  public Name: PanelName;
  public State: PanelState;
  private _behavior: IPanelModeBehavior;

  // モードの切り替え
  SwitchMode(mode: PanelMode): void

  // リソースの設定
  SetResource(resourceId: string): void

  // キーボードイベントの処理
  HandleKeyDown(context: ActionContext): void
  HandleMouseDown(context: ActionContext): void
  HandleTouchEvent(context: ActionContext): void
}
```

---

## 段44: IPanelModeBehaviorインターフェース定義

`src/Views/IPanelModeBehavior.ts` を作成してください。

```typescript
export interface IPanelModeBehavior {
  readonly ModeName: PanelMode;
  OnAttach(panel: TTPanel): void;
  OnDetach(): void;
  HandleKeyDown(context: ActionContext): boolean;
  HandleMouseDown(context: ActionContext): boolean;
  HandleTouchEvent(context: ActionContext): boolean;
  GetCurrentResource(): string;
  SetResource(resourceId: string): void;
}
```

---

## 段45: DefaultStatus.ts の作成

`src/Controllers/DefaultStatus.ts` を作成してください。アプリケーション全体の状態変数を登録します。
`[Panels]` を含むキーは `RegisterState` 内で 7パネル（Library/Index/Shelf/Desk/System/Chat/Log）分に自動展開されます。

### パネル共通の状態（`[Panels].*`）

```
[Panels].Current.Mode      → 'Editor'(Desk) | 'Table'(Index/Shelf/Chat/Log/Library) | 'WebView'
                             Test: Editor|Table|WebView のいずれか
[Panels].Current.Tool      → 'Main'(default) | 'Keyword' | 'Search' | 'Replace'
                             Test: Main|Keyword|Search|Replace のいずれか
[Panels].Font.Size         → 数値文字列 (default: '12')
                             Test: 8〜72 の整数, Apply: panel.FontSize へ反映
                             up/down/reset の特殊値もサポート

[Panels].Editor.Resource   → 表示中メモID (default:'thinktank')
                             Apply: EditorBehavior.LoadMemo(memoId) を呼び出す
[Panels].Editor.Keyword    → キーワード文字列 (default: '')
[Panels].Editor.Keywords   → 複数キーワード（改行区切り, default: ''）
[Panels].Editor.KeywordColor → 'Default' | 'Subtle' | 'None'
                             Test: Default|Subtle|None のいずれか
[Panels].Editor.Wordwrap   → 'on' | 'off' (default: 'off')
                             Test: on|off のいずれか, next でトグル
[Panels].Editor.Minimap    → 'true' | 'false' (default: 'false')
                             Test: true|false のいずれか
[Panels].Editor.LineNumber → 'on' | 'off' (default: 'off')
                             Test: on|off のいずれか
[Panels].Editor.SearchRegex         → 'true'|'false' (default:'false')
[Panels].Editor.SearchCaseSensitive → 'true'|'false' (default:'false')
[Panels].Editor.SearchWholeWord     → 'true'|'false' (default:'false')
[Panels].Editor.ReplaceKeepCapitalize → 'true'|'false' (default:'false')
[Panels].Editor.ReplaceInSelection  → 'true'|'false' (default:'false')
[Panels].Editor.SearchMode → 'None' | 'Search' | 'Replace' (default: 'None')
                             Apply: Editorの検索UIを開閉する
[Panels].Editor.CurPos     → 'row,col' 形式 (default: '1,1')
                             Apply: Editorのカーソルを指定位置へ移動
[Panels].Editor.SelPos     → 'sRow,sCol,eRow,eCol' 形式 (default: '1,1,1,1')

[Panels].Table.Resource    → 表示中コレクションID
                             default: Library=Thinktank, Index/Shelf/Desk=Memos,
                                      System=Actions, Chat=Events, Log=Status
[Panels].Table.Keyword     → フィルターキーワード (default: Index='@7d', 他='')
[Panels].Table.Keywords    → 複数フィルターキーワード (default: '')
[Panels].Table.SortDir     → 'asc' | 'desc' (default: 'asc')
                             Test: asc|desc のいずれか, next でトグル
[Panels].Table.SortProperty → ソート対象プロパティ名 (default: '')
[Panels].Table.CurPos      → 数値文字列（選択行）, next/prev/first/last もサポート
[Panels].Table.CurrentID   → 選択行のID (default: '')
[Panels].Table.VisibleProperties → 表示列名をカンマ区切り (default: '')

[Panels].WebView.Keyword   → URL or 検索キーワード (default: '')
[Panels].WebView.Keywords  → 複数キーワード (default: '')
[Panels].WebView.CurPos    → リンク選択位置 (default: '')

[Panels].Keyword.CurPos    → Keywordエディターのカーソル位置 (default: '0,0')
                             Apply: nextline/prevline/nextchar/prevchar 等の操作文字列を受け付けてカーソルを移動
[Panels].Keyword.SelPos    → Keywordエディターの選択範囲 (default: '0,0,0,0')
                             Apply: nextline/prevline 等の選択操作を受け付ける
```

### アプリケーション全体の状態（`Application.*`）

```
Application.Product.Name    → アプリ名 (固定値: 'Thinktank')
Application.Product.Author  → 制作者名
Application.Product.Version → バージョン (commit_log.csv の最終行から生成)

Application.Current.Panel  → アクティブパネル名 (default: 'Desk')
                             Apply: 指定パネルにフォーカスを移動、next/prev でローテーション
                             Watch: TTApplication.ActivePanel の変化を反映
Application.Current.Mode   → アクティブパネルのモード
                             Calculate: TTApplication.ActivePanel.Mode を返す（書き込み不可）
Application.Current.Tool   → アクティブパネルのツール
                             Calculate: TTApplication.ActivePanel.Tool を返す
Application.Current.ExMode → Exモード文字列 (default: '')
                             Apply: 'Panel'→'Ex${ActivePanel.Name}' に変換して設定

Application.Appearance.ColorMode → テーマ名 (段11aで定義した7テーマ)
                             choices: Dark|KimbieDark|SynthWave84|Light|QuietLight|
                                      TokyoNightLight|DefaultLightModern
                             Apply: document.documentElement.dataset.theme へ反映
                             Watch: TTApplication.ColorMode の変化を反映
Application.Style.PanelRatio → パネル比率文字列
                             Apply: TTApplication.SetPanelLayoutByCommand() を呼び出す
Application.Font.Size      → 数値文字列 (default: '14')
                             Apply: 全パネルのFontSize へ反映, up/down/reset サポート
Application.Voice.Input    → 'true'|'false' (default: 'false')
                             Test: true|false|toggle のいずれか
                             Apply: TTApplication.VoiceInput へ反映, toggle でトグル
```

> **実装ガイド**: `[Panels]` を含むキーは `RegisterState` の内部で7パネル分に自動展開します。
> `next/prev` 等の特殊値の解決は `SetValue` 内で行い、解決した値で `Apply` を呼び出します。
> `Watch` は `RegisterState` 内で一度だけ呼び出し、購読処理を登録します。

---

## 段46: DefaultActions.ts の骨格作成

`src/Controllers/DefaultActions.ts` を作成してください。

```typescript
export function InitializeDefaultActions(models: TTModels) {
  const { actions } = models;
  const A = (id, name, fn) => actions.AddAction(id, name, fn);

  // --- アプリケーション操作 ---
  A('Application.Memo.Create', '新規メモ作成', async (ctx) => { /*...*/ return true; });
  A('Application.Panel.Next',  '次パネルへ', async (ctx) => { /*...*/ return true; });
  A('Application.Panel.Prev',  '前パネルへ', async (ctx) => { /*...*/ return true; });
  // ... 以降のActionは各フェーズで追加
}
```

各ActionはIDと名前と実装関数を持ちます。

---

## 段47: DefaultEvents.ts の骨格作成

`src/Controllers/DefaultEvents.ts` を作成してください。

```typescript
export function InitializeDefaultEvents(models: TTModels) {
  const E = (sender, mod, key, action) => models.Events.AddEvent(sender, mod, key, action);

  // --- パネル共通 ---
  E('*-*-*-*', '', 'F1', 'Application.Help');
  E('*-*-*-*', 'Alt', '1', 'Application.Panel.Focus:Library');
  E('*-*-*-*', 'Alt', '2', 'Application.Panel.Focus:Index');
  E('*-*-*-*', 'Alt', '3', 'Application.Panel.Focus:Shelf');
  E('*-*-*-*', 'Alt', '4', 'Application.Panel.Focus:Desk');
  E('*-*-*-*', 'Alt', '5', 'Application.Panel.Focus:System');
  E('*-*-*-*', 'Alt', 'M', 'Application.Current.Mode:next');
  E('*-*-*-*', 'Control', 'N', 'Application.Memo.Create');
  // ... 以降のイベントは各フェーズで追加
}
```

---

## 段48: パネルコンポーネント React実装

`src/components/Panel.tsx` を作成してください。

```typescript
interface PanelProps {
  name: PanelName;
  app: TTApplication;
}

export function Panel({ name, app }: PanelProps) {
  // app.State.panels[name] から現在のmode, resource等を取得
  // mode に応じて EditorView / TableView / WebView を描画
  // PanelTitle + モードコンポーネント + Keyword入力欄
  return (
    <div className={`panel ${isActive ? 'panel-active' : ''}`}
         onKeyDown={handleKeyDown}
         onMouseDown={handleMouseDown}
         onTouchStart={handleTouchStart}>
      <PanelTitle ... />
      <div className="panel-content">
        {mode === 'Editor' && <EditorView ... />}
        {mode === 'Table' && <TableView ... />}
        {mode === 'WebView' && <WebViewPanel ... />}
      </div>
      <KeywordInput ... />
    </div>
  );
}
```

---

## 段49: App.tsx の TTApplication 統合

`src/App.tsx` を書き換えて、TTApplicationを中心にした構成にしてください。

```typescript
function App() {
  const [app] = useState(() => new TTApplication());
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    app.NotifyRedraw = forceUpdate;
  }, [app]);

  return (
    <div className="app-container">
      <div className="col-left">
        <Panel name="Library" app={app} />
        <Panel name="Index" app={app} />
      </div>
      <div className="col-center">
        <Panel name="Shelf" app={app} />
        <Panel name="Desk" app={app} />
        <Panel name="System" app={app} />
      </div>
      <div className="col-right">
        <Panel name="Chat" app={app} />
        <Panel name="Log" app={app} />
      </div>
      <StatusBar app={app} />
    </div>
  );
}
```

---

## 段50: パネルフォーカス管理

TTApplicationにパネルフォーカス管理を追加してください。

- クリックまたはキー操作でパネルがアクティブになる
- アクティブパネルは `Application.Current.Panel` のTTStatusに反映される
- `Alt+1〜7` でパネルを直接フォーカス
- `Alt+M` でアクティブパネルのモードを切り替え（Editor→Table→WebView→Editor）

### 動作確認項目
- 各パネルをクリックするとアクティブ（強調表示）になること
- `Alt+M` でモード表示ラベルが切り替わること（まだ空のコンテンツでOK）
- StatusBarにアクティブパネル名とモードが表示されること

---

## 段51: キーワード入力コンポーネント

`src/components/KeywordInput.tsx` を作成してください。

```typescript
interface KeywordInputProps {
  panelName: PanelName;
  mode: PanelMode;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}
```

- 1行表示の薄い背景テキスト入力欄
- Enterキーで `onSubmit` を呼び出す
- ESCキーでフォーカスを外す（Editorにフォーカスを戻さない）
- フォーカスが当たっても他のパネルの再描画をしない

---

## 段52: DefaultRequests.ts の作成

`src/Controllers/DefaultRequests.ts` を作成してください。

```typescript
export function InitializeDefaultRequests(models: TTModels) {
  const R = (id, name, det) => models.Requests.AddRequest(id, name, det);

  // メモタグ: [Memo:メモID] にマッチ
  R('Memo', 'メモ参照', '\\[Memo:([^\\]]+)\\]');

  // 検索タグ: [Search:キーワード] にマッチ
  R('Search', '検索', '\\[Search:([^\\]]+)\\]');

  // AIタグ: [AI>] で始まる行にマッチ
  R('AI', 'AIアクション', '\\[AI>([^\\]]*)\\]');

  // メールタグ: [Mail:件名] にマッチ
  R('Mail', 'メール参照', '\\[Mail:([^\\]]+)\\]');

  // 日付タグ: [2026-03-16] 形式にマッチ
  R('DateTag', '日付', '\\[(\\d{4}-\\d{2}-\\d{2}[^\\]]*)\\]');
}
```

---

## 段53: TTCollectionのキャッシュ保存・復元

`src/models/TTCollection.ts` のLoadCache/SaveCacheを完成させてください。

```typescript
// ローカルストレージに CSV 形式で一覧を保存
public async SaveCache(): Promise<void> {
  const props = this.ItemSaveProperties.split(',');
  const items = this.GetItems();
  const csv = items.map(item => 
    props.map(p => String((item as any)[p] || '')).join(',')
  ).join('\n');
  localStorage.setItem(`TT_${this.ID}_cache`, csv);
}

// ローカルストレージから CSV を読み込んでアイテムを復元
public async LoadCache(): Promise<void> {
  const csv = localStorage.getItem(`TT_${this.ID}_cache`);
  if (!csv) return;
  const props = this.ItemSaveProperties.split(',');
  const lines = csv.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const values = line.split(',');
    const item = this.CreateChildInstance();
    props.forEach((p, i) => { (item as any)[p] = values[i] || ''; });
    if (item.ID) this.AddItem(item);
  }
  this.IsLoaded = true;
}

// サブクラスでオーバーライドして子インスタンスを作成
protected CreateChildInstance(): TTObject { return new TTObject(); }
```

---

## 段54: カラースキームの切り替え実装

`Application.Appearance.ColorMode` のTTStatusが変更されたとき、ドキュメントのdata属性またはCSSクラスを切り替えてテーマを変更する実装を追加してください。

```css
/* DefaultDark テーマ */
[data-theme="DefaultDark"] { --color-bg-primary: #1e1e2e; ... }

/* DefaultOriginal テーマ */
[data-theme="DefaultOriginal"] { --color-bg-primary: #2b2b2b; ... }
```

TTStatusの`apply`コールバックで `document.documentElement.dataset.theme = value` を設定してください。

---

## 段55: フォントサイズ制御

`Application.Font.Size` の変更で全パネルのフォントサイズが変わる実装を追加してください。

- 対象: Editorのフォントサイズ、TableのCSSフォントサイズ、WebViewの `zoom` または `font-size`
- up/downCoマンドで1段階増減
- 範囲: 10〜24

---

## 段56: Phase03 動作確認チェックリスト

- [ ] 7パネルが表示され、クリックでアクティブパネルが切り替わること
- [ ] `Alt+M` でモードが切り替わること（Editor/Table/WebViewラベル表示）
- [ ] StatusBarにアクティブパネル名・モードが表示されること
- [ ] `Alt+1〜7` でフォーカスが切り替わること
- [ ] カラースキームが切り替えられること
- [ ] ページリロード後も前回のアクティブパネル・モードが復元されること
- [ ] スプリッターで各パネルのサイズが調整できること

---

**前フェーズ**: [Phase 02: バックエンドAPI・Firestore設計](./phase02_backend.md)
**次フェーズ**: [Phase 04: Editorパネル](./phase04_editor.md)
