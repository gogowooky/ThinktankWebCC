// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
// 会話本体は重いので、送信の右に出すもの（idleStatus）と送信に使う AI だけを見えるようにする
vi.mock('../../ThoughtSupport/SupportChat', async () => {
  const { forwardRef } = await import('react');
  return {
    SupportChat: forwardRef(function SupportChat(props: { idleStatus?: React.ReactNode; modelSelector: { value: { provider: string; model: string } } }, _ref) {
      return <div>
        <span data-testid="selection">{`${props.modelSelector.value.provider}:${props.modelSelector.value.model}`}</span>
        <p data-testid="idle">{props.idleStatus}</p>
      </div>;
    }),
  };
});
const menu = vi.hoisted(() => ({ showMonacoMenu: vi.fn() }));
vi.mock('../../../utils/monacoMenu', () => menu);
import { ChatMedia } from './ChatMedia';
import { TTThink } from '../../../models/TTThink';
import { TTApplication } from '../../../views/TTApplication';
import { StorageManager } from '../../../services/storage/StorageManager';
import { setModelNames } from '../../../services/aiChatModelStatus';
import { applyDictionaryOverride, resetDictionaryOverride } from '../../../utils/defaultDictionary';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(StorageManager.instance, 'save').mockResolvedValue({ updatedAt: '2026-11-01T00:00:00Z' } as never);
  menu.showMonacoMenu.mockReset();
  applyDictionaryOverride({ ai_settings: { gnb: { notebookid: { 'ノートA': 'id-a', 'ノートB': 'id-b' } } } });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); resetDictionaryOverride();
  setModelNames('OpenAI', 'None');
  TTApplication.resetInstance(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function chat(metadata: Record<string, unknown>) {
  const t = new TTThink(); t.ID = '2026-11-01-000001'; t.ContentType = 'chat'; t.setContentSilent('ASK:Working｜新しい相談');
  t.Metadata = metadata; t.markSaved(); t.markMetadataSaved();
  TTApplication.Instance.Models.Vault.AddItem(t);
  return t;
}
async function show(think: TTThink) {
  await act(async () => root.render(<ChatMedia think={think} vault={TTApplication.Instance.Models.Vault}
    onSave={async () => {}} onDirtyChange={() => {}} aiChatModel={{ provider: 'anthropic', model: 'claude-opus-5' }} />));
}
const idle = () => host.querySelector('[data-testid="idle"]')?.textContent;
const selection = () => host.querySelector('[data-testid="selection"]')?.textContent;
const choices = () => [...host.querySelectorAll<HTMLButtonElement>('.chat-media__choice')];
const web = () => host.querySelector<HTMLAnchorElement>('.chat-media__site');

it('メッセージが無い間は、送信の右にこのチャットの AI 種別と「web」を出す（metadata が無ければ Pane の AI）', async () => {
  await show(chat({}));
  expect(idle()).toBe('Claude web');
  expect(selection()).toBe('anthropic:claude-opus-5');
});

it('AI 種別を押すとメニューで選べ、このチャットの metadata に保存する', async () => {
  setModelNames('OpenAI', 'gpt-5.6');
  const think = chat({});
  await show(think);
  menu.showMonacoMenu.mockResolvedValueOnce('openai');
  await act(async () => { choices()[0].click(); });
  const options = menu.showMonacoMenu.mock.calls[0][0] as { nodes: Array<{ label: string; value: string; detail?: string }> };
  expect(options.nodes.map(n => [n.label, n.value, n.detail ?? ''])).toEqual([
    ['ChatGPT', 'openai', ''], ['Claude', 'anthropic', '選択中'], ['Gemini', 'gemini', ''], ['GNB', 'gnb', ''], ['Local', 'local', ''],
  ]);
  expect(think.Metadata).toMatchObject({ provider: 'openai', model: 'gpt-5.6' });

  await show(think);
  expect(idle()).toBe('ChatGPT web');
  expect(selection()).toBe('openai:gpt-5.6');
});

it('「web」は下線付きでその AI の Web サイトへのリンク（GNB は使っている Notebook のページ、Local は無し）', async () => {
  await show(chat({}));
  expect([web()?.href, web()?.target]).toEqual(['https://claude.ai/', '_blank']);
  await show(chat({ provider: 'openai', model: 'gpt-5.6' }));
  expect(web()?.href).toBe('https://chatgpt.com/');
  await show(chat({ provider: 'gemini', model: 'gemini-3.5-flash' }));
  expect(web()?.href).toBe('https://gemini.google.com/');
  await show(chat({ provider: 'gnb', notebookid: 'id-a' }));
  expect(web()?.href).toBe('https://notebook.google.com/notebook/id-a');
  await show(chat({ provider: 'local', model: 'None' }));
  expect(web()).toBeNull();
  expect(idle()).toBe('Local');
});

it('GNB は Notebook 名を ( ) で括って下線付きで出し、押すと Dictionary の Notebook から選んでこのチャットに設定する', async () => {
  const think = chat({ provider: 'gnb', model: 'id-a', notebookid: 'id-a' });
  await show(think);
  expect(idle()).toBe('GNB (ノートA) web');
  expect(selection()).toBe('gnb:id-a');

  menu.showMonacoMenu.mockResolvedValueOnce('id-b');
  await act(async () => { choices()[1].click(); });
  const options = menu.showMonacoMenu.mock.calls[0][0] as { nodes: Array<{ label: string; value: string }> };
  expect(options.nodes.map(n => [n.label, n.value])).toEqual([['ノートA', 'id-a'], ['ノートB', 'id-b']]);
  expect(think.Metadata).toMatchObject({ provider: 'gnb', model: 'id-b', notebookid: 'id-b' });
  expect(StorageManager.instance.save).toHaveBeenCalled();

  await show(think);
  expect(idle()).toBe('GNB (ノートB) web');
  expect(selection()).toBe('gnb:id-b');
  expect(web()?.href).toBe('https://notebook.google.com/notebook/id-b');
});

it('GNB に戻したときは、このチャットに設定済みの Notebook を使う', async () => {
  const think = chat({ provider: 'anthropic', model: 'claude-opus-5', notebookid: 'id-b' });
  await show(think);
  menu.showMonacoMenu.mockResolvedValueOnce('gnb');
  await act(async () => { choices()[0].click(); });
  expect(think.Metadata).toMatchObject({ provider: 'gnb', model: 'id-b', notebookid: 'id-b' });
});

it('Dictionary に無い Notebook ID はそのまま出す', async () => {
  await show(chat({ provider: 'gnb', notebookid: 'unknown-id' }));
  expect(idle()).toBe('GNB (unknown-id) web');
});
