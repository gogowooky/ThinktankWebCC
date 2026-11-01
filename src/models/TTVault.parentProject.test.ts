// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => {
  let n = 0;
  return {
    save: vi.fn(async () => ({ updatedAt: `2026-10-31T00:00:${String(++n).padStart(2, '0')}Z` })),
    updateMetadata: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ updatedAt: '2026-10-31T01:00:00Z', metadata: { keep: 1, ...patch } })),
    delete: vi.fn(async () => undefined),
  };
});
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from './TTVault';
import { TTThink } from './TTThink';

const parentOf = (t: TTThink | undefined) => t?.Metadata.parentProjectid as string | undefined;

let vault: TTVault;
beforeEach(() => { vi.clearAllMocks(); vault = new TTVault('vault'); });

it('projectを作ると、組み込んだThinkに親projectのIDを記録する', async () => {
  const memo = await vault.CreateBlankThink('memo', 'メモ');
  const table = await vault.CreateBlankThink('table', '表');
  const project = await vault.CreateProjectFromIds([memo.ID, table.ID]);
  await vi.waitFor(() => expect([parentOf(memo), parentOf(table)]).toEqual([project.ID, project.ID]));
  expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ thinkid: memo.ID, metadata: { parentProjectid: project.ID } }));
  expect(parentOf(project)).toBeUndefined();
});

it('別のprojectに組み込んでも最初の親を保ち、最初の親から外れたら次に保存したprojectが親になる', async () => {
  const a = await vault.CreateBlankThink('memo', 'A');
  const b = await vault.CreateBlankThink('memo', 'B');
  const p1 = await vault.CreateProjectFromIds([a.ID, b.ID]);
  await vi.waitFor(() => expect(parentOf(b)).toBe(p1.ID));

  // 別のprojectへ組み込んでも、親は最初の p1 のまま
  const p2 = await vault.CreateProjectFromIds([a.ID]);
  expect(parentOf(a)).toBe(p1.ID);

  // p1 から a・b を外すと、親が p1 の記録は消える
  p1.Content = 'P1\n=\n# 対象\n';
  await p1.SaveContent();
  await vi.waitFor(() => expect([parentOf(a), parentOf(b)]).toEqual([undefined, undefined]));
  expect('parentProjectid' in b.Metadata).toBe(false);

  // 親の無くなった a は、それを参照している p2 が次に保存されたとき p2 を親にする
  p2.Content = `${p2.Content}\n`;
  await p2.SaveContent();
  await vi.waitFor(() => expect(parentOf(a)).toBe(p2.ID));

  // 本文に参照を書き足すと、親の無い Think に記録する
  p1.Content = `P1\n=\n# 対象\n[memo:${b.ID}]`;
  await p1.SaveContent();
  await vi.waitFor(() => expect(parentOf(b)).toBe(p1.ID));
});

it('記録先のprojectがVaultに無いときは、親が無いものとして新しい親を記録する', async () => {
  const memo = await vault.CreateBlankThink('memo', 'メモ');
  memo.Metadata = { parentProjectid: '2026-01-01-000000' };
  const project = await vault.CreateProjectFromIds([memo.ID]);
  expect(parentOf(memo)).toBe(project.ID);
});

it('本文未取得のThinkは本文を保存し直さず、metadataだけを書き換える', async () => {
  const meta = new TTThink(); meta.ID = '2026-10-30-000009'; meta.ContentType = 'memo'; meta.IsMetaOnly = true;
  meta.setContentSilent('一覧だけ'); meta.UpdatedAt = '2026-10-30T00:00:00Z';
  vault.AddItem(meta);
  const project = await vault.CreateProjectFromIds([meta.ID]);
  await vi.waitFor(() => expect(parentOf(meta)).toBe(project.ID));
  expect(storage.updateMetadata).toHaveBeenCalledWith(meta.ID, { parentProjectid: project.ID }, '2026-10-30T00:00:00Z');
  expect(storage.save).not.toHaveBeenCalledWith(expect.objectContaining({ thinkid: meta.ID }));
  expect(meta.Metadata).toEqual({ keep: 1, parentProjectid: project.ID });
});

it('保存前の構成が分からないときも、親の記録が無いThinkにだけ付け、記録は消さない', async () => {
  const fresh = await vault.CreateBlankThink('memo', '新規');
  const owner = await vault.CreateProjectFromIds([]);
  const owned = await vault.CreateBlankThink('memo', '所属済み');
  owned.Metadata = { parentProjectid: owner.ID };
  await vault.SyncParentProjectIds('2026-10-30-999999', null, [fresh.ID, owned.ID]);
  expect(parentOf(fresh)).toBe('2026-10-30-999999');
  expect(parentOf(owned)).toBe(owner.ID);
  await vault.SyncParentProjectIds('2026-10-30-999999', null, []);
  expect(parentOf(fresh)).toBe('2026-10-30-999999');
});

