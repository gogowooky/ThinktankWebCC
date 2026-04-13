/**
 * markdownToHtml - 簡易Markdown→HTML変換
 *
 * 外部ライブラリ不使用の軽量実装。
 * 対応: 見出し(h1-h6), 太字, 斜体, コードブロック, インラインコード,
 *       リスト(ul/ol), テーブル(GFM), リンク, 水平線, 段落
 */

export function markdownToHtml(md: string): string {
  let html = md;

  // コードブロック（```...```）を先に処理（内部をエスケープ）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const escaped = escapeHtml(code.trimEnd());
    return `<pre><code>${escaped}</code></pre>`;
  });

  // 行単位処理
  const lines = html.split('\n');
  const result: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inPre = false;
  let tableLines: string[] = [];

  /** テーブル行かどうか（| で始まる行） */
  const isTableLine = (line: string) => line.trim().startsWith('|');

  /** テーブル行のセルを分割 */
  function parseTableCells(line: string): string[] {
    return line.trim()
      .replace(/^\|/, '').replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());
  }

  /** 区切り行（|:---:|）かどうか */
  function isSeparatorRow(cells: string[]): boolean {
    return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));
  }

  /** 区切り行からアライメント属性を取得 */
  function getCellAlign(cell: string): string {
    const c = cell.trim();
    if (c.startsWith(':') && c.endsWith(':')) return ' style="text-align:center"';
    if (c.endsWith(':')) return ' style="text-align:right"';
    if (c.startsWith(':')) return ' style="text-align:left"';
    return '';
  }

  /** 蓄積されたテーブル行を <table> に変換して result に追加 */
  function flushTable() {
    if (tableLines.length === 0) return;

    // 区切り行のインデックスを探す
    const sepIdx = tableLines.findIndex(line => {
      const cells = parseTableCells(line);
      return isSeparatorRow(cells);
    });

    if (sepIdx < 0) {
      // 区切り行なし → テーブルではないので段落として出力
      for (const line of tableLines) {
        result.push(`<p>${inlineFormat(line)}</p>`);
      }
      tableLines = [];
      return;
    }

    const alignments = parseTableCells(tableLines[sepIdx]).map(getCellAlign);

    result.push('<table>');

    // ヘッダー行（区切り行より前）
    if (sepIdx > 0) {
      result.push('<thead>');
      for (let i = 0; i < sepIdx; i++) {
        const cells = parseTableCells(tableLines[i]);
        result.push('<tr>' + cells.map((cell, ci) =>
          `<th${alignments[ci] ?? ''}>${inlineFormat(cell)}</th>`
        ).join('') + '</tr>');
      }
      result.push('</thead>');
    }

    // データ行（区切り行より後）
    const bodyLines = tableLines.slice(sepIdx + 1).filter(l => l.trim());
    if (bodyLines.length > 0) {
      result.push('<tbody>');
      for (const line of bodyLines) {
        const cells = parseTableCells(line);
        result.push('<tr>' + cells.map((cell, ci) =>
          `<td${alignments[ci] ?? ''}>${inlineFormat(cell)}</td>`
        ).join('') + '</tr>');
      }
      result.push('</tbody>');
    }

    result.push('</table>');
    tableLines = [];
  }

  function closeList() {
    if (inList === 'ul') { result.push('</ul>'); inList = null; }
    if (inList === 'ol') { result.push('</ol>'); inList = null; }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // <pre>内はそのまま
    if (line.includes('<pre>')) inPre = true;
    if (line.includes('</pre>')) { inPre = false; result.push(line); continue; }
    if (inPre) { result.push(line); continue; }

    // テーブル行の蓄積・終了
    if (isTableLine(line)) {
      closeList();
      tableLines.push(line);
      continue;
    } else if (tableLines.length > 0) {
      flushTable();
    }

    // 水平線
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeList();
      result.push('<hr>');
      continue;
    }

    // 見出し
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      result.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // 順序付きリスト
    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (inList !== 'ol') { closeList(); result.push('<ol>'); inList = 'ol'; }
      result.push(`<li>${inlineFormat(olMatch[2])}</li>`);
      continue;
    }

    // 順序なしリスト
    const ulMatch = line.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (inList !== 'ul') { closeList(); result.push('<ul>'); inList = 'ul'; }
      result.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // 空行
    if (line.trim() === '') {
      closeList();
      result.push('');
      continue;
    }

    // 通常テキスト（段落）
    closeList();
    result.push(`<p>${inlineFormat(line)}</p>`);
  }

  // 末尾処理
  if (tableLines.length > 0) flushTable();
  closeList();

  return result.join('\n');
}

/** インライン書式変換 */
function inlineFormat(text: string): string {
  let s = escapeHtml(text);
  // 太字
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // 斜体
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.+?)_/g, '<em>$1</em>');
  // インラインコード
  s = s.replace(/`(.+?)`/g, '<code>$1</code>');
  // リンク
  s = s.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

/** HTML特殊文字エスケープ */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
