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

/** ローカル日時の yyyy-MM-dd HH:mm */
export function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatLocalDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** AIハーネスの log の記録1件のラベル。実行IDで今回の記録を見分ける */
export function harnessRunLabel(runId: string): string {
  return `実行 ${runId}`;
}

function runHeadingRe(runId: string): RegExp {
  const escaped = runId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^#\\s+\\[[^\\]]*\\]\\s+実行\\s+${escaped}(?:\\s|$)`);
}

/** log にこの実行の記録（「# [日時] 実行 {runId}」の行）があるか */
export function hasHarnessRunEntry(content: string, runId: string): boolean {
  const re = runHeadingRe(runId);
  return content.split(/\r?\n/).some(line => re.test(line.trim()));
}

/** log の先頭から n 件の記録（タイトル行を除く）。古い記録は AI が必要なときに MCP で読む */
export function latestAiViewEntries(content: string, n: number): string {
  const lines = content.split(/\r?\n/).slice(1);
  const out: string[] = [];
  let count = 0;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^#\s+\[/.test(line)) {
      count++;
      if (count > n) break;
    }
    if (count > 0) out.push(line);
  }
  return out.join('\n').trim();
}

/**
 * この実行の記録の末尾に、アプリが確かめた事実（関連chat・変更／作成した Think）を加える。
 * 記録が無ければ何もしない。
 */
export function appendToHarnessRunEntry(content: string, runId: string, footer: string[]): string {
  if (footer.length === 0) return content;
  const lines = content.split(/\r?\n/);
  const re = runHeadingRe(runId);
  const start = lines.findIndex(line => re.test(line.trim()));
  if (start === -1) return content;
  let end = lines.length;
  let inFence = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    if (!inFence && /^#\s+\[/.test(lines[i])) { end = i; break; }
  }
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  return [...lines.slice(0, end), ...footer, ...lines.slice(end)].join('\n');
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
