import { canonicalJson, MAX_LOG_BYTES, type ConversationLog, type ConversationTurn } from '../contracts/conversationRecord.js';
import { nextRecordVersion, type RecordError } from './BundleRepository.js';

interface ConversationState { metadata: Record<string, unknown>; log: ConversationLog; version: string }
type SaveResult = { success: true; data: boolean } | { success: false; error: string };

/** 同じ回答の保存再試行で、再生成や履歴の重複追加を起こさない。 */
export async function appendConversationTurn(
  state: ConversationState,
  turn: ConversationTurn,
  persist: (metadata: Record<string, unknown>, log: ConversationLog, updatedAt: string) => Promise<SaveResult>,
  ErrorType: RecordError,
): Promise<void> {
  const existing = state.log.turns.find(saved => saved.id === turn.id);
  if (existing) {
    if (canonicalJson(existing) !== canonicalJson(turn)) throw new ErrorType(409, '同じ会話IDの保存内容が異なります。');
    return;
  }
  const next: ConversationLog = { schemaVersion: 1, turns: [...state.log.turns, turn] };
  if (next.turns.length > 100 || Buffer.byteLength(JSON.stringify(next)) > MAX_LOG_BYTES) {
    throw new ErrorType(409, '履歴の保存上限です。回答をJSONで書き出してください。');
  }
  const updatedAt = nextRecordVersion(state.version);
  const result = await persist({ ...state.metadata, thinkConversations: next }, next, updatedAt);
  if (!result.success) throw new ErrorType(503, '保存を確認できません。保存だけ再試行してください。');
  if (!result.data) throw new ErrorType(409, '別の更新と競合しました。保存だけ再試行してください。');
}
