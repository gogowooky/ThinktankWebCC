// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
const signIn = vi.hoisted(() => ({ signInForThinkData: vi.fn(), isElectronBrowserSignIn: vi.fn(() => false) }));
vi.mock('../../services/thinkDataSignIn', () => signIn);
import { VaultLoadNotice } from './VaultLoadNotice';
import type { TTVault } from '../../models/TTVault';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const vault = { ReloadAll: vi.fn() };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  signIn.signInForThinkData.mockReset().mockResolvedValue({ user: { uid: 'u', email: 'a@example.com' }, relayStatus: null });
  vault.ReloadAll.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const button = (label: string) =>
  [...host.querySelectorAll('button')].find(b => b.textContent?.includes(label))!;

it('未ログインならログイン案内を出し、ログイン後に一覧を読み直す', async () => {
  const onOpenSettings = vi.fn();
  await act(async () => root.render(
    <VaultLoadNotice vault={vault as unknown as TTVault} error={{ kind: 'signin', message: '' }} onOpenSettings={onOpenSettings} />,
  ));
  expect(host.textContent).toContain('ログインが必要です');
  await act(async () => { button('Google でログイン').click(); });
  expect(signIn.signInForThinkData).toHaveBeenCalledTimes(1);
  expect(vault.ReloadAll).toHaveBeenCalledTimes(1);
  await act(async () => { button('接続設定を開く').click(); });
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});

it('ログインに失敗したら理由を表示し、一覧は読み直さない', async () => {
  signIn.signInForThinkData.mockRejectedValueOnce(new Error('popup closed'));
  await act(async () => root.render(
    <VaultLoadNotice vault={vault as unknown as TTVault} error={{ kind: 'signin', message: '' }} onOpenSettings={() => {}} />,
  ));
  await act(async () => { button('Google でログイン').click(); });
  expect(host.textContent).toContain('ログインできませんでした: popup closed');
  expect(vault.ReloadAll).not.toHaveBeenCalled();
});

it('未ログイン以外の失敗は理由と再読み込みを出す', async () => {
  await act(async () => root.render(
    <VaultLoadNotice vault={vault as unknown as TTVault} error={{ kind: 'error', message: 'Firebase Project ID が設定されていません。' }} onOpenSettings={() => {}} />,
  ));
  expect(host.textContent).toContain('Firebase Project ID が設定されていません。');
  expect(button('Google でログイン')).toBeUndefined();
  await act(async () => { button('再読み込み').click(); });
  expect(vault.ReloadAll).toHaveBeenCalledTimes(1);
});
