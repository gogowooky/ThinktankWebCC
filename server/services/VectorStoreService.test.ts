import { expect, it, vi } from 'vitest';
import type { BigQuery } from '@google-cloud/bigquery';
import { VectorStoreService } from './VectorStoreService';

it('does not access or delete legacy embedding tables on startup', async () => {
  const dataset = vi.fn(() => { throw new Error('Must preserve storage'); });
  await new VectorStoreService().initialize({ dataset } as unknown as BigQuery, 'test');
  expect(dataset).not.toHaveBeenCalled();
});
