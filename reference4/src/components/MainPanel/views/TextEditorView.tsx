/**
 * TextEditorView.tsx
 * Monaco Editor によるテキスト編集ビュー。
 *
 * Phase 7: Monaco Editor 統合
 * - Markdown モード・vs-dark ベースのカスタムテーマ
 * - onChange → item.setContentSilent() + SetActiveTabDirty()
 * - Ctrl+S → item.SaveContent() + SetActiveTabDirty(false)
 * - IsLoading=true の間はスピナーを表示
 * Phase 13 以降: IsMetaOnly=true のコンテンツをオンデマンドフェッチ
 */

import React, { useCallback, useRef } from 'react';
import Editor, { BeforeMount, OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { Loader2 } from 'lucide-react';
import { TTApplication } from '../../../views/TTApplication';
import type { TTTab } from '../../../views/TTTab';
import './TextEditorView.css';

// ── Monaco カスタムテーマ定義 ─────────────────────────────────────────
// アプリの CSS 変数と揃えた TokyoNight 風ダークテーマ

const THEME_NAME = 'thinktank-dark';

const defineTheme: BeforeMount = monaco => {
  monaco.editor.defineTheme(THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',          foreground: '7aa2f7' },
      { token: 'comment',          foreground: '565f89', fontStyle: 'italic' },
      { token: 'string',           foreground: '9ece6a' },
      { token: 'number',           foreground: 'ff9e64' },
      { token: 'markup.heading',   foreground: 'e0af68', fontStyle: 'bold' },
      { token: 'markup.bold',      foreground: 'ff9e64', fontStyle: 'bold' },
      { token: 'markup.italic',    foreground: 'c0caf5', fontStyle: 'italic' },
      { token: 'markup.quote',     foreground: '565f89' },
      { token: 'markup.inline.raw', foreground: '9ece6a' },
    ],
    colors: {
      'editor.background':              '#1e2030',
      'editor.foreground':              '#c0caf5',
      'editor.lineHighlightBackground': '#00000000',
      'editor.selectionBackground':     '#2e346088',
      'editorCursor.foreground':        '#7aa2f7',
      'editorLineNumber.foreground':    '#565f89',
      'editorIndentGuide.background':   '#2a3050',
      'editorWhitespace.foreground':    '#2a3050',
      'scrollbarSlider.background':     '#2a305088',
      'scrollbarSlider.hoverBackground':'#2e346088',
      'scrollbarSlider.activeBackground':'#7aa2f788',
    },
  });
};

// ── エディタオプション ────────────────────────────────────────────────

const EDITOR_OPTIONS: MonacoType.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: "'Consolas', 'Menlo', 'Courier New', monospace",
  lineHeight: 22,
  wordWrap: 'on',
  minimap:               { enabled: false },
  scrollBeyondLastLine:  false,
  automaticLayout:       true,
  padding:               { top: 20, bottom: 20 },
  lineNumbers:           'off',
  folding:               false,
  glyphMargin:           false,
  lineDecorationsWidth:  0,
  lineNumbersMinChars:   0,
  overviewRulerBorder:   false,
  overviewRulerLanes:    0,
  renderLineHighlight:   'none',
  scrollbar: {
    verticalScrollbarSize:   6,
    horizontalScrollbarSize: 6,
  },
  quickSuggestions:      false,
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: 'off',
  tabCompletion:         'off',
  wordBasedSuggestions:  'off',
};

// ── TextEditorView 本体 ──────────────────────────────────────────────

interface Props {
  tab: TTTab;
}

export function TextEditorView({ tab }: Props) {
  const app  = TTApplication.Instance;
  const item = app.Models.Memos.GetDataItem(tab.ResourceID) ?? null;

  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);

  // エディタマウント時：Ctrl+S ショートカットを登録
  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        async () => {
          if (!item) return;
          await item.SaveContent();
          app.MainPanel.SetActiveTabDirty(false);
        }
      );
    },
    [item, app]
  );

  // テキスト変更時：サイレント更新 → IsDirty をタブに反映
  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!item || value === undefined) return;
      item.setContentSilent(value);
      app.MainPanel.SetActiveTabDirty(item.IsDirty);
    },
    [item, app]
  );

  // ── ローディング状態 ─────────────────────────────────────────────

  if (tab.IsLoading) {
    return (
      <div className="text-editor-view text-editor-view--loading">
        <Loader2 className="text-editor-view__spinner" size={28} />
        <p className="text-editor-view__loading-text">コンテンツを読み込み中...</p>
      </div>
    );
  }

  // ── Monaco エディタ ──────────────────────────────────────────────

  return (
    <div className="text-editor-view">
      <Editor
        defaultLanguage="markdown"
        defaultValue={item?.Content ?? ''}
        theme={THEME_NAME}
        beforeMount={defineTheme}
        onMount={handleMount}
        onChange={handleChange}
        options={EDITOR_OPTIONS}
      />
    </div>
  );
}
