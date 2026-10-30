/**
 * thinkFormat.ts
 * 各 ContentType（chat, bundle）に対応する、一元化されたパース・シリアライズモジュール。
 * links は linkFormat.ts、table は tableFormat.ts。
 */

import type { ChatMessage } from '../types';
import { parseManagedChatTitle } from './managedChat';
import { findFrontmatterRange, extractFrontmatterTitle } from './markdownSections';
import { projectTargetTag } from '../../shared/vaultFormat';

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
export const TODO_CHAT_PREFIX_SEEDS  = 'TODO:Seeds｜';
export const TODO_CHAT_PREFIX_DEVELOP   = 'TODO:Working｜';
export const TODO_CHAT_PREFIX_HARVEST   = 'TODO:Harvest｜';

/** タイトルが指定プレフィックスで始まる Think かどうかを判定する（ContentType不問、大文字小文字を区別しない） */
export function isTodoThink(think: { Name: string }, prefix: string): boolean {
  return think.Name.toLowerCase().startsWith(prefix.toLowerCase());
}

/** chat Think が指定プレフィックスで始まる、AI相談の取り扱い対象かどうかを判定する */
export function isTodoChatThink(think: { ContentType: string; Name: string }, prefix: string): boolean {
  const info = parseManagedChatTitle(think.Name);
  const owner = prefix.split(':')[1]?.replace(/[｜|].*$/, '');
  return think.ContentType === 'chat' && !!info && info.panel.toLowerCase() === owner?.toLowerCase();
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

// links 形式（ContentType = 'links'）は linkFormat.ts

// ════════════════════════════════════════════════════════════════════════
// #region project 形式 (ContentType = 'project')
// ════════════════════════════════════════════════════════════════════════

export interface ProjectTargetItem {
  id: string;
  contentType?: string;
  title?: string;
}

export interface ProjectContent {
  title: string;
  /** 本文のどこかに書かれた Think 参照すべて（Projectの所属判定に使う） */
  ids: string[];
  /** # AIまとめ の [aiview:ID] */
  aiSummaryIds: string[];
  /** # AI議論 の [chat:ID] */
  aiDiscussionIds: string[];
}

export const PROJECT_AI_SUMMARY_HEADING = 'AIまとめ';
export const PROJECT_AI_DISCUSSION_HEADING = 'AI議論';

/** @deprecated Use ProjectContent */
export type BundleContent = ProjectContent;

/**
 * Think ID とみなす形式。yyyy-MM-dd-HHmmss、および末尾サフィックス（AI 生成の -memo /
 * 衝突回避の -a3f9 / 旧PC名付きの -LAPTOP-5FOVA1SU 等）を許容する。
 */
export const THINK_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{6}(?:-[A-Za-z0-9]+)*$/;

const PROJECT_THINK_TAG_RE = /^(?:\*\s+)?\[(?:([A-Za-z0-9_-]+):)?([^\]:\s]+)\]/;

export function isProjectThinkLine(line: string): boolean {
  const s = line.trim();
  const tagMatch = s.match(PROJECT_THINK_TAG_RE);
  if (tagMatch && THINK_ID_RE.test(tagMatch[2])) return true;
  if (s.startsWith('* ')) {
    const id = s.slice(2).trim().replace(/^\[|\]$/g, '');
    if (THINK_ID_RE.test(id)) return true;
  }
  return false;
}

export function formatProjectTargetLine(item: ProjectTargetItem): string {
  const tag = projectTargetTag(item.contentType || 'memo');
  return item.title ? `[${tag}:${item.id}]: ${item.title}` : `[${tag}:${item.id}]`;
}

/** 行に書かれた Think 参照のタグ名とID。Think参照でなければ null */
function projectThinkRef(line: string): { tag: string; id: string } | null {
  const s = line.trim();
  const tagMatch = s.match(PROJECT_THINK_TAG_RE);
  if (tagMatch) return THINK_ID_RE.test(tagMatch[2]) ? { tag: tagMatch[1] ?? '', id: tagMatch[2] } : null;
  if (s.startsWith('* ')) {
    const id = s.slice(2).trim().replace(/^\[|\]$/g, '');
    if (THINK_ID_RE.test(id)) return { tag: '', id };
  }
  return null;
}

