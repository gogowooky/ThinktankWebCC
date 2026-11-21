// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { StorageModeSettingsPanel } from './StorageModeSettingsPanel';
import type { ElectronAppModeInfo } from '../../services/storage/ElectronStorageBackend';

const overwriteFolderToFirestore = vi.hoisted(() => vi.fn());
vi.mock('../../services/storage/StorageManager', () => ({
  StorageManager: { instance: { overwriteFolderToFirestore } },
}));
const reloadAll = vi.hoisted(() => vi.fn());
vi.mock('../../models/TTModels', () => ({
  TTModels: { Instance: { Vault: { ReloadAll: reloadAll } } },
}));

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const apply = vi.fn();
const selectFolder = vi.fn();

function mountWith(info: ElectronAppModeInfo) {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    appMode: {
      storageMode: info.running.storageMode,
      get: vi.fn().mockResolvedValue(info),
      selectFolder,
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
  selectFolder.mockReset().mockResolvedValue(null);
  overwriteFolderToFirestore.mockReset().mockResolvedValue({ created: 1, updated: 2, skipped: 0, failedIds: [] });
  try { localStorage.clear(); } catch { /* 無くてもよい */ }
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

it('上書き用Thinkファイルフォルダーを選ぶと、そのフォルダから Firestore へ上書きコピーする', async () => {
  selectFolder.mockResolvedValue('D:\\修正版');
  mountWith({
    running: { storageMode: 'firestore', localVaultDir: '' },
    saved: { storageMode: 'firestore', localVaultDir: '' },
    backupVaultRoot: 'G:\\マイドライブ\\Thinktank',
    startupProblem: '',
  });
  await act(async () => root.render(<StorageModeSettingsPanel />));
  const overwrite = () => button('上書き用Thinkファイル → Firestoreへ上書きコピー');
  expect(host.textContent).toContain('Firestore へ ファイルを上書きコピー');
  expect(overwrite().disabled).toBe(true);

  await act(async () => button('フォルダを選ぶ（上書き用）').click());
  expect(selectFolder).toHaveBeenCalledWith(undefined, '上書き用Thinkファイルフォルダーを選択');
  expect(host.querySelector<HTMLInputElement>('#tt-overwrite-dir')?.value).toBe('D:\\修正版');

  await act(async () => overwrite().click());
  expect(overwriteFolderToFirestore).toHaveBeenCalledWith('D:\\修正版', expect.any(Function));
  expect(reloadAll).toHaveBeenCalled();
  expect(host.querySelector('.tt-storage-mode__message--done')?.textContent).toContain('新規 1 件、更新 2 件');
});

it('ローカルで動いているときは上書きコピーを押せない', async () => {
  try { localStorage.setItem('tt.storageMode.overwriteDir', 'D:\\修正版'); } catch { /* 無くてもよい */ }
  mountWith({
    running: { storageMode: 'local', localVaultDir: 'D:\\Dropbox\\TT' },
    saved: { storageMode: 'local', localVaultDir: 'D:\\Dropbox\\TT' },
    backupVaultRoot: 'G:\\マイドライブ\\Thinktank',
    startupProblem: '',
  });
  await act(async () => root.render(<StorageModeSettingsPanel />));
  expect(host.querySelector<HTMLInputElement>('#tt-overwrite-dir')?.value).toBe('D:\\修正版');
  expect(button('上書き用Thinkファイル → Firestoreへ上書きコピー').disabled).toBe(true);
});
