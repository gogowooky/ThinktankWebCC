/**
 * shared/vaultFormat.ts
 * Firestore正本から書き出すMarkdownバックアップ（形式バージョン1）の
 * <thinkid>.md と <thinkid>.support.json を扱う純粋ロジック。
 * Node（Electron メインプロセス・変換ツール）とブラウザ（PC版・Web版）の両方で共有する。
 */

import yaml from 'js-yaml';

export const VAULT_SCHEMA_VERSION = 1 as const;

export const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

export const VALID_CATEGORIES = [
  'memo',
  'bundle',
  'table',
  'links',
  'chat',
  'html',
  'abstract',
] as const;

export type ValidCategory = (typeof VALID_CATEGORIES)[number];

export function isValidCategory(value: string): value is ValidCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(value);
}

export function isSafeThinkId(id: string): boolean {
  return typeof id === 'string' && SAFE_ID_RE.test(id);
}

/** frontmatter 内で基本項目として扱うキー（新旧形式の両方を含む） */
export const BASE_FRONTMATTER_KEYS = [
  'schema_version',
  'thinkid',
  'id',
  'category',
  'contentType',
  'title',
  'keywords',
  'related_ids',
  'relatedIds',
  'size_bytes',
  'sizeBytes',
  'is_deleted',
  'isDeleted',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
] as const;

export interface MdFrontmatterV1 {
  schema_version: 1;
  thinkid: string;
  category: string;
  title: string;
  keywords: string | null;
  related_ids: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParsedMdRecord {
  schemaVersion: number;
  thinkid: string;
  category: string;
  title: string;
  keywords: string | null;
  relatedIds: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  /** 本文（タイトル行を含まない）。元のバイト列・改行コードを一切書き換えず保持する */
  body: string;
  /** 旧形式で frontmatter 内に混在していた思考支援メタデータ（移行・後方互換用） */
  legacyEmbeddedMetadata: Record<string, unknown>;
}

export interface SupportFileV1 {
  schemaVersion: 1;
  thinkid: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  /** 変換時に JSON/YAML として解釈できなかった場合の元文字列退避領域 */
  rawMetadata?: string;
}

export interface VaultThinkMeta {
  thinkid: string;
  category: string;
  title: string;
  keywords: string;
  relatedIds: string;
  sizeBytes: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

function toIsoString(val: unknown, fallback = ''): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && val !== null && 'value' in val) {
    return String((val as { value: unknown }).value);
  }
  if (typeof val === 'string' && val.trim()) return val.trim();
  if (typeof val === 'number' && Number.isFinite(val)) return new Date(val).toISOString();
  return fallback;
}

function toNullableString(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  return typeof val === 'string' ? val : String(val);
}

function utf8ByteLength(str: string): number {
  return new TextEncoder().encode(str).byteLength;
}

/**
 * .md ファイル文字列を frontmatter と body に分解する。
 * 本文（body）は改行コードの変換を一切行わず、閉じ "---" 直後のスライスをそのまま返す。
 */
export function parseMdRecord(raw: string, fallbackId = ''): ParsedMdRecord {
  let fmRaw = '';
  let body = raw;

  if (raw.startsWith('---\n') || raw.startsWith('---\r\n')) {
    const firstNl = raw.indexOf('\n');
    const searchStart = firstNl + 1;
    // 閉じの "---" 行を探す
    let pos = searchStart;
    let closeStart = -1;
    let bodyStart = -1;
    while (pos <= raw.length) {
      const nextNl = raw.indexOf('\n', pos);
      const lineEnd = nextNl === -1 ? raw.length : nextNl;
      const line = raw.slice(pos, lineEnd).replace(/\r$/, '');
      if (line === '---') {
        closeStart = pos;
        bodyStart = nextNl === -1 ? raw.length : nextNl + 1;
        break;
      }
      if (nextNl === -1) break;
      pos = nextNl + 1;
    }
    if (closeStart !== -1 && bodyStart !== -1) {
      fmRaw = raw.slice(searchStart, closeStart);
      body = raw.slice(bodyStart);
    }
  }

  let loaded: unknown = {};
  if (fmRaw) {
    try {
      loaded = yaml.load(fmRaw, { schema: yaml.CORE_SCHEMA }) ?? {};
    } catch {
      loaded = {};
    }
  }
  const fm: Record<string, unknown> =
    typeof loaded === 'object' && loaded !== null && !Array.isArray(loaded)
      ? (loaded as Record<string, unknown>)
      : {};

  const legacyEmbeddedMetadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!(BASE_FRONTMATTER_KEYS as readonly string[]).includes(k)) {
      if (k === 'metadata' && typeof v === 'object' && v !== null && !Array.isArray(v)) {
        Object.assign(legacyEmbeddedMetadata, v as Record<string, unknown>);
      } else {
        legacyEmbeddedMetadata[k] = v;
      }
    }
  }

  const thinkid = String(fm.thinkid ?? fm.id ?? fallbackId);
  const category = String(fm.category ?? fm.contentType ?? 'memo');
  const title = fm.title == null ? '' : String(fm.title);
  const keywords = toNullableString(fm.keywords);
  const relatedIds = toNullableString(fm.related_ids ?? fm.relatedIds);
  const updatedAt = toIsoString(fm.updated_at ?? fm.updatedAt);
  const createdAt = toIsoString(fm.created_at ?? fm.createdAt, updatedAt);
  const isDeleted = Boolean(fm.is_deleted ?? fm.isDeleted ?? false);
  const schemaVersion = typeof fm.schema_version === 'number' ? fm.schema_version : 1;

  return {
    schemaVersion,
    thinkid,
    category,
    title,
    keywords,
    relatedIds,
    createdAt,
    updatedAt,
    isDeleted,
    body,
    legacyEmbeddedMetadata,
  };
}

