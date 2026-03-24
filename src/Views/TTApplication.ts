import { TTObject } from '../models/TTObject';
import { TTModels } from '../models/TTModels';
import { TTEvent } from '../models/TTEvent';
import { TTPanel, PanelMode, PanelTool } from './TTPanel';
import { TTAction } from '../models/TTAction';
import { isTouchDevice } from '../services/TouchGestureRecognizer';
// Phase 12 段265: Facilitator
import { AnniversaryRecallEngine } from '../services/ai/AnniversaryRecallEngine';
import { RelatedRecallEngine } from '../services/ai/RelatedRecallEngine';
import { TTSuggestion } from '../models/TTSuggestion';
import type { TTMemo } from '../models/TTMemo';

export interface ContextMenuItem {
    id: string;
    label: string;
    onClick: () => void;
}

export interface ContextMenuState {
    items: ContextMenuItem[];
    x: number;
    y: number;
}

export interface CommandPaletteItem {
    id: string;
    label: string;
    description?: string; // Additional info (e.g., shortcut or detailed desc)
    onClick: () => void;
}

export interface CommandPaletteState {
    visible: boolean;
    items: CommandPaletteItem[];
    placeholder?: string;
    onSelect?: (item: CommandPaletteItem) => void; // Optional override, default calls item.onClick
}

export interface LayoutRatios {
    LeftVsRest: number;     // Left Col width ratio (vs Center+Right)
    CenterVsRight: number;  // Center Col width ratio (vs Right)
    LibVsIdx: number;       // Left Col: Library height ratio (vs Index)
    ShelfVsRest: number;    // Center Col: Shelf height ratio (vs Desk+System)
    DeskVsSys: number;      // Center Col Bottom: Desk height ratio (vs System)
    ChatVsLog: number;      // Right Col: Chat height ratio (vs Log)
}

/* アプリケーションクラス (View/Controller) */
export class TTApplication extends TTObject {
    private static _instance: TTApplication;
    public Panels: TTPanel[] = [];
    public ActivePanel: TTPanel | null = null;
    public FocusedTool: { panel: string, mode: PanelMode, tool: PanelTool } | null = null;

    public ContextMenu: ContextMenuState | null = null; // コンテキストメニュー状態

    // コマンドパレット状態
    public CommandPalette: CommandPaletteState | null = null;

    private _panelLayout: LayoutRatios = {
        LeftVsRest: 0.2,
        CenterVsRight: 0.75,
        LibVsIdx: 0.3,
        ShelfVsRest: 0.2,
        DeskVsSys: 0.8,
        ChatVsLog: 0.5
    };

    private _exMode: string = '';
    private _activeModifiers: Set<string> = new Set();
    private _currentModifiers: Set<string> = new Set();

    public LastActionID: string = '';
    public LastKeyString: string = '';

    private constructor() {
        super();
        TTApplication._instance = this;
        this.ID = 'Application';
        this.Name = 'Thinktank Application';
        this.CreatePanels();
        // 初期カラーモードを適用
        this.ApplyColorMode(this._colorMode);

        // Action チェーン表示のためのフック
        TTAction.OnInvoke = (action: any) => {
            const id = action.ID;
            // 既に表示されている末尾と同じなら追加しない（初期呼び出し時の重複防止）
            if (this.LastActionID === id) return;
            // check suffix
            const suffix = ' → ' + id;
            if (this.LastActionID.endsWith(suffix)) return;

            if (this.LastActionID === '') {
                this.LastActionID = id;
            } else {
                this.LastActionID += suffix;
            }
            this.NotifyUpdated();
        };
    }

    public static get Instance(): TTApplication {
        if (!this._instance) {
            this._instance = new TTApplication();
        }
        return this._instance;
    }

    private CreatePanels(): void {
        const panelNames = ['Library', 'Index', 'Shelf', 'Desk', 'System', 'Chat', 'Log'];

        // Initialize array first so GetPanel can find panels as they are added
        this.Panels = [];

        panelNames.forEach(name => {
            const panel = new TTPanel(name);
            // Add to registry immediately
            this.Panels.push(panel);

            panel.Setup();
            // パネルの更新を購読
            panel.AddOnUpdate('TTApplication', () => this.OnPanelUpdated(panel));
        });

        // デフォルトのアクティブパネル
        this.ActivePanel = this.GetPanel('Desk');

        // タッチデバイスの場合、Deskパネルをzenモードで表示
        if (isTouchDevice()) {
            console.log('[TTApplication] タッチデバイス検出 → Deskパネルをzenモードに設定');
            this.SetPanelLayoutByCommand('zen');
        }

        this.SetupEvents();
    }

    public GetPanel(name: string): TTPanel | null {
        return this.Panels.find(p => p.Name === name) || null;
    }

    public Focus(panelName: string, mode: PanelMode, tool: PanelTool): void {
        const panel = this.GetPanel(panelName);
        if (panel) {
            this.ActivePanel = panel;
            // プロパティsetterからFocusが呼ばれた場合の無限ループを防止
            if (panel.Mode !== mode) panel.Mode = mode;
            if (panel.Tool !== tool) panel.Tool = tool;

            this.FocusedTool = { panel: panelName, mode, tool };

            console.log(`Focused: ${panelName} -> ${mode}${tool}`);

            // WebViewのリソース同期
            this.SyncWebViewResources();

            this.NotifyUpdated();
        }
    }

