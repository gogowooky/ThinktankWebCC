// @vitest-environment jsdom
import { act, StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TTVault } from '../models/TTVault';
import { createDraftStore, disposeVaultDrafts, draftVaultLease, hasUnsavedDrafts, registerDraftWarning, resetDraftStores } from './draftStore';

interface Draft { input: string; pending?: object; busy: boolean; running?: string }
const drafts = createDraftStore<Draft>(draft => !!(draft.input || draft.pending || draft.busy || draft.running));
const fresh = (): Draft => ({ input: '', busy: false });
// 寿命のキーはVaultの内容や文字列IDではなくオブジェクトの同一性だけに依存する。
const vault = (): TTVault => ({ ID: 'same-vault-id' } as TTVault);
function leaving() { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }
beforeEach(() => { resetDraftStores(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(() => { resetDraftStores(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('uses one listener for multiple draft kinds and Vaults and releases it after disposal', () => {
  const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener');
  const left = vault(), right = vault();
  const other = createDraftStore<{ dirty: boolean }>(draft => draft.dirty);
  drafts.get(left, 'a', fresh); drafts.get(left, 'b', fresh); drafts.get(right, 'a', fresh);
  other.get(left, 'a', () => ({ dirty: true }));
  expect(add.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(1);
  expect(leaving()).toBe(true);
  disposeVaultDrafts(left);
  expect(leaving()).toBe(false);
  expect(remove.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(0);
  disposeVaultDrafts(right); disposeVaultDrafts(right);
  expect(remove.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(1);
});

it('preserves pending answers and Agent progress warnings and removes mounted-only warnings', () => {
  const source = vault(), draft = drafts.get(source, 'a', fresh);
  expect(leaving()).toBe(false);
  for (const update of [{ pending: {} }, { busy: true }, { running: 'job' }, { input: 'unsaved' }]) {
    Object.assign(draft, fresh(), { pending: undefined, running: undefined }, update);
    expect(leaving()).toBe(true);
  }
  Object.assign(draft, fresh(), { pending: undefined, running: undefined });
  let locked = true;
  const off = registerDraftWarning(source, () => locked);
  expect(leaving()).toBe(true);
  locked = false; expect(leaving()).toBe(false);
  locked = true; off(); off(); expect(leaving()).toBe(false);
});

it('clears detached maps on reset and creates a fresh identity for the same Vault', () => {
  const source = vault(), previousIdentity = draftVaultLease(source).identity, map = drafts.map(source);
  const previous = drafts.get(source, 'a', fresh); previous.input = 'old app';
  resetDraftStores();
  expect(map.size).toBe(0); expect(hasUnsavedDrafts()).toBe(false); expect(leaving()).toBe(false);
  // 完了が遅れた旧処理は破棄済みmapを書き換えても、新しいアプリには登録されない。
  map.set('a', previous);
  expect(hasUnsavedDrafts()).toBe(false);
  expect(draftVaultLease(source).identity).not.toBe(previousIdentity);
  expect(drafts.get(source, 'a', fresh).input).toBe('');
});

it('checks an expired lease without re-registering any Vault or window listener', () => {
  const source = vault(), lease = draftVaultLease(source);
  resetDraftStores();
  const add = vi.spyOn(window, 'addEventListener');
  expect(lease.isCurrent()).toBe(false); expect(lease.isCurrent()).toBe(false);
  drafts.get(source, 'discarded', () => ({ ...fresh(), input: 'old' }), lease);
  drafts.map(source, lease).set('discarded', { ...fresh(), input: 'old' });
  registerDraftWarning(source, () => true, lease);
  expect(hasUnsavedDrafts()).toBe(false);
  expect(add).not.toHaveBeenCalled();
  const next = draftVaultLease(source);
  expect(next.isCurrent()).toBe(true); expect(next.identity).not.toBe(lease.identity);
  expect(lease.isCurrent()).toBe(false);
});

it('keeps hidden drafts through StrictMode remounts and separates equal IDs by Vault object', async () => {
  const host = document.createElement('div'), root = createRoot(host);
  const add = vi.spyOn(window, 'addEventListener');
  const left = vault(), right = vault();
  let current!: Draft;
  function Panel({ source }: { source: TTVault }) {
    current = drafts.get(source, 'a', fresh);
    const locked = useRef(false);
    useEffect(() => registerDraftWarning(source, () => locked.current), [source]);
    return <span>{current.input}</span>;
  }
  const show = async (source?: TTVault) => { await act(async () => root.render(<StrictMode>{source && <Panel source={source} />}</StrictMode>)); };
  try {
    await show(left); current.input = 'left draft';
    await show(); expect(leaving()).toBe(true);
    await show(right); expect(current.input).toBe('');
    current.input = 'right draft';
    await show(left); expect(current.input).toBe('left draft');
    await show(right); expect(current.input).toBe('right draft');
    expect(add.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(1);
  } finally { await act(async () => root.unmount()); }
});
