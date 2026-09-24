// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { captureSubtaskContext } from './subtaskContext';
import { ContextService } from './ContextService';
import { conversationContext } from './ConversationService';
import { ConversationService } from '../../server/services/ConversationService';
import { emptyProgress } from '../../server/services/progressRecord';
import { validateContext, readConversationLog } from '../../server/services/conversationRecord';
import { SUBTASK_REVIEW_QUESTION, validateSubtaskContext } from '../../server/services/subtaskContext';
import { prepareProposalReview } from './proposalReview';
import type { ThinkMeta } from './storage/IStorageBackend';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
const event = { id: 'confirmed', revision: 1, author: 'human' as const, confirmedAt: '2026-09-24T00:00:00Z',
  input: { ...emptyProgress(), milestones: { ...emptyProgress().milestones, execution: 'achieved' as const }, evidence: '予約済みを確認', remaining: '参加者数の確認', paused: true, resumeCondition: '返事が届いたら' } };
function child(id: string, parentId = 'parent') {
  const think = new TTThink(); think.ID = id; think.ContentType = 'bundle'; think.Content = `# ${id}\n秘密の本文`;
  think.Metadata = { taskRelation: { schemaVersion: 1, parentId, chatId: 'chat', turnId: 'turn', panel: 'Workout' }, thinkProgress: { schemaVersion: 1, events: [structuredClone(event)] } };
  think.markSaved(); think.markMetadataSaved(); return think;
}
function setup() {
  const vault = new TTVault('vault'); vault.IsLoaded = true;
  const parent = child('parent', 'outside'); parent.Metadata = {}; parent.Content = '# 親課題'; parent.markSaved(); parent.markMetadataSaved();
  vault.AddThink(parent); return vault;
}
it('captures only direct children, detaches records and distinguishes unknown and unsaved states', () => {
  const vault = setup(); const a = child('a'), b = child('b'), c = child('c'), d = child('d');
  b.Metadata = { taskRelation: b.Metadata.taskRelation }; b.markMetadataSaved();
  c.Metadata.thinkProgress = { schemaVersion: 99 }; c.markMetadataSaved();
  d.Content += '変更';
  [a, b, c, d, child('grandchild', 'a'), child('unrelated', 'other')].forEach(t => vault.AddThink(t));
  const result = captureSubtaskContext(vault, 'parent');
  expect(result.items.map(i => [i.bundleId, i.status])).toEqual([['a', 'recorded'], ['b', 'unrecorded'], ['c', 'unreadable'], ['d', 'unsaved']]);
  expect(JSON.stringify(result)).not.toContain('秘密の本文');
  expect(result.items[3].event).toBeUndefined();
  a.Metadata.thinkProgress = undefined;
  expect(result.items[0].event?.input.remaining).toBe('参加者数の確認');
});
it('rejects over-limit child lists and context text instead of silently truncating', () => {
  const vault = setup(); for (let i = 0; i < 51; i++) vault.AddThink(child(`child-${i}`));
  expect(() => captureSubtaskContext(vault, 'parent')).toThrow('大きすぎる');
  const large = { scope: 'loaded-direct-children', items: Array.from({ length: 30 }, (_, i) => ({ bundleId: `id-${i}`, title: 'a'.repeat(2000), status: 'unrecorded' })) };
  expect(() => validateSubtaskContext(large, 'parent')).toThrow('大きすぎる');
});
it('connects the captured child status to the parent AI and reviewable next-action proposals without saving', async () => {
  const vault = setup(); vault.AddThink(child('child'));
  const original = JSON.stringify(vault.GetThinks().map(t => t.Metadata));
  const reader = { getBody: vi.fn(), search: vi.fn() };
  const snapshot = await new ContextService(vault, reader).getBundleContext('parent', { includeSubtasks: true });
  expect(Object.isFrozen(snapshot.subtasks!.items[0].event!.input)).toBe(true);
  expect(reader.getBody).not.toHaveBeenCalled(); expect(reader.search).not.toHaveBeenCalled();
  expect(snapshot.sources).toEqual([]);
  const context = conversationContext(snapshot);
  const generate = vi.fn().mockResolvedValue({ reply: 'childの本人確認済み記録では参加者数の確認が残っています。', insufficientEvidence: false, citations: [],
    proposals: [{ field: 'nextAction', after: '参加者の返事を確認する', reason: '子課題の残作業' }], progressProposals: [] });
  const turn = await new ConversationService({ name: 'test', model: 'test', generate }).answer('review', SUBTASK_REVIEW_QUESTION, context, [], new AbortController().signal);
  expect(generate.mock.calls[0][0].context.subtasks.items[0].event).toEqual(event);
  expect(turn.answer.progressProposals).toEqual([]);
  expect(readConversationLog({ schemaVersion: 1, turns: [turn] }).turns[0].context.subtasks).toEqual(context.subtasks);
  const reviewed = prepareProposalReview(turn, { id: 'parent', contentType: 'bundle', metadata: {} } as ThinkMeta);
  expect(reviewed.values.nextAction).toBe('参加者の返事を確認する');
  expect(JSON.stringify(vault.GetThinks().map(t => t.Metadata))).toBe(original);
});
it('keeps existing snapshots compatible and does not attach child state to other context consumers', async () => {
  const vault = setup(); vault.AddThink(child('child'));
  const snapshot = await new ContextService(vault).getBundleContext('parent');
  expect(conversationContext(snapshot).subtasks).toBeUndefined();
  const chat = { ...conversationContext(snapshot), scope: 'chat-only', snapshotId: 'parent', sources: [], manualState: null };
  expect(() => validateContext(chat)).not.toThrow();
  expect(() => validateContext({ ...chat, subtasks: captureSubtaskContext(vault, 'parent') })).toThrow('Chat単独');
});
it('includes the current task pause and resume memo without conflating child status, and preserves old context consumers', async () => {
  const vault = setup(); const parent = vault.GetThink('parent')!;
  parent.Metadata.thinkProgress = { schemaVersion: 1, events: [structuredClone(event)] }; parent.markMetadataSaved();
  const snapshot = await new ContextService(vault).getBundleContext('parent', { includeSubtasks: true });
  const context = conversationContext(snapshot);
  expect(context.bundleProgress?.event?.input.paused).toBe(true);
  expect(context.bundleProgress?.event?.input.resumeCondition).toBe('返事が届いたら');
  expect(context.subtasks?.items).toEqual([]);
  expect(conversationContext(await new ContextService(vault).getBundleContext('parent')).bundleProgress).toBeUndefined();
  parent.Content += '未保存';
  const unsaved = await new ContextService(vault).getBundleContext('parent', { includeSubtasks: true });
  expect(unsaved.bundleProgress).toEqual({ status: 'unsaved' });
  expect(() => validateContext({ ...context, scope: 'chat-only', snapshotId: 'parent', subtasks: undefined })).toThrow('Chat単独');
});
it('marks unknown child records as insufficient evidence even when the provider does not', async () => {
  const vault = setup(); const unknown = child('unknown'); unknown.Metadata.thinkProgress = undefined; unknown.markMetadataSaved(); vault.AddThink(unknown);
  const snapshot = await new ContextService(vault).getBundleContext('parent', { includeSubtasks: true });
  const context = { ...conversationContext(snapshot), quality: 'complete' as const };
  const generate = vi.fn().mockResolvedValue({ reply: '確認が必要です。', insufficientEvidence: false, citations: [], proposals: [] });
  const result = await new ConversationService({ name: 'test', model: 'test', generate }).answer('review', '次は？', context, [], new AbortController().signal);
  expect(result.answer.insufficientEvidence).toBe(true); expect(generate).toHaveBeenCalledTimes(1);
});
it('rejects child changes during snapshot collection instead of combining different moments', async () => {
  const vault = setup(); const task = child('child'); vault.AddThink(task);
  const parent = vault.GetThink('parent')!; parent.IsMetaOnly = true;
  let resolve!: (body: string) => void;
  const getBody = vi.fn().mockReturnValue(new Promise<string>(r => { resolve = r; }));
  const reading = new ContextService(vault, { getBody, search: vi.fn() }).getBundleContext('parent', { includeSubtasks: true });
  const assertion = expect(reading).rejects.toMatchObject({ code: 'context_changed' });
  task.Metadata.thinkProgress = undefined; resolve(''); await assertion;
});
it.each([
  { bundleId: 'parent', title: '自己参照', status: 'unrecorded' },
  { bundleId: 'child', title: '子', status: 'recorded', event: { ...event, author: 'ai' } },
  { bundleId: 'child', title: '子', status: 'unsaved', event },
])('rejects invalid child records at the wire boundary', item => {
  expect(() => validateSubtaskContext({ scope: 'loaded-direct-children', items: [item] }, 'parent')).toThrow();
});