    /*** アクティブなEditorパネルのリソースを、他のWebViewパネルに同期します */
    private SyncWebViewResources(): void {
        const activePanel = this.ActivePanel;
        // アクティブパネルが存在し、かつリソースを持っている場合のみ同期
        if (!activePanel || !activePanel.Editor.Resource) return;

        // アクティブパネル自体がWebViewの場合は、同期元にはならない（Editor -> WebViewの一方向同期が基本）
        // ただし、WebViewで編集機能がある場合は別だが、現状はEditorテキストのプレビューという要件。
        if (activePanel.Mode !== 'Editor' && activePanel.Mode !== 'Table') {
            // Tableモードも簡易エディタを持つ場合があるため、Resourceがあれば対象とする
            // 基本はEditorモードからの同期
            return;
        }

        const sourceResource = activePanel.Editor.Resource;

        this.Panels.forEach(panel => {
            // 自分自身はスキップ
            if (panel === activePanel) return;

            // WebViewモードのパネルに対して同期
            if (panel.Mode === 'WebView') {
                // キーワード（外部URL）が設定されていない場合のみ、Markdownプレビューとして同期
                // ただし、Keywords.WebView が空でも Editor.Text を表示する仕様なので、
                // Resourceをセットすることで TTPanelEditorBehavior が Memoをロードし、Textが更新される。

                if (panel.Editor.Resource !== sourceResource) {
                    console.log(`[SyncWebViewResources] Syncing ${panel.Name} (WebView) to ${sourceResource} (Current: ${panel.Editor.Resource})`);
                    panel.Editor.Resource = sourceResource;
                }
            }
        });
    }

    /**
     * ウィンドウタイトルを設定します
     */
    public SetWindowTitle(title: string): void {
        document.title = title;
    }

