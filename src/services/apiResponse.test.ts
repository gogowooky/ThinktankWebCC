import { expect, it } from 'vitest';
import { readApiJson } from './apiResponse';

it('returns successful JSON for the caller to validate', async () => {
  await expect(readApiJson(new Response(JSON.stringify({ bundleId: 'other', version: 2 })))).resolves.toEqual({ bundleId: 'other', version: 2 });
});

it('preserves server errors and the caller-specific recovery message for non-JSON HTTP failures', async () => {
  await expect(readApiJson(new Response(JSON.stringify({ error: '保存競合です。' }), { status: 409 }), '再取得してください。')).rejects.toThrow('保存競合です。');
  for (const body of ['', '<html>Bad Gateway</html>', '{"error":42}']) {
    await expect(readApiJson(new Response(body, { status: 502 }), '入力を保持して再試行してください。')).rejects.toThrow('入力を保持して再試行してください。');
  }
});

it('keeps fixed client messages when a service handles its own recovery', async () => {
  await expect(readApiJson(new Response('{"error":"internal detail"}', { status: 500 }), '保存を確認できません。', { useServerError: false })).rejects.toThrow('保存を確認できません。');
});

it('rejects malformed successful JSON instead of returning an empty success', async () => {
  await expect(readApiJson(new Response('not-json'))).rejects.toBeInstanceOf(SyntaxError);
});
