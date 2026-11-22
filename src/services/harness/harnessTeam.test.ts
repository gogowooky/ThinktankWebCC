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
import { firstHarnessId, parseProject, projectHarnessIds, readProjectStatus, setProjectHarnessId } from '../../utils/thinkFormat';
import {
  applyVerify, readBoard, readTeamDirective, readVerifyItems, serializeBoard, type BoardData,
} from './harnessBoard';
import { ensureRoleWorks, listRoles, roleNameOf, serializeRole, ROLE_TEMPLATES } from './harnessRoles';
import { HarnessLoop } from './harnessLoop';
import type { HarnessAiResponse } from './harnessRun';

let vault: TTVault;
beforeEach(() => { vi.clearAllMocks(); vault = new TTVault('vault'); HarnessLoop.reset(); });

it('役割は「役割 | 名前」の AIWork で、root の # 役割 に並べる。無ければ雛形を作り、# 条件 の AI・モデルを読む', async () => {
  expect(await ensureRoleWorks(vault)).toBe(ROLE_TEMPLATES.length);
  expect(await ensureRoleWorks(vault)).toBe(0);
  const root = vault.GetProjects().find(p => p.Name === 'Thinktank')!;
  const ids = projectHarnessIds(root.Content, '役割');
  expect(ids).toHaveLength(ROLE_TEMPLATES.length);
  const check = ids.map(id => vault.GetThink(id)!).find(t => t.Name === '役割 | 確かめる')!;
  expect(check.ContentType).toBe('aiview');
  expect(check.Content).toMatch(/^役割 \| 確かめる\n# 仕事\n成果物を指定の正本と突き合わせる。/);
  expect(vault.GetProjects().some(p => p.Name.startsWith('役割'))).toBe(false);
  check.Content = check.Content.replace('# 条件', '# 条件\nAI: claude\nモデル: claude-opus');
  const roles = await listRoles(vault, [root]);
  expect(roles.map(r => r.name)).toEqual(expect.arrayContaining(['確かめる', '読む・探す', '批評する']));
  expect(roles.find(r => r.name === '確かめる')).toMatchObject({ id: check.ID, cli: 'claude', model: 'claude-opus' });
  expect(roles.find(r => r.name === '確かめる')!.rules).toContain('正本と突き合わせる');
  expect(roleNameOf('役割｜確かめる')).toBe('確かめる');
  expect(roleNameOf('確かめる')).toBeNull();
});

it('子の project の # 役割 は root の同じ名前の役割より優先する', async () => {
  await ensureRoleWorks(vault);
  const root = vault.GetProjects().find(p => p.Name === 'Thinktank')!;
  const own = await vault.CreateAiViewThink(serializeRole('確かめる', 'この案件の正本は仕様書だけ'));
  const project = await vault.CreateProjectFromIds([]);
  project.Content = setProjectHarnessId(project.Content, '役割', own.ID);
  const roles = await listRoles(vault, [root, project]);
  expect(roles.find(r => r.name === '確かめる')).toMatchObject({ id: own.ID, rules: 'この案件の正本は仕様書だけ' });
});

it('board はアプリだけが書く形で、< や --> を含む報告でも読み戻せる', () => {
  const data: BoardData = { goal: '朝の報告', doneCriteria: '時刻の食い違いを確かめる', rows: [
    { id: 'T1', role: '確かめる', roleId: 'r1', task: '照合', state: 'reported', report: 'a < b --> c\n2行目' },
  ] };
  const text = serializeBoard('P｜board', data);
  expect(text).toContain('## T1 ［報告済み（未検証）］ 確かめる');
  expect(text).toContain('  2行目');
  const think = { Content: text } as TTThink;
  expect(readBoard(think)).toEqual(data);
  expect(readBoard(null).rows).toEqual([]);
});

it('分担と検証を応答の JSON から読み、検証は報告のある行だけに付ける', () => {
  const raw = JSON.stringify({
    team: { goal: 'G', doneCriteria: 'D', assignments: [{ role: '確かめる', task: '照合する' }, { role: '', task: 'x' }] },
    verify: [{ id: 'T1', result: 'verified', note: '元メールで確かめた' }, { id: 'T2', result: 'verified' }, { id: 'T3', result: 'done' }],
  });
  expect(readTeamDirective(raw)).toEqual({ goal: 'G', doneCriteria: 'D', assignments: [{ role: '確かめる', task: '照合する' }] });
  const items = readVerifyItems(raw);
  expect(items.map(i => i.id)).toEqual(['T1', 'T2']);
  const data: BoardData = { goal: '', doneCriteria: '', rows: [
    { id: 'T1', role: '確かめる', task: 'a', state: 'reported', report: '一致' },
    { id: 'T2', role: '読む・探す', task: 'b', state: 'running' },
  ] };
  const { data: next, applied } = applyVerify(data, items);
  expect(applied.map(a => a.id)).toEqual(['T1']);
  expect(next.rows.map(r => r.state)).toEqual(['verified', 'running']);
  expect(next.rows[0].note).toBe('元メールで確かめた');
});

const runIdOf = (payload: Record<string, unknown>) => /```\n# \[[^\]]+\] 実行 ([0-9a-f]{8})/.exec(String(payload.userMessage))?.[1];

it('チーム: まとめ役が任せると担当が並行して動き、報告を board に書き、まとめ役が確かめた行だけが検証済みになる', async () => {
  const project = await vault.CreateProjectFromIds([]);
  project.Content = project.Content.replace(/^[^\n]*/, '朝の秘書業務').replace('# 条件', '# 規約\n朝の報告を作る\n# 条件');
  await project.SaveContent();
  let coordinatorTurn = 0;
  const workerPayloads: Array<Record<string, unknown>> = [];
  const requestReply = vi.fn(async (payload: Record<string, unknown>): Promise<HarnessAiResponse> => {
    const writable = (payload.harness as { writableIds: string[] }).writableIds;
    if (writable.length === 0) {
      workerPayloads.push(payload);
      const message = String(payload.userMessage);
      if (message.includes('担当「失敗する」')) throw new Error('AI CLI がタイムアウトしました');
      return { reply: message.includes('照合') ? '時刻が食い違う（メール15時・予定14時）' : 'メールは3件', modelLabel: 'gpt-6.1-sol' };
    }
    const runId = runIdOf(payload)!;
    const log = vault.GetThink(firstHarnessId(project.Content, 'log')!)!;
    const status = vault.GetThink(firstHarnessId(project.Content, 'status')!)!;
    log.setContentSilent(`${log.TitleLine}\n# [2026-11-22 10:30] 実行 ${runId}\n記録\n\n${log.Body}`.trimEnd());
    status.setContentSilent(`${status.TitleLine}\n- 次の行動: 確認 ${++coordinatorTurn}`);
    const body = coordinatorTurn === 1
      ? { reply: '分担します。', harness: { state: 'delegate' }, team: { goal: '朝の報告', doneCriteria: '食い違いを確かめる', assignments: [
        { role: '確かめる', task: 'メールと予定表を照合する' }, { role: '読む・探す', task: 'メールを読む' }, { role: '失敗する', task: '何かする' }] } }
      : { reply: '報告を確かめました。', harness: { state: 'waiting', question: '主催者に確認してよいですか' },
        verify: [{ id: 'T1', result: 'verified', note: '元メールと予定表を見た' }, { id: 'T2', result: 'blocked', note: '要判断' }, { id: 'T3', result: 'verified' }] };
    return { reply: body.reply, modelLabel: 'claude', rawText: JSON.stringify(body) };
  });

  await HarnessLoop.start(vault, project.ID, { trigger: 'chat', userMessage: '始めて', requestReply, aiWriteWaitMs: 0 });

  expect(workerPayloads).toHaveLength(3);
  const checkWorker = workerPayloads.find(p => String(p.userMessage).includes('照合'))!;
  expect(String(checkWorker.userMessage)).toContain('正本と突き合わせる');
  expect(String(checkWorker.userMessage)).toContain('既存の Think は書き換えられません');
  expect(String(workerPayloads.find(p => String(p.userMessage).includes('担当「失敗する」'))!.userMessage)).toContain('即席の担当');

  const board = readBoard(vault.GetThink(firstHarnessId(project.Content, 'board')!)!);
  expect(board.goal).toBe('朝の報告');
  expect(board.rows.map(r => [r.id, r.role, r.state])).toEqual([
    ['T1', '確かめる', 'verified'], ['T2', '読む・探す', 'blocked'], ['T3', '失敗する', 'failed'],
  ]);
  expect(board.rows[0]).toMatchObject({ report: '時刻が食い違う（メール15時・予定14時）', note: '元メールと予定表を見た', model: 'gpt-6.1-sol' });
  expect(board.rows[2].note).toContain('タイムアウト');
  expect(board.rows[0].roleId).toBeTruthy();
  expect(board.rows[2].roleId).toBeUndefined();

  expect(readProjectStatus(project.Content).state).toBe('待機');
  const chat = vault.GetThink(parseProject(project.Content).aiDiscussionIds[0])!;
  expect(chat.Content).toContain('担当に任せます: 確かめる');
  expect(chat.Content).toContain('担当の作業が終わりました: T1 確かめる［報告済み（未検証）］');
  expect(chat.Content).toContain('共有ボードの検証: T1 → verified、T2 → blocked');
  expect(coordinatorTurn).toBe(2);
});
