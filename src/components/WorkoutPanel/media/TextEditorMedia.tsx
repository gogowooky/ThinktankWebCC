/**
 * TextEditorMedia.tsx
 * Monaco Editor によるテキスト編集メディア。
 *
 * - Ctrl+S: onSave を呼んで保存
 * - 変更があるとき onDirtyChange(true) → Ribbon に ● を表示
 * - think.ID が変わると editor を再マウント（key prop で制御）
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { MediaProps } from './types';
import './TextEditorMedia.css';

interface Toast { msg: string; type: 'success' | 'error'; }

export function TextEditorMedia({ think, onSave, onDirtyChange }: MediaProps) {
  const savedRef  = useRef(think?.Content ?? '');
  const editorRef = useRef<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [toast,      setToast]      = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    savedRef.current = think?.Content ?? '';
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
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const content = editor.getValue();
      savedRef.current = content;
      onSave(content);
    });
  }, [onSave]);

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
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
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
  }, [showToast, insertAtCursor]);

  const handleChange = useCallback((value: string | undefined) => {
    onDirtyChange((value ?? '') !== savedRef.current);
  }, [onDirtyChange]);

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
        key={think.ID}
        defaultValue={think.Content}
        language="markdown"
        theme="vs-dark"
        onMount={handleMount}
        onChange={handleChange}
        loading={<div className="text-editor-media__loading">エディタ読み込み中…</div>}
        options={{
          minimap:            { enabled: false },
          fontSize:           13,
          lineHeight:         20,
          lineNumbers:        'on',
          wordWrap:           'on',
          scrollBeyondLastLine: false,
          fontFamily:         "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
          padding:            { top: 10, bottom: 10 },
          renderLineHighlight: 'gutter',
          smoothScrolling:    true,
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
}
