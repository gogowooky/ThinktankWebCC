// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ vault: undefined as unknown }));
vi.mock('../../models/TTModels', () => ({ TTModels: { get Instance() { return { Vault: mocks.vault }; } } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { TTVault } from '../../models/TTVault';
import { TTApplication } from '../../views/TTApplication';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { getModelNames, setModelNames } from '../../services/aiChatModelStatus';
import { AiModelSettingsPanel } from './AiModelSettingsPanel';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  delete window.electronAPI;
  TTApplication.resetInstance(); localStorage.clear(); mocks.vault = new TTVault('test');
  TTUIStateManager.instance.init(TTApplication.Instance);
  setModelNames('OpenAI', 'gpt-5.6'); setModelNames('GNB', ''); setModelNames('Local', '');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete window.electronAPI; TTApplication.resetInstance(); vi.unstubAllGlobals(); });

function field(label: string) { return host.querySelector<HTMLInputElement>(`input[aria-label="${label}のモデル（CSV）"]`)!; }
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
}

it('lists GeminiNotebook below Claude and links it to the first configured Notebook ID', async () => {
  await act(async () => root.render(<AiModelSettingsPanel />));
  expect([...host.querySelectorAll('.tt-ai-model__label')].map(e => e.textContent)).toEqual([
    'ChatGPT', 'Gemini', 'Claude', 'GeminiNotebook(GNB)', 'Local',
  ]);
  const topPageLink = host.querySelector<HTMLAnchorElement>('.tt-ai-model__label-link')!;
  expect(topPageLink.href).toBe('https://notebook.google.com/');

  const input = host.querySelector<HTMLInputElement>('input[aria-label="GeminiNotebook(GNB)のNotebook ID（CSV）"]')!;
  await type(input, 'notebook-first, notebook-second');
  expect(getModelNames('GNB')).toBe('notebook-first,notebook-second');
  const link = host.querySelector<HTMLAnchorElement>('.tt-ai-model__label-link')!;
  expect(link.textContent).toBe('GeminiNotebook(GNB)');
  expect(link.href).toBe('https://notebook.google.com/notebook/notebook-first');
  expect(link.target).toBe('_blank');
});

it('saves the entered CSV as the model list without offering a radio choice', async () => {
  await act(async () => root.render(<AiModelSettingsPanel />));
  await type(field('ChatGPT'), 'gpt-7-nova, gpt-6-luna,');
  expect(getModelNames('OpenAI')).toBe('gpt-7-nova,gpt-6-luna');
  expect(TTUIStateManager.instance.getProperty('AIChat.ModelNames.OpenAI')).toBe('gpt-7-nova,gpt-6-luna');
  expect(field('ChatGPT').value).toBe('gpt-7-nova,gpt-6-luna');
  expect(host.querySelector('input[type="radio"]')).toBeNull();
});

it('stores an emptied field as None', async () => {
  await act(async () => root.render(<AiModelSettingsPanel />));
  await type(field('ChatGPT'), '');
  expect(getModelNames('OpenAI')).toBe('None');
  await type(field('Local'), 'llama-4');
  expect(getModelNames('Local')).toBe('llama-4');
});

it('shows login state on the right and gives every unauthenticated cloud provider a browser link', async () => {
  await act(async () => root.render(<AiModelSettingsPanel />));
  expect([...host.querySelectorAll('.tt-ai-model__auth')].map(e => e.textContent)).toEqual([
    '未ログイン', '未ログイン', '未ログイン', '未ログイン', '未設定',
  ]);
  const links = [...host.querySelectorAll<HTMLAnchorElement>('.tt-ai-model__auth--login-link')];
  expect(links).toHaveLength(4);
  expect(links[0].href).toBe('https://chatgpt.com/auth/login');
  expect(links[1].href).toContain('accounts.google.com/ServiceLogin');
  expect(links[2].href).toBe('https://claude.ai/login');
  expect(links[3].href).toContain('notebook.google.com');
});

