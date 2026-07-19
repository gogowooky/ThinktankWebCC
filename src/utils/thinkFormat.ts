/**
 * thinkFormat.ts
 * 各 ContentType（chat, links, thought）に対応する、一元化されたパース・シリアライズモジュール。
 */

import type { ChatMessage } from '../types';
import { computeDateRange } from './dateUtils';

// ════════════════════════════════════════════════════════════════════════
// #region chat 形式 (ContentType = 'chat')
// ════════════════════════════════════════════════════════════════════════

/**
 * chat 本文を解析してメッセージオブジェクトの配列を返す
 */
export function parseChat(content: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      const userText = line.slice(3).trim();
      if (userText) {
        messages.push({ id: `u-${i}`, role: 'user', content: userText, timestamp: '' });
      }
      i++;
      const aiLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('## ')) {
        aiLines.push(lines[i]);
        i++;
      }
      const aiText = aiLines.join('\n').trim();
      if (aiText) {
        messages.push({ id: `a-${i}`, role: 'assistant', content: aiText, timestamp: '' });
      }
    } else {
      i++;
    }
  }
  return messages;
}

/**
 * メッセージオブジェクト配列から chat 本文（テキスト）をシリアライズして生成する
 */
export function serializeChat(messages: ChatMessage[], title?: string): string {
  const body = messages
    .map(m => (m.role === 'user' ? `## ${m.content}` : m.content))
    .join('\n');
  
  if (title) {
    return `${title}\n${body}`;
  }
  return body;
}

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region links 形式 (ContentType = 'links')
// ════════════════════════════════════════════════════════════════════════

export interface LinkItem {
  title: string;
  url: string;
}

/**
 * links 本文を解析してリンクオブジェクトの配列を返す（タイトル行はスキップ）
 */
export function parseLinks(content: string): LinkItem[] {
  const links: LinkItem[] = [];
  const lines = content.split('\n').slice(1);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('* ')) continue;
    const body = trimmed.slice(2).trim();
    const match = body.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      links.push({ title: match[1], url: match[2] });
    } else {
      links.push({ title: body, url: body });
    }
  }
  return links;
}

/**
 * リンク配列から links 本文（テキスト）をシリアライズして生成する
 */
export function serializeLinks(title: string, links: LinkItem[]): string {
  const body = links.map(link => `* [${link.title}](${link.url})`).join('\n');
  return `${title}\n${body}`;
}

/**
 * 既存のコンテンツ末尾にリンクを追記する
 */
export function appendLinkToContent(content: string, link: LinkItem): string {
  const trimmed = content.trimEnd();
  return trimmed + `\n\n* [${link.title}](${link.url})`;
}

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region thought 形式 (ContentType = 'thought')
// ════════════════════════════════════════════════════════════════════════

export interface ThoughtCondition {
  dateStr: string;
  rangeStr: string;
}

export interface ThoughtContent {
  title: string;
  ids: string[];
  excludeIds?: string[];
  filter: {
    keyword?: string;
    createdRange?: ThoughtCondition;
    updatedRange?: ThoughtCondition;
  };
  search: {
    query?: string;
    createdRange?: ThoughtCondition;
    updatedRange?: ThoughtCondition;
  };
}

/**
 * thought 本文を解析して構造化した ThoughtContent を返す
 */
