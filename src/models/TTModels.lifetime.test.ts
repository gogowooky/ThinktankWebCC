// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { TTModels } from './TTModels';
import { TTVault } from './TTVault';
import { createDraftStore, hasUnsavedDrafts, resetDraftStores } from '../services/draftStore';

afterEach(() => { TTModels.resetInstance(); resetDraftStores(); vi.restoreAllMocks(); });

it('releases the previous Vault drafts before recreating an equal-ID model root without storage I/O', () => {
  TTModels.resetInstance();
  vi.spyOn(TTVault.prototype, 'LoadCache').mockResolvedValue(undefined);
  const drafts = createDraftStore<{ text: string }>(draft => !!draft.text);
  const original = TTModels.Instance.Vault;
  drafts.get(original, 'a', () => ({ text: 'old Vault input' }));
  expect(hasUnsavedDrafts()).toBe(true);
  TTModels.resetInstance();
  expect(hasUnsavedDrafts()).toBe(false);
  const next = TTModels.Instance.Vault;
  expect(next.ID).toBe(original.ID); expect(next).not.toBe(original);
  expect(drafts.get(next, 'a', () => ({ text: '' })).text).toBe('');
});
