// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => {
  let n = 0;
  return {
    supportsSnapshots: false,
    save: vi.fn(async () => ({ updatedAt: `2026-11-22T0${Math.floor(++n / 3600) % 10}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}Z` })),
    updateMetadata: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ updatedAt: '2026-11-22T01:00:00Z', metadata: patch })),
    delete: vi.fn(async () => undefined),
    getRecord: vi.fn(async () => null),
  };
});
vi.mock('../storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { firstHarnessId, readProjectSectionText } from '../../utils/thinkFormat';
import { ensureHarnessAiWork } from './harnessAiWork';
import { ensureRootHarness } from './harnessRoot';
import { ensureRoleWorks } from './harnessRoles';
import {
  REVIEW_TITLE, collectActivity, collectReviewMaterial, ensureReviewProject, isReviewProject, logEntries,
} from './harnessReview';
import { maybeRunWeeklyReview, resetReviewAttempt } from './harnessReviewTrigger';
import { runHarnessTurn, type HarnessAiResponse } from './harnessRun';
import { decideCorrection, pendingCorrections } from './harnessCorrections';

let vault: TTVault;
beforeEach(() => { vi.clearAllMocks(); vault = new TTVault('vault'); resetReviewAttempt(); });

const NOW = new Date(2026, 10, 22, 12, 0, 0);

async function projectWithLog(title: string, entries: string[]): Promise<{ project: TTThink; log: TTThink }> {
  const project = await vault.CreateProjectFromIds([]);
  project.Content = project.Content.replace(/^[^\n]*/, title).replace('# 条件', `# 規約\n${title}の規約\n# 条件`);
  await project.SaveContent();
  const log = await ensureHarnessAiWork(vault, project, 'log');
  log.Content = [log.TitleLine, ...entries].join('\n');
  return { project, log };
}

it('log の記録の日付・見出し・最初の行を読む（モデル名の行・コードブロックの中は飛ばす）', () => {
  expect(logEntries('P｜log\n# [2026-11-22 10:30] 実行 aaaa1111\n(claude)\n時刻を要確認にした\n```\n# [2026-01-01] 偽物\n```\n# [2026-11-21] 進捗要約\n本文')).toEqual([
    { date: '2026-11-22', time: '10:30', heading: '実行 aaaa1111', firstLine: '時刻を要確認にした' },
    { date: '2026-11-21', time: '', heading: '進捗要約', firstLine: '本文' },
  ]);
});

it('期間内のハーネスの log の記録を新しい順に集め、週次の改善 project は除く', async () => {
  await ensureRootHarness(vault);
  await ensureRoleWorks(vault);
  const a = await projectWithLog('朝の秘書業務', ['# [2026-11-22 09:00] 実行 a1\n朝の報告を出した', '# [2026-11-10 09:00] 実行 a0\n古い']);
  const b = await projectWithLog('議事録', ['# [2026-11-20 15:00] 実行 b1\n決定事項を冒頭へ']);
  const review = await ensureReviewProject(vault);
  const reviewLog = await ensureHarnessAiWork(vault, review, 'log');
  reviewLog.Content = `${reviewLog.TitleLine}\n# [2026-11-21 10:00] 実行 r1\n見直し`;
  const entries = await collectActivity(vault, '2026-11-16', '2026-11-22');
  expect(entries.map(e => [e.date, e.projectTitle, e.heading])).toEqual([
    ['2026-11-22', '朝の秘書業務', '実行 a1'], ['2026-11-20', '議事録', '実行 b1'],
  ]);
  const material = await collectReviewMaterial(vault, NOW);
  expect(material.entryCount).toBe(2);
  expect(material.text).toContain('朝の報告を出した');
  expect([a.project.ID, a.log.ID, b.project.ID, b.log.ID].every(id => material.evidenceIds.has(id))).toBe(true);
});

it('週次の見直しは、7日たち1週間に記録があるときだけ、1日に1回まで始める', async () => {
  const start = vi.fn(async () => true);
  expect(await maybeRunWeeklyReview(vault, { now: NOW, start })).toBe(false); // root が無い
  await ensureRootHarness(vault);
  expect(await maybeRunWeeklyReview(vault, { now: NOW, start })).toBe(false); // 記録が無い
  await projectWithLog('朝の秘書業務', ['# [2026-11-22 09:00] 実行 a1\n朝の報告']);
  expect(await maybeRunWeeklyReview(vault, { now: NOW, start })).toBe(true);
  const review = vault.GetProjects().find(p => isReviewProject(p))!;
  expect(review.Name).toBe(REVIEW_TITLE);
  expect(readProjectSectionText(review.Content, '規約')).toContain('evidenceIds');
  expect(start).toHaveBeenCalledWith(review.ID);
  expect(await maybeRunWeeklyReview(vault, { now: NOW, start })).toBe(false); // 同じ日

  resetReviewAttempt();
  const log = vault.GetThink(firstHarnessId(review.Content, 'log')!)!;
  log.Content = `${log.TitleLine}\n# [2026-11-20 10:00] 実行 r1\n見直し`;
  expect(await maybeRunWeeklyReview(vault, { now: NOW, start })).toBe(false); // 前回から2日
  expect(await maybeRunWeeklyReview(vault, { now: new Date(2026, 10, 30, 12), start })).toBe(false); // 記録が1週間より前
  expect(await maybeRunWeeklyReview(vault, { now: new Date(2026, 10, 28, 12), start })).toBe(true); // 前回から8日・記録あり
});

const runIdOf = (payload: Record<string, unknown>) => /```\n# \[[^\]]+\] 実行 ([0-9a-f]{8})/.exec(String(payload.userMessage))![1];

it('見直しの実行: 材料を渡し、根拠の ID が材料にある改善案だけを採り、採否を decision に残す', async () => {
  await ensureRootHarness(vault);
  const { project: target, log: targetLog } = await projectWithLog('朝の秘書業務', ['# [2026-11-22 09:00] 実行 a1\n毎回「結論を冒頭に」と言われた']);
  const review = await ensureReviewProject(vault);
  const requestReply = vi.fn(async (payload: Record<string, unknown>): Promise<HarnessAiResponse> => {
    const runId = runIdOf(payload);
    const log = vault.GetThink(firstHarnessId(review.Content, 'log')!)!;
    const status = vault.GetThink(firstHarnessId(review.Content, 'status')!)!;
    log.setContentSilent(`${log.TitleLine}\n# [2026-11-22 12:00] 実行 ${runId}\n## 週報（下書き）\n朝の報告が進んだ`);
    status.setContentSilent(`${status.TitleLine}\n- 提案の確認待ち`);
    return { reply: '提案があります。', modelLabel: 'claude', rawText: JSON.stringify({
      reply: '提案があります。', harness: { state: 'waiting', question: '提案を確かめてください' },
      corrections: [
        { kind: 'rules', text: '報告は結論を冒頭に書く', reason: '毎回言われている', evidenceIds: [target.ID, targetLog.ID], targetId: target.ID },
        { kind: 'PROFILE', text: '材料に無い根拠', evidenceIds: ['2020-01-01-000000'] },
        { kind: 'styles', text: '週報は3行', targetName: '週報', evidenceIds: [targetLog.ID] },
      ],
    }) };
  });
  const result = await runHarnessTurn({ vault, projectId: review.ID, userMessage: '（定期）週次の見直しをしてください', requestReply, now: () => NOW, aiWriteWaitMs: 0 });
  const message = String((requestReply.mock.calls[0] as unknown as [Record<string, unknown>])[0].userMessage);
  expect(message).toContain('# 1週間の材料');
  expect(message).toContain('毎回「結論を冒頭に」と言われた');
  expect(message).toContain('evidenceIds');

  const chat = vault.GetThink(result.chatId)!;
  const [rule, style] = pendingCorrections(chat);
  expect(pendingCorrections(chat)).toHaveLength(2);
  expect(rule).toMatchObject({ origin: 'review', userQuote: '', evidenceIds: [target.ID, targetLog.ID] });
  expect(chat.Content).toContain('### 改善の提案（未承認');

  await decideCorrection(vault, review, chat, rule.id, 'approve', NOW);
  await decideCorrection(vault, review, chat, style.id, 'reject', NOW);
  expect(readProjectSectionText(target.Content, '規約')).toContain('報告は結論を冒頭に書く（2026-11-22、週次の改善、根拠:');
  expect(readProjectSectionText(review.Content, '規約')).not.toContain('報告は結論を冒頭に書く');
  const decision = vault.GetThink(firstHarnessId(review.Content, 'decision')!)!;
  expect(decision.Content).toContain('［採用］働き方のルール（# 規約）: 報告は結論を冒頭に書く（2026-11-22、理由: 毎回言われている');
  expect(decision.Content).toContain('［見送り］業務の作法（styles）: 週報は3行');
});
