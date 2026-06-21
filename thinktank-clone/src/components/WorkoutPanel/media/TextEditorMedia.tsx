// Monaco Editor メディア＋見出し操作アルゴリズム（仕様書04 §4）

import { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { TTThink } from '../../../models/TTThink';
import { app } from '../../../views/TTApplication';
import './TextEditorMedia.css';

interface HeadingAttribute {
  line: number;          // 1始まりの行番号
  level: number;         // # の数
  offset: number;        // 行先頭の文字位置オフセット
  headingNumber: string; // 階層構造見出し番号（例: 1.2.3）
  isHidden: boolean;     // 折りたたみによる非表示フラグ
}

/** 見出し行の属性取得（仕様書04 §4.1） */
function getHeadingAttributes(ed: MonacoEditor.IStandaloneCodeEditor): HeadingAttribute[] {
  const model = ed.getModel();
  if (!model) return [];
  const lineCount = model.getLineCount();
  const visibleRanges = ed.getVisibleRanges();
  const isLineVisible = (line: number) =>
    visibleRanges.some((r) => line >= r.startLineNumber && line <= r.endLineNumber);

  const result: HeadingAttribute[] = [];
  const counters: number[] = [];
  let offset = 0;

  for (let line = 1; line <= lineCount; line++) {
    const text = model.getLineContent(line);
    const m = text.match(/^(#+)\s/);
    if (m) {
      const level = m[1].length;
      // 上位（親）に変化した際、下位の階層カウンターをリセット
      counters.length = level;
      counters[level - 1] = (counters[level - 1] ?? 0) + 1;
      for (let i = 0; i < level - 1; i++) {
        if (counters[i] === undefined) counters[i] = 1;
      }
      result.push({
        line,
        level,
        offset,
        headingNumber: counters.slice(0, level).join('.'),
        isHidden: !isLineVisible(line),
      });
    }
    offset += text.length + 1; // 改行分
  }
  return result;
}

/** 見出しのfoldスコープ末尾行（次の同位以上の見出しの直前まで） */
function headingScopeEnd(headings: HeadingAttribute[], idx: number, lineCount: number): number {
  const h = headings[idx];
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level <= h.level) return headings[i].line - 1;
  }
  return lineCount;
}

/** 見出しが折りたたまれているか（見出し行は可視・直下行が不可視） */
function isHeadingFolded(ed: MonacoEditor.IStandaloneCodeEditor, h: HeadingAttribute, scopeEnd: number): boolean {
  if (h.isHidden) return false;
  if (h.line >= scopeEnd) return false;
  const visibleRanges = ed.getVisibleRanges();
  const next = h.line + 1;
  return !visibleRanges.some((r) => next >= r.startLineNumber && next <= r.endLineNumber);
}

export function TextEditorMedia({ think, areaId }: { think: TTThink; areaId: string }) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const fold = (lines: number[]) => {
    editorRef.current?.trigger('tt', 'editor.fold', { selectionLines: lines });
  };
  const unfold = (lines: number[]) => {
    editorRef.current?.trigger('tt', 'editor.unfold', { selectionLines: lines });
  };

  /** カーソル位置を内包する見出しのインデックス */
  const findCurrentHeadingIndex = (headings: HeadingAttribute[]): number => {
    const ed = editorRef.current;
    if (!ed) return -1;
    const pos = ed.getPosition();
    if (!pos) return -1;
    let idx = -1;
    for (let i = 0; i < headings.length; i++) {
      if (headings[i].line <= pos.lineNumber) idx = i;
      else break;
    }
    return idx;
  };

  /** 段階的展開（仕様書04 §4.2 OpenEachLevel） */
  const openEachLevel = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const model = ed.getModel();
    if (!model) return;
    const headings = getHeadingAttributes(ed);
    const idx = findCurrentHeadingIndex(headings);
    if (idx < 0) return;
    const h = headings[idx];
    const scopeEnd = headingScopeEnd(headings, idx, model.getLineCount());

    if (isHeadingFolded(ed, h, scopeEnd)) {
      unfold([h.line]);
      return;
    }
    // 子→孫→曾孫の順で最浅の折畳を展開
    const descendants = headings.filter(
      (d) => d.line > h.line && d.line <= scopeEnd && d.headingNumber.startsWith(h.headingNumber + '.'),
    );
    for (let depth = h.level + 1; depth <= 6; depth++) {
      const targets = descendants.filter((d) => {
        if (d.level !== depth) return false;
        const dIdx = headings.indexOf(d);
        return isHeadingFolded(ed, d, headingScopeEnd(headings, dIdx, model.getLineCount()));
      });
      if (targets.length > 0) {
        unfold(targets.map((t) => t.line));
        return;
      }
    }
  };

  /** 段階的折りたたみ（仕様書04 §4.2 CloseEachLevel） */
  const closeEachLevel = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const model = ed.getModel();
    if (!model) return;
    const headings = getHeadingAttributes(ed);
    const idx = findCurrentHeadingIndex(headings);
    if (idx < 0) return;
    const h = headings[idx];
    const scopeEnd = headingScopeEnd(headings, idx, model.getLineCount());
    const descendants = headings.filter(
      (d) => d.line > h.line && d.line <= scopeEnd && d.headingNumber.startsWith(h.headingNumber + '.'),
    );
    // 最深レベルから親方向へ走査し、展開中の階層を折りたたむ
    for (let depth = 6; depth >= h.level + 1; depth--) {
      const targets = descendants.filter((d) => {
        if (d.level !== depth) return false;
        const dIdx = headings.indexOf(d);
        const dEnd = headingScopeEnd(headings, dIdx, model.getLineCount());
        return !d.isHidden && d.line < dEnd && !isHeadingFolded(ed, d, dEnd);
      });
      if (targets.length > 0) {
        fold(targets.map((t) => t.line));
        return;
      }
    }
    // すべて折畳済みなら親自体を折りたたむ
    fold([h.line]);
  };

  const gotoHeading = (dir: 'prev' | 'next' | 'parent') => {
    const ed = editorRef.current;
    if (!ed) return;
    const pos = ed.getPosition();
    if (!pos) return;
    const headings = getHeadingAttributes(ed);
    let target: HeadingAttribute | undefined;

    if (dir === 'prev') {
      target = [...headings].reverse().find((h) => h.line < pos.lineNumber && !h.isHidden);
    } else if (dir === 'next') {
      target = headings.find((h) => h.line > pos.lineNumber && !h.isHidden);
    } else {
      const idx = findCurrentHeadingIndex(headings);
      if (idx >= 0) {
        const parentNumber = headings[idx].headingNumber.split('.').slice(0, -1).join('.');
        if (parentNumber) target = headings.find((h) => h.headingNumber === parentNumber);
      }
    }
    if (target) {
      ed.setPosition({ lineNumber: target.line, column: 1 });
      ed.revealLineInCenterIfOutsideViewport(target.line);
      ed.focus();
    }
  };

  // フォーカス中エディタとしてアクションハンドラを登録
  const registerHandlers = () => {
    app.MediaActionHandlers.set('TextEditor.CurrentFolding.Heading:OpenStepwise', openEachLevel);
    app.MediaActionHandlers.set('TextEditor.CurrentFolding.Heading:CloseStepwise', closeEachLevel);
    app.MediaActionHandlers.set('TextEditor.Heading.Previous', () => gotoHeading('prev'));
    app.MediaActionHandlers.set('TextEditor.Heading.Next', () => gotoHeading('next'));
    app.MediaActionHandlers.set('TextEditor.Heading.Parent', () => gotoHeading('parent'));
  };

  const onMount: OnMount = (ed) => {
    editorRef.current = ed;
    ed.onDidFocusEditorWidget(() => {
      app.Workout.SetFocusedArea(areaId);
      registerHandlers();
    });
    registerHandlers();
  };

  useEffect(() => {
    return () => {
      editorRef.current = null;
    };
  }, []);

  return (
    <div className="texteditor-media" data-focusable="Workout.TextEditor">
      <Editor
        height="100%"
        language="markdown"
        theme="vs"
        value={think.Content}
        onChange={(value) => {
          think.Content = value ?? '';
          think.NotifyUpdated(false);
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          wordWrap: 'on',
          folding: true,
          foldingStrategy: 'auto',
          showFoldingControls: 'always',
          lineNumbers: 'on',
          renderWhitespace: 'none',
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
