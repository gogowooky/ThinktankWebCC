import { expect, it } from 'vitest';
import { collectGeminiParts, geminiFunctionResponse } from './geminiParts';

it('preserves signed model parts and call IDs while excluding thoughts from displayed text', () => {
  const call = { id: 'call-1', name: 'search_thinks', args: { keyword: 'test' } };
  const parts = [
    { thought: true, text: 'internal', thoughtSignature: 'signature-1' },
    { text: '検索します。' },
    { functionCall: call, thoughtSignature: 'signature-2' },
  ];
  const collected = collectGeminiParts(parts);
  expect(collected.text).toBe('検索します。');
  expect(collected.modelParts).toBe(parts);
  expect(collected.functionCalls).toEqual([call]);
  expect(geminiFunctionResponse(call, { result: [] })).toEqual({
    functionResponse: { id: 'call-1', name: 'search_thinks', response: { result: [] } },
  });
  expect(geminiFunctionResponse(call, { error: 'failed' }).functionResponse.id).toBe('call-1');
});

it('handles empty parts and responses without a call ID', () => {
  expect(collectGeminiParts([])).toEqual({ modelParts: [], text: '', functionCalls: [] });
  expect(geminiFunctionResponse({ name: 'test', args: {} }, { result: 'ok' })).toEqual({
    functionResponse: { name: 'test', response: { result: 'ok' } },
  });
});
