/**
 * harnessSchedule.ts
 * projectファイルの「# 条件」に書かれた定刻（例: 定刻: 毎日 08:00）を読み取り、
 * 指定時刻を過ぎて当日まだ未実行のハーネス project を自動で起動する。
 *
 * - 対象: isHarnessProject が true で、# 状態 が「未着手」または「待機」の project
 * - 停止方法: # 状態 を「保留」「完了」「中止」にすれば定刻起動しない
 * - 起動遅れ対応: 定刻を過ぎてから PC / アプリを開いた場合も、当日未実行分があれば開いたタイミングで実行する
 * - 二重起動防止: project の metadata.harnessScheduleLastRun とメモリ上の試行記録の両方で同じスロットの再実行を防ぐ
 * - AI CLI を動かせる PC版だけで使う（App.tsx から startHarnessScheduler で起動）
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import {
  isHarnessProject, readProjectSectionText, readProjectStatus, type ProjectState,
} from '../../utils/thinkFormat';
import { formatLocalDate } from '../../utils/aiViewFormat';
import { HarnessLoop, lockedByOther, type StartHarnessLoopOptions } from './harnessLoop';

/** project の metadata に残す、最後に定刻起動したスロット情報 */
export const HARNESS_SCHEDULE_LAST_RUN_KEY = 'harnessScheduleLastRun';
/** 定期チェックの間隔（1分） */
export const SCHEDULE_CHECK_INTERVAL_MS = 60_000;
const LOAD_CONCURRENCY = 6;
const DEBOUNCE_MS = 300;

/** 定刻起動の対象にする # 状態（保留・完了・中止・ツール・進行中・不明は自動起動しない） */
export const SCHEDULE_ELIGIBLE_STATES: ReadonlySet<ProjectState> = new Set<ProjectState>(['未着手', '待機']);

export interface HarnessScheduleLastRun {
  /** YYYY-MM-DD HH:mm 形式の実行済みスロット */
  slot: string;
  /** 実際に起動した時刻（ISO文字列） */
  at: string;
}

export interface ParsedSchedule {
  /** 元の指定文字列（例: "毎日 08:00"） */
  raw: string;
  hour: number;
  minute: number;
  /** undefined = 曜日指定なし（毎日 または 毎月）。配列のときは 0=日..6=土 */
  daysOfWeek?: number[];
  /** 毎月指定時の日（1..31） */
  dayOfMonth?: number;
}

export interface ScheduleParseResult {
  schedules: ParsedSchedule[];
  /** 「定刻:」行だが解釈できなかったもの（harnessDoctor の WARN 用） */
  invalidLines: string[];
}

const SCHEDULE_LINE_RE = /^\s*(?:定刻|スケジュール)\s*[:：]\s*(.+?)\s*$/;
const TIME_RE = /^(\d{1,2})\s*[:：]\s*(\d{2})$/;
const WEEKDAY_MAP: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
};

