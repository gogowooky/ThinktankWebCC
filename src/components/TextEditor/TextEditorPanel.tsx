import { useEffect, useState, useCallback, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { TTColumn } from '../../views/TTColumn';
import {
  applyWordHighlight,
  applyKeywordHighlight,
  applyHeadingHighlight,
  injectHighlightCSS,
} from '../../utils/editorHighlight';
import './TextEditor.css';

/**
 * TextEditorPanel - Monaco Editorによるテキスト編集パネル
 *
 * TTColumn.EditorResourceの変更を監視し、対応するTTDataItemのContentを
 * Monaco Editorにロード。編集内容はTTDataItemに書き戻す。
 *
 * ハイライト機能:
 * - 単語ハイライト: カーソル位置の日本語対応ワード（漢字/カタカナ/ひらがな/括弧内）
 * - キーワードハイライト: Highlightバー入力（space=同色AND, comma=別色OR）
 */

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

  // ハイライト用デコレーションID
  const wordDecoIds = useRef<string[]>([]);
  const keywordDecoIds = useRef<string[]>([]);
  const headingDecoIds = useRef<string[]>([]);

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
        if (editorRef.current) {
          editorRef.current.setValue(item.Content);
        }
        suppressChange.current = false;
      } else if (itemId === '') {
        suppressChange.current = true;
        setContent('');
        setCurrentItemId('');
        if (editorRef.current) {
          editorRef.current.setValue('');
        }
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
      keywordDecoIds.current = applyKeywordHighlight(
        ed,
        column.HighlighterKeyword,
        keywordDecoIds.current,
      );
    };

    column.AddOnUpdate(key, updateKeywordHighlight);
    updateKeywordHighlight();

    return () => column.RemoveOnUpdate(key);
  }, [column, currentItemId]);

  // エディタマウント時
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    injectHighlightCSS();

    if (content) {
      editor.setValue(content);
    }

    // 単語ハイライト: カーソル移動時に更新
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

    // コンテンツ変更時にキーワード＋見出しハイライト再適用
    editor.onDidChangeModelContent(() => {
      keywordDecoIds.current = applyKeywordHighlight(
        editor,
        column.HighlighterKeyword,
        keywordDecoIds.current,
      );
      headingDecoIds.current = applyHeadingHighlight(editor, headingDecoIds.current);
    });

    // 初回ハイライト適用
    keywordDecoIds.current = applyKeywordHighlight(
      editor,
      column.HighlighterKeyword,
      keywordDecoIds.current,
    );
    headingDecoIds.current = applyHeadingHighlight(editor, headingDecoIds.current);
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
    if (item) {
      item.Content = newValue;
    }
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
        language="markdown"
        theme="vs-dark"
        value={content}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          fontSize: column.FontSize,
          minimap: { enabled: false },
          wordWrap: 'on',
          lineNumbers: 'off',
          glyphMargin: false,
          folding: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          renderLineHighlight: 'line',
          occurrencesHighlight: 'off',
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          padding: { top: 4 },
        }}
      />
    </div>
  );
}