it('loads Electron CLI authentication state and starts browser authentication from 未ログイン or （再ログイン）', async () => {
  const getAuthStatus = vi.fn().mockResolvedValue({
    OpenAI: { available: true, loggedIn: true, loginUrl: 'https://chatgpt.com/auth/login' },
    Gemini: { available: true, loggedIn: false, loginUrl: 'https://accounts.google.com/' },
    Claude: { available: true, loggedIn: true, loginUrl: 'https://claude.ai/login' },
    GNB: { available: true, loggedIn: false, loginUrl: 'https://accounts.google.com/' },
    Local: { available: true, loggedIn: true, loginUrl: '' },
  });
  const login = vi.fn().mockResolvedValue({ started: true, loginUrl: 'https://accounts.google.com/' });
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { ai: { getAuthStatus, login } },
  });

  await act(async () => {
    root.render(<AiModelSettingsPanel />);
    await Promise.resolve();
  });
  expect([...host.querySelectorAll('.tt-ai-model__auth')].map(e => e.textContent)).toEqual([
    'ログイン済（再ログイン）', '未ログイン', 'ログイン済（再ログイン）', '未ログイン', '未設定',
  ]);

  const openaiRelogin = [...host.querySelectorAll<HTMLAnchorElement>('.tt-ai-model__auth--login-link')]
    .find(link => link.closest('.tt-ai-model')?.textContent?.includes('ChatGPT'))!;
  expect(openaiRelogin.textContent).toBe('再ログイン');
  await act(async () => { openaiRelogin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  expect(login).toHaveBeenCalledWith('OpenAI');

  const gnbStatus = [...host.querySelectorAll<HTMLAnchorElement>('.tt-ai-model__auth--login-link')]
    .find(link => link.closest('.tt-ai-model')?.textContent?.includes('GeminiNotebook'))!;
  await act(async () => { gnbStatus.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  expect(login).toHaveBeenCalledWith('GNB');
});

it('shows the title returned for the first configured GNB Notebook ID below its textbox and refreshes on GNB login', async () => {
  setModelNames('GNB', 'notebook-first,notebook-second');
  const getAuthStatus = vi.fn().mockResolvedValue({
    OpenAI: { available: true, loggedIn: false, loginUrl: 'https://chatgpt.com/auth/login' },
    Gemini: { available: true, loggedIn: false, loginUrl: 'https://accounts.google.com/' },
    Claude: { available: true, loggedIn: false, loginUrl: 'https://claude.ai/login' },
    GNB: { available: true, loggedIn: true, loginUrl: 'https://accounts.google.com/' },
    Local: { available: false, loggedIn: false, loginUrl: '' },
  });
  const login = vi.fn().mockResolvedValue({ started: true, loginUrl: 'https://accounts.google.com/' });
  const getGnbNotebookTitle = vi.fn()
    .mockRejectedValueOnce(new Error('not authenticated'))
    .mockResolvedValue('臨床研究ノート');
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { ai: { getAuthStatus, login, getGnbNotebookTitle } },
  });

  await act(async () => {
    root.render(<AiModelSettingsPanel />);
    await Promise.resolve();
  });
  expect(getGnbNotebookTitle).toHaveBeenCalledWith('notebook-first');

  const gnbRelogin = [...host.querySelectorAll<HTMLAnchorElement>('.tt-ai-model__auth--login-link')]
    .find(link => link.closest('.tt-ai-model')?.textContent?.includes('GeminiNotebook'))!;
  expect(gnbRelogin.textContent).toBe('再ログイン');
  await act(async () => {
    gnbRelogin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  expect(login).toHaveBeenCalledWith('GNB');
  expect(host.querySelector('.tt-ai-model__notebook-title')?.textContent).toBe('タイトル：臨床研究ノート');
});

it('fetches the GNB Notebook title when clicking the タイトル link', async () => {
  setModelNames('GNB', 'notebook-first');
  const getGnbNotebookTitle = vi.fn()
    .mockRejectedValueOnce(new Error('failed initially'))
    .mockResolvedValueOnce('AI創薬');
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { ai: { getGnbNotebookTitle } },
  });

  await act(async () => {
    root.render(<AiModelSettingsPanel />);
    await Promise.resolve();
  });
  expect(host.querySelector('.tt-ai-model__notebook-title')?.textContent).toBe('タイトル：取得できません');

  const titleLink = host.querySelector<HTMLAnchorElement>('.tt-ai-model__notebook-title-link')!;
  expect(titleLink.textContent).toBe('タイトル');
  await act(async () => {
    titleLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  expect(getGnbNotebookTitle).toHaveBeenCalledTimes(2);
  expect(host.querySelector('.tt-ai-model__notebook-title')?.textContent).toBe('タイトル：AI創薬');
});
