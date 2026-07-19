/**
 * TextEditorMedia.tsx
 * Monaco Editor によるテキスト編集メディア。
 *
 * - Ctrl+S: onSave を呼んで保存
 * - 変更があるとき onDirtyChange(true) → Ribbon に ● を表示
 * - think.ID が変わると editor を再マウント（key prop で制御）
 */

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { MediaProps } from './types';
import { StorageManager } from '../../../services/storage/StorageManager';
import { TTShortcutManager } from '../../../views/TTShortcutManager';
import { TTUIStateManager } from '../../../views/TTUIStateManager';
import { TTApplication } from '../../../views/TTApplication';
import { getHeadingAttributes } from '../../../views/TTFocusedPanelActions';
import { splitContent } from '../../../utils/thinkFormat';
import './TextEditorMedia.css';

export interface TextEditorMediaRef {
  focus: () => void;
  /**
   * WorkoutPanel.Insert.DroppedFile 用: 生のMonacoエディタインスタンスを取得する。
   * 呼び出し側は TTShortcutManager.setActiveEditor() でこれを対象に設定してから
   * 'WorkoutPanel.Insert.DroppedFile' Action を実行すること。
   */
  getEditor: () => any;
}

interface Toast { msg: string; type: 'success' | 'error'; }

function extractBody(content: string): string {
  return splitContent(content).body;
}

function getClosedHeadings(editor: any): string {
  const regions = (editor.getContribution?.('editor.contrib.folding') as any)
    ?.foldingModel?.regions;
  if (regions) {
    const closed: number[] = [];
    for (let i = 0; i < regions.length; i++) {
      if (regions.isCollapsed(i)) {
        closed.push(regions.getStartLineNumber(i));
      }
    }
    return closed.join(',');
  }
  return '';
}

function getEditorValue(think: NonNullable<MediaProps['think']>): string {
  return (think.ContentType === 'thought' || think.ContentType === 'table' || think.ContentType === 'memo')
    ? (think.Content ?? '')
    : extractBody(think.Content);
}

function reconstructContent(think: NonNullable<MediaProps['think']>, body: string): string {
  if (think.ContentType === 'thought' || think.ContentType === 'table' || think.ContentType === 'memo') return body;
  const firstLine = think.Content.split('\n')[0] ?? '';
  return body ? `${firstLine}\n${body}` : firstLine;
}

let isMarkdownFoldingRegistered = false;

