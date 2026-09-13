import type { AiProviderAvailability } from '../services/aiModels';

/** No discovery requests while the legacy AI runtime is disabled. */
export function useAiProviderAvailability(): AiProviderAvailability {
  return { anthropic: false, openai: false, gemini: false };
}
