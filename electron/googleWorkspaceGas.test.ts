import { expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isValidGasUrl, callGoogleWorkspaceGas, testGoogleWorkspaceGas } = require('./googleWorkspaceGas.cjs');
const { RecordingMcpHost, ThinktankMcpHost, startMcpBridgeServer, forwardJsonRpcOverPipe } = require('./mcpBridge.cjs');
const { handleMcpJsonRpcMessage } = require('./shared-dist/index.js');

const VALID_URL = 'https://script.google.com/macros/s/AKfycbxTestScriptId12345/exec';

it('MCP中継はGoogleツールの時間、回数、失敗数だけを集計する', async () => {
  const timing = { tools: {} };
  const host = { callGoogleWorkspace: vi.fn()
    .mockResolvedValueOnce({ threads: [{ subject: '非公開の件名' }] })
    .mockRejectedValueOnce(new Error('非公開のエラー')) };
  const bridge = await startMcpBridgeServer(host, timing);
  try {
    const name = 'thinktank_google_gmail_search';
    const params = { name, arguments: { query: '非公開の検索条件' } };
    await forwardJsonRpcOverPipe(bridge.pipePath, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    for (const id of [2, 3]) {
      await forwardJsonRpcOverPipe(bridge.pipePath, { jsonrpc: '2.0', id, method: 'tools/call', params });
    }
    expect(host.callGoogleWorkspace).toHaveBeenCalledTimes(2);
    expect(timing.tools).toEqual({ [name]: {
      count: 2, errors: 1, ms: expect.any(Number), maxMs: expect.any(Number),
    } });
    expect(JSON.stringify(timing)).not.toContain('非公開');
  } finally {
    await bridge.close();
  }
});

it('GAS URL の検証と接続テストを行う', async () => {
  expect(isValidGasUrl(VALID_URL)).toBe(true);
  expect(isValidGasUrl('https://example.com/exec')).toBe(false);

  const fetchImpl = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, capabilities: ['gmail.read', 'drive.write'] }),
  }));
  const res = await testGoogleWorkspaceGas({ url: VALID_URL, token: 'secret', fetchImpl });
  expect(res.ok).toBe(true);
  expect(res.message).toContain('gmail.read');
});

it('callGoogleWorkspaceGas が token と kind を POST で送り、エラーを分かりやすく返す', async () => {
  const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
    const parsed = JSON.parse(init.body);
    if (parsed.token !== 'good-token') {
      return { ok: true, json: async () => ({ ok: false, error: 'unauthorized' }) };
    }
    return { ok: true, json: async () => ({ ok: true, threads: [{ threadId: 'abc', subject: '確認' }] }) };
  });

  const okRes = await callGoogleWorkspaceGas({
    url: VALID_URL, token: 'good-token', kind: 'gmail_search', params: { query: 'is:unread' }, fetchImpl,
  });
  expect(okRes.threads).toHaveLength(1);

  await expect(callGoogleWorkspaceGas({
    url: VALID_URL, token: 'bad-token', kind: 'gmail_search', fetchImpl,
  })).rejects.toThrow(/合言葉/);
});

it('MCP の thinktank_google_* ツールが動作し、書き込み禁止ワーカーでは drive_write が拒否される', async () => {
  const fetchSpy = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ ok: true, echoedKind: body.kind, query: body.query, name: body.name }) };
  });
  vi.stubGlobal('fetch', fetchSpy);
  try {
    const fakeVault = { config: { workspaceGasUrl: VALID_URL, workspaceGasToken: 'tok' } };
    const base = new ThinktankMcpHost({ vaultEngine: fakeVault });

    const readerHost = new RecordingMcpHost(base, { writableIds: [] });
    const readRes = await handleMcpJsonRpcMessage({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'thinktank_google_gmail_search', arguments: { query: 'newer_than:1d' } },
    }, readerHost);
    expect(readRes.result.isError).toBeUndefined();
    expect(readRes.result.content[0].text).toContain('gmail_search');

    const deniedRes = await handleMcpJsonRpcMessage({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'thinktank_google_drive_write', arguments: { name: 'memo.md', content: '本文' } },
    }, readerHost);
    expect(deniedRes.result.isError).toBe(true);
    expect(deniedRes.result.content[0].text).toContain('PERMISSION_DENIED');

    const leadHost = new RecordingMcpHost(base, { writableIds: ['2026-11-23-000001'] });
    const writeRes = await handleMcpJsonRpcMessage({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'thinktank_google_drive_write', arguments: { name: 'memo.md', content: '本文' } },
    }, leadHost);
    expect(writeRes.result.isError).toBeUndefined();
    expect(writeRes.result.content[0].text).toContain('drive_write');
  } finally {
    vi.unstubAllGlobals();
  }
});
