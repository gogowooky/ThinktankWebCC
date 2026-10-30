import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import './monacoSetup';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { MediaProps } from './types';
import { TTShortcutManager } from '../../../views/TTShortcutManager';
import { TTUIStateManager } from '../../../views/TTUIStateManager';
import { TTApplication } from '../../../views/TTApplication';
import { getHeadingAttributes } from '../../../utils/markdownHeadings';
import { extractTitleLine } from '../../../utils/thinkFormat';
import { FOLDING_HEADER_BG_CLASS, colorStyleToCss, foldingHeaderStyleCss, injectInlineStyleCss, isUnset, linkStyleCss, styleClass } from '../../../utils/defaultColor';
import type { ColorStyle, MarkKind, MarkStyle } from '../../../utils/defaultColor';
import { externalDropDragKind, extractLinkDrop, resolveLinkDrop } from '../WorkingMenuRibbon';
import { getAppFontScale, FONT_SCALE_EVENT } from '../../../utils/appZoom';
import { registerPaneFlush, unregisterPaneFlush } from '../../../utils/unsavedGuard';
import { reportSaveError } from '../../../utils/saveError';
import { parseRawThinkText, rawTextMatchesThink } from '../../../utils/rawThinkText';
import { jumpPosition, takeEditorOpen } from '../../../utils/editorJump';
import './TextEditorMedia.css';
import { getEditorValue, reconstructContent } from './texteditor/editorContent';
import { getCollapsedStartLines, getClosedHeadings } from './texteditor/editorFolding';
import { registerMarkdownFolding, registerHexColorProvider } from './texteditor/editorProviders';
import { applyEditorDecorations } from './texteditor/editorDecorations';
import { clientPointToPosition } from '../../../utils/editorDropPosition';
import { isLocalPathTarget } from '../../../utils/linkFormat';
/**
 * TextEditorMedia.tsx
 * Monaco Editor によるテキスト編集メディア。
 *
 * - Ctrl+S: onSave を呼んで保存
 * - 変更があるとき onDirtyChange(true) → Ribbon に ● を表示
 * - think.ID が変わると editor を再マウント（key prop で制御）
 */

/** Monaco の等倍時 fontSize / lineHeight（表示文字サイズ倍率の基準値）。 */
const EDITOR_BASE_FONT_SIZE = 13;
const EDITOR_BASE_LINE_HEIGHT = 20;

export interface TextEditorMediaRef {
  focus: () => void;
  /**
   * WorkingPanel.DroppedFile.ID:Insert 用: 生のMonacoエディタインスタンスを取得する。
   * 呼び出し側は TTShortcutManager.setActiveEditor() でこれを対象に設定してから
   * 'WorkingPanel.DroppedFile.ID:Insert' Action を実行すること。
   */
  getEditor: () => any;
}

interface Toast { msg: string; type: 'success' | 'error'; }

