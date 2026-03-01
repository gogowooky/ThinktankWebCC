import React from 'react';
import { CodeEditor, CodeEditorHandle } from '../Editor/Editor';
import './TTPanel.css';

import { TTPanel as TTPanelModel } from '../../Views/TTPanel';
import { TTApplication } from '../../Views/TTApplication';
import { TTModels } from '../../models/TTModels';
import { TTCollection } from '../../models/TTCollection';
import { ModelBrowser } from '../Explorer/ModelBrowser';
import { markdownToHtmlDocument } from '../../utils/markdownToHtml';

interface TTPanelProps {
    model: TTPanelModel;
    className?: string;
    children?: React.ReactNode;
    tableChildren?: React.ReactNode;
    isActive?: boolean;
    onActivate?: () => void;
}

// Keyword Editor options (static)
const KEYWORD_EDITOR_OPTIONS: any = {
    wordWrap: 'off',
    lineNumbers: 'off',
    minimap: { enabled: false },
    lineHeight: 20,
    padding: { top: 0, bottom: 0 },
    scrollbar: {
        vertical: 'hidden',
        horizontal: 'hidden',
        verticalScrollbarSize: 0,
        horizontalScrollbarSize: 0,
        handleMouseWheel: false,
        alwaysConsumeMouseWheel: false
    },
    scrollBeyondLastLine: false,
    overviewRulerBorder: false,
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    folding: false,
    glyphMargin: false,
    renderLineHighlight: 'none',
    fixedOverflowWidgets: true,
};

// Keyword Editor style (static)
const KEYWORD_EDITOR_STYLE: React.CSSProperties = { margin: '0' };

