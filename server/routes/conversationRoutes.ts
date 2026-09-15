import { Router } from 'express';
import { bigqueryService } from '../services/BigQueryService.js';
import type { BigQueryService } from '../services/BigQueryService.js';
import { configuredProvider, type AIProvider } from '../services/AIProvider.js';
import { ConversationService, verifyContextHashes } from '../services/ConversationService.js';
import { id, text, object, validateContext, validateTurn, readConversationLog, MAX_LOG_BYTES, canonicalJson } from '../services/conversationRecord.js';

type Store = Pick<BigQueryService, 'getRecord' | 'saveThinkSupport' | 'saveChatConversation'>;
class RouteError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export function createConversationRoutes(provider: AIProvider = configuredProvider(), store: Store = bigqueryService) {
  const router = Router();
  const service = new ConversationService(provider);
  const running = new Set<string>();
  async function read(bundleId: string) {
    const result = await store.getRecord(bundleId);
    if (!result.success) throw new RouteError(503, '会話の保存先に接続できません。');
    const r = result.data;
    if (!r || r.category !== 'bundle' || r.is_deleted) throw new RouteError(404, '保存済みのBundleがありません。');
    const metadata: unknown = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata ?? {};
    if (!object(metadata)) throw new RouteError(422, 'Bundleの保存形式が不正です。');
    const log = readConversationLog(metadata.thinkConversations);
    if (log.turns.some(t => t.context.bundleId !== bundleId)) throw new RouteError(422, '履歴の対象Bundleが一致しません。');
    const version = typeof r.updated_at === 'object' && r.updated_at !== null && 'value' in r.updated_at ? String(r.updated_at.value) : String(r.updated_at);
    if (!Number.isFinite(Date.parse(version))) throw new RouteError(422, '保存版を確認できません。');
    return { metadata, log, version };
  }
  async function readChat(chatId: string, bundleId?: string) {
    const [chatResult, bundleResult] = await Promise.all([store.getRecord(chatId), bundleId ? store.getRecord(bundleId) : Promise.resolve(undefined)]);
    if (!chatResult.success || (bundleResult && !bundleResult.success)) throw new RouteError(503, '会話の保存先に接続できません。');
    const chat = chatResult.data, bundle = bundleResult?.data;
    if (!chat || chat.category !== 'chat' || chat.is_deleted) throw new RouteError(404, '保存先のChatファイルがありません。');
    if (bundleId && (!bundle || bundle.category !== 'bundle' || bundle.is_deleted)) throw new RouteError(404, '相談対象のBundleがありません。');
    const metadata: unknown = typeof chat.metadata === 'string' ? JSON.parse(chat.metadata) : chat.metadata ?? {};
    if (!object(metadata)) throw new RouteError(422, 'Chatファイルの保存形式が不正です。');
    const log = readConversationLog(metadata.thinkConversations);
    const version = typeof chat.updated_at === 'object' && chat.updated_at !== null && 'value' in chat.updated_at ? String(chat.updated_at.value) : String(chat.updated_at);
    if (!Number.isFinite(Date.parse(version))) throw new RouteError(422, '保存版を確認できません。');
    return { metadata, log, version };
  }
  router.get('/status', (_req, res) => { res.json({ enabled: provider.name !== 'none', provider: provider.name, model: provider.model }); });
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
      const { log } = await readChat(chatId, bundleId); res.json(log);
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '履歴を取得できません。' }); }
  });
  router.get('/chats/:chatId', async (req, res) => {
    try {
      const chatId = String(req.params.chatId);
      if (!id(chatId)) throw new RouteError(400, 'Chat IDが不正です。');
      const { log } = await readChat(chatId); res.json(log);
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
      const { requestId, question, context, confirmed, historyIds, chatId } = req.body ?? {};
      if (!id(requestId) || !text(question, 4000) || confirmed !== true || !Array.isArray(historyIds)
        || historyIds.length > 6 || !historyIds.every(id) || (chatId !== undefined && !id(chatId))) throw new RouteError(400, '質問と送信範囲の確認が必要です。');
      validateContext(context); verifyContextHashes(context);
      key = chatId || context.bundleId;
      if (running.has(key)) { key = ''; throw new RouteError(409, 'このBundleは応答を生成中です。'); }
      running.add(key);
      const { log } = chatId ? await readChat(chatId, context.scope === 'bundle-only' ? context.bundleId : undefined) : await read(context.bundleId);
      if (log.turns.length >= 100 || Buffer.byteLength(JSON.stringify(log)) >= MAX_LOG_BYTES) throw new RouteError(409, '履歴の保存上限です。別のBundleで続けてください。');
      const saved = log.turns.find(t => t.id === requestId);
      if (saved) {
        if (saved.question !== question || canonicalJson(saved.context) !== canonicalJson(context)) throw new RouteError(409, '会話IDが別の入力で使われています。');
        res.json(saved); return;
      }
      const history = log.turns.filter(t => t.context.vaultId === context.vaultId).slice(-6);
      if (JSON.stringify(history.map(t => t.id)) !== JSON.stringify(historyIds)) throw new RouteError(409, '会話履歴が更新されています。送信範囲を再確認してください。');
      const turn = await service.answer(requestId, question, context, history, controller.signal);
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
      const { metadata, log, version } = await read(bundleId);
      const existing = log.turns.find(t => t.id === turnId);
      if (existing) {
        if (canonicalJson(existing) !== canonicalJson(turn)) throw new RouteError(409, '同じ会話IDの保存内容が異なります。');
        res.json({ saved: true }); return;
      }
      const next = { schemaVersion: 1, turns: [...log.turns, turn] };
      if (next.turns.length > 100 || Buffer.byteLength(JSON.stringify(next)) > MAX_LOG_BYTES) throw new RouteError(409, '履歴の保存上限です。回答をJSONで書き出してください。');
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
      const result = await store.saveThinkSupport(bundleId, version, { ...metadata, thinkConversations: next }, updatedAt);
      if (!result.success) throw new RouteError(503, '保存を確認できません。保存だけ再試行してください。');
      if (!result.data) throw new RouteError(409, '別の更新と競合しました。保存だけ再試行してください。');
      res.json({ saved: true });
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '保存できません。' }); }
  });
  router.put('/chats/:chatId/bundles/:bundleId/turns/:turnId', async (req, res) => {
    try {
      const chatId = String(req.params.chatId), bundleId = String(req.params.bundleId), turnId = String(req.params.turnId);
      if (!id(chatId) || !id(bundleId) || !id(turnId)) throw new RouteError(400, '保存対象が不正です。');
      const turn: unknown = req.body; validateTurn(turn); verifyContextHashes(turn.context);
      if (turn.id !== turnId || turn.context.bundleId !== bundleId) throw new RouteError(400, '会話の保存対象が一致しません。');
      const { metadata, log, version } = await readChat(chatId, bundleId);
      const existing = log.turns.find(t => t.id === turnId);
      if (existing) {
        if (canonicalJson(existing) !== canonicalJson(turn)) throw new RouteError(409, '同じ会話IDの保存内容が異なります。');
        res.json({ saved: true }); return;
      }
      const next = { schemaVersion: 1, turns: [...log.turns, turn] };
      if (next.turns.length > 100 || Buffer.byteLength(JSON.stringify(next)) > MAX_LOG_BYTES) throw new RouteError(409, '履歴の保存上限です。回答をJSONで書き出してください。');
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
      const result = await store.saveChatConversation(chatId, version, { ...metadata, thinkConversations: next }, updatedAt);
      if (!result.success) throw new RouteError(503, '保存を確認できません。保存だけ再試行してください。');
      if (!result.data) throw new RouteError(409, '別の更新と競合しました。保存だけ再試行してください。');
      res.json({ saved: true });
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '保存できません。' }); }
  });
  router.put('/chats/:chatId/turns/:turnId', async (req, res) => {
    try {
      const chatId = String(req.params.chatId), turnId = String(req.params.turnId);
      if (!id(chatId) || !id(turnId)) throw new RouteError(400, '保存対象が不正です。');
      const turn: unknown = req.body; validateTurn(turn); verifyContextHashes(turn.context);
      if (turn.id !== turnId || turn.context.scope !== 'chat-only' || turn.context.bundleId !== chatId) throw new RouteError(400, '会話の保存対象が一致しません。');
      const { metadata, log, version } = await readChat(chatId);
      const existing = log.turns.find(t => t.id === turnId);
      if (existing) {
        if (canonicalJson(existing) !== canonicalJson(turn)) throw new RouteError(409, '同じ会話IDの保存内容が異なります。');
        res.json({ saved: true }); return;
      }
      const next = { schemaVersion: 1, turns: [...log.turns, turn] };
      if (next.turns.length > 100 || Buffer.byteLength(JSON.stringify(next)) > MAX_LOG_BYTES) throw new RouteError(409, '履歴の保存上限です。回答をJSONで書き出してください。');
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
      const result = await store.saveChatConversation(chatId, version, { ...metadata, thinkConversations: next }, updatedAt);
      if (!result.success) throw new RouteError(503, '保存を確認できません。保存だけ再試行してください。');
      if (!result.data) throw new RouteError(409, '別の更新と競合しました。保存だけ再試行してください。');
      res.json({ saved: true });
    } catch (e) { res.status(e instanceof RouteError ? e.status : 422).json({ error: e instanceof Error ? e.message : '保存できません。' }); }
  });
  return router;
}
