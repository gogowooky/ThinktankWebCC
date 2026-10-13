import { expect, it, vi } from 'vitest';
vi.mock('../../../../services/storage/StorageManager', () => ({ StorageManager: {
  get instance() { throw new Error('Content conversion must not access storage'); },
} }));
import { TTThink } from '../../../../models/TTThink';
import { getEditorValue, reconstructContent } from './editorContent';

it('keeps title lines editable for every media content type', () => {
  const think = new TTThink(); think.setContentSilent('# 題名\n本文');
  for (const type of ['memo', 'bundle', 'table', 'chat', 'html', 'links', 'nettext'] as const) {
    think.ContentType = type;
    expect(getEditorValue(think)).toBe('# 題名\n本文');
    expect(reconstructContent(think, '# 更新後\n新本文')).toBe('# 更新後\n新本文');
  }
});

it('round trips raw YAML fields and rejects invalid YAML without changing the Think', () => {
  const think = new TTThink(); think.ID = '2026-10-13-120000'; think.setContentSilent('題名\n本文');
  think.Keywords = 'before'; think.RelatedIDs = 'related'; think.Metadata = { custom: { keep: true } };
  const raw = getEditorValue(think, true).replace('keywords: before', 'keywords: after');
  expect(reconstructContent(think, raw, true)).toBe('題名\n本文');
  expect(think.Keywords).toBe('after');
  expect(think.RelatedIDs).toBe('related');
  expect(think.Metadata).toEqual({ custom: { keep: true } });
  const metadata = JSON.stringify(think.Metadata);
  expect(reconstructContent(think, '---\ntitle: [broken\n---\n本文', true)).toBeNull();
  expect(think.Keywords).toBe('after');
  expect(JSON.stringify(think.Metadata)).toBe(metadata);
});
