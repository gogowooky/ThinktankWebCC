/**
 * harnessReviewTrigger.ts
 * 週次の見直しを、期限が来ていれば始める。常駐はせず、PC版で Vault が読み込まれた後とループの終わりに呼ぶ。
 * （ループを起動するため、harnessRun から読まれる harnessReview とは分けている）
 */

import type { TTVault } from '../../models/TTVault';
import { formatLocalDate } from '../../utils/aiViewFormat';
import { isHarnessProject } from '../../utils/thinkFormat';
import { ensureHarnessAiWork } from './harnessAiWork';
import { HarnessLoop } from './harnessLoop';
import { findRootProject } from './harnessRoot';
import {
  REVIEW_INTERVAL_DAYS, collectReviewMaterial, ensureReviewProject, isReviewProject, lastReviewDate,
} from './harnessReview';

const DAY_MS = 24 * 60 * 60 * 1000;
let attemptedDay: string | null = null;

/** テスト用 */
export function resetReviewAttempt(): void { attemptedDay = null; }

export interface MaybeRunReviewOptions {
  now?: Date;
  /** テスト用。省略時は HarnessLoop.start */
  start?: (projectId: string) => Promise<unknown>;
}

/**
 * 前回の見直しから7日以上たち、この1週間にハーネスの記録があれば、週次の改善 project のループを始める。
 * 1日に1回までしか試さない（失敗しても繰り返し起動しないため）。始めたら true
 */
export async function maybeRunWeeklyReview(vault: TTVault, options: MaybeRunReviewOptions = {}): Promise<boolean> {
  const now = options.now ?? new Date();
  const today = formatLocalDate(now);
  if (attemptedDay === today) return false;
  try {
    const root = findRootProject(vault);
    if (!root) return false;
    if (root.IsMetaOnly) await root.LoadContent();
    if (!isHarnessProject(root.Content)) return false;
    const existing = vault.GetProjects().find(p => isReviewProject(p));
    if (existing) {
      if (existing.IsMetaOnly) await existing.LoadContent();
      const last = await lastReviewDate(vault, existing);
      if (last && now.getTime() - last.getTime() < REVIEW_INTERVAL_DAYS * DAY_MS) return false;
      if (HarnessLoop.isRunning(existing.ID)) return false;
    }
    const material = await collectReviewMaterial(vault, now);
    if (material.entryCount === 0) return false;
    attemptedDay = today;
    const review = existing ?? await ensureReviewProject(vault);
    await ensureHarnessAiWork(vault, review, 'log');
    const start = options.start ?? (id => HarnessLoop.start(vault, id, { trigger: 'chat', userMessage: '（定期）週次の見直しをしてください' }));
    void start(review.ID);
    return true;
  } catch (error) {
    console.warn('[harnessReview] 週次の見直しを始められませんでした', error);
    return false;
  }
}
