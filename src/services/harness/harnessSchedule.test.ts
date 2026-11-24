// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  let n = 0;
  return {
    supportsSnapshots: false,
    save: vi.fn(async () => ({ updatedAt: `2026-11-23T00:${String(Math.floor(++n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}Z` })),
    updateMetadata: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ updatedAt: '2026-11-23T01:00:00Z', metadata: patch })),
    delete: vi.fn(async () => undefined),
    getRecord: vi.fn(async () => null),
  };
});
vi.mock('../storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));

import { TTVault } from '../../models/TTVault';
import { HarnessLoop, HARNESS_LOCK_KEY } from './harnessLoop';
import { collectDoctorFindings } from './harnessDoctor';
import {
  HARNESS_SCHEDULE_LAST_RUN_KEY,
  findDueScheduleSlot,
  maybeRunScheduledProjects,
  parseScheduleConditions,
  resetScheduleAttempts,
  startHarnessScheduler,
} from './harnessSchedule';

let vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks();
  vault = new TTVault('vault');
  HarnessLoop.reset();
  resetScheduleAttempts();
});

async function createScheduledProject(opts: {
  title?: string;
  state?: string;
  conditions: string;
  withRules?: boolean;
}) {
  const project = await vault.CreateProjectFromIds([]);
  const title = opts.title ?? '毎朝のまとめ';
  const state = opts.state ?? '未着手';
  project.Content = [
    title,
    '=',
    '# 見通し',
    'タスク',
    '# 状態',
    state,
    '# 対象',
    ...(opts.withRules === false ? [] : ['# 規約', '毎朝、今日の予定を整理する']),
    '# 条件',
    opts.conditions,
  ].join('\n');
  await project.SaveContent();
  return project;
}

describe('parseScheduleConditions', () => {
  it('毎日・平日・土日・毎週・毎月・時刻のみの書式を解釈する', () => {
    const res = parseScheduleConditions([
      'AI: claude',
      '定刻: 毎日 08:00',
      '定刻：8:30',
      'スケジュール: 平日 09:00',
      '定刻: 土日 10:15',
      '定刻: 毎週 月・水・金 07:45',
      '定刻: 毎月 1日 09:30',
    ].join('\n'));

    expect(res.invalidLines).toEqual([]);
    expect(res.schedules).toEqual([
      { raw: '毎日 08:00', hour: 8, minute: 0 },
      { raw: '8:30', hour: 8, minute: 30 },
      { raw: '平日 09:00', hour: 9, minute: 0, daysOfWeek: [1, 2, 3, 4, 5] },
      { raw: '土日 10:15', hour: 10, minute: 15, daysOfWeek: [0, 6] },
      { raw: '毎週 月・水・金 07:45', hour: 7, minute: 45, daysOfWeek: [1, 3, 5] },
      { raw: '毎月 1日 09:30', hour: 9, minute: 30, dayOfMonth: 1 },
    ]);
  });

  it('解釈できない定刻行は invalidLines に返す', () => {
    const res = parseScheduleConditions('定刻: 毎日 25:00\n定刻: 毎時\n定刻: 平日 08:00');
    expect(res.schedules).toHaveLength(1);
    expect(res.invalidLines).toEqual(['定刻: 毎日 25:00', '定刻: 毎時']);
  });
});

describe('findDueScheduleSlot', () => {
  it('定刻前は null、定刻ちょうど・定刻後（遅れ起動）は当日スロットを返す', () => {
    const { schedules } = parseScheduleConditions('定刻: 毎日 08:00');
    // 2026-11-23 は月曜
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 23, 7, 59))).toBeNull();
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 23, 8, 0))?.slot).toBe('2026-11-23 08:00');
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 23, 9, 30))?.slot).toBe('2026-11-23 08:00');
    // 実行済みスロットなら再実行しない
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 23, 9, 30), '2026-11-23 08:00')).toBeNull();
    // 翌日になればまた対象になる
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 24, 8, 5), '2026-11-23 08:00')?.slot).toBe('2026-11-24 08:00');
  });

  it('1日に複数定刻があり両方過ぎていた場合、最新スロット1件だけを返す', () => {
    const { schedules } = parseScheduleConditions('定刻: 毎日 08:00\n定刻: 毎日 18:00');
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 23, 18, 30))?.slot).toBe('2026-11-23 18:00');
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 23, 18, 30), '2026-11-23 08:00')?.slot).toBe('2026-11-23 18:00');
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 23, 18, 30), '2026-11-23 18:00')).toBeNull();
  });

  it('平日・曜日指定が一致しない日は null を返す', () => {
    const { schedules } = parseScheduleConditions('定刻: 平日 08:00');
    // 2026-11-22 は日曜
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 22, 9, 0))).toBeNull();
    // 2026-11-23 は月曜
    expect(findDueScheduleSlot(schedules, new Date(2026, 10, 23, 9, 0))?.slot).toBe('2026-11-23 08:00');
  });
});

