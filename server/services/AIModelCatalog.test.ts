import { describe, expect, it, vi } from 'vitest';
import { AIModelCatalog, latestClaudeModels, latestGeminiModels, latestOpenAIModels } from './AIModelCatalog';

describe('latest major models', () => {
  it('Claude: newest version per tier, preferring the undated alias', () => {
    expect(latestClaudeModels([
      { id: 'claude-opus-4-1-20250805' }, { id: 'claude-opus-5' }, { id: 'claude-opus-5-20260601' },
      { id: 'claude-sonnet-4-5-20250929' }, { id: 'claude-sonnet-5' },
      { id: 'claude-haiku-4-5-20251001' }, { id: 'claude-3-5-haiku-20241022' },
    ])).toEqual(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']);
  });

  it('OpenAI: newest gpt-N with its one-word variants, ignoring dated and special-purpose ones', () => {
    // 実際の一覧（2026-10）: 最新の大版 6 は名前付きの系統だけで、6.1 は sol だけが出ている
    expect(latestOpenAIModels([
      'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.5-2026-04-23', 'gpt-5.3-codex', 'gpt-5.3-chat-latest', 'gpt-5.6-sol',
      'gpt-6-astra', 'gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'o3', 'text-embedding-3-large',
    ])).toEqual(['gpt-6-astra', 'gpt-6-luna', 'gpt-6.1-sol']);
    expect(latestOpenAIModels(['gpt-5.4-pro', 'gpt-5.4-nano', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-codex', 'gpt-5.4-audio']))
      .toEqual(['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4-pro']);
  });

  it('Gemini: newest stable model per tier that supports generateContent', () => {
    const gen = ['generateContent'];
    expect(latestGeminiModels([
      { name: 'models/gemini-3.6-flash', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.5-pro', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.7-pro-preview', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: gen },
      { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
    ])).toEqual(['gemini-3.6-flash', 'gemini-3.5-pro', 'gemini-3.5-flash-lite']);
  });
});

describe('AIModelCatalog', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('lists only providers with an API key and caches the result', async () => {
    const request = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('generativelanguage')) return ok({ models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }] });
      return ok({ data: [{ id: 'gpt-5.6' }] });
    });
    const catalog = new AIModelCatalog({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' }, request as unknown as typeof fetch);
    expect(await catalog.get()).toEqual({ anthropic: [], openai: ['gpt-5.6'], gemini: ['gemini-3.6-flash'] });
    expect(await catalog.allows('gemini', 'gemini-3.6-flash')).toBe(true);
    expect(await catalog.allows('gemini', 'gemini-2.0-flash')).toBe(false);
    expect(await catalog.allows('anthropic', 'claude-opus-5')).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('returns an empty list for a provider whose list call fails the first time', async () => {
    const request = vi.fn(async () => new Response('no', { status: 500 }));
    const catalog = new AIModelCatalog({ GEMINI_API_KEY: 'g' }, request as unknown as typeof fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await catalog.get()).gemini).toEqual([]);
  });
});