function registerMarkdownFolding(monaco: any) {
  if (isMarkdownFoldingRegistered) return;
  isMarkdownFoldingRegistered = true;

  monaco.languages.registerFoldingRangeProvider('markdown', {
    provideFoldingRanges: (model: any) => {
      const ranges: any[] = [];
      const linesCount = model.getLineCount();
      const stack: { level: number; startLine: number }[] = [];

      for (let i = 1; i <= linesCount; i++) {
        const line = model.getLineContent(i);
        const match = line.match(/^(#+)\s/);
        
        if (match) {
          const level = match[1].length;
          
          while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            const popped = stack.pop()!;
            const endLine = i - 1;
            if (endLine > popped.startLine) {
              ranges.push({
                start: popped.startLine,
                end: endLine,
                kind: monaco.languages.FoldingRangeKind.Region
              });
            }
          }
          stack.push({ level, startLine: i });
        }
      }

      while (stack.length > 0) {
        const popped = stack.pop()!;
        if (linesCount > popped.startLine) {
          ranges.push({
            start: popped.startLine,
            end: linesCount,
            kind: monaco.languages.FoldingRangeKind.Region
          });
        }
      }
      return ranges;
    }
  });
}


export const TextEditorMedia = forwardRef<TextEditorMediaRef, MediaProps>(function TextEditorMedia({ areaId, think, onSave, onDirtyChange, onTitleChange, editorSettings, refreshKey, autoSaveRef }: MediaProps, ref) {
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
    // WorkoutPanel.Insert.DroppedFile がドロップ位置のPaneからエディタを引けるよう登録する
    if (areaId) TTShortcutManager.instance.registerAreaEditor(areaId, editor);
    registerMarkdownFolding(monaco);

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

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (!think) return;
      const body = editor.getValue();
      savedRef.current = body;
      onSave(reconstructContent(think, body), think.ID);
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
    if (!autoSaveRef) return;
    autoSaveRef.current = () => {
      const editor = editorRef.current;
      if (!editor || !think) return;
      const body = editor.getValue();
      const currentSaved = getEditorValue(think);
      if (body === currentSaved) return; // think.Content と一致 → 保存不要
      const nextContent = reconstructContent(think, body);
      onSave(nextContent, think.ID)
        .then(() => {
          savedRef.current = body;
        })
        .catch((err: any) => {
          console.error('[TextEditorMedia] Auto save failed:', err);
        });
    };
    return () => { autoSaveRef.current = null; };
  }, [autoSaveRef, think, onSave]);

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
            'editor.wordHighlightBackground':        editorSettings.occurrenceBackground,
            'editor.wordHighlightStrongBackground':  editorSettings.occurrenceBackground,
            'editor.selectionHighlightBackground':   editorSettings.occurrenceBackground,
          }
        });
        monaco.editor.setTheme('custom-markdown-theme');
      }
    }

    // 見出し用CSS of 注入
    let styleEl = document.getElementById('text-editor-custom-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'text-editor-custom-styles';
      document.head.appendChild(styleEl);
    }

    const cssRules = editorSettings.headingStyles.map((style, index) => {
      const level = index + 1;
      const hasBg = style.bgColor && style.bgColor !== 'undefined' && style.bgColor !== 'none';
      return `
        .custom-heading-${level} {
          color: ${style.color} !important;
          ${hasBg ? `background-color: ${style.bgColor} !important;` : ''}
          ${style.bold ? 'font-weight: bold !important;' : ''}
          ${style.underline ? 'text-decoration: underline !important;' : ''}
        }
      `;
    }).join('\n');

    styleEl.innerHTML = cssRules;

    // コメント用CSSの注入
    let commentStyleEl = document.getElementById('text-editor-comment-styles');
    if (!commentStyleEl) {
      commentStyleEl = document.createElement('style');
      commentStyleEl.id = 'text-editor-comment-styles';
      document.head.appendChild(commentStyleEl);
    }
    const commentStyles = editorSettings.commentStyles || [];
    const commentRules = commentStyles.map((s, index) => {
      const color = s.color;
      if (!color || color === 'undefined' || color === 'none') return '';
      return `
        .custom-comment-c${index + 1}, .custom-comment-c${index + 1} * {
          color: ${color} !important;
        }
      `;
    }).join('\n');
    commentStyleEl.innerHTML = commentRules;

    // Bullet用CSSの注入
    let bulletStyleEl = document.getElementById('text-editor-bullet-styles');
    if (!bulletStyleEl) {
      bulletStyleEl = document.createElement('style');
      bulletStyleEl.id = 'text-editor-bullet-styles';
      document.head.appendChild(bulletStyleEl);
    }
    const bulletStyles = editorSettings.bulletStyles || [];
    const bulletRules = bulletStyles.map((s, index) => {
      const color = s.color;
      const attr = s.attr;
      const hasColor = color && color !== 'undefined' && color !== 'none';
      const hasAttr = attr && attr !== 'undefined' && attr !== 'none';
      if (hasColor || hasAttr) {
        const isBold = hasAttr && attr.includes('bold');
        const isUnderline = hasAttr && attr.includes('underline');
        return `
          .custom-bullet-b${index + 1}, .custom-bullet-b${index + 1} * {
            ${hasColor ? `color: ${color} !important;` : ''}
            ${isBold ? `font-weight: bold !important;` : ''}
            ${isUnderline ? `text-decoration: underline !important;` : ''}
          }
        `;
      }
      return '';
    }).join('\n');
    bulletStyleEl.innerHTML = bulletRules;

    // URL/Filepath/Tag用のCSSの注入
    let linkStyleEl = document.getElementById('text-editor-link-styles');
    if (!linkStyleEl) {
      linkStyleEl = document.createElement('style');
      linkStyleEl.id = 'text-editor-link-styles';
      document.head.appendChild(linkStyleEl);
    }
    const urlStyle = editorSettings.urlStyle;
    const filepathStyle = editorSettings.filepathStyle;
    const tagStyle = editorSettings.tagStyle;

    const linkRules = [];
    if (urlStyle) {
      const hasBg = urlStyle.bgColor && urlStyle.bgColor !== 'undefined' && urlStyle.bgColor !== 'none';
      linkRules.push(`
        .custom-url-style {
          color: ${urlStyle.color && urlStyle.color !== 'undefined' ? urlStyle.color : 'inherit'} !important;
          ${hasBg ? `background-color: ${urlStyle.bgColor} !important;` : ''}
          ${urlStyle.bold ? 'font-weight: bold !important;' : ''}
          ${urlStyle.underline ? 'text-decoration: underline !important;' : ''}
        }
      `);
    }
    if (filepathStyle) {
      const hasBg = filepathStyle.bgColor && filepathStyle.bgColor !== 'undefined' && filepathStyle.bgColor !== 'none';
      linkRules.push(`
        .custom-filepath-style {
          color: ${filepathStyle.color && filepathStyle.color !== 'undefined' ? filepathStyle.color : 'inherit'} !important;
          ${hasBg ? `background-color: ${filepathStyle.bgColor} !important;` : ''}
          ${filepathStyle.bold ? 'font-weight: bold !important;' : ''}
          ${filepathStyle.underline ? 'text-decoration: underline !important;' : ''}
        }
      `);
    }
    if (tagStyle) {
      const hasBg = tagStyle.bgColor && tagStyle.bgColor !== 'undefined' && tagStyle.bgColor !== 'none';
      linkRules.push(`
        .custom-tag-style {
          color: ${tagStyle.color && tagStyle.color !== 'undefined' ? tagStyle.color : 'inherit'} !important;
          ${hasBg ? `background-color: ${tagStyle.bgColor} !important;` : ''}
          ${tagStyle.bold ? 'font-weight: bold !important;' : ''}
          ${tagStyle.underline ? 'text-decoration: underline !important;' : ''}
        }
      `);
    }
    linkStyleEl.innerHTML = linkRules.join('\n');

    updateDecorations();

  }, [editorSettings]);

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
    const highlightStylesCss = editorSettings.highlightStyles.map((style, index) => {
      const hasBg = style.backgroundColor && style.backgroundColor !== 'undefined';
      const hasFg = style.color && style.color !== 'undefined';
      return `.custom-highlight-g${index + 1} {
        ${hasBg ? `background-color: ${style.backgroundColor};` : ''}
        ${hasFg ? `color: ${style.color} !important;` : ''}
        ${style.bold ? 'font-weight: bold !important;' : ''}
        ${style.underline ? 'text-decoration: underline !important;' : ''}
        border-radius: 2px;
      }`;
    }).join('\n');
    highlightStyleEl.textContent = highlightStylesCss;

    const newDecorations: any[] = [];
    const linesCount = model.getLineCount();

    for (let i = 1; i <= linesCount; i++) {
      const lineContent = model.getLineContent(i);
      
      // 見出しの装飾
      const match = lineContent.match(/^(\s{0,3})(#{1,5})\s/);
      if (match) {
        const level = match[2].length;
        const style = editorSettings.headingStyles[level - 1];
        
        const minimapOptions = style?.color ? {
          color: style.color,
          position: 1 // (window as any).monaco.editor.MinimapPosition.Inline
        } : undefined;

        newDecorations.push({
          range: new (window as any).monaco.Range(i, 1, i, lineContent.length + 1),
          options: {
            isWholeLine: true,
            inlineClassName: `custom-heading-${level}`,
            minimap: minimapOptions
          }
        });
      } else {
        // インデントのスキップ
        const indentMatch = lineContent.match(/^([ \t\u3000]*)(.*)/);
        const textAfterIndent = indentMatch ? indentMatch[2] : lineContent;

        // コメント行の装飾
        let matchedComment = null;
        let commentIndex = -1;
        const sortedComments = commentStyles
          .map((s, idx) => ({ ...s, originalIndex: idx }))
          .sort((a, b) => b.symbol.length - a.symbol.length);

        for (const c of sortedComments) {
          const matchPattern = c.symbol.endsWith(' ') ? c.symbol : c.symbol + ' ';
          if (textAfterIndent.startsWith(matchPattern)) {
            matchedComment = c;
            commentIndex = c.originalIndex;
            break;
          }
        }

        if (matchedComment) {
          const color = matchedComment.color;
          if (color && color !== 'undefined' && color !== 'none') {
            newDecorations.push({
              range: new (window as any).monaco.Range(i, 1, i, lineContent.length + 1),
              options: {
                isWholeLine: true,
                inlineClassName: `custom-comment-c${commentIndex + 1}`
              }
            });
          }
        } else {
          // コメントでなければ、Bulletの装飾をチェック
          let matchedBullet = null;
          let bulletIndex = -1;
          const sortedBullets = bulletStyles
            .map((s, idx) => ({ ...s, originalIndex: idx }))
            .sort((a, b) => b.symbol.length - a.symbol.length);

          for (const b of sortedBullets) {
            const matchPattern = b.symbol.endsWith(' ') ? b.symbol : b.symbol + ' ';
            if (textAfterIndent.startsWith(matchPattern)) {
              matchedBullet = b;
              bulletIndex = b.originalIndex;
              break;
            }
          }

          if (matchedBullet) {
            const color = matchedBullet.color;
            const attr = matchedBullet.attr;
            const hasColor = color && color !== 'undefined' && color !== 'none';
            const hasAttr = attr && attr !== 'undefined' && attr !== 'none';

            if (hasColor || hasAttr) {
              newDecorations.push({
                range: new (window as any).monaco.Range(i, 1, i, lineContent.length + 1),
                options: {
                  isWholeLine: true,
                  inlineClassName: `custom-bullet-b${bulletIndex + 1}`
                }
              });
            }
          }
        }
      }

      // 全角スペースの装飾
      if (editorSettings.showFullWidthSpace) {
        let regex = /\u3000/g;
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
            let regex = new RegExp(escapedWord, 'g');
            let wordMatch;
            while ((wordMatch = regex.exec(lineContent)) !== null) {
              const startCol = wordMatch.index + 1;
              const endCol = startCol + word.length;
              newDecorations.push({
                range: new (window as any).monaco.Range(i, startCol, i, endCol),
                options: {
                  inlineClassName: `custom-highlight-g${groupIndex + 1}`,
                  minimap: groupStyle?.backgroundColor ? {
                    color: groupStyle.backgroundColor,
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
              inlineClassName: 'custom-filepath-style'
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
            inlineClassName: 'custom-url-style'
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
            inlineClassName: 'custom-filepath-style'
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
            inlineClassName: 'custom-tag-style'
          }
        });
        decoratedRanges.push({ start: startCol, end: endCol });
      }
    }

    decorationsCollectionRef.current.set(newDecorations);
  }, [editorSettings]);

  const handleChange = useCallback((value: string | undefined) => {
    const v = value ?? '';
    const isDirty = v !== savedRef.current;
    onDirtyChange(isDirty);
    updateDecorations();
    // thought / table / memo は第一行がタイトル → リアルタイム同期
    if (onTitleChange && think &&
        (think.ContentType === 'thought' || think.ContentType === 'table' || think.ContentType === 'memo')) {
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

    const isElectron = StorageManager.instance.mode === 'electron';

    for (const file of files) {
      if (isElectron) {
        // Electron: webUtils.getPathForFile 経由でローカルパスを取得（Electron 32+対応）
        const byApi     = window.electronAPI?.getPathForFile(file);
        const byPlain   = e.dataTransfer.getData('text/plain').trim() || undefined;
        const localPath = byApi ?? byPlain ?? file.name;
        insertAtCursor(`[File:${file.name}](${localPath})`);
      } else {
        // PWA: Google Drive にアップロード
        showToast(`アップロード中: ${file.name}`, 'success');
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('date', new Date().toISOString().slice(0, 10));
          const res = await fetch('/api/drive/upload', { method: 'POST', body: formData });
          if (!res.ok) throw new Error(await res.text());
          const { webViewLink } = await res.json() as { fileId: string; webViewLink: string };
          insertAtCursor(`[File:${file.name}](${webViewLink})`);
          showToast(`✓ 保存完了: ${file.name}`, 'success');
        } catch (err) {
          showToast(`✗ アップロード失敗: ${String(err)}`, 'error');
        }
      }
    }
  }, [showToast, insertAtCursor]);

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
          fontSize:           13,
          lineHeight:         20,
          lineNumbers:        (editorSettings?.lineNumbers ?? true) ? 'on' : 'off',
          wordWrap:           (editorSettings?.wordWrap ?? true) ? 'on' : 'off',
          scrollBeyondLastLine: false,
          fontFamily:         "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
          padding:            { top: 10, bottom: 10 },
          renderLineHighlight: 'line',
          smoothScrolling:    true,
          folding:            true,
          showFoldingControls: 'always',
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
