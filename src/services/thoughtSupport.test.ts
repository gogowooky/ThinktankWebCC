import { beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ save: vi.fn(), getContent: vi.fn() }));
vi.mock('./storage/StorageManager', () => ({ StorageManager: { instance: backend } }));
import { TTThink } from '../models/TTThink';
import { TTVault } from '../models/TTVault';
import { parseSupportAnswer, planSupportUpdate, saveSupportTurn, undoSupportChange, supportRecord, supportMessages, isReviewDue } from './thoughtSupport';
import { applySupportEffects } from './thoughtSupportEffects';
import { isTodoChatThink } from '../utils/thinkFormat';

const now = '2026-09-08T10:00:00Z';
function chat(title = 'TODO:Thinktank｜[未着手]会場予約') {
  const t = new TTThink(); t.ID = '2026-09-08-100000'; t.ContentType = 'chat'; t.Content = title + '\n'; t.markSaved(); return t;
}
beforeEach(() => { backend.save.mockReset().mockResolvedValue({ updatedAt: now }); });

describe('thought support persistence and decisions', () => {
  it('accepts an exact one-character answer but not a fragment of a longer answer', () => {
    const op = { evidence: '2', record: { decisions: '比較する焦点は選択肢2' } };
    expect(planSupportUpdate(chat(), op, '2', now).record.confirmationQuote).toBe('2');
    expect(() => planSupportUpdate(chat(), op, '2か3で迷っています', now)).toThrow('本人');
    expect(() => planSupportUpdate(chat(), { ...op, evidence: ' ' }, ' ', now)).toThrow('本人');
  });
  it('preserves legacy unspecified state on owner change', () => {
    const result = planSupportUpdate(chat('TODO:Thinktank｜会場予約'), { panel: 'Overview', record: { handoff: '全体の予定を確認する' } }, '', now);
    expect(result.title).toBe('TODO:Overview｜会場予約');
  });
  it.each(['TODO', 'PROJ', 'ASK', 'EVNT', 'LOOP'])('routes %s through the common parser', kind => {
    expect(isTodoChatThink({ ContentType: 'chat', Name: `${kind}:Workout｜[待機]予約` }, 'TODO:Workout｜')).toBe(true);
  });
  it('changes kind and owner independently of waiting state', () => {
    const result = planSupportUpdate(chat('TODO:Workout｜[待機]会場予約'), { kind: 'PROJ', panel: 'Overview', record: { handoff: '準備全体を整理する', next: '案内の予定を決める' } }, '', now);
    expect(result.title).toBe('PROJ:Overview｜[待機]会場予約');
    expect(result.record.confirmedAt).toBe('');
  });
  it('does not accept an AI proposal as a user decision', () => {
    expect(() => planSupportUpdate(chat(), { record: { decisions: 'A会場に決定' } }, '違いを知りたい', now)).toThrow('本人');
    expect(() => planSupportUpdate(chat(), { state: '完了', evidence: '予約済みです', record: { remaining: 'なし' } }, '違いを知りたい', now)).toThrow('本人');
  });
  it('requires a remaining-work record on completion and records confirmation separately', () => {
    expect(() => planSupportUpdate(chat(), { state: '完了', evidence: '予約しました' }, '予約しました', now)).toThrow('残課題');
    const result = planSupportUpdate(chat(), { state: '完了', evidence: '予約しました', record: { remaining: '案内は子課題で継続' } }, '予約しました', now);
    expect(result.record.confirmedAt).toBe(now);
    expect(result.title).toContain('[完了]');
  });
  it('rejects invalid enums and dates before mutation', () => {
    const t = chat();
    for (const op of [{ panel: 'Other' }, { state: 'Done' }, { kind: 'QUST' }, { record: { reviewAt: '来週' } }]) expect(() => planSupportUpdate(t, op, '', now)).toThrow();
    expect(t.Name).toBe('TODO:Thinktank｜[未着手]会場予約');
  });
  it('rejects nonexistent calendar dates and reversed event times', () => {
    expect(() => planSupportUpdate(chat(), { record: { reviewAt: '2026-02-31' } }, '', now)).toThrow();
    expect(() => planSupportUpdate(chat(), { record: { startsAt: '2026-10-02', endsAt: '2026-10-01' } }, '', now)).toThrow();
  });
  it('does not call mere transcript persistence a new summary or user confirmation', async () => {
    const t = chat();
    await saveSupportTurn(t, [], undefined, t.Content, 0, 'input', '');
    expect(supportRecord(t).updatedAt).toBe(''); expect(supportRecord(t).confirmedAt).toBe('');
  });
  it('undoes a management change without deleting the conversation', async () => {
    const t = chat();
    const messages = [{ id: 'u1', role: 'user' as const, content: '進めます', timestamp: now }];
    await saveSupportTurn(t, messages, { state: '進行中', record: { next: '予約する' } }, t.Content, 0, 'move', '');
    await undoSupportChange(t);
    expect(t.Name).toContain('[未着手]'); expect(supportMessages(t)).toEqual(messages); expect(supportRecord(t).next).toBe('');
  });
  it('rejects concurrent content changes and does not overwrite them', async () => {
    const t = chat(); const before = t.Content; t.Content += '別の編集';
    await expect(saveSupportTurn(t, [], {}, before, 0, 'op', '')).rejects.toThrow('別の場所');
    expect(backend.save).not.toHaveBeenCalled();
  });
  it('rolls local changes back on storage failure so retry is safe', async () => {
    const t = chat(); const before = t.Content;
    backend.save.mockRejectedValueOnce(new Error('409 conflict'));
    await expect(saveSupportTurn(t, [], { state: '進行中' }, before, 0, 'op', '')).rejects.toThrow('409');
    expect(t.Content).toBe(before); expect(supportRecord(t).version).toBe(0);
    await saveSupportTurn(t, [], { state: '進行中' }, before, 0, 'op', '');
    expect(t.Name).toContain('[進行中]');
  });
  it('deduplicates operations and persists exact multi-line messages alongside readable text', async () => {
    const t = chat(); const before = t.Content;
    const messages = [{ id: 'u1', role: 'user' as const, content: '質問\n続き', timestamp: now }, { id: 'a1', role: 'assistant' as const, content: '説明\n## 見出し\n本文', timestamp: now }];
    await saveSupportTurn(t, messages, {}, before, 0, 'same', '');
    await saveSupportTurn(t, messages, {}, before, 0, 'same', '');
    expect(backend.save).toHaveBeenCalledTimes(1);
    expect(supportMessages(t)).toEqual(messages);
    t.Content = '別のタイトル\n## 手動編集\n回答';
    expect(supportMessages(t)[0].content).toBe('手動編集');
  });
  it('saves a pending multi-file operation in the same write as the answer', async () => {
    const t = chat(); const journal = { operationId: 'op', answer: { reply: '整理します', createBundle: '会場' } };
    await saveSupportTurn(t, [], {}, t.Content, 0, 'op', '', journal);
    expect(backend.save).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ supportPendingEffects: journal }) }));
  });
  it('marks due dates without inferring completion', () => {
    const record = { ...supportRecord(), due: '2026-01-01' };
    expect(isReviewDue(record, new Date(now))).toBe(false);
    expect(isReviewDue({ ...record, reviewAt: '2026-09-01' }, new Date(now))).toBe(true);
  });
  it('does not execute malformed or prose-only model output', () => {
    expect(() => parseSupportAnswer('完了しました')).toThrow();
    expect(() => parseSupportAnswer('{"operation":{"state":"完了"}}')).toThrow();
  });
});

