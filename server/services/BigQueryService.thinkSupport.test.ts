import { expect, it, vi } from 'vitest';
import { BigQueryService } from './BigQueryService';
import type { VaultRecord } from './BigQueryService';
it.each(['STRING', 'JSON'])('writes only metadata and timestamp with atomic version guard (%s)', async type => {
  const query = vi.fn().mockResolvedValue([[{ changed: 1 }]]);
  const getMetadata = vi.fn().mockResolvedValue([{ schema: { fields: [{ name: 'metadata', type }] } }]);
  const service = new BigQueryService();
  Object.assign(service, { bigquery: { query, dataset: () => ({ table: () => ({ getMetadata }) }) }, projectId: 'test' });
  expect(await service.saveThinkSupport('id', '2026-09-13T00:00:00Z', { keep: true }, '2026-09-13T00:00:01Z')).toEqual({ success: true, data: true });
  const request = query.mock.calls[0][0];
  expect(request.query).toContain('BEGIN TRANSACTION'); expect(request.query).toContain('updated_at = TIMESTAMP(@expectedVersion)');
  expect(request.query).toContain('COUNT(*)'); expect(request.query).not.toContain('content =');
  expect(request.params.metadata).toBe('{"keep":true}');
  expect(request.query.includes('PARSE_JSON(@metadata)')).toBe(type === 'JSON');
});
it('treats no matching row as a conflict', async () => {
  const service = new BigQueryService();
  Object.assign(service, { bigquery: { query: async () => [[{ changed: 0 }]], dataset: () => ({ table: () => ({ getMetadata: async () => [{ schema: { fields: [{ name: 'metadata', type: 'STRING' }] } }] }) }) } });
  expect(await service.saveThinkSupport('id', 'v1', {}, 'v2')).toEqual({ success: true, data: false });
});
it('also guards ordinary versioned saves so another editor cannot overwrite a P2 update after its precheck', async () => {
  const query = vi.fn().mockResolvedValue([[{ changed: 0 }]]);
  const service = new BigQueryService(); Object.assign(service, { bigquery: { query }, projectId: 'test' });
  const record = { file_id: '2026-09-13-100000', category: 'bundle', created_at: '2026-09-13T00:00:00Z', updated_at: '2026-09-13T00:00:01Z' } as VaultRecord;
  expect(await service.save(record, 3, '2026-09-13T00:00:00Z')).toEqual({ success: false, error: 'conflict' });
  expect(query.mock.calls[0][0].query).toContain('WHEN MATCHED AND target.updated_at = TIMESTAMP(@expectedVersion)');
  expect(query.mock.calls[0][0].query).toContain('WHEN NOT MATCHED AND FALSE');
  expect(query.mock.calls[0][0].query).toContain('ASSERT changed <= 1');
});
