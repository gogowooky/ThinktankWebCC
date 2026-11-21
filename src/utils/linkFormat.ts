/**
 * linkFormat.ts
 * links 種別Thinkファイル（linkファイル）の書式と、参照側タグ [link:ID] 等の判定。
 *
 * linkファイルは1件のURL/パスを1ファイルにまとめる。本文の書式:
 *   1行目  タイトル
 *   2行目  空行、または = の連続
 *   3行目〜 # Caption / # Link / # Affiliation / # Abstract の見出し
 *   pathは # Link で引用符に包み、# Affiliation は「(PC名)親フォルダ」とする。
 * 旧書式（「* [タイトル](URL)」の箇条書きを並べたリンク集）は読み取りだけ互換を保つ。
 */

import { THINK_ID_RE } from './thinkFormat';

export type LinkTagName = 'gmail' | 'gdrive' | 'gphoto' | 'gnb' | 'file' | 'dir' | 'link';

export const LINK_TAG_NAMES: readonly LinkTagName[] = ['gmail', 'gdrive', 'gphoto', 'gnb', 'file', 'dir', 'link'];

/**
 * リンク先の種別。ローカルのパスはファイルかフォルダかをURL/パスだけでは決めきれないため path とし、
 * 参照タグにするときに file / dir へ分ける（linkTagOfFile / linkTagOfTarget）。
 */
export type LinkKind = Exclude<LinkTagName, 'file' | 'dir'> | 'path';

// ホスト名は完全一致で照合する（部分一致だと photos.google.com.example.test などを取り違える）
const HOST_TAGS: ReadonlyArray<{ tag: LinkKind; hosts: readonly string[] }> = [
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

/** リンク先のURL/パスから種別を決める（ホスト名による判定はここだけで行う）。 */
export function linkKindOf(target: string): LinkKind {
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

/** ファイル／ディレクトリパスの親フォルダ。絶対パスでなければ空文字。 */
export function parentFolderOf(target: string): string {
  let s = target.trim();
  if (/^file:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      s = decodeURIComponent(url.pathname).replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\');
    } catch { return ''; }
  }
  if (!WINDOWS_DRIVE_RE.test(s) && !s.startsWith('\\\\') && !s.startsWith('/')) return '';

  // 末尾区切りは「ドロップ対象ディレクトリ自身」の末尾とみなし、まず除去する。
  const driveRoot = /^[a-zA-Z]:[\\/]$/.test(s);
  const unixRoot = s === '/';
  if (!driveRoot && !unixRoot) s = s.replace(/[\\/]+$/, '');
  const lastSeparator = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
  if (lastSeparator < 0) return '';
  if (/^[a-zA-Z]:/.test(s) && lastSeparator === 2) return s.slice(0, 3);
  if (lastSeparator === 0) return '/';
  return s.slice(0, lastSeparator);
}

/** PC名が分からない環境（ブラウザ版）で Affiliation に入れる仮のPC名 */
export const UNKNOWN_PC_NAME = 'unknown';

/** # Affiliation の論理値。URLはサーバーアドレス、パスは「(PC名)親フォルダ」。 */
export function linkAffiliationOf(target: string, pcName: string): string {
  if (isLocalPathTarget(target)) {
    return `(${pcName || UNKNOWN_PC_NAME})${parentFolderOf(target)}`;
  }
  return parseUrl(target)?.host ?? '';
}

export interface LinkFile {
  title: string;
  /** 参照タグの後ろに添える短い表示名。旧ファイルでは空のことがある（captionOfLinkFile で補う） */
  caption: string;
  link: string;
  affiliation: string;
  abstract: string;
}

/** linkファイル作成時に、ドロップ等から分かったリンク先の情報 */
export interface LinkSource {
  target: string;
  /** URL/パスから推測した仮のタイトル */
  title: string;
  /** ブラウザのドラッグ情報等から得たリンク先の本当のタイトル（分からなければ undefined） */
  pageTitle?: string;
  isDirectory?: boolean;
}

/** 参照タグの後ろに Caption を添えるタグ */
const CAPTIONED_TAGS: readonly LinkTagName[] = ['gmail', 'gdrive', 'link', 'file', 'dir'];

// ブラウザのタブ名に付く「 - Google ドライブ」等のサービス名を外し、ファイル名・件名だけにする
const GOOGLE_TITLE_SUFFIX_RE = /\s+[-–]\s+Google\s*(?:ドライブ|Drive|ドキュメント|Docs|スプレッドシート|Sheets|スライド|Slides|フォーム|Forms|フォト|Photos)\s*$/i;
const GMAIL_TITLE_SUFFIX_RE = /(?:\s+[-–]\s+[^\s@]+@[^\s@]+)?\s+[-–]\s+Gmail\s*$/i;

function cleanPageTitle(tag: LinkKind, pageTitle: string | undefined, target: string): string {
  let s = (pageTitle ?? '').replace(/\s+/g, ' ').trim();
  if (!s || s === target.trim()) return '';
  if (tag === 'gmail') s = s.replace(GMAIL_TITLE_SUFFIX_RE, '').trim();
  else s = s.replace(GOOGLE_TITLE_SUFFIX_RE, '').trim();
  return s;
}

/** ファイル／フォルダのパスから末尾の名前を取り出す */
export function baseNameOf(target: string): string {
  const s = target.trim().replace(/[\\/]+$/, '');
  return s.split(/[\\/]/).filter(Boolean).pop() ?? s;
}

const NUMERIC_DATE_RE = /(\d{4})\s*[/年.-]\s*(\d{1,2})\s*[/月.-]\s*(\d{1,2})/;
const ENGLISH_DATE_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2}),? (\d{4})/i;
// 英国式等の「5 Mar 2024」
const DAY_FIRST_DATE_RE = /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,? (\d{4})/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** 写真の説明から撮影日を yyyy-MM-dd で取り出す。見つからなければ空文字 */
export function photoDateOf(text: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (y: string, m: number, d: number) =>
    m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '';
  const numeric = text.match(NUMERIC_DATE_RE);
  if (numeric) return valid(numeric[1], Number(numeric[2]), Number(numeric[3]));
  const english = text.match(ENGLISH_DATE_RE);
  if (english) return valid(english[3], MONTHS.indexOf(english[1].toLowerCase()) + 1, Number(english[2]));
  const dayFirst = text.match(DAY_FIRST_DATE_RE);
  if (dayFirst) return valid(dayFirst[3], MONTHS.indexOf(dayFirst[2].toLowerCase()) + 1, Number(dayFirst[1]));
  return '';
}

