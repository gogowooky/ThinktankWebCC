/**
 * aiModels.ts
 * クライアントから指定されるモデルの許可リスト（サーバー側）。
 *
 * クライアント側の一覧は src/services/aiModels.ts に同内容がある。
 * ここでの役割は「クライアントが任意の文字列を送ってきても許可リスト外なら拒否する」
 * ことであり、表示用の label 等は持たない。選択肢を変更する場合は両方を更新すること。
 */

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface AiModelSelection {
  provider: AiProvider;
  model:    string;
}

const ALLOWED_MODELS: AiModelSelection[] = [
  { provider: 'anthropic', model: 'claude-opus-5' },
  { provider: 'anthropic', model: 'claude-sonnet-5' },
  { provider: 'anthropic', model: 'claude-opus-4-8' },
  { provider: 'anthropic', model: 'claude-haiku-4-5' },
  { provider: 'openai',    model: 'gpt-5.6' },
  { provider: 'gemini',    model: 'gemini-2.5-flash' },
  { provider: 'gemini',    model: 'gemini-2.5-pro' },
  { provider: 'gemini',    model: 'gemini-2.0-flash' },
];

export function isAllowedAiModel(provider: unknown, model: unknown): provider is AiProvider {
  if (typeof provider !== 'string' || typeof model !== 'string') return false;
  return ALLOWED_MODELS.some(m => m.provider === provider && m.model === model);
}
