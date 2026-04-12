/**
 * markdownToHtml - サーバーサイド用 簡易Markdown→HTML変換
 * src/utils/markdownToHtml.ts と同一ロジック
 */

export function markdownToHtml(md: string): string {
  let html = md;

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const escaped = escapeHtml(code.trimEnd());
    return `<pre><code>${escaped}</code></pre>`;
  });

  const lines = html.split('\n');
  const result: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inPre = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('<pre>')) inPre = true;
    if (line.includes('</pre>')) { inPre = false; result.push(line); continue; }
    if (inPre) { result.push(line); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeList(); result.push('<hr>'); continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      result.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (inList !== 'ol') { closeList(); result.push('<ol>'); inList = 'ol'; }
      result.push(`<li>${inlineFormat(olMatch[2])}</li>`);
      continue;
    }

    const ulMatch = line.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (inList !== 'ul') { closeList(); result.push('<ul>'); inList = 'ul'; }
      result.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    if (line.trim() === '') { closeList(); result.push(''); continue; }

    closeList();
    result.push(`<p>${inlineFormat(line)}</p>`);
  }
  closeList();

  return result.join('\n');

  function closeList() {
    if (inList === 'ul') { result.push('</ul>'); inList = null; }
    if (inList === 'ol') { result.push('</ol>'); inList = null; }
  }
}

function inlineFormat(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.+?)_/g, '<em>$1</em>');
  s = s.replace(/`(.+?)`/g, '<code>$1</code>');
  s = s.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
