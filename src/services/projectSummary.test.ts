// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => {
  let n = 0;
  return {
    save: vi.fn(async () => ({ updatedAt: `2026-10-31T00:00:${String(++n).padStart(2, '0')}Z` })),
    updateMetadata: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ updatedAt: '2026-10-31T01:00:00Z', metadata: patch })),
    delete: vi.fn(async () => undefined),
    getRecord: vi.fn(async () => null),
    listSnapshots: vi.fn(async (_id: string) => [] as Array<{ thinkid: string; title: string; body: string; metadata: Record<string, unknown>; sourceUpdatedAt: string; snapshotAt: string }>),
  };
});
vi.mock('./storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from '../models/TTVault';
import { buildProjectSummaryMessage, generateProjectSummary, SUMMARY_KIND_OF_PANEL } from './projectSummary';
import { firstAiViewId, parseProject } from '../utils/thinkFormat';

let vault: TTVault;
beforeEach(() => { vi.clearAllMocks(); storage.listSnapshots.mockImplementation(async () => []); vault = new TTVault('vault'); });

const snapshot = (thinkid: string, title: string, body: string, snapshotAt: string) =>
  ({ thinkid, title, body, metadata: {}, sourceUpdatedAt: '', snapshotAt });
const messageOf = (fn: ReturnType<typeof vi.fn>) => String((fn.mock.calls[0] as unknown as [Record<string, unknown>])[0].userMessage);
const OCT31 = new Date(2026, 9, 31, 9, 0, 0);

async function setupProject() {
  const a = await vault.CreateBlankThink('memo', 'A');
  a.Content = 'A\n一行目\n二行目'; await a.SaveContent();
  const b = await vault.CreateBlankThink('memo', 'B');
  b.Content = 'B\n本文'; await b.SaveContent();
  const project = await vault.CreateProjectFromIds([a.ID, b.ID]);
  project.Content = project.Content
    .replace(/^[^\n]*/, '計画P')
    .replace('# 現状把握用プロンプト', '# 現状把握用プロンプト\n課題を3点挙げる')
    .replace('# 進捗把握用プロンプト', '# 進捗把握用プロンプト\n先週からの変化')
    .replace('# 条件', '# 条件\n社外秘');
  await project.SaveContent();
  return { a, b, project };
}

it('パネルごとに現状要約・進捗要約・実績要約を割り当てる', () => {
  expect(SUMMARY_KIND_OF_PANEL).toEqual({ thinktank: 'current', seeds: 'current', working: 'progress', harvest: 'result' });
});

it('現状要約: AIViewファイルを用意して # AIまとめ の先頭に載せ、AI CLI に MCP で書き込ませる', async () => {
  const { a, b, project } = await setupProject();
  const requestReply = vi.fn(async (payload: Record<string, unknown>) => {
    // AI CLI が thinktank_update_think で書き込み、画面へ反映された状態を再現する
    const id = firstAiViewId(project.Content)!;
    expect(String(payload.userMessage)).toContain(`thinkid="${id}"`);
    vault.GetThink(id)!.setContentSilent('計画P\n# [2026-10-31] 現状要約\n(gpt-5.6-sol)\n- 進んでいる');
    return { reply: '- 進んでいる', modelLabel: 'gpt-5.6-sol' };
  });
  const result = await generateProjectSummary({
    kind: 'current', panelKey: 'thinktank', vault, projectId: project.ID, requestReply, now: OCT31, aiWriteWaitMs: 0,
  });

  expect(result.writtenBy).toBe('ai');
  expect(result.aiView.ContentType).toBe('aiview');
  expect(result.aiView.Content).toBe('計画P\n# [2026-10-31] 現状要約\n(gpt-5.6-sol)\n- 進んでいる');
  expect(firstAiViewId(project.Content)).toBe(result.aiView.ID);

  const payload = (requestReply.mock.calls[0] as unknown as [Record<string, unknown>])[0];
  expect(payload).toMatchObject({ panelRole: 'Thinktank', bundleId: project.ID, bundleTitle: '計画P' });
  const message = String(payload.userMessage);
  expect(message).toContain('thinktank_update_think');
  expect(message).toContain('title="計画P"');
  // 2行目のモデル名は AI CLI を起動する側が {{AI_MODEL}} を置き換えて渡す
  expect(message).toContain('```\n# [2026-10-31] 現状要約\n({{AI_MODEL}})\n');
  expect(message).toContain('課題を3点挙げる');
  expect(message).toContain('社外秘');
  expect(message).not.toContain('先週からの変化');
  expect(message).toContain(`[memo:${a.ID}] A\nA\n一行目\n二行目`);
  expect(message).toContain(`[memo:${b.ID}] B`);
});

it('AI CLI が書き込まなかったときは、回答をアプリが「# [日付] ○○要約」で先頭に追記する', async () => {
  const { project } = await setupProject();
  const first = await generateProjectSummary({
    kind: 'current', panelKey: 'seeds', vault, projectId: project.ID,
    requestReply: async () => ({ reply: '# 初回\n本文' }), now: new Date(2026, 9, 30), aiWriteWaitMs: 0,
  });
  expect(first.writtenBy).toBe('app');
  project.Content = project.Content.replace(/^[^\n]*/, '計画P2');
  await project.SaveContent();
  const second = await generateProjectSummary({
    kind: 'result', panelKey: 'harvest', vault, projectId: project.ID,
    requestReply: async () => ({ reply: '実績です', modelLabel: 'gpt-5.6-sol' }), now: OCT31, aiWriteWaitMs: 0,
  });
  expect(second.aiView).toBe(first.aiView);
  expect(second.aiView.Content).toBe('計画P2\n# [2026-10-31] 実績要約\n(gpt-5.6-sol)\n実績です\n\n# [2026-10-30] 現状要約\n## 初回\n本文\n');
  expect(parseProject(project.Content).aiSummaryIds).toEqual([first.aiView.ID]);
});

it('Web版では AI CLI の書き込みを正本から読み直して確かめる', async () => {
  const { project } = await setupProject();
  let aiViewId = '';
  storage.getRecord.mockImplementation((async (id: string) => id === aiViewId
    ? { meta: { title: '計画P', updatedAt: '2099-01-01T00:00:00Z', isDeleted: false }, body: '# [2026-10-31] 現状要約\nAIが書いた' }
    : null) as never);
  const result = await generateProjectSummary({
    kind: 'current', panelKey: 'thinktank', vault, projectId: project.ID, now: OCT31, aiWriteWaitMs: 0,
    requestReply: async () => { aiViewId = firstAiViewId(project.Content)!; return { reply: 'AIが書いた' }; },
  });
  expect(result.writtenBy).toBe('ai');
  expect(result.aiView.Content).toBe('計画P\n# [2026-10-31] 現状要約\nAIが書いた');
});

it('進捗要約は最新の snapshot、実績要約は最古の snapshot との差分を渡す', async () => {
  const { a, b, project } = await setupProject();
  storage.listSnapshots.mockImplementation(async (id: string) => id === a.ID
    ? [snapshot(a.ID, 'A', '一行目', '2026-10-01T00:00:00Z'), snapshot(a.ID, 'A', '一行目\n二行目', '2026-10-20T00:00:00Z')]
    : []);

  const progress = vi.fn(async () => ({ reply: '進捗' }));
  await generateProjectSummary({ kind: 'progress', panelKey: 'working', vault, projectId: project.ID, requestReply: progress, aiWriteWaitMs: 0 });
  const progressMessage = messageOf(progress);
  expect(progressMessage).toContain('先週からの変化');
  expect(progressMessage).toContain('### 変更なし（1件）');
  expect(progressMessage).toContain(`A（${a.ID}）`);
  expect(progressMessage).toContain(`[memo:${b.ID}] B\n（スナップショットが無いため比較できません。現在の内容）`);

  const result = vi.fn(async () => ({ reply: '実績' }));
  await generateProjectSummary({ kind: 'result', panelKey: 'harvest', vault, projectId: project.ID, requestReply: result, aiWriteWaitMs: 0 });
  expect(messageOf(result)).toContain('スナップショット: 2026-10-01T00:00:00Z\n```diff\n+ 二行目\n```');
});

it('# 対象 が「*」のときは、名指しされていないファイルを1か月以内に更新されたものに限る', async () => {
  const named = await vault.CreateBlankThink('memo', '名指し');
  const recent = await vault.CreateBlankThink('memo', '最近');
  const old = await vault.CreateBlankThink('memo', '古い');
  const project = await vault.CreateProject('全体');
  project.Content = `全体\n=\n# 対象\n*\n[memo:${named.ID}]: 名指し\n# AIまとめ`;
  await project.SaveContent();
  named.UpdatedAt = '2026-01-01T00:00:00Z';
  recent.UpdatedAt = '2026-10-15T00:00:00Z';
  old.UpdatedAt = '2026-09-29T00:00:00Z';

  const requestReply = vi.fn(async () => ({ reply: '要約' }));
  await generateProjectSummary({ kind: 'current', panelKey: 'thinktank', vault, projectId: project.ID, requestReply, now: OCT31, aiWriteWaitMs: 0 });
  const message = messageOf(requestReply);
  expect(message).toContain('（# 対象 が「*」のため、1か月以内に更新されたファイルに限っています）');
  expect(message).toContain(`[memo:${named.ID}] 名指し`);
  expect(message).toContain(`[memo:${recent.ID}] 最近`);
  expect(message).not.toContain(`[memo:${old.ID}]`);
  // 書き込み先の AIViewファイル自身は対象にしない
  expect(message).toContain('## 対象ファイル（2件）');
});

it('# AIまとめ の先頭のタグが読み取れなければ、新しい AIViewファイルを作ってその前に載せる', async () => {
  const { project } = await setupProject();
  project.Content = project.Content.replace('# AIまとめ', '# AIまとめ\n[aiview:2020-01-01-000000],[aiview:2020-01-01-000001]');
  await project.SaveContent();
  const { aiView } = await generateProjectSummary({
    kind: 'current', panelKey: 'thinktank', vault, projectId: project.ID, requestReply: async () => ({ reply: '要約' }), aiWriteWaitMs: 0,
  });
  expect(project.Content).toContain(`# AIまとめ\n[aiview:${aiView.ID}],[aiview:2020-01-01-000000],[aiview:2020-01-01-000001]`);
});

it('AI の失敗時は AIViewファイルを変えない', async () => {
  const { project } = await setupProject();
  const prepared = await generateProjectSummary({
    kind: 'current', panelKey: 'thinktank', vault, projectId: project.ID, requestReply: async () => ({ reply: '初回' }), now: OCT31, aiWriteWaitMs: 0,
  });
  const before = prepared.aiView.Content;
  const projectBefore = project.Content;
  await expect(generateProjectSummary({
    kind: 'current', panelKey: 'thinktank', vault, projectId: project.ID, aiWriteWaitMs: 0,
    requestReply: async () => { throw new Error('AI CLI が見つかりません'); },
  })).rejects.toThrow('AI CLI が見つかりません');
  expect(prepared.aiView.Content).toBe(before);
  expect(project.Content).toBe(projectBefore);
});

it('projectファイル以外では要約しない', async () => {
  const memo = await vault.CreateBlankThink('memo', 'M');
  await expect(generateProjectSummary({
    kind: 'current', panelKey: 'thinktank', vault, projectId: memo.ID, requestReply: async () => ({ reply: 'x' }), aiWriteWaitMs: 0,
  })).rejects.toThrow('projectファイルがロードされていません');
});

it('依頼文: 全体で 200,000 字を超える分は省略したと書く', () => {
  const big = 'x'.repeat(5_900);
  const targets = Array.from({ length: 40 }, (_, i) => ({
    id: `2026-10-31-0000${String(i).padStart(2, '0')}`, title: `T${i}`, contentType: 'memo', content: big,
  }));
  const message = buildProjectSummaryMessage('current', 'P\n=\n# 対象\n*', targets, { aiViewId: '2026-10-31-990000', title: 'P', date: '2026-10-31' });
  expect(message).toMatch(/（文字数の上限のため \d+ 件は省略しました）/);
  expect(message.length).toBeLessThan(210_000);
});
