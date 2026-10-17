// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), webProvider: 'drive' as 'drive' | 'local' }));
vi.mock('./apiClient', async () => ({ apiFetch: mocks.fetch, ...await import('./apiResponse') }));
vi.mock('../platform/web/FirestoreRelayClient', () => ({ FirestoreRelayClient: { isConfigured: () => false, request: mocks.fetch } }));
vi.mock('./storage/StorageManager', () => ({ StorageManager: { instance: { save: mocks.save, get webProvider() { return mocks.webProvider; } } } }));
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { ConversationClient, chatOnlyConversationContext } from './ConversationService';
import type { ConversationTurn } from '../../shared/contracts/conversationRecord';

let vault: TTVault, chat: TTThink;
const turn = (bundleId: string): ConversationTurn => ({
  schemaVersion: 1, id: 'turn', createdAt: '2026-09-25T00:00:00Z', question: '質問', provider: 'test', model: 'test',
  context: chatOnlyConversationContext('vault', bundleId),
  answer: { reply: '回答', insufficientEvidence: false, citations: [], proposals: [] },
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.webProvider = 'drive';
  vault = new TTVault('vault'); chat = new TTThink(); chat.ID = 'chat'; chat.ContentType = 'chat';
  chat.Content = '# ASK:Thinktank｜相談'; chat.Metadata = { thinkConversations: { schemaVersion: 1, turns: [turn('chat')] } };
  chat.UpdatedAt = '2026-09-25T01:00:00Z'; chat.markSaved(); chat.markMetadataSaved(); vault.AddThink(chat);
});
afterEach(() => vi.unstubAllGlobals());

it('reads browser history from the loaded Vault without any HTTP request', async () => {
  const turns = await new ConversationClient().history(undefined, undefined, 'chat', 'vault', vault);
  expect(turns.map(t => t.id)).toEqual(['turn']);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('refuses to generate in the hosted browser version when no relay is configured', async () => {
  await expect(new ConversationClient().generate(chatOnlyConversationContext('vault', 'chat'), '質問', [], new AbortController().signal))
    .rejects.toThrow('AIに接続できません');
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('reports the AI as unavailable instead of calling a server when no relay is configured', async () => {
  await expect(new ConversationClient().status()).resolves.toMatchObject({ enabled: false });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
