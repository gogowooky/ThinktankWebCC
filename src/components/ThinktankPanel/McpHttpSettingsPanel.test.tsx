// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { McpHttpSettingsPanel } from './McpHttpSettingsPanel';
import type {
  ElectronMcpHttpIssuedToken,
  ElectronMcpHttpStatus,
} from '../../services/storage/ElectronStorageBackend';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const baseStatus = (over: Partial<ElectronMcpHttpStatus> = {}): ElectronMcpHttpStatus => ({
  enabled: false,
  listening: false,
  localMode: false,
  bindAddress: '127.0.0.1',
  bindKind: 'loopback',
  addresses: [
    { address: '127.0.0.1', kind: 'loopback', interface: 'lo' },
    { address: '100.101.102.103', kind: 'tailscale', interface: 'Tailscale' },
  ],
  endpointUrl: '',
  port: 47821,
  pcId: 'pc_test',
  lastError: '',
  tokens: [],
  ...over,
});

const ISSUED: ElectronMcpHttpIssuedToken = {
  id: 'tok_abc',
  token: 'ttmcp_TEST_PLAINTEXT_ONCE',
  pcId: 'pc_test',
  label: 'kinako',
  createdAt: '2026-11-10T00:00:00.000Z',
};

function mountWith(api: Record<string, unknown> | undefined) {
  (window as unknown as { electronAPI: unknown }).electronAPI = api ? { mcpHttp: api } : {};
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const byLabel = (label: string) => host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  vi.unstubAllGlobals();
});

it('Web 版（mcpHttp が無い環境）では何も描画しない', async () => {
  mountWith(undefined);
  await act(async () => root.render(<McpHttpSettingsPanel />));
  expect(host.innerHTML).toBe('');
});

it('ローカル運用モードでは節を出したうえで、すべての操作を無効にする', async () => {
  const api = {
    getStatus: vi.fn().mockResolvedValue(baseStatus({ localMode: true })),
    setEnabled: vi.fn(),
    createToken: vi.fn(),
  };
  mountWith(api);
  await act(async () => root.render(<McpHttpSettingsPanel />));
  await flush();

  expect(host.textContent).toContain('ローカル運用モードでは');
  expect((byLabel('MCP HTTPサーバー').querySelector('input[role="switch"]') as HTMLInputElement).disabled).toBe(true);
  expect((byLabel('トークンを発行') as HTMLButtonElement).disabled).toBe(true);
  expect((byLabel('トークンを再発行') as HTMLButtonElement).disabled).toBe(true);
  expect(api.setEnabled).not.toHaveBeenCalled();
});

it('ON にすると起動し、待ち受けアドレスの種類と接続先を表示する', async () => {
  const api = {
    getStatus: vi.fn().mockResolvedValue(baseStatus()),
    setEnabled: vi.fn().mockResolvedValue(
      baseStatus({
        enabled: true,
        listening: true,
        bindAddress: '100.101.102.103',
        bindKind: 'tailscale',
        endpointUrl: 'http://100.101.102.103:47821/mcp',
      }),
    ),
  };
  mountWith(api);
  await act(async () => root.render(<McpHttpSettingsPanel />));
  await flush();

  // 既定は OFF で、localhost のみなら別端末から届かないことを案内する
  const sw = host.querySelector('input[role="switch"]') as HTMLInputElement;
  expect(sw.checked).toBe(false);
  expect(host.textContent).toContain('localhost のみの待ち受けです');
  expect(host.textContent).toContain('100.101.102.103（Tailscale）');
  expect(host.textContent).toContain('127.0.0.1（localhost のみ）');

  await act(async () => sw.click());
  await flush();
  expect(api.setEnabled).toHaveBeenCalledWith(true);
  expect(host.textContent).toContain('待ち受け中');
  expect(host.textContent).toContain('http://100.101.102.103:47821/mcp');
  expect(host.textContent).toContain('（Tailscale）');
});

it('起動に失敗したときは理由を表示する', async () => {
  const api = {
    getStatus: vi.fn().mockResolvedValue(baseStatus()),
    setEnabled: vi.fn().mockResolvedValue(baseStatus({ enabled: true, listening: false, lastError: 'EADDRINUSE' })),
  };
  mountWith(api);
  await act(async () => root.render(<McpHttpSettingsPanel />));
  await flush();
  await act(async () => (host.querySelector('input[role="switch"]') as HTMLInputElement).click());
  await flush();
  expect(host.textContent).toContain('起動できませんでした: EADDRINUSE');
});

it('トークンの平文は発行直後の1回だけ表示し、閉じたら消える（一覧には ID だけ）', async () => {
  let tokens: ElectronMcpHttpStatus['tokens'] = [];
  const api = {
    getStatus: vi.fn(async () => baseStatus({ tokens })),
    createToken: vi.fn(async () => {
      tokens = [{ id: ISSUED.id, label: ISSUED.label, pcId: ISSUED.pcId, createdAt: ISSUED.createdAt, revokedAt: '' }];
      return ISSUED;
    }),
  };
  mountWith(api);
  await act(async () => root.render(<McpHttpSettingsPanel />));
  await flush();

  await act(async () => byLabel('トークンを発行').click());
  await flush();
  expect(api.createToken).toHaveBeenCalledWith({ label: 'kinako' });
  expect(host.querySelector('[data-testid="mcp-http-issued-token"]')?.textContent).toBe(ISSUED.token);

  await act(async () => {
    [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('閉じる'))!.click();
  });
  await flush();
  expect(host.textContent).not.toContain(ISSUED.token);
  // 一覧には ID と名前が出るだけで、平文は残らない
  expect(host.textContent).toContain('tok_abc');
});

it('再発行・失効は確認してから実行し、取り消したら何もしない', async () => {
  const active = [{ id: 'tok_old', label: 'kinako', pcId: 'pc_test', createdAt: '2026-11-09T00:00:00.000Z', revokedAt: '' }];
  const api = {
    getStatus: vi.fn().mockResolvedValue(baseStatus({ tokens: active })),
    reissueToken: vi.fn().mockResolvedValue(ISSUED),
    revokeToken: vi.fn().mockResolvedValue(baseStatus({ tokens: [{ ...active[0], revokedAt: '2026-11-10T00:00:00.000Z' }] })),
  };
  mountWith(api);
  await act(async () => root.render(<McpHttpSettingsPanel />));
  await flush();

  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal('confirm', confirm);
  await act(async () => byLabel('トークンを再発行').click());
  await act(async () => byLabel('トークン tok_old を失効').click());
  await flush();
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(api.reissueToken).not.toHaveBeenCalled();
  expect(api.revokeToken).not.toHaveBeenCalled();

  confirm.mockReturnValue(true);
  await act(async () => byLabel('トークン tok_old を失効').click());
  await flush();
  expect(api.revokeToken).toHaveBeenCalledWith('tok_old');
  await act(async () => byLabel('トークンを再発行').click());
  await flush();
  expect(api.reissueToken).toHaveBeenCalledWith({ label: 'kinako' });
});
