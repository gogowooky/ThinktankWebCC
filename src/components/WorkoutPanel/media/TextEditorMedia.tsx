/**
 * TextEditorMedia.tsx
 * Monaco Editor によるテキスト編集メディア。
 *
 * - Ctrl+S: onSave を呼んで保存
 * - 変更があるとき onDirtyChange(true) → Ribbon に ● を表示
 * - think.ID が変わると editor を再マウント（key prop で制御）
 */

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import './monacoSetup';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { MediaProps } from './types';
import { StorageManager } from '../../../services/storage/StorageManager';
import { TTShortcutManager } from '../../../views/TTShortcutManager';
import { TTUIStateManager } from '../../../views/TTUIStateManager';
import { TTApplication } from '../../../views/TTApplication';
import { getHeadingAttributes } from '../../../utils/markdownHeadings';
import { splitContent } from '../../../utils/thinkFormat';
import { editorValueIncludesTitleLine, toFoldingRanges } from '../../../utils/markdownSections';
import {
  FOLDING_HEADER_BG_CLASS,
  INLINE_MASK_CHAR, INLINE_STYLE_RULES, colorStyleToCss, foldingHeaderStyleCss,
  injectInlineStyleCss, inlineStyleClass, isUnset, linkStyleClass, linkStyleCss, styleClass,
} from '../../../utils/defaultColor';
import type { ColorStyle, MarkKind, MarkStyle } from '../../../utils/defaultColor';
import { extractLinkDrop, shouldAllowLocalDrop, shouldInsertLocalDrop } from '../WorkoutMenuRibbon';
import { getAppFontScale, FONT_SCALE_EVENT } from '../../../utils/appZoom';
import { registerPaneFlush, unregisterPaneFlush } from '../../../utils/unsavedGuard';
import './TextEditorMedia.css';

/** Monaco の等倍時 fontSize / lineHeight（表示文字サイズ倍率の基準値）。 */
const EDITOR_BASE_FONT_SIZE = 13;
const EDITOR_BASE_LINE_HEIGHT = 20;

export interface TextEditorMediaRef {
  focus: () => void;
  /**
   * WorkoutPanel.DroppedFile.ID:Insert 用: 生のMonacoエディタインスタンスを取得する。
   * 呼び出し側は TTShortcutManager.setActiveEditor() でこれを対象に設定してから
   * 'WorkoutPanel.DroppedFile.ID:Insert' Action を実行すること。
   */
  getEditor: () => any;
}

interface Toast { msg: string; type: 'success' | 'error'; }

function extractBody(content: string): string {
  return splitContent(content).body;
}

/** 折り畳まれている（＝閉じている）範囲の開始行番号。画面に見えているのはこの行だけになる */
function getCollapsedStartLines(editor: any): number[] {
  const regions = (editor.getContribution?.('editor.contrib.folding') as any)
    ?.foldingModel?.regions;
  if (!regions) return [];

  const closed: number[] = [];
  for (let i = 0; i < regions.length; i++) {
    if (regions.isCollapsed(i)) {
      closed.push(regions.getStartLineNumber(i));
    }
  }
  return closed;
}

function getClosedHeadings(editor: any): string {
  return getCollapsedStartLines(editor).join(',');
}

function getEditorValue(think: NonNullable<MediaProps['think']>): string {
  return editorValueIncludesTitleLine(think.ContentType)
    ? (think.Content ?? '')
    : extractBody(think.Content);
}

function reconstructContent(think: NonNullable<MediaProps['think']>, body: string): string {
  if (editorValueIncludesTitleLine(think.ContentType)) return body;
  const firstLine = think.Content.split('\n')[0] ?? '';
  return body ? `${firstLine}\n${body}` : firstLine;
}

/**
 * インデント除去後のテキストが Bullet / Comment のどの行頭記号で始まるかを判定する。
 * 記号は長いものから照合する（">>>" を ">" より優先させるため）。
 * 表示属性が空のスタイルは装飾しても見た目が変わらないので該当なし扱いにする。
 */