/**
 * 形式バージョン 1 の .md 文字列を生成する。
 * frontmatter には基本項目のみを置き、本文（body）はバイト単位でそのまま連結する。
 */
export function serializeMdRecord(input: {
  thinkid: string;
  category: string;
  title: string;
  keywords?: string | null;
  relatedIds?: string | null;
  createdAt: string;
  updatedAt: string;
  body: string;
}): string {
  const fm: MdFrontmatterV1 = {
    schema_version: VAULT_SCHEMA_VERSION,
    thinkid: input.thinkid,
    category: input.category,
    title: input.title ?? '',
    keywords: input.keywords ? input.keywords : null,
    related_ids: input.relatedIds ? input.relatedIds : null,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  };
  const dumped = yaml.dump(fm, { lineWidth: -1, noRefs: true });
  return `---\n${dumped}---\n${input.body ?? ''}`;
}

export function hasNonEmptyMetadata(metadata: Record<string, unknown> | undefined | null): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  return Object.keys(metadata).length > 0;
}

/**
 * <thinkid>.support.json を生成する。
 */
export function serializeSupportFile(input: {
  thinkid: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  rawMetadata?: string;
}): string {
  const payload: SupportFileV1 = {
    schemaVersion: VAULT_SCHEMA_VERSION,
    thinkid: input.thinkid,
    updatedAt: input.updatedAt,
    metadata: input.metadata ?? {},
    ...(input.rawMetadata !== undefined ? { rawMetadata: input.rawMetadata } : {}),
  };
  return JSON.stringify(payload, null, 2) + '\n';
}

/**
 * <thinkid>.support.json を読み取る。
 */
export function parseSupportFile(rawJson: string, expectedThinkId?: string): SupportFileV1 {
  const parsed: unknown = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('support.json の形式が不正です。');
  }
  const obj = parsed as Record<string, unknown>;
  const thinkid = typeof obj.thinkid === 'string' ? obj.thinkid : expectedThinkId ?? '';
  if (expectedThinkId && thinkid !== expectedThinkId) {
    throw new Error(`support.json の thinkid (${thinkid}) が一致しません (${expectedThinkId})。`);
  }
  const updatedAt = typeof obj.updatedAt === 'string' ? obj.updatedAt : '';
  const metadata =
    typeof obj.metadata === 'object' && obj.metadata !== null && !Array.isArray(obj.metadata)
      ? (obj.metadata as Record<string, unknown>)
      : {};
  return {
    schemaVersion: 1,
    thinkid,
    updatedAt,
    metadata,
    ...(typeof obj.rawMetadata === 'string' ? { rawMetadata: obj.rawMetadata } : {}),
  };
}

/**
 * ParsedMdRecord と（任意の）SupportFileV1 から、アプリ共通の ThinkMeta を組み立てる。
 * size_bytes は frontmatter には持たず、読み取り時に計算する（§4.2）。
 */
export function toVaultThinkMeta(
  record: ParsedMdRecord,
  support?: SupportFileV1 | null,
): VaultThinkMeta {
  const fullContent = record.body ? `${record.title}\n${record.body}` : record.title;
  const mergedMeta: Record<string, unknown> = {
    ...record.legacyEmbeddedMetadata,
    ...(support?.metadata ?? {}),
  };
  return {
    thinkid: record.thinkid,
    category: record.category,
    title: record.title,
    keywords: record.keywords ?? '',
    relatedIds: record.relatedIds ?? '',
    sizeBytes: utf8ByteLength(fullContent),
    isDeleted: record.isDeleted,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    metadata: mergedMeta,
  };
}

/**
 * ThinkID の命名規則（yyyy-MM-dd-HHmmss）から作成日時の初期値を導出する。
 */
export function inferCreatedAtFromThinkId(thinkid: string, fallbackIso: string): string {
  const match = thinkid.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(?:-[A-Za-z0-9_-]+)?$/);
  if (!match) return fallbackIso;
  const [, yyyy, MM, dd, HH, mm, ss] = match;
  const d = new Date(`${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}+09:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : fallbackIso;
}
