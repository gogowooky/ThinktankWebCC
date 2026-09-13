// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { SupportChat, type SupportChatRef } from './SupportChat';
import { TTThink } from '../../models/TTThink';
import type { TTVault } from '../../models/TTVault';

it.each(['Thinktank', 'Overview', 'Workout', 'ReThink'] as const)('%s reads stored chats without writing or executing AI', async panelName => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const think = new TTThink(); think.ID = 'old-chat'; think.ContentType = 'chat';
  think.Content = '過去の相談\n## 質問\n保存済みの回答';
  think.Metadata.supportPendingEffects = { operationId: 'preserve-pending' };
  const metadataBefore = JSON.stringify(think.Metadata);
  const before = think.Content;
  const load = vi.spyOn(think, 'LoadContent').mockResolvedValue(undefined);
  const save = vi.spyOn(think, 'SaveContent');
  const vault = { GetThink: () => think, IsLoaded: true } as unknown as TTVault;
  const host = document.createElement('div'); const root = createRoot(host);
  const ref = createRef<SupportChatRef>();
  try {
    await act(async () => root.render(<SupportChat ref={ref} vault={vault} selectedId={think.ID} panelName={panelName}
      onSelected={vi.fn()} onMessages={vi.fn()} onWaiting={vi.fn()}
      modelSelector={{ value: { provider: 'openai', model: 'gpt-5.6' }, onChange: vi.fn() }} />));
    expect(load).toHaveBeenCalled();
    expect(host.textContent).toContain('保存済みの回答');
    expect(host.textContent).toContain('閲覧専用');
    expect(host.querySelector('textarea, select')).toBeNull();
    ref.current?.save();
    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(think.Content).toBe(before);
    expect(JSON.stringify(think.Metadata)).toBe(metadataBefore);
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
