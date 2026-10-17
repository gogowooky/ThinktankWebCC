import { Router } from 'express';
import { decodeMetadata } from '../services/metadataCodec.js';
import { BundleRepository, nextRecordVersion, storedVersion } from '../services/BundleRepository.js';
import { appendConversationTurn } from '../services/conversationPersistence.js';
import type { ConversationTurn } from '../contracts/conversationRecord.js';
import { unavailableVaultStore } from '../services/vaultStore.js';
import type { VaultStore } from '../services/vaultStore.js';
import { configuredProvider, providerFor, type AIProvider } from '../services/AIProvider.js';
import { aiModelCatalog, type ModelCatalog } from '../services/AIModelCatalog.js';
import { ConversationService, verifyContextHashes } from '../services/ConversationService.js';
import { id, text, object, validateContext, validateTurn, readConversationLog, legacyConversationTurns, mergeConversationTranscript, MAX_LOG_BYTES, canonicalJson } from '../services/conversationRecord.js';

type Store = Pick<VaultStore, 'getRecord' | 'saveThinkSupport' | 'saveChatConversation'>;
class RouteError extends Error { constructor(readonly status: number, message: string) { super(message); } }
/** 画面が指定したモデルの扱い。テストでは一覧取得と相手の生成を差し替える */
export interface ModelResolver {
  catalog(): Promise<ModelCatalog>;
  /** 一覧に載っていて API キーもあるモデルなら会話の相手を返す。それ以外は null */
  resolve(provider: string, model: string): Promise<AIProvider | null>;
}
const defaultResolver: ModelResolver = {
  catalog: () => aiModelCatalog.get(),
  async resolve(provider, model) {
    if (!await aiModelCatalog.allows(provider, model)) return null;
    return providerFor(provider as 'anthropic' | 'openai' | 'gemini', model);
  },
};
export function createConversationRoutes(provider: AIProvider = configuredProvider(), store: Store = unavailableVaultStore, models: ModelResolver = defaultResolver) {
  const router = Router();
  const service = new ConversationService(provider);
  const running = new Set<string>();
  const bundles = new BundleRepository(store, RouteError, {
    unavailable: '会話の保存先に接続できません。', missing: '保存済みのBundleがありません。', metadata: 'Bundleの保存形式が不正です。',
  });
  async function read(bundleId: string) {
    const { metadata, version } = await bundles.read(bundleId);
    const log = readConversationLog(metadata.thinkConversations);
    if (log.turns.some(t => t.context.bundleId !== bundleId)) throw new RouteError(422, '履歴の対象Bundleが一致しません。');
    return { metadata, log, version };
  }
  async function readChat(chatId: string, bundleId?: string, requestedVaultId?: string, syncText = false) {
    const [chatResult, bundleResult] = await Promise.all([store.getRecord(chatId), bundleId ? store.getRecord(bundleId) : Promise.resolve(undefined)]);
    if (!chatResult.success || (bundleResult && !bundleResult.success)) throw new RouteError(503, '会話の保存先に接続できません。');
    const chat = chatResult.data, bundle = bundleResult?.data;
    if (!chat || chat.category !== 'chat' || chat.is_deleted) throw new RouteError(404, '保存先のChatファイルがありません。');
    if (bundleId && (!bundle || bundle.category !== 'bundle' || bundle.is_deleted)) throw new RouteError(404, '相談対象のBundleがありません。');
    const parsedMetadata: unknown = decodeMetadata(chat.metadata) ?? {};
    if (!object(parsedMetadata)) throw new RouteError(422, 'Chatファイルの保存形式が不正です。');
    let metadata = parsedMetadata;
    const stored = readConversationLog(metadata.thinkConversations);
    let version = storedVersion(chat.updated_at);
    if (!Number.isFinite(Date.parse(version))) throw new RouteError(422, '保存版を確認できません。');
    const vaultId = requestedVaultId || stored.turns[0]?.context.vaultId;
    const recovered = vaultId ? legacyConversationTurns(chat.content ?? '', vaultId, chatId, version) : [];
    const storedIds = new Set(stored.turns.map(turn => turn.id));
    const missing = recovered.filter(turn => !storedIds.has(turn.id));
    const log = { schemaVersion: 1 as const, turns: [...missing, ...stored.turns] };
    if (log.turns.length > 100) throw new RouteError(409, '履歴の保存上限です。別のChatで続けてください。');
    let content = chat.content ?? '';
    const synchronized = mergeConversationTranscript(content, log.turns);
    if (syncText && (synchronized !== content || missing.length > 0)) {
      const updatedAt = nextRecordVersion(version);
      const result = await store.saveChatConversation(chatId, version, { ...metadata, thinkConversations: log }, synchronized, updatedAt);
      if (result.success && result.data) { content = synchronized; version = updatedAt; metadata = { ...metadata, thinkConversations: log }; }
    }
    return { metadata, log, version, content, savedChat: { id: chatId, title: chat.title ?? '', content, metadata,
      updatedAt: version, keywords: chat.keywords ?? '', relatedIds: chat.related_ids ?? '' } };
  }
  async function saveChatTurn(chatId: string, bundleId: string | undefined, turn: ConversationTurn) {
    const state = await readChat(chatId, bundleId, turn.context.vaultId);
    await appendConversationTurn(state, turn, (metadata, log, updatedAt) =>
      store.saveChatConversation(chatId, state.version, metadata, mergeConversationTranscript(state.content, log.turns), updatedAt), RouteError);
  }
  router.get('/status', (_req, res) => { res.json({ enabled: provider.name !== 'none', provider: provider.name, model: provider.model }); });
  // 画面が Status AIChat.ModelNames.* に設定する「各社で今使える主要モデル」。AI対話が停止中なら空
  router.get('/models', async (_req, res) => {
    if (provider.name === 'none') { res.json({ anthropic: [], openai: [], gemini: [] }); return; }
    try { res.json(await models.catalog()); } catch { res.status(503).json({ error: 'モデル一覧を取得できません。' }); }
  });
  router.get('/bundles/:id', async (req, res) => {
    try {
      const bundleId = String(req.params.id);
      if (!id(bundleId)) throw new RouteError(400, 'Bundle IDが不正です。');
      const { log } = await read(bundleId); res.json(log);
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '履歴を取得できません。' }); }
  });
  router.get('/chats/:chatId/bundles/:bundleId', async (req, res) => {
    try {
      const chatId = String(req.params.chatId), bundleId = String(req.params.bundleId);
      if (!id(chatId) || !id(bundleId)) throw new RouteError(400, 'ChatまたはBundle IDが不正です。');
      const vaultId = typeof req.query.vaultId === 'string' && id(req.query.vaultId) ? req.query.vaultId : undefined;
      const { log, savedChat } = await readChat(chatId, bundleId, vaultId, true); res.json({ ...log, savedChat });
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '履歴を取得できません。' }); }
  });
  router.get('/chats/:chatId', async (req, res) => {
    try {
      const chatId = String(req.params.chatId);
      if (!id(chatId)) throw new RouteError(400, 'Chat IDが不正です。');
      const vaultId = typeof req.query.vaultId === 'string' && id(req.query.vaultId) ? req.query.vaultId : undefined;
      const { log, savedChat } = await readChat(chatId, undefined, vaultId, true); res.json({ ...log, savedChat });
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '履歴を取得できません。' }); }
  });
  router.post('/turns', async (req, res) => {
    if (provider.name === 'none') { res.status(503).json({ error: 'AI対話は停止中です。' }); return; }
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    const timeout = setTimeout(() => controller.abort(), 120000);
    let key = '';
    try {
      const { requestId, question, context, confirmed, historyIds, chatId, provider: requestedProvider, model: requestedModel } = req.body ?? {};
      if (!id(requestId) || !text(question, 4000) || confirmed !== true || !Array.isArray(historyIds)
        || historyIds.length > 6 || !historyIds.every(id) || (chatId !== undefined && !id(chatId))) throw new RouteError(400, '質問と送信範囲の確認が必要です。');
      validateContext(context); verifyContextHashes(context);
      // モデル未指定なら従来どおりサーバー既定。指定されたら一覧（許可リスト）にあるものだけ受け付ける
      let target = provider;
      if (requestedProvider !== undefined || requestedModel !== undefined) {
        const resolved = typeof requestedProvider === 'string' && typeof requestedModel === 'string'
          ? await models.resolve(requestedProvider, requestedModel) : null;
        if (!resolved) throw new RouteError(400, `指定のAIモデル（${String(requestedProvider)} / ${String(requestedModel)}）は使えません。`);
        target = resolved;
      }
      key = chatId || context.bundleId;
      if (running.has(key)) { key = ''; throw new RouteError(409, 'このBundleは応答を生成中です。'); }
      running.add(key);
      const { log } = chatId ? await readChat(chatId, context.scope === 'bundle-only' ? context.bundleId : undefined, context.vaultId) : await read(context.bundleId);
      if (log.turns.length >= 100 || Buffer.byteLength(JSON.stringify(log)) >= MAX_LOG_BYTES) throw new RouteError(409, '履歴の保存上限です。別のBundleで続けてください。');
      const saved = log.turns.find(t => t.id === requestId);
      if (saved) {
        if (saved.question !== question || canonicalJson(saved.context) !== canonicalJson(context)) throw new RouteError(409, '会話IDが別の入力で使われています。');
        res.json(saved); return;
      }
      const history = log.turns.filter(t => t.context.vaultId === context.vaultId).slice(-6);
      if (JSON.stringify(history.map(t => t.id)) !== JSON.stringify(historyIds)) throw new RouteError(409, '会話履歴が更新されています。送信範囲を再確認してください。');
      const turn = await service.answer(requestId, question, context, history, controller.signal, target);
      if (!controller.signal.aborted) res.json(turn);
    } catch (e) {
      if (!res.destroyed) res.status(controller.signal.aborted ? 504 : e instanceof RouteError ? e.status : 422)
        .json({ error: controller.signal.aborted ? '応答を中断しました。' : e instanceof Error ? e.message : '応答を生成できません。' });
    } finally { clearTimeout(timeout); res.off('close', disconnect); if (key) running.delete(key); }
  });
  // Persistence is separate so a transient save failure never requires another model call.
  router.put('/bundles/:id/turns/:turnId', async (req, res) => {
    try {
      const bundleId = String(req.params.id), turnId = String(req.params.turnId);
      if (!id(bundleId) || !id(turnId)) throw new RouteError(400, '保存対象が不正です。');
      const turn: unknown = req.body; validateTurn(turn); verifyContextHashes(turn.context);
      if (turn.id !== turnId || turn.context.bundleId !== bundleId) throw new RouteError(400, '会話の保存対象が一致しません。');
      const state = await read(bundleId);
      await appendConversationTurn(state, turn, (metadata, _log, updatedAt) =>
        bundles.save(bundleId, state.version, metadata, updatedAt), RouteError);
      res.json({ saved: true });
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '保存できません。' }); }
  });
  router.put('/chats/:chatId/bundles/:bundleId/turns/:turnId', async (req, res) => {
    try {
      const chatId = String(req.params.chatId), bundleId = String(req.params.bundleId), turnId = String(req.params.turnId);
      if (!id(chatId) || !id(bundleId) || !id(turnId)) throw new RouteError(400, '保存対象が不正です。');
      const turn: unknown = req.body; validateTurn(turn); verifyContextHashes(turn.context);
      if (turn.id !== turnId || turn.context.bundleId !== bundleId) throw new RouteError(400, '会話の保存対象が一致しません。');
      await saveChatTurn(chatId, bundleId, turn);
      res.json({ saved: true });
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '保存できません。' }); }
  });
  router.put('/chats/:chatId/turns/:turnId', async (req, res) => {
    try {
      const chatId = String(req.params.chatId), turnId = String(req.params.turnId);
      if (!id(chatId) || !id(turnId)) throw new RouteError(400, '保存対象が不正です。');
      const turn: unknown = req.body; validateTurn(turn); verifyContextHashes(turn.context);
      if (turn.id !== turnId || turn.context.scope !== 'chat-only' || turn.context.bundleId !== chatId) throw new RouteError(400, '会話の保存対象が一致しません。');
      await saveChatTurn(chatId, undefined, turn);
      res.json({ saved: true });
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '保存できません。' }); }
  });
  return router;
}
