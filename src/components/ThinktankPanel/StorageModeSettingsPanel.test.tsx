// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { StorageModeSettingsPanel } from './StorageModeSettingsPanel';
import type { ElectronAppModeInfo } from '../../services/storage/ElectronStorageBackend';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const apply = vi.fn();

function mountWith(info: ElectronAppModeInfo) {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    appMode: {
      storageMode: info.running.storageMode,
      get: vi.fn().mockResolvedValue(info),
      selectFolder: vi.fn().mockResolvedValue(null),
      apply,
    },
  };
}

const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  ?? [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(label))!;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('confirm', () => true);
  apply.mockReset().mockResolvedValue({ ok: true });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  vi.unstubAllGlobals();
});

it('Firestore で動いているとき、ローカルを選んで再起動ボタンで保存済みのフォルダと一緒に適用する', async () => {
  mountWith({
    running: { storageMode: 'firestore', localVaultDir: '' },
    saved: { storageMode: 'firestore', localVaultDir: 'D:\\Dropbox\\TT' },
    backupVaultRoot: 'G:\\マイドライブ\\Thinktank',
    startupProblem: '',
  });
  await act(async () => root.render(<StorageModeSettingsPanel />));
  expect(host.textContent).toContain('現在: Firestore で使う');
  expect(host.querySelector<HTMLInputElement>('#tt-local-vault-dir')?.value).toBe('D:\\Dropbox\\TT');
  expect(button('Firestore → ローカルへコピー').disabled).toBe(false);

  const localRadio = host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1];
  await act(async () => localRadio.click());
  await act(async () => button('設定を保存して再起動').click());
  expect(apply).toHaveBeenCalledWith({ storageMode: 'local', localVaultDir: 'D:\\Dropbox\\TT' });
});

it('ローカルで動いているときは移行ボタンを押せず、起動できなかった理由を表示する', async () => {
  mountWith({
    running: { storageMode: 'local', localVaultDir: 'D:\\Dropbox\\TT' },
    saved: { storageMode: 'local', localVaultDir: 'D:\\Dropbox\\TT' },
    backupVaultRoot: 'G:\\マイドライブ\\Thinktank',
    startupProblem: '',
  });
  await act(async () => root.render(<StorageModeSettingsPanel />));
  expect(host.textContent).toContain('現在: ローカルで使う');
  expect(button('Firestore → ローカルへコピー').disabled).toBe(true);
  expect(button('ローカル → Firestore へコピー').disabled).toBe(true);
});

it('保存に失敗したら理由を表示して再起動しない', async () => {
  apply.mockResolvedValue({ ok: false, error: 'バックアップ先と同じフォルダは指定できません。' });
  mountWith({
    running: { storageMode: 'firestore', localVaultDir: '' },
    saved: { storageMode: 'local', localVaultDir: 'G:\\マイドライブ\\Thinktank' },
    backupVaultRoot: 'G:\\マイドライブ\\Thinktank',
    startupProblem: 'バックアップ先と同じフォルダは指定できません。',
  });
  await act(async () => root.render(<StorageModeSettingsPanel />));
  expect(host.textContent).toContain('ローカル運用モードで起動できませんでした');
  await act(async () => button('設定を保存して再起動').click());
  expect(host.querySelector('.tt-storage-mode__message--error')?.textContent).toContain('バックアップ先と同じフォルダ');
});