export function parseThought(content: string): ThoughtContent {
  const lines = content.split('\n');
  const rawTitle = lines[0] ?? '';
  const title = rawTitle.replace(/^>>?\s*/, '');
  const bodyLines = lines.slice(1);

  const ids: string[] = [];
  const excludeIds: string[] = [];
  const result: ThoughtContent = {
    title,
    ids,
    excludeIds,
    filter: {},
    search: {},
  };

  for (const line of bodyLines) {
    const s = line.trim();
    if (s.startsWith('* ')) {
      const id = s.slice(2).trim();
      if (id) {
        if (/^\d{4}-\d{2}-\d{2}-\d{6}$/.test(id)) {
          ids.push(id);
        } else {
          result.filter.keyword = result.filter.keyword ? `${result.filter.keyword} ${id}` : id;
        }
      }
    } else if (s.startsWith('- ')) {
      const id = s.slice(2).trim();
      if (id) {
        if (/^\d{4}-\d{2}-\d{2}-\d{6}$/.test(id)) {
          excludeIds.push(id);
        }
      }
    } else if (s.startsWith('>> ')) {
      const body = s.slice(3).trim();
      if (body.startsWith('検索語：')) {
        result.search.query = body.slice(4).trim();
      } else if (body.startsWith('作成日：')) {
        const [d, r] = body.slice(4).split(',').map(v => v.trim());
        result.search.createdRange = { dateStr: d ?? '', rangeStr: r ?? '' };
      } else if (body.startsWith('更新日：')) {
        const [d, r] = body.slice(4).split(',').map(v => v.trim());
        result.search.updatedRange = { dateStr: d ?? '', rangeStr: r ?? '' };
      }
    } else if (s.startsWith('> ')) {
      const body = s.slice(2).trim();
      if (body.startsWith('作成日：')) {
        const [d, r] = body.slice(4).split(',').map(v => v.trim());
        result.filter.createdRange = { dateStr: d ?? '', rangeStr: r ?? '' };
      } else if (body.startsWith('更新日：')) {
        const [d, r] = body.slice(4).split(',').map(v => v.trim());
        result.filter.updatedRange = { dateStr: d ?? '', rangeStr: r ?? '' };
      } else if (body.startsWith('Keyword：')) {
        result.filter.keyword = body.slice('Keyword：'.length).trim();
      } else if (!body.includes('：')) {
        result.filter.keyword = body;
      }
    }
  }

  return result;
}

/**
 * thought 新規作成オプション
 */
export interface ThoughtCreateOptions {
  prefix: string; // "> " または ">> "
  title: string;
  searchQuery?: string;
  filterKeyword?: string;
  dates?: {
    createdDate?: string;
    createdRange?: string;
    updatedDate?: string;
    updatedRange?: string;
  };
  ids?: string[];
  excludeIds?: string[];
}

/**
 * オプションから thought 本文（テキスト）をシリアライズして生成する
 */
export function serializeThought(options: ThoughtCreateOptions): string {
  const { prefix, title, searchQuery, filterKeyword, dates, ids = [], excludeIds = [] } = options;
  let body = '';

  if (prefix === '>> ') {
    if (searchQuery) body += `>> 検索語：${searchQuery}\n`;
    if (dates?.createdDate || dates?.createdRange) {
      body += `>> 作成日：${dates.createdDate || ''}, ${dates.createdRange || ''}\n`;
    }
    if (dates?.updatedDate || dates?.updatedRange) {
      body += `>> 更新日：${dates.updatedDate || ''}, ${dates.updatedRange || ''}\n`;
    }
  } else if (prefix === '> ') {
    if (filterKeyword) body += `> Keyword：${filterKeyword}\n`;
    if (dates?.createdDate || dates?.createdRange) {
      body += `> 作成日：${dates.createdDate || ''}, ${dates.createdRange || ''}\n`;
    }
    if (dates?.updatedDate || dates?.updatedRange) {
      body += `> 更新日：${dates.updatedDate || ''}, ${dates.updatedRange || ''}\n`;
    }
  }

  if (ids.length > 0) {
    body += ids.map(id => `* ${id}`).join('\n') + '\n';
  }
  if (excludeIds.length > 0) {
    body += excludeIds.map(id => `- ${id}`).join('\n') + '\n';
  }

  return `${title}\n${body.trim()}`;
}

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region 共通: title\nbody 形式の分割
// ════════════════════════════════════════════════════════════════════════

/** 先頭行をtitle、残りをbodyとして分割する（全ContentType共通のThink格納形式） */
export function splitContent(fullContent: string): { title: string; body: string } {
  const nl = fullContent.indexOf('\n');
  if (nl === -1) return { title: fullContent, body: '' };
  return { title: fullContent.slice(0, nl), body: fullContent.slice(nl + 1) };
}

// #endregion