/**
 * Googleフォトのlinkファイルの1行目と Caption（どちらも「yyyy年MM月dd日撮影」）。
 * 撮影日はサムネイルの説明（aria-label 等）から読む。分からなければ空（呼び出し側で通常の値に倒す）。
 */
function photoTitleOf(source: LinkSource): string {
  const date = photoDateOf(source.pageTitle ?? '') || photoDateOf(source.title);
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${y}年${m}月${d}日撮影`;
}

/**
 * Caption の値。GDrive=ファイル名/フォルダー名、GMail=メールタイトル、GPhoto=yyyy年MM月dd日撮影、
 * path=File:/Folder:+名前、link=リンク先タイトル（不明なら Affiliation）。
 * Googleのサービスもタイトルが分からなければ Affiliation に倒す（URL末尾の "view" 等は名前にならない）。
 */
export function linkCaptionOf(source: LinkSource, affiliation: string): string {
  const tag = linkKindOf(source.target);
  if (tag === 'path') {
    const isDirectory = source.isDirectory ?? /[\\/]$/.test(source.target.trim());
    return `${isDirectory ? 'Folder' : 'File'}:${baseNameOf(source.target)}`;
  }
  const title = cleanPageTitle(tag, source.pageTitle, source.target);
  if (tag === 'gphoto') return photoTitleOf(source) || title || affiliation;
  return title || affiliation;
}

/**
 * linkファイルの HTML表示で埋め込む URL。https 以外（パス・http・mailto 等）は埋め込まないので null。
 * Google ドライブ／ドキュメント類は通常のページが埋め込みを拒むため、埋め込み用の /preview に置き換える。
 */
export function linkEmbedUrl(target: string): string | null {
  if (isLocalPathTarget(target)) return null;
  const url = parseUrl(target.trim());
  if (!url || url.protocol !== 'https:') return null;
  const drive = url.host === 'drive.google.com' && url.pathname.match(/^\/file\/d\/([^/]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  const doc = url.host === 'docs.google.com' && url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`;
  return url.toString();
}

const LINK_SECTIONS = ['Caption', 'Link', 'Affiliation', 'Abstract'] as const;
type LinkSection = typeof LINK_SECTIONS[number];
const SECTION_HEADING_RE = /^#\s+(Caption|Link|Affiliation|Abstract)\s*$/i;

function quoteValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function unquoteValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
}

/** 新規作成時の2行目（タイトルの下線） */
export const LINK_TITLE_RULE = '='.repeat(30);

export function serializeLinkFile(file: LinkFile): string {
  const isPath = isLocalPathTarget(file.link);
  const lines = [
    file.title,
    LINK_TITLE_RULE,
    '# Caption',
    ...(file.caption ? [file.caption] : []),
    '# Link',
    isPath ? quoteValue(file.link) : file.link,
    '# Affiliation',
    ...(file.affiliation ? [isPath ? quoteValue(file.affiliation) : file.affiliation] : []),
    '# Abstract',
    ...(file.abstract ? [file.abstract] : []),
  ];
  return lines.join('\n');
}