it('projectを削除すると、そのprojectを親として記録していたThinkから記録を外す', async () => {
  const memo = await vault.CreateBlankThink('memo', 'メモ');
  const project = await vault.CreateProjectFromIds([memo.ID]);
  await vi.waitFor(() => expect(parentOf(memo)).toBe(project.ID));
  await vault.DeleteThinks([project.ID]);
  expect(parentOf(memo)).toBeUndefined();
});

it('配下の取得は、途中のprojectファイルも含めて何段でもたどり、循環や自分自身は除く', async () => {
  const add = (id: string, contentType: TTThink['ContentType'], content: string) => {
    const t = new TTThink(); t.ID = id; t.ContentType = contentType; t.setContentSilent(content); t.markSaved(); vault.AddItem(t);
  };
  add('2026-10-31-000001', 'project', 'P\n=\n# 対象\n[project:2026-10-31-000002]\n[memo:2026-10-31-000003]\n[memo:2026-10-31-999999]');
  add('2026-10-31-000002', 'project', 'Q\n=\n# 対象\n[memo:2026-10-31-000004]\n[project:2026-10-31-000001]');
  add('2026-10-31-000003', 'memo', 'M1');
  add('2026-10-31-000004', 'memo', 'M2');
  const ids = (await vault.GetProjectDescendantsAsync('2026-10-31-000001')).map(t => t.ID);
  expect(ids).toEqual(['2026-10-31-000002', '2026-10-31-000003', '2026-10-31-000004']);
});

it('Seeds用の対象取得は、設定projectの # 対象 に直接記載されたファイルだけを返す', async () => {
  const add = (id: string, contentType: TTThink['ContentType'], content: string) => {
    const t = new TTThink(); t.ID = id; t.ContentType = contentType; t.setContentSilent(content); t.markSaved(); vault.AddItem(t);
  };
  add('2026-10-31-000001', 'project', [
    'P', '=', '# 対象', '[project:2026-10-31-000002]', '[memo:2026-10-31-000003]',
    '# AIまとめ', '[aiview:2026-10-31-000005]',
  ].join('\n'));
  add('2026-10-31-000002', 'project', 'Q\n=\n# 対象\n[memo:2026-10-31-000004]');
  add('2026-10-31-000003', 'memo', 'M1');
  add('2026-10-31-000004', 'memo', 'M2');
  add('2026-10-31-000005', 'aiview', 'AI');

  expect((await vault.GetProjectTargetsAsync('2026-10-31-000001')).map(t => t.ID))
    .toEqual(['2026-10-31-000002', '2026-10-31-000003']);
});

it('# 対象 の1行目が「*」のprojectは全ファイルを配下とし、親の記録は付けない', async () => {
  const add = (id: string, contentType: TTThink['ContentType'], content: string) => {
    const t = new TTThink(); t.ID = id; t.ContentType = contentType; t.setContentSilent(content); t.markSaved(); vault.AddItem(t);
  };
  add('2026-10-31-000001', 'project', 'ALL\n=\n# 対象\n*');
  add('2026-10-31-000002', 'project', 'Q\n=');
  add('2026-10-31-000003', 'memo', 'M1');
  add('2026-10-31-000004', 'table', 'T1');
  const descendants = (await vault.GetProjectDescendantsAsync('2026-10-31-000001')).map(t => t.ID).sort();
  expect(descendants).toEqual(['2026-10-31-000002', '2026-10-31-000003', '2026-10-31-000004']);
  const members = (await vault.GetThinksForProjectAsync('2026-10-31-000001')).map(t => t.ID).sort();
  expect(members).toEqual(['2026-10-31-000003', '2026-10-31-000004']);

  // 配下の project が「*」なら、それを含む project も全ファイルが配下になる
  add('2026-10-31-000005', 'project', 'TOP\n=\n# 対象\n[project:2026-10-31-000001]');
  expect((await vault.GetThinksForProjectAsync('2026-10-31-000005')).map(t => t.ID).sort())
    .toEqual(['2026-10-31-000003', '2026-10-31-000004']);

  const all = vault.GetThink('2026-10-31-000001')!;
  all.Content = 'ALL\n=\n# 対象\n*\n';
  await all.SaveContent();
  expect(parentOf(vault.GetThink('2026-10-31-000003'))).toBeUndefined();
});
