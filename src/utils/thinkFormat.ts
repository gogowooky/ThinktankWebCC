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
  /** 各見出しの値に書かれた Think 参照すべて（Projectの所属判定に使う） */
  ids: string[];
  /** # AIまとめ の [aiview:ID] */
  aiSummaryIds: string[];
  /** # AI議論 の [chat:ID] */
  aiDiscussionIds: string[];
}

export const PROJECT_AI_SUMMARY_HEADING = 'AIまとめ';
export const PROJECT_AI_DISCUSSION_HEADING = 'AI議論';
/**
 * Thinktank>プロジェクトの「root」で開く projectファイルのタイトル。
 * このタイトルの projectファイルは Thinktank パネルにだけ設定できる（Seeds には設定しない）
 */
export const ROOT_PROJECT_TITLE = 'Thinktank';

/** projectファイルが root（タイトル「Thinktank」）か */
export function isRootProjectTitle(title: string): boolean {
  return title.trim() === ROOT_PROJECT_TITLE;
}

/** テンプレートに置くAIへの指示の見出し（旧 # プロンプト を目的別に分けたもの）。中身は自由記述 */
export const PROJECT_PROMPT_HEADINGS = ['現状把握用プロンプト', '進捗把握用プロンプト', '実績把握用プロンプト'] as const;

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

/**
 * 見出し「# name」の直後から、次の見出し・空行・文書末のいずれか早い位置まで。
 * 空行は現在の項目値だけを終了し、その後の見出しは別項目として引き続き解析する。
 */
