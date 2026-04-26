/**
 * TextEditorMedia.tsx
 * Monaco Editor によるテキスト編集メディア。
 *
 * - Ctrl+S: onSave を呼んで保存
 * - 変更があるとき onDirtyChange(true) → Ribbon に ● を表示
 * - think.ID が変わると editor を再マウント（key prop で制御）
 */

import { useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { MediaProps } from './types';
import './TextEditorMedia.css';

export function TextEditorMedia({ think, onSave, onDirtyChange }: MediaProps) {
  // 保存済みコンテンツ（dirty 判定の基準）
  const savedRef = useRef(think?.Content ?? '');

  // think が変わったら保存済み内容を更新して dirty リセット
  useEffect(() => {
    savedRef.current = think?.Content ?? '';
    onDirtyChange(false);
  }, [think?.ID, onDirtyChange]);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    // Ctrl/Cmd + S で保存
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const content = editor.getValue();
      savedRef.current = content;
      onSave(content);
    });
  }, [onSave]);

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
    <div className="text-editor-media">
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
    </div>
  );
}