export const TTPanelComponent: React.FC<TTPanelProps> = ({ model, className, children, tableChildren, isActive, onActivate }) => {
    const [mode, setMode] = React.useState(model.Mode);
    const [tool, setTool] = React.useState(model.Tool);
    const [editorText, setEditorText] = React.useState(model.Editor.Text);
    const [resource, setResource] = React.useState(model.Editor.Resource); // リソースID State
    const [wordWrap, setWordWrap] = React.useState(model.Editor.WordWrap);
    const [minimapEnabled, setMinimapEnabled] = React.useState(model.Editor.Minimap);
    const [lineNumbers, setLineNumbers] = React.useState(model.Editor.LineNumbers); // 行番号State
    const [keywordColor, setKeywordColor] = React.useState(model.KeywordColor); // キーワードカラーモード
    const [fontSize, setFontSize] = React.useState(model.FontSize); // フォントサイズ
    const [activeKeyword, setActiveKeyword] = React.useState(model.GetActiveKeyword('Editor')); // ハイライト用Keyword（単数形）
    const [keywords, setKeywords] = React.useState({
        Editor: model.Keywords['Editor'],
        Table: model.Keywords['Table'],
        WebView: model.Keywords['WebView']
    });
    // WebView.Resource に連動するiframe表示用URL（ApplyUrlで更新される）
    const [webViewUrl, setWebViewUrl] = React.useState(model.WebView.Resource);

    // Table.Resource の動的追跡（アクションから Table.Resource を変更された場合に対応）
    const [tableResource, setTableResource] = React.useState(model.Table.Resource);

    // Stateの最新値をRefに同期（イベントリスナー内での参照用）
    const resourceRef = React.useRef(resource);
    resourceRef.current = resource;

    // 編集中フラグ - 自分の編集時はstate更新をスキップ
    const isEditingRef = React.useRef(false); // エディタの編集中状態を管理
    const lastEditorTextRef = React.useRef(model.Editor.Text); // 最後にエディタに設定したテキスト
    const webViewKeywordTextRef = React.useRef(model.Keywords['WebView'] || ''); // WebView Keywordの最新値を保持（blur時のmodel同期用）
    // 前回のKeywordsを保持 - 不必要な再レンダリング防止用
    const lastKeywordsRef = React.useRef({
        Editor: model.Keywords['Editor'],
        Table: model.Keywords['Table'],
        WebView: model.Keywords['WebView']
    });
    // 前回のActiveKeywordを保持
    const lastActiveKeywordRef = React.useRef(model.GetActiveKeyword('Editor'));

    // フォーカス管理用Ref
    const editorKeywordRef = React.useRef<CodeEditorHandle>(null);
    const editorMainRef = React.useRef<CodeEditorHandle>(null);
    const tableKeywordRef = React.useRef<CodeEditorHandle>(null);
    const webviewKeywordRef = React.useRef<CodeEditorHandle>(null);
    const webviewIframeRef = React.useRef<HTMLIFrameElement>(null);
    const panelTitleRef = React.useRef<HTMLDivElement>(null);
    const panelRootRef = React.useRef<HTMLDivElement>(null);


    React.useEffect(() => {
        const update = () => {
            setMode(model.Mode);
            setTool(model.Tool);

            // リソースが変更された場合、強制的に編集中フラグをリセットし、新しいテキストを反映させる
            // Ref経由で最新のresourceと比較
            if (model.Editor.Resource !== resourceRef.current) {
                console.log(`[TTPanel.${model.Name}] リソース変更検知: ${resourceRef.current} -> ${model.Editor.Resource}`);
                isEditingRef.current = false;
                setResource(model.Editor.Resource);
            }

            // EditorTextは外部からの変更時のみ更新（自分の編集時はスキップ）
            if (!isEditingRef.current && model.Editor.Text !== lastEditorTextRef.current) {
                console.log(`[TTPanel.${model.Name}] 外部からのEditorText更新を適用`);
                setEditorText(model.Editor.Text);
                lastEditorTextRef.current = model.Editor.Text;
            }
            setWordWrap(model.Editor.WordWrap);
            setMinimapEnabled(model.Editor.Minimap);
            setLineNumbers(model.Editor.LineNumbers);

            // Keywordsの更新判定 (オブジェクトの再生成による無駄なレンダリングを防止)
            const nextKeywords = {
                Editor: model.Keywords['Editor'],
                Table: model.Keywords['Table'],
                WebView: model.Keywords['WebView']
            };
            const prevKeywords = lastKeywordsRef.current;
            if (nextKeywords.Editor !== prevKeywords.Editor ||
                nextKeywords.Table !== prevKeywords.Table ||
                nextKeywords.WebView !== prevKeywords.WebView) {
                setKeywords(nextKeywords);
                lastKeywordsRef.current = nextKeywords;
            }

            // WebView.Resource の同期（ApplyUrlで更新される）
            if (model.WebView.Resource !== webViewUrl) {
                setWebViewUrl(model.WebView.Resource);
            }

            setKeywordColor(model.KeywordColor);
            setFontSize(model.FontSize);

            // Table.Resource の同期
            if (model.Table.Resource !== tableResource) {
                setTableResource(model.Table.Resource);
            }

            const nextActiveKeyword = model.GetActiveKeyword('Editor');
            if (nextActiveKeyword !== lastActiveKeywordRef.current) {
                setActiveKeyword(nextActiveKeyword);
                lastActiveKeywordRef.current = nextActiveKeyword;
            }
        };
        model.AddOnUpdate('UI_Update', update);
        update(); // 初期同期
        return () => {
            model.RemoveOnUpdate('UI_Update');
        };
    }, [model]);

    // WebView Scroll Command Handler
    React.useEffect(() => {
        const handleCommand = (cmd: string) => {
            if (!webviewIframeRef.current) return;
            const iframeWin = webviewIframeRef.current.contentWindow;
            if (!iframeWin) return;
            const doc = iframeWin.document;
            if (!doc) return;

            // フォーカス可能なリンク要素を取得
            const links = Array.from(doc.querySelectorAll('a[href]')) as HTMLElement[];
            if (links.length === 0) return;

            // 現在のフォーカス位置を取得
            const currentFocus = doc.activeElement as HTMLElement;
            let currentIndex = links.indexOf(currentFocus);

            let nextIndex = -1;

            if (cmd.startsWith('next')) {
                if (currentIndex === -1) nextIndex = 0;
                else nextIndex = Math.min(links.length - 1, currentIndex + 1);
            } else if (cmd.startsWith('prev')) {
                if (currentIndex === -1) nextIndex = links.length - 1;
                else nextIndex = Math.max(0, currentIndex - 1);
            } else if (cmd.startsWith('first')) {
                nextIndex = 0;
            } else if (cmd.startsWith('last')) {
                nextIndex = links.length - 1;
            }

            if (nextIndex !== -1 && nextIndex !== currentIndex) {
                const target = links[nextIndex];
                target.focus();
                // 必要に応じてスクロール（通常focusで移動するが、念のため）
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };

        // ScrollCommandの変更を監視するため、個別のリスナーを追加
        // (UI_Updateは頻度が高いため、ScrollCommand専用にする)
        const scrollSubId = `WebViewScroll:${model.ID}`;
        let lastCommand = model.WebView.ScrollCommand;

        // 初期状態では何もしない（ロード時の不用意なスクロールを防ぐ）

        model.AddOnUpdate(scrollSubId, () => {
            const currentCommand = model.WebView.ScrollCommand;
            if (currentCommand !== lastCommand) {
                handleCommand(currentCommand);
                lastCommand = currentCommand;
            }
        });

        return () => {
            model.RemoveOnUpdate(scrollSubId);
        };
    }, [model]);

    // WebView CurPos Handler (リンク位置ナビゲーション)
    React.useEffect(() => {
        const curPosSubId = `WebViewCurPos:${model.ID}`;
        let lastCurPos = model.WebView.CurPos;

        model.AddOnUpdate(curPosSubId, () => {
            const newCurPos = model.WebView.CurPos;
            if (newCurPos === lastCurPos) return;
            lastCurPos = newCurPos;

            if (!webviewIframeRef.current) return;
            try {
                const iframeDoc = webviewIframeRef.current.contentDocument || webviewIframeRef.current.contentWindow?.document;
                if (!iframeDoc) return;

                const links = Array.from(iframeDoc.querySelectorAll('a[href]')) as HTMLElement[];
                if (links.length === 0) return;

                const currentFocus = iframeDoc.activeElement as HTMLElement;
                const currentIndex = links.indexOf(currentFocus);

                let nextIndex = -1;
                if (newCurPos === 'next') {
                    nextIndex = currentIndex === -1 ? 0 : Math.min(links.length - 1, currentIndex + 1);
                } else if (newCurPos === 'prev') {
                    nextIndex = currentIndex === -1 ? links.length - 1 : Math.max(0, currentIndex - 1);
                } else if (newCurPos === 'first') {
                    nextIndex = 0;
                } else if (newCurPos === 'last') {
                    nextIndex = links.length - 1;
                } else {
                    const parsed = parseInt(newCurPos, 10);
                    if (!isNaN(parsed)) {
                        nextIndex = Math.max(0, Math.min(links.length - 1, parsed));
                    }
                }

                if (nextIndex !== -1) {
                    const target = links[nextIndex];
                    if (nextIndex !== currentIndex) {
                        target.focus();
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    // コマンドを実際のインデックスに正規化（再処理防止のため先に lastCurPos を更新）
                    const indexStr = String(nextIndex);
                    lastCurPos = indexStr;
                    model.WebView.CurPos = indexStr;
                }
            } catch (_e) {
                // クロスオリジンiframeの場合は無視
            }
        });

        return () => {
            model.RemoveOnUpdate(curPosSubId);
        };
    }, [model]);

    // メインエディタのハンドルをモデルに設定
    // エディタがマウントされた後に参照を設定するため、ポーリングで取得を試みる
    React.useEffect(() => {
        let retryCount = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;
        console.log(`[TTPanel.${model.Name}] Editor Handle setup started (Resource: ${resource})`);

        const trySetHandle = () => {
            if (editorMainRef.current) {
                console.log(`[TTPanel.${model.Name}] Editor Handle updated (Resource: ${resource}, Retry: ${retryCount})`);
                model.Editor.Handle = editorMainRef.current;
            } else if (retryCount < 50) { // 最大5秒待機
                retryCount++;
                console.log(`[TTPanel.${model.Name}] Editor Handle not ready, retrying... (Resource: ${resource}, Retry: ${retryCount})`);
                timer = setTimeout(trySetHandle, 100);
            } else {
                console.warn(`[TTPanel.${model.Name}] Failed to get Editor Handle for Resource: ${resource}`);
            }
        };

        trySetHandle();

        return () => {
            if (timer) clearTimeout(timer);
            console.log(`[TTPanel.${model.Name}] Editor Handle cleared (Resource: ${resource})`);
            model.Editor.Handle = null;
        };
    }, [model, resource]); // resource変更時（再マウント時）にも実行

    // KeywordエディタのハンドルをMode/Toolに応じて設定
    React.useEffect(() => {
        let retryCount = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const trySetKeywordHandle = () => {
            let keywordHandle: import('../Editor/Editor').CodeEditorHandle | null = null;
            if (mode === 'Editor') {
                keywordHandle = editorKeywordRef.current;
            } else if (mode === 'Table') {
                keywordHandle = tableKeywordRef.current;
            } else if (mode === 'WebView') {
                keywordHandle = webviewKeywordRef.current;
            }

            if (keywordHandle) {
                model.KeywordEditorHandle = keywordHandle;
            } else if (retryCount < 50) {
                retryCount++;
                timer = setTimeout(trySetKeywordHandle, 100);
            }
        };

        trySetKeywordHandle();

        return () => {
            if (timer) clearTimeout(timer);
            model.KeywordEditorHandle = null;
        };
    }, [model, mode]);


    // プログラムによるフォーカス効果
    React.useEffect(() => {
        if (isActive) {
            // モード切り替え時のレンダリング可視性を確保するためにわずかに遅延
            setTimeout(() => {
                if (mode === 'Editor') {
                    if (tool === 'Keyword') editorKeywordRef.current?.focus();
                    else if (tool === 'Main') editorMainRef.current?.focus();
                } else if (mode === 'Table') {
                    if (tool === 'Keyword') tableKeywordRef.current?.focus();
                } else if (mode === 'WebView') {
                    if (tool === 'Keyword') webviewKeywordRef.current?.focus();
                }
            }, 50);
        }
    }, [isActive, mode, tool]);

    // WebViewのsrcdoc iframeにキーイベント転送を設定
    React.useEffect(() => {
        const iframe = webviewIframeRef.current;
        if (!iframe) return;

        const setupIframeKeyHandler = () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) return;

                const handleKeyDown = (e: KeyboardEvent) => {
                    // 入力欄でのキー入力はフックしない
                    const target = e.target as HTMLElement;
                    if (target && (
                        target.tagName === 'INPUT' ||
                        target.tagName === 'TEXTAREA' ||
                        target.isContentEditable
                    )) {
                        return;
                    }

                    // ESCキーでiframeからフォーカスを外す
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        // WebViewのKeywordエディタにフォーカスを移動
                        webviewKeywordRef.current?.focus();
                        return;
                    }

                    // すべてのキーボードイベントを親ウィンドウに転送
                    // これにより、矢印キー単体などもアプリ側のショートカットとして機能する
                    e.preventDefault();
                    e.stopPropagation();

                    const newEvent = new KeyboardEvent('keydown', {
                        key: e.key,
                        code: e.code,
                        location: e.location,
                        ctrlKey: e.ctrlKey,
                        shiftKey: e.shiftKey,
                        altKey: e.altKey,
                        metaKey: e.metaKey,
                        repeat: e.repeat,
                        isComposing: e.isComposing,
                        bubbles: true,
                        cancelable: true
                    });

                    window.dispatchEvent(newEvent);
                };

                const handleFocusIn = (e: FocusEvent) => {
                    const target = e.target as HTMLElement;
                    if (target && target.tagName === 'A' && (target as HTMLAnchorElement).href) {
                        const href = (target as HTMLAnchorElement).href;
                        // モデルへ同期
                        model.SetKeywordsText('WebView', href, false); // 表示は更新しない
                        model.WebView.CurrentLink = href;
                        // CurPos をリンクのインデックスに更新
                        const links = Array.from(iframeDoc.querySelectorAll('a[href]')) as HTMLElement[];
                        const idx = links.indexOf(target);
                        if (idx !== -1) {
                            model.WebView.CurPos = String(idx);
                        }
                    }
                };

                const handleMouseDown = (e: MouseEvent) => {
                    // 左ダブルクリック(detail=2) または 右クリック(button=2) の場合
                    // あるいは修飾キー付きクリックの場合など

                    // イベントコンテキストの構築
                    let key = '';
                    const detail = e.detail;

                    if (e.button === 0) {
                        key = `LEFT${detail}`;
                    } else if (e.button === 1) {
                        key = `MIDDLE${detail}`;
                    } else if (e.button === 2) {
                        key = `RIGHT${detail}`;
                    } else {
                        return; // その他のボタンは無視
                    }

                    // 選択済み（フォーカス済み）リンク上でのクリックかどうかの判定は厳密には難しいが、
                    // ダブルクリックの場合は直前にフォーカスが当たっているはず。
                    // ContextMenu(RIGHT)の場合はフォーカス移動とほぼ同時かもしれない。

                    const mods: string[] = [];
                    if (e.ctrlKey) mods.push('Control');
                    if (e.shiftKey) mods.push('Shift');
                    if (e.altKey) mods.push('Alt');
                    if (e.metaKey) mods.push('Meta');

                    let requestId: string | undefined;
                    let requestTag: string | undefined;

                    // クリック対象がリンクかチェック
                    let target = e.target as HTMLElement;
                    // バブリングでAタグを探す
                    while (target && target !== iframeDoc.body && target.tagName !== 'A') {
                        target = target.parentElement as HTMLElement;
                    }

                    if (target && target.tagName === 'A') {
                        const aTag = target as HTMLAnchorElement;
                        // カスタムデータ属性(data-request-id / data-request-tag)があれば優先して取得
                        requestId = aTag.dataset.requestId || 'Link';
                        requestTag = aTag.dataset.requestTag;

                        // データタグがなければhrefから直接取得する試み
                        if (!requestTag) {
                            if (aTag.href.startsWith('ttx://')) {
                                // ttx:// リンクの特別処理
                                const parts = aTag.href.replace('ttx://', '').split('/');
                                if (parts.length >= 2) {
                                    requestId = parts[0];
                                    requestTag = parts.slice(1).join('/');
                                } else {
                                    requestTag = aTag.href;
                                }
                            } else {
                                requestTag = aTag.href;
                            }
                        }

                        model.WebView.CurrentLink = requestTag; // 同期もしておく
                    } else {
                        // リンク以外の場所
                        // 選択テキストがあればそれを使うなどの拡張も可能だがまずはスキップ
                    }

                    const context = { // ega> WebViewのマウスイベント
                        Key: key,
                        Mods: mods,
                        ScreenX: e.screenX, // iframe内座標だとずれる可能性があるが、UIRequestTriggeredActionで補正されることを期待、またはiframeのoffsetを加算すべきか？
                        ScreenY: e.screenY, // Event.screenX/Y はモニタ絶対座標なのでそのまま使えるはず
                        ClientX: e.clientX,
                        ClientY: e.clientY,
                        RequestID: requestId,
                        RequestTag: requestTag
                    };

                    const app = TTApplication.Instance;
                    const handled = app.UIRequestTriggeredAction(context);

                    if (handled) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                };

                iframeDoc.addEventListener('keydown', handleKeyDown, true);
                iframeDoc.addEventListener('focusin', handleFocusIn, true);
                iframeDoc.addEventListener('mousedown', handleMouseDown, true);
                iframeDoc.addEventListener('contextmenu', (e) => {
                    // 右クリックイベントが定義されている場合はメニューを抑制
                    // 簡易的に常に抑制
                    e.preventDefault();
                }, true);

                // クリーンアップ関数を返す
                return () => {
                    iframeDoc.removeEventListener('keydown', handleKeyDown, true);
                    iframeDoc.removeEventListener('focusin', handleFocusIn, true);
                    iframeDoc.removeEventListener('mousedown', handleMouseDown, true);
                    // contextmenu...
                };
            } catch (e) {
                // クロスオリジンiframeの場合はアクセスできないので無視
                console.log('Cannot access iframe content (cross-origin)');
            }
        };

        // iframeがロードされた後にセットアップ
        iframe.addEventListener('load', setupIframeKeyHandler);
        // 既にロード済みの場合も実行
        if (iframe.contentDocument?.readyState === 'complete') {
            setupIframeKeyHandler();
        }

        return () => {
            iframe.removeEventListener('load', setupIframeKeyHandler);
        };
    }, [mode, editorText, webViewUrl]);



    const title = model.GetTitle();

    const activateTool = React.useCallback((newTool: 'Main' | 'Keyword', _e: React.MouseEvent) => {
        if (model.Tool !== newTool) {
            model.Tool = newTool;
        }
    }, [model]);

    const handleKeywordChange = React.useCallback((m: 'Editor' | 'Table' | 'WebView', val: string) => {
        if (m === 'WebView') {
            setKeywords(prev => ({ ...prev, WebView: val }));
            webViewKeywordTextRef.current = val;
            // model側にも同期してTTState([Panels].WebView.Keywords)の値を更新
            model.SetKeywordsText('WebView', val);
            return;
        }
        model.SetKeywordsText(m, val);
    }, [model]);

    const handleKeywordCursorChange = React.useCallback((m: 'Editor' | 'Table' | 'WebView', val: string) => {
        // WebViewは文字入力ごとのカーソル同期不要
        if (m === 'WebView') return;
        model.SetActiveKeyword(m, val);
    }, [model]);

    const handleKeywordBlur = React.useCallback((m: 'Editor' | 'Table' | 'WebView') => {
        if (m === 'WebView') {
            // Blur時にReact stateの値をmodelに同期（削除等の操作を反映）
            model.SetKeywordsText('WebView', webViewKeywordTextRef.current);
            return;
        }
        model.FormatKeywords(m);
    }, [model]);

    const handleEditorTextChange = React.useCallback((val: string | undefined) => {
        if (val !== undefined && model.Editor.Text !== val) {
            // 編集中フラグを設定
            isEditingRef.current = true;
            lastEditorTextRef.current = val;
            model.Editor.Text = val;

            // 保存処理完了後に編集中フラグをリセット（デバウンス）
            // モデル側で100msのデバウンスがあるので、それより少し長め
            setTimeout(() => {
                isEditingRef.current = false;
            }, 200);
        }
    }, [model]);

    // メインエディタのオプション (State依存)
    const mainEditorOptions = React.useMemo(() => ({
        wordWrap: wordWrap ? 'on' as const : 'off' as const,
        minimap: { enabled: minimapEnabled },
        folding: true,
        showFoldingControls: 'always' as const,
        lineNumbers: lineNumbers ? 'on' as const : 'off' as const,
        fontSize: fontSize,
    }), [wordWrap, minimapEnabled, lineNumbers, fontSize]);

    // キーワードエディタのオプション (State依存 - フォントサイズ反映)
    const keywordEditorOptions = React.useMemo(() => ({
        ...KEYWORD_EDITOR_OPTIONS,
        fontSize: fontSize,
    }), [fontSize]);

    return (
        <div
            ref={panelRootRef}
            className={`tt-panel ${className || ''} ${isActive ? 'active' : ''}`}
            onMouseDown={onActivate}
            style={{ '--tt-panel-font-size': `${fontSize}px`, touchAction: 'none' } as React.CSSProperties}
        >
            <div
                ref={panelTitleRef}
                className="tt-panel-title"
                onMouseDown={(e) => {
                    // Activate Panel first
                    if (onActivate) onActivate();

                    // Build Event Context
                    let key = '';
                    const detail = e.detail;

                    if (e.button === 0) {
                        key = `PanelTitle_LEFT${detail}`;
                    } else if (e.button === 1) {
                        key = `PanelTitle_MIDDLE${detail}`;
                    } else if (e.button === 2) {
                        key = `PanelTitle_RIGHT${detail}`;
                    } else {
                        return;
                    }

                    const mods: string[] = [];
                    if (e.ctrlKey) mods.push('Control');
                    if (e.shiftKey) mods.push('Shift');
                    if (e.altKey) mods.push('Alt');
                    if (e.metaKey) mods.push('Meta');

                    const context = {
                        Key: key,
                        Mods: mods,
                        ScreenX: e.screenX,
                        ScreenY: e.screenY,
                        ClientX: e.clientX,
                        ClientY: e.clientY
                    };

                    const app = TTApplication.Instance;
                    const handled = app.UIRequestTriggeredAction(context);

                    if (handled) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }}
            >
                {isActive && <span style={{ marginRight: '4px' }}>●</span>}
                {title}
            </div>
            <div className="tt-panel-content mode-editor" style={{ display: mode === 'Editor' ? 'flex' : 'none' }}>
                <div
                    className={`tt-panel-keyword ${tool === 'Keyword' ? 'focused' : ''}`}
                    onMouseDown={(e) => activateTool('Keyword', e)}
                >
                    <CodeEditor
                        ref={editorKeywordRef}
                        value={keywords.Editor}
                        onChange={(val) => handleKeywordChange('Editor', val || '')}
                        onCursorChange={(val) => handleKeywordCursorChange('Editor', val)}
                        onBlur={() => handleKeywordBlur('Editor')}
                        language="text"
                        keywords={activeKeyword}
                        keywordColorMode={keywordColor}
                        options={KEYWORD_EDITOR_OPTIONS}
                        style={KEYWORD_EDITOR_STYLE}
                        autoScrollToCurrentLine={true}
                        disableFind={true}
                    />
                </div>
                <div
                    className={`tt-panel-main ${tool === 'Main' ? 'focused' : ''}`}
                    onMouseDown={(e) => activateTool('Main', e)}
                >
                    {children || <CodeEditor
                        key={resource} // リソースが変わるたびに再マウントしてUndo履歴をクリア
                        ref={editorMainRef}
                        value={editorText}
                        onChange={handleEditorTextChange}
                        language="tt-markdown" // Custom markdown language
                        keywords={activeKeyword}
                        keywordColorMode={keywordColor}
                        options={mainEditorOptions}
                    />}
                </div>
            </div>

            <div className="tt-panel-content mode-table" style={{ display: mode === 'Table' ? 'flex' : 'none' }}>
                <div
                    className={`tt-panel-keyword ${tool === 'Keyword' ? 'focused' : ''}`}
                    onMouseDown={(e) => activateTool('Keyword', e)}
                >
                    <CodeEditor
                        ref={tableKeywordRef}
                        value={keywords.Table}
                        onChange={(val) => handleKeywordChange('Table', val || '')}
                        onBlur={() => handleKeywordBlur('Table')}
                        language="text"
                        options={keywordEditorOptions}
                        style={KEYWORD_EDITOR_STYLE}
                        autoScrollToCurrentLine={true}
                        disableFind={true}
                    />
                </div>
                <div
                    className={`tt-panel-main ${tool === 'Main' ? 'focused' : ''}`}
                    onMouseDown={(e) => activateTool('Main', e)}
                >
                    {/* Table.Resource が設定されている場合、動的に ModelBrowser を生成 */}
                    {tableResource ? (() => {
                        // 特例: Thinktank (Root) 自身を表示する場合
                        if (tableResource === TTModels.Instance.ID || tableResource === 'TTModels') {
                            return <ModelBrowser root={TTModels.Instance} panel={model} filterText={keywords.Table} />;
                        }

                        // まず ID で検索
                        let collection = TTModels.Instance.GetItem(tableResource);
                        // ID で見つからなければクラス名で検索（例: 'TTRequests' → Requests コレクション）
                        if (!collection) {
                            for (const item of TTModels.Instance.GetItems()) {
                                if (item.constructor.name === tableResource) {
                                    collection = item;
                                    break;
                                }
                            }
                        }

                        if (collection && collection instanceof TTCollection) {
                            return <ModelBrowser root={collection} panel={model} filterText={keywords.Table} />;
                        } else {
                            // 解決できないリソース名が入っている場合（例: 'Chat' など）、自動修復する
                            console.warn(`[TTPanel.${model.Name}] Invalid Table.Resource '${tableResource}' found. Resetting to empty.`);
                            // レンダリング中の副作用を避けるため非同期でリセット
                            setTimeout(() => {
                                // 既に変わっている可能性もあるので再チェック（念のため）
                                if (model.Table.Resource === tableResource) {
                                    TTModels.Instance.Status.SetValue(`${model.Name}.Table.Resource`, '');
                                }
                            }, 0);

                            // tableChildren にフォールバック
                            return React.isValidElement(tableChildren)
                                ? React.cloneElement(tableChildren as React.ReactElement<any>, { filterText: keywords.Table })
                                : (tableChildren || <div style={{ padding: '10px' }}>Table View Placeholder</div>);
                        }
                    })() : (
                        // tableChildren に filterText を注入するために cloneElement を使用
                        React.isValidElement(tableChildren)
                            ? React.cloneElement(tableChildren as React.ReactElement<any>, { filterText: keywords.Table })
                            : (tableChildren || <div style={{ padding: '10px' }}>Table View Placeholder</div>)
                    )}
                </div>
            </div>

            {/* WebView モードのコンテンツ */}
            <div className="tt-panel-content mode-webview" style={{ display: mode === 'WebView' ? 'flex' : 'none' }}>
                <div
                    className={`tt-panel-keyword ${tool === 'Keyword' ? 'focused' : ''}`}
                    onMouseDown={(e) => activateTool('Keyword', e)}
                    style={{ display: 'flex', alignItems: 'center' }}
                >
                    <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
                        <CodeEditor
                            ref={webviewKeywordRef}
                            value={keywords.WebView}
                            onChange={(val) => handleKeywordChange('WebView', val || '')}
                            onCursorChange={(val) => handleKeywordCursorChange('WebView', val)}
                            onBlur={() => handleKeywordBlur('WebView')}
                            language="text"
                            options={keywordEditorOptions}
                            style={KEYWORD_EDITOR_STYLE}
                            autoScrollToCurrentLine={true}
                            disableFind={true}
                        />
                    </div>
                    <button
                        onClick={() => window.open(keywords.WebView, '_blank')}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'inherit',
                            padding: '0 8px',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: 0.7,
                            flexShrink: 0
                        }}
                        title="Open in new tab"
                    >
                        ↗
                    </button>
                </div>
                <div
                    className={`tt-panel-main ${tool === 'Main' ? 'focused' : ''}`}
                    onMouseDown={(e) => activateTool('Main', e)}
                >
                    {webViewUrl && webViewUrl.trim() ? (
                        // WebView.Resourceが設定されている場合はiframeで表示
                        <iframe
                            ref={webviewIframeRef}
                            src={encodeURI(webViewUrl)}
                            style={{ width: '100%', height: '100%', border: 'none', zoom: fontSize / 12 }}
                            title="WebView"
                        />
                    ) : (
                        // Keywordが空の場合はEditorのmdをHTML化して表示
                        <iframe
                            ref={webviewIframeRef}
                            srcDoc={markdownToHtmlDocument(editorText, model.Name, fontSize)}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="Markdown Preview"
                        />
                    )}
                </div>
            </div>

        </div>
    );
};

// React.memoでラップして再エクスポート
export const TTPanel = React.memo(TTPanelComponent);
