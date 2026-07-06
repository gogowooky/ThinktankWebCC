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
import './TextEditorMedia.css';

export interface TextEditorMediaRef { focus: () => void; }

interface Toast { msg: string; type: 'success' | 'error'; }

function extractBody(content: string): string {
  const idx = content.indexOf('\n');
  return idx === -1 ? '' : content.slice(idx + 1);
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


export const TextEditorMedia = forwardRef<TextEditorMediaRef, MediaProps>(function TextEditorMedia({ think, onSave, onDirtyChange, onTitleChange, editorSettings, refreshKey, autoSaveRef }: MediaProps, ref) {
  const savedRef    = useRef(think ? getEditorValue(think) : '');
  const firstLineRef = useRef(think?.Content.split('\n')[0] ?? '');
  const editorRef   = useRef<any>(null);
  const disposablesRef = useRef<any[]>([]);
  const headingStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRestoringRef = useRef(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkRef = useRef(think);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    thinkRef.current = think;
    onSaveRef.current = onSave;
  }, [think, onSave]);

  useImperativeHandle(ref, () => ({ focus: () => editorRef.current?.focus() }));
  const [isDragOver, setIsDragOver] = useState(false);
  const [toast,      setToast]      = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    savedRef.current   = think ? getEditorValue(think) : '';
    firstLineRef.current = think?.Content.split('\n')[0] ?? '';
    onDirtyChange(false);
  }, [think?.ID, onDirtyChange]);

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
        onSaveRef.current(nextContent)
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
      onSave(reconstructContent(think, body));
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
  }, [onSave, think]); // updateDecorations は後で依存に追加

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
          currentOnSave(reconstructContent(currentThink, body))
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
      onSave(nextContent)
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
    const colors = (editorSettings.commentColorSet || '').split(',').map(c => c.trim());
    const commentRules = colors.map((color, index) => {
      if (!color || color === 'undefined' || color === 'none') return '';
      return `
        .custom-comment-c${index + 1} {
          color: ${color} !important;
        }
      `;
    }).join('\n');
    commentStyleEl.innerHTML = commentRules;

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
    const StyleSet = editorSettings.commentStyleSet || '';
    const ColorSet = editorSettings.commentColorSet || '';
    const commentParts = StyleSet.split(',');
    const comments = commentParts
      .filter((c, idx) => c !== '' || idx === commentParts.length - 1)
      .map((text, originalIndex) => ({ text, originalIndex }));
    const sortedComments = comments.filter(c => c.text !== '').sort((a, b) => b.text.length - a.text.length);
    const colors = ColorSet.split(',').map(c => c.trim());

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
        // コメント行の装飾
        let matchedComment = null;
        for (const c of sortedComments) {
          if (lineContent.startsWith(c.text)) {
            matchedComment = c;
            break;
          }
        }

        if (matchedComment) {
          const color = colors[matchedComment.originalIndex];
          if (color && color !== 'undefined' && color !== 'none') {
            newDecorations.push({
              range: new (window as any).monaco.Range(i, 1, i, lineContent.length + 1),
              options: {
                isWholeLine: true,
                inlineClassName: `custom-comment-c${matchedComment.originalIndex + 1}`
              }
            });
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
        onSave(nextContent)
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
