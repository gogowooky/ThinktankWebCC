// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import { emptyProgress } from '../../../server/services/progressRecord';
import type { ConversationTurn } from '../../services/ConversationService';
import { ProgressProposal } from './ProgressProposal';
const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('../../services/ProgressService', () => ({ ProgressService: class { read = api.read; save = api.save; } }));
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, vault: TTVault;
const turn = { id: 'turn', createdAt: '2026-09-22T00:00:00Z', context: { scope: 'bundle-only', bundleId: 'bundle', vaultId: 'vault' }, answer: {
  progressProposals: [{ milestone: 'execution', reach: 'achieved', userQuote: '予約しました', reason: '本人の報告' }],
} } as ConversationTurn;
const previous = { ...emptyProgress(), evidence: '前回の根拠', remaining: '結果を検証する', paused: true, resumeCondition: '当日になったら' };
const state = { bundleId: 'bundle', version: 'v1', log: { schemaVersion: 1, events: [{ id: 'old', input: previous }] }, review: { goal: '会を開く', completionCriteria: '全員参加', notes: [] } };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  const bundle = new TTThink(); bundle.ID = 'bundle'; bundle.ContentType = 'bundle'; vault.AddThink(bundle);
  api.read.mockResolvedValue(structuredClone(state)); api.save.mockResolvedValue({ ...state, log: { schemaVersion: 1, events: [] } });
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function render(disabled = false, selected = turn) { await act(async () => root.render(<ProgressProposal vault={vault} turn={selected} disabled={disabled} />)); }
async function click(label: string) { await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === label)!.click(); }); }
it('loads the current record, then requires confirmation and only changes the proposed milestone', async () => {
  await render(); expect(api.read).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
  await click('到達状態の候補を確認'); expect(api.save).not.toHaveBeenCalled();
  expect(host.textContent).toContain('実行：未記録 → 到達');
  await click('本人の判断として確認して記録');
  expect(api.save).toHaveBeenCalledWith('bundle', 'v1', 'turn', expect.objectContaining({ milestones: { ...previous.milestones, execution: 'achieved' }, paused: true, resumeCondition: '当日になったら', remaining: '結果を検証する', sources: [] }));
  expect(vault.GetThink('bundle')!.Metadata.thinkProgress).toBeDefined();
});
it('preserves the review after a failure and retries with the same operation id and input', async () => {
  api.save.mockRejectedValueOnce(new Error('保存競合です。'));
  await render(); await click('到達状態の候補を確認'); await click('本人の判断として確認して記録');
  expect(host.textContent).toContain('保存競合'); expect(host.querySelector('textarea')?.value).toContain('予約しました');
  await click('本人の判断として確認して記録');
  expect(api.save.mock.calls[1]).toEqual(api.save.mock.calls[0]);
});
it('detects a previously saved operation after remount or an uncertain save result', async () => {
  api.read.mockResolvedValue({ ...state, log: { schemaVersion: 1, events: [{ id: 'turn', input: previous }] } });
  await render(); await click('到達状態の候補を確認');
  expect(host.textContent).toContain('記録済み'); expect(api.save).not.toHaveBeenCalled();
});
it('requires remaining work to be stated and does not infer that none remains', async () => {
  api.read.mockResolvedValue({ ...state, log: { schemaVersion: 1, events: [] } });
  await render(); await click('到達状態の候補を確認'); await click('本人の判断として確認して記録');
  expect(api.save).not.toHaveBeenCalled();
  expect(host.querySelectorAll('textarea')[1].value).toBe('');
});
it('compares again with the latest version after a conflict before explicitly saving', async () => {
  api.save.mockRejectedValueOnce(new Error('保存競合です。'));
  await render(); await click('到達状態の候補を確認'); await click('本人の判断として確認して記録');
  api.read.mockResolvedValue({ ...state, version: 'v2', log: { schemaVersion: 1, events: [{ id: 'new', input: { ...previous, milestones: { ...previous.milestones, decision: 'achieved' } } }] } });
  await click('到達状態の候補を確認'); expect(api.save).toHaveBeenCalledTimes(1);
  await click('本人の判断として確認して記録');
  expect(api.save.mock.calls[1][1]).toBe('v2');
  expect(api.save.mock.calls[1][3].milestones).toEqual({ ...previous.milestones, decision: 'achieved', execution: 'achieved' });
});
it('does not act while disabled and hides proposals from a different vault or chat-only scope', async () => {
  await render(true); await click('到達状態の候補を確認'); expect(api.read).not.toHaveBeenCalled();
  await render(false, { ...turn, context: { ...turn.context, vaultId: 'other' } }); expect(host.textContent).toBe('');
  await render(false, { ...turn, context: { ...turn.context, scope: 'chat-only' } }); expect(host.textContent).toBe('');
});
