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
import { firstHarnessId, parseProject, readProjectStatus } from '../../utils/thinkFormat';
import { readHarnessDirective, runHarnessTurn, type HarnessAiResponse } from './harnessRun';
import { HarnessLoop } from './harnessLoop';
import { startHarnessWatcher } from './harnessWatcher';
import { buildHarnessMessage, collectHarnessContext } from './harnessContext';

let vault: TTVault;
beforeEach(() => { vi.clearAllMocks(); vault = new TTVault('vault'); HarnessLoop.reset(); });

const NOW = () => new Date(2026, 10, 22, 10, 30, 0);

async function setupProject(extra = '') {
  const memo = await vault.CreateBlankThink('memo', '会議メモ');
  memo.Content = '会議メモ\n15時に変更'; await memo.SaveContent();
  const project = await vault.CreateProjectFromIds([memo.ID]);
  project.Content = project.Content
    .replace(/^[^\n]*/, '朝の秘書業務')
    .replace('# 条件', `# 規約\n決まったことは冒頭に書く\n完了条件: 朝の報告を出す${extra}\n# 条件\nclaude`);
  await project.SaveContent();
  return project;
}

// 文脈の log にも過去の「実行 ID」が載るため、書き方の指示（コードブロック）にある今回の ID を読む
const runIdOf = (payload: Record<string, unknown>) => /```\n# \[[^\]]+\] 実行 ([0-9a-f]{8})/.exec(String(payload.userMessage))![1];

/** AI CLI が MCP で書き込み、画面へ反映された状態を再現する */
function aiWrites(project: TTThink, opts: { log?: boolean; status?: boolean; state?: string; question?: string } = {}) {
  return vi.fn(async (payload: Record<string, unknown>): Promise<HarnessAiResponse> => {
    const runId = runIdOf(payload);
    const log = vault.GetThink(firstHarnessId(project.Content, 'log')!)!;
    const status = vault.GetThink(firstHarnessId(project.Content, 'status')!)!;
    if (opts.log !== false) log.setContentSilent(`${log.TitleLine}\n# [2026-11-22 10:30] 実行 ${runId}\n(claude)\n時刻の食い違いを要確認とした\n\n${log.Body}`.trimEnd());
    if (opts.status !== false) status.setContentSilent(`${status.TitleLine}\n- 次の行動: 主催者に確認`);
    const harness = { state: opts.state ?? 'waiting', ...(opts.question ? { question: opts.question } : {}) };
    return {
      reply: '会議の時刻が食い違っています。',
      modelLabel: 'claude-opus',
      rawText: JSON.stringify({ reply: '会議の時刻が食い違っています。', harness }),
      harnessRecord: { createdThinkIds: [], updatedThinkIds: [log.ID, status.ID] },
    };
  });
}

it('harness.state を読む（無い・不正なら null）', () => {
  expect(readHarnessDirective('```json\n{"reply":"x","harness":{"state":"done","question":"完了でよいですか"}}\n```'))
    .toEqual({ state: 'done', question: '完了でよいですか' });
  expect(readHarnessDirective('{"reply":"x"}')).toBeNull();
  expect(readHarnessDirective('{"harness":{"state":"finish"}}')).toBeNull();
  expect(readHarnessDirective(undefined)).toBeNull();
});

