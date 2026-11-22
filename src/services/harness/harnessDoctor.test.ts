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
import { firstHarnessId } from '../../utils/thinkFormat';
import { ensureHarnessAiWork } from './harnessAiWork';
import { ensureHarnessChat } from './harnessChat';
import { ensureRootHarness } from './harnessRoot';
import {
  collectDoctorFindings, lastDoctorDate, maybeRunHarnessDoctor, runHarnessDoctor, type DoctorEnv,
} from './harnessDoctor';
import { startHarnessWatcher } from './harnessWatcher';

let vault: TTVault;
beforeEach(() => { vi.clearAllMocks(); vault = new TTVault('vault'); });

const NOW = new Date('2026-11-22T10:00:00Z');
const okTool: DoctorEnv['toolStatus'] = async () => ({ cli: 'codex', available: true, loggedIn: true });
const env = (extra: DoctorEnv = {}): DoctorEnv => ({ now: NOW, toolStatus: okTool, ...extra });

async function healthy() {
  const { root, inbox } = await ensureRootHarness(vault);
  const project = await vault.CreateProjectFromIds([]);
  project.Content = project.Content.replace(/^[^\n]*/, '朝の秘書業務').replace('# 状態\n未着手', '# 状態\n進行中').replace('# 条件', '# 規約\n朝の報告を作る\n# 条件');
  await project.SaveContent();
  const status = await ensureHarnessAiWork(vault, project, 'status');
  status.UpdatedAt = NOW.toISOString();
  await ensureHarnessChat(vault, project);
  await ensureRootHarness(vault);
  return { root, inbox, project, status };
}

const areas = async (extra?: DoctorEnv) => (await collectDoctorFindings(vault, env(extra))).map(f => `${f.level} ${f.area}`);

it('壊れていなければ何も見つけない（clean）', async () => {
  await healthy();
  expect(await collectDoctorFindings(vault, env())).toEqual([]);
});

it('参照切れ・AIWork でない参照を NG、1件の項目に複数あれば WARN にする', async () => {
  const { project } = await healthy();
  const memo = await vault.CreateBlankThink('memo', 'メモ');
  project.Content = project.Content.replace('# 規約', `# decision\n[aiwork:2020-01-01-000000]\n# board\n[aiwork:${memo.ID}]\n# 規約`);
  project.Content = project.Content.replace(/# status\n\[aiwork:([^\]]+)\]/, `# status\n[aiwork:$1],[aiwork:$1]`);
  await project.SaveContent();
  const found = await collectDoctorFindings(vault, env());
  expect(found.filter(f => f.level === 'NG').map(f => f.message).join('\n')).toMatch(/# decision が指す 2020-01-01-000000[\s\S]*# board が指す .* は AIWork ではありません/);
  expect(found.some(f => f.level === 'WARN' && f.message.includes('# status に AIWork が 2 件'))).toBe(true);
  expect(found[0].level).toBe('NG');
});

it('字数の超過・進行中なのに status が7日以上未更新・実行中の印の取り残しを WARN にする', async () => {
  const { root, project, status } = await healthy();
  const profile = vault.GetThink(firstHarnessId(root.Content, 'PROFILE')!)!;
  profile.Content = `${profile.TitleLine}\n${'あ'.repeat(3_001)}`;
  status.UpdatedAt = '2026-11-01T00:00:00Z';
  project.Metadata = { ...project.Metadata, harnessLock: { by: 'other', at: '2026-11-22T09:00:00Z' } };
  const found = await collectDoctorFindings(vault, env());
  expect(found.map(f => f.area)).toEqual(expect.arrayContaining(['字数', '鮮度', '実行']));
  expect(found.find(f => f.area === '字数')!.message).toContain('3001/3000字');
  expect(found.find(f => f.area === '鮮度')!.message).toContain('21 日更新されていません');
});

it('会話の原本の関連付け漏れを両方向から見つける', async () => {
  const { project } = await healthy();
  const chatId = project.Content.match(/\[chat:([^\]]+)\]/)![1];
  // project → chat: # AI議論 の chat が無い
  project.Content = project.Content.replace(`[chat:${chatId}]`, `[chat:${chatId}]\n[chat:2020-01-01-000009]`);
  // chat → project: ハーネスの chat が # AI議論 から外れている
  const orphan = await vault.CreateChatThink('TASK:Seeds｜朝の秘書業務');
  orphan.Metadata = { harnessChat: { projectId: project.ID } };
  expect(await areas()).toEqual(['WARN 原本', 'WARN 原本']);
});

it('INDEX のずれ（載っているのに無い・あるのに載っていない）と、出典の無い INBOX を見つける', async () => {
  const { root, inbox } = await healthy();
  const index = vault.GetThink(firstHarnessId(root.Content, 'INDEX')!)!;
  index.Content = `${index.Content}\n- [aiwork:2020-01-01-000001] 消えた作法`;
  const style = await vault.CreateAiViewThink('Thinktank｜styles｜朝の報告');
  root.Content = `${root.Content}\n# styles\n[aiwork:${style.ID}]`;
  inbox.Content = `${inbox.TitleLine}\n- 見積もりの依頼に返信する\n- 会議の変更 [gmail:2026-11-22-000001]`;
  const found = await collectDoctorFindings(vault, env());
  expect(found.map(f => `${f.level} ${f.area}`)).toEqual(['NG INDEX', 'WARN INDEX', 'WARN INBOX']);
  expect(found[2].message).toContain('1 件に出典');
});

it('設定の AI CLI が無い・ログインしていないときは NG にする', async () => {
  await healthy();
  expect(await areas({ toolStatus: async () => ({ cli: 'codex', available: true, loggedIn: false }) })).toEqual(['NG 道具']);
  expect(await areas({ toolStatus: async () => ({ cli: 'codex', available: false, loggedIn: false }) })).toEqual(['NG 道具']);
  expect(await areas({ toolStatus: async () => null })).toEqual([]);
});

it('報告を root の # doctor の先頭に書き、7日たつまでは点検しない', async () => {
  const { root } = await healthy();
  const { findings, doctor } = await runHarnessDoctor(vault, env({ toolStatus: async () => ({ cli: 'codex', available: true, loggedIn: false }) }));
  expect(findings).toHaveLength(1);
  expect(firstHarnessId(root.Content, 'doctor')).toBe(doctor.ID);
  expect(doctor.Content).toMatch(/^Thinktank｜doctor\n# \[2026-11-22 \d\d:\d\d\] 点検\nNG: 1 \/ WARN: 0\n- NG \[道具\]/);
  expect(doctor.Content).toContain('検査しないもの:');
  expect(lastDoctorDate(doctor)?.getDate()).toBe(new Date(NOW).getDate());

  expect(await maybeRunHarnessDoctor(vault, env({ now: new Date('2026-11-25T10:00:00Z') }))).toBe(false);
  expect(await maybeRunHarnessDoctor(vault, env({ now: new Date('2026-11-30T10:00:00Z') }))).toBe(true);
  expect(doctor.Content.match(/点検/g)!.length).toBeGreaterThanOrEqual(2);
});

it('監視は Vault が読み込まれたら一度だけ点検の期限を確かめる', async () => {
  vi.useFakeTimers();
  try {
    await healthy();
    const doctor = vi.fn();
    const review = vi.fn();
    const stop = startHarnessWatcher(vault, { start: vi.fn(), doctor, review, debounceMs: 0 });
    vault.NotifyUpdated(false);
    await vi.runAllTimersAsync();
    expect(doctor).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledTimes(1);
    stop();
  } finally {
    vi.useRealTimers();
  }
});