function projectSectionRange(lines: string[], name: string): { start: number; end: number } | null {
  const heading = new RegExp(`^#\\s+${name}\\s*$`);
  const headingIdx = lines.findIndex((l, idx) => idx > 0 && heading.test(l.trim()));
  if (headingIdx === -1) return null;
  const nextHeadingIdx = lines.findIndex((l, idx) => idx > headingIdx && /^#+\s+/.test(l.trim()));
  const blankIdx = lines.findIndex((l, idx) => idx > headingIdx && l.trim() === '');
  const candidates = [nextHeadingIdx, blankIdx, lines.length].filter(idx => idx !== -1);
  return { start: headingIdx + 1, end: Math.min(...candidates) };
}

/** 文書内の各見出しに対する値範囲。見出し間の自由記載は含めない。 */
function projectValueRanges(lines: string[]): Array<{ start: number; end: number }> {
  const knownHeadings = new Set<string>([
    '見通し', '状態', '対象', ...PROJECT_PROMPT_HEADINGS, '条件', PROJECT_AI_SUMMARY_HEADING, PROJECT_AI_DISCUSSION_HEADING,
  ]);
  const allHeadingIndexes = lines.flatMap((line, idx) => idx > 0 && /^#+\s+/.test(line.trim()) ? [idx] : []);
  const knownHeadingIndexes = allHeadingIndexes.filter(idx => knownHeadings.has(lines[idx].trim().replace(/^#+\s+/, '')));
  return knownHeadingIndexes.map(headingIdx => {
    const nextHeadingIdx = allHeadingIndexes.find(idx => idx > headingIdx) ?? lines.length;
    const blankIdx = lines.findIndex((line, idx) => idx > headingIdx && idx < nextHeadingIdx && line.trim() === '');
    return { start: headingIdx + 1, end: blankIdx === -1 ? nextHeadingIdx : blankIdx };
  });
}

// # AIまとめ は1行に [aiview:ID] を「,」区切り（CSV）で並べられる
function csvThinkRefs(line: string): Array<{ tag: string; id: string }> {
  return line.split(',').flatMap(cell => projectThinkRef(cell) ?? []);
}

function projectSectionIds(lines: string[], name: string): string[] {
  const range = projectSectionRange(lines, name);
  if (!range) return [];
  const refsOf = name === PROJECT_AI_SUMMARY_HEADING ? csvThinkRefs : (l: string) => projectThinkRef(l) ?? [];
  return lines.slice(range.start, range.end).flatMap(l => refsOf(l)).map(ref => ref.id);
}

/** # 対象 の値に直接記載された Think ID。AIまとめ・AI議論や自由記載は含めない。 */
export function projectTargetIds(content: string): string[] {
  const lines = content.split(/\r?\n/);
  return projectSectionIds(lines, '対象');
}

/**
 * project 本文を解析して構造化した ProjectContent を返す
 */
export function parseProject(content: string): ProjectContent {
  const lines = content.split(/\r?\n/);
  const rawTitle = lines[0] ?? '';
  const title = rawTitle.replace(/^>>?\s*/, '');
  const aiRange = projectSectionRange(lines, PROJECT_AI_SUMMARY_HEADING);
  const inAiSummary = (idx: number) => !!aiRange && idx >= aiRange.start && idx < aiRange.end;
  const valueRanges = projectValueRanges(lines);
  const hasAnyHeading = lines.some((line, idx) => idx > 0 && /^#+\s+/.test(line.trim()));
  const ids = (valueRanges.length > 0
    ? valueRanges.flatMap(range => lines.slice(range.start, range.end).map((line, offset) => ({ line, idx: range.start + offset })))
    : hasAnyHeading ? [] : lines.slice(1).map((line, offset) => ({ line, idx: offset + 1 })))
    .flatMap(({ line, idx }) => inAiSummary(idx) ? csvThinkRefs(line).map(ref => ref.id) : projectThinkRef(line)?.id ?? []);
  return {
    title,
    ids,
    aiSummaryIds: projectSectionIds(lines, PROJECT_AI_SUMMARY_HEADING),
    aiDiscussionIds: projectSectionIds(lines, PROJECT_AI_DISCUSSION_HEADING),
  };
}

/** 見出し「# name」の直後から、空行または次の見出しまでの値。 */
export function readProjectSectionText(content: string, name: string): string {
  const lines = content.split(/\r?\n/);
  const range = projectSectionRange(lines, name);
  if (!range) return '';
  return lines.slice(range.start, range.end).join('\n').trim();
}

/**
 * 要約の書き込み先となる AIViewファイルの ID。
 * # AIまとめ の先頭のCSV（見出し直後の1行目）の、先頭のタグの ID。無ければ null
 */
export function firstAiViewId(content: string): string | null {
  const lines = content.split(/\r?\n/);
  const range = projectSectionRange(lines, PROJECT_AI_SUMMARY_HEADING);
  if (!range) return null;
  const first = lines.slice(range.start, range.end).find(l => l.trim() !== '');
  if (!first) return null;
  return projectThinkRef(first.split(',')[0])?.id ?? null;
}

/**
 * # AIまとめ の先頭のCSVの先頭に [aiview:ID] を加える（次回からその AIViewファイルへ書き込むため）。
 * # AIまとめ が無ければ # AI議論 の前（それも無ければ末尾）に見出しごと加える
 */
export function addAiViewIdToHead(content: string, id: string): string {
  const tag = `[aiview:${id}]`;
  const lines = content.split(/\r?\n/);
  const range = projectSectionRange(lines, PROJECT_AI_SUMMARY_HEADING);
  if (!range) {
    const discussion = projectSectionRange(lines, PROJECT_AI_DISCUSSION_HEADING);
    const at = discussion ? discussion.start - 1 : lines.length;
    const head = lines.slice(0, at);
    while (head.length > 1 && head[head.length - 1].trim() === '') head.pop();
    return [...head, `# ${PROJECT_AI_SUMMARY_HEADING}`, tag, ...lines.slice(at)].join('\n');
  }
  const firstIdx = lines.findIndex((l, idx) => idx >= range.start && idx < range.end && l.trim() !== '');
  if (firstIdx === -1) {
    return [...lines.slice(0, range.start), tag, ...lines.slice(range.start)].join('\n');
  }
  const cells = lines[firstIdx].split(',').map(c => c.trim()).filter(c => c !== '');
  lines[firstIdx] = [tag, ...cells].join(',');
  return lines.join('\n');
}

/** @deprecated Use parseProject */
export const parseBundle = parseProject;

/**
 * Thinkファイルの metadata に記録する、自分を組み込んだ親 projectファイルの ID のキー（値は string）。
 * projectファイルの本文で参照されたときに付け、参照が外れたら消す。
 */
export const PARENT_PROJECT_ID_KEY = 'parentProjectid';

/** project の # 見通し に書ける値（このProjectが扱う粒度）。見出しの次の行に値だけを書く */
export const PROJECT_OUTLOOKS = ['ビジョン', 'エリア', 'テーマ', 'タスク', 'アクション', '未設定'] as const;
export type ProjectOutlook = typeof PROJECT_OUTLOOKS[number];

/** project の # 状態 に書ける値。見出しの次の行に値だけを書く（「状態値：」は付けない） */
export const PROJECT_STATES = ['未着手', '進行中', '待機', '保留', '完了', '中止', '不明', 'ツール'] as const;
export type ProjectState = typeof PROJECT_STATES[number];

function projectSectionValue<T extends string>(lines: string[], name: string, candidates: readonly T[]): T | null {
  const range = projectSectionRange(lines, name);
  if (!range) return null;
  const first = lines.slice(range.start, range.end).map(l => l.trim()).find(l => l !== '');
  // 2026-10-30 までの「状態値：進行中」形式のファイルも同じ値として絞り込めるようにする
  const value = first?.replace(/^状態値[：:]\s*/, '');
  return candidates.find(c => c === value) ?? null;
}

/**
 * project の # 見通し と # 状態 の値。
 * 見出しが無い・候補外の値は、見通しは「未設定」、状態は「不明」として扱う（一覧の絞り込みから漏らさないため）
 */
export function readProjectStatus(content: string): { outlook: ProjectOutlook; state: ProjectState } {
  const lines = content.split(/\r?\n/);
  return {
    outlook: projectSectionValue(lines, '見通し', PROJECT_OUTLOOKS) ?? '未設定',
    state:   projectSectionValue(lines, '状態', PROJECT_STATES) ?? '不明',
  };
}

/**
 * project 新規作成オプション
 */
export interface ProjectCreateOptions {
  title: string;
  ids?: string[];
  items?: ProjectTargetItem[];
  outlook?: ProjectOutlook;
  status?: ProjectState;
  conditions?: string;
  aiSummaryIds?: string[];
  aiDiscussionIds?: string[];
}

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
    options.outlook ?? '未設定',
    '# 状態',
    options.status ?? '未着手',
    '# 対象',
    ...targetLines,
    ...PROJECT_PROMPT_HEADINGS.map(h => `# ${h}`),
    '# 条件',
    ...(options.conditions ? [options.conditions] : []),
    `# ${PROJECT_AI_SUMMARY_HEADING}`,
    ...(options.aiSummaryIds ?? []).map(id => `[aiview:${id}]`),
    `# ${PROJECT_AI_DISCUSSION_HEADING}`,
    ...(options.aiDiscussionIds ?? []).map(id => `[chat:${id}]`),
  ];
  return lines.join('\n');
}

/**
 * 既存の project 本文の「# 対象」セクション内の Think 参照行を更新する。
 * 他のセクション（# 状態、# 現状把握用プロンプト等）や # 対象 内の非Think行（URL/パス/検索タグ等）は保持する。
 * 旧形式（# 対象 セクションが無い本文）の場合は新フォーマットで再生成する。
 */
/** # 対象 の1行目にこの記号だけを書くと、Vault の全ファイルを対象とする */
export const PROJECT_ALL_TARGETS_MARK = '*';

/** # 対象 の見出し直後の1行目が「*」なら、そのprojectは全ファイルを対象とする */
export function targetsAllThinks(content: string): boolean {
  const lines = content.split(/\r?\n/);
  const range = projectSectionRange(lines, '対象');
  if (!range) return false;
  const first = lines.slice(range.start, range.end).find(l => l.trim() !== '');
  return first?.trim() === PROJECT_ALL_TARGETS_MARK;
}

export function updateProjectTargets(content: string, items: ProjectTargetItem[]): string {
  const lines = content.split(/\r?\n/);
  const range = projectSectionRange(lines, '対象');
  if (!range) {
    const insertBefore = new Set<string>([
      ...PROJECT_PROMPT_HEADINGS, '条件', PROJECT_AI_SUMMARY_HEADING, PROJECT_AI_DISCUSSION_HEADING,
    ]);
    const at = lines.findIndex((line, idx) => idx > 0 && [...insertBefore].some(name => new RegExp(`^#\\s+${name}\\s*$`).test(line.trim())));
    const insertion = at === -1 ? lines.length : at;
    return [
      ...lines.slice(0, insertion), '# 対象', ...items.map(formatProjectTargetLine), ...lines.slice(insertion),
    ].join('\n');
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
  // 全ファイル対象の「*」は1行目にあることが意味を持つので、書き直しても先頭に残す
  const allMark = targetsAllThinks(content) ? [PROJECT_ALL_TARGETS_MARK] : [];
  const restLines = allMark.length ? nonThinkLines.filter(l => l.trim() !== PROJECT_ALL_TARGETS_MARK) : nonThinkLines;
  const newTargetLines = [...allMark, ...items.filter(i => !aiIds.has(i.id)).map(formatLine), ...restLines];

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
