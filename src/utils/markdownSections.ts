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
 * エディタが編集対象とする文字列にタイトル行（先頭行）が含まれるかどうか。
 *
 * TTThink はどの ContentType でも Content の1行目がタイトルであり（TTThink._extractTitle
 * が種別を問わず1行目を Name にする、thinkFormat.splitContent も同様）、これは全 ContentType
 * に共通の格納形式である。したがってエディタ側も種別で出し分けず常にタイトル行を含める。
 * かつては 'bundle' / 'table' / 'memo' のみの許可リストだったが、'chat' 等その他の種別を
 * texteditor で開いたときにタイトル行が編集領域から消えてしまう不整合があったため統一した。
 */
export function editorValueIncludesTitleLine(_contentType: ContentType): boolean {
  return true;
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
const FRONTMATTER_DELIM_RE = /^---\s*$/;

/**
 * 改行区切りで行配列にする。CRLF（Electronのローカル保存ファイル等で実際に発生する）を
 * 1つの区切りとして扱い、各行末に "\r" を残さない。"." は "\r" にマッチしないため、
 * "\r" が残ったまま `(.*)$` 等の正規表現にかけると一致に失敗する（FRONTMATTER_TITLE_RE で実際に
 * 発生したバグ）。この関数を通した行配列だけを以降の正規表現マッチに使うこと。
 */
function splitLines(source: string): string[] {
  return source.split(/\r\n|\n/);
}

/**
 * 先頭行が "---" のみの行であれば、次に現れる "---" のみの行までを
 * YAML frontmatter の範囲として返す（1始まり行番号、両端を含む）。
 * 先頭行以外に現れる "---" のみの行（区切り線としての用法等）は対象にしない。
 */
export function findFrontmatterRange(source: string): { start: number; end: number } | null {
  const lines = splitLines(source);
  if (lines.length === 0 || !FRONTMATTER_DELIM_RE.test(lines[0])) return null;
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_DELIM_RE.test(lines[i])) {
      return { start: 1, end: i + 1 };
    }
  }
  return null;
}

const FRONTMATTER_TITLE_RE = /^title:\s*(.*)$/;

/** "value" / 'value' の前後クォートを外す（frontmatterのtitle値用の簡易処理） */
function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * frontmatter内の "title:" キーの値を返す。frontmatterが無い、またはtitleキーが
 * 無ければ null（TextEditorのPaneタイトル・think.Nameの抽出元として使う）。
 */
export function extractFrontmatterTitle(source: string): string | null {
  const range = findFrontmatterRange(source);
  if (!range) return null;
  const lines = splitLines(source);
  for (let i = range.start; i <= range.end - 2; i++) {
    const match = lines[i]?.match(FRONTMATTER_TITLE_RE);
    if (match) return unquoteYamlScalar(match[1]);
  }
  return null;
}

/**
 * ATX見出しを収集する。
 * コードフェンス内の `#` およびYAML frontmatter内の `#`（YAMLコメント等）は見出しではない。
 * Markdown表示側はこの結果で原文を行単位に切り分けて描画するため、フェンス内を拾うと
 * コードブロックが分断されてしまう。
 */
export function collectHeadings(source: string): MarkdownHeading[] {
  const lines = splitLines(source);
  const headings: MarkdownHeading[] = [];
  let fenceChar: string | null = null;
  const frontmatter = findFrontmatterRange(source);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    if (frontmatter && lineNumber >= frontmatter.start && lineNumber <= frontmatter.end) continue;

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
  const totalLines = splitLines(source).length;
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

/**
 * Monaco の FoldingRange 用。中身を持たない見出しは折り畳めないので除外する。
 * 先頭のYAML frontmatterがあれば、その先頭行をヘッダーとする折り畳み範囲も先頭に加える
 * （findFrontmatterRange参照。先頭行以外の "---" のみの行は対象にしない）。
 */
export function toFoldingRanges(source: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const frontmatter = findFrontmatterRange(source);
  if (frontmatter) ranges.push(frontmatter);

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
