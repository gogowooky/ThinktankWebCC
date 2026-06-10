// chat, links, thought 形式テキストのパース・シリアライズ（仕様書03 §2）

import type { ChatMessage } from '../types';

/** 1行目からタイトルを抽出（先頭の #+ とスペースを除去） */
export function extractTitle(content: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  return firstLine.replace(/^#+\s*/, '').replace(/^>+\s*/, '').trim();
}

// ── chat 形式 ───────────────────────────────────────────

/** `## ` 行を user、それ以外を assistant として復元する */
export function parseChat(content: string): { title: string; messages: ChatMessage[] } {
  const lines = content.split('\n');
  const title = extractTitle(content);
  const messages: ChatMessage[] = [];
  let assistantBuf: string[] = [];

  const flushAssistant = () => {
    const text = assistantBuf.join('\n').trim();
    if (text) messages.push({ role: 'assistant', content: text });
    assistantBuf = [];
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      flushAssistant();
      messages.push({ role: 'user', content: line.slice(3).trim() });
    } else {
      assistantBuf.push(line);
    }
  }
  flushAssistant();
  return { title, messages };
}

export function serializeChat(title: string, messages: ChatMessage[]): string {
  const lines: string[] = [title];
  for (const m of messages) {
    if (m.role === 'user') {
      lines.push(`## ${m.content.replace(/\n/g, ' ')}`);
    } else {
      lines.push(m.content, '');
    }
  }
  return lines.join('\n');
}

// ── links 形式 ──────────────────────────────────────────

export interface LinkItem {
  label: string;
  url: string;
}

export function parseLinks(content: string): { title: string; links: LinkItem[] } {
  const lines = content.split('\n');
  const title = extractTitle(content);
  const links: LinkItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('* ')) continue;
    const m = line.slice(2).trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m) links.push({ label: m[1], url: m[2] });
  }
  return { title, links };
}

export function serializeLinks(title: string, links: LinkItem[]): string {
  return [title, ...links.map((l) => `* [${l.label}](${l.url})`)].join('\n');
}

// ── thought 形式 ────────────────────────────────────────

export interface ThoughtFilter {
  keyword?: string;
  createdRange?: string;
  updatedRange?: string;
}

export interface ParsedThought {
  title: string;
  ids: string[];
  filter: ThoughtFilter;      // `> ` 行: メタデータフィルタ
  searchFilter: ThoughtFilter; // `>> ` 行: 全文検索フィルタ
}

const FILTER_KEYS: Record<string, keyof ThoughtFilter> = {
  'keyword': 'keyword',
  '検索語': 'keyword',
  '作成日': 'createdRange',
  '更新日': 'updatedRange',
};

function parseFilterLine(line: string, target: ThoughtFilter): void {
  const m = line.match(/^([^：:]+)[：:](.*)$/);
  if (!m) return;
  const key = FILTER_KEYS[m[1].trim().toLowerCase()] ?? FILTER_KEYS[m[1].trim()];
  if (key) target[key] = m[2].trim();
}

export function parseThought(content: string): ParsedThought {
  const lines = content.split('\n');
  const title = extractTitle(content);
  const ids: string[] = [];
  const filter: ThoughtFilter = {};
  const searchFilter: ThoughtFilter = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('* ')) {
      const id = line.slice(2).trim();
      if (id) ids.push(id);
    } else if (line.startsWith('>> ')) {
      parseFilterLine(line.slice(3).trim(), searchFilter);
    } else if (line.startsWith('> ')) {
      parseFilterLine(line.slice(2).trim(), filter);
    }
  }
  return { title, ids, filter, searchFilter };
}

export function serializeThought(t: ParsedThought): string {
  const lines: string[] = [t.title];
  if (t.filter.keyword) lines.push(`> Keyword：${t.filter.keyword}`);
  if (t.filter.createdRange) lines.push(`> 作成日：${t.filter.createdRange}`);
  if (t.filter.updatedRange) lines.push(`> 更新日：${t.filter.updatedRange}`);
  if (t.searchFilter.keyword) lines.push(`>> 検索語：${t.searchFilter.keyword}`);
  if (t.searchFilter.createdRange) lines.push(`>> 作成日：${t.searchFilter.createdRange}`);
  if (t.searchFilter.updatedRange) lines.push(`>> 更新日：${t.searchFilter.updatedRange}`);
  for (const id of t.ids) lines.push(`* ${id}`);
  return lines.join('\n');
}