function matchMarkStyle(
  kind: MarkKind,
  styles: MarkStyle[],
  textAfterIndent: string,
): { className: string } | null {
  const candidates = styles
    .map((s, index) => ({ ...s, index }))
    .sort((a, b) => b.mark.length - a.mark.length);

  for (const c of candidates) {
    const pattern = c.mark.endsWith(' ') ? c.mark : c.mark + ' ';
    if (!textAfterIndent.startsWith(pattern)) continue;
    return colorStyleToCss(c.style)
      ? { className: styleClass(kind, c.index + 1) }
      : null;
  }
  return null;
}

let isMarkdownFoldingRegistered = false;

function registerMarkdownFolding(monaco: any) {
  if (isMarkdownFoldingRegistered) return;
  isMarkdownFoldingRegistered = true;

  // 範囲の算出は markdownSections に集約している。MarkdownMedia の <details> 折り畳みと
  // think.Metadata.editor.closedHeadings（行番号）を共有するため、ここで独自に数えないこと。
  monaco.languages.registerFoldingRangeProvider('markdown', {
    provideFoldingRanges: (model: any) =>
      toFoldingRanges(model.getValue()).map((range) => ({
        start: range.start,
        end: range.end,
        kind: monaco.languages.FoldingRangeKind.Region,
      })),
  });
}

/** #RGB / #RGBA / #RRGGBB / #RRGGBBAA を Monaco の色情報（0-1レンジ）に変換する */
function hexToColor(hex: string): { red: number; green: number; blue: number; alpha: number } {
  const expand = hex.length <= 4
    ? hex.split('').map(c => c + c).join('')
    : hex;
  const r = parseInt(expand.slice(0, 2), 16) / 255;
  const g = parseInt(expand.slice(2, 4), 16) / 255;
  const b = parseInt(expand.slice(4, 6), 16) / 255;
  const a = expand.length >= 8 ? parseInt(expand.slice(6, 8), 16) / 255 : 1;
  return { red: r, green: g, blue: b, alpha: a };
}

function colorToHex(color: { red: number; green: number; blue: number; alpha: number }): string {
  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
  const rgb = `${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`;
  return `#${color.alpha < 1 ? rgb + toHex(color.alpha) : rgb}`;
}

const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

let isColorProviderRegistered = false;

/**
 * #RRGGBB 等のHexコードにVSCode同様の色swatchを表示し、クリックで色変更ダイアログを開けるようにする。
 * Monacoの colorDecorators はこのプロバイダの登録有無に関わらずONだが、プロバイダが無いと
 * 何もハイライトされない。
 */
function registerHexColorProvider(monaco: any) {
  if (isColorProviderRegistered) return;
  isColorProviderRegistered = true;

  monaco.languages.registerColorProvider('markdown', {
    provideDocumentColors(model: any) {
      const text = model.getValue();
      const results: any[] = [];
      let match: RegExpExecArray | null;
      HEX_COLOR_REGEX.lastIndex = 0;
      while ((match = HEX_COLOR_REGEX.exec(text)) !== null) {
        const startPos = model.getPositionAt(match.index);
        const endPos = model.getPositionAt(match.index + match[0].length);
        results.push({
          color: hexToColor(match[0].slice(1)),
          range: {
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          },
        });
      }
      return results;
    },
    provideColorPresentations(_model: any, colorInfo: any) {
      const hex = colorToHex(colorInfo.color);
      return [{ label: hex, textEdit: { range: colorInfo.range, text: hex } }];
    },
  });
}