/** 見出し「# name」の直後から次の見出しまでの行の範囲。見出しが無ければ null */
function projectSectionRange(lines: string[], name: string): { start: number; end: number } | null {
  const heading = new RegExp(`^#\\s+${name}\\s*$`);
  const headingIdx = lines.findIndex((l, idx) => idx > 0 && heading.test(l.trim()));
  if (headingIdx === -1) return null;
  const nextIdx = lines.findIndex((l, idx) => idx > headingIdx && /^#+\s+/.test(l.trim()));
  return { start: headingIdx + 1, end: nextIdx === -1 ? lines.length : nextIdx };
}

function projectSectionIds(lines: string[], name: string): string[] {
  const range = projectSectionRange(lines, name);
  if (!range) return [];
  return lines.slice(range.start, range.end).flatMap(l => projectThinkRef(l)?.id ?? []);
}

/**
 * project 本文を解析して構造化した ProjectContent を返す
 */
export function parseProject(content: string): ProjectContent {
  const lines = content.split(/\r?\n/);
  const rawTitle = lines[0] ?? '';
  const title = rawTitle.replace(/^>>?\s*/, '');
  const ids = lines.slice(1).flatMap(l => projectThinkRef(l)?.id ?? []);
  return {
    title,
    ids,
    aiSummaryIds: projectSectionIds(lines, PROJECT_AI_SUMMARY_HEADING),
    aiDiscussionIds: projectSectionIds(lines, PROJECT_AI_DISCUSSION_HEADING),
  };
}

/** @deprecated Use parseProject */
export const parseBundle = parseProject;

/**
 * project 新規作成オプション
 */
export interface ProjectCreateOptions {
  title: string;
  ids?: string[];
  items?: ProjectTargetItem[];
  outlook?: string;
  status?: string;
  prompt?: string;
  conditions?: string;
  aiSummaryIds?: string[];
  aiDiscussionIds?: string[];
}

/** @deprecated Use ProjectCreateOptions */
export type BundleCreateOptions = ProjectCreateOptions;

/**
 * オプションから project 本文（Markdownテキスト）をシリアライズして生成する
 */
export function serializeProject(options: ProjectCreateOptions): string {
  const { title, ids = [], items } = options;
  const targetLines = items
    ? items.map(formatProjectTargetLine)
    : ids.map(id => formatProjectTargetLine({ id }));

  const lines: string[] = [
    title,
    '=',
    '# 見通し',
    ...(options.outlook ? [options.outlook] : []),
    '# 状態',
    `状態値：${options.status ?? '未着手'}`,
    '# 対象',
    ...targetLines,
    '# プロンプト',
    ...(options.prompt ? [options.prompt] : []),
    '# 条件',
    ...(options.conditions ? [options.conditions] : []),
    `# ${PROJECT_AI_SUMMARY_HEADING}`,
    ...(options.aiSummaryIds ?? []).map(id => `[aiview:${id}]`),
    `# ${PROJECT_AI_DISCUSSION_HEADING}`,
    ...(options.aiDiscussionIds ?? []).map(id => `[chat:${id}]`),
  ];
  return lines.join('\n');
}

/** @deprecated Use serializeProject */
export const serializeBundle = serializeProject;

/**
 * 既存の project 本文の「# 対象」セクション内の Think 参照行を更新する。
 * 他のセクション（# 状態、# プロンプト等）や # 対象 内の非Think行（URL/パス/検索タグ等）は保持する。
 * 旧形式（# 対象 セクションが無い本文）の場合は新フォーマットで再生成する。
 */
export function updateProjectTargets(content: string, items: ProjectTargetItem[]): string {
  const lines = content.split(/\r?\n/);
  const range = projectSectionRange(lines, '対象');
  if (!range) {
    const parsed = parseProject(content);
    return serializeProject({ title: parsed.title, items });
  }

  // 呼び出し元は本文全体の参照（ids）から items を作るため、AIまとめ・AI議論の参照が
  // 混ざってくる。そのままだと # 対象 へ重複して書き足されるので除く。
  const parsed = parseProject(content);
  const aiIds = new Set([...parsed.aiSummaryIds, ...parsed.aiDiscussionIds]);
  const sectionLines = lines.slice(range.start, range.end);
  // [gdrive:ID] のように手で（または本文から）付けた詳しいLinkタグは書き換えで失わない
  const existingTags = new Map(sectionLines.flatMap(l => {
    const ref = projectThinkRef(l);
    return ref ? [[ref.id, ref.tag] as const] : [];
  }));
  const formatLine = (item: ProjectTargetItem): string => {
    const existing = existingTags.get(item.id);
    const keepTag = item.contentType === 'links' && existing && existing !== 'links';
    const line = formatProjectTargetLine(item);
    return keepTag ? line.replace(/^\[[^:\]]*:/, `[${existing}:`) : line;
  };
  const nonThinkLines = sectionLines.filter(l => l.trim() !== '' && !isProjectThinkLine(l));
  const newTargetLines = [...items.filter(i => !aiIds.has(i.id)).map(formatLine), ...nonThinkLines];

  return [
    ...lines.slice(0, range.start),
    ...newTargetLines,
    ...lines.slice(range.end),
  ].join('\n');
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

/**
 * タイトル行を取得する。
 * 先頭にYAML frontmatterがあれば、その "title:" キーの値を優先し、無ければ
 * frontmatter直後の行（content部分の先頭行）を使う。frontmatterが無ければ
 * 従来通りContent全体の先頭行を使う（TTThink.Name・TextEditorのPaneタイトルの抽出元）。
 */
export function extractTitleLine(content: string): string {
  const frontmatterTitle = extractFrontmatterTitle(content);
  if (frontmatterTitle !== null) return frontmatterTitle;
  const frontmatter = findFrontmatterRange(content);
  if (frontmatter) {
    // CRLF（"\r\n"）保存時に各行末へ残る "\r" を title に混入させないよう、
    // "\n" 単独ではなく CRLF/LF 双方を1つの区切りとして分割する。
    const lines = content.split(/\r\n|\n/);
    return lines[frontmatter.end] ?? '';
  }
  return splitContent(content).title;
}

// #endregion