    /**
     * 指定したスクリーンへウィンドウを移動します
     */
    public async MoveWindowToScreen(target: string | number): Promise<void> {
        // Window Management API
        // @ts-ignore - getScreenDetails
        if (!window.getScreenDetails) {
            console.warn('Window Management API not supported.');
            return;
        }

        try {
            // @ts-ignore
            const screenDetails = await window.getScreenDetails();
            const screens = screenDetails.screens;
            const count = screens.length;

            if (count > 0) {
                let targetIndex = 0;
                const currentScreen = screenDetails.currentScreen;
                // @ts-ignore
                const currentIndex = screens.indexOf(currentScreen);

                if (target === 'next') {
                    targetIndex = (currentIndex + 1) % count;
                } else if (target === 'prev') {
                    targetIndex = (currentIndex - 1 + count) % count;
                } else {
                    targetIndex = typeof target === 'number' ? target : parseInt(target as string, 10);
                    if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= count) {
                        targetIndex = 0;
                    }
                }

                const targetScreen = screens[targetIndex];
                console.log(`Moving to screen [${targetIndex}]: ${targetScreen.label}`, targetScreen);

                const left = targetScreen.availLeft !== undefined ? targetScreen.availLeft : targetScreen.left;
                const top = targetScreen.availTop !== undefined ? targetScreen.availTop : targetScreen.top;

                window.moveTo(left, top);
            }
        } catch (err) {
            console.error('Error accessing screen details:', err);
        }
    }

    /**
     * ウィンドウ状態を設定します (Normal, Max, Full, next, prev)
     */
    public SetWindowState(val: string): string {
        // const states = ['Normal', 'Max', 'Full']; // Unused
        let nextState = val;

        // next/prev 処理
        if (/^(next|prev)$/i.test(val)) {
            // 現在の状態を簡易的に判定（完全な同期は難しいが、フラグ等で管理すべきかもしれない）
            // ここでは渡されたvalではなく、現在のDOM状態から推測するか、前回の状態を保持する必要がありますが、
            // 引数のvalが 'next' なので、現状の状態を知る術が必要です。
            // 簡易的に現状維持で DefaultStatus.ts 側で状態管理されていることを前提とせず、ここでも管理すべき？
            // DefaultStatus.ts 側で管理された状態(Status)を使うのがModel的ですが、
            // ここはViewメソッドなので「次の状態」を決定するのは呼び出し元が適切かもしれません。
            // しかし、ロジック移動のためここで処理します。

            // 補足: DefaultStatus.ts では Status.GetValue で現在値を取得していました。
            // ここではシンプルに DOM API から推測します。
            // let currentState = 'Normal'; // Unused
            // if (document.fullscreenElement) currentState = 'Full';
            // Max判定は難しいので省略、または保持が必要
            // 今回は引数で現在値をもらう設計変更も手ですが、呼び出し元純粋化のため
            // 呼び出し元が next/prev を解決して渡してくれるのがベストです。
            // ですが DefaultStatus でロジックを持つと View依存が残るので
            // ここでは「具体的な状態(Normal, Max, Full)のみ受け付ける」こととし、
            // next/prev の解決は Status (Model) 側で行うべき... 
            // いえ、ModelはViewの状態を知りません。
            // アプリケーションクラスが自分の状態 `WindowState` プロパティを持つべきです。
        }

        // リファクタリング: next/prev ロジックは呼び出し元(Status)が「現在のStatus値」を元に計算して
        // 具体的な 'Normal', 'Max', 'Full' を渡してくる想定にします。

        const v = nextState.toLowerCase();
        if (v === 'full') {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch((e) => {
                    console.error('Fullscreen request failed:', e);
                });
            }
        } else if (v === 'max') {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch((e) => { console.error('Exit fullscreen failed:', e); });
            }
            try {
                window.moveTo(0, 0);
                window.resizeTo(window.screen.availWidth, window.screen.availHeight);
            } catch (e) {
                console.log('Maximize (resizeTo) blocked or failed:', e);
            }
        } else {
            // Normal
            if (document.fullscreenElement) {
                document.exitFullscreen().catch((e) => { console.error('Exit fullscreen failed:', e); });
            }
            try {
                const defaultWidth = 1200;
                const defaultHeight = 800;
                window.resizeTo(defaultWidth, defaultHeight);
                const left = (window.screen.availWidth - defaultWidth) / 2;
                const top = (window.screen.availHeight - defaultHeight) / 2;
                window.moveTo(left, top);
            } catch (e) {
                console.log('Restore (resizeTo) blocked or failed:', e);
            }
        }
        return nextState; // 適用された状態を返す
    }

    private OnPanelUpdated(panel: TTPanel): void {
        if (this.ActivePanel === panel) {
            if (this.FocusedTool) {
                if (this.FocusedTool.mode !== panel.Mode || this.FocusedTool.tool !== panel.Tool) {
                    this.FocusedTool = {
                        panel: panel.Name,
                        mode: panel.Mode,
                        tool: panel.Tool
                    };
                }
            }

            // アクティブパネルの更新時に同期を実行
            this.SyncWebViewResources();

            this.NotifyUpdated();
        }
    }

    private SetupEvents(): void {
        window.addEventListener('keydown', (e) => this.HandleKeyDown(e), true);
        window.addEventListener('keyup', (e) => this.HandleKeyUp(e), true);
        // ブラウザデフォルトのコンテキストメニューを抑制
        window.addEventListener('contextmenu', (e) => e.preventDefault(), true);

        // 段112: ブラウザを閉じる前に IsDirty なメモを即時保存
        window.addEventListener('beforeunload', (_e) => {
            this._flushDirtyMemosSync();
        });
    }

    // beforeunload 用の同期的フラッシュ（sendBeacon を使用）
    private _flushDirtyMemosSync(): void {
        try {
            const models = TTModels.Instance;
            if (!models?.Memos) return;
            const memos = models.Memos.GetItems();
            for (const item of memos) {
                const memo = item as any;
                if (memo.IsDirty && memo.ID && memo.Content !== undefined) {
                    // sendBeacon はブラウザ終了時でも送信が保証される
                    const payload = JSON.stringify({
                        file_id: memo.ID,
                        title: memo.Name ?? memo.ID,
                        file_type: 'md',
                        category: 'Memo',
                        content: memo.Content,
                        created_at: memo.CreatedAt ?? undefined,
                    });
                    navigator.sendBeacon('/api/bq/files', new Blob([payload], { type: 'application/json' }));
                }
            }
        } catch (e) {
            // beforeunload 内のエラーは無視
        }
    }

    private HandleKeyDown(e: KeyboardEvent): void {
        this.LastActionID = '';

        this._currentModifiers.clear();
        if (e.ctrlKey) this._currentModifiers.add('Control');
        if (e.shiftKey) this._currentModifiers.add('Shift');
        if (e.altKey) this._currentModifiers.add('Alt');
        if (e.metaKey) this._currentModifiers.add('Meta');

        const key = e.key;

        if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
            return;
        }

        const mods = Array.from(this._currentModifiers).join('+');
        this.LastKeyString = mods + (mods ? '+' : '') + key.toUpperCase();

        console.log(`KeyDown: ${key} (Mapped: ${key.toUpperCase()}) Mods: ${Array.from(this._currentModifiers).join(',')} LastKeyString: ${this.LastKeyString}`);

        this.NotifyUpdated();

        this.OnKeyDown(e);
    }

    /*** 各種UIイベント（contextに設定） → UIRequestTriggeredAction(context) → Action Call
     * 処理フロー:
     * 1. [初期化] 現在のアプリケーション状態（Panel/Mode/Tool/ExMode）を取得
     * 2. [TTEventマッチング] 登録済みイベントとの照合
     *    - キーマッチング: context.Key と ev.Key の一致確認
     *    - コンテキストマッチング: Panel-Mode-Tool-ExMode の一致確認
     *    - モディファイアマッチング: Ctrl/Shift/Alt/Meta キーの一致確認
     * 3. [アクション実行] マッチしたイベントに紐づくアクションを実行
     * 
     * @param context イベントコンテキスト { Key, Mods, ScreenX, ScreenY, ... }
     * @returns イベントが処理されたか（true: 消費, false: 未処理）
     */
    public UIRequestTriggeredAction(context: any): boolean {
        // ════════════════════════════════════════════════════════════════════════
        // #region 1. 初期化 - アプリケーション状態の取得
        // ════════════════════════════════════════════════════════════════════════
        const events = TTModels.Instance.Events.GetItems() as TTEvent[];
        const activePanel = this.ActivePanel;
        if (!activePanel) return false;

        console.log(`■ UIRequestTriggeredAction:`, context);

        // 現在のアプリケーション状態
        const sPanel = activePanel.Name;    // 例: 'Desk', 'Library'
        const sMode = activePanel.Mode;     // 例: 'Editor', 'Table', 'WebView'
        const sTool = activePanel.Tool;     // 例: 'Main', 'Keyword'
        const sExMode = this.ExMode;        // 例: '', 'ExApp', 'ExFold', 'ExDesk'

        // コンテキストから入力情報を抽出
        // コンテキストから入力情報を抽出
        const contextKey = context.Key?.toUpperCase() || '';  // 例: 'LEFT2', 'ENTER', 'F1'
        const contextMods = new Set<string>(context.Mods || []); // 例: Set{'Control', 'Shift'}
        const keysToTry = [contextKey];
        // #endregion

        // #region 1-A. コンテキストのRequestID解決
        // Keyに特定のキーワードが含まれる場合、RequestID/RequestTagを自動設定
        if (contextKey.includes('PANELTITLE')) {
            context.RequestID = 'PanelTitle';
            context.RequestTag = `[PanelTitle:${sPanel}]`;
        } else if (contextKey.includes('TABLETITLE')) {
            context.RequestID = 'TableTitle';
            context.RequestTag = `[TableTitle:${sPanel}]`;
        } else if (contextKey.includes('STATUSBAR')) {
            context.RequestID = 'StatusBar';
            context.RequestTag = `[StatusBar:${sPanel}]`;
        }
        // #endregion

        console.log(`■ UIRequestTriggeredAction:`, context);

        // ════════════════════════════════════════════════════════════════════════
        // #region 2. TTEventマッチング - 登録済みイベントとの照合
        // ════════════════════════════════════════════════════════════════════════
        // DefaultEvents.ts で登録されたイベント定義を順番にチェック
        // イベント定義例:
        //   AddEvent('*-Editor-Main-*', 'Alt', 'ENTER', 'Request.Editor.InvokeDefault');
        //   → Context='*-Editor-Main-*', Mods='Alt', Key='ENTER', ActionId='Request.Editor.InvokeDefault'
        for (const ev of events) {
            // ────────────────────────────────────────────────────────────────────
            // #region 2-1. キーマッチング
            // ────────────────────────────────────────────────────────────────────
            // イベント定義のキー(ev.Key)と入力キー(contextKey)が一致するか確認
            // 例: ev.Key='ENTER' と contextKey='ENTER' → マッチ
            const evKey = ev.Key.toUpperCase();
            if (!keysToTry.includes(evKey)) continue;
            // #endregion

            // ────────────────────────────────────────────────────────────────────
            // #region 2-2. コンテキストマッチング (Panel-Mode-Tool-ExMode)
            // ────────────────────────────────────────────────────────────────────
            // イベント定義のコンテキスト文字列をパース
            // 形式: "Panel-Mode-Tool-ExMode" (例: "Desk-Editor-Main-*")
            // ワイルドカード '*' は任意の値にマッチ（ただしExModeの'*'は空文字のみにマッチ）
            const parts = ev.Context.split('-');
            if (parts.length !== 4) continue;

            const [cPanel, cMode, cTool, cExMode] = parts;

            // ExModeチェックを先に行い、ExPanelの場合は比較対象を切り替える
            let targetPanel = sPanel;
            let targetMode = sMode;
            let targetTool = sTool;

            if (cExMode === '*') {
                // '*' は「ExModeが無効（空文字）」の場合のみマッチ
                if (sExMode !== '') continue;
            } else if (cExMode === 'ExPanel') {
                // 'ExPanel' は Ex+パネル名（ExDesk, ExLibrary等）のみにマッチ
                const panelNames = ['Library', 'Index', 'Shelf', 'Desk', 'System', 'Chat', 'Log'];
                const isExPanelMode = panelNames.some(name => sExMode === `Ex${name}`);
                if (!isExPanelMode) continue;
                // ExPanel時: 1st/2nd/3rd の比較対象をExCurrentPanel（ExModeが指すパネル）に切り替え
                const exPanel = this.ExCurrentPanel;
                if (!exPanel) continue;
                targetPanel = exPanel.Name;
                targetMode = exPanel.Mode;
                targetTool = exPanel.Tool;
            } else {
                // その他は完全一致
                if (cExMode !== sExMode) continue;
            }

            // パネル名チェック（ExPanel時はExCurrentPanelのプロパティと比較）
            if (cPanel !== '*' && cPanel !== targetPanel) continue;
            // モードチェック
            if (cMode !== '*' && cMode !== targetMode) continue;
            // ツールチェック
            if (cTool !== '*' && cTool !== targetTool) continue;
            // #endregion

            // ────────────────────────────────────────────────────────────────────
            // #region 2-3. モディファイアマッチング (Ctrl/Shift/Alt/Meta)
            // ────────────────────────────────────────────────────────────────────
            // イベント定義の必要モディファイアをパース
            // 例: ev.Mods='Control+Shift' → Set{'Control', 'Shift'}
            const requiredModsSet = new Set(
                (ev.Mods === 'None' || ev.Mods === '' || !ev.Mods)
                    ? []
                    : ev.Mods.split('+').filter(m => m.length > 0)
            );

            // 必要モディファイアセットを作成（ExMode時のactiveModifiersも考慮）
            const effectiveRequired = new Set(requiredModsSet);

            // 実際に押されているモディファイアセットを作成
            // = コンテキストのMods + ExMode開始時に固定されたactiveModifiers
            const effectivePressed = new Set(contextMods);
            this._activeModifiers.forEach(m => effectivePressed.add(m));

            // ExMode用のactiveModifiersを必要セットにも追加して比較
            // （ExMode中は開始時のモディファイアが暗黙的に必要とされる）
            this._activeModifiers.forEach(m => effectiveRequired.add(m));

            // 厳密一致チェック: 必要なモディファイアが過不足なく押されているか
            if (effectiveRequired.size !== effectivePressed.size) continue;

            const allMatch = Array.from(effectiveRequired).every(m => effectivePressed.has(m));
            if (!allMatch) continue;
            // #endregion

            // ────────────────────────────────────────────────────────────────────
            // #region 3. アクション実行
            // ────────────────────────────────────────────────────────────────────
            console.log(`Event Match: ${ev.ID} -> Action: ${ev.Name}`);

            const isExModeContext = cExMode !== '*';

            // アクションを取得して実行
            // ev.Name はアクションID（例: 'Request.Editor.InvokeDefault', 'Editor.Folding.Open'）
            const action = TTModels.Instance.Actions.GetItem(ev.Name);
            if (action) {
                // ステータスバー更新
                this.LastActionID = ev.Name;
                this.NotifyUpdated();

                // Request関連アクションの場合、SourcePanel（ExCurrentPanel）からRequestInfoを解決してcontextに追加
                // ExMode時: SourcePanel=ExCurrentPanel（情報読み取り元）, TargetPanel=ActivePanel（操作実行先）
                // 通常時:   SourcePanel=ActivePanel, TargetPanel=ActivePanel（同一パネル）
                if (ev.Name.startsWith('Request.')) {
                    const sourcePanel = this.ExCurrentPanel ?? activePanel;
                    // GetActiveRequestはRequestIDが生成済みであれば上書きしないようにする
                    const requestInfo = sourcePanel.GetActiveRequest(context);
                    if (requestInfo) {
                        if (!context.RequestID) {
                            context.RequestID = requestInfo.requestId;
                            context.RequestTag = requestInfo.requestTag;
                        }
                        // 座標情報は常に更新（もしあれば）
                        if (requestInfo.clientX !== undefined) context.ClientX = requestInfo.clientX;
                        if (requestInfo.clientY !== undefined) context.ClientY = requestInfo.clientY;
                    }
                    // SourcePanel / TargetPanel をcontextに設定
                    context.SourcePanel = sourcePanel.Name;
                    context.TargetPanel = activePanel.Name;
                }

                // アクション実行（contextを引数として渡す）
                const result = action.Invoke(context);
                return result;
            } else if (isExModeContext) {
                // ExModeコンテキストでアクションが未登録の場合
                // → イベントは消費するがアクションは実行しない
                console.log(`ExMode context matched but action not found: ${ev.Name}`);
                this.LastActionID = ev.Name + ' (unbound)';
                this.NotifyUpdated();
                return true;
            }
            // #endregion
        }
        // #endregion

        // ════════════════════════════════════════════════════════════════════════
        // #region 4. 未マッチ時のExMode処理
        // ════════════════════════════════════════════════════════════════════════
        // ExModeがアクティブな場合、マッチするイベントがなくてもキー入力を消費
        // （ExMode中に未定義のキーがブラウザに渡らないようにする）
        if (sExMode !== '') {
            console.log(`ExMode active (${sExMode}), consuming unhandled event key: ${contextKey}`);
            this.LastActionID = `(${sExMode}: no event)`;
            this.NotifyUpdated();
            return true;
        }
        // #endregion

        return false;
    }


    private OnKeyDown(e: KeyboardEvent): boolean {
        // キーマッピング
        let mappedKey = e.key.toUpperCase();
        if (e.key === 'ArrowLeft') mappedKey = 'LEFT';
        else if (e.key === 'ArrowRight') mappedKey = 'RIGHT';
        else if (e.key === 'ArrowUp') mappedKey = 'UP';
        else if (e.key === 'ArrowDown') mappedKey = 'DOWN';
        else if (e.key === ' ') mappedKey = 'SPACE';
        // F1-F12などはそのまま

        const context = {
            Key: mappedKey,
            Mods: Array.from(this._currentModifiers),
        };

        const processed = this.UIRequestTriggeredAction(context);

        if (processed) {
            e.preventDefault();
            e.stopPropagation();
        }

        return processed;
    }

    private HandleKeyUp(e: KeyboardEvent): void {
        const key = e.key;
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
            this._currentModifiers.delete(key);

            // 条件1: ExMode設定時のmodifierが離された場合
            if (this._activeModifiers.has(key)) {
                this.ExMode = '';
                return;
            }

            // 条件2: 全modifierが押されていない場合（安全策）
            // KeyboardEvent から現在のmodifier状態を直接確認
            const anyModifierPressed = e.ctrlKey || e.shiftKey || e.altKey || e.metaKey;
            if (!anyModifierPressed && this._exMode !== '') {
                console.log('ExMode cleared: no modifiers pressed');
                this.ExMode = '';
            }
        }
    }

    public get ExMode(): string {
        return this._exMode;
    }

    public set ExMode(value: string) {
        if (this._exMode === value) return;

        this._exMode = value;
        this._activeModifiers.clear();

        if (value) {
            this._currentModifiers.forEach(m => this._activeModifiers.add(m));
        }

        this.NotifyUpdated();
    }

    public get ExCurrentPanel(): TTPanel | null {
        const exMode = this.ExMode;
        if (exMode && exMode.startsWith('Ex')) {
            const potentialPanelName = exMode.substring(2);
            // Verify if it is a valid panel
            const panel = this.Panels.find(p => p.Name === potentialPanelName);
            if (panel) {
                return panel;
            }
        }
        return this.ActivePanel;
    }

    public get ContextString(): string {
        const p = this.ActivePanel;
        if (!p) return '';
        const exModeDisplay = this.ExMode ? this.ExMode : '*';
        return `${p.Name}-${p.Mode}-${p.Tool}-${exModeDisplay}`;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Panel Layout
    // ════════════════════════════════════════════════════════════════════════

    public get PanelLayout(): LayoutRatios {
        return { ...this._panelLayout };
    }

    public set PanelLayout(value: LayoutRatios) {
        // 値の変更チェック（簡易的にJSON比較、あるいは各プロパティ比較）
        if (JSON.stringify(this._panelLayout) === JSON.stringify(value)) return;
        this._panelLayout = value;
        this.NotifyUpdated();
    }

    public GetPanelLayoutAsString(): string {
        const layout = this.PanelLayout;

        // 幅比率の計算
        const leftW = layout.LeftVsRest;
        const restW = 1 - leftW;
        const centerW = restW * layout.CenterVsRight;
        const rightW = restW * (1 - layout.CenterVsRight);

        // 高さ比率の計算
        const leftH1 = layout.LibVsIdx;
        const leftH2 = 1 - leftH1;

        const centerH1 = layout.ShelfVsRest;
        const centerRestH = 1 - centerH1;
        const centerH2 = centerRestH * layout.DeskVsSys;
        const centerH3 = centerRestH * (1 - layout.DeskVsSys);

        const rightH1 = layout.ChatVsLog;
        const rightH2 = 1 - rightH1;

        // 文字列フォーマット (小数点2桁)
        const fmt = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");

        return `${fmt(leftW)}:${fmt(centerW)}:${fmt(rightW)},${fmt(leftH1)}:${fmt(leftH2)},${fmt(centerH1)}:${fmt(centerH2)}:${fmt(centerH3)},${fmt(rightH1)}:${fmt(rightH2)}`;
    }

    public SetPanelLayoutByCommand(val: string): void {
        let nextVal = val;
        const layout = this.PanelLayout;

        // コマンド処理
        if (val === 'default' || val === 'reset') {
            // 初期値 (TTApplication.ts の初期値相当)
            nextVal = "0.20:0.60:0.20, 0.30:0.70, 0.20:0.64:0.16, 0.50:0.50";
        } else if (val === 'standard') {
            nextVal = "1:4:0,1:3,1:3:0,1:1";
        } else if (val === 'zen') {
            // Currentパネルのみの表示にする
            const activePanel = this.ActivePanel;
            if (!activePanel) return;

            const name = activePanel.Name;

            // Left Col: Library, Index
            // Center Col: Shelf, Desk, System
            // Right Col: Chat, Log

            if (name === 'Library' || name === 'Index') {
                // Left Only
                layout.LeftVsRest = 1.0;
                layout.CenterVsRight = 0.5; // dummy

                if (name === 'Library') layout.LibVsIdx = 1.0;
                else layout.LibVsIdx = 0.0;
            } else if (name === 'Shelf' || name === 'Desk' || name === 'System') {
                // Center Only
                layout.LeftVsRest = 0.0;
                layout.CenterVsRight = 1.0;

                if (name === 'Shelf') {
                    layout.ShelfVsRest = 1.0;
                    layout.DeskVsSys = 0.5; // dummy
                } else if (name === 'Desk') {
                    layout.ShelfVsRest = 0.0;
                    layout.DeskVsSys = 1.0;
                } else { // System
                    layout.ShelfVsRest = 0.0;
                    layout.DeskVsSys = 0.0;
                }
            } else if (name === 'Chat' || name === 'Log') {
                // Right Only
                layout.LeftVsRest = 0.0;
                layout.CenterVsRight = 0.0;

                if (name === 'Chat') layout.ChatVsLog = 1.0;
                else layout.ChatVsLog = 0.0;
            }

            this.PanelLayout = layout;
            return;
        }

        const parts = nextVal.split(',');
        if (parts.length < 1) return;

        // 幅比率 Apply (Left:Center:Right)
        if (parts[0] && parts[0] !== '*') {
            const ratios = parts[0].split(':').map(s => parseFloat(s));
            if (ratios.length === 3 && ratios.every(n => !isNaN(n) && n >= 0)) {
                const total = ratios[0] + ratios[1] + ratios[2];
                if (total > 0) {
                    layout.LeftVsRest = ratios[0] / total;
                    const rest = ratios[1] + ratios[2];
                    if (rest > 0) {
                        layout.CenterVsRight = ratios[1] / rest;
                    } else {
                        layout.CenterVsRight = 0.5; // default fallback if rest is mostly 0
                    }
                }
            }
        }

        // 高さ比率 Apply (LeftUp:LeftDown)
        if (parts[1] && parts[1] !== '*') {
            const ratios = parts[1].split(':').map(s => parseFloat(s));
            if (ratios.length >= 2 && ratios.every(n => !isNaN(n) && n >= 0)) {
                const total = ratios[0] + ratios[1];
                if (total > 0) {
                    layout.LibVsIdx = ratios[0] / total;
                }
            }
        }

        // 高さ比率 Apply (CenterUp:CenterMid:CenterDown -> Shelf:Desk:Sys)
        if (parts[2] && parts[2] !== '*') {
            const ratios = parts[2].split(':').map(s => parseFloat(s));
            if (ratios.length === 3 && ratios.every(n => !isNaN(n) && n >= 0)) {
                const total = ratios[0] + ratios[1] + ratios[2];
                if (total > 0) {
                    layout.ShelfVsRest = ratios[0] / total;
                    const rest = ratios[1] + ratios[2];
                    if (rest > 0) {
                        layout.DeskVsSys = ratios[1] / rest;
                    } else {
                        layout.DeskVsSys = 0.5;
                    }
                }
            }
        }

        // 高さ比率 Apply (RightUp:RightDown)
        if (parts[3] && parts[3] !== '*') {
            const ratios = parts[3].split(':').map(s => parseFloat(s));
            if (ratios.length >= 2 && ratios.every(n => !isNaN(n) && n >= 0)) {
                const total = ratios[0] + ratios[1];
                if (total > 0) {
                    layout.ChatVsLog = ratios[0] / total;
                }
            }
        }

        this.PanelLayout = layout;
    }

    // ════════════════════════════════════════════════════════════════════════
    // VoiceInput (音声入力 - Web Speech API)
    // ════════════════════════════════════════════════════════════════════════

    private _voiceInput: boolean = false;
    private _recognition: any = null;

    public get VoiceInput(): boolean {
        return this._voiceInput;
    }

    public set VoiceInput(value: boolean) {
        if (this._voiceInput === value) return;
        this._voiceInput = value;
        console.log(`VoiceInput: ${value ? 'ON' : 'OFF'}`);

        if (value) {
            this.startVoiceRecognition();
        } else {
            this.stopVoiceRecognition();
        }

        this.NotifyUpdated();
    }

    /**
     * 音声認識を開始する
     */
    private startVoiceRecognition(): void {
        // ブラウザ対応チェック
        const SpeechRecognitionClass = (window as any).SpeechRecognition
            || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognitionClass) {
            console.error('[VoiceInput] Web Speech API がこのブラウザでサポートされていません');
            this._voiceInput = false;
            this.NotifyUpdated();
            return;
        }

        // 既存のインスタンスがあれば停止
        this.stopVoiceRecognition();

        const recognition = new SpeechRecognitionClass();
        recognition.lang = 'ja-JP';
        recognition.continuous = true;       // 連続認識
        recognition.interimResults = true;   // 認識途中の結果も取得

        recognition.onresult = (event: any) => {
            // 最新の認識結果を処理
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    // 確定した認識結果をエディタに挿入
                    const transcript = result[0].transcript;
                    console.log(`[VoiceInput] 認識確定: "${transcript}"`);
                    this.insertTextToActiveEditor(transcript);
                }
            }
        };

        recognition.onerror = (event: any) => {
            console.error(`[VoiceInput] エラー: ${event.error}`);
            // 'no-speech' や 'aborted' は自動再起動で対処
            if (event.error === 'no-speech' || event.error === 'aborted') {
                // VoiceInput が ON のままなら再起動
                if (this._voiceInput) {
                    console.log('[VoiceInput] 再起動中...');
                    setTimeout(() => {
                        if (this._voiceInput && this._recognition) {
                            try { this._recognition.start(); } catch (_e) { /* 無視 */ }
                        }
                    }, 500);
                }
            } else if (event.error === 'not-allowed') {
                // マイク許可が拒否された場合
                console.error('[VoiceInput] マイクへのアクセスが拒否されました');
                this._voiceInput = false;
                this.NotifyUpdated();
            }
        };

        recognition.onend = () => {
            console.log('[VoiceInput] 認識セッション終了');
            // VoiceInput が ON のままなら自動再起動（ブラウザが自動停止した場合）
            if (this._voiceInput) {
                console.log('[VoiceInput] 自動再起動...');
                setTimeout(() => {
                    if (this._voiceInput && this._recognition) {
                        try { this._recognition.start(); } catch (_e) { /* 無視 */ }
                    }
                }, 300);
            }
        };

        this._recognition = recognition;

        try {
            recognition.start();
            console.log('[VoiceInput] 音声認識を開始しました');
        } catch (e) {
            console.error('[VoiceInput] 音声認識の開始に失敗:', e);
            this._voiceInput = false;
            this.NotifyUpdated();
        }
    }

    /**
     * 音声認識を停止する
     */
    private stopVoiceRecognition(): void {
        if (this._recognition) {
            try {
                this._recognition.onend = null;  // 自動再起動を防止
                this._recognition.onerror = null;
                this._recognition.onresult = null;
                this._recognition.stop();
            } catch (_e) { /* 無視 */ }
            this._recognition = null;
            console.log('[VoiceInput] 音声認識を停止しました');
        }
    }

    /**
     * アクティブパネルのエディタにテキストを挿入する
     */
    private insertTextToActiveEditor(text: string): void {
        const panel = this.ActivePanel;
        if (!panel) {
            console.warn('[VoiceInput] アクティブパネルがありません');
            return;
        }

        const editor = panel.Editor.Handle?.getEditor();
        if (!editor) {
            console.warn('[VoiceInput] エディタハンドルがありません');
            return;
        }

        // カーソル位置にテキストを挿入（Monaco Editor の type コマンド）
        editor.trigger('voiceInput', 'type', { text: text });
        console.log(`[VoiceInput] テキスト挿入完了: "${text}"`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ColorMode (カラーモード)
    // ════════════════════════════════════════════════════════════════════════

    private _colorMode: string = 'DefaultOriginal';

    public get ColorMode(): string {
        return this._colorMode;
    }

    public set ColorMode(value: string) {
        if (this._colorMode === value) return;

        // 有効なカラーモードかチェック
        const validModes = ['DefaultDark', 'DefaultOriginal'];
        if (!validModes.includes(value)) {
            console.warn(`Invalid color mode: ${value}`);
            return;
        }

        this._colorMode = value;
        this.ApplyColorMode(value);
        this.NotifyUpdated();
    }

    private ApplyColorMode(modeName: string): void {
        console.log(`Applying color mode: ${modeName}`);

        // CSS変数として適用
        const root = document.documentElement;

        if (modeName === 'DefaultOriginal') {
            // ラベンダー系ライトテーマ (Style.xaml)
            root.style.setProperty('--tt-base-color', '#E6E6FA');
            root.style.setProperty('--tt-title-bg', '#6A5ACD');
            root.style.setProperty('--tt-title-fg', '#FFFFFF');
            root.style.setProperty('--tt-editor-bg', '#FFFAF5');
            root.style.setProperty('--tt-editor-fg', '#483D8B');
            root.style.setProperty('--tt-keyword-bg', '#FFF8F0');
            root.style.setProperty('--tt-border-color', '#B0B0D8');
            root.style.setProperty('--tt-column-header-bg', '#7B68EE');
            root.style.setProperty('--tt-column-header-fg', '#FFFFFF');
            root.style.setProperty('--tt-list-item-bg', '#EAEAFF');
            root.style.setProperty('--tt-list-item-selected', '#C6C6FA');
            root.style.setProperty('--tt-splitter-bg', '#B0B0D8');
            root.style.setProperty('--tt-splitter-hover', '#6A5ACD');
        } else {
            // DefaultDark
            root.style.setProperty('--tt-base-color', '#2b2b2b');
            root.style.setProperty('--tt-title-bg', '#3c3c3c');
            root.style.setProperty('--tt-title-fg', '#cccccc');
            root.style.setProperty('--tt-editor-bg', '#1e1e1e');
            root.style.setProperty('--tt-editor-fg', '#d4d4d4');
            root.style.setProperty('--tt-keyword-bg', '#2b2b2b');
            root.style.setProperty('--tt-border-color', '#444444');
            root.style.setProperty('--tt-column-header-bg', '#252526');
            root.style.setProperty('--tt-column-header-fg', '#aaaaaa');
            root.style.setProperty('--tt-list-item-bg', '#2b2b2b');
            root.style.setProperty('--tt-list-item-selected', '#264f78');
            root.style.setProperty('--tt-splitter-bg', '#555555');
            root.style.setProperty('--tt-splitter-hover', '#007acc');
        }

        // Monaco Editorテーマも切り替え
        root.dataset.colorMode = modeName;
    }

    /**
     * コンテキストメニューを表示します
     */
    public ShowContextMenu(items: ContextMenuItem[], x: number, y: number): void {
        this.ContextMenu = { items, x, y };
        this.NotifyUpdated();
    }

    /**
     * コンテキストメニューを非表示にします
     */
    public HideContextMenu(): void {
        this.ContextMenu = null;
        this.NotifyUpdated();
    }

    /**
     * コマンドパレットを表示します
     */
    public ShowCommandPalette(items: CommandPaletteItem[], placeholder: string = 'コマンドを入力...'): void {
        this.CommandPalette = {
            visible: true,
            items,
            placeholder
        };
        this.NotifyUpdated();
    }

    /**
     * コマンドパレットを非表示にします
     */
    public HideCommandPalette(): void {
        if (this.CommandPalette) {
            this.CommandPalette = { ...this.CommandPalette, visible: false }; // アニメーション等のためにvisible制御のみ先にやるのもありだが、一旦nullにするかfalseか
            // React側で null 判定しているので、ここでは null に戻しても良いが、
            // 状態遷移を考えると visible: false にして、React側で消えた後にクリーンアップする手もある。
            // 今回はシンプルに null に戻す。
            this.CommandPalette = null;
            this.NotifyUpdated();
        }
    }

    // =========================================================
    // Phase 12 段265: AI Facilitator 起動ループ
    // =========================================================

    private _facilitatorInterval: number | null = null;

    /** Facilitatorを起動する（アプリ起動時またはFacilitator有効化時に呼ぶ） */
    public async startFacilitator(models: TTModels): Promise<void> {
        // 起動時に記念日リコールを実行
        await this._runAnniversaryRecall(models);

        // 既存のインターバルをクリア
        if (this._facilitatorInterval !== null) {
            window.clearInterval(this._facilitatorInterval);
        }

        // 設定から間隔を取得（デフォルト30分）
        const intervalMin = parseInt(
            models.Status.GetValue('AI.Facilitator.RecallInterval') || '30', 10
        );

        this._facilitatorInterval = window.setInterval(async () => {
            const enabled = models.Status.GetValue('AI.Facilitator.Enabled');
            if (enabled !== 'true') return;

            const relatedEnabled = models.Status.GetValue('AI.Facilitator.RelatedRecall');
            if (relatedEnabled === 'true') {
                await this._runRelatedRecall(models);
            }
        }, intervalMin * 60 * 1000);

        console.log(`[Facilitator] 起動 (間隔: ${intervalMin}分)`);
    }

    /** Facilitatorを停止する */
    public stopFacilitator(): void {
        if (this._facilitatorInterval !== null) {
            window.clearInterval(this._facilitatorInterval);
            this._facilitatorInterval = null;
        }
        console.log('[Facilitator] 停止');
    }

    /** 記念日リコールを実行してSuggestionsに追加する */
    public async _runAnniversaryRecall(models: TTModels): Promise<void> {
        if (models.Status.GetValue('AI.Facilitator.AnniversaryRecall') !== 'true') return;

        const engine = new AnniversaryRecallEngine();
        const memos = models.Memos.GetItems() as TTMemo[];
        const matches = await engine.findAnniversaryMemos(memos);

        for (const match of matches.slice(0, 3)) {
            const suggestion = new TTSuggestion();
            suggestion.Type = 'anniversary';
            suggestion.Title = `${match.period}のメモ: ${match.memo.Name}`;
            suggestion.Body = `${match.period}にこのメモを書きました。振り返ってみませんか？`;
            suggestion.RelatedMemoIds = match.memo.ID;
            suggestion.Priority = match.priority;
            models.Suggestions.AddItem(suggestion);
        }

        if (matches.length > 0) {
            console.log(`[Facilitator] 記念日リコール: ${Math.min(matches.length, 3)}件追加`);
        }
    }

    /** 関連メモリコールを実行してSuggestionsに追加する */
    public async _runRelatedRecall(models: TTModels): Promise<void> {
        const activePanel = this.ActivePanel;
        if (!activePanel || activePanel.Mode !== 'Editor') return;

        const memoId = models.Status.GetValue(`${activePanel.Name}.Editor.Resource`) || '';
        if (!memoId) return;

        const memo = models.Memos.GetItem(memoId) as TTMemo | undefined;
        if (!memo || !memo.Content) return;

        const engine = new RelatedRecallEngine();
        const suggestions = await engine.findRelatedMemos(
            memo.Content,
            models.Memos.GetItems() as TTMemo[],
            memoId
        );

        for (const s of suggestions) {
            const suggestion = new TTSuggestion();
            suggestion.Type = 'related';
            suggestion.Title = s.title;
            suggestion.Body = s.body;
            suggestion.RelatedMemoIds = s.relatedMemoIds.join(',');
            suggestion.Priority = s.priority;
            models.Suggestions.AddItem(suggestion);
        }

        if (suggestions.length > 0) {
            console.log(`[Facilitator] 関連メモリコール: ${suggestions.length}件追加`);
        }
    }
}
