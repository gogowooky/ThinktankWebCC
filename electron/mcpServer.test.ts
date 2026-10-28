import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { VaultEngine } = require('./vaultEngine.cjs');
const {
  ThinktankMcpHost,
  startMcpBridgeServer,
  forwardJsonRpcOverPipe,
} = require('./mcpBridge.cjs');
const { handleMcpJsonRpcMessage, THINKTANK_MCP_TOOLS } = require('./shared-dist/index.js');

describe('Thinktank MCP Server & Bridge (Step 1 - Step 3)', () => {
  let tempRoot: string;
  let userDataDir: string;
  let vaultDir: string;
  let vaultEngine: InstanceType<typeof VaultEngine>;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(join(tmpdir(), 'tt-mcp-test-'));
    userDataDir = join(tempRoot, 'userData');
    vaultDir = join(tempRoot, 'vault_ver2');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(vaultDir, { recursive: true });

    vaultEngine = new VaultEngine({
      userDataDir,
      appRootDir: resolve(__dirname, '..'),
      defaultVaultDir: vaultDir,
      deviceIdPrefix: 'test',
      autoIndexRefresh: false,
    });

    // 初期テストデータの投入
    vaultEngine.saveRecord({
      thinkid: '2026-10-20-100000',
      category: 'project',
      title: '再生医療治験プロジェクト',
      body: ['=', '# 状態', '状態値：進行中', '# 対象', '[memo:2026-10-20-100001]: 出荷規格メモ'].join('\n'),
      keywords: '治験, 再生医療',
    });

    vaultEngine.saveRecord({
      thinkid: '2026-10-20-100001',
      category: 'memo',
      title: '出荷規格メモ',
      body: '生細胞率85%以上を出荷基準とする。輸送温度は2〜8℃を維持する。',
      keywords: 'CMC, 規格',
      relatedIds: '2026-10-20-100000',
    });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('exposes the 7 governance-compliant MCP tools and initializes properly', async () => {
    const host = new ThinktankMcpHost({ vaultEngine });

    const initRes = await handleMcpJsonRpcMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      host,
    );
    expect(initRes?.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'thinktank' },
    });

    const toolsRes = await handleMcpJsonRpcMessage(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      host,
    );
    const toolNames = (toolsRes?.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(toolNames).toEqual([
      'thinktank_search',
      'thinktank_list_meta',
      'thinktank_get_record',
      'thinktank_get_project_context',
      'thinktank_create_think',
      'thinktank_update_think',
      'thinktank_add_promotion_candidate',
    ]);
    expect(THINKTANK_MCP_TOOLS).toHaveLength(7);
  });

  it('supports search, list_meta, get_record, and get_project_context tools', async () => {
    const host = new ThinktankMcpHost({ vaultEngine });

    const searchRes = await handleMcpJsonRpcMessage(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'thinktank_search', arguments: { query: '生細胞率' } },
      },
      host,
    );
    const searchPayload = JSON.parse(searchRes.result.content[0].text);
    expect(searchPayload.count).toBe(1);
    expect(searchPayload.items[0].thinkid).toBe('2026-10-20-100001');

    const projectListRes = await handleMcpJsonRpcMessage(
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'thinktank_list_meta', arguments: { projectId: '2026-10-20-100000' } },
      },
      host,
    );
    const projectListPayload = JSON.parse(projectListRes.result.content[0].text);
    expect(projectListPayload.count).toBe(1);
    expect(projectListPayload.items[0].thinkid).toBe('2026-10-20-100001');

    const getRecRes = await handleMcpJsonRpcMessage(
      {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: { name: 'thinktank_get_record', arguments: { thinkid: '2026-10-20-100001' } },
      },
      host,
    );
    const recPayload = JSON.parse(getRecRes.result.content[0].text);
    expect(recPayload.meta.title).toBe('出荷規格メモ');
    expect(recPayload.body).toContain('生細胞率85%以上');

    const projectCtxRes = await handleMcpJsonRpcMessage(
      {
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: { name: 'thinktank_get_project_context', arguments: { projectId: '2026-10-20-100000' } },
      },
      host,
    );
    const ctxPayload = JSON.parse(projectCtxRes.result.content[0].text);
    expect(ctxPayload.projectId).toBe('2026-10-20-100000');
    expect(ctxPayload.relatedThinks).toHaveLength(1);
    expect(ctxPayload.gates.length).toBeGreaterThan(0);
  });

  it('creates new Think and links it to target Project, firing mutation callback', async () => {
    const mutations: Array<Record<string, unknown>> = [];
    const host = new ThinktankMcpHost({
      vaultEngine,
      onRecordMutated: (ev: Record<string, unknown>) => {
        mutations.push(ev);
      },
    });

    const createRes = await handleMcpJsonRpcMessage(
      {
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'thinktank_create_think',
          arguments: {
            title: '輸送安定性試験プロトコル案',
            body: '夏場および冬場の温度逸脱シミュレーションを実施する。',
            category: 'memo',
            keywords: '輸送, 安定性',
            projectId: '2026-10-20-100000',
          },
        },
      },
      host,
    );
    const createdPayload = JSON.parse(createRes.result.content[0].text);
    expect(createdPayload.ok).toBe(true);
    const newId = createdPayload.created.thinkid;
    expect(newId).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}/);

    // 親Projectの「# 対象」に自動でリンク行が追加されていること
    const updatedProject = vaultEngine.getRecord('2026-10-20-100000');
    expect(updatedProject.body).toContain(`[memo:${newId}]: 輸送安定性試験プロトコル案`);
    expect(mutations).toEqual([
      { action: 'create', thinkid: newId, projectId: '2026-10-20-100000' },
    ]);
  });

  it('enforces optimistic locking and dirty-editor protection on thinktank_update_think', async () => {
    const dirtyIds = new Set<string>(['2026-10-20-100001']);
    const host = new ThinktankMcpHost({
      vaultEngine,
      isThinkDirty: (id: string) => dirtyIds.has(id),
    });

    const beforeRec = vaultEngine.getRecord('2026-10-20-100001');

    // 1. 画面のエディタで未保存変更あり（dirty）の場合は拒否されること
    const dirtyRes = await handleMcpJsonRpcMessage(
      {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: {
          name: 'thinktank_update_think',
          arguments: {
            thinkid: '2026-10-20-100001',
            expectedVersion: beforeRec.updatedAt,
            appendBody: 'AIによる追記',
          },
        },
      },
      host,
    );
    expect(dirtyRes.result.isError).toBe(true);
    expect(dirtyRes.result.content[0].text).toContain('未保存変更あり');

    // 2. dirty解除後、古い expectedVersion を渡した場合は楽観ロック競合で拒否されること
    dirtyIds.clear();
    const conflictRes = await handleMcpJsonRpcMessage(
      {
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'thinktank_update_think',
          arguments: {
            thinkid: '2026-10-20-100001',
            expectedVersion: '1999-01-01T00:00:00.000Z',
            appendBody: 'AIによる追記',
          },
        },
      },
      host,
    );
    expect(conflictRes.result.isError).toBe(true);
    expect(conflictRes.result.content[0].text).toContain('競合を検出しました');

    // 3. 正しい expectedVersion で追記が成功すること
    const okRes = await handleMcpJsonRpcMessage(
      {
        jsonrpc: '2.0',
        id: 32,
        method: 'tools/call',
        params: {
          name: 'thinktank_update_think',
          arguments: {
            thinkid: '2026-10-20-100001',
            expectedVersion: beforeRec.updatedAt,
            appendBody: '逸脱時の許容時間は2時間以内とする。',
          },
        },
      },
      host,
    );
    expect(okRes.result.isError).toBeUndefined();
    const afterRec = vaultEngine.getRecord('2026-10-20-100001');
    expect(afterRec.body).toContain('生細胞率85%以上を出荷基準とする。');
    expect(afterRec.body).toContain('逸脱時の許容時間は2時間以内とする。');
  });

  it('registers promotion candidate in pending_review status via thinktank_add_promotion_candidate', async () => {
    const host = new ThinktankMcpHost({ vaultEngine });

    const promoRes = await handleMcpJsonRpcMessage(
      {
        jsonrpc: '2.0',
        id: 40,
        method: 'tools/call',
        params: {
          name: 'thinktank_add_promotion_candidate',
          arguments: {
            projectId: '2026-10-20-100000',
            type: 'risk',
            title: '輸送時温度逸脱リスク',
            summary: '冬季輸送で2℃未満に低下し細胞生存率が低下する懸念',
            rationale: '保温容器の寒冷地バリデーションが未完了',
            proposedOwner: 'CMC担当',
            citations: [{ sourceThinkid: '2026-10-20-100001', snippet: '輸送温度は2〜8℃を維持する' }],
          },
        },
      },
      host,
    );
    const payload = JSON.parse(promoRes.result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe('pending_review');
    expect(payload.totalPendingCandidates).toBe(1);

    const projectRec = vaultEngine.getRecord('2026-10-20-100000');
    expect(projectRec.support.operations.promotionCandidates).toHaveLength(1);
    expect(projectRec.support.operations.promotionCandidates[0].title).toBe('輸送時温度逸脱リスク');
  });

  it('communicates over Named Pipe bridge and stdio mcpServer.cjs subprocess', async () => {
    const host = new ThinktankMcpHost({ vaultEngine });
    const bridge = await startMcpBridgeServer(host);

    try {
      // 1. Named Pipe 直接転送の検証
      const pipeRes = await forwardJsonRpcOverPipe(bridge.pipePath, {
        jsonrpc: '2.0',
        id: 50,
        method: 'resources/read',
        params: { uri: 'thinktank://think/2026-10-20-100001' },
      });
      const resourceData = JSON.parse(pipeRes.result.contents[0].text);
      expect(resourceData.meta.title).toBe('出荷規格メモ');

      // 2. mcpServer.cjs サブプロセスを stdio で起動して JSON-RPC 往復検証
      const mcpScript = resolve(__dirname, 'mcpServer.cjs');
      const child = spawn(process.execPath, [mcpScript], {
        env: {
          ...process.env,
          THINKTANK_MCP_PIPE: bridge.pipePath,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const responsePromise = new Promise<Record<string, unknown>>((resolveRes, rejectRes) => {
        let out = '';
        child.stdout.on('data', (chunk) => {
          out += chunk.toString('utf8');
          const nl = out.indexOf('\n');
          if (nl !== -1) {
            resolveRes(JSON.parse(out.slice(0, nl)));
          }
        });
        child.on('error', rejectRes);
      });

      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 99,
          method: 'tools/call',
          params: { name: 'thinktank_search', arguments: { query: '出荷基準' } },
        }) + '\n',
        'utf8',
      );
      child.stdin.end();

      const stdioRes = (await responsePromise) as {
        id: number;
        result: { content: Array<{ text: string }> };
      };
      expect(stdioRes.id).toBe(99);
      const parsedSearch = JSON.parse(stdioRes.result.content[0].text);
      expect(parsedSearch.count).toBe(1);
      expect(parsedSearch.items[0].thinkid).toBe('2026-10-20-100001');
    } finally {
      await bridge.close();
    }
  });
});
