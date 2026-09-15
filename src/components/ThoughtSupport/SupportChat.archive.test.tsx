// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { SupportChat, type SupportChatRef } from './SupportChat';
import { TTThink } from '../../models/TTThink';
import type { TTVault } from '../../models/TTVault';

it.each(['Thinktank', 'Overview', 'Workout', 'ReThink'] as const)('%s omits the legacy history panel without rewriting or executing stored Chat files', async panelName => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const chat = new TTThink(); chat.ID = 'old-chat'; chat.ContentType = 'chat'; chat.Name = `TODO:${panelName}｜[進行中]Bundle`; chat.Content = '保存済み会話\n## 質問\n回答';
  chat.Metadata.supportPendingEffects = { operationId: 'preserve-pending' }; const before = chat.Content; const metadataBefore = JSON.stringify(chat.Metadata);
  const bundle = new TTThink(); bundle.ID = 'bundle'; bundle.ContentType = 'bundle'; bundle.Name = 'Bundle'; bundle.Content = '# Bundle';
  const load = vi.spyOn(chat, 'LoadContent'); const save = vi.spyOn(chat, 'SaveContent');
  const vault = { GetThink: (id: string) => id === chat.ID ? chat : id === bundle.ID ? bundle : undefined, GetThinks: () => [chat, bundle], AddOnUpdate: vi.fn(), RemoveOnUpdate: vi.fn() } as unknown as TTVault;
  const host = document.createElement('div'); const root = createRoot(host); const ref = createRef<SupportChatRef>();
  try {
    await act(async () => root.render(<SupportChat ref={ref} vault={vault} selectedId={chat.ID} bundleId={bundle.ID} panelName={panelName}
      onSelected={vi.fn()} onMessages={vi.fn()} onWaiting={vi.fn()} modelSelector={{ value: { provider: 'openai', model: 'unused' }, onChange: vi.fn() }} />));
    expect(host.textContent).not.toContain('これまでの会話'); expect(host.querySelector('.support-chat-history')).toBeNull();
    expect(load).not.toHaveBeenCalled(); ref.current?.save(); expect(save).not.toHaveBeenCalled();
    expect(chat.Content).toBe(before); expect(JSON.stringify(chat.Metadata)).toBe(metadataBefore);
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
