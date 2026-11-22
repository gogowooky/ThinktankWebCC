// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => {
  let n = 0;
  return {
    save: vi.fn(async () => ({ updatedAt: `2026-11-22T00:00:${String(++n).padStart(2, '0')}Z` })),
    updateMetadata: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ updatedAt: '2026-11-22T01:00:00Z', metadata: patch })),
    delete: vi.fn(async () => undefined),
    getRecord: vi.fn(async () => null),
  };
});
vi.mock('../storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from '../../models/TTVault';
import { firstHarnessId, projectHarnessIds } from '../../utils/thinkFormat';
import { addHarnessAiWork, ensureHarnessAiWork, findHarnessAiWork } from './harnessAiWork';

let vault: TTVault;
beforeEach(() => { vi.clearAllMocks(); vault = new TTVault('vault'); });

async function setupProject() {
  const project = await vault.CreateProjectFromIds([]);
  project.Content = project.Content.replace(/^[^\n]*/, '朝の秘書業務');
  await project.SaveContent();
  return project;
}

it('項目に AIWork が無ければ作って書き込み、次からは同じものを返す', async () => {
  const project = await setupProject();
  const status = await ensureHarnessAiWork(vault, project, 'status');
  expect(status.ContentType).toBe('aiview');
  expect(status.Name).toBe('朝の秘書業務｜status');
  expect(firstHarnessId(project.Content, 'status')).toBe(status.ID);
  expect(findHarnessAiWork(vault, project, 'status')).toBe(status);
  expect(await ensureHarnessAiWork(vault, project, 'status')).toBe(status);
});

it('同時に呼んでも AIWork は1つだけ作る', async () => {
  const project = await setupProject();
  const [a, b] = await Promise.all([ensureHarnessAiWork(vault, project, 'log'), ensureHarnessAiWork(vault, project, 'log')]);
  expect(a).toBe(b);
  expect(projectHarnessIds(project.Content, 'log')).toEqual([a.ID]);
});

it('Vault に無い ID が書かれていれば作り直して置き換える', async () => {
  const project = await setupProject();
  project.Content = `${project.Content}\n# decision\n[aiwork:2020-01-01-000000]`;
  const decision = await ensureHarnessAiWork(vault, project, 'decision');
  expect(projectHarnessIds(project.Content, 'decision')).toEqual([decision.ID]);
});

it('複数の項目には名前付きの AIWork を加え、1件の項目には加えられない', async () => {
  const project = await setupProject();
  const report = await addHarnessAiWork(vault, project, 'styles', '朝の報告');
  const minutes = await addHarnessAiWork(vault, project, 'styles', '議事録');
  expect(report.Name).toBe('朝の秘書業務｜styles｜朝の報告');
  expect(projectHarnessIds(project.Content, 'styles')).toEqual([report.ID, minutes.ID]);
  await expect(addHarnessAiWork(vault, project, 'status', 'x')).rejects.toThrow('1件だけ');
});

it('projectファイルの保存に失敗したら本文を戻す', async () => {
  const project = await setupProject();
  const before = project.Content;
  storage.save.mockImplementationOnce(async () => ({ updatedAt: 'x' })).mockRejectedValueOnce(new Error('保存失敗'));
  await expect(ensureHarnessAiWork(vault, project, 'board')).rejects.toThrow('保存失敗');
  expect(project.Content).toBe(before);
});
