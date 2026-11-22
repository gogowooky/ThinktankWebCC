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
  expect(start).toHaveBeenCalledWith(vault, PROJECT, { userMessage: '主催者に確認してください', trigger: 'chat' });
});
