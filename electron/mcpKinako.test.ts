import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { VaultEngine } = require('./vaultEngine.cjs');
const { ThinktankMcpHost } = require('./mcpBridge.cjs');
const { McpHttpServer, isAllowedBindAddress, classifyAddress, listSelectableAddresses } = require('./mcpHttpServer.cjs');
const { RelayAgent } = require('./relayAgent.cjs');
const shared = require('./shared-dist/index.js');

const PROJECT_A = '2026-10-20-100000';
const PROJECT_B = '2026-10-20-100002';
const MEMO = '2026-10-20-100001';

async function callTool(host: unknown, name: string, args: Record<string, unknown>) {
  const res = await shared.handleMcpJsonRpcMessage(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    host,
  );
  const text = res.result.content[0].text as string;
  return { isError: Boolean(res.result.isError), payload: JSON.parse(text) };
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolvePort(port));
    });
  });
}

describe('MCP interface for kinako (spec chapters 7, 8, 10)', () => {
  let tempRoot: string;
  let userDataDir: string;
  let vaultEngine: InstanceType<typeof VaultEngine>;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(join(tmpdir(), 'tt-kinako-test-'));
    userDataDir = join(tempRoot, 'userData');
    const vaultDir = join(tempRoot, 'vault_ver2');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(vaultDir, { recursive: true });
    vaultEngine = new VaultEngine({
      userDataDir,
      appRootDir: resolve(__dirname, '..'),
      defaultVaultDir: vaultDir,
      deviceIdPrefix: 'test',
      autoIndexRefresh: false,
    });
    for (const [id, title] of [
      [PROJECT_A, '治験プロジェクトA'],
      [PROJECT_B, '治験プロジェクトB'],
    ]) {
      vaultEngine.saveRecord({
        thinkid: id,
        category: 'project',
        title,
        body: ['=', '# 状態', '進行中', '# 対象'].join('\n'),
      });
    }
    vaultEngine.saveRecord({
      thinkid: MEMO,
      category: 'memo',
      title: '出荷規格メモ',
      body: '生細胞率85%以上。',
      relatedIds: PROJECT_A,
    });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('structured tool errors (7.2)', () => {
    it('keeps the Japanese message and adds a machine-readable code', async () => {
      const host = new ThinktankMcpHost({ vaultEngine });

      const invalid = await callTool(host, 'thinktank_get_record', { thinkid: '../etc' });
      expect(invalid.isError).toBe(true);
      expect(invalid.payload).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ID', retryable: false },
      });
      expect(invalid.payload.error.message).toContain('不正な thinkid');

      const missing = await callTool(host, 'thinktank_get_record', { thinkid: '2030-01-01-000000' });
      expect(missing.payload.error).toMatchObject({ code: 'NOT_FOUND', thinkid: '2030-01-01-000000' });

      const noVersion = await callTool(host, 'thinktank_update_think', { thinkid: MEMO, appendBody: 'x' });
      expect(noVersion.payload.error).toMatchObject({ code: 'INVALID_ARGUMENT', retryable: true });

      const both = await callTool(host, 'thinktank_update_think', {
        thinkid: MEMO,
        expectedVersion: 'v',
        body: 'a',
        appendBody: 'b',
      });
      expect(both.payload.error.code).toBe('INVALID_ARGUMENT');

      const unknown = await callTool(host, 'thinktank_delete_everything', {});
      expect(unknown.payload.error.code).toBe('UNKNOWN_TOOL');
    });

    it('distinguishes VERSION_CONFLICT from EDITING_IN_PROGRESS and never marks them retryable', async () => {
      const dirty = new Set<string>([MEMO]);
      const host = new ThinktankMcpHost({ vaultEngine, isThinkDirty: (id: string) => dirty.has(id) });
      const rec = vaultEngine.getRecord(MEMO);

      const editing = await callTool(host, 'thinktank_update_think', {
        thinkid: MEMO,
        expectedVersion: rec.updatedAt,
        appendBody: 'AI',
      });
      expect(editing.payload.error).toMatchObject({ code: 'EDITING_IN_PROGRESS', retryable: false, thinkid: MEMO });

      dirty.clear();
      const stale = await callTool(host, 'thinktank_update_think', {
        thinkid: MEMO,
        expectedVersion: '1999-01-01T00:00:00.000Z',
        appendBody: 'AI',
      });
      expect(stale.payload.error).toMatchObject({ code: 'VERSION_CONFLICT', retryable: false });
      // 競合した更新は本文に反映されていない
      expect(vaultEngine.getRecord(MEMO).body).not.toContain('AI');
    });
  });

  describe('truncated flag (P2)', () => {
    it('reports whether search / list_meta stopped at the limit', async () => {
      const host = new ThinktankMcpHost({ vaultEngine });
      for (let i = 0; i < 3; i++) {
        vaultEngine.saveRecord({ thinkid: `2026-10-21-10000${i}`, category: 'memo', title: `棚卸し${i}`, body: '棚卸し対象' });
      }

      const cut = await callTool(host, 'thinktank_search', { query: '棚卸し', limit: 2 });
      expect(cut.payload.count).toBe(2);
      expect(cut.payload.truncated).toBe(true);

      const exact = await callTool(host, 'thinktank_search', { query: '棚卸し', limit: 3 });
      expect(exact.payload.count).toBe(3);
      expect(exact.payload.truncated).toBe(false);

      const list = await callTool(host, 'thinktank_list_meta', { category: 'memo', limit: 1 });
      expect(list.payload.count).toBe(1);
      expect(list.payload.truncated).toBe(true);
    });
  });

  describe('batch candidates and projectIds (P3)', () => {
    const candidate = (title: string) => ({ type: 'risk', title, summary: `${title}の要旨` });

    it('registers several candidates as pending_review in one call', async () => {
      const host = new ThinktankMcpHost({ vaultEngine });
      const res = await callTool(host, 'thinktank_add_promotion_candidates', {
        projectId: PROJECT_A,
        candidates: [candidate('温度逸脱'), { ...candidate('出荷遅延'), citations: [{ sourceThinkid: MEMO }] }],
      });
      expect(res.isError).toBe(false);
      expect(res.payload).toMatchObject({
        ok: true,
        status: 'pending_review',
        requested: 2,
        registered: 2,
        totalPendingCandidates: 2,
      });
      expect(res.payload.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, true]);

      const ctx = await callTool(host, 'thinktank_get_project_context', { projectId: PROJECT_A });
      expect(ctx.payload.pendingCandidates).toHaveLength(2);
    });

    it('registers nothing when any candidate is invalid', async () => {
      const host = new ThinktankMcpHost({ vaultEngine });
      const res = await callTool(host, 'thinktank_add_promotion_candidates', {
        projectId: PROJECT_A,
        candidates: [candidate('有効'), { type: 'nonsense', title: 'x', summary: 'y' }],
      });
      expect(res.isError).toBe(true);
      expect(res.payload.error.code).toBe('INVALID_ARGUMENT');
      expect(res.payload.error.message).toContain('candidates[1]');
      const ctx = await callTool(host, 'thinktank_get_project_context', { projectId: PROJECT_A });
      expect(ctx.payload.pendingCandidates).toHaveLength(0);
    });

    it('rejects empty and oversized batches', async () => {
      const host = new ThinktankMcpHost({ vaultEngine });
      const empty = await callTool(host, 'thinktank_add_promotion_candidates', { projectId: PROJECT_A, candidates: [] });
      expect(empty.payload.error.code).toBe('INVALID_ARGUMENT');
      const many = await callTool(host, 'thinktank_add_promotion_candidates', {
        projectId: PROJECT_A,
        candidates: Array.from({ length: 21 }, (_, i) => candidate(`c${i}`)),
      });
      expect(many.payload.error.code).toBe('INVALID_ARGUMENT');
    });

    it('links a new Think to several projects at once and notifies each project', async () => {
      const events: Array<Record<string, unknown>> = [];
      const host = new ThinktankMcpHost({ vaultEngine, onRecordMutated: (e: Record<string, unknown>) => void events.push(e) });
      const res = await callTool(host, 'thinktank_create_think', {
        title: '共通リスク',
        body: '両プロジェクトに関係する。',
        projectIds: [PROJECT_A, PROJECT_B],
      });
      const id = res.payload.created.thinkid as string;
      expect(vaultEngine.getRecord(PROJECT_A).body).toContain(`:${id}]`);
      expect(vaultEngine.getRecord(PROJECT_B).body).toContain(`:${id}]`);
      expect(events).toEqual([
        { action: 'create', thinkid: id, projectId: PROJECT_A },
        { action: 'update', thinkid: PROJECT_B },
      ]);

      const bad = await callTool(host, 'thinktank_create_think', { title: 'x', projectIds: [PROJECT_A, '../x'] });
      expect(bad.payload.error.code).toBe('INVALID_ID');
    });
  });

  describe('HTTP transport (3.3)', () => {
    let http: InstanceType<typeof McpHttpServer>;
    let url: string;
    const deviceId = 'pc_test';

    const rpc = (body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
      fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      });

    beforeEach(async () => {
      http = new McpHttpServer({
        userDataDir,
        mcpHost: new ThinktankMcpHost({ vaultEngine }),
        getDeviceId: () => deviceId,
      });
      const port = await freePort();
      await http.configure({ port });
      url = `http://127.0.0.1:${port}/mcp`;
    });

    afterEach(async () => {
      await http.stop();
    });

    it('is off by default and never listens until enabled', async () => {
      const fresh = new McpHttpServer({ userDataDir: join(tempRoot, 'fresh'), mcpHost: {}, getDeviceId: () => deviceId });
      expect(fresh.getStatus()).toMatchObject({ enabled: false, listening: false });
      await fresh.start();
      expect(fresh.getStatus().listening).toBe(false);
    });

    it('requires a Bearer token and serves the same tools as stdio', async () => {
      await http.setEnabled(true);
      expect(http.getStatus().listening).toBe(true);

      const init = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
      expect((await rpc(init)).status).toBe(401);
      expect((await rpc(init, { Authorization: 'Bearer ttmcp_wrong' })).status).toBe(401);

      const { token } = http.createToken({ label: 'kinako' });
      const ok = await rpc(init, { Authorization: `Bearer ${token}` });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('x-thinktank-pc')).toBe(deviceId);
      const body = await ok.json();
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(
        shared.THINKTANK_MCP_TOOLS.map((t: { name: string }) => t.name),
      );

      // stdio 経由（ホスト直呼び）と同じ検索結果になる
      const viaHttp = await rpc(
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'thinktank_search', arguments: { query: '生細胞率' } } },
        { Authorization: `Bearer ${token}` },
      );
      const direct = await callTool(new ThinktankMcpHost({ vaultEngine }), 'thinktank_search', { query: '生細胞率' });
      expect(JSON.parse((await viaHttp.json()).result.content[0].text)).toEqual(direct.payload);
    });

    it('stores only a hash, and revoked or other-PC tokens are refused', async () => {
      await http.setEnabled(true);
      const { id, token } = http.createToken({});
      expect(fs.readFileSync(join(userDataDir, 'mcp-http-config.json'), 'utf8')).not.toContain(token);

      const auth = { Authorization: `Bearer ${token}` };
      const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
      expect((await rpc(ping, auth)).status).toBe(200);

      http.revokeToken(id);
      expect((await rpc(ping, auth)).status).toBe(401);

      const { token: tokenForTest } = http.createToken({});
      // 別PCとして同じ設定ファイルを読み直しても、このPC宛のトークンは通らない
      const other = new McpHttpServer({ userDataDir, mcpHost: {}, getDeviceId: () => 'pc_other' });
      expect(other.authenticate(`Bearer ${tokenForTest}`)).toMatchObject({ ok: false, status: 403 });
    });

    it('rejects foreign origins, GET, oversized and malformed input; notifications get 202', async () => {
      await http.setEnabled(true);
      const { token } = http.createToken({});
      const auth = { Authorization: `Bearer ${token}` };

      expect((await rpc({}, { ...auth, Origin: 'https://evil.example' })).status).toBe(403);
      expect((await rpc(undefined, auth, 'GET')).status).toBe(405);
      expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, auth)).status).toBe(202);

      const bad = await fetch(url, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{oops' });
      expect(bad.status).toBe(400);
      expect((await bad.json()).error.code).toBe(-32700);

      const notFound = await fetch(url.replace('/mcp', '/other'), { method: 'POST', headers: auth, body: '{}' });
      expect(notFound.status).toBe(404);
    });

    it('classifies addresses and lists only localhost and Tailscale as selectable', () => {
      expect(classifyAddress('127.0.0.1')).toBe('loopback');
      expect(classifyAddress('100.64.0.1')).toBe('tailscale');
      expect(classifyAddress('100.127.255.254')).toBe('tailscale');
      expect(classifyAddress('100.128.0.1')).toBe('other');
      expect(classifyAddress('192.168.0.5')).toBe('other');
      const picked = listSelectableAddresses({
        Ethernet: [{ address: '192.168.0.5', internal: false }],
        Tailscale: [{ address: '100.101.102.103', internal: false }, { address: 'fd7a:115c:a1e0::1', internal: false }],
        lo: [{ address: '127.0.0.1', internal: true }],
      });
      expect(picked.map((a: { address: string; kind: string }) => `${a.address}:${a.kind}`)).toEqual([
        '127.0.0.1:loopback',
        '100.101.102.103:tailscale',
        'fd7a:115c:a1e0::1:tailscale',
      ]);
    });

    it('reports the listening endpoint and address kind in its status', async () => {
      expect(http.getStatus()).toMatchObject({ listening: false, endpointUrl: '', bindKind: 'loopback' });
      await http.setEnabled(true);
      expect(http.getStatus()).toMatchObject({ listening: true, endpointUrl: url, bindKind: 'loopback' });
      expect(JSON.stringify(http.getStatus())).not.toMatch(/tokenHash|ttmcp_/);
    });

    it('reissue revokes every active token and returns one new token', async () => {
      await http.setEnabled(true);
      const first = http.createToken({ label: 'a' });
      const second = http.createToken({ label: 'b' });
      const reissued = http.reissueToken({ label: 'kinako' });
      const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
      expect((await rpc(ping, { Authorization: `Bearer ${first.token}` })).status).toBe(401);
      expect((await rpc(ping, { Authorization: `Bearer ${second.token}` })).status).toBe(401);
      expect((await rpc(ping, { Authorization: `Bearer ${reissued.token}` })).status).toBe(200);
      expect(http.getStatus().tokens.filter((t: { revokedAt: string }) => !t.revokedAt)).toHaveLength(1);
    });

    it('does not issue tokens in local mode', () => {
      const local = new McpHttpServer({ userDataDir: join(tempRoot, 'local2'), mcpHost: {}, getDeviceId: () => deviceId, isLocalMode: true });
      expect(() => local.createToken({})).toThrow('ローカル運用モード');
      expect(() => local.reissueToken({})).toThrow('ローカル運用モード');
      expect(local.getStatus().tokens).toEqual([]);
    });

    it('only binds to localhost or Tailscale addresses and never runs in local mode', async () => {
      expect(isAllowedBindAddress('127.0.0.1')).toBe(true);
      expect(isAllowedBindAddress('100.101.102.103')).toBe(true);
      expect(isAllowedBindAddress('fd7a:115c:a1e0::1')).toBe(true);
      expect(isAllowedBindAddress('0.0.0.0')).toBe(false);
      expect(isAllowedBindAddress('192.168.1.10')).toBe(false);
      await expect(http.configure({ bindAddress: '0.0.0.0' })).rejects.toThrow('Tailscale');

      const local = new McpHttpServer({ userDataDir: join(tempRoot, 'local'), mcpHost: {}, getDeviceId: () => deviceId, isLocalMode: true });
      await expect(local.setEnabled(true)).rejects.toThrow('ローカル運用モード');
      expect(local.getStatus().listening).toBe(false);
    });
  });

  describe('request envelope and queue (chapter 8)', () => {
    const envelope = (over: Record<string, unknown> = {}) => ({
      requestId: 'kinako-20261109-0001',
      targetPc: 'pc_test',
      mode: 'web',
      kind: 'promotion_candidates',
      projectId: PROJECT_A,
      instructions: '出荷規格メモからリスクを候補にしてください。',
      sourceThinkIds: [MEMO],
      createdAt: '2026-11-09T13:00:00.000Z',
      requestedBy: 'kinako',
      ...over,
    });

    it('validates the envelope and refuses unsafe input', () => {
      expect(shared.validateKinakoRequestEnvelope(envelope()).status).toBe('ok');
      const reject = (over: Record<string, unknown>) => shared.validateKinakoRequestEnvelope(envelope(over)).status;
      expect(reject({ requestId: 'a' })).toBe('error');
      expect(reject({ targetPc: '' })).toBe('error');
      expect(reject({ kind: 'delete_all' })).toBe('error');
      expect(reject({ mode: 'cloud' })).toBe('error');
      expect(reject({ requestedBy: 'human' })).toBe('error');
      expect(reject({ projectId: '../x' })).toBe('error');
      expect(reject({ sourceThinkIds: ['../x'] })).toBe('error');
      expect(reject({ kind: 'project_summary', projectId: undefined })).toBe('error');
      expect(reject({ createdAt: 'yesterday' })).toBe('error');
    });

    it('matches the target PC by device id or name, and maps relay status to the 5 states', () => {
      const self = { deviceId: 'pc_test', deviceName: '書斎PC' };
      expect(shared.matchesTargetPc('pc_test', self)).toBe(true);
      expect(shared.matchesTargetPc('書斎PC', self)).toBe(true);
      expect(shared.matchesTargetPc('pc_other', self)).toBe(false);
      expect(shared.matchesTargetPc('', self)).toBe(false);

      expect(shared.relayStatusToKinakoStatus('queued')).toBe('queued');
      expect(shared.relayStatusToKinakoStatus('running')).toBe('running');
      expect(shared.relayStatusToKinakoStatus('succeeded', { status: 'conflict' })).toBe('conflict');
      expect(shared.relayStatusToKinakoStatus('succeeded')).toBe('done');
      expect(shared.relayStatusToKinakoStatus('expired')).toBe('failed');
    });

    describe('RelayAgent.executeKinakoRequest', () => {
      type Params = { mcpHost: unknown };
      let agent: InstanceType<typeof RelayAgent>;
      let runAi: ReturnType<typeof vi.fn>;

      const makeAgent = (script: (params: Params) => Promise<unknown>) => {
        runAi = vi.fn(async (params: Params) => {
          await script(params);
          return { reply: '作業しました。' };
        });
        agent = new RelayAgent({ userDataDir, vaultEngine, aiCliRunner: { runDomainAiConversation: runAi, detectAvailableClis: () => ({}) } });
        agent.saveConfig({ deviceId: vaultEngine.config.deviceId, deviceName: '書斎PC' });
        agent.setMcpHost(new ThinktankMcpHost({ vaultEngine }));
      };
      const target = () => vaultEngine.config.deviceId as string;

      it('records what the AI actually did and returns done', async () => {
        makeAgent(async ({ mcpHost }) => {
          await callTool(mcpHost, 'thinktank_get_record', { thinkid: MEMO });
          await callTool(mcpHost, 'thinktank_add_promotion_candidate', { projectId: PROJECT_A, type: 'risk', title: 't', summary: 's' });
          await callTool(mcpHost, 'thinktank_create_think', { title: '日報', category: 'aiview', projectId: PROJECT_A });
        });
        const result = await agent.executeKinakoRequest(envelope({ targetPc: target() }));
        expect(result).toMatchObject({ status: 'done', usedSourceIds: [MEMO], conflicts: [], summary: '作業しました。' });
        expect(result.candidateIds).toHaveLength(1);
        expect(result.createdThinkIds).toHaveLength(1);
      });

      it('returns conflict with the target id and reason when a write is protected', async () => {
        makeAgent(async ({ mcpHost }) => {
          await callTool(mcpHost, 'thinktank_update_think', { thinkid: MEMO, expectedVersion: '1999-01-01T00:00:00.000Z', appendBody: 'x' });
        });
        const result = await agent.executeKinakoRequest(envelope({ targetPc: target() }));
        expect(result.status).toBe('conflict');
        expect(result.conflicts).toEqual([expect.objectContaining({ thinkid: MEMO, code: 'VERSION_CONFLICT' })]);
        expect(vaultEngine.getRecord(MEMO).body).not.toContain('x');
      });

      it('does not run on the wrong PC', async () => {
        makeAgent(async () => undefined);
        const result = await agent.executeKinakoRequest(envelope({ targetPc: 'pc_someone_else' }));
        expect(result).toMatchObject({ status: 'failed', failure: { code: 'TARGET_PC_MISMATCH' } });
        expect(runAi).not.toHaveBeenCalled();
      });

      it('does not run twice for a resent requestId, even after a restart', async () => {
        makeAgent(async ({ mcpHost }) => {
          await callTool(mcpHost, 'thinktank_add_promotion_candidate', { projectId: PROJECT_A, type: 'risk', title: 't', summary: 's' });
        });
        const first = await agent.executeKinakoRequest(envelope({ targetPc: target() }));
        const again = await agent.executeKinakoRequest(envelope({ targetPc: target() }));
        expect(again).toEqual(first);
        expect(runAi).toHaveBeenCalledTimes(1);

        const restarted = new RelayAgent({ userDataDir, vaultEngine, aiCliRunner: { runDomainAiConversation: runAi, detectAvailableClis: () => ({}) } });
        restarted.setMcpHost(new ThinktankMcpHost({ vaultEngine }));
        expect(await restarted.executeKinakoRequest(envelope({ targetPc: target() }))).toEqual(first);
        expect(runAi).toHaveBeenCalledTimes(1);
      });

      it('lets a failed request with no writes be retried under the same id', async () => {
        let attempts = 0;
        makeAgent(async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('AI CLI が見つかりません');
        });
        const first = await agent.executeKinakoRequest(envelope({ targetPc: target() }));
        expect(first).toMatchObject({ status: 'failed', failure: { code: 'AI_EXECUTION_FAILED' } });
        const second = await agent.executeKinakoRequest(envelope({ targetPc: target() }));
        expect(second.status).toBe('done');
        expect(runAi).toHaveBeenCalledTimes(2);
      });

      it('executes a queued MCP tool call through the relay and keeps governance (no approval tool)', async () => {
        makeAgent(async () => undefined);
        const ok = await agent.executePlainRequest({
          requestId: 'r1',
          kind: 'mcp.toolCall',
          createdAt: new Date().toISOString(),
          payload: { name: 'thinktank_get_record', arguments: { thinkid: MEMO } },
        });
        expect(ok.ok).toBe(true);
        expect(ok.result.payload.meta.title).toBe('出荷規格メモ');

        const approve = await agent.executePlainRequest({
          requestId: 'r2',
          kind: 'mcp.toolCall',
          createdAt: new Date().toISOString(),
          payload: { name: 'thinktank_approve_promotion_candidate', arguments: {} },
        });
        expect(approve.result.isError).toBe(true);
        expect(approve.result.payload.error.code).toBe('UNKNOWN_TOOL');
      });
    });
  });
});
