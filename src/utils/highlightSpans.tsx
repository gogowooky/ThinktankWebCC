/**
 * highlightSpans - キーワードハイライトのReact/DOM共通ユーティリティ
 *
 * highlightTextSpans : テキスト内キーワードを色付き<mark>スパンのReactNodeに変換
 * applyIframeHighlight : iframe document内のテキストノードにDOM操作でハイライト適用
 */

import { KEYWORD_COLORS } from './editorHighlight';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** キーワード文字列からterm→colorIndexマッピングを構築 */
function buildTermColors(keyword: string): { term: string; colorIdx: number }[] {
  const result: { term: string; colorIdx: number }[] = [];
  keyword.split(',').forEach((group, gi) => {
    const trimmed = group.trim();
    if (!trimmed) return;
    trimmed.split(/\s+/).filter(Boolean).forEach(term => {
      result.push({ term, colorIdx: gi % KEYWORD_COLORS.length });
    });
  });
  return result;
}

/** テキスト内のマッチ区間をソート・重複排除して返す */
interface Interval { start: number; end: number; colorIdx: number }

function findIntervals(text: string, termColors: { term: string; colorIdx: number }[]): Interval[] {
  const intervals: Interval[] = [];
  termColors.forEach(({ term, colorIdx }) => {
    const re = new RegExp(escapeRegex(term), 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      intervals.push({ start: m.index, end: m.index + m[0].length, colorIdx });
    }
  });
  // 開始位置でソート、重複（後着優先スキップ）
  intervals.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Interval[] = [];
  for (const iv of intervals) {
    if (merged.length > 0 && iv.start < merged[merged.length - 1].end) continue;
    merged.push(iv);
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════════
// React 用: テキストをハイライト済み ReactNode に変換
// ═══════════════════════════════════════════════════════════════

/**
 * テキスト内のキーワードをKEYWORD_COLORSで色付けした ReactNode を返す。
 * キーワードがない／マッチがない場合は元の文字列を返す。
 */
export function highlightTextSpans(text: string, keyword: string): React.ReactNode {
  if (!keyword.trim() || !text) return text;

  const termColors = buildTermColors(keyword);
  if (termColors.length === 0) return text;

  const merged = findIntervals(text, termColors);
  if (merged.length === 0) return text;

  const nodes: React.ReactNode[] = [];
  let pos = 0;
  merged.forEach((iv, i) => {
    if (iv.start > pos) nodes.push(text.slice(pos, iv.start));
    nodes.push(
      <mark
        key={i}
        style={{
          backgroundColor: KEYWORD_COLORS[iv.colorIdx],
          color: '#f0f0f0',
          borderRadius: '2px',
          padding: '0 1px',
          fontStyle: 'normal',
        }}
      >
        {text.slice(iv.start, iv.end)}
      </mark>
    );
    pos = iv.end;
  });
  if (pos < text.length) nodes.push(text.slice(pos));

  return <>{nodes}</>;
}

// ═══════════════════════════════════════════════════════════════
// DOM 用: 通常の HTMLElement 内にハイライトを適用
// ═══════════════════════════════════════════════════════════════

/**
 * HTMLElement 内テキストノードにキーワードハイライトを適用。
 * MarkdownView や ChatCliView など直接 DOM に描画される要素に使用。
 */
export function applyElementHighlight(container: HTMLElement, keyword: string): void {
  container.querySelectorAll('mark.tt-hl').forEach(mark => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parent.normalize();
    }
  });

  if (!keyword.trim()) return;

  const termColors = buildTermColors(keyword);
  if (termColors.length === 0) return;

  const pattern = termColors.map(t => escapeRegex(t.term)).join('|');
  const regex = new RegExp(pattern, 'gi');

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript'].includes(tag)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent || '';
    regex.lastIndex = 0;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      }
      const matched = m[0];
      const matchedEntry = termColors.find(t => t.term.toLowerCase() === matched.toLowerCase());
      const colorIdx = matchedEntry?.colorIdx ?? 0;
      const mark = document.createElement('mark');
      mark.className = 'tt-hl';
      mark.style.backgroundColor = KEYWORD_COLORS[colorIdx];
      mark.style.color = '#f0f0f0';
      mark.style.borderRadius = '2px';
      mark.style.padding = '0 1px';
      mark.textContent = matched;
      frag.appendChild(mark);
      lastIndex = m.index + matched.length;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode!.replaceChild(frag, textNode);
  });
}

// ═══════════════════════════════════════════════════════════════
// DOM 用: iframe document 内にハイライトを適用
// ═══════════════════════════════════════════════════════════════

/**
 * iframe の contentDocument 内テキストノードにキーワードハイライトを適用。
 * 既存の .tt-hl マークを削除してから再適用する（同一オリジンのみ動作）。
 */
export function applyIframeHighlight(doc: Document, keyword: string): void {
  // 既存ハイライトを削除
  doc.querySelectorAll('mark.tt-hl').forEach(mark => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(doc.createTextNode(mark.textContent || ''), mark);
      parent.normalize();
    }
  });

  if (!keyword.trim()) return;

  const termColors = buildTermColors(keyword);
  if (termColors.length === 0) return;

  const pattern = termColors.map(t => escapeRegex(t.term)).join('|');
  const regex = new RegExp(pattern, 'gi');

  // テキストノードを収集（script/style/noscript は除外）
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript'].includes(tag)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent || '';
    regex.lastIndex = 0;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;

    const frag = doc.createDocumentFragment();
    let lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        frag.appendChild(doc.createTextNode(text.slice(lastIndex, m.index)));
      }
      const matched = m[0];
      const matchedEntry = termColors.find(t => t.term.toLowerCase() === matched.toLowerCase());
      const colorIdx = matchedEntry?.colorIdx ?? 0;
      const mark = doc.createElement('mark');
      mark.className = 'tt-hl';
      mark.style.backgroundColor = KEYWORD_COLORS[colorIdx];
      mark.style.color = '#f0f0f0';
      mark.style.borderRadius = '2px';
      mark.style.padding = '0 1px';
      mark.textContent = matched;
      frag.appendChild(mark);
      lastIndex = m.index + matched.length;
    }

    if (lastIndex < text.length) {
      frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode!.replaceChild(frag, textNode);
  });
}
