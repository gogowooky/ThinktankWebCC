/**
 * markdownSections.ts
 * Markdown の見出し階層からセクション範囲を求める。
 *
 * Monaco の折り畳み（TextEditorMedia）と Markdown 表示の <details> 折り畳みは、
 * think.Metadata.editor.closedHeadings に「エディタ値の1始まり行番号」を共有して同期する。
 * 片方だけ境界の求め方を変えると保存済みの行番号が別のセクションを指してしまうため、
 * 両者は必ずこのモジュールだけを参照すること。
 */

import type { ContentType } from '../types';

export interface MarkdownHeading {
  level: number;
  /** 見出し行（1始まり）*/
  line: number;
}

export interface MarkdownSection {
  level: number;
  /** 見出し行（1始まり）*/
  startLine: number;
  /** セクション末尾行（1始まり・その行を含む）。見出し行のみなら startLine と同値 */
  endLine: number;
  children: MarkdownSection[];
}

export interface MarkdownDocSections {
  /** 最初の見出しより前の末尾行（0 なら前置きなし）*/
  preambleEndLine: number;
  sections: MarkdownSection[];
  totalLines: number;
}

/**
 * エディタが編集対象とする文字列にタイトル行（先頭行）が含まれる ContentType。
 * TextEditorMedia.getEditorValue() の分岐と一致させること。
 */
const EDITOR_VALUE_INCLUDES_TITLE: readonly ContentType[] = ['bundle', 'table', 'memo'];

export function editorValueIncludesTitleLine(contentType: ContentType): boolean {
  return EDITOR_VALUE_INCLUDES_TITLE.includes(contentType);
}

/**
 * Markdown表示の行番号に足すとエディタの行番号になる差分。
 * Markdown表示は常に本文のみ（先頭行を除去）を描画するのに対し、
 * エディタは ContentType によってタイトル行を含むためズレが生じる。
 */
export function editorLineOffset(contentType: ContentType): number {
  return editorValueIncludesTitleLine(contentType) ? 1 : 0;
}

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^(#+)\s/;

/**
 * ATX見出しを収集する。
 * コードフェンス内の `#` は見出しではない。Markdown表示側はこの結果で原文を行単位に
 * 切り分けて描画するため、フェンス内を拾うとコードブロックが分断されてしまう。
 */
export function collectHeadings(source: string): MarkdownHeading[] {
  const lines = source.split('\n');
  const headings: MarkdownHeading[] = [];
  let fenceChar: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[1][0];
      if (fenceChar === null) fenceChar = marker;
      else if (fenceChar === marker) fenceChar = null;
      continue;
    }
    if (fenceChar !== null) continue;

    const heading = line.match(HEADING_RE);
    if (heading) headings.push({ level: heading[1].length, line: i + 1 });
  }
  return headings;
}

/** 見出し階層をセクション木に組み立てる */
export function buildSectionTree(source: string): MarkdownDocSections {
  const totalLines = source.split('\n').length;
  const headings = collectHeadings(source);
  let idx = 0;

  const walk = (parentLevel: number): MarkdownSection[] => {
    const out: MarkdownSection[] = [];
    while (idx < headings.length && headings[idx].level > parentLevel) {
      const heading = headings[idx];
      idx++;
      const children = walk(heading.level);
      // 子孫を読み切った次の見出しが、このセクションの終端を決める
      const next = headings[idx];
      out.push({
        level: heading.level,
        startLine: heading.line,
        endLine: next ? next.line - 1 : totalLines,
        children,
      });
    }
    return out;
  };

  const sections = walk(0);
  return {
    preambleEndLine: headings.length > 0 ? headings[0].line - 1 : totalLines,
    sections,
    totalLines,
  };
}

/** Monaco の FoldingRange 用。中身を持たない見出しは折り畳めないので除外する */
export function toFoldingRanges(source: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const visit = (section: MarkdownSection) => {
    if (section.endLine > section.startLine) {
      ranges.push({ start: section.startLine, end: section.endLine });
    }
    section.children.forEach(visit);
  };
  buildSectionTree(source).sections.forEach(visit);
  return ranges;
}

/** think.Metadata.editor.closedHeadings をエディタ行番号の集合として読む */
export function parseClosedHeadings(value: unknown): Set<number> {
  if (typeof value !== 'string' || value === '') return new Set();
  const lines = value
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return new Set(lines);
}

/** think.Metadata.editor.closedHeadings へ書き戻す形式に直す */
export function serializeClosedHeadings(lines: Iterable<number>): string {
  return [...lines].sort((a, b) => a - b).join(',');
}