it('1回の実行: AIWork と chat を用意し、書き込みを3つの AIWork に限って依頼し、会話と関連情報を残す', async () => {
  const project = await setupProject();
  const requestReply = aiWrites(project, { question: '主催者に確認してよいですか' });
  const result = await runHarnessTurn({ vault, projectId: project.ID, userMessage: '始めて', requestReply, now: NOW, aiWriteWaitMs: 0 });

  const ids = ['log', 'status', 'decision'].map(f => firstHarnessId(project.Content, f as 'log'));
  expect(ids.every(Boolean)).toBe(true);
  const payload = (requestReply.mock.calls[0] as unknown as [Record<string, unknown>])[0];
  expect(payload.harness).toEqual({ writableIds: ids });
  expect(payload.projectId).toBe(project.ID);
  const message = String(payload.userMessage);
  expect(message).toContain('決まったことは冒頭に書く');
  expect(message).toContain('利用者の発言: 始めて');
  expect(message).toContain('会議メモ');

  expect(result).toMatchObject({ recordComplete: true, logWrittenBy: 'ai', directive: { state: 'waiting' }, model: 'claude-opus' });
  const log = vault.GetThink(ids[0]!)!;
  expect(log.Content).toContain(`- 関連chat: [chat:${result.chatId}]`);
  expect(log.Content).toContain(`- 変更したThink: [aiwork:${ids[1]}]`);

  const chat = vault.GetThink(result.chatId)!;
  expect(parseProject(project.Content).aiDiscussionIds).toEqual([chat.ID]);
  expect(chat.Metadata.taskContext).toEqual({ schemaVersion: 1, bundleId: project.ID });
  expect(chat.Content).toContain('## 始めて');
  expect(chat.Content).toContain('会議の時刻が食い違っています。');
  expect(chat.Content).toContain('**確認**: 主催者に確認してよいですか');
});

it('log が書かれなければ一度だけ追加で依頼し、それでも無ければアプリが残して「記録が不完全」とする', async () => {
  const project = await setupProject();
  const requestReply = aiWrites(project, { log: false });
  const result = await runHarnessTurn({ vault, projectId: project.ID, requestReply, now: NOW, aiWriteWaitMs: 0 });

  expect(requestReply).toHaveBeenCalledTimes(2);
  expect(String((requestReply.mock.calls[1] as unknown as [Record<string, unknown>])[0].userMessage)).toContain('作業記録が足りないため');
  expect(result).toMatchObject({ recordComplete: false, logWrittenBy: 'app' });
  const log = vault.GetThink(firstHarnessId(project.Content, 'log')!)!;
  expect(log.Content).toContain(`実行 ${result.runId}`);
  expect(log.Content).toContain('アプリが回答を残しました');
  expect(vault.GetThink(result.chatId)!.Content).toContain('記録が不完全です: log');
});

it('次の実行では前回の status・決定・会話を文脈に入れる（別のchat・別のCLIからでも再開できる）', async () => {
  const project = await setupProject();
  await runHarnessTurn({ vault, projectId: project.ID, userMessage: '始めて', requestReply: aiWrites(project), now: NOW, aiWriteWaitMs: 0 });
  const decision = vault.GetThink(firstHarnessId(project.Content, 'decision')!)!;
  decision.setContentSilent(`${decision.TitleLine}\n- 会議は15時で確定（理由: 主催者の返信。根拠: 利用者「15時で確定」）`);
  const next = aiWrites(project);
  await runHarnessTurn({ vault, projectId: project.ID, userMessage: 'なぜ15時？', requestReply: next, now: NOW, aiWriteWaitMs: 0 });
  const message = String((next.mock.calls[0] as unknown as [Record<string, unknown>])[0].userMessage);
  expect(message).toContain('次の行動: 主催者に確認');
  expect(message).toContain('会議は15時で確定');
  expect(message).toContain('時刻の食い違いを要確認とした');
  expect(message).toContain('[利用者] 始めて');
});

it('規約は root から子へ連結し、PROFILE は祖先のものを使う', async () => {
  const root = await vault.CreateProjectFromIds([]);
  const profile = await vault.CreateAiViewThink('Thinktank｜PROFILE');
  profile.Content = 'Thinktank｜PROFILE\n- 判断が要るものを先に知らせる'; await profile.SaveContent();
  root.Content = root.Content.replace(/^[^\n]*/, 'Thinktank').replace('# 条件', `# 規約\n共通の働き方\n# PROFILE\n[aiwork:${profile.ID}]\n# 条件`);
  await root.SaveContent();
  const project = await setupProject();
  const [log, status, decision] = await Promise.all(['L', 'S', 'D'].map(t => vault.CreateAiViewThink(t)));
  const ctx = await collectHarnessContext({ vault, project, log, status, decision, chatHistory: '' });
  expect(ctx.rules.map(r => r.projectTitle)).toEqual(['Thinktank', '朝の秘書業務']);
  expect(ctx.profile?.body).toContain('判断が要るもの');
  const message = buildHarnessMessage(ctx, { runId: 'abcd1234', dateTime: '2026-11-22 10:30' });
  expect(message.indexOf('共通の働き方')).toBeLessThan(message.indexOf('決まったことは冒頭に書く'));
});

