import { expect, it, vi } from 'vitest';
vi.mock('./storage/StorageManager', () => ({ StorageManager: { get instance() { throw new Error('Compatibility reads must not access storage'); } } }));
import { TTThink } from '../models/TTThink';
import { isReviewDue, supportRecord } from './thoughtSupport';

it('reads legacy management fields without changing content or metadata', () => {
  const think = new TTThink();
  think.setContentSilent('過去の会話\n本文');
  think.Metadata = { thoughtSupport: { version: 4, bundleId: 'bundle', goal: '旧目的', references: ['source'],
    decisions: '本人の決定', appliedOps: ['op'], history: [{ operationId: 'op', at: 'old', title: '前の題名', record: {} }] }, other: 'preserved' };
  const before = JSON.stringify([think.Content, think.Metadata]);
  expect(supportRecord(think)).toMatchObject({ version: 4, bundleId: 'bundle', goal: '旧目的',
    references: ['source'], decisions: '本人の決定', next: '', appliedOps: ['op'] });
  expect(JSON.stringify([think.Content, think.Metadata])).toBe(before);
  expect(supportRecord().version).toBe(0);
});

it('keeps review and redisplay dates separate from a due date', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const record = { ...supportRecord(), due: '2026-01-01' };
  expect(isReviewDue(record, now)).toBe(false);
  expect(isReviewDue({ ...record, reviewAt: '2026-10-12' }, now)).toBe(true);
  expect(isReviewDue({ ...record, redisplayAt: '2026-10-12T00:00:00Z' }, now)).toBe(true);
  expect(isReviewDue({ ...record, reviewAt: '2027-01-01' }, now)).toBe(false);
  expect(isReviewDue({ ...record, reviewAt: 'invalid' }, now)).toBe(false);
});
