import React from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { parseKeywords, findKeywordMatches, generateKeywordStyles } from '../../services/KeywordHighlighter';
import { createRequestHoverProvider, getRequestPatterns, findRequestMatches } from '../../services/RequestLinkProvider';

import { TTApplication } from '../../Views/TTApplication';

// LinkProviderが既に登録されたかどうかのグローバルフラグ
let linkProviderRegistered = false;

interface CodeEditorProps {
    initialValue?: string;
    value?: string; // 制御モード用の value プロパティを追加
    language?: string;
    options?: React.ComponentProps<typeof Editor>['options'];
    style?: React.CSSProperties;
    onChange?: (value: string | undefined, ev: any) => void;
    onCursorChange?: (lineContent: string) => void;
    onBlur?: () => void;
    autoScrollToCurrentLine?: boolean;
    disableFind?: boolean; // 検索・置換ショートカットを無効化
    keywords?: string; // ハイライトするキーワード（カンマ区切りでグループ、スペース区切りで個別）
    keywordColorMode?: string; // キーワードカラーモード（Default/Subtle/None）
}

export interface CodeEditorHandle {
    focus: () => void;
    // Monaco Editor のアクションをトリガーする
    triggerAction: (actionId: string) => void;
    // Monaco Editor のインスタンスを取得
    getEditor: () => Parameters<OnMount>[0] | null;
}

