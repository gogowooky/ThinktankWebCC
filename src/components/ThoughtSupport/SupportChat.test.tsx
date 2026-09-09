// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { TTVault } from '../../models/TTVault';
const mocks = vi.hoisted(() => ({ save: vi.fn(), stream: vi.fn(), input: '相談を続けたい', open: vi.fn() }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { save: mocks.save, search: vi.fn().mockResolvedValue([]) } } }));
vi.mock('../../services/ChatApiService', () => ({ streamChat: mocks.stream }));
vi.mock('../../views/TTApplication', () => ({ TTApplication: { Instance: { OverviewPanel: { OpenBundle: mocks.open } } } }));
vi.mock('../ThinktankPanel/AiChatView', async () => {
  const React = await import('react');
  return { AiChatView: React.forwardRef((_props: unknown, _ref) => {
    const props = _props as { onSend: (text: string) => void; isWaiting: boolean; messages: Array<{ content: string }> };
    return <div><button id="send" disabled={props.isWaiting} onClick={() => props.onSend(mocks.input)}>送信</button><div id="messages">{props.messages.map(m => m.content).join('\n')}</div></div>;
  }) };
});
import { TTThink } from '../../models/TTThink';
import { SupportChat } from './SupportChat';
import { supportRecord } from '../../services/thoughtSupport';

