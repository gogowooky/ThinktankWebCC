// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => {
  let n = 0;
  return {
    supportsSnapshots: false,
    save: vi.fn(async () => ({ updatedAt: `2026-11-22T00:${String(Math.floor(++n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}Z` })),
    updateMetadata: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ updatedAt: '2026-11-22T01:00:00Z', metadata: patch })),
    delete: vi.fn(async () => undefined),
    getRecord: vi.fn(async () => null),
  };
});
vi.mock('../storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { firstHarnessId, parseProject, projectHarnessIds, readProjectSectionText } from '../../utils/thinkFormat';
import { runHarnessTurn, type HarnessAiResponse } from './harnessRun';
import { decideCorrection, pendingCorrections, readCorrectionCandidates, readCorrections } from './harnessCorrections';
import { ensureRootHarness, findRootProject } from './harnessRoot';

let vault: TTVault;
beforeEach(() => { vi.clearAllMocks(); vault = new TTVault('vault'); });
const NOW = () => new Date(2026, 10, 22, 10, 30, 0);

async function setupProject() {
  const project = await vault.CreateProjectFromIds([]);
  project.Content = project.Content.replace(/^[^\n]*/, '朝の秘書業務').replace('# 条件', '# 規約\n朝の報告を作る\n# 条件');
  await project.SaveContent();
  return project;
}

const runIdOf = (payload: Record<string, unknown>) => /```\n# \[[^\]]+\] 実行 ([0-9a-f]{8})/.exec(String(payload.userMessage))![1];

function aiReplies(project: TTThink, corrections: unknown[]) {
  return vi.fn(async (payload: Record<string, unknown>): Promise<HarnessAiResponse> => {
    const runId = runIdOf(payload);
    const log = vault.GetThink(firstHarnessId(project.Content, 'log')!)!;
    const status = vault.GetThink(firstHarnessId(project.Content, 'status')!)!;
    log.setContentSilent(`${log.TitleLine}\n# [2026-11-22 10:30] 実行 ${runId}\n記録`);
    status.setContentSilent(`${status.TitleLine}\n- 次の行動: 報告を出す`);
    return { reply: '承知しました。', modelLabel: 'claude', rawText: JSON.stringify({ reply: '承知しました。', harness: { state: 'waiting' }, corrections }) };
  });
}

async function runWith(project: TTThink, userMessage: string, corrections: unknown[]) {
  const requestReply = aiReplies(project, corrections);
  const result = await runHarnessTurn({ vault, projectId: project.ID, userMessage, requestReply, now: NOW, aiWriteWaitMs: 0 });
  return { result, requestReply, chat: vault.GetThink(result.chatId)! };
}

const messageOf = (fn: ReturnType<typeof vi.fn>, i = 0) => String((fn.mock.calls[i] as unknown as [Record<string, unknown>])[0].userMessage);

it('提案は、種類・本文・引用が揃い、引用が今回の発言に含まれるものだけを採る', () => {
  const raw = JSON.stringify({ corrections: [
    { kind: 'PROFILE', text: '判断が要るものを先に知らせる', userQuote: '今後は 判断が要るものを先に', reason: '本人の希望' },
    { kind: 'PROFILE', text: '言い換えた引用', userQuote: '判断が必要なものを最初に' },
    { kind: 'unknown', text: 'x', userQuote: '今後は' },
    { kind: 'styles', text: '箇条書きにする', userQuote: '箇条書き', targetName: '朝の報告', targetId: 'not-an-id' },
  ] });
  const said = '今後は判断が要るものを先に知らせて。報告は箇条書きで。';
  expect(readCorrectionCandidates(raw, said)).toEqual([
    { kind: 'PROFILE', text: '判断が要るものを先に知らせる', userQuote: '今後は 判断が要るものを先に', reason: '本人の希望' },
    { kind: 'styles', text: '箇条書きにする', userQuote: '箇条書き', reason: '', targetName: '朝の報告' },
  ]);
  expect(readCorrectionCandidates(raw, undefined)).toEqual([]);
});

it('root に PROFILE・INDEX・INBOX を用意し、INDEX はアプリが場所を並べる', async () => {
  const { root, profile, index, inbox } = await ensureRootHarness(vault);
  expect(findRootProject(vault)).toBe(root);
  expect(root.Name).toBe('Thinktank');
  expect(profile.Content).toContain('利用者の好みと目指す姿');
  expect(inbox.Content).toContain('出典');
  expect(index.Content).toContain(`[aiwork:${profile.ID}]`);
  expect(index.Content).toContain(`[aiwork:${inbox.ID}]`);
  expect((await ensureRootHarness(vault)).root).toBe(root);
});