describe('recoverable bundle and occurrence creation', () => {
  it('retries a failed Bundle write without treating an unsaved link as completed', async () => {
    const vault = new TTVault();
    const bundle = await vault.AddThinkWithContent('bundle-test', '資料', 'bundle', '', '> 資料\n* first-id');
    backend.save.mockRejectedValueOnce(new Error('offline'));
    await expect(vault.LinkThinksToBundle(bundle.ID, ['next-id'])).rejects.toThrow('offline');
    expect(bundle.Content).not.toContain('next-id');
    await vault.LinkThinksToBundle(bundle.ID, ['next-id']);
    expect(bundle.Content).toContain('next-id');
  });
  it('retries a partial link failure without creating duplicate children or artifacts', async () => {
    const vault = new TTVault();
    const source = await vault.AddThinkWithContent('2026-09-08-110000', '毎月の会', 'chat', '', 'LOOP:Overview｜[進行中]毎月の会\n');
    source.Metadata.supportPendingEffects = { operationId: 'event-1', sources: [], answer: { reply: '', createBundle: '交流会', children: [{ key: 'october', title: '10月の交流会', goal: '交流する', kind: 'EVNT', occurrence: '2026-10-01' }], artifact: { key: 'plan', title: '予定', type: 'html', body: '<p>予定</p>' } } };
    const link = vi.spyOn(vault, 'LinkThinksToBundle').mockRejectedValueOnce(new Error('通信失敗'));
    await expect(applySupportEffects(vault, source)).rejects.toThrow('通信失敗');
    const count = vault.Count;
    expect(source.Metadata.supportPendingEffects).toBeTruthy();
    await applySupportEffects(vault, source);
    expect(vault.Count).toBe(count);
    expect(source.Metadata.supportPendingEffects).toBeUndefined();
    const child = vault.GetThinks().find(t => supportRecord(t).parentId === source.ID)!;
    expect(supportRecord(child).loopId).toBe(source.ID);
    expect(supportRecord(child).occurrence).toBe('2026-10-01');
    expect(vault.GetThink(supportRecord(source).bundleId)?.Content).toContain(child.ID);
    expect(link).toHaveBeenCalledTimes(2);
  });
});
