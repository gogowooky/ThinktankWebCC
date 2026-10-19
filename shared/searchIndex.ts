/**
 * shared/searchIndex.ts
 * Vault の索引作成・シャード合成・差分取得・全文検索（本文のみ＋フィールド指定）。
 */

import type { VaultThinkMeta } from './vaultFormat';

export interface IndexEntry {
  thinkid: string;
  category: string;
  title: string;
  keywords: string;
  relatedIds: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  hasSupport: boolean;
}

export interface IndexShardV1 {
  schemaVersion: 1;
  deviceId: string;
  updatedAt: string;
  entries: Record<string, IndexEntry>;
  /** trash へ移動された thinkid と削除時刻 */
  deletedIds: Record<string, string>;
}

export interface BodyPackEntry {
  updatedAt: string;
  body: string;
}

export interface BodyPackV1 {
  schemaVersion: 1;
  deviceId: string;
  updatedAt: string;
  entries: Record<string, BodyPackEntry>;
}

export interface SearchableRecord {
  meta: VaultThinkMeta;
  /** frontmatter を除いた本文のみ */
  body: string;
}

export interface ParsedSearchQuery {
  titleTerms: string[];
  tagTerms: string[];
  categoryTerms: string[];
  idTerms: string[];
  freeTerms: string[];
}

/**
 * 検索クエリを解析し、`title:`, `tag:`, `category:`, `id:` の項目指定と自由語に分解する。
 */
export function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    titleTerms: [],
    tagTerms: [],
    categoryTerms: [],
    idTerms: [],
    freeTerms: [],
  };
  const trimmed = (rawQuery ?? '').trim();
  if (!trimmed) return result;

  const tokens = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (const rawToken of tokens) {
    const token = rawToken.replace(/^"|"$/g, '');
    const lower = token.toLowerCase();
    if (lower.startsWith('title:') && token.length > 6) {
      result.titleTerms.push(lower.slice(6));
    } else if ((lower.startsWith('tag:') || lower.startsWith('kw:')) && token.includes(':')) {
      const val = lower.slice(lower.indexOf(':') + 1);
      if (val) result.tagTerms.push(val);
    } else if ((lower.startsWith('category:') || lower.startsWith('type:')) && token.includes(':')) {
      const val = lower.slice(lower.indexOf(':') + 1);
      if (val) result.categoryTerms.push(val);
    } else if (lower.startsWith('id:') && token.length > 3) {
      result.idTerms.push(lower.slice(3));
    } else if (lower) {
      result.freeTerms.push(lower);
    }
  }
  return result;
}

/**
 * メモリ上のレコード群に対して検索を行う。
 * 全文検索（freeTerms）は YAML frontmatter を含めず、本文（body）とタイトル・タグを対象にする（§5.3）。
 */
export function searchVaultRecords(
  records: readonly SearchableRecord[],
  rawQuery: string,
  limit = 200,
): VaultThinkMeta[] {
  const parsed = parseSearchQuery(rawQuery);
  const hasAny =
    parsed.titleTerms.length > 0 ||
    parsed.tagTerms.length > 0 ||
    parsed.categoryTerms.length > 0 ||
    parsed.idTerms.length > 0 ||
    parsed.freeTerms.length > 0;

  if (!hasAny) return [];

  const matched: VaultThinkMeta[] = [];
  for (const { meta, body } of records) {
    if (meta.isDeleted) continue;

    const titleLower = (meta.title ?? '').toLowerCase();
    const tagLower = (meta.keywords ?? '').toLowerCase();
    const catLower = (meta.category ?? '').toLowerCase();
    const idLower = (meta.thinkid ?? '').toLowerCase();
    const bodyLower = (body ?? '').toLowerCase();

    if (parsed.titleTerms.some(t => !titleLower.includes(t))) continue;
    if (parsed.tagTerms.some(t => !tagLower.includes(t))) continue;
    if (parsed.categoryTerms.some(t => catLower !== t)) continue;
    if (parsed.idTerms.some(t => !idLower.includes(t))) continue;
    if (
      parsed.freeTerms.some(
        t => !bodyLower.includes(t) && !titleLower.includes(t) && !tagLower.includes(t),
      )
    ) {
      continue;
    }

    matched.push(meta);
  }

  matched.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return matched.slice(0, limit);
}

/**
 * 複数端末の索引シャード（.thinktank/index/shard-*.json）を合成し、最新のメタデータ一覧を返す。
 */
