// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import type { ConversationTurn } from '../../services/ConversationService';
import { SubtaskProposal } from './SubtaskProposal';
import { SubtaskList } from './SubtaskList';
const history = vi.hoisted(() => vi.fn());
vi.mock('../../services/ConversationService', () => ({ ConversationClient: class { history = history; } }));
const turn = { id: 'turn', context: { scope: 'bundle-only', vaultId: 'vault', bundleId: 'parent' },
  answer: { proposals: [{ field: 'nextAction', after: '会場を予約する' }] } } as ConversationTurn;
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); root = createRoot(host);
  vault = new TTVault('vault'); const parent = new TTThink(); parent.ID = 'parent'; parent.ContentType = 'bundle'; parent.Name = '誕生日会'; vault.AddThink(parent);
  history.mockResolvedValue([turn]);
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function click(text: string) { await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === text)!.click(); }); }
it('creates only after confirmation and rejects an outdated proposal', async () => {
  const create = vi.spyOn(vault, 'CreateSubtaskFromConversation').mockResolvedValue(new TTThink());
  await act(async () => root.render(<SubtaskProposal vault={vault} turn={turn} chatId="chat" disabled={false} />));
  await click('次の行動をサブ課題にする'); expect(create).not.toHaveBeenCalled();
  history.mockResolvedValueOnce([]);
  await click('このサブ課題を追加'); expect(create).not.toHaveBeenCalled(); expect(host.textContent).toContain('最新の提案');
  await click('このサブ課題を追加'); expect(create).toHaveBeenCalledWith(turn, 'chat', '会場を予約する');
  expect(host.textContent).toContain('サブ課題を追加しました');
});
it('lists only children of the selected parent and exposes the return to the parent', async () => {
  const child = new TTThink(); child.ID = 'child'; child.ContentType = 'bundle'; child.Name = '会場予約';
  child.Metadata = { taskRelation: { schemaVersion: 1, parentId: 'parent', chatId: 'chat', turnId: 'turn', panel: 'Workout' } };
  vault.AddThink(child);
  await act(async () => root.render(<SubtaskList vault={vault} bundleId="parent" />));
  expect(host.textContent).toContain('会場予約');
  await act(async () => root.render(<SubtaskList vault={vault} bundleId="child" />));
  expect(host.textContent).toContain('親課題へ戻る');
  await act(async () => root.render(<SubtaskList vault={vault} bundleId="other" />));
  expect(host.textContent).toBe('');
});