export const CodeEditor = React.memo(React.forwardRef<CodeEditorHandle, CodeEditorProps>(({
    initialValue = '',
    value,
    language = 'javascript',
    options = {},
    style = {},
    onChange,
    onCursorChange,
    onBlur,
    autoScrollToCurrentLine,
    disableFind = false,
    keywords = '',
    keywordColorMode = 'Default'
}, ref) => {
    const editorRef = React.useRef<Parameters<OnMount>[0] | null>(null);
    const decorationsRef = React.useRef<string[]>([]);
    const styleElementRef = React.useRef<HTMLStyleElement | null>(null);

    React.useImperativeHandle(ref, () => ({
        focus: () => {
            if (editorRef.current) {
                editorRef.current.focus();
            }
        },
        triggerAction: (actionId: string) => {
            if (editorRef.current) {
                // Monaco Editor のアクションを実行
                const action = editorRef.current.getAction(actionId);
                if (action) {
                    action.run();
                } else {
                    // Actionで見つからない場合は trigger (Command) を試行
                    // 例: cursorDown, cursorUp などは getAction では取得できない
                    editorRef.current.trigger('keyboard', actionId, null);
                    // console.log(`[CodeEditor] Triggered command: "${actionId}"`);
                }
            }
        },
        getEditor: () => editorRef.current
    }));

    // キーワードハイライトのデコレーション更新
    React.useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const model = editor.getModel();
        if (!model) return;

        // スタイル要素の作成/更新
        if (!styleElementRef.current) {
            styleElementRef.current = document.createElement('style');
            styleElementRef.current.id = 'keyword-highlight-styles';
            document.head.appendChild(styleElementRef.current);
        }
        const requestPatterns = getRequestPatterns();
        let dynamicRequestStyles = '';
        requestPatterns.forEach(pattern => {
            if (pattern.color || pattern.fontWeight) {
                dynamicRequestStyles += `
            .tt-request-link-${pattern.id} {
                ${pattern.color ? `color: ${pattern.color} !important;` : 'color: #6B8CAD;'}
                ${pattern.fontWeight ? `font-weight: ${pattern.fontWeight} !important;` : ''}
                text-decoration: underline;
                cursor: pointer;
            }
            [data-color-mode="DefaultOriginal"] .tt-request-link-${pattern.id} {
                ${pattern.color ? `color: ${pattern.color} !important;` : 'color: #5050A0;'}
            }`;
            }
        });

        styleElementRef.current.textContent = generateKeywordStyles(keywordColorMode) + `
            .tt-request-link {
                color: #6B8CAD;
                text-decoration: underline;
                cursor: pointer;
            }
            /* Light theme - 落ち着いた青紫 */
            [data-color-mode="DefaultOriginal"] .tt-request-link {
                color: #5050A0;
            }
        ` + dynamicRequestStyles;

        // キーワードをパース
        const parsedKeywords = parseKeywords(keywords, keywordColorMode);

        // テキスト内のキーワードを検索
        const text = model.getValue();
        const matches = findKeywordMatches(text, parsedKeywords);

        // Monaco Editorのデコレーションを作成
        const decorations = matches.map(m => ({
            range: new (window as any).monaco.Range(
                m.range.startLineNumber,
                m.range.startColumn,
                m.range.endLineNumber,
                m.range.endColumn
            ),
            options: {
                inlineClassName: m.options.inlineClassName
            }
        }));

        // Request Links Decoration Logic
        // LinkProviderを使わずにDecorationでリンク表示を行う
        const requestMatches = findRequestMatches(text, requestPatterns);

        const requestDecorations = requestMatches.map(m => ({
            range: new (window as any).monaco.Range(
                m.lineNumber,
                m.startColumn,
                m.lineNumber,
                m.endColumn
            ),
            options: {
                inlineClassName: (m.color || m.fontWeight) ? `tt-request-link-${m.requestId}` : 'tt-request-link',
                cursor: 'pointer'
            }
        }));

        // デコレーションを結合
        decorations.push(...requestDecorations);

        // デコレーションを適用
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);


        // クリーンアップ
        return () => {
            if (styleElementRef.current) {
                styleElementRef.current.remove();
                styleElementRef.current = null;
            }
        };
    }, [keywords, keywordColorMode, value]);



    // Theme Management State
    const [activeTheme, setActiveTheme] = React.useState(() => {
        const colorMode = document.documentElement.dataset.colorMode;
        return colorMode === 'DefaultOriginal' ? 'my-light' : 'my-dark';
    });

    React.useEffect(() => {
        // MutationObserverでcolorMode変更を監視してStateを更新
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.attributeName === 'data-color-mode') {
                    const newColorMode = document.documentElement.dataset.colorMode;
                    const newTheme = newColorMode === 'DefaultOriginal' ? 'my-light' : 'my-dark';
                    setActiveTheme(newTheme);
                }
            }
        });
        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, []);

    const handleEditorWillMount: BeforeMount = (monaco) => {
        console.log('[CodeEditor] Initializing Monaco settings (beforeMount)...');

        // カスタムMarkdown言語（tt-markdown）を登録
        // 標準のmarkdownと競合しないように独自の言語IDを使用
        // 既に登録済みかチェックしてから登録（ホットリロード対策）
        if (!monaco.languages.getLanguages().some(l => l.id === 'tt-markdown')) {
            monaco.languages.register({ id: 'tt-markdown' });
        }

        // カスタム言語用のトークナイザーを登録
        monaco.languages.setMonarchTokensProvider('tt-markdown', {
            tokenizer: {
                root: [
                    [/^######\s.*$/, 'heading6.md'],
                    [/^#####\s.*$/, 'heading5.md'],
                    [/^####\s.*$/, 'heading4.md'],
                    [/^###\s.*$/, 'heading3.md'],
                    [/^##\s.*$/, 'heading2.md'],
                    [/^#\s.*$/, 'heading1.md'],
                    [/^```\w*$/, { token: 'string.code.md', next: '@codeblock' }],
                    [/`[^`]+`/, 'variable.md'],
                    [/\*\*[^*]+\*\*/, 'strong.md'],
                    [/__[^_]+__/, 'strong.md'],
                    [/\*[^*]+\*/, 'emphasis.md'],
                    [/_[^_]+_/, 'emphasis.md'],
                    [/\[[^\]]+\]\([^)]+\)/, 'string.link.md'],
                    [/https?:\/\/[^\s]+/, 'string.link.md'],
                    [/^\s*[-*+]\s/, 'keyword.md'],
                    [/^\s*\d+\.\s/, 'keyword.md'],
                    [/^>\s.*$/, 'comment.md'],
                    [/^[-*_]{3,}$/, 'keyword.md'],
                    [/./, ''],
                ],
                codeblock: [
                    [/^```$/, { token: 'string.code.md', next: '@pop' }],
                    [/.*/, 'string.code.md'],
                ],
            },
        });

        // Define Themes
        monaco.editor.defineTheme('my-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'heading1.md', foreground: '008000', fontStyle: 'bold underline' },
                { token: 'heading2.md', foreground: 'EEA500', fontStyle: 'bold underline' },
                { token: 'heading3.md', foreground: 'DB7093', fontStyle: 'bold underline' },
                { token: 'heading4.md', foreground: '4682B4', fontStyle: 'bold underline' },
                { token: 'heading5.md', foreground: 'A52A2A', fontStyle: 'bold underline' },
                { token: 'heading6.md', foreground: '008080', fontStyle: 'bold underline' },
                { token: 'strong.md', fontStyle: 'bold' },
                { token: 'emphasis.md', fontStyle: 'italic' },
                { token: 'string.link.md', foreground: '4169E1', fontStyle: 'underline' },
                { token: 'string.code.md', foreground: 'CE9178' },
                { token: 'variable.md', foreground: 'CE9178' },
                { token: 'comment.md', foreground: '6A9955' },
            ],
            colors: {
                'editor.background': '#00000000', // 透明 (親要素の背景色を表示)
                'editorLineNumber.foreground': '#555555',
                'editorGutter.foldingControlForeground': '#555555',
                'editorBracketMatch.background': '#00000000',
                'editorBracketMatch.border': '#00000000',
                'editorBracketHighlight.foreground1': '#D4D4D4',
                'editorBracketHighlight.foreground2': '#D4D4D4',
                'editorBracketHighlight.foreground3': '#D4D4D4',
                'editorBracketHighlight.foreground4': '#D4D4D4',
                'editorBracketHighlight.foreground5': '#D4D4D4',
                'editorBracketHighlight.foreground6': '#D4D4D4',
                'editorBracketHighlight.unexpectedBracket.foreground': '#D4D4D4',
            }
        });

        monaco.editor.defineTheme('my-light', {
            base: 'vs',
            inherit: true,
            rules: [
                { token: 'heading1.md', foreground: '008000', fontStyle: 'bold underline' },
                { token: 'heading2.md', foreground: 'CC8500', fontStyle: 'bold underline' },
                { token: 'heading3.md', foreground: 'DB7093', fontStyle: 'bold underline' },
                { token: 'heading4.md', foreground: '4682B4', fontStyle: 'bold underline' },
                { token: 'heading5.md', foreground: 'A52A2A', fontStyle: 'bold underline' },
                { token: 'heading6.md', foreground: '008080', fontStyle: 'bold underline' },
                { token: 'strong.md', fontStyle: 'bold' },
                { token: 'emphasis.md', fontStyle: 'italic' },
                { token: 'string.link.md', foreground: '4169E1', fontStyle: 'underline' },
                { token: 'string.code.md', foreground: 'A31515' },
                { token: 'variable.md', foreground: 'A31515' },
                { token: 'comment.md', foreground: '008000' },
            ],
            colors: {
                'editor.background': '#FFFFFF', // 白背景
                'editor.foreground': '#483D8B',
                'editorLineNumber.foreground': '#B0B0D8',
                'editorGutter.foldingControlForeground': '#B0B0D8',
                'editor.lineHighlightBackground': '#F5F5FF',
                'editorCursor.foreground': '#483D8B',
                'editorBracketMatch.background': '#00000000',
                'editorBracketMatch.border': '#00000000',
                'editorBracketHighlight.foreground1': '#483D8B',
                'editorBracketHighlight.foreground2': '#483D8B',
                'editorBracketHighlight.foreground3': '#483D8B',
                'editorBracketHighlight.foreground4': '#483D8B',
                'editorBracketHighlight.foreground5': '#483D8B',
                'editorBracketHighlight.foreground6': '#483D8B',
                'editorBracketHighlight.unexpectedBracket.foreground': '#483D8B',
            }
        });

        // Register Custom Folding Provider for tt-markdown
        monaco.languages.registerFoldingRangeProvider('tt-markdown', {
            provideFoldingRanges: (model: any, _context: any, _token: any) => {
                const ranges: any[] = [];
                const lineCount = model.getLineCount();
                const stack: { line: number, level: number }[] = [];

                for (let i = 1; i <= lineCount; i++) {
                    const lineContent = model.getLineContent(i);
                    const match = lineContent.match(/^\s*(#+)/); // インデント対応
                    if (match) {
                        const currentLevel = match[1].length;
                        while (stack.length > 0 && stack[stack.length - 1].level >= currentLevel) {
                            const top = stack.pop();
                            if (top) {
                                ranges.push({
                                    start: top.line,
                                    end: i - 1,
                                    kind: monaco.languages.FoldingRangeKind.Region
                                });
                            }
                        }
                        stack.push({ line: i, level: currentLevel });
                    }
                }
                while (stack.length > 0) {
                    const top = stack.pop();
                    if (top) {
                        ranges.push({
                            start: top.line,
                            end: lineCount,
                            kind: monaco.languages.FoldingRangeKind.Region
                        });
                    }
                }
                return ranges;
            }
        });

        // Register Hover Provider
        if (!linkProviderRegistered) {
            monaco.languages.registerHoverProvider('tt-markdown', createRequestHoverProvider());
            linkProviderRegistered = true;
            console.log('[CodeEditor] HoverProvider registered');
        }
    };

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        console.log('Editor mounted:', editor);

        // Cursor Change Listener
        if (onCursorChange || autoScrollToCurrentLine) {
            editor.onDidChangeCursorPosition((e) => {
                const position = e.position;

                // Auto scroll to current line if enabled
                if (autoScrollToCurrentLine) {
                    // Force scroll to the top of the current line
                    const top = editor.getTopForLineNumber(position.lineNumber);
                    // Use setTimeout to ensure this runs after Monaco's internal scroll
                    setTimeout(() => {
                        editor.setScrollTop(top);
                        // Also scroll horizontal to 0
                        editor.setScrollLeft(0);
                    }, 0);
                }

                const model = editor.getModel();
                if (model && onCursorChange) {
                    const lineContent = model.getLineContent(position.lineNumber);
                    onCursorChange(lineContent);
                }
            });
        }

        // Blur Listener
        if (onBlur) {
            editor.onDidBlurEditorText(() => {
                onBlur();
            });
        }

        // 検索・置換・Go to Line・コマンドパレットのショートカットを無効化（onKeyDownでブロック）
        if (disableFind) {
            editor.onKeyDown((e) => {
                // Ctrl+F (検索) / Ctrl+H (置換) / Ctrl+G (Go to Line)
                if ((e.ctrlKey || e.metaKey) && (e.keyCode === monaco.KeyCode.KeyF || e.keyCode === monaco.KeyCode.KeyH || e.keyCode === monaco.KeyCode.KeyG)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                // F1 (コマンドパレット)
                if (e.keyCode === monaco.KeyCode.F1) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        }

        // マウスイベントハンドラ（TTEvents統合）
        editor.onMouseDown((e) => {
            // --- 1. 基本情報の収集 ---
            // クリックされたボタンと回数からキー名を決定
            let key = '';
            const detail = e.event.detail; // 1, 2, 3...

            if (e.event.leftButton) {
                key = `LEFT${detail}`;

                // 選択範囲内のクリック判定
                // 左クリックかつテキストエリア上の場合
                if (e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT && e.target.position) {
                    const selection = editor.getSelection();
                    // 選択範囲が存在し、空でなく、クリック位置が選択範囲内に含まれる場合
                    if (selection && !selection.isEmpty() && selection.containsPosition(e.target.position)) {
                        key = `Selection_${key}`;
                    }
                }
            } else if (e.event.rightButton) {
                key = `RIGHT${detail}`;
            } else if (e.event.middleButton) {
                key = `MIDDLE${detail}`;
            } else {
                return; // 不明なボタン
            }

            // モディファイアキーの収集
            const mods: string[] = [];
            if (e.event.ctrlKey) mods.push('Control');
            if (e.event.shiftKey) mods.push('Shift');
            if (e.event.altKey) mods.push('Alt');
            if (e.event.metaKey) mods.push('Meta');

            // 座標情報の収集
            const screenX = e.event.browserEvent.screenX;
            const screenY = e.event.browserEvent.screenY;
            const clientX = e.event.browserEvent.clientX;
            const clientY = e.event.browserEvent.clientY;

            // --- 2. リクエストリンクの判定 ---
            // let requestId: string | undefined;
            // let requestTag: string | undefined;

            // --- 3. アクションコンテキストの作成 ---
            const context = {   // ega> Editorのマウスイベント
                Key: key,       // LEFT1, RIGHT1, ...
                Mods: mods,     // ['Control', 'Shift']
                ScreenX: screenX,
                ScreenY: screenY,
                ClientX: clientX,
                ClientY: clientY,
                // RequestID: requestId,
                // RequestTag: requestTag
            };

            // --- 4. 統合イベント処理の呼び出し ---
            const app = TTApplication.Instance;
            const handled = app.UIRequestTriggeredAction(context);

            if (handled) {
                e.event.preventDefault();
                e.event.stopPropagation();
            }
        });

        // Drag & Drop イベントハンドラ（TTEvents統合）
        const domNode = editor.getDomNode();
        if (domNode) {
            domNode.addEventListener('dragover', (e) => {
                e.preventDefault(); // ドロップを受け入れるために必須
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
            });

            domNode.addEventListener('drop', (e) => {
                e.preventDefault();

                // モディファイアキーの収集
                const mods: string[] = [];
                if (e.ctrlKey) mods.push('Control');
                if (e.shiftKey) mods.push('Shift');
                if (e.altKey) mods.push('Alt');
                if (e.metaKey) mods.push('Meta');

                // ドロップされたデータ（ファイルまたはテキスト）
                // FileList等は直接渡せないので配列化、またはDataTransferItemを利用
                let droppedData: any = null;
                if (e.dataTransfer) {
                    // ファイルの場合
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        // FileListはArrayではないため、必要なら変換して渡す
                        // ここでは生のFileListを渡す
                        droppedData = e.dataTransfer.files;
                    }
                    // テキストの場合 (ファイルがない場合)
                    else {
                        droppedData = e.dataTransfer.getData('text/plain');
                    }
                }

                // アクションコンテキストの作成
                const context = {   // ega> Editorのマウスイベント(Drop)
                    Key: 'DROP',
                    Mods: mods,
                    ScreenX: e.screenX,
                    ScreenY: e.screenY,
                    ClientX: e.clientX,
                    ClientY: e.clientY,
                    DroppedData: droppedData
                };

                // 統合イベント処理の呼び出し
                const app = TTApplication.Instance;
                const handled = app.UIRequestTriggeredAction(context);

                if (handled) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        }

        // マウス移動時にホバーポップアップの表示位置を動的に調整
        // ビューポートの上半分にある場合は下に表示、下半分にある場合は上に表示
        editor.onMouseMove((e) => {
            const editorDomNode = editor.getDomNode();
            if (!editorDomNode) return;

            const editorRect = editorDomNode.getBoundingClientRect();
            const mouseY = e.event.posy;
            const editorMidY = editorRect.top + editorRect.height / 2;

            // マウスがエディタの上半分にある場合はポップアップを下に表示
            // 下半分にある場合はポップアップを上に表示
            const shouldShowBelow = mouseY < editorMidY;

            // 現在の設定と異なる場合のみ更新（パフォーマンス最適化）
            editor.updateOptions({
                hover: {
                    above: !shouldShowBelow
                }
            });
        });
    };

    const defaultOptions: React.ComponentProps<typeof Editor>['options'] = {
        minimap: { enabled: true },
        fontSize: 13,
        fontFamily: 'Meiryo',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        folding: true, // フォールディング有効化
        foldingStrategy: 'auto', // カスタムプロバイダを使用するためauto（またはprovider特定の設定があればよいがautoでprovider優先される）
        unicodeHighlight: {
            ambiguousCharacters: false, // 曖昧な文字（全角スペース等）のハイライトを無効化
            invisibleCharacters: false, // 不可視文字のハイライトを無効化
        },
        matchBrackets: 'never', // 括弧のマッチング表示を無効化
        bracketPairColorization: { enabled: false }, // 括弧ペアの色分けを無効化
        guides: {
            bracketPairs: false, // 括弧ペアのガイドラインを無効化
            highlightActiveBracketPair: false, // アクティブな括弧ペアのハイライトを無効化
        },
        hover: {
            above: false, // ホバーポップアップを常にカーソルの下側に表示（上部で切れる問題を回避）
        },
    };

    return (
        <div style={{ width: '100%', height: '100%', ...style }}>
            <Editor
                height="100%"
                language={language}
                defaultValue={initialValue}
                value={value} // value プロパティを渡す
                theme={activeTheme}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorDidMount}
                options={{ ...defaultOptions, ...options }}
                onChange={onChange}
            />
        </div>
    );
}));
