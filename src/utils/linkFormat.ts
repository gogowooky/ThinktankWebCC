/**
 * linkFormat.ts
 * links 種別Thinkファイル（linkファイル）の書式と、参照側タグ [link:ID] 等の判定。
 *
 * linkファイルは1件のURL/パスを1ファイルにまとめる。本文の書式:
 *   1行目  タイトル
 *   2行目  空行、または = の連続
 *   3行目〜 # Link / # Affiliation / # Abstract の見出し
 * 旧書式（「* [タイトル](URL)」の箇条書きを並べたリンク集）は読み取りだけ互換を保つ。
 */

import { THINK_ID_RE } from './thinkFormat';

export type LinkTagName = 'gmail' | 'gdrive' | 'gphoto' | 'gnb' | 'path' | 'link';

export const LINK_TAG_NAMES: readonly LinkTagName[] = ['gmail', 'gdrive', 'gphoto', 'gnb', 'path', 'link'];

// ホスト名は完全一致で照合する（部分一致だと photos.google.com.example.test などを取り違える）
const HOST_TAGS: ReadonlyArray<{ tag: LinkTagName; hosts: readonly string[] }> = [
  { tag: 'gmail',  hosts: ['mail.google.com'] },
  // Docs/Sheets/Slides も Drive 上のファイルなので gdrive に含める
  { tag: 'gdrive', hosts: ['drive.google.com', 'docs.google.com'] },
  { tag: 'gphoto', hosts: ['photos.google.com', 'photos.app.goo.gl'] },
  // 旧 NotebookLM ドメインの保存済みリンクも Gemini Notebook とみなす
  { tag: 'gnb',    hosts: ['notebook.google.com', 'notebooklm.google.com'] },
];

const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;
const UNC_RE = /^\\\\[^\\]+\\[^\\]+/;
const URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** ローカルのファイルパスか。ブラウザ版のファイルD&Dではファイル名しか取れないため、スキーム無しも含める。 */
export function isLocalPathTarget(target: string): boolean {
  const s = target.trim();
  if (!s) return false;
  if (WINDOWS_DRIVE_RE.test(s) || s.startsWith('\\\\') || s.startsWith('/')) return true;
  if (/^file:/i.test(s)) return true;
  return !URL_SCHEME_RE.test(s);
}

function parseUrl(target: string): URL | null {
  try { return new URL(target.trim()); } catch { return null; }
}

/** リンク先のURL/パスから、参照タグに使うタグ名を決める（タグ名の判定はここだけで行う）。 */
export function linkTagNameOf(target: string): LinkTagName {
  if (isLocalPathTarget(target)) return 'path';
  const url = parseUrl(target);
  if (!url || url.protocol !== 'https:') return 'link';
  const host = url.hostname.toLowerCase();
  return HOST_TAGS.find(h => h.hosts.includes(host))?.tag ?? 'link';
}

/** パスのルート（ドライブ・UNC共有・Unixの最上位フォルダ）。判定できなければ空文字。 */
export function pathRootOf(path: string): string {
  const s = path.trim();
  if (WINDOWS_DRIVE_RE.test(s)) return s.slice(0, 2).toUpperCase();
  const unc = s.match(UNC_RE);
  if (unc) return unc[0];
  if (s.startsWith('/')) {
    const first = s.split('/').find(Boolean);
    return first ? `/${first}` : '/';
  }
  return '';
}

/** PC名が分からない環境（ブラウザ版）で Affiliation に入れる仮のPC名 */
export const UNKNOWN_PC_NAME = 'unknown';

/** # Affiliation の値。URLはサーバーアドレス、パスは「PC名:ルート」。 */
export function linkAffiliationOf(target: string, pcName: string): string {
  if (isLocalPathTarget(target)) {
    const root = pathRootOf(target);
    return root ? `${pcName || UNKNOWN_PC_NAME}:${root}` : '';
  }
  return parseUrl(target)?.host ?? '';
}

export interface LinkFile {
  title: string;
  link: string;
  affiliation: string;
  abstract: string;
}

const LINK_SECTIONS = ['Link', 'Affiliation', 'Abstract'] as const;
type LinkSection = typeof LINK_SECTIONS[number];
const SECTION_HEADING_RE = /^#\s+(Link|Affiliation|Abstract)\s*$/i;

export function serializeLinkFile(file: LinkFile): string {
  const lines = [
    file.title,
    '=',
    '# Link',
    file.link,
    '# Affiliation',
    ...(file.affiliation ? [file.affiliation] : []),
    '# Abstract',
    ...(file.abstract ? [file.abstract] : []),
  ];
  return lines.join('\n');
}

export function createLinkFile(title: string, target: string, pcName: string): LinkFile {
  return { title, link: target, affiliation: linkAffiliationOf(target, pcName), abstract: '' };
}

/**
 * linkファイル本文を読む。新書式の # Link が無ければ旧書式の先頭リンクを使う。
 * リンクが1件も読めなければ null。
 */
export function parseLinkFile(content: string): LinkFile | null {
  const lines = content.split(/\r?\n/);
  const title = lines[0] ?? '';
  const sections: Record<LinkSection, string[]> = { Link: [], Affiliation: [], Abstract: [] };
  let current: LinkSection | null = null;
  for (const line of lines.slice(1)) {
    const heading = line.trim().match(SECTION_HEADING_RE);
    if (heading) {
      current = LINK_SECTIONS.find(s => s.toLowerCase() === heading[1].toLowerCase()) ?? null;
      continue;
    }
    if (current) sections[current].push(line);
  }
  const link = sections.Link.map(l => l.trim()).find(Boolean);
  if (link) {
    return {
      title,
      link,
      affiliation: sections.Affiliation.join('\n').trim(),
      abstract: sections.Abstract.join('\n').trim(),
    };
  }
  const legacy = parseLegacyLinks(content)[0];
  return legacy ? { title, link: legacy.url, affiliation: '', abstract: '' } : null;
}

export interface LegacyLinkItem {
  title: string;
  url: string;
}

/** 旧書式（「* [タイトル](URL)」の箇条書き）のリンクを読む。タイトル行は飛ばす。 */
export function parseLegacyLinks(content: string): LegacyLinkItem[] {
  const links: LegacyLinkItem[] = [];
  for (const line of content.split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('* ')) continue;
    const body = trimmed.slice(2).trim();
    const match = body.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    links.push(match ? { title: match[1], url: match[2] } : { title: body, url: body });
  }
  return links;
}

export function formatLinkTag(tag: LinkTagName, thinkId: string): string {
  return `[${tag}:${thinkId}]`;
}

/**
 * [gdrive:ID] のような linkファイル参照タグなら、タグ名とThinkIDを返す。
 * 値がThinkIDでないもの（[GMail:検索語] 等）は別用途に残すため null。
 */
export function parseLinkTag(text: string): { tag: LinkTagName; thinkId: string } | null {
  const match = text.trim().match(/^\[([A-Za-z]+):\s*([^\]]*?)\s*\]$/);
  if (!match) return null;
  const tag = LINK_TAG_NAMES.find(t => t === match[1].toLowerCase());
  if (!tag || !THINK_ID_RE.test(match[2])) return null;
  return { tag, thinkId: match[2] };
}
