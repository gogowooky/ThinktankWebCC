// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
const storage = vi.hoisted(() => ({ getContent: vi.fn(), search: vi.fn(), save: vi.fn(), delete: vi.fn() }));
vi.mock('./storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
vi.mock('./ChatApiService', () => { throw new Error('Context must not import AI execution'); });
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { ContextService, LatestBundleContextReader, type ContextReader } from './ContextService';
import { emptyThinkValues } from './ThinkSupportService';

const ROOT = '2026-09-13-100000', NESTED = '2026-09-13-100001', A = '2026-09-13-100002', B = '2026-09-13-100003', MISSING = '2026-09-13-100004';
function item(id: string, content: string, type = 'memo') {
  const t = new TTThink(); t.ID = id; t.ContentType = type as TTThink['ContentType'];
  t.Content = content; t.UpdatedAt = '2026-09-13T00:00:00Z'; t.markSaved(); return t;
}
function vault(...items: TTThink[]) { const v = new TTVault('test'); items.forEach(t => v.AddItem(t)); v.IsLoaded = true; return v; }
function reader(): ContextReader { return { getContent: vi.fn().mockResolvedValue(null), search: vi.fn().mockResolvedValue({ items: [], complete: true }) }; }
function meta(t: TTThink) { return { id: t.ID, title: t.Name, contentType: t.ContentType, keywords: '', relatedIds: '', sizeBytes: 0, isDeleted: false, createdAt: t.UpdatedAt, updatedAt: t.UpdatedAt }; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.clearAllMocks(); });
afterEach(() => { expect(storage.save).not.toHaveBeenCalled(); expect(storage.delete).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('read-only Bundle context', () => {
  it('rejects oversized conversation scope before downloading member bodies', async () => {
    const root = item(ROOT, `課題\n* ${A}\n* ${B}`, 'bundle');
    const a = item(A, '資料A'), b = item(B, '資料B'); a.IsMetaOnly = true; b.IsMetaOnly = true;
    const source = reader();
    await expect(new ContextService(vault(root, a, b), source).getBundleContext(ROOT, { maxSources: 1 })).rejects.toThrow('参照資料が2件');
    expect(source.getContent).not.toHaveBeenCalled();
  });
  it('keeps confirmed manual state separate from legacy proposals and freezes its provenance', async () => {
    const root = item(ROOT, `課題\n* ${A}`, 'bundle');
    root.Metadata.thinkSupport = { schemaVersion: 1, revision: 1, values: { ...emptyThinkValues(), decisions: '本人の判断' }, sources: {}, author: 'human', confirmedAt: '2026-09-13T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z' };
    root.Metadata.thoughtSupport = { proposals: '旧AI提案' };
    const snapshot = await new ContextService(vault(root, item(A, '資料')), reader()).getBundleContext(ROOT);
    expect(snapshot.manualState?.values.decisions).toBe('本人の判断');
    expect(snapshot.state.legacyProposals[0].value).toBe('旧AI提案');
    expect(snapshot.state.decisions).toEqual([]);
    expect(Object.isFrozen(snapshot.manualState?.values)).toBe(true);
  });
  it('preserves nested scope/exclusions, hashes exact text, and never follows out-of-scope metadata references', async () => {
    const a = item(A, '採用資料\n本文'); a.Metadata.thoughtSupport = { goal: '調べる', references: [B] };
    const root = item(ROOT, `課題\n* ${NESTED}\n- ${B}`, 'bundle');
    const v = vault(root, item(NESTED, `子課題\n* ${A}\n* ${B}`, 'bundle'), a, item(B, '対象外'));
    const original = JSON.stringify(v.GetThinks().map(t => [t.Content, t.Metadata, t.IsDirty]));
    const result = await new ContextService(v, reader()).getBundleContext(ROOT);
    expect(result.quality).toBe('complete');
    expect(result.sources.map(t => t.thinkId)).toEqual([A]);
    expect(result.bundleDefinitions.map(t => t.thinkId)).toEqual([ROOT, NESTED]);
    expect(result.state.goal[0]).toMatchObject({ value: '調べる', sourceThinkId: A, authority: 'legacy-record' });
    expect(result.sources[0].contentHash).toBe(createHash('sha256').update('採用資料\n本文').digest('hex'));
    expect(result.state.goal[0].sourceContentHash).toBe(result.sources[0].contentHash);
    expect(Object.isFrozen(result.sources[0])).toBe(true);
    expect(original).toBe(JSON.stringify(v.GetThinks().map(t => [t.Content, t.Metadata, t.IsDirty])));
    a.Content = '変更後'; a.Metadata.thoughtSupport.goal = '別の目的';
    expect(result.sources[0].content).toBe('採用資料\n本文');
    expect(result.state.goal[0].value).toBe('調べる');
    expect(original).not.toBe(JSON.stringify(v.GetThinks().map(t => [t.Content, t.Metadata, t.IsDirty])));
  });

  it('reports missing references, but not explicitly excluded references', async () => {
    const root = item(ROOT, `課題\n* ${A}\n* ${MISSING}\n* ${B}\n- ${B}`, 'bundle');
    const result = await new ContextService(vault(root, item(A, '資料')), reader()).getBundleContext(ROOT);
    expect(result.sources.map(s => s.thinkId)).toEqual([A]);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'missing_think', thinkId: MISSING })]);
    expect(result.resolvedThinkIds).toContain(MISSING);
  });

  it.each(['課題', `課題\n- ${A}`])('blocks implicit all-Vault expansion for %s', async content => {
    const result = await new ContextService(vault(item(ROOT, content, 'bundle'), item(A, '秘密')), reader()).getBundleContext(ROOT);
    expect(result.sources).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'implicit_all_blocked' }));
  });

  it('preserves the existing UI default for empty Bundles', async () => {
    const v = vault(item(ROOT, '課題', 'bundle'), item(A, '資料'));
    expect((await v.GetThinksForBundleAsync(ROOT)).map(t => t.ID)).toEqual([A]);
  });

  it('detects cycles without broadening scope', async () => {
    const v = vault(item(ROOT, `課題\n* ${NESTED}\n* ${A}`, 'bundle'), item(NESTED, `子\n* ${ROOT}`, 'bundle'), item(A, '資料'));
    const result = await new ContextService(v, reader()).getBundleContext(ROOT);
    expect(result.sources).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'cycle', thinkId: ROOT }));
  });

  it('does not mistake shared nested Bundles for cycles', async () => {
    const v = vault(item(ROOT, `課題\n* ${NESTED}\n* ${NESTED}`, 'bundle'), item(NESTED, `子\n* ${A}`, 'bundle'), item(A, '資料'));
    const result = await new ContextService(v, reader()).getBundleContext(ROOT);
    expect(result.quality).toBe('complete'); expect(result.sources).toHaveLength(1);
  });

  it('applies keyword/date conditions and re-evaluates a dynamic Bundle', async () => {
    const a = item(A, '一致する資料'), b = item(B, '別資料');
    const v = vault(item(ROOT, '課題\n> Keyword：一致\n> 更新日：2026-09-13,', 'bundle'), a, b);
    const service = new ContextService(v, reader());
    expect((await service.getBundleContext(ROOT)).sources.map(s => s.thinkId)).toEqual([A]);
    a.Content = '対象外資料'; b.Name = '一致する追加資料';
    expect((await service.getBundleContext(ROOT)).sources.map(s => s.thinkId)).toEqual([B]);
  });

  it('rejects ambiguous nested condition overrides for context only', async () => {
    const v = vault(item(ROOT, `課題\n* ${NESTED}\n> Keyword：親`, 'bundle'), item(NESTED, '子課題\n> Keyword：子', 'bundle'), item(A, '親資料'));
    const result = await new ContextService(v, reader()).getBundleContext(ROOT);
    expect(result.sources).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'conflicting_conditions' }));
  });

  it('uses search membership, dates and exclusions, and reports unknown completeness', async () => {
    const a = item(A, '本文一致'), b = item(B, '除外'), missing = item(MISSING, '索引にだけある資料');
    const r = reader(); vi.mocked(r.search).mockResolvedValue({ items: [meta(a), meta(b), meta(missing)], complete: false });
    const v = vault(item(ROOT, `課題\n>> 検索語：検索\n>> 更新日：2026-09-13,\n- ${B}`, 'bundle'), a, b);
    const result = await new ContextService(v, r).getBundleContext(ROOT);
    expect(r.search).toHaveBeenCalledWith('検索');
    expect(result.sources.map(s => s.thinkId)).toEqual([A]);
    expect(result.issues.map(i => i.code)).toEqual(expect.arrayContaining(['search_incomplete', 'missing_think']));
  });

  it('does not include deleted search hits', async () => {
    const a = item(A, '資料'); const r = reader();
    vi.mocked(r.search).mockResolvedValue({ items: [{ ...meta(a), isDeleted: true }], complete: true });
    const result = await new ContextService(vault(item(ROOT, '課題\n>> 検索語：検索', 'bundle'), a), r).getBundleContext(ROOT);
    expect(result.sources).toEqual([]);
  });

  it('does not use partial or cached membership after search failure', async () => {
    const r = reader(); vi.mocked(r.search).mockRejectedValue(new Error('offline'));
    const result = await new ContextService(vault(item(ROOT, `課題\n* ${A}\n>> 検索語：検索`, 'bundle'), item(A, '資料')), r).getBundleContext(ROOT);
    expect(result.sources).toEqual([]); expect(result.quality).toBe('partial');
  });

  it('loads bodies on copies, keeps empty bodies, and reports null/failed reads', async () => {
    const a = item(A, '資料'), b = item(B, '削除済み'), missing = item(MISSING, '通信失敗');
    [a, b, missing].forEach(t => { t.IsMetaOnly = true; });
    const r = reader(); vi.mocked(r.getContent).mockImplementation(async id => {
      if (id === MISSING) throw new Error('offline'); return id === A ? '' : null;
    });
    const v = vault(item(ROOT, `課題\n* ${A}\n* ${B}\n* ${MISSING}`, 'bundle'), a, b, missing);
    const before = JSON.stringify(v.GetThinks().map(t => [t.Content, t.Metadata, t.IsMetaOnly, t.IsDirty]));
    const result = await new ContextService(v, r).getBundleContext(ROOT);
    expect(result.sources).toEqual([expect.objectContaining({ thinkId: A, content: '資料\n', origin: 'storage-body' })]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'load_failed', thinkId: B }), expect.objectContaining({ code: 'load_failed', thinkId: MISSING }),
      expect.objectContaining({ code: 'remote_version_unverified', thinkId: A }),
    ]));
    expect(JSON.stringify(v.GetThinks().map(t => [t.Content, t.Metadata, t.IsMetaOnly, t.IsDirty]))).toBe(before);
  });

  it('fails clearly for an unavailable root and reports an unavailable nested Bundle', async () => {
    const root = item(ROOT, '課題', 'bundle'); root.IsMetaOnly = true;
    const r = reader(); const v = vault(root);
    await expect(new ContextService(v, r).getBundleContext(ROOT)).rejects.toMatchObject({ code: 'bundle_unavailable' });
    root.IsMetaOnly = false; root.Content = `課題\n* ${NESTED}`;
    const child = item(NESTED, '子', 'bundle'); child.IsMetaOnly = true; v.AddItem(child);
    const result = await new ContextService(v, r).getBundleContext(ROOT);
    expect(result.sources).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'load_failed', thinkId: NESTED }));
  });

  it('keeps conflicting decisions with provenance and never promotes proposals or current to conclusions/stages', async () => {
    const a = item(A, '会話A', 'chat'), b = item(B, '会話B', 'chat');
    a.Metadata.thoughtSupport = { decisions: '案A', proposals: '案Cを提案', current: '比較中', version: 2, confirmedAt: '2026-09-13', confirmationQuote: '案Aにする' };
    b.Metadata.thoughtSupport = { decisions: '案B' };
    const result = await new ContextService(vault(item(ROOT, `課題\n* ${A}\n* ${B}`, 'bundle'), a, b), reader()).getBundleContext(ROOT);
    expect(result.state.decisions.map(s => s.value)).toEqual(['案A', '案B']);
    expect(result.state.decisions[0]).toMatchObject({ sourceThinkId: A, recordVersion: 2, authority: 'legacy-record' });
    expect(result.state.stage).toEqual([]); expect(result.state.provisionalConclusion).toEqual([]);
    expect(result.state.legacyProposals[0].authority).toBe('legacy-ai-proposal');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'decision_conflict' }));
  });

  it('reports malformed legacy fields without copying invalid values', async () => {
    const a = item(A, '資料'); a.Metadata.thoughtSupport = { goal: ['invalid'], decisions: '有効' };
    const result = await new ContextService(vault(item(ROOT, `課題\n* ${A}`, 'bundle'), a), reader()).getBundleContext(ROOT);
    expect(result.state.goal).toEqual([]); expect(result.state.decisions[0].value).toBe('有効');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_support_record' }));
  });

  it('rejects unloaded Vaults and invalid Bundle IDs', async () => {
    const v = vault(item(A, '資料')); v.IsLoaded = false;
    const service = new ContextService(v, reader());
    await expect(service.getBundleContext(ROOT)).rejects.toMatchObject({ code: 'vault_not_loaded' });
    v.IsLoaded = true;
    await expect(service.getBundleContext(A)).rejects.toMatchObject({ code: 'invalid_bundle' });
  });

  it('rejects results if live data changes during loading', async () => {
    const body = deferred<string | null>(); const r = reader(); vi.mocked(r.getContent).mockReturnValue(body.promise);
    const a = item(A, '資料'); a.IsMetaOnly = true;
    const v = vault(item(ROOT, `課題\n* ${A}`, 'bundle'), a);
    const pending = new ContextService(v, r).getBundleContext(ROOT);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'context_changed' });
    a.Metadata.thoughtSupport = { decisions: '途中で変更' }; body.resolve('本文'); await assertion;
  });

  it('allows concurrent requests without scope mixing and rejects superseded UI requests', async () => {
    const body = deferred<string | null>(); const r = reader(); vi.mocked(r.getContent).mockReturnValue(body.promise);
    const a = item(A, '遅い資料'); a.IsMetaOnly = true;
    const v = vault(item(ROOT, `課題A\n* ${A}`, 'bundle'), item(NESTED, `課題B\n* ${B}`, 'bundle'), a, item(B, '速い資料'));
    const service = new ContextService(v, r); const latest = new LatestBundleContextReader(service);
    const first = latest.read(ROOT); const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = await latest.read(NESTED);
    body.resolve('遅い本文'); await rejected;
    expect(second.bundleId).toBe(NESTED); expect(second.sources.map(s => s.thinkId)).toEqual([B]);
    const [one, two] = await Promise.all([service.getBundleContext(ROOT), service.getBundleContext(NESTED)]);
    expect(one.sources.map(s => s.thinkId)).toEqual([A]); expect(two.sources.map(s => s.thinkId)).toEqual([B]);
    expect(one.snapshotId).not.toBe(two.snapshotId);
  });

  it('does not start I/O for an already cancelled request', async () => {
    const r = reader(); const controller = new AbortController(); controller.abort();
    await expect(new ContextService(vault(item(ROOT, '課題', 'bundle')), r).getBundleContext(ROOT, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(r.getContent).not.toHaveBeenCalled(); expect(r.search).not.toHaveBeenCalled();
  });
});