export const TextEditorMedia = forwardRef<TextEditorMediaRef, MediaProps>(function TextEditorMedia({ areaId, think, vault, onSave, onDirtyChange, onTitleChange, editorSettings, refreshKey, autoSaveRef }: MediaProps, ref) {
  const savedRef    = useRef(think ? getEditorValue(think) : '');
  const firstLineRef = useRef(think?.Content.split('\n')[0] ?? '');
  const editorRef   = useRef<any>(null);
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
  const [toast,      setToast]      = useState<Toast | null>(null);
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
      fontSize:   Math.round(EDITOR_BASE_FONT_SIZE * fontScale),
      lineHeight: Math.round(EDITOR_BASE_LINE_HEIGHT * fontScale),
    });
  }, [fontScale]);

  useEffect(() => {
    savedRef.current   = think ? getEditorValue(think) : '';
    firstLineRef.current = think?.Content.split('\n')[0] ?? '';
    onDirtyChange(false);
  }, [think?.ID, onDirtyChange]);

  // 外部からの think.Content リアルタイム更新の反映
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !think) return;
    
    const nextVal = getEditorValue(think);
    
    // 現在エディタに未保存の変更がない場合のみ外部の変更を反映
    const currentEditorVal = editor.getValue();
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

  const insertAtCursor = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = editor.getSelection();
    editor.executeEdits('file-drop', [{ range: sel, text, forceMoveMarkers: true }]);
    editor.focus();
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    // WorkoutPanel.DroppedFile.ID:Insert がドロップ位置のPaneからエディタを引けるよう登録する
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

        const workoutPanel = TTApplication.Instance.WorkoutPanel;
        let isChanged = false;
        if (workoutPanel.TextEditor.CurrentFoldingHeadingOffset !== offsetVal) {
          workoutPanel.TextEditor.CurrentFoldingHeadingOffset = offsetVal;
          isChanged = true;
        }
        if (workoutPanel.TextEditor.CurrentFoldingHeadingNumber !== numberVal) {
          workoutPanel.TextEditor.CurrentFoldingHeadingNumber = numberVal;
          isChanged = true;
        }
        if (workoutPanel.TextEditor.CurrentEditorCursorPos !== cursorOffsetStr) {
          workoutPanel.TextEditor.CurrentEditorCursorPos = cursorOffsetStr;
          isChanged = true;
        }
        if (workoutPanel.TextEditor.CurrentEditorTextOnCursorPos !== textOnCursor) {
          workoutPanel.TextEditor.CurrentEditorTextOnCursorPos = textOnCursor;
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
          if (!think.Metadata) think.Metadata = {};
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
      const currentSaved = getEditorValue(currentThink);
      if (body !== currentSaved) {
        const nextContent = reconstructContent(currentThink, body);
        onSaveRef.current(nextContent, currentThink.ID)
          .then(() => {
            savedRef.current = body;
          })
          .catch((err: any) => {
            console.error('[TextEditorMedia] Blur auto save failed:', err);
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
      savedRef.current = body;
      // 保存失敗時は App.tsx の unhandledrejection ハンドラーが SyncState='error' を出す。
      void onSave(reconstructContent(think, body), think.ID);
    });

    // 状態の復元
    isRestoringRef.current = true;
    const foldingController = editor.getContribution('editor.contrib.folding') as any;

    const restoreEditorState = () => {
      const editorState = think?.Metadata?.editor;
      if (!editorState) {
        isRestoringRef.current = false;
        return;
      }

      // 折畳状態の復元
      if (editorState.closedHeadings) {
        const closedLines = editorState.closedHeadings
          .split(',')
          .map((s: string) => parseInt(s.trim()))
          .filter((n: number) => !isNaN(n));
        if (closedLines.length > 0) {
          editor.trigger('tt', 'editor.fold', { selectionLines: closedLines.map((line: number) => line - 1) });
        }
      }

      // カーソル・選択範囲の復元
      if (editorState.caret) {
        editor.setPosition(editorState.caret);
        editor.revealPositionInCenter(editorState.caret);
      }
      if (editorState.selection) {
        editor.setSelection(editorState.selection);
      }

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
  }, [onSave, think, areaId]); // updateDecorations は後で依存に追加

  // マウント/アンマウント時のアクティブエディタのクリーンアップ
  useEffect(() => {
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
        const currentSaved = getEditorValue(currentThink);
        if (body !== currentSaved) {
          currentOnSave(reconstructContent(currentThink, body), currentThink.ID)
            .catch((err: any) => {
              console.error('[TextEditorMedia] Unmount auto save failed:', err);
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
      const currentSaved = getEditorValue(think);
      if (body === currentSaved) return; // think.Content と一致 → 保存不要
      const nextContent = reconstructContent(think, body);
      return onSave(nextContent, think.ID)
        .then(() => {
          savedRef.current = body;
        })
        .catch((err: unknown) => {
          console.error('[TextEditorMedia] Auto save failed:', err);
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
            'editor.background':                    editorSettings.background,
            'editor.selectionBackground':            editorSettings.selectionBackground,
            // フォーカスが外れたときの選択色。明示しないと Monaco が
            // editor.selectionBackground の50%を使い、フォーカスの有無で色が変わる
            'editor.inactiveSelectionBackground':    editorSettings.selectionBackground,
            'editor.wordHighlightBackground':        editorSettings.occurrenceBackground,
            'editor.wordHighlightStrongBackground':  editorSettings.occurrenceBackground,
            'editor.selectionHighlightBackground':   editorSettings.occurrenceBackground,
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
      ['text-editor-bullet-styles',  'Bullet',  editorSettings.bulletStyles  ?? []],
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
    // 色・属性は docs/DefaultColor.md 由来の TextEditor.FoldingHeader.* に従う
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
    // ミニマップの印も TextEditor.FoldingHeader の背景色から出す
    const style = foldingHeaderStyleRef.current;
    const minimapOptions = style && !isUnset(style.BgColor) ? {
      color: style.BgColor,
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
    const editor = editorRef.current;
    if (!editor || !decorationsCollectionRef.current || !editorSettings) return;

    const model = editor.getModel();
    if (!model) return;

    // コメント設定のパース
    // Comment / Bullet のスタイルは editorSettings から配列で直接取得します
    const commentStyles = editorSettings.commentStyles || [];
    const bulletStyles = editorSettings.bulletStyles || [];

    // --- ハイライトグループの動的スタイル注入 ---
    let highlightStyleEl = document.getElementById('text-editor-highlight-styles');
    if (!highlightStyleEl) {
      highlightStyleEl = document.createElement('style');
      highlightStyleEl.id = 'text-editor-highlight-styles';
      document.head.appendChild(highlightStyleEl);
    }
    // 色・属性は docs/DefaultColor.md 由来の TextEditor.Highlighter.Style(1..6).* に従う
    highlightStyleEl.textContent = editorSettings.highlightStyles.map((style, index) => {
      const decls = colorStyleToCss(style);
      return decls ? `.${styleClass('Highlighter', index + 1)} { ${decls} border-radius: 2px; }` : '';
    }).filter(Boolean).join('\n');

    const newDecorations: any[] = [];
    const linesCount = model.getLineCount();

    for (let i = 1; i <= linesCount; i++) {
      const lineContent = model.getLineContent(i);
      
      // 見出しの装飾
      const match = lineContent.match(/^(\s{0,3})(#{1,6})\s/);
      if (match) {
        const level = match[2].length;
        const style = editorSettings.headingStyles[level - 1];

        const minimapOptions = style && !isUnset(style.Color) ? {
          color: style.Color,
          position: 1 // (window as any).monaco.editor.MinimapPosition.Inline
        } : undefined;

        newDecorations.push({
          range: new (window as any).monaco.Range(i, 1, i, lineContent.length + 1),
          options: {
            isWholeLine: true,
            inlineClassName: styleClass('Heading', level),
            minimap: minimapOptions
          }
        });
      } else {
        // インデントのスキップ
        const indentMatch = lineContent.match(/^([ \t\u3000]*)(.*)/);
        const textAfterIndent = indentMatch ? indentMatch[2] : lineContent;

        // 行頭記号の装飾。Comment を先に見て、該当しなければ Bullet を見る
        const matched = matchMarkStyle('Comment', commentStyles, textAfterIndent)
                     ?? matchMarkStyle('Bullet',  bulletStyles,  textAfterIndent);

        if (matched) {
          newDecorations.push({
            range: new (window as any).monaco.Range(i, 1, i, lineContent.length + 1),
            options: {
              isWholeLine: true,
              inlineClassName: matched.className
            }
          });
        }
      }

      // 全角スペースの装飾
      if (editorSettings.showFullWidthSpace) {
        const regex = /\u3000/g;
        let spaceMatch;
        while ((spaceMatch = regex.exec(lineContent)) !== null) {
          const startCol = spaceMatch.index + 1;
          const endCol = startCol + 1;
          newDecorations.push({
            range: new (window as any).monaco.Range(i, startCol, i, endCol),
            options: {
              inlineClassName: 'full-width-space-decoration'
            }
          });
        }
      }

      // 単語ハイライトの装飾（複数グループ対応）
      if (editorSettings.highlightWord) {
        // カンマでグループ分割 (最大5つ)
        const groups = editorSettings.highlightWord.split(',').slice(0, 5);
        groups.forEach((groupStr, groupIndex) => {
          // 半角スペースで単語分割
          const words = groupStr.split(' ').map(w => w.trim()).filter(w => w.length > 0);
          if (words.length === 0) return;

          const groupStyle = editorSettings.highlightStyles[groupIndex];

          words.forEach(word => {
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedWord, 'g');
            let wordMatch;
            while ((wordMatch = regex.exec(lineContent)) !== null) {
              const startCol = wordMatch.index + 1;
              const endCol = startCol + word.length;
              newDecorations.push({
                range: new (window as any).monaco.Range(i, startCol, i, endCol),
                options: {
                  inlineClassName: styleClass('Highlighter', groupIndex + 1),
                  minimap: groupStyle && !isUnset(groupStyle.BgColor) ? {
                    color: groupStyle.BgColor,
                    position: 1 // Inline
                  } : undefined
                }
              });
            }
          });
        });
      }

      // 1. ダブルクォーテーションで囲まれたURIやファイルパスのハイライト
      const quotedRegex = /"([^"]+)"/g;
      let quotedMatch;
      const decoratedRanges: { start: number; end: number }[] = [];

      const isRangeDecorated = (start: number, end: number) => {
        return decoratedRanges.some(r => {
          return (start >= r.start && start < r.end) || (end > r.start && end <= r.end) || (start <= r.start && end >= r.end);
        });
      };

      while ((quotedMatch = quotedRegex.exec(lineContent)) !== null) {
        const content = quotedMatch[1];
        const isUri = /^https?:\/\//i.test(content) || /^file:\/\//i.test(content);
        const isFilePath = /^([a-zA-Z]:\\|\\\\)/.test(content) || /^([a-zA-Z]:\/)/.test(content);
        if (isUri || isFilePath) {
          const startCol = quotedMatch.index + 2; // " の次から
          const endCol = startCol + content.length; // 内側の文字列の長さ分
          
          newDecorations.push({
            range: new (window as any).monaco.Range(i, startCol, i, endCol),
            options: {
              inlineClassName: linkStyleClass('filepath')
            }
          });
          // ダブルクォーテーション全体を含む範囲を装飾済みとして記録する
          decoratedRanges.push({ 
            start: quotedMatch.index + 1, 
            end: quotedMatch.index + 1 + quotedMatch[0].length 
          });
        }
      }

      // 2. URL のハイライト
      const urlRegex = /https?:\/\/[^\s")]+/g;
      let urlMatch;
      while ((urlMatch = urlRegex.exec(lineContent)) !== null) {
        const startCol = urlMatch.index + 1;
        const endCol = startCol + urlMatch[0].length;
        if (isRangeDecorated(startCol, endCol)) continue;

        newDecorations.push({
          range: new (window as any).monaco.Range(i, startCol, i, endCol),
          options: {
            inlineClassName: linkStyleClass('url')
          }
        });
        decoratedRanges.push({ start: startCol, end: endCol });
      }

      // 3. Filepath のハイライト
      const fileRegex = /([a-zA-Z]:\\|\\\\)[^\s"<>|?*]+/g;
      let fileMatch;
      while ((fileMatch = fileRegex.exec(lineContent)) !== null) {
        const startCol = fileMatch.index + 1;
        const endCol = startCol + fileMatch[0].length;
        if (isRangeDecorated(startCol, endCol)) continue;

        newDecorations.push({
          range: new (window as any).monaco.Range(i, startCol, i, endCol),
          options: {
            inlineClassName: linkStyleClass('filepath')
          }
        });
        decoratedRanges.push({ start: startCol, end: endCol });
      }

      // 4. Tag のハイライト
      const tagRegex = /\[([^\]]+)\]/g;
      let tagMatch;
      while ((tagMatch = tagRegex.exec(lineContent)) !== null) {
        const startCol = tagMatch.index + 1;
        const endCol = startCol + tagMatch[0].length;
        if (isRangeDecorated(startCol, endCol)) continue;

        newDecorations.push({
          range: new (window as any).monaco.Range(i, startCol, i, endCol),
          options: {
            inlineClassName: linkStyleClass('tag')
          }
        });
        decoratedRanges.push({ start: startCol, end: endCol });
      }

      // 5. インライン書式（**bold** / __underline__ / ~~strikethrough~~ / *italic*）
      // URL/Tag の decoratedRanges とは独立に判定する。両方に該当する範囲は
      // Monaco が両方の inlineClassName を適用するため、片方を捨てる必要はない。
      // 判定の済んだ記号だけを伏せ字にして次のルールへ渡すことで、`**太字**` の `*` が
      // 斜体の記号として再解釈されるのを防ぎつつ、`*斜体の中の **太字**` の入れ子は残す。
      let scanLine = lineContent;
      for (const rule of INLINE_STYLE_RULES) {
        const regex = new RegExp(rule.pattern, 'g');
        const markers: number[] = [];
        let inlineMatch;
        while ((inlineMatch = regex.exec(scanLine)) !== null) {
          const startCol = inlineMatch.index + 1;
          const endCol = startCol + inlineMatch[0].length;
          newDecorations.push({
            range: new (window as any).monaco.Range(i, startCol, i, endCol),
            options: {
              inlineClassName: inlineStyleClass(rule.name)
            }
          });
          markers.push(inlineMatch.index, inlineMatch.index + inlineMatch[0].length - rule.marker.length);
        }
        for (const at of markers) {
          scanLine = scanLine.slice(0, at)
            + INLINE_MASK_CHAR.repeat(rule.marker.length)
            + scanLine.slice(at + rule.marker.length);
        }
      }
    }

    decorationsCollectionRef.current.set(newDecorations);
  }, [editorSettings]);

  const handleChange = useCallback((value: string | undefined) => {
    const v = value ?? '';
    const isDirty = v !== savedRef.current;
    onDirtyChange(isDirty);
    updateDecorations();
    // bundle / table / memo は第一行がタイトル → リアルタイム同期
    if (onTitleChange && think &&
        (think.ContentType === 'bundle' || think.ContentType === 'table' || think.ContentType === 'memo')) {
      const newFirst = v.split('\n')[0] ?? '';
      if (newFirst !== firstLineRef.current) {
        firstLineRef.current = newFirst;
        onTitleChange(newFirst);
      }
    }

    // デバウンス自動保存 (3秒後に自動保存)
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    if (isDirty && think) {
      autoSaveTimerRef.current = setTimeout(() => {
        const body = v;
        const nextContent = reconstructContent(think, body);
        onSave(nextContent, think.ID)
          .then(() => {
            savedRef.current = body;
          })
          .catch((err: any) => {
            console.error('[TextEditorMedia] Debounce auto save failed:', err);
          });
      }, 3000);
    }
  }, [onDirtyChange, updateDecorations, onTitleChange, think, onSave]);

  // ── ファイルドロップ ──────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Thinkドロップ（application/x-thought-id）はここで preventDefault/stopPropagation せず
    // WorkoutPanel の body-level ハンドラーへバブリングさせる。そちらで Load先Paneのゴースト
    // オーバーレイ（dropOverlay）を計算・表示しており、ここで止めると出なくなる。
    // ドロップ自体は下の handleDrop 側でこのイベントを直接検出して処理するため、ゴースト表示
    // を優先してここでは Files ドラッグのみを処理する。
    if (!e.dataTransfer.types.includes('Files')) return;
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
    // WorkoutPanel の body-level ハンドラーへバブリングさせる。ドロップ位置（カーソル直下の
    // Pane）の判定とAlt判定を1箇所（WorkoutPanel.handleBodyDrop）に一本化することで、
    // このコンポーネント側とのタイミング・判定不一致を避けている。
    if (e.dataTransfer.types.includes('application/x-thought-id')) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    // 通常ドロップ（Alt未使用）: 疑似キー LocalFileDrag/LocalDirDrag（docs/DefaultShortcut.md）経由で
    // Links Think を作成し、このPaneを差し替える（WorkoutArea.handleUrlDropと同じLoad系挙動）。
    // Alt+ドロップは従来通りカーソル位置へファイル参照を挿入する（下のロジック）。
    const altHeld = TTShortcutManager.instance.isDragAltHeld(e.nativeEvent);
    if (altHeld) {
      if (!shouldInsertLocalDrop(e)) return;
    } else {
      if (!shouldAllowLocalDrop(e)) return;
      const link = extractLinkDrop(e);
      if (!link || !areaId) return;
      const newThink = await vault.CreateLinksThink(link.title, link.url);
      const area = TTApplication.Instance.WorkoutPanel.GetArea(areaId);
      area?.OpenThink(newThink.ID, 'texteditor', newThink.Name);
      return;
    }

    const isElectron = StorageManager.instance.mode === 'electron';

    for (const file of files) {
      if (isElectron) {
        // Electron: webUtils.getPathForFile 経由でローカルパスを取得（Electron 32+対応）
        const byApi     = window.electronAPI?.getPathForFile(file);
        const byPlain   = e.dataTransfer.getData('text/plain').trim() || undefined;
        const localPath = byApi ?? byPlain ?? file.name;
        insertAtCursor(`[File:${file.name}](${localPath})`);
      } else {
        // PWA: サービスアカウントには個人のDriveストレージクォータが無く、
        // Google Workspace共有ドライブも前提にできないためアップロード非対応。
        // Electron版でのみファイル参照の挿入をサポートする。
        showToast(`✗ ファイルアップロードはPWA版では未対応です: ${file.name}`, 'error');
      }
    }
  }, [showToast, insertAtCursor, areaId, vault]);

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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Editor
        key={`${think.ID}-${refreshKey ?? 0}`}
        defaultValue={getEditorValue(think)}
        language="markdown"
        theme={editorSettings ? "custom-markdown-theme" : "vs-dark"}
        onMount={handleMount}
        onChange={handleChange}
        loading={<div className="text-editor-media__loading">エディタ読み込み中…</div>}
        options={{
          minimap:            { enabled: editorSettings?.minimap ?? false },
          fontSize:           Math.round(EDITOR_BASE_FONT_SIZE * fontScale),
          lineHeight:         Math.round(EDITOR_BASE_LINE_HEIGHT * fontScale),
          lineNumbers:        (editorSettings?.lineNumbers ?? true) ? 'on' : 'off',
          wordWrap:           (editorSettings?.wordWrap ?? true) ? 'on' : 'off',
          scrollBeyondLastLine: false,
          fontFamily:         "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
          padding:            { top: 10, bottom: 10 },
          renderLineHighlight: 'line',
          smoothScrolling:    true,
          folding:            true,
          showFoldingControls: 'always',
          // Monaco 標準の折り畳みハイライト（.folded-background）を切る。
          // その色 editor.foldBackground の既定値は「選択色の30%」で、切らないと
          // TextEditor.Selection の変更が折り畳み行の色に混ざる。折り畳み行の色は
          // TextEditor.FoldingHeader だけが決めるようにする。
          foldingHighlight:   false,
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
