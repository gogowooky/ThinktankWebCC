import { expect, it, vi } from 'vitest';
import { BigQueryService } from './BigQueryService';
it.each(['JSON', 'STRING'])('atomically inserts an artifact and marks the Bundle applied (%s metadata)', async type => {
  const query = vi.fn().mockResolvedValue([[{ changed: 1 }]]);
  const service = new BigQueryService();
  Object.assign(service, { projectId: 'test', bigquery: { query, dataset: () => ({ table: () => ({ getMetadata: async () => [{ schema: { fields: [{ name: 'metadata', type }] } }] }) }) } });
  expect(await service.applyAgentArtifact('bundle', 'v1', { keep: true }, 'v2', { thinkId: 'artifact', title: '候補', body: '本文', metadata: { jobId: 'job' } })).toEqual({ success: true, data: true });
  const request = query.mock.calls[0][0];
  expect(request.query).toContain('BEGIN TRANSACTION'); expect(request.query).toContain('NOT EXISTS');
  expect(request.query).toContain('IF changed = 1 THEN'); expect(request.query).toContain('INSERT INTO'); expect(request.query).toContain('COMMIT TRANSACTION');
  expect(request.query).not.toContain('content ='); expect(request.params.title).toBe('# 候補');
  expect(request.query.includes('PARSE_JSON(@artifactMetadata)')).toBe(type === 'JSON');
});