describe('maybeRunScheduledProjects', () => {
  it('定刻を過ぎて開いたタイミングで即時起動し、metadata 記録により再起動後も二重起動しない', async () => {
    const project = await createScheduledProject({ state: '待機', conditions: 'AI: claude\n定刻: 毎日 08:00' });
    const start = vi.fn();

    const first = await maybeRunScheduledProjects(vault, { now: new Date(2026, 10, 23, 8, 30), start });
    expect(first).toEqual([project.ID]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(project.ID, '2026-11-23 08:00', expect.objectContaining({ hour: 8, minute: 0 }));
    expect(project.Metadata[HARNESS_SCHEDULE_LAST_RUN_KEY]).toMatchObject({ slot: '2026-11-23 08:00' });

    // メモリをリセット（アプリ再起動相当）しても metadata があるため同じスロットは再実行しない
    resetScheduleAttempts();
    const second = await maybeRunScheduledProjects(vault, { now: new Date(2026, 10, 23, 9, 0), start });
    expect(second).toEqual([]);
    expect(start).toHaveBeenCalledTimes(1);

    // 翌日の定刻以降になれば再び起動する
    const nextDay = await maybeRunScheduledProjects(vault, { now: new Date(2026, 10, 24, 8, 1), start });
    expect(nextDay).toEqual([project.ID]);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('状態が 保留・完了・中止 や、ハーネスでない project・編集中・他PCロック中は起動しない', async () => {
    const paused = await createScheduledProject({ title: '保留案件', state: '保留', conditions: '定刻: 毎日 08:00' });
    const done = await createScheduledProject({ title: '完了案件', state: '完了', conditions: '定刻: 毎日 08:00' });
    const canceled = await createScheduledProject({ title: '中止案件', state: '中止', conditions: '定刻: 毎日 08:00' });
    const plain = await createScheduledProject({ title: '通常案件', state: '未着手', conditions: '定刻: 毎日 08:00', withRules: false });
    const dirty = await createScheduledProject({ title: '編集中', state: '未着手', conditions: '定刻: 毎日 08:00' });
    dirty.Content = `${dirty.Content}\n編集途中`;
    const locked = await createScheduledProject({ title: 'ロック中', state: '待機', conditions: '定刻: 毎日 08:00' });
    locked.Metadata = { ...locked.Metadata, [HARNESS_LOCK_KEY]: { by: 'other-pc', at: new Date(2026, 10, 23, 8, 25).toISOString() } };
    await locked.SaveContent();

    const start = vi.fn();
    const ran = await maybeRunScheduledProjects(vault, { now: new Date(2026, 10, 23, 8, 30), start });
    expect(ran).toEqual([]);
    expect(start).not.toHaveBeenCalled();
    expect([paused, done, canceled, plain, dirty, locked].every(p => !p.Metadata[HARNESS_SCHEDULE_LAST_RUN_KEY])).toBe(true);
  });

  it('harnessDoctor は不正な定刻書式を WARN として報告する', async () => {
    await createScheduledProject({ title: '書式ミス案件', state: '待機', conditions: '定刻: 毎日 99:00' });
    const findings = await collectDoctorFindings(vault, { now: new Date(2026, 10, 23, 9, 0), toolStatus: async () => null });
    expect(findings.some(f => f.level === 'WARN' && f.area === '定刻' && f.message.includes('99:00'))).toBe(true);
  });
});

describe('startHarnessScheduler', () => {
  it('定刻を迎えたタイミングで定期チェックから自動起動する', async () => {
    vi.useFakeTimers();
    try {
      let current = new Date(2026, 10, 23, 7, 59);
      const project = await createScheduledProject({ state: '待機', conditions: '定刻: 毎日 08:00' });
      const start = vi.fn();
      const stop = startHarnessScheduler(vault, {
        start,
        intervalMs: 60_000,
        debounceMs: 0,
        now: () => current,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(start).not.toHaveBeenCalled();

      current = new Date(2026, 10, 23, 8, 0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(start).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledWith(project.ID, '2026-11-23 08:00', expect.objectContaining({ hour: 8, minute: 0 }));

      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
