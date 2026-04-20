import { useEffect, useState, useCallback, useRef } from 'react';
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react';
import type { editor, languages as MonacoLanguages } from 'monaco-editor';
import { TTColumn } from '../../views/TTColumn';
import {
  applyWordHighlight,
  applyKeywordHighlight,
  injectHighlightCSS,
} from '../../utils/editorHighlight';
import './TextEditor.css';

/**
 * TextEditorPanel - Monaco Editorによるテキスト編集パネル
 *
 * Phase 18 対応:
 * - tt-markdown カスタム言語（Monarchトークナイザー）
 * - my-dark カスタムテーマ（reference2準拠の見出し色: H1=緑/H2=橙/H3=ピンク等）
 * - 見出しベースのFolding（FoldingRangeProvider）
 * - 見出しハイライトはMonacoトークン着色に一本化（CSS decorationは廃止）
 */

// 言語・テーマ・Foldingの登録済みフラグ（ホットリロード対策）
let monacoSetupDone = false;

/** Monaco beforeMount: tt-markdown 言語・my-dark テーマ・Foldingを登録 */
const handleEditorWillMount: BeforeMount = (monaco) => {
  if (monacoSetupDone) return;
  monacoSetupDone = true;

  // ── tt-markdown 言語登録 ──────────────────────────────────
  if (!monaco.languages.getLanguages().some(l => l.id === 'tt-markdown')) {
    monaco.languages.register({ id: 'tt-markdown' });
  }

  monaco.languages.setMonarchTokensProvider('tt-markdown', {
    tokenizer: {
      root: [
        [/^######\s.*$/, 'heading6.md'],
        [/^#####\s.*$/, 'heading5.md'],
        [/^####\s.*$/,  'heading4.md'],
        [/^###\s.*$/,   'heading3.md'],
        [/^##\s.*$/,    'heading2.md'],
        [/^#\s.*$/,     'heading1.md'],
        [/^```\w*$/,    { token: 'string.code.md', next: '@codeblock' }],
        [/`[^`]+`/,     'variable.md'],
        [/\*\*[^*]+\*\*/, 'strong.md'],
        [/__[^_]+__/,   'strong.md'],
        [/\*[^*]+\*/,   'emphasis.md'],
        [/_[^_]+_/,     'emphasis.md'],
        [/\[[^\]]+\]\([^)]+\)/, 'string.link.md'],
        [/https?:\/\/[^\s]+/, 'string.link.md'],
        [/^\s*[-*+]\s/, 'keyword.md'],
        [/^\s*\d+\.\s/, 'keyword.md'],
        [/^>\s.*$/,     'comment.md'],
        [/^[-*_]{3,}$/, 'keyword.md'],
        [/./,           ''],
      ],
      codeblock: [
        [/^```$/, { token: 'string.code.md', next: '@pop' }],
        [/.*/,    'string.code.md'],
      ],
    },
  });

  // ── my-dark テーマ定義（reference2準拠の見出し色） ─────────
  monaco.editor.defineTheme('my-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'heading1.md', foreground: '40C040', fontStyle: 'bold underline' },
      { token: 'heading2.md', foreground: 'FFB030', fontStyle: 'bold underline' },
      { token: 'heading3.md', foreground: 'F080A0', fontStyle: 'bold underline' },
      { token: 'heading4.md', foreground: '5090D0', fontStyle: 'bold underline' },
      { token: 'heading5.md', foreground: 'D08060', fontStyle: 'bold underline' },
      { token: 'heading6.md', foreground: '30B0B0', fontStyle: 'bold underline' },
      { token: 'strong.md',   fontStyle: 'bold' },
      { token: 'emphasis.md', fontStyle: 'italic' },
      { token: 'string.link.md', foreground: '4fc1ff', fontStyle: 'underline' },
      { token: 'string.code.md', foreground: 'CE9178' },
      { token: 'variable.md',    foreground: 'CE9178' },
      { token: 'keyword.md',     foreground: '9cdcfe' },
      { token: 'comment.md',     foreground: '6A9955' },
    ],
    colors: {
      'editor.background':                          '#1e1e1e',
      'editorLineNumber.foreground':                '#555555',
      'editorGutter.foldingControlForeground':      '#666666',
      'editorBracketMatch.background':              '#00000000',
      'editorBracketMatch.border':                  '#00000000',
      'editorBracketHighlight.foreground1':         '#D4D4D4',
      'editorBracketHighlight.foreground2':         '#D4D4D4',
      'editorBracketHighlight.foreground3':         '#D4D4D4',
      'editorBracketHighlight.foreground4':         '#D4D4D4',
      'editorBracketHighlight.foreground5':         '#D4D4D4',
      'editorBracketHighlight.foreground6':         '#D4D4D4',
      'editorBracketHighlight.unexpectedBracket.foreground': '#D4D4D4',
    },
  });

  // ── my-light テーマ定義（DefaultOriginal ラベンダー系） ──────
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
      { token: 'strong.md',   fontStyle: 'bold' },
      { token: 'emphasis.md', fontStyle: 'italic' },
      { token: 'string.link.md', foreground: '4169E1', fontStyle: 'underline' },
      { token: 'string.code.md', foreground: 'A31515' },
      { token: 'variable.md',    foreground: 'A31515' },
      { token: 'keyword.md',     foreground: '5050A0' },
      { token: 'comment.md',     foreground: '008000' },
    ],
    colors: {
      'editor.background':                          '#FFFFFF',
      'editor.foreground':                          '#483D8B',
      'editorLineNumber.foreground':                '#B0B0D8',
      'editorGutter.foldingControlForeground':      '#B0B0D8',
      'editor.lineHighlightBackground':             '#F5F5FF',
      'editorCursor.foreground':                    '#483D8B',
      'editor.selectionBackground':                 '#C6C6FA',
      'editorBracketMatch.background':              '#00000000',
      'editorBracketMatch.border':                  '#00000000',
      'editorBracketHighlight.foreground1':         '#483D8B',
      'editorBracketHighlight.foreground2':         '#483D8B',
      'editorBracketHighlight.foreground3':         '#483D8B',
      'editorBracketHighlight.foreground4':         '#483D8B',
      'editorBracketHighlight.foreground5':         '#483D8B',
      'editorBracketHighlight.foreground6':         '#483D8B',
      'editorBracketHighlight.unexpectedBracket.foreground': '#483D8B',
    },
  });

  // ── 見出しベース Folding プロバイダ ──────────────────────────
  monaco.languages.registerFoldingRangeProvider('tt-markdown', {
    provideFoldingRanges: (model: editor.ITextModel) => {
      const ranges: MonacoLanguages.FoldingRange[] = [];
      const lineCount = model.getLineCount();
      const stack: { line: number; level: number }[] = [];

      for (let i = 1; i <= lineCount; i++) {
        const match = model.getLineContent(i).match(/^(#+)\s/);
        if (!match) continue;
        const currentLevel = match[1].length;

        while (stack.length > 0 && stack[stack.length - 1].level >= currentLevel) {
          const top = stack.pop()!;
          ranges.push({ start: top.line, end: i - 1, kind: monaco.languages.FoldingRangeKind.Region });
        }
        stack.push({ line: i, level: currentLevel });
      }
      while (stack.length > 0) {
        const top = stack.pop()!;
        ranges.push({ start: top.line, end: lineCount, kind: monaco.languages.FoldingRangeKind.Region });
      }
      return ranges;
    },
  });
};

/** colorMode文字列からMonacoテーマ名を返す */
function monacoThemeFromColorMode(colorMode: string | undefined): string {
  return colorMode === 'DefaultOriginal' ? 'my-light' : 'my-dark';
}

// ─────────────────────────────────────────────────────────────────

interface TextEditorPanelProps {
  column: TTColumn;
  width: number;
  height: number;
}

export function TextEditorPanel({ column, width, height }: TextEditorPanelProps) {
  const [content, setContent] = useState('');
  const [currentItemId, setCurrentItemId] = useState('');
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const suppressChange = useRef(false);

  const wordDecoIds    = useRef<string[]>([]);
  const keywordDecoIds = useRef<string[]>([]);

  // colorMode変更を監視してMonacoテーマを切り替え
  const [monacoTheme, setMonacoTheme] = useState(
    () => monacoThemeFromColorMode(document.documentElement.dataset.colorMode)
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMonacoTheme(monacoThemeFromColorMode(document.documentElement.dataset.colorMode));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-mode'] });
    return () => observer.disconnect();
  }, []);

  // EditorResource変更時にコンテンツをロード
  useEffect(() => {
    const key = `TextEditorPanel-${column.Index}`;
    const loadContent = () => {
      const itemId = column.EditorResource;
      if (itemId === currentItemId) return;

      const collection = column.GetCurrentCollection();
      if (!collection) return;

      const item = collection.GetDataItem(itemId);
      if (item) {
        suppressChange.current = true;
        setContent(item.Content);
        setCurrentItemId(itemId);
        if (editorRef.current) editorRef.current.setValue(item.Content);
        suppressChange.current = false;
      } else if (itemId === '') {
        suppressChange.current = true;
        setContent('');
        setCurrentItemId('');
        if (editorRef.current) editorRef.current.setValue('');
        suppressChange.current = false;
      }
    };

    column.AddOnUpdate(key, loadContent);
    loadContent();
    return () => column.RemoveOnUpdate(key);
  }, [column, currentItemId]);

  // HighlighterKeyword変更時にキーワードハイライト更新
  useEffect(() => {
    const key = `TextEditorPanel-hl-${column.Index}`;
    const updateKeywordHighlight = () => {
      const ed = editorRef.current;
      if (!ed) return;
      keywordDecoIds.current = applyKeywordHighlight(ed, column.HighlighterKeyword, keywordDecoIds.current);
    };

    column.AddOnUpdate(key, updateKeywordHighlight);
    updateKeywordHighlight();
    return () => column.RemoveOnUpdate(key);
  }, [column, currentItemId]);

  // エディタマウント時
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    injectHighlightCSS();

    if (content) editor.setValue(content);

    // 単語ハイライト（カーソル位置の日本語対応ワード）
    editor.onDidChangeCursorPosition(() => {
      wordDecoIds.current = applyWordHighlight(editor, wordDecoIds.current);
    });

    // 選択テキストをTTColumnに反映（チャットコンテキスト用）
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (selection && model && !selection.isEmpty()) {
        column.EditorSelection = model.getValueInRange(selection);
      } else {
        column.EditorSelection = '';
      }
    });

    // コンテンツ変更時にキーワードハイライト再適用
    editor.onDidChangeModelContent(() => {
      keywordDecoIds.current = applyKeywordHighlight(editor, column.HighlighterKeyword, keywordDecoIds.current);
    });

    // 初回キーワードハイライト
    keywordDecoIds.current = applyKeywordHighlight(editor, column.HighlighterKeyword, keywordDecoIds.current);
  }, [content, column]);

  // 編集内容の変更をTTDataItemに反映
  const handleChange = useCallback((value: string | undefined) => {
    if (suppressChange.current) return;
    const newValue = value ?? '';
    setContent(newValue);

    const itemId = column.EditorResource;
    if (!itemId) return;

    const collection = column.GetCurrentCollection();
    if (!collection) return;

    const item = collection.GetDataItem(itemId);
    if (item) item.Content = newValue;
  }, [column]);

  if (height <= 0 || width <= 0) return null;

  if (!currentItemId) {
    return (
      <div className="texteditor-panel" style={{ width, height }}>
        <div className="texteditor-empty">No item selected</div>
      </div>
    );
  }

  return (
    <div className="texteditor-panel" style={{ width, height }}>
      <Editor
        width={width}
        height={height}
        language="tt-markdown"
        theme={monacoTheme}
        value={content}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorMount}
        onChange={handleChange}
        options={{
          fontSize: column.FontSize,
          minimap: { enabled: false },
          wordWrap: 'on',
          lineNumbers: 'off',
          glyphMargin: false,
          folding: true,
          foldingStrategy: 'auto',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          renderLineHighlight: 'line',
          occurrencesHighlight: 'off',
          unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
          matchBrackets: 'never',
          bracketPairColorization: { enabled: false },
          guides: { bracketPairs: false, highlightActiveBracketPair: false },
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          padding: { top: 4 },
        }}
      />
    </div>
  );
}
