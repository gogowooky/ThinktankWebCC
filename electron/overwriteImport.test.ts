import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { listOverwriteIds, readOverwriteRecord } = require('./overwriteImport.cjs');

const ID_A = '2026-11-01-100000';
const ID_B = '2026-11-01-100001';

function md(thinkid: string, title: string, body: string, extra = ''): string {
  return [
    '---',
    `thinkid: ${thinkid}`,
    'category: memo',
    `title: ${title}`,
    'created_at: 2026-11-01T00:00:00.000Z',
    'updated_at: 2026-11-02T00:00:00.000Z',
    ...(extra ? [extra] : []),
    '---',
    body,
  ].join('\n');
}

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'tt-overwrite-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('上書き用Thinkファイルフォルダーの読み取り', () => {
  it('.md の ID を一覧にし、競合コピー・ID でない名前・.md 以外は除く', () => {
    fs.writeFileSync(join(dir, `${ID_A}.md`), md(ID_A, 'A', '本文A'));
    fs.writeFileSync(join(dir, `${ID_B}.md`), md(ID_B, 'B', '本文B'));
    fs.writeFileSync(join(dir, `${ID_A} (1).md`), md(ID_A, 'A2', 'x'));
    fs.writeFileSync(join(dir, 'メモ 下書き.md'), 'x');
    fs.writeFileSync(join(dir, `${ID_A}.support.json`), '{}');
    expect(listOverwriteIds(dir)).toEqual([ID_A, ID_B]);
  });

  it('thinks/ があればその中を読む（ThinkファイルFolder をそのまま指定した場合）', () => {
    fs.mkdirSync(join(dir, 'thinks'));
    fs.writeFileSync(join(dir, 'thinks', `${ID_A}.md`), md(ID_A, 'A', '本文A'));
    expect(listOverwriteIds(dir)).toEqual([ID_A]);
    expect(readOverwriteRecord(dir, ID_A)?.body).toBe('本文A');
  });

  it('本文・日付・support.json の metadata を読み、ID はファイル名に合わせる', () => {
    fs.writeFileSync(join(dir, `${ID_A}.md`), md(ID_B, 'A', '本文A'));
    fs.writeFileSync(join(dir, `${ID_A}.support.json`), JSON.stringify({ thinkid: ID_A, updatedAt: '', metadata: { color: 'red' } }));
    const record = readOverwriteRecord(dir, ID_A);
    expect(record.meta).toMatchObject({
      thinkid: ID_A, title: 'A', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
      metadata: { color: 'red' },
    });
    expect(record.body).toBe('本文A');
  });

  it('削除済み・存在しないファイルは null、フォルダが無ければエラーにし、フォルダには何も書かない', () => {
    fs.writeFileSync(join(dir, `${ID_A}.md`), md(ID_A, 'A', '', 'is_deleted: true'));
    expect(readOverwriteRecord(dir, ID_A)).toBeNull();
    expect(readOverwriteRecord(dir, ID_B)).toBeNull();
    expect(() => listOverwriteIds(join(dir, 'none'))).toThrow('見つかりません');
    expect(() => listOverwriteIds('relative\\dir')).toThrow('絶対パス');
    expect(fs.readdirSync(dir)).toEqual([`${ID_A}.md`]);
  });
});
