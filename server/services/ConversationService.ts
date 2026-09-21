import { createHash } from 'node:crypto';
import type { AIProvider } from './AIProvider.js';
import { object, text, validateContext, validateTurn, validateProgressProposals, type ConversationContext, type ConversationTurn, type Citation, type Proposal } from './conversationRecord.js';
import { THINK_FIELDS, type ThinkField } from './thinkSupportRecord.js';

export function verifyContextHashes(context: ConversationContext): void {
  for (const source of context.sources) {
    if (createHash('sha256').update(source.content, 'utf8').digest('hex') !== source.contentHash) throw new Error('資料の本文ハッシュが一致しません。再取得してください。');
  }
}
export class ConversationService {
  constructor(private readonly provider: AIProvider) {}
  async answer(id: string, question: string, context: ConversationContext, history: ConversationTurn[], signal: AbortSignal): Promise<ConversationTurn> {
    if (this.provider.name === 'none') throw new Error('AI対話は停止中です。');
    validateContext(context); verifyContextHashes(context);
    signal.throwIfAborted();
    const raw = context.sources.length || context.scope === 'chat-only' ? await this.provider.generate({ question, context,
      history: history.slice(-6).map(t => ({ question: t.question, reply: t.answer.reply })),
    }, signal) : { reply: '参照できる資料がありません。Bundleに資料を追加して再取得してください。', insufficientEvidence: true, citations: [], proposals: [] };
    signal.throwIfAborted();
    if (!object(raw) || !text(raw.reply, 20000) || typeof raw.insufficientEvidence !== 'boolean'
      || !Array.isArray(raw.citations) || raw.citations.length > 30 || !Array.isArray(raw.proposals) || raw.proposals.length > 7) throw new Error('AI応答の形式が不正です。');
    const citations: Citation[] = raw.citations.map(c => {
      if (!object(c) || !text(c.quote, 2000)) throw new Error('AIの引用形式が不正です。');
      const source = context.sources.find(s => s.thinkId === c.thinkId);
      const start = source?.content.indexOf(c.quote) ?? -1;
      if (!source || start < 0) throw new Error('AIの引用が資料本文と一致しません。回答は保存していません。');
      return { thinkId: source.thinkId, quote: c.quote, contentHash: source.contentHash, start, end: start + c.quote.length };
    });
    const proposals: Proposal[] = raw.proposals.map(p => {
      if (!object(p) || !THINK_FIELDS.includes(p.field as ThinkField) || !text(p.after, 10000) || !text(p.reason, 2000)) throw new Error('AIの変更提案が不正です。');
      const field = p.field as ThinkField;
      return { field, before: context.manualState?.values[field] ?? '', after: p.after, reason: p.reason };
    });
    validateProgressProposals(raw.progressProposals, question, context.scope);
    const turn: ConversationTurn = { schemaVersion: 1, id, createdAt: new Date().toISOString(), question, context,
      answer: { reply: raw.reply, insufficientEvidence: raw.insufficientEvidence || context.quality === 'partial', citations, proposals,
        ...(raw.progressProposals !== undefined ? { progressProposals: raw.progressProposals } : {}) },
      provider: this.provider.name, model: this.provider.model };
    validateTurn(turn);
    return turn;
  }
}
