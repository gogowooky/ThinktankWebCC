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

    // フォーカスイベントの購読を追加し、フォーカスがあるエディタのみをアクティブにする
    disposablesRef.current.forEach(d => d.dispose());
    disposablesRef.current = [];

    const notifyHeadingStatus = () => {
      const headings = getHeadingAttributes(editor);
      const pos = editor.getPosition();
      const model = editor.getModel();
      
      let offsetVal = '0';
      let numberVal = 'None';
      
      if (pos && model) {
        const targetOffset = model.getOffsetAt(pos);
        const matched = headings.filter(h => h.offset <= targetOffset);
        if (matched.length > 0) {
          const currentHeading = matched[matched.length - 1];
          offsetVal = String(currentHeading.offset);
          numberVal = currentHeading.headingNumber;
        }
      }

      const workoutPanel = TTApplication.Instance.WorkoutPanel;
      workoutPanel.TextEditor.CurrentFoldingHeadingOffset = offsetVal;
      workoutPanel.TextEditor.CurrentFoldingHeadingNumber = numberVal;

      TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentFolding.HeadingOffset');
      TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentFolding.HeadingNumber');
    };

    const focusDisposable = editor.onDidFocusEditorText(() => {
      TTShortcutManager.instance.setActiveEditor(editor);
      notifyHeadingStatus();
    });
    disposablesRef.current.push(focusDisposable);

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

    updateDecorations();
  }, [onSave, think]); // updateDecorations は後で依存に追加

  // マウント/アンマウント時のアクティブエディタのクリーンアップ
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach(d => d.dispose());
      disposablesRef.current = [];
      if (TTShortcutManager.instance.activeEditor === editorRef.current) {
        TTShortcutManager.instance.setActiveEditor(null);
        TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentFolding.HeadingOffset');
        TTUIStateManager.instance.notifyConstPropertyChanged('TextEditor.CurrentFolding.HeadingNumber');
      }
    };
  }, []);

  // ビュー切り替え時の自動保存関数を autoSaveRef に登録
  // 注意: savedRef は外部からの think.Content 更新（_scheduleSave 等）で stale になりうるため、
  //       think.Content を直接比較に使う。これにより未保存編集の見落としを防ぐ。
  useEffect(() => {
    if (!autoSaveRef) return;
    autoSaveRef.current = () => {
      const editor = editorRef.current;
      if (!editor || !think) return;
      const body = editor.getValue();
      const currentSaved = getEditorValue(think);
      if (body === currentSaved) return; // think.Content と一致 → 保存不要
      savedRef.current = body;
      onSave(reconstructContent(think, body));
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

    // 見出し用CSSの注入
    let styleEl = document.getElementById('text-editor-custom-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'text-editor-custom-styles';
      document.head.appendChild(styleEl);
    }

    const cssRules = editorSettings.headingStyles.map((style, index) => {
      const level = index + 1;
      return `
        .custom-heading-${level} {
          color: ${style.color} !important;
          ${style.bold ? 'font-weight: bold !important;' : ''}
          ${style.underline ? 'text-decoration: underline !important;' : ''}
        }
      `;
    }).join('\n');

    styleEl.innerHTML = cssRules;

    updateDecorations();

  }, [editorSettings]);

  // ── 見出しデコレーションの更新 ──────────────────────────────────────────

  const decorationsCollectionRef = useRef<any>(null);

  const updateDecorations = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !decorationsCollectionRef.current || !editorSettings) return;

    const model = editor.getModel();
    if (!model) return;

    // --- ハイライトグループの動的スタイル注入 ---
    let highlightStyleEl = document.getElementById('text-editor-highlight-styles');
    if (!highlightStyleEl) {
      highlightStyleEl = document.createElement('style');
      highlightStyleEl.id = 'text-editor-highlight-styles';
      document.head.appendChild(highlightStyleEl);
    }
    const highlightStylesCss = editorSettings.highlightStyles.map((style, index) => {
      return `.custom-highlight-g${index + 1} {
  background-color: ${style.backgroundColor};
  color: ${style.color} !important;
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
    onDirtyChange(v !== savedRef.current);
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
  }, [onDirtyChange, updateDecorations, onTitleChange, think]);

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
