// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
const start = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../services/harness/harnessLoop', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/harness/harnessLoop')>();
  original.HarnessLoop.start = start as unknown as typeof original.HarnessLoop.start;
  return original;
});
const decide = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../../services/harness/harnessCorrections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/harness/harnessCorrections')>()),
  decideCorrection: decide,
}));
import { AiChatPanel } from './AiChatPanel';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import { TTApplication } from '../../views/TTApplication';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { StorageManager } from '../../services/storage/StorageManager';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
const PROJECT = '2026-11-22-000001';
const CHAT = '2026-11-22-000002';
const STATUS = '2026-11-22-000003';

function add(id: string, contentType: TTThink['ContentType'], content: string, metadata: Record<string, unknown> = {}) {
  const t = new TTThink(); t.ID = id; t.ContentType = contentType; t.Content = content; t.Metadata = metadata;
  t.markSaved(); t.markMetadataSaved(); vault.AddItem(t);
  return t;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(StorageManager.instance, 'save').mockResolvedValue(undefined as never);
  start.mockClear();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  const app = TTApplication.Instance;
  TTUIStateManager.instance.init(app);
  vault = app.Models.Vault;
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  TTApplication.resetInstance(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function show() {
  await act(async () => root.render(<AiChatPanel panelKey="seeds" />));
}

it('開き直したprojectの直近の計測を秒で表示し、JSON保存を選べる', async () => {
  const key = 'thinktank.harnessTiming.v1.' + PROJECT;
  localStorage.setItem(key, JSON.stringify({ version: 1, startedAt: '2026-11-26T00:00:00Z', totalMs: 1250,
    outcome: 'waiting', stages: [{ turn: 1, stage: 'context', ms: 1250 }], calls: [] }));
  try {
    add(PROJECT, 'project', '秘書業務\n=\n# 状態\n待機\n# 規約\n今日の予定をまとめる');
    TTApplication.Instance.SeedsPanel.OpenProject(PROJECT);
    await show();
    expect(host.textContent).toContain('直近の実行時間（1.3秒）');
    expect(host.textContent).toContain('文脈の組み立て　1.250秒');
    expect(host.textContent).toContain('計測結果をJSONで保存');
  } finally { localStorage.removeItem(key); }
});

it('ハーネスを使っていない project では、# 規約 を書く案内だけを出す', async () => {
  add(PROJECT, 'project', '計画\n=\n# 状態\n未着手');
  TTApplication.Instance.SeedsPanel.OpenProject(PROJECT);
  await show();
  expect(host.textContent).toContain('「# 規約」');
  expect(host.querySelector('textarea')).toBeNull();
});

it('chat の会話と status を表示し、発言を送るとループを始める', async () => {
  add(STATUS, 'aiview', '朝の秘書業務｜status\n- 次の行動: 主催者に確認');
  add(CHAT, 'chat', 'TASK:Seeds｜朝の秘書業務\n## 始めて\n(claude) 2026-11-22 10:30\n会議の時刻が食い違っています。',
    { harnessChat: { projectId: PROJECT } });
  add(PROJECT, 'project', `朝の秘書業務\n=\n# 状態\n待機\n# 規約\n報告は冒頭に結論\n# status\n[aiwork:${STATUS}]\n# AI議論\n[chat:${CHAT}]`);
  TTApplication.Instance.SeedsPanel.OpenProject(PROJECT);
  await show();

  expect(host.querySelector('.ai-chat__state')?.textContent).toBe('［待機］');
  expect(host.querySelector('.ai-chat__status-body')?.textContent).toContain('主催者に確認');
  expect([...host.querySelectorAll('.ai-chat__message--user')].map(e => e.textContent)).toEqual(['始めて']);
  expect(host.querySelector('.ai-chat__message--assistant')?.textContent).toContain('会議の時刻が食い違っています。');

  const textarea = host.querySelector('textarea')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(textarea, '主催者に確認してください');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { host.querySelector<HTMLButtonElement>('.ai-chat__send')!.click(); });
  expect(start).toHaveBeenCalledWith(vault, PROJECT, {
    userMessage: '主催者に確認してください', trigger: 'chat', cliName: 'claude', panelRole: 'Seeds',
  });
});

it('未承認の訂正の提案を出し、承認・見送りを決められる', async () => {
  const correction = {
    id: 'r1-1', kind: 'PROFILE', text: '判断が要るものを先に知らせる', userQuote: '今後は判断が要るものを先に', reason: '本人の希望',
    projectId: PROJECT, runId: 'r1', createdAt: '2026-11-22T01:00:00Z', status: 'pending',
  };
  const chat = add(CHAT, 'chat', 'TASK:Seeds｜朝の秘書業務', { harnessChat: { projectId: PROJECT }, harnessCorrections: [correction, { ...correction, id: 'r1-2', status: 'approved' }] });
  const project = add(PROJECT, 'project', `朝の秘書業務\n=\n# 状態\n待機\n# 規約\n報告は冒頭に結論\n# AI議論\n[chat:${CHAT}]`);
  TTApplication.Instance.SeedsPanel.OpenProject(PROJECT);
  await show();

  const rows = host.querySelectorAll('.ai-chat__correction');
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain('共通の好み（PROFILE）');
  expect(rows[0].textContent).toContain('本人の発言:「今後は判断が要るものを先に」');
  await act(async () => { rows[0].querySelector('button')!.click(); });
  expect(decide).toHaveBeenCalledWith(vault, project, chat, 'r1-1', 'approve');
});

it('保存済みの会話からAIWork参照をクリックすると、一覧にまだないファイルもWorkingに開く', async () => {
  const id = '2026-11-26-231508';
  const tag = `[aiwork:${id}]`;
  const body = `採用先 ${tag}\n旧形式 [aiview:${STATUS}]　[aiwork:不正なID]`;
  const stored = add(CHAT, 'chat', `TASK:Seeds｜週次の改善\n## 採用します\n${body}`, { harnessChat: { projectId: PROJECT } });
  add(STATUS, 'aiview', `現在地\n参照 ${tag}`);
  add(PROJECT, 'project', `週次の改善\n=\n# 規約\n改善を提案\n# status\n[aiwork:${STATUS}]\n# AI議論\n[chat:${CHAT}]`);
  const fetch = vi.spyOn(StorageManager.instance, 'getRecord').mockResolvedValue({
    meta: { thinkid: id, category: 'aiview', title: '業務の作法', keywords: '', relatedIds: '', sizeBytes: 9,
      isDeleted: false, createdAt: '', updatedAt: '2026-11-26T14:15:08Z' }, body: '採用した手順',
  });
  const app = TTApplication.Instance;
  app.SeedsPanel.OpenProject(PROJECT);
  await show();
  const message = host.querySelector('.ai-chat__message--assistant')!;
  const buttons = message.querySelectorAll('button');
  expect(message.textContent).toBe(body);
  expect([...buttons].map(btn => btn.textContent)).toEqual([tag, `[aiview:${STATUS}]`]);
  expect(host.querySelector('.ai-chat__status-body button')?.textContent).toBe(tag);
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => { buttons[0].click(); });
  expect(fetch).toHaveBeenCalledWith(id);
  expect(app.WorkingPanel.Areas.find(a => a.ID === app.WorkingPanel.FocusedAreaId)).toMatchObject({ ResourceID: id, MediaType: 'texteditor' });
  expect(vault.GetThink(id)?.Content).toBe('業務の作法\n採用した手順');
  expect(vault.GetThink(id)?.IsDirty).toBe(false);
  expect(stored.Content).toContain(body);
  await act(async () => { buttons[1].click(); });
  expect(app.WorkingPanel.Areas.find(a => a.ID === app.WorkingPanel.FocusedAreaId)?.ResourceID).toBe(STATUS);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('見つからないAIWorkのIDはエラーとして表示し、空のPaneを開かない', async () => {
  const id = '2026-11-26-231508-memo';
  add(CHAT, 'chat', `TASK:Seeds｜確認\n## 結果\n[aiwork:${id}]`, { harnessChat: { projectId: PROJECT } });
  add(PROJECT, 'project', `確認\n=\n# 規約\n確認する\n# AI議論\n[chat:${CHAT}]`);
  const getRecord = vi.spyOn(StorageManager.instance, 'getRecord').mockResolvedValue(null);
  const app = TTApplication.Instance;
  app.SeedsPanel.OpenProject(PROJECT);
  await show();
  await act(async () => { host.querySelector<HTMLButtonElement>('.ai-chat__message button')!.click(); });
  expect(getRecord).toHaveBeenCalledWith(id);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(id);
  expect(app.WorkingPanel.Areas.some(a => a.ResourceID === id)).toBe(false);
});