export function createLinkFile(source: LinkSource, pcName: string): LinkFile {
  const affiliation = linkAffiliationOf(source.target, pcName);
  const tag = linkKindOf(source.target);
  // 1行目もリンク先の本当のタイトルが分かればそれを使う（pathはファイル名のまま）
  const pageTitle = tag === 'path' ? '' : cleanPageTitle(tag, source.pageTitle, source.target);
  return {
    title: (tag === 'gphoto' ? photoTitleOf(source) : '') || pageTitle || source.title,
    caption: linkCaptionOf(source, affiliation),
    link: source.target,
    affiliation,
    abstract: '',
  };
}

/** Caption 項の無い旧linkファイルでも、タイトル等から Caption を補って返す */
export function captionOfLinkFile(file: LinkFile): string {
  if (file.caption.trim()) return file.caption.trim();
  return linkCaptionOf({ target: file.link, title: file.title, pageTitle: file.title }, file.affiliation);
}

/** 同じリンク先かを比べるためのキー。Windowsのパスは区切り・大文字小文字を問わない */
export function linkTargetKey(target: string): string {
  const s = target.trim();
  if (!isLocalPathTarget(s)) return s;
  const unquoted = s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
  if (WINDOWS_DRIVE_RE.test(unquoted) || unquoted.startsWith('\\\\')) {
    return unquoted.replace(/\//g, '\\').replace(/(?<!^[a-zA-Z]:)\\+$/, '').toLowerCase();
  }
  return unquoted.length > 1 ? unquoted.replace(/\/+$/, '') : unquoted;
}

/**
 * linkファイルの参照タグ名。パスはファイルなら file、フォルダなら dir にする
 * （フォルダかどうかは作成時に決めた Caption の「Folder:」で判断する）。
 */
export function linkTagOfFile(file: LinkFile): LinkTagName {
  const caption = file.caption.trim();
  return linkTagOfTarget(file.link, caption ? /^Folder:/i.test(caption) : undefined);
}

/** リンク先から参照タグ名を決める。パスは isDirectory が分からなければ末尾の区切りでフォルダとみなす */
export function linkTagOfTarget(target: string, isDirectory?: boolean): LinkTagName {
  const kind = linkKindOf(target);
  if (kind !== 'path') return kind;
  return (isDirectory ?? /[\\/]$/.test(target.trim())) ? 'dir' : 'file';
}

/** 参照タグを組み立てる。GMail/GDrive/link/file/dir はタグの後ろに Caption を添える */
export function formatLinkTagWithCaption(tag: LinkTagName, thinkId: string, caption: string): string {
  const base = formatLinkTag(tag, thinkId);
  let text = caption.replace(/\s+/g, ' ').trim();
  // Caption の File:/Folder: は dir/file の判定に使うため残し、タグ自体が種類を示す表示では省く
  if (tag === 'file' || tag === 'dir') text = text.replace(/^(?:File|Folder)\s*:\s*/i, '');
  return CAPTIONED_TAGS.includes(tag) && text ? `${base} ${text}` : base;
}

/**
 * linkファイル本文を読む。新書式の # Link が無ければ旧書式の先頭リンクを使う。
 * リンクが1件も読めなければ null。
 */
export function parseLinkFile(content: string): LinkFile | null {
  const lines = content.split(/\r?\n/);
  const title = lines[0] ?? '';
  const sections: Record<LinkSection, string[]> = { Caption: [], Link: [], Affiliation: [], Abstract: [] };
  let current: LinkSection | null = null;
  for (const line of lines.slice(1)) {
    const heading = line.trim().match(SECTION_HEADING_RE);
    if (heading) {
      current = LINK_SECTIONS.find(s => s.toLowerCase() === heading[1].toLowerCase()) ?? null;
      continue;
    }
    if (current) sections[current].push(line);
  }
  const serializedLink = sections.Link.map(l => l.trim()).find(Boolean);
  const link = serializedLink ? unquoteValue(serializedLink) : '';
  if (link) {
    return {
      title,
      caption: sections.Caption.map(l => l.trim()).filter(Boolean).join(' '),
      link,
      affiliation: unquoteValue(sections.Affiliation.join('\n')),
      abstract: sections.Abstract.join('\n').trim(),
    };
  }
  const legacy = parseLegacyLinks(content)[0];
  return legacy ? { title, caption: '', link: legacy.url, affiliation: '', abstract: '' } : null;
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
  const name = match[1].toLowerCase();
  const tag = LINK_TAG_NAMES.find(t => t === name);
  if (!tag || !THINK_ID_RE.test(match[2])) return null;
  return { tag, thinkId: match[2] };
}
