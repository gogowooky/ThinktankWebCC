/**
 * aiViewFormat.ts
 * AIViewファイル（ContentType = 'aiview'）の日報形式。
 * 1行目はタイトル（projectファイルと揃える）、以降は「# [yyyy-MM-dd] ○○要約」をタイトル行にした記録を新しいものから並べる。
 * 記録の2行目は「(AIモデル名)」、要約は3行目から。
 */

/** ローカル日付の yyyy-MM-dd */
export function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 要約の中の「#」見出しを1段下げる。
 * 記録の区切りの「# [yyyy-MM-dd] ○○要約」と同じ階層を要約側で使わせないため
 */
export function demoteHeadings(text: string): string {
  let inFence = false;
  return text.split(/\r?\n/).map(line => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) return line;
    return /^#\s/.test(line) ? `#${line}` : line;
  }).join('\n');
}

export interface AiViewEntry {
  date: string;
  /** 現状要約・進捗要約・実績要約 */
  label: string;
  /** タイトル行の次の行に「(モデル名)」として書く */
  model?: string;
  body: string;
}

/** 記録1件のタイトル行 */
export function aiViewEntryHeading(date: string, label: string): string {
  return `# [${date}] ${label}`;
}

/** AIViewファイルの先頭（タイトル行の直後）に記録を1件加え、タイトルを title に揃える */
export function prependAiViewEntry(content: string, title: string, entry: AiViewEntry): string {
  const nl = content.indexOf('\n');
  const rest = nl === -1 ? '' : content.slice(nl + 1).replace(/^(?:[ \t]*\r?\n)+/, '');
  const block = [
    aiViewEntryHeading(entry.date, entry.label),
    ...(entry.model ? [`(${entry.model})`] : []),
    demoteHeadings(entry.body.trim()),
  ].join('\n');
  return rest.trim() ? `${title}\n${block}\n\n${rest}` : `${title}\n${block}\n`;
}
