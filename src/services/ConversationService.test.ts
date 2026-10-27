import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConversationClient,
  chatOnlyConversationContext,
  setTurnPromotionCandidatesForTest,
  type ConversationTurn,
} from './ConversationService';
import { StorageManager } from './storage/StorageManager';
import { StorageConflictError, type ThinkMeta, type SavePayload } from './storage/IStorageBackend';
import { readConversationLog } from '../../shared/contracts/conversationRecord';
import { extractOperationsState } from '../../shared/operations';

function makeTurn(id: string, bundleId: string, question: string, reply: string, model: string): ConversationTurn {
  return {
    schemaVersion: 1,
    id,
    createdAt: '2026-10-22T00:00:00.000Z',
    question,
    context: chatOnlyConversationContext('vault_ver2', bundleId),
    answer: {
      reply,
      insufficientEvidence: false,
      citations: [],
      proposals: [],
    },
    provider: 'local-cli:claude',
    model,
  };
}

describe('ConversationClient parallel save and optimistic lock retry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes concurrent save calls within the same app so turns and promotion candidates from multiple panels are preserved', async () => {
    const store = new Map<string, { meta: ThinkMeta; body: string }>();
    let versionCounter = 1;

    const initRecord = (thinkid: string, category: string, title: string) => {
      store.set(thinkid, {
        meta: {
          thinkid,
          category,
          title,
          keywords: '',
          relatedIds: '',
          sizeBytes: title.length,
          isDeleted: false,
          createdAt: '2026-10-22T00:00:00.000Z',
          updatedAt: `2026-10-22T00:00:0${versionCounter++}.000Z`,
          metadata: {},
        },
        body: '',
      });
    };

    initRecord('bundle-1', 'bundle', '共通課題Bundle');
    initRecord('chat-seeds', 'chat', 'ASK:Seeds｜相談A');
    initRecord('chat-harvest', 'chat', 'ASK:Harvest｜相談B');

    vi.spyOn(StorageManager.instance, 'getRecord').mockImplementation(async (id: string) => {
      const rec = store.get(id);
      if (!rec) return null;
      return structuredClone(rec);
    });

    vi.spyOn(StorageManager.instance, 'save').mockImplementation(async (payload: SavePayload) => {
      const existing = store.get(payload.thinkid);
      if (payload.baseUpdatedAt && existing && existing.meta.updatedAt !== payload.baseUpdatedAt) {
        throw new StorageConflictError(payload.thinkid, existing.meta.updatedAt);
      }
      const nl = payload.fullContent.indexOf('\n');
      const title = nl < 0 ? payload.fullContent : payload.fullContent.slice(0, nl);
      const body = nl < 0 ? '' : payload.fullContent.slice(nl + 1);
      const nextMeta: ThinkMeta = {
        thinkid: payload.thinkid,
        category: payload.category,
        title,
        keywords: payload.keywords,
        relatedIds: payload.relatedIds,
        sizeBytes: payload.fullContent.length,
        isDeleted: false,
        createdAt: existing?.meta.createdAt ?? '2026-10-22T00:00:00.000Z',
        updatedAt: `2026-10-22T00:01:0${versionCounter++}.000Z`,
        metadata: structuredClone(payload.metadata ?? {}),
      };
      store.set(payload.thinkid, { meta: nextMeta, body });
      return structuredClone(nextMeta);
    });

    vi.spyOn(StorageManager.instance, 'updateMetadata').mockImplementation(
      async (id: string, patch: Record<string, unknown>, expectedVersion?: string) => {
        const existing = store.get(id);
        if (!existing) throw new Error('not found');
        if (expectedVersion && existing.meta.updatedAt !== expectedVersion) {
          throw new StorageConflictError(id, existing.meta.updatedAt);
        }
        const nextMeta: ThinkMeta = {
          ...existing.meta,
          updatedAt: `2026-10-22T00:01:0${versionCounter++}.000Z`,
          metadata: structuredClone({ ...(existing.meta.metadata ?? {}), ...patch }),
        };
        store.set(id, { meta: nextMeta, body: existing.body });
        return structuredClone(nextMeta);
      },
    );

    const turn1 = makeTurn('turn-1', 'bundle-1', '質問1', '回答1 (Claude)', 'claude-opus-5');
    const turn2 = makeTurn('turn-2', 'bundle-1', '質問2', '回答2 (Gemini)', 'gemini-3.5-flash');

    setTurnPromotionCandidatesForTest('turn-1', [
      {
        type: 'decision',
        title: '決定候補A',
        summary: '要約A',
        citations: [],
      },
    ]);
    setTurnPromotionCandidatesForTest('turn-2', [
      {
        type: 'action',
        title: 'アクション候補B',
        summary: '要約B',
        citations: [],
      },
    ]);

    const client = new ConversationClient();
    await Promise.all([
      client.save(turn1, 'chat-seeds', 'bundle-1'),
      client.save(turn2, 'chat-harvest', 'bundle-1'),
    ]);

    const seedsLog = readConversationLog(store.get('chat-seeds')?.meta.metadata?.thinkConversations);
    const harvestLog = readConversationLog(store.get('chat-harvest')?.meta.metadata?.thinkConversations);
    expect(seedsLog.turns.map((t) => t.id)).toEqual(['turn-1']);
    expect(harvestLog.turns.map((t) => t.id)).toEqual(['turn-2']);

    const bundleOps = extractOperationsState(store.get('bundle-1')?.meta.metadata);
    expect(bundleOps.promotionCandidates.map((c) => c.title).sort()).toEqual([
      'アクション候補B',
      '決定候補A',
    ]);
  });

  it('retries automatically on cross-client StorageConflictError and merges turns without losing data', async () => {
    const existingTurn = makeTurn('turn-existing', 'chat-1', '別端末の質問', '別端末の回答', 'gpt-5.6');
    let serverRecord = {
      meta: {
        thinkid: 'chat-1',
        category: 'chat',
        title: 'ASK:Thinktank｜相談',
        keywords: '',
        relatedIds: '',
        sizeBytes: 20,
        isDeleted: false,
        createdAt: '2026-10-22T00:00:00.000Z',
        updatedAt: '2026-10-22T00:00:01.000Z',
        metadata: {},
      } as ThinkMeta,
      body: '',
    };

    let getCount = 0;
    vi.spyOn(StorageManager.instance, 'getRecord').mockImplementation(async () => {
      getCount += 1;
      return structuredClone(serverRecord);
    });

    let saveAttempts = 0;
    vi.spyOn(StorageManager.instance, 'save').mockImplementation(async (payload: SavePayload) => {
      saveAttempts += 1;
      if (saveAttempts === 1) {
        // 1回目の保存の瞬間に別端末（例：Web版）が先に更新していたケースを再現する
        serverRecord = {
          meta: {
            ...serverRecord.meta,
            updatedAt: '2026-10-22T00:00:02.000Z',
            metadata: {
              thinkConversations: {
                schemaVersion: 1,
                turns: [existingTurn],
              },
            },
          },
          body: 'You: 別端末の質問\nAI: 別端末の回答',
        };
        throw new StorageConflictError('chat-1', serverRecord.meta.updatedAt);
      }

      const nextMeta: ThinkMeta = {
        ...serverRecord.meta,
        updatedAt: '2026-10-22T00:00:03.000Z',
        metadata: structuredClone(payload.metadata ?? {}),
      };
      serverRecord = { meta: nextMeta, body: payload.fullContent };
      return structuredClone(nextMeta);
    });

    const newTurn = makeTurn('turn-new', 'chat-1', 'PC版の質問', 'PC版の回答', 'claude-sonnet-5');
    const client = new ConversationClient();
    await client.save(newTurn, 'chat-1');

    expect(saveAttempts).toBe(2);
    expect(getCount).toBe(2);
    const finalLog = readConversationLog(serverRecord.meta.metadata?.thinkConversations);
    expect(finalLog.turns.map((t) => t.id)).toEqual(['turn-existing', 'turn-new']);
  });
});