it('「今後は」の提案を chat に未承認で残し、承認すると PROFILE に書いて INDEX を作り直し、次の実行で使われる', async () => {
  const project = await setupProject();
  const said = '今後は判断が要るものを先に知らせて';
  const { chat } = await runWith(project, said, [{ kind: 'PROFILE', text: '判断が要るものを先に知らせる', userQuote: said, reason: '本人の希望' }]);
  const [pending] = pendingCorrections(chat);
  expect(pending).toMatchObject({ kind: 'PROFILE', status: 'pending', projectId: project.ID });
  expect(chat.Content).toContain('### 訂正の提案（未承認');

  const { root, profile } = await ensureRootHarness(vault);
  await decideCorrection(vault, project, chat, pending.id, 'approve', NOW());
  expect(profile.Content).toContain('- 判断が要るものを先に知らせる（2026-11-22、根拠:「今後は判断が要るものを先に知らせて」）');
  expect(readCorrections(chat)[0]).toMatchObject({ status: 'approved', appliedTo: `[aiwork:${profile.ID}]` });
  expect(chat.Content).toContain('訂正を反映しました');
  expect(firstHarnessId(root.Content, 'PROFILE')).toBe(profile.ID);

  // 別の chat から始めても、承認した好みは PROFILE として文脈に入る
  project.Content = project.Content.replace(/# AI議論\n\[chat:[^\]]+\]/, '# AI議論');
  await project.SaveContent();
  const next = await runWith(project, '今日の報告をお願い', []);
  expect(next.chat.ID).not.toBe(chat.ID);
  expect(messageOf(next.requestReply)).toContain('判断が要るものを先に知らせる');
});

it('styles は名前で root に作って次回から渡し、rules は project の # 規約 に書き足す。見送りは何も書かない', async () => {
  const project = await setupProject();
  const said = 'いつも朝の報告は箇条書きにして。働き方として、外部に送る前は必ず聞いて。今後は敬語は省いて';
  const { chat } = await runWith(project, said, [
    { kind: 'styles', text: '箇条書きにする', userQuote: 'いつも朝の報告は箇条書きにして', targetName: '朝の報告' },
    { kind: 'rules', text: '外部に送る前は必ず確認する', userQuote: '外部に送る前は必ず聞いて' },
    { kind: 'PROFILE', text: '敬語を省く', userQuote: '今後は敬語は省いて' },
  ]);
  const [style, rule, profile] = pendingCorrections(chat);
  await decideCorrection(vault, project, chat, style.id, 'approve', NOW());
  await decideCorrection(vault, project, chat, rule.id, 'approve', NOW());
  await decideCorrection(vault, project, chat, profile.id, 'reject', NOW());

  const root = findRootProject(vault)!;
  const [styleId] = projectHarnessIds(root.Content, 'styles');
  expect(vault.GetThink(styleId)!.Name).toBe('Thinktank｜styles｜朝の報告');
  expect(vault.GetThink(styleId)!.Content).toContain('箇条書きにする');
  expect(readProjectSectionText(project.Content, '規約')).toContain('外部に送る前は必ず確認する');
  expect(readCorrections(chat).map(c => c.status)).toEqual(['approved', 'approved', 'rejected']);
  expect(vault.GetThink(firstHarnessId(root.Content, 'PROFILE')!)!.Content).not.toContain('敬語');
  await expect(decideCorrection(vault, project, chat, profile.id, 'approve')).rejects.toThrow('すでに決まっています');

  const next = await runWith(project, '続きから', []);
  const message = messageOf(next.requestReply);
  expect(message).toContain('styles: Thinktank｜styles｜朝の報告');
  expect(message).toContain('箇条書きにする');
  expect(message).toContain('アプリの既定');
  expect(parseProject(project.Content).aiDiscussionIds).toContain(chat.ID);
});

it('自動で続けた回（利用者の発言なし）の提案は採らない', async () => {
  const project = await setupProject();
  const { result, chat } = await runWith(project, '', [{ kind: 'PROFILE', text: 'x', userQuote: '' }]);
  expect(result.correctionIds).toEqual([]);
  expect(pendingCorrections(chat)).toEqual([]);
});
