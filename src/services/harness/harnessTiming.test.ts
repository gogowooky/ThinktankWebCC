// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { HarnessTimer, lastHarnessTiming } from './harnessTiming';
import { formatHarnessTiming, harnessStageTotals } from '../../../shared/harnessTiming';

const projectId = 'timing-test-project';
afterEach(() => {
  localStorage.removeItem('thinktank.harnessTiming.v1.' + projectId);
  vi.restoreAllMocks();
});

it('並行する担当の往復は個別に残し、段階には実際に経過した時間を一度だけ加算する', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const timer = new HarnessTimer();
  now = 10;
  timer.enter('team', 1);
  const jobs = new Map<string, () => void>();
  const request = timer.measureCalls(async payload => {
    await new Promise<void>(resolve => jobs.set(String(payload.requestId), resolve));
    return { reply: '非公開の返信' };
  });
  const first = request({ requestId: 'r1', userMessage: '非公開の依頼' }, 'T1');
  const second = request({ requestId: 'r2' }, 'T2');
  now = 50;
  jobs.get('r2')!();
  await second;
  now = 110;
  jobs.get('r1')!();
  await first;
  timer.enter('finish', 1);
  now = 120;
  const report = timer.finish(projectId, 'waiting');
  expect(report.totalMs).toBe(120);
  expect(harnessStageTotals(report).get('team')).toBe(100);
  expect(report.calls.map(call => call.ms)).toEqual([100, 40]);
  expect(lastHarnessTiming(projectId)).toEqual(report);
  expect(JSON.stringify(report)).not.toContain('非公開');
});

it('PCの計測結果を失敗時も受け取り、元の失敗をループに伝える', async () => {
  const timer = new HarnessTimer();
  timer.enter('retry', 2);
  const request = timer.measureCalls(async () => ({
    reply: '', harnessTimingError: '非公開の失敗理由',
    harnessTiming: { hostMs: 300, processMs: 200, tools: {} },
  }));
  await expect(request({ requestId: 'r3-retry' })).rejects.toThrow('非公開の失敗理由');
  const report = timer.finish(projectId, 'error');
  expect(report.calls[0]).toMatchObject({ turn: 2, role: 'まとめ役（追記）', ok: false, host: { processMs: 200 } });
  expect(formatHarnessTiming(report)).toContain('CLI実行（ツール時間込み）　0.200秒');
  expect(JSON.stringify(report)).not.toContain('非公開');
});
