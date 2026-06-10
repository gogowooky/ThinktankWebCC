// ローカルJSONファイルベースのストレージ（仕様書05 §2 互換 / BigQuery API 形状を提供）

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface StoredThink {
  id: string;
  contentType: string;
  title: string;
  content: string;
  keywords: string;
  relatedIds: string;
  sizeBytes: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ThinkMeta = Omit<StoredThink, 'content'>;

// 起動時のcwdに依存せず、プロジェクト直下の data/vault に保存する
const DATA_DIR = process.env.THINKTANK_DATA_DIR
  ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'vault');

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function filePath(id: string): string {
  // パストラバーサル防止
  const safe = id.replace(/[\\/:*?"<>|]/g, '_');
  return path.join(DATA_DIR, `${safe}.json`);
}

/** fullContent をタイトル行と本文に分割する（仕様書05 §2 splitContent） */
function splitContent(fullContent: string): { title: string; body: string } {
  const idx = fullContent.indexOf('\n');
  if (idx < 0) return { title: fullContent, body: '' };
  return { title: fullContent.slice(0, idx), body: fullContent.slice(idx + 1) };
}

async function readAll(): Promise<StoredThink[]> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const result: StoredThink[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const text = await fs.readFile(path.join(DATA_DIR, f), 'utf-8');
      result.push(JSON.parse(text) as StoredThink);
    } catch {
      // 壊れたファイルはスキップ
    }
  }
  return result;
}

const toMeta = ({ content: _content, ...meta }: StoredThink): ThinkMeta => meta;

export async function listMeta(): Promise<ThinkMeta[]> {
  const all = await readAll();
  return all
    .filter((t) => !t.isDeleted)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toMeta);
}

export async function getContent(id: string): Promise<string | null> {
  try {
    const text = await fs.readFile(filePath(id), 'utf-8');
    const rec = JSON.parse(text) as StoredThink;
    if (rec.isDeleted) return null;
    // タイトル行＋本文を fullContent として返す
    return rec.content === '' ? rec.title : `${rec.title}\n${rec.content}`;
  } catch {
    return null;
  }
}

export async function save(payload: {
  id: string;
  contentType: string;
  fullContent: string;
  keywords: string;
  relatedIds: string;
}): Promise<ThinkMeta> {
  await ensureDir();
  const { title, body } = splitContent(payload.fullContent ?? '');
  const now = new Date().toISOString();

  let createdAt = now;
  try {
    const existing = JSON.parse(await fs.readFile(filePath(payload.id), 'utf-8')) as StoredThink;
    createdAt = existing.createdAt || now;
  } catch {
    // 新規作成
  }

  const rec: StoredThink = {
    id: payload.id,
    contentType: payload.contentType || 'memo',
    title,
    content: body,
    keywords: payload.keywords ?? '',
    relatedIds: payload.relatedIds ?? '',
    sizeBytes: Buffer.byteLength(payload.fullContent ?? '', 'utf-8'),
    isDeleted: false,
    createdAt,
    updatedAt: now,
  };
  await fs.writeFile(filePath(payload.id), JSON.stringify(rec, null, 2), 'utf-8');
  return toMeta(rec);
}

/** 論理削除（仕様書05 §2） */
export async function remove(id: string): Promise<void> {
  try {
    const rec = JSON.parse(await fs.readFile(filePath(id), 'utf-8')) as StoredThink;
    rec.isDeleted = true;
    rec.updatedAt = new Date().toISOString();
    await fs.writeFile(filePath(id), JSON.stringify(rec, null, 2), 'utf-8');
  } catch {
    // 存在しない場合は何もしない
  }
}

export async function search(query: string): Promise<ThinkMeta[]> {
  const q = query.toLowerCase();
  const all = await readAll();
  return all
    .filter((t) => !t.isDeleted)
    .filter((t) =>
      t.title.toLowerCase().includes(q)
      || t.content.toLowerCase().includes(q)
      || t.keywords.toLowerCase().includes(q))
    .map(toMeta);
}