export const TextEditorMedia = forwardRef<TextEditorMediaRef, MediaProps>(function TextEditorMedia({ areaId, think, onSave, onDirtyChange, onTitleChange, editorSettings, refreshKey, autoSaveRef, rawYaml }: MediaProps, ref) {
  // YAML表示の有無は WorkingArea が key で作り直すため、インスタンスごとに固定
  const rawYamlRef = useRef(rawYaml ?? false);
  const savedRef = useRef(think ? getEditorValue(think, rawYamlRef.current) : '');
  const firstLineRef = useRef(think ? extractTitleLine(think.Content) : '');
  const editorRef = useRef<any>(null);
  const disposablesRef = useRef<any[]>([]);
  const headingStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRestoringRef = useRef(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkRef = useRef(think);
  const onSaveRef = useRef(onSave);
  const areaIdRef = useRef(areaId);

  useEffect(() => {
    thinkRef.current = think;
    onSaveRef.current = onSave;
    areaIdRef.current = areaId;
  }, [think, onSave, areaId]);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    getEditor: () => editorRef.current,
  }));
  const [isDragOver, setIsDragOver] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 表示文字サイズ（拡大表示 / 縮小表示）。Monaco は CSS を継承しないため
  // fontSize / lineHeight にこの倍率を掛けて渡す。
  const [fontScale, setFontScale] = useState(getAppFontScale);
  useEffect(() => {
    const onScale = (e: Event) => setFontScale((e as CustomEvent<number>).detail);
    window.addEventListener(FONT_SCALE_EVENT, onScale);
    return () => window.removeEventListener(FONT_SCALE_EVENT, onScale);
  }, []);
  useEffect(() => {
    editorRef.current?.updateOptions({
      fontSize: Math.round(EDITOR_BASE_FONT_SIZE * fontScale),
      lineHeight: Math.round(EDITOR_BASE_LINE_HEIGHT * fontScale),
    });
  }, [fontScale]);

  useEffect(() => {
    savedRef.current = think ? getEditorValue(think, rawYamlRef.current) : '';
    firstLineRef.current = think ? extractTitleLine(think.Content) : '';
    onDirtyChange(false);
  }, [think?.ID, onDirtyChange]);

  // 外部からの think.Content リアルタイム更新の反映
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !think) return;

    const nextVal = getEditorValue(think, rawYamlRef.current);

    // 現在エディタに未保存の変更がない場合のみ外部の変更を反映
    const currentEditorVal = editor.getValue();
    // YAML表示では、保存直後に整形し直した YAML で上書きすると入力中のカーソルが飛ぶので、
    // 内容が同じ（書式だけの違い）なら反映しない
    if (rawYamlRef.current && rawTextMatchesThink(currentEditorVal, think)) return;
    if (currentEditorVal !== nextVal && currentEditorVal === savedRef.current) {
      editor.setValue(nextVal);
      savedRef.current = nextVal;
    }
  }, [think, think?.Content]);

  const showToast = useCallback((msg: string, type: Toast['type']) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    // WorkingPanel.DroppedFile.ID:Insert がドロップ位置のPaneからエディタを引けるよう登録する
    if (areaId) TTShortcutManager.instance.registerAreaEditor(areaId, editor);
    registerMarkdownFolding(monaco);
    registerHexColorProvider(monaco);

    disposablesRef.current.forEach(d => d.dispose());
    disposablesRef.current = [];

    const notifyHeadingStatus = () => {
      if (isRestoringRef.current) return;

      if (headingStatusTimerRef.current) {
        clearTimeout(headingStatusTimerRef.current);
      }

      headingStatusTimerRef.current = setTimeout(() => {
        const headings = getHeadingAttributes(editor);
        const pos = editor.getPosition();
        const model = editor.getModel();

        let offsetVal = '0';
        let numberVal = 'None';

        let cursorOffsetStr = '0';
        let textOnCursor = '';

        if (pos && model) {
          const targetOffset = model.getOffsetAt(pos);
          cursorOffsetStr = String(targetOffset);
          const matched = headings.filter(h => h.offset <= targetOffset);
          if (matched.length > 0) {
            const currentHeading = matched[matched.length - 1];
            offsetVal = String(currentHeading.offset);
            numberVal = currentHeading.headingNumber;
          }

          // カーソル下のテキスト（URL, FilePath, Tag）検出
          const lineNumber = pos.lineNumber;
          const column = pos.column;
          const lineContent = model.getLineContent(lineNumber);

          const urlRegex = /https?:\/\/[^\s")]+/g;
          const fileRegex = /([a-zA-Z]:\\|\\\\)[^\s"<>|?*]+/g;
          const tagRegex = /\[([^\]]+)\]/g;

          let match;
          while ((match = urlRegex.exec(lineContent)) !== null) {
            const startCol = match.index + 1;
            const endCol = startCol + match[0].length;
            if (column >= startCol && column <= endCol) {
              textOnCursor = match[0];
              break;
            }
          }

          if (!textOnCursor) {
            while ((match = fileRegex.exec(lineContent)) !== null) {
              const startCol = match.index + 1;
              const endCol = startCol + match[0].length;
              if (column >= startCol && column <= endCol) {
                textOnCursor = match[0];
                break;
              }
            }
          }

          if (!textOnCursor) {
            while ((match = tagRegex.exec(lineContent)) !== null) {
              const startCol = match.index + 1;
              const endCol = startCol + match[0].length;
              if (column >= startCol && column <= endCol) {
                textOnCursor = match[0];
                break;
              }
            }
          }
        }

        const workingPanel = TTApplication.Instance.WorkingPanel;
        let isChanged = false;
        if (workingPanel.TextEditor.CurrentFoldingHeadingOffset !== offsetVal) {
          workingPanel.TextEditor.CurrentFoldingHeadingOffset = offsetVal;
          isChanged = true;
        }
        if (workingPanel.TextEditor.CurrentFoldingHeadingNumber !== numberVal) {
          workingPanel.TextEditor.CurrentFoldingHeadingNumber = numberVal;
          isChanged = true;
        }
        if (workingPanel.TextEditor.CurrentEditorCursorPos !== cursorOffsetStr) {
          workingPanel.TextEditor.CurrentEditorCursorPos = cursorOffsetStr;
          isChanged = true;
        }
        if (workingPanel.TextEditor.CurrentEditorTextOnCursorPos !== textOnCursor) {
          workingPanel.TextEditor.CurrentEditorTextOnCursorPos = textOnCursor;
          isChanged = true;
        }

        if (isChanged) {
          TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentFolding.HeadingOffset');
          TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentFolding.HeadingNumber');
          TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentEditor.CursorPos');
          TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentEditor.TextOnCursorPos');
        }

        // think.Metadata.editor に状態を保存
        if (think && pos && model) {
          const closed = getClosedHeadings(editor);
          const sel = editor.getSelection();
          let selectionData = null;
          if (sel) {
            selectionData = {
              startLineNumber: sel.startLineNumber,
              startColumn: sel.startColumn,
              endLineNumber: sel.endLineNumber,
              endColumn: sel.endColumn,
            };
          }
          if (!think.Metadata || typeof think.Metadata !== 'object') think.Metadata = {};
          think.Metadata.editor = {
            caret: { lineNumber: pos.lineNumber, column: pos.column },
            selection: selectionData,
            closedHeadings: closed,
          };
        }
      }, 150);
    };

    const focusDisposable = editor.onDidFocusEditorText(() => {
      TTShortcutManager.instance.setActiveEditor(editor);
      notifyHeadingStatus();
    });
    disposablesRef.current.push(focusDisposable);

    const blurDisposable = editor.onDidBlurEditorText(() => {
      const currentThink = thinkRef.current;
      if (!currentThink) return;
      const body = editor.getValue();
      const currentSaved = getEditorValue(currentThink, rawYamlRef.current);
      if (body !== currentSaved) {
        const nextContent = reconstructContent(currentThink, body, rawYamlRef.current);
        if (nextContent === null) return;
        onSaveRef.current(nextContent, currentThink.ID)
          .then(() => {
            savedRef.current = body;
          })
          .catch((err: unknown) => {
            reportSaveError('[TextEditorMedia] Blur auto save failed:', err);
          });
      }
    });
    disposablesRef.current.push(blurDisposable);

    if (editor.hasTextFocus()) {
      TTShortcutManager.instance.setActiveEditor(editor);
      notifyHeadingStatus();
    }

    const cursorDisposable = editor.onDidChangeCursorPosition(() => {
      notifyHeadingStatus();
    });
    disposablesRef.current.push(cursorDisposable);

    const contentDisposable = editor.onDidChangeModelContent(() => {
      notifyHeadingStatus();
    });
    disposablesRef.current.push(contentDisposable);

    decorationsCollectionRef.current = editor.createDecorationsCollection();
    foldedDecorationsRef.current = editor.createDecorationsCollection();

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (!think) return;
      const body = editor.getValue();
      const nextContent = reconstructContent(think, body, rawYamlRef.current);
      if (nextContent === null) {
        const parsed = parseRawThinkText(body);
        showToast(`保存できません（${'error' in parsed ? parsed.error : 'YAML'}）`, 'error');
        return;
      }
      savedRef.current = body;
      // 保存失敗時は App.tsx の unhandledrejection ハンドラーが SyncState='error' を出す。
      void onSave(nextContent, think.ID);
    });

    // 状態の復元
    isRestoringRef.current = true;
    const foldingController = editor.getContribution('editor.contrib.folding') as any;

    // [THINK:id] タグで開かれたときの依頼（行き先とフォーカス）。復元より後に読むと
    // 保存済みカーソルに上書きされるので、復元処理の中で保存済みカーソルの代わりに使う。
    // マウント時に一度だけ取り出す（restoreEditorState が複数回呼ばれても行き先は変わらない）。
    const opened = think ? takeEditorOpen(think.ID) : undefined;

    const restoreEditorState = () => {
      const editorState = think?.Metadata?.editor;
      if (!editorState && !opened) {
        isRestoringRef.current = false;
        return;
      }

      // 折畳状態の復元
      if (editorState?.closedHeadings) {
        const closedLines = editorState.closedHeadings
          .split(',')
          .map((s: string) => parseInt(s.trim()))
          .filter((n: number) => !isNaN(n));
        if (closedLines.length > 0) {
          editor.trigger('tt', 'editor.fold', { selectionLines: closedLines.map((line: number) => line - 1) });
        }
      }

      // カーソル・選択範囲の復元。行き先の指定があればそれを優先し、
      // 検索語がどこにも無いときだけ保存済みの位置へ戻す（動かさない）。
      const target = opened?.jump ? jumpPosition(editor, opened.jump) : null;
      if (target) {
        editor.setPosition(target);
        editor.revealPositionInCenter(target);
      } else if (editorState?.caret) {
        editor.setPosition(editorState.caret);
        editor.revealPositionInCenter(editorState.caret);
      }
      if (!target && editorState?.selection) {
        editor.setSelection(editorState.selection);
      }

      // タグで開いたときは、そのまま書き始められるようフォーカスまで持ってくる。
      // カーソルを動かした後に当てるのは、フォーカスが先だと復元中の位置が一瞬見えるため。
      if (opened) editor.focus();

      // 復元完了
      isRestoringRef.current = false;
    };

    // セーフティタイムアウト（何らかの理由で復元イベントが走らなかった場合）
    const safetyTimeout = setTimeout(() => {
      if (isRestoringRef.current) {
        console.warn('[TextEditorMedia] Restoration safety timeout triggered');
        isRestoringRef.current = false;
      }
    }, 1000);
    disposablesRef.current.push({ dispose: () => clearTimeout(safetyTimeout) });

    if (foldingController) {
      const checkAndSubscribe = () => {
        const foldingModel = foldingController.foldingModel;
        if (foldingModel) {
          // 折り畳み状態が変わるたびに、折り畳まれている行の装飾を貼り直す
          const foldedDisposable = foldingModel.onDidChange(() => updateFoldedDecorations());
          disposablesRef.current.push(foldedDisposable);
          updateFoldedDecorations();

          if (foldingModel.regions && foldingModel.regions.length > 0) {
            restoreEditorState();
            return;
          }
          const disposable = foldingModel.onDidChange(() => {
            restoreEditorState();
            disposable.dispose();
          });
          disposablesRef.current.push(disposable);
        } else {
          setTimeout(checkAndSubscribe, 50);
        }
      };
      checkAndSubscribe();
    } else {
      restoreEditorState();
    }

    updateDecorations();
  }, [onSave, think, areaId, showToast]); // updateDecorations は後で依存に追加

  // マウント/アンマウント時のアクティブエディタのクリーンアップ
  useEffect(() => {
    const rawYamlAtMount = rawYamlRef.current;
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // アンマウント時に未保存の内容があれば即時保存
      const editor = editorRef.current;
      const currentThink = thinkRef.current;
      const currentOnSave = onSaveRef.current;
      if (editor && currentThink && currentOnSave) {
        const body = editor.getValue();
        const currentSaved = getEditorValue(currentThink, rawYamlAtMount);
        const nextContent = body !== currentSaved ? reconstructContent(currentThink, body, rawYamlAtMount) : null;
        if (nextContent !== null) {
          currentOnSave(nextContent, currentThink.ID)
            .catch((err: unknown) => {
              reportSaveError('[TextEditorMedia] Unmount auto save failed:', err);
            });
        }
      }

      if (headingStatusTimerRef.current) {
        clearTimeout(headingStatusTimerRef.current);
      }
      disposablesRef.current.forEach(d => d.dispose());
      disposablesRef.current = [];
      if (areaIdRef.current) {
        TTShortcutManager.instance.unregisterAreaEditor(areaIdRef.current, editorRef.current);
      }
      if (TTShortcutManager.instance.activeEditor === editorRef.current) {
        TTShortcutManager.instance.setActiveEditor(null);
        TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentFolding.HeadingOffset');
        TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentFolding.HeadingNumber');
      }
    };
  }, []);

  useEffect(() => {
    // 保留中の編集を即保存する。Promise を返すので呼び出し側は完了を待てる
    // （ビュー切替・ウィンドウ終了・タブ非表示時のフラッシュに使う。D-1）。
    const flush = (): Promise<void> | void => {
      const editor = editorRef.current;
      if (!editor || !think) return;
      const body = editor.getValue();
      const currentSaved = getEditorValue(think, rawYamlRef.current);
      if (body === currentSaved) return; // think.Content と一致 → 保存不要
      const nextContent = reconstructContent(think, body, rawYamlRef.current);
      if (nextContent === null) return;
      return onSave(nextContent, think.ID)
        .then(() => {
          savedRef.current = body;
        })
        .catch((err: unknown) => {
          reportSaveError('[TextEditorMedia] Auto save failed:', err);
        });
    };

    if (autoSaveRef) autoSaveRef.current = flush;
    // ウィンドウ終了時などの一括フラッシュ用レジストリにも登録する
    const guardKey = `${areaId ?? 'pane'}-${think?.ID ?? 'none'}`;
    registerPaneFlush(guardKey, flush);

    return () => {
      if (autoSaveRef) autoSaveRef.current = null;
      unregisterPaneFlush(guardKey);
    };
  }, [autoSaveRef, areaId, think, onSave]);

  // ── 動的スタイルの生成 ───────────────────────────────────────────────────

  useEffect(() => {
    if (!editorSettings) return;

    // 動的テーマの適用
    if (editorRef.current) {
      const monaco = (window as any).monaco;
      if (monaco) {
        monaco.editor.defineTheme('custom-markdown-theme', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: '', foreground: editorSettings.foreground.replace('#', '') }
          ],
          colors: {
            'editor.background': editorSettings.background,
            'editor.selectionBackground': editorSettings.selectionBackground,
            // フォーカスが外れたときの選択色。明示しないと Monaco が
            // editor.selectionBackground の50%を使い、フォーカスの有無で色が変わる
            'editor.inactiveSelectionBackground': editorSettings.selectionBackground,
            'editor.wordHighlightBackground': editorSettings.occurrenceBackground,
            'editor.wordHighlightStrongBackground': editorSettings.occurrenceBackground,
            'editor.selectionHighlightBackground': editorSettings.occurrenceBackground,
          }
        });
        monaco.editor.setTheme('custom-markdown-theme');
      }
    }

    // 見出し用CSSの注入
    // 色・属性は docs/DefaultColor.md 由来の TextEditor.Heading.Style(1..6).* に従う
    let styleEl = document.getElementById('text-editor-custom-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'text-editor-custom-styles';
      document.head.appendChild(styleEl);
    }

    const cssRules = editorSettings.headingStyles.map((style, index) => {
      const decls = colorStyleToCss(style);
      return decls ? `.${styleClass('Heading', index + 1)} { ${decls} }` : '';
    }).filter(Boolean).join('\n');

    styleEl.innerHTML = cssRules;

    // Bullet / Comment 用CSSの注入
    // 色・属性は docs/DefaultColor.md 由来の TextEditor.<種別>.Style(1..N).* に従う
    const markStyleCss = (kind: MarkKind, styles: MarkStyle[]) =>
      styles.map((s, index) => {
        const decls = colorStyleToCss(s.style);
        if (!decls) return '';
        const cls = styleClass(kind, index + 1);
        return `.${cls}, .${cls} * { ${decls} }`;
      }).filter(Boolean).join('\n');

    for (const [elementId, kind, styles] of [
      ['text-editor-comment-styles', 'Comment', editorSettings.commentStyles ?? []],
      ['text-editor-bullet-styles', 'Bullet', editorSettings.bulletStyles ?? []],
    ] as [string, MarkKind, MarkStyle[]][]) {
      let el = document.getElementById(elementId);
      if (!el) {
        el = document.createElement('style');
        el.id = elementId;
        document.head.appendChild(el);
      }
      el.textContent = markStyleCss(kind, styles);
    }

    // URL/Filepath/Tag用のCSSの注入
    let linkStyleEl = document.getElementById('text-editor-link-styles');
    if (!linkStyleEl) {
      linkStyleEl = document.createElement('style');
      linkStyleEl.id = 'text-editor-link-styles';
      document.head.appendChild(linkStyleEl);
    }
    // 色・属性は docs/DefaultColor.md 由来の TextEditor.<種別>.Style.* に従う
    linkStyleEl.textContent = linkStyleCss(editorSettings.linkStyles);

    // インライン書式（**bold** / *italic* / __underline__ / ~~strikethrough~~）用CSSの注入。
    // 色・属性は docs/DefaultColor.md 由来の TextEditor.<書式名>.* に従う。
    // MarkdownMedia と同じスタイルシートを共有するので、どちらのビューでも同じ見た目になる。
    injectInlineStyleCss(editorSettings.inlineStyles);

    // 折り畳まれている行用CSSの注入
    // 色は docs/DefaultColor.md 由来の TextEditor.FoldingHeader.Theme.Color に従う
    let foldingStyleEl = document.getElementById('text-editor-folding-header-styles');
    if (!foldingStyleEl) {
      foldingStyleEl = document.createElement('style');
      foldingStyleEl.id = 'text-editor-folding-header-styles';
      document.head.appendChild(foldingStyleEl);
    }
    foldingStyleEl.textContent = foldingHeaderStyleCss(editorSettings.foldingHeaderStyle);
    // 折り畳みモデルの購読はマウント時のクロージャを掴むため、ミニマップ色は ref 経由で渡す
    foldingHeaderStyleRef.current = editorSettings.foldingHeaderStyle;

    updateDecorations();
    updateFoldedDecorations();

  }, [editorSettings]);

  // ── 折り畳まれている行のデコレーション ──────────────────────────────────
  //
  // 開閉は本文の変更を伴わないため updateDecorations（onDidChangeModelContent 起点）では
  // 追随できない。折り畳みモデルの変更を起点に、別のコレクションとして貼り直す。

  const foldedDecorationsRef = useRef<any>(null);
  const foldingHeaderStyleRef = useRef<ColorStyle | undefined>(undefined);

  const updateFoldedDecorations = useCallback(() => {
    const editor = editorRef.current;
    const collection = foldedDecorationsRef.current;
    if (!editor || !collection) return;

    // Monaco 標準の折り畳みハイライト（選択色由来）は切ってあるので、
    // ミニマップの印も TextEditor.FoldingHeader.Theme の色から出す
    const style = foldingHeaderStyleRef.current;
    const minimapOptions = style && !isUnset(style.Color) ? {
      color: style.Color,
      position: 1 // MinimapPosition.Inline
    } : undefined;

    collection.set(getCollapsedStartLines(editor).map(line => ({
      range: new (window as any).monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: FOLDING_HEADER_BG_CLASS,
        minimap: minimapOptions,
      },
    })));
  }, []);

  // ── 見出しデコレーションの更新 ──────────────────────────────────────────

  const decorationsCollectionRef = useRef<any>(null);

  const updateDecorations = useCallback(() => {
    applyEditorDecorations(editorRef.current, decorationsCollectionRef.current, editorSettings);
  }, [editorSettings]);

  const handleChange = useCallback((value: string | undefined) => {
    const v = value ?? '';
    const isDirty = v !== savedRef.current;
    onDirtyChange(isDirty);
    updateDecorations();
    // どの種別も第一行（frontmatterがあればその title: 値）がタイトルなので、memoと同じくリアルタイム同期する
    // YAML表示では1行目が "---" なので、タイトルは保存時に Content から決め直す
    if (onTitleChange && think && !rawYamlRef.current) {
      const newTitle = extractTitleLine(v);
      if (newTitle !== firstLineRef.current) {
        firstLineRef.current = newTitle;
        onTitleChange(newTitle);
      }
    }

    // デバウンス自動保存 (3秒後に自動保存)
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    if (isDirty && think) {
      autoSaveTimerRef.current = setTimeout(() => {
        const body = v;
        // 入力途中の YAML は壊れていることが多いので、その間は黙って保存を見送る
        const nextContent = reconstructContent(think, body, rawYamlRef.current);
        if (nextContent === null) return;
        onSave(nextContent, think.ID)
          .then(() => {
            savedRef.current = body;
          })
          .catch((err: unknown) => {
            reportSaveError('[TextEditorMedia] Debounce auto save failed:', err);
          });
      }, 3000);
    }
  }, [onDirtyChange, updateDecorations, onTitleChange, think, onSave]);

  // ── URL / パス ドロップ ───────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Thinkドロップ（application/x-thought-id）はここで preventDefault/stopPropagation せず
    // WorkingPanel の body-level ハンドラーへバブリングさせる。そちらで Load先Paneのゴースト
    // オーバーレイ（dropOverlay）を計算・表示しており、ここで止めると出なくなる。
    // ドロップ自体は下の handleDrop 側でこのイベントを直接検出して処理するため、ゴースト表示
    // を優先してここでは外部 URL / パスドラッグだけを処理する。
    const types = e.dataTransfer.types;
    const hasFileOrUri = types.includes('Files') || types.includes('text/uri-list');
    // text/plain は通常の選択文字列D&Dでも付くため、dragover中にURL/パスを読める場合だけ奪う。
    const hasPlainLink = types.includes('text/plain') && !!extractLinkDrop(e);
    if (!hasFileOrUri && !hasPlainLink) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    setIsDragOver(false);

    // Thinkファイルのドロップは、Load/Insertどちらの場合もここでは消費せず
    // WorkingPanel の body-level ハンドラーへバブリングさせる。ドロップ位置（カーソル直下の
    // Pane）の判定とAlt判定を1箇所（WorkingPanel.handleBodyDrop）に一本化することで、
    // このコンポーネント側とのタイミング・判定不一致を避けている。
    if (e.dataTransfer.types.includes('application/x-thought-id')) return;

    // URL / パスでない通常の文字列D&Dは Monaco の既定動作へ渡す。
    const fallback = extractLinkDrop(e);
    if (!fallback) return;
    // DataTransferはイベント終了後（最初のawait後）に読めなくなるブラウザがあるため、
    // Files/Directoryの種別は同期区間で確定させる。
    const dragKind = externalDropDragKind(e, fallback);
    e.preventDefault();
    e.stopPropagation();
    const nativeEvent = e.nativeEvent;

    const editor = editorRef.current;
    if (!editor) return;
    const position = clientPointToPosition(editor, e.clientX, e.clientY) ?? editor.getPosition?.();
    const range = position
      ? { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column }
      : editor.getSelection?.();
    if (!range) return;

    const link = await resolveLinkDrop(e) ?? fallback;
    const actionId = dragKind ? TTShortcutManager.instance.resolveDragAction(dragKind, nativeEvent) : null;
    if (!actionId) {
      editor.focus();
      return;
    }
    TTShortcutManager.instance.setActiveEditor(editor);
    TTShortcutManager.instance.setPendingTextEditorDrop({
      target: link.url,
      title: link.title,
      kind: isLocalPathTarget(link.url) ? 'path' : 'url',
      editor,
      range,
    });
    // Action側がペイロードを同期的にconsumeしてから非同期処理へ入る。
    TTShortcutManager.instance.executeActionDirect(actionId);
    TTShortcutManager.instance.setPendingTextEditorDrop(null);
  }, []);

  if (!think) {
    return (
      <div className="media-empty">
        <span>エリアが未設定です</span>
      </div>
    );
  }

  return (
    <div
      className="text-editor-media"
      onDragOverCapture={handleDragOver}
      onDragLeave={handleDragLeave}
      onDropCapture={handleDrop}
    >
      <Editor
        key={`${think.ID}-${refreshKey ?? 0}`}
        defaultValue={getEditorValue(think, rawYamlRef.current)}
        language={think?.ContentType === 'html' ? 'html' : 'markdown'}
        theme={editorSettings ? "custom-markdown-theme" : "vs-dark"}
        onMount={handleMount}
        onChange={handleChange}
        loading={<div className="text-editor-media__loading">エディタ読み込み中…</div>}
        options={{
          minimap: { enabled: editorSettings?.minimap ?? false },
          fontSize: Math.round(EDITOR_BASE_FONT_SIZE * fontScale),
          lineHeight: Math.round(EDITOR_BASE_LINE_HEIGHT * fontScale),
          lineNumbers: (editorSettings?.lineNumbers ?? true) ? 'on' : 'off',
          wordWrap: (editorSettings?.wordWrap ?? true) ? 'on' : 'off',
          scrollBeyondLastLine: false,
          fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
          padding: { top: 10, bottom: 10 },
          renderLineHighlight: 'line',
          smoothScrolling: true,
          folding: true,
          showFoldingControls: 'always',
          // Monaco 標準の折り畳みハイライト（.folded-background）を切る。
          // その色 editor.foldBackground の既定値は「選択色の30%」で、切らないと
          // TextEditor.Selection.Theme の変更が折り畳み行の色に混ざる。折り畳み行の色は
          // TextEditor.FoldingHeader.Theme だけが決めるようにする。
          foldingHighlight: false,
          unicodeHighlight: {
            ambiguousCharacters: editorSettings?.unicodeHighlight ?? true,
            invisibleCharacters: editorSettings?.unicodeHighlight ?? true,
          },
          bracketPairColorization: {
            enabled: editorSettings?.bracketPairColorization ?? true
          },
          matchBrackets: (editorSettings?.bracketPairColorization ?? true) ? 'always' : 'never',
          occurrencesHighlight: 'singleFile',
        }}
      />

      {/* ドラッグオーバーレイ */}
      {isDragOver && (
        <div className="text-editor-media__drop-overlay">
          <span className="text-editor-media__drop-label">ここにドロップ</span>
        </div>
      )}

      {/* トースト通知 */}
      {toast && (
        <div className={`text-editor-media__toast text-editor-media__toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
});