export function mergeIndexShards(shards: readonly IndexShardV1[]): VaultThinkMeta[] {
  const latestEntry = new Map<string, IndexEntry>();
  const latestDeleted = new Map<string, string>();

  for (const shard of shards) {
    if (!shard || typeof shard !== 'object') continue;
    for (const [id, deletedAt] of Object.entries(shard.deletedIds ?? {})) {
      const prev = latestDeleted.get(id);
      if (!prev || deletedAt > prev) {
        latestDeleted.set(id, deletedAt);
      }
    }
    for (const [id, entry] of Object.entries(shard.entries ?? {})) {
      const prev = latestEntry.get(id);
      if (!prev || (entry.updatedAt || '') > (prev.updatedAt || '')) {
        latestEntry.set(id, entry);
      }
    }
  }

  const results: VaultThinkMeta[] = [];
  for (const [id, entry] of latestEntry.entries()) {
    const deletedAt = latestDeleted.get(id);
    if (deletedAt && deletedAt >= (entry.updatedAt || '')) {
      continue;
    }
    results.push({
      thinkid: entry.thinkid,
      category: entry.category,
      title: entry.title,
      keywords: entry.keywords,
      relatedIds: entry.relatedIds,
      sizeBytes: entry.sizeBytes,
      isDeleted: false,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }

  results.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return results;
}

/**
 * メタデータ一覧から単一端末のシャードを生成する。
 */
export function createIndexShard(
  deviceId: string,
  metas: readonly VaultThinkMeta[],
  deletedIds: Record<string, string> = {},
  nowIso: string = new Date().toISOString(),
): IndexShardV1 {
  const entries: Record<string, IndexEntry> = {};
  for (const m of metas) {
    if (m.isDeleted) continue;
    entries[m.thinkid] = {
      thinkid: m.thinkid,
      category: m.category,
      title: m.title,
      keywords: m.keywords,
      relatedIds: m.relatedIds,
      sizeBytes: m.sizeBytes,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      hasSupport: Boolean(m.metadata && Object.keys(m.metadata).length > 0),
    };
  }
  return {
    schemaVersion: 1,
    deviceId,
    updatedAt: nowIso,
    entries,
    deletedIds,
  };
}

/**
 * 指定時刻（sinceIso）より後に更新または削除された差分を計算する（中継の listDiff 用）。
 */
export function computeListDiff(
  metas: readonly VaultThinkMeta[],
  deletedIds: Record<string, string>,
  sinceIso?: string,
): { updated: VaultThinkMeta[]; deleted: string[]; asOf: string } {
  const asOf = new Date().toISOString();
  if (!sinceIso) {
    return {
      updated: metas.filter(m => !m.isDeleted),
      deleted: Object.keys(deletedIds),
      asOf,
    };
  }
  const sinceMs = Date.parse(sinceIso);
  if (!Number.isFinite(sinceMs)) {
    return {
      updated: metas.filter(m => !m.isDeleted),
      deleted: Object.keys(deletedIds),
      asOf,
    };
  }
  const updated = metas.filter(m => {
    if (m.isDeleted) return false;
    const uMs = Date.parse(m.updatedAt);
    return !Number.isFinite(uMs) || uMs > sinceMs;
  });
  const deleted = Object.entries(deletedIds)
    .filter(([, delIso]) => {
      const dMs = Date.parse(delIso);
      return !Number.isFinite(dMs) || dMs > sinceMs;
    })
    .map(([id]) => id);
  return { updated, deleted, asOf };
}

/**
 * 本文パック（.thinktank/index/body-pack-<deviceId>.json）を生成する。
 */
export function createBodyPack(
  deviceId: string,
  records: readonly SearchableRecord[],
  nowIso: string = new Date().toISOString(),
): BodyPackV1 {
  const entries: Record<string, BodyPackEntry> = {};
  for (const { meta, body } of records) {
    if (meta.isDeleted) continue;
    entries[meta.thinkid] = {
      updatedAt: meta.updatedAt,
      body: body ?? '',
    };
  }
  return {
    schemaVersion: 1,
    deviceId,
    updatedAt: nowIso,
    entries,
  };
}

/**
 * 複数の本文パック（body-pack-*.json）を合成し、各 thinkid の最新の本文とその版（updatedAt）を返す。
 */
export function mergeBodyPackEntries(packs: readonly BodyPackV1[]): Record<string, BodyPackEntry> {
  const latest: Record<string, BodyPackEntry> = {};
  for (const pack of packs) {
    if (!pack || typeof pack !== 'object' || !pack.entries) continue;
    for (const [id, entry] of Object.entries(pack.entries)) {
      if (!entry || typeof entry.body !== 'string') continue;
      const prev = latest[id];
      if (!prev || (entry.updatedAt || '') >= (prev.updatedAt || '')) {
        latest[id] = entry;
      }
    }
  }
  return latest;
}

/**
 * 複数の本文パック（body-pack-*.json）を合成し、各 thinkid の最新本文マップを返す。
 */
export function mergeBodyPacks(packs: readonly BodyPackV1[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [id, entry] of Object.entries(mergeBodyPackEntries(packs))) {
    result[id] = entry.body;
  }
  return result;
}

