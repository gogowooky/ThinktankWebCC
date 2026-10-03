// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import type { TTVault } from '../models/TTVault';
import { useSupportSelection } from './useSupportSelection';

it('restores an old panel selection and saves it under the new owner', async () => {
  localStorage.clear();
  localStorage.setItem('thinktank.support.selection:vault:Workout', 'chat-1');
  const vault = { VaultName: 'vault' } as TTVault;
  const container = document.createElement('div');
  const root = createRoot(container);
  function Selection() {
    const [id] = useSupportSelection(vault, 'Develop');
    return <span>{id}</span>;
  }
  await act(async () => { root.render(<Selection />); });
  expect(container.textContent).toBe('chat-1');
  expect(localStorage.getItem('thinktank.support.selection:vault:Develop')).toBe('chat-1');
  await act(async () => root.unmount());
});