it('ループ: waiting で「待機」にして止まる。chat の発言は未着手から「進行中」にして始める', async () => {
  const project = await setupProject();
  expect(readProjectStatus(project.Content).state).toBe('未着手');
  const states: string[] = [];
  const requestReply = vi.fn(async (payload: Record<string, unknown>) => {
    states.push(readProjectStatus(project.Content).state);
    return aiWrites(project, { state: 'waiting' })(payload);
  });
  await HarnessLoop.start(vault, project.ID, { userMessage: '始めて', trigger: 'chat', requestReply, aiWriteWaitMs: 0 });
  expect(states).toEqual(['進行中']);
  expect(readProjectStatus(project.Content).state).toBe('待機');
  expect(project.Metadata.harnessLock).toBeUndefined();
  expect(HarnessLoop.getStatus(project.ID)?.outcome?.type).toBe('waiting');
});

it('ループ: continue が続くと上限で止めて「待機」にし、chat に知らせる', async () => {
  const project = await setupProject();
  const requestReply = aiWrites(project, { state: 'continue' });
  await HarnessLoop.start(vault, project.ID, { trigger: 'chat', userMessage: '始めて', requestReply, maxTurns: 2, aiWriteWaitMs: 0 });
  expect(requestReply).toHaveBeenCalledTimes(2);
  expect(readProjectStatus(project.Content).state).toBe('待機');
  expect(HarnessLoop.getStatus(project.ID)?.outcome?.type).toBe('limit');
  const chatId = parseProject(project.Content).aiDiscussionIds[0];
  expect(vault.GetThink(chatId)!.Content).toContain('上限（2回）');
});

it('ループ: エラーは chat に書いて「待機」にする', async () => {
  const project = await setupProject();
  const requestReply = vi.fn(async () => { throw new Error('AI CLI が見つかりません'); });
  await HarnessLoop.start(vault, project.ID, { trigger: 'chat', userMessage: '始めて', requestReply, aiWriteWaitMs: 0 });
  expect(readProjectStatus(project.Content).state).toBe('待機');
  expect(HarnessLoop.getStatus(project.ID)?.outcome).toMatchObject({ type: 'error' });
  const chatId = parseProject(project.Content).aiDiscussionIds[0];
  expect(vault.GetThink(chatId)!.Content).toContain('エラーのため止めました: AI CLI が見つかりません');
});

it('監視: ハーネスの project が保存された内容で「進行中」に変わったときだけ始める', async () => {
  vi.useFakeTimers();
  try {
    const project = await setupProject();
    const plain = await vault.CreateProjectFromIds([]);
    const start = vi.fn();
    const stop = startHarnessWatcher(vault, { start, doctor: vi.fn(), review: vi.fn(), debounceMs: 0 });

    project.Content = project.Content.replace('# 状態\n未着手', '# 状態\n進行中');
    vault.NotifyUpdated(false);
    await vi.runAllTimersAsync();
    expect(start).not.toHaveBeenCalled();

    await project.SaveContent();
    vault.NotifyUpdated(false);
    await vi.runAllTimersAsync();
    expect(start).toHaveBeenCalledWith(project.ID);

    plain.Content = plain.Content.replace('# 状態\n未着手', '# 状態\n進行中');
    await plain.SaveContent();
    vault.NotifyUpdated(false);
    await vi.runAllTimersAsync();
    expect(start).toHaveBeenCalledTimes(1);
    stop();
  } finally {
    vi.useRealTimers();
  }
});