function parseTime(text: string): { hour: number; minute: number } | null {
  const m = TIME_RE.exec(text.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function parseWeekdays(text: string): number[] | null {
  const cleaned = text.replace(/曜日?|[\s、,・/／]+/g, '');
  if (!cleaned) return null;
  const days = new Set<number>();
  for (const ch of cleaned) {
    const day = WEEKDAY_MAP[ch];
    if (day === undefined) return null;
    days.add(day);
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : null;
}

function parseSingleSchedule(raw: string): ParsedSchedule | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  // 1. 時刻のみ（例: 08:00 / 8:00）→ 毎日扱い
  const timeOnly = parseTime(s);
  if (timeOnly) return { raw: s, ...timeOnly };

  // 2. 末尾の時刻を取り出す
  const lastSpace = s.lastIndexOf(' ');
  const splitMatch = lastSpace !== -1
    ? [s.slice(0, lastSpace).trim(), s.slice(lastSpace + 1).trim()]
    : /^(毎日|平日|土日|週末|毎週.+?|毎月\d{1,2}日?)(\d{1,2}[:：]\d{2})$/.exec(s)?.slice(1);
  if (!splitMatch) return null;

  const [spec, timePart] = splitMatch;
  const time = parseTime(timePart);
  if (!time) return null;

  if (spec === '毎日') return { raw: s, ...time };
  if (spec === '平日') return { raw: s, ...time, daysOfWeek: [1, 2, 3, 4, 5] };
  if (spec === '土日' || spec === '週末') return { raw: s, ...time, daysOfWeek: [0, 6] };

  const weeklyMatch = /^毎週\s*(.+)$/.exec(spec);
  if (weeklyMatch) {
    const daysOfWeek = parseWeekdays(weeklyMatch[1]);
    return daysOfWeek ? { raw: s, ...time, daysOfWeek } : null;
  }

  const monthlyMatch = /^毎月\s*(\d{1,2})日?$/.exec(spec);
  if (monthlyMatch) {
    const dayOfMonth = Number(monthlyMatch[1]);
    if (dayOfMonth >= 1 && dayOfMonth <= 31) return { raw: s, ...time, dayOfMonth };
    return null;
  }

  // 「月水金 08:00」のように「毎週」を省略した曜日指定も許容する
  const bareWeekdays = parseWeekdays(spec);
  if (bareWeekdays) return { raw: s, ...time, daysOfWeek: bareWeekdays };

  return null;
}

/** project の「# 条件」本文から定刻指定をすべて読み取る */
export function parseScheduleConditions(conditionsText: string): ScheduleParseResult {
  const schedules: ParsedSchedule[] = [];
  const invalidLines: string[] = [];
  for (const line of conditionsText.split(/\r?\n/)) {
    const m = SCHEDULE_LINE_RE.exec(line);
    if (!m) continue;
    const parsed = parseSingleSchedule(m[1]);
    if (parsed) schedules.push(parsed);
    else invalidLines.push(line.trim());
  }
  return { schedules, invalidLines };
}

/** スロット文字列 YYYY-MM-DD HH:mm */
export function formatScheduleSlot(date: Date, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatLocalDate(date)} ${pad(hour)}:${pad(minute)}`;
}

function matchesDate(schedule: ParsedSchedule, date: Date): boolean {
  if (schedule.daysOfWeek && !schedule.daysOfWeek.includes(date.getDay())) return false;
  if (schedule.dayOfMonth !== undefined && schedule.dayOfMonth !== date.getDate()) return false;
  return true;
}

/**
 * 今日（now の日付）の定刻のうち、すでに時刻を迎えていて、まだ未実行の最新スロットを返す。
 * 1日に複数時刻が過ぎていた場合も、最新のスロット1件だけを返す（連発を防ぐため）。
 */
export function findDueScheduleSlot(
  schedules: ParsedSchedule[],
  now: Date,
  lastRunSlot?: string | null,
): { slot: string; schedule: ParsedSchedule } | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let latest: { slot: string; schedule: ParsedSchedule } | null = null;

  for (const schedule of schedules) {
    if (!matchesDate(schedule, now)) continue;
    const targetMinutes = schedule.hour * 60 + schedule.minute;
    if (targetMinutes > nowMinutes) continue;
    const slot = formatScheduleSlot(now, schedule.hour, schedule.minute);
    if (!latest || slot > latest.slot) latest = { slot, schedule };
  }

  if (!latest) return null;
  if (lastRunSlot && latest.slot <= lastRunSlot) return null;
  return latest;
}

/** project の metadata から前回実行済みスロットを読む */
export function readLastScheduleSlot(project: TTThink): string | null {
  const info = project.Metadata?.[HARNESS_SCHEDULE_LAST_RUN_KEY] as Partial<HarnessScheduleLastRun> | undefined;
  return typeof info?.slot === 'string' && info.slot.trim() ? info.slot.trim() : null;
}

async function mapLimited<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, items.length) }, worker));
}

// 同一セッション内で metadata 保存失敗や非同期競合による再試行ループを防ぐための記録
const attemptedSlots = new Map<string, string>();

/** テスト用 */
export function resetScheduleAttempts(): void {
  attemptedSlots.clear();
}

export interface MaybeRunScheduledOptions {
  now?: Date;
  /** テスト用。省略時は HarnessLoop.start */
  start?: (projectId: string, slot: string, schedule: ParsedSchedule) => void | Promise<unknown>;
  /** 起動時の CLI・パネル設定を解決する */
  resolveStartOptions?: (projectId: string) => Partial<StartHarnessLoopOptions>;
}

/**
 * 全ハーネス project の「# 条件」を確認し、定刻を過ぎて当日未実行のものがあれば起動する。
 * 起動した project の ID 一覧を返す。
 */
export async function maybeRunScheduledProjects(
  vault: TTVault,
  options: MaybeRunScheduledOptions = {},
): Promise<string[]> {
  const now = options.now ?? new Date();
  await mapLimited(vault.GetProjects().filter(p => p.IsMetaOnly), p => p.LoadContent());

  const startedIds: string[] = [];
  for (const project of vault.GetProjects()) {
    if (project.IsMetaOnly || project.IsDirty) continue;
    if (!isHarnessProject(project.Content)) continue;

    const state = readProjectStatus(project.Content).state;
    if (!SCHEDULE_ELIGIBLE_STATES.has(state)) continue;
    if (HarnessLoop.isRunning(project.ID) || lockedByOther(project, now.getTime())) continue;

    const conditions = readProjectSectionText(project.Content, '条件');
    if (!conditions) continue;
    const { schedules } = parseScheduleConditions(conditions);
    if (schedules.length === 0) continue;

    const persistedLast = readLastScheduleSlot(project);
    const memoryLast = attemptedSlots.get(project.ID) ?? null;
    const effectiveLast = persistedLast && memoryLast
      ? (persistedLast > memoryLast ? persistedLast : memoryLast)
      : (persistedLast ?? memoryLast);

    const due = findDueScheduleSlot(schedules, now, effectiveLast);
    if (!due) continue;

    attemptedSlots.set(project.ID, due.slot);
    const previousMeta = project.Metadata;
    project.Metadata = {
      ...project.Metadata,
      [HARNESS_SCHEDULE_LAST_RUN_KEY]: { slot: due.slot, at: now.toISOString() } satisfies HarnessScheduleLastRun,
    };
    try {
      await project.SaveContent();
    } catch (error) {
      project.Metadata = previousMeta;
      console.warn('[harnessSchedule] 定刻実行の記録を保存できませんでした', error);
      continue;
    }

    startedIds.push(project.ID);
    const start = options.start ?? ((projectId, slot) => {
      const extra = options.resolveStartOptions?.(projectId);
      const timeLabel = slot.slice(11);
      return HarnessLoop.start(vault, projectId, {
        trigger: 'schedule',
        userMessage: `（定刻 ${timeLabel}）予定時刻になったため、本日の処理を開始してください。`,
        ...extra,
      });
    });
    void start(project.ID, due.slot, due.schedule);
  }
  return startedIds;
}

export interface HarnessSchedulerOptions {
  /** テスト用。省略時は HarnessLoop.start */
  start?: (projectId: string, slot: string, schedule: ParsedSchedule) => void | Promise<unknown>;
  resolveStartOptions?: (projectId: string) => Partial<StartHarnessLoopOptions>;
  intervalMs?: number;
  debounceMs?: number;
  now?: () => Date;
}

/**
 * 定刻起動スケジューラを開始する（PC版専用）。
 * - 起動直後および Vault 更新後（読込完了・project 編集保存後）に当日未実行分をチェック
 * - 1分ごとに現在時刻をチェック
 * - スリープ復帰（タブ再表示）時にも即座にチェック
 */
export function startHarnessScheduler(vault: TTVault, options: HarnessSchedulerOptions = {}): () => void {
  let checking = false;
  let queued = false;
  const runCheck = () => {
    if (checking) { queued = true; return; }
    checking = true;
    void maybeRunScheduledProjects(vault, {
      now: (options.now ?? (() => new Date()))(),
      start: options.start,
      resolveStartOptions: options.resolveStartOptions,
    }).catch(error => {
      console.warn('[harnessSchedule] 定刻チェックに失敗しました', error);
    }).finally(() => {
      checking = false;
      if (queued) { queued = false; runCheck(); }
    });
  };

  runCheck();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const vaultKey = `harnessScheduler-${Math.random().toString(36).slice(2)}`;
  vault.AddOnUpdate(vaultKey, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; runCheck(); }, options.debounceMs ?? DEBOUNCE_MS);
  });

  const intervalMs = options.intervalMs ?? SCHEDULE_CHECK_INTERVAL_MS;
  const intervalTimer = intervalMs > 0 ? setInterval(runCheck, intervalMs) : null;

  const onVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') runCheck();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    vault.RemoveOnUpdate(vaultKey);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}
