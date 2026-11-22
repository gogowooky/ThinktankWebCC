import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { VaultEngine } = require('./vaultEngine.cjs');
const { ThinktankMcpHost, RecordingMcpHost } = require('./mcpBridge.cjs');
const { handleMcpJsonRpcMessage } = require('./shared-dist/index.js');

const LOG = '2026-11-22-100001';
const PROFILE = '2026-11-22-100002';
let tempRoot: string;
let vaultEngine: InstanceType<typeof VaultEngine>;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'tt-harness-host-'));
  const userDataDir = join(tempRoot, 'userData');
  const vaultDir = join(tempRoot, 'vault_ver2');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  vaultEngine = new VaultEngine({
    userDataDir, appRootDir: resolve(__dirname, '..'), defaultVaultDir: vaultDir, deviceIdPrefix: 'test', autoIndexRefresh: false,
  });
  vaultEngine.saveRecord({ thinkid: LOG, category: 'aiview', title: 'P｜log', body: '' });
  vaultEngine.saveRecord({ thinkid: PROFILE, category: 'aiview', title: 'Thinktank｜PROFILE', body: '- 判断が要るものを先に' });
});

afterEach(() => { fs.rmSync(tempRoot, { recursive: true, force: true }); });

function update(host: unknown, id: number, thinkid: string, body: string) {
  return handleMcpJsonRpcMessage({
    jsonrpc: '2.0', id, method: 'tools/call',
    params: { name: 'thinktank_update_think', arguments: { thinkid, expectedVersion: vaultEngine.getRecord(thinkid).updatedAt, body } },
  }, host);
}

it('書き換えを許した AIWork だけを更新でき、ほかは PERMISSION_DENIED で拒否して記録する', async () => {
  const host = new RecordingMcpHost(new ThinktankMcpHost({ vaultEngine }), { writableIds: [LOG] });

  const ok = await update(host, 1, LOG, '# [2026-11-22 10:00] 実行 abcd1234\n判断と理由');
  expect(ok.result.isError).toBeUndefined();
  expect(vaultEngine.getRecord(LOG).body).toContain('判断と理由');

  const denied = await update(host, 2, PROFILE, '書き換え');
  expect(denied.result.isError).toBe(true);
  expect(denied.result.content[0].text).toContain('PERMISSION_DENIED');
  expect(vaultEngine.getRecord(PROFILE).body).toBe('- 判断が要るものを先に');

  expect(host.recorded.updatedThinkIds).toEqual([LOG]);
  expect(host.recorded.deniedThinkIds).toEqual([PROFILE]);
});

it('writableIds を渡さなければ従来どおり制限しない', async () => {
  const host = new RecordingMcpHost(new ThinktankMcpHost({ vaultEngine }));
  const res = await update(host, 3, PROFILE, '更新');
  expect(res.result.isError).toBeUndefined();
});
