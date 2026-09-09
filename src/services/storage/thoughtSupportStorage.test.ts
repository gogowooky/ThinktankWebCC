import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packLocalMetadata, unpackLocalMetadata } from './localMetadata';
const { saveVaultRecord } = createRequire(import.meta.url)('../../../electron/vaultSave.cjs');

describe('durable thought support metadata', () => {
  it('round trips C# compatibility metadata without exposing it in the Chat body', () => {
    const metadata = { thoughtSupport: { next: '前の続きを確認する', version: 4 }, text: '-->\n## 見出し' };
    const body = '## 本人の発言\nAIの回答';
    expect(unpackLocalMetadata(packLocalMetadata(body, metadata))).toEqual({ body, metadata });
    expect(unpackLocalMetadata(body)).toEqual({ body, metadata: undefined });
    expect(() => unpackLocalMetadata('<!-- thinktank-metadata-v1:壊れた内容')).toThrow();
  });
  it('persists Electron metadata and rejects an outdated save after reopening', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thinktank-support-test-'));
    try {
      const payload = { id: '2026-09-08-100000', contentType: 'chat', fullContent: 'ASK:Workout｜[進行中]質問\n## 続きを教えて', metadata: { thoughtSupport: { version: 1, resume: '候補を比較中' } } };
      const first = saveVaultRecord(dir, payload);
      const stored = JSON.parse(readFileSync(join(dir, payload.id + '.json'), 'utf8'));
      expect(stored.metadata).toEqual(payload.metadata);
      const second = saveVaultRecord(dir, { ...payload, baseUpdatedAt: first.updatedAt, metadata: { thoughtSupport: { version: 2 } } });
      expect(second.updatedAt).not.toBe(first.updatedAt);
      expect(() => saveVaultRecord(dir, { ...payload, baseUpdatedAt: first.updatedAt })).toThrow('別の場所');
      expect(JSON.parse(readFileSync(join(dir, payload.id + '.json'), 'utf8')).metadata.thoughtSupport.version).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
