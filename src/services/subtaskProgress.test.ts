import { expect, it } from 'vitest';
import { emptyProgress } from '../../server/services/progressRecord';
import { readSubtaskProgress, summarizeSubtaskProgress } from './subtaskProgress';

const event = (revision: number, input = emptyProgress()) => ({ id: `event-${revision}`, revision,
  confirmedAt: '2026-09-17T00:00:00Z', author: 'human', input: { ...input, evidence: '本人が確認', remaining: '実施結果を確認する' } });

it('uses the latest confirmation, keeping decisions, execution, exclusions and pauses independent', () => {
  const first = { ...emptyProgress(), milestones: { consideration: 'unnecessary', decision: 'achieved', execution: 'achieved', verification: 'unrecorded' } } as ReturnType<typeof emptyProgress>;
  const latest = { ...first, milestones: { ...first.milestones, execution: 'reconsider' as const }, paused: true, resumeCondition: '会場の回答が届く' };
  const record = { schemaVersion: 1, events: [event(1, first), event(2, latest)] };
  const before = JSON.stringify(record);
  const progress = readSubtaskProgress(record);
  const summary = summarizeSubtaskProgress([progress, readSubtaskProgress(undefined), readSubtaskProgress({ schemaVersion: 2 })]);
  expect(summary).toMatchObject({ total: 3, paused: 1, unreadable: 1 });
  expect(summary.milestones.decision).toEqual({ achieved: 1, reconsider: 0, unnecessary: 0, unrecorded: 1 });
  expect(summary.milestones.execution).toEqual({ achieved: 0, reconsider: 1, unnecessary: 0, unrecorded: 1 });
  expect(summary.milestones.consideration.unnecessary).toBe(1);
  expect(JSON.stringify(record)).toBe(before);
});

it('does not infer progress from legacy completion or accept AI-authored or corrupt confirmations', () => {
  expect(readSubtaskProgress(undefined)).toEqual({ status: 'unrecorded' });
  for (const value of [ { state: '完了' }, { schemaVersion: 1, events: [{ ...event(1), author: 'ai' }] },
    { schemaVersion: 1, events: [event(2)] } ]) {
    expect(readSubtaskProgress(value)).toEqual({ status: 'unreadable' });
  }
});