let root: Root;
let host: HTMLDivElement;
function makeChat(id: string, title: string, bundleId = '') {
  const t = new TTThink(); t.ID = id; t.ContentType = 'chat'; t.Content = `${title}\n## 前の質問\n前の回答`;
  t.Metadata.thoughtSupport = { ...supportRecord(), bundleId, current: '前回の状況', next: '候補を比べる' }; t.markSaved(); return t;
}
beforeEach(() => {
  mocks.input = '相談を続けたい';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.save.mockReset().mockResolvedValue({ updatedAt: '2026-09-08T12:00:00Z' }); mocks.stream.mockReset(); mocks.open.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function send() { await act(async () => { host.querySelector<HTMLButtonElement>('#send')!.click(); }); }
function vaultFor(items: TTThink[]) {
  return { GetThink: (id: string) => items.find(t => t.ID === id), GetThinks: () => items, GetThinksForBundleAsync: vi.fn(async (id: string) => items.filter(t => supportRecord(t).bundleId === id)) } as unknown as TTVault;
}
const modelSelector = { value: { provider: 'gemini' as const, model: 'gemini-2.5-flash' }, onChange: () => {} };
describe('panel conversation integration', () => {
  it('saves the reply without invalid management and allows the next turn', async () => {
    const item = makeChat('chat-1', 'TODO:Thinktank｜[進行中]相談');
    mocks.input = '2';
    mocks.stream.mockImplementation(async (_history, _prompt, callbacks) => {
      callbacks.onDelta(JSON.stringify({ reply: '焦点を確認しましょう。', operation: { record: { decisions: '本人の選択' } }, createBundle: '作らないBundle' })); callbacks.onDone();
    });
    await act(async () => root.render(<SupportChat vault={vaultFor([item])} panelName="Thinktank" selectedId={item.ID} onSelected={() => {}} onMessages={() => {}} onWaiting={() => {}} modelSelector={modelSelector} />));
    await send();
    expect(host.textContent).toContain('管理情報の変更は見送りました');
    expect(host.textContent).not.toContain('保存を再試行');
    expect(item.Content).toContain('焦点を確認しましょう');
    expect(supportRecord(item).decisions).toBe('');
    expect(item.Metadata.supportPendingEffects).toBeUndefined();
    mocks.stream.mockImplementation(async (_history, _prompt, callbacks) => {
      callbacks.onDelta(JSON.stringify({ reply: '続きを話しましょう。' })); callbacks.onDone();
    });
    mocks.input = '続けてください';
    await send();
    expect(mocks.stream).toHaveBeenCalledTimes(2);
    expect(item.Content).toContain('続きを話しましょう');
  });
  it('changes owner and continues in place with the same transcript and new role', async () => {
    const item = makeChat('chat-1', 'PROJ:Thinktank｜[進行中]交流会'); const vault = vaultFor([item]);
    function Harness() {
      const [id, select] = useState(item.ID);
      return <SupportChat vault={vault} panelName="Thinktank" selectedId={id} onSelected={select} onMessages={() => {}} onWaiting={() => {}} modelSelector={modelSelector} />;
    }
    mocks.stream.mockImplementation(async (_history, _prompt, callbacks) => {
      callbacks.onDelta(JSON.stringify({ reply: '全体を整理しましょう。', operation: { panel: 'Overview', record: { handoff: '全体の準備と次の一手を整理する' } } })); callbacks.onDone();
    });
    await act(async () => root.render(<Harness />)); await send();
    expect(item.Name).toContain('PROJ:Overview');
    expect(host.textContent).toContain('このまま相談を続けられます');
    mocks.stream.mockImplementation(async (history, prompt, callbacks, _signal, _model, support) => {
      expect(prompt).toContain('現在の担当 Overview'); expect(support).toBe(true);
      expect(history.filter((m: { content: string }) => m.content === mocks.input)).toHaveLength(2);
      callbacks.onDelta(JSON.stringify({ reply: '次の準備を考えましょう。' })); callbacks.onDone();
    });
    await send(); expect(supportRecord(item).messages).toHaveLength(6);
  });
  it('pins the selected task Bundle when the visible Bundle changes', async () => {
    const selected = makeChat('chat-1', 'TODO:Workout｜[待機]返事を待つ', 'bundle-a');
    const other = makeChat('chat-2', 'TODO:Workout｜[未着手]別の個人情報', 'bundle-b');
    const vault = vaultFor([selected, other]);
    const element = (bundle: string) => <SupportChat vault={vault} panelName="Workout" selectedId={selected.ID} bundleId={bundle} onSelected={() => {}} onMessages={() => {}} onWaiting={() => {}} modelSelector={modelSelector} />;
    await act(async () => root.render(element('bundle-a')));
    await act(async () => root.render(element('bundle-b')));
    mocks.stream.mockImplementation(async (_history, prompt, callbacks) => {
      expect(prompt).toContain('bundle-a'); expect(prompt).not.toContain('別の個人情報');
      callbacks.onDelta(JSON.stringify({ reply: '返事は届きましたか。' })); callbacks.onDone();
    });
    await send(); expect(supportRecord(selected).bundleId).toBe('bundle-a'); expect(selected.Name).toContain('[待機]');
  });
  it('blocks management changes from the free conversation Pane', async () => {
    const selected = makeChat('chat-1', 'TODO:Workout｜[待機]予約');
    mocks.stream.mockImplementation(async (_history, _prompt, callbacks) => { callbacks.onDelta(JSON.stringify({ reply: '終わりです', operation: { state: '完了', evidence: mocks.input, record: { remaining: 'なし' } } })); callbacks.onDone(); });
    await act(async () => root.render(<SupportChat pane vault={vaultFor([selected])} panelName="Workout" selectedId={selected.ID} onSelected={() => {}} onMessages={() => {}} onWaiting={() => {}} modelSelector={modelSelector} />));
    await send(); expect(selected.Name).toContain('[待機]'); expect(host.textContent).toContain('自由対話からの管理変更は適用していません');
  });
  it('does not save a truncated model response as an answer', async () => {
    const selected = makeChat('chat-1', 'ASK:Workout｜[進行中]質問');
    mocks.stream.mockImplementation(async (_history, _prompt, callbacks) => { callbacks.onDelta('{"reply":"途中'); });
    await act(async () => root.render(<SupportChat vault={vaultFor([selected])} panelName="Workout" selectedId={selected.ID} onSelected={() => {}} onMessages={() => {}} onWaiting={() => {}} modelSelector={modelSelector} />));
    await send(); expect(host.textContent).toContain('通信が途中で終了しました'); expect(selected.Content).not.toContain('{"reply"');
    const saved = supportRecord(selected).messages!;
    expect(saved[saved.length - 1].role).toBe('user');
  });
});
