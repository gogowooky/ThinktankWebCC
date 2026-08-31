/**
 * thinkFormat.ts
 * 各 ContentType（chat, links, bundle）に対応する、一元化されたパース・シリアライズモジュール。
 */

import type { ChatMessage } from '../types';

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
// #region AI相談: chatファイル選択ドロップボックス共通ロジック
// ════════════════════════════════════════════════════════════════════════

/** 各パネルのAI相談で扱う chat Think の識別プレフィックス（パネルごと・大文字小文字を区別しない） */
export const TODO_CHAT_PREFIX_THINKTANK = 'TODO:Thinktank｜';
export const TODO_CHAT_PREFIX_OVERVIEW  = 'TODO:Overview｜';
export const TODO_CHAT_PREFIX_WORKOUT   = 'TODO:Workout｜';
export const TODO_CHAT_PREFIX_RETHINK   = 'TODO:ReThink｜';

/** タイトルが指定プレフィックスで始まる Think かどうかを判定する（ContentType不問、大文字小文字を区別しない） */
export function isTodoThink(think: { Name: string }, prefix: string): boolean {
  return think.Name.toLowerCase().startsWith(prefix.toLowerCase());
}

/** chat Think が指定プレフィックスで始まる、AI相談の取り扱い対象かどうかを判定する */
export function isTodoChatThink(think: { ContentType: string; Name: string }, prefix: string): boolean {
  return think.ContentType === 'chat' && isTodoThink(think, prefix);
}

/**
 * 選択された Think の内容を Chat メッセージ配列としてロードする。
 * chat形式（## ユーザー発言）ならそのまま復元し、そうでなければ本文
 * （タイトル行を除く）をそのまま最初のユーザーメッセージとして扱う。
 */
export function loadChatFromThink(think: { Content: string } | undefined | null): ChatMessage[] {
  if (!think) return [];
  const parsed = parseChat(think.Content);
  if (parsed.length > 0) return parsed;
  const { body } = splitContent(think.Content);
  if (!body.trim()) return [];
  return [{
    id:        `u-${Date.now()}`,
    role:      'user',
    content:   body.trim(),
    timestamp: new Date().toISOString(),
  }];
}

/** AI相談のDataGrid先頭に置く「新規チャット」行の仮想ID。実在するThinkのIDとは衝突しない特殊値 */
export const NEW_CHAT_SENTINEL_ID = '__new_chat__';

/** タイトルにできる内容が chat に何もない場合のフォールバック（プレフィックス + 保存日時） */
export function newChatTitle(prefix: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return `${prefix}${date} ${time}`;
}

/**
 * 未保存の chat を初めて保存するときのタイトルを、会話内容から組み立てる
 * （最初のユーザー発言の冒頭を要約として使う）。
 * プレフィックスを付けるのは、保存後もAI相談のドロップボックス一覧（@プレフィックス始まりの
 * chat のみを対象とする）から見えるようにするため。
 */
export function chatContentTitle(prefix: string, messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user')?.content.trim() ?? '';
  const summary = firstUser.replace(/\s+/g, ' ').slice(0, 40);
  return summary ? `${prefix}${summary}` : newChatTitle(prefix);
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
// #region bundle 形式 (ContentType = 'bundle')
// ════════════════════════════════════════════════════════════════════════

export interface BundleCondition {
  dateStr: string;
  rangeStr: string;
}

export interface BundleContent {
  title: string;
  ids: string[];
  excludeIds?: string[];
  filter: {
    keyword?: string;
    createdRange?: BundleCondition;
    updatedRange?: BundleCondition;
  };
  search: {
    query?: string;
    createdRange?: BundleCondition;
    updatedRange?: BundleCondition;
  };
}

/**
 * Think ID とみなす形式。yyyy-MM-dd-HHmmss、および末尾サフィックス（AI 生成の -memo /
 * 衝突回避の -a3f9 等）を許容する。PROJECT_REVIEW_REPORT.md D-5。
 */
export const THINK_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{6}(?:-[A-Za-z0-9]+)?$/;

/**
 * bundle 本文を解析して構造化した BundleContent を返す
 */
export function parseBundle(content: string): BundleContent {
  const lines = content.split('\n');
  const rawTitle = lines[0] ?? '';
  const title = rawTitle.replace(/^>>?\s*/, '');
  const bodyLines = lines.slice(1);

  const ids: string[] = [];
  const excludeIds: string[] = [];
  const result: BundleContent = {
    title,
    ids,
    excludeIds,
    filter: {},
    search: {},
  };

  for (const line of bodyLines) {
    const s = line.trim();
    if (s.startsWith('* ')) {
      // 角括弧付き（AI が付けがち）も許容し、日付 ID + 任意サフィックス（-memo / -a3f9 等）を ID とみなす
      const id = s.slice(2).trim().replace(/^\[|\]$/g, '');
      if (id) {
        if (THINK_ID_RE.test(id)) {
          ids.push(id);
        } else {
          result.filter.keyword = result.filter.keyword ? `${result.filter.keyword} ${id}` : id;
        }
      }
    } else if (s.startsWith('- ')) {
      const id = s.slice(2).trim().replace(/^\[|\]$/g, '');
      if (id) {
        if (THINK_ID_RE.test(id)) {
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
 * bundle 新規作成オプション
 */
export interface BundleCreateOptions {
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
 * オプションから bundle 本文（テキスト）をシリアライズして生成する
 */
export function serializeBundle(options: BundleCreateOptions): string {
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
