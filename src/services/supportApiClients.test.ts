import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./apiClient', async () => ({ apiFetch: mocks.fetch, ...await import('./apiResponse') }));
import { AgentClient } from './AgentClient';
import { ConversationClient } from './ConversationService';
import { ExternalService } from './ExternalService';
import { FileSearchClient } from './FileSearchClient';
import { ProgressService } from './ProgressService';
import { ThinkSupportService } from './ThinkSupportService';
import { StorageConflictError } from './storage/IStorageBackend';
import { emptyThinkValues } from '../../server/contracts/thinkSupportRecord';
import type { ConversationTurn } from '../../server/contracts/conversationRecord';

const version = '2026-10-13T00:00:00Z';
const states = [
  { call: () => new AgentClient().read('bundle'), message: 'ジョブの対象が一致しません。' },
  { call: () => new ExternalService().read('bundle'), message: '取得結果の対象または版が不正です。' },
  { call: () => new FileSearchClient().readBinding('bundle'), message: 'ストア対応の対象または版が不正です。' },
  { call: () => new ProgressService().read('bundle'), message: '保存結果の形式または対象が一致しません。' },
];
beforeEach(() => { vi.clearAllMocks(); });

it.each(states)('keeps the client-specific bundle and version validation: $message', async ({ call, message }) => {
  for (const value of [{ bundleId: 'other', version }, { bundleId: 'bundle', version: 'invalid' }]) {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(value)));
    await expect(call()).rejects.toThrow(message);
  }
});

it('retains the manual-state target check and typed save conflict', async () => {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ thinkid: 'other', category: 'bundle', updatedAt: version })));
  await expect(new ThinkSupportService().read('bundle')).rejects.toThrow('Bundleの保存情報を確認できません。');
  mocks.fetch.mockResolvedValueOnce(new Response('not-json', { status: 409 }));
  await expect(new ThinkSupportService().save('bundle', version, emptyThinkValues(), {})).rejects.toBeInstanceOf(StorageConflictError);
});

it('rejects conversation history belonging to another bundle after parsing successful JSON', async () => {
  const turn: ConversationTurn = {
    schemaVersion: 1, id: 'turn', createdAt: version, question: '質問', provider: 'test', model: 'test',
    context: { schemaVersion: 1, snapshotId: 'snapshot', vaultId: 'vault', bundleId: 'other', capturedAt: version,
      scope: 'bundle-only', quality: 'complete', sources: [], issues: [], manualState: null },
    answer: { reply: '回答', insufficientEvidence: false, citations: [], proposals: [] },
  };
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ schemaVersion: 1, turns: [turn] })));
  await expect(new ConversationClient().history('bundle')).rejects.toThrow('履歴の対象が一致しません。');
});
