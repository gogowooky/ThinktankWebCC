// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { KinakoTokenRelaySettingsPanel } from './KinakoTokenRelaySettingsPanel';
import type { ElectronKinakoAuthStatus } from '../../services/storage/ElectronStorageBackend';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const PASSWORD = 'kinako-test-password';

const baseStatus = (over: Partial<ElectronKinakoAuthStatus> = {}): ElectronKinakoAuthStatus => ({
  connected: false,
  email: 'kinako@example.com',
  tokenExpiresAt: '',
  localMode: false,
  relayEnabled: true,
  tokenFileWritten: false,
  problem: '',
  ...over,
});

function mountWith(api: Record<string, unknown> | undefined) {
  (window as unknown as { electronAPI: unknown }).electronAPI = api ? { relay: api } : {};
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const passwordInput = () => host.querySelector<HTMLInputElement>('#tt-kinako-password')!;
const button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!;

async function typePassword(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(passwordInput(), value);
    passwordInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  sessionStorage.clear();
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

it('Web 版（きなこ API が無い環境）では何も描画しない', async () => {
  mountWith(undefined);
  await act(async () => root.render(<KinakoTokenRelaySettingsPanel />));
  expect(host.innerHTML).toBe('');
});

it('未接続を表示し、接続すると接続済みと有効期限を表示して入力欄を空にする', async () => {
  const expiresAt = '2026-11-12T01:00:00.000Z';
  const api = {
    getKinakoAuthStatus: vi.fn().mockResolvedValue(baseStatus()),
    setKinakoPassword: vi.fn().mockResolvedValue(baseStatus({ connected: true, tokenExpiresAt: expiresAt })),
    signOutKinako: vi.fn(),
  };
  mountWith(api);
  await act(async () => root.render(<KinakoTokenRelaySettingsPanel />));
  await flush();

  expect(host.textContent).toContain('きなこ連携（認証）');
  expect(host.textContent).toContain('未接続');
  expect(passwordInput().type).toBe('password');
  expect(button('切断').disabled).toBe(true);

  await typePassword(PASSWORD);
  expect(passwordInput().value).toBe(PASSWORD);
  await act(async () => button('接続').click());
  await flush();

  expect(api.setKinakoPassword).toHaveBeenCalledWith(PASSWORD);
  expect(passwordInput().value).toBe('');
  expect(host.textContent).toContain('接続済み');
  expect(host.textContent).toContain(new Date(expiresAt).toLocaleString());
  expect(host.innerHTML).not.toContain(PASSWORD);
  expect(JSON.stringify({ ...localStorage })).not.toContain(PASSWORD);
  expect(JSON.stringify({ ...sessionStorage })).not.toContain(PASSWORD);
});

it('接続に失敗しても入力欄を空にし、理由を表示する', async () => {
  const api = {
    getKinakoAuthStatus: vi.fn().mockResolvedValue(baseStatus()),
    setKinakoPassword: vi.fn().mockRejectedValue(
      new Error("Error invoking remote method 'relay:setKinakoPassword': Error: Firebase サインインに失敗しました (INVALID_PASSWORD)"),
    ),
    signOutKinako: vi.fn(),
  };
  mountWith(api);
  await act(async () => root.render(<KinakoTokenRelaySettingsPanel />));
  await flush();
  await typePassword(PASSWORD);
  await act(async () => button('接続').click());
  await flush();

  expect(passwordInput().value).toBe('');
  expect(host.textContent).toContain('接続できませんでした: Firebase サインインに失敗しました (INVALID_PASSWORD)');
  expect(host.textContent).toContain('未接続');
});

it('切断すると未接続に戻る', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const api = {
    getKinakoAuthStatus: vi.fn().mockResolvedValue(
      baseStatus({ connected: true, tokenExpiresAt: '2026-11-12T01:00:00.000Z' }),
    ),
    setKinakoPassword: vi.fn(),
    signOutKinako: vi.fn().mockResolvedValue(baseStatus()),
  };
  mountWith(api);
  await act(async () => root.render(<KinakoTokenRelaySettingsPanel />));
  await flush();
  expect(host.textContent).toContain('接続済み');

  await act(async () => button('切断').click());
  await flush();
  expect(api.signOutKinako).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('未接続');
});

it('PC連携が OFF のときはファイルを書き出していないことを案内する', async () => {
  const api = {
    getKinakoAuthStatus: vi.fn().mockResolvedValue(baseStatus({ connected: true, relayEnabled: false })),
    setKinakoPassword: vi.fn(),
    signOutKinako: vi.fn(),
  };
  mountWith(api);
  await act(async () => root.render(<KinakoTokenRelaySettingsPanel />));
  await flush();
  expect(host.textContent).toContain('PC連携モードが OFF のため');
});

it('ローカル運用モードでは操作を無効にする', async () => {
  const api = {
    getKinakoAuthStatus: vi.fn().mockResolvedValue(baseStatus({ localMode: true })),
    setKinakoPassword: vi.fn(),
    signOutKinako: vi.fn(),
  };
  mountWith(api);
  await act(async () => root.render(<KinakoTokenRelaySettingsPanel />));
  await flush();
  expect(host.textContent).toContain('ローカル運用モードでは');
  expect(passwordInput().disabled).toBe(true);
  expect(button('接続').disabled).toBe(true);
});
