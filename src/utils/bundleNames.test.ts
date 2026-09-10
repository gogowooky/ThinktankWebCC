import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: { save: vi.fn(), getContent: vi.fn() } } }));
import { TTThink } from '../models/TTThink';
import type { TTVault } from '../models/TTVault';
import { buildBundleNames } from './bundleNames';
import { applySort, getFieldValue } from './sortUtils';

function think(id: string, name: string, bundleId?: string) {
  const item = new TTThink();
  item.ID = id;
  item.ContentType = 'chat';
  item.setContentSilent(name);
  if (bundleId) item.Metadata = { thoughtSupport: { bundleId } };
  return item;
}

function vaultWith(bundles: Record<string, string>) {
  return {
    GetThink: (id: string) => (bundles[id] ? think(id, bundles[id]) : undefined),
  } as unknown as TTVault;
}

describe('bundle column values', () => {
  it('resolves the displayed bundle name and falls back to the id when the bundle is gone', () => {
    const vault = vaultWith({ b1: '交流会' });
    const names = buildBundleNames(vault, [think('c1', 'a', 'b1'), think('c2', 'b', 'missing'), think('c3', 'c')]);
    expect(names.get('c1')).toBe('交流会');
    expect(names.get('missing')).toBeUndefined();
    expect(names.get('c2')).toBe('missing');
    expect(names.has('c3')).toBe(false);
  });

  it('sorts by the shown name, not by the bundle id', () => {
    // The ids order z→a while the names order a→z, so an id-based sort would invert this.
    const vault = vaultWith({ zzz: 'あいうえ', aaa: 'わをん' });
    const items = [think('c1', 'first', 'aaa'), think('c2', 'second', 'zzz')];
    const names = buildBundleNames(vault, items);
    const sorted = applySort(items, { field: 'Bundle', dir: 'asc' }, names);
    expect(sorted.map(t => t.ID)).toEqual(['c2', 'c1']);
  });

  it('leaves rows without a bundle sortable and never reads metadata per comparison', () => {
    const vault = vaultWith({ b1: 'Bundle' });
    const item = think('c1', 'a', 'b1');
    const names = buildBundleNames(vault, [item]);
    const spy = vi.spyOn(vault, 'GetThink');
    expect(getFieldValue(item, 'Bundle', names)).toBe('bundle');
    expect(getFieldValue(think('c2', 'b'), 'Bundle', names)).toBe('');
    expect(getFieldValue(item, 'Bundle')).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });
});
