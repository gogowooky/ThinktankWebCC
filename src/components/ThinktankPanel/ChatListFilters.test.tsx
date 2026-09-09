// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ChatListFilters, CHAT_KINDS, CHAT_STATES, matchesChatFilters } from './ChatListFilters';

it('combines kinds and states, including legacy and unclassified chats', () => {
  expect(matchesChatFilters('ASK:Thinktank｜[進行中]質問', new Set(['ASK']), new Set(['進行中']))).toBe(true);
  expect(matchesChatFilters('ASK:Thinktank｜[完了]質問', new Set(['ASK']), new Set(['進行中']))).toBe(false);
  expect(matchesChatFilters('TODO:Thinktank｜[進行中]用事', new Set(['ASK']), new Set(['進行中']))).toBe(false);
  expect(matchesChatFilters('TODO:Thinktank｜旧相談', new Set(['TODO']), new Set(['状態未設定']))).toBe(true);
  expect(matchesChatFilters('自由な相談', new Set(['未分類']), new Set(['状態未設定']))).toBe(true);
  expect(matchesChatFilters('ASK:Thinktank｜質問', new Set(), new Set(CHAT_STATES))).toBe(false);
});

it('toggles icons and selects/clears all independently for each row', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  function Harness() {
    const [kinds, setKinds] = useState<Set<string>>(new Set(CHAT_KINDS));
    const [states, setStates] = useState<Set<string>>(new Set(CHAT_STATES.filter(s => s !== '完了' && s !== '中止')));
    return <ChatListFilters kinds={kinds} states={states} currentTitle="ASK:Thinktank｜[進行中]相談" onKindsChange={setKinds} onStatesChange={setStates} />;
  }
  const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  try {
    await act(async () => root.render(<Harness />));
    expect(button('完了').getAttribute('aria-pressed')).toBe('false');
    expect(button('ASK：相談・質問').getAttribute('aria-current')).toBe('true');
    expect(button('進行中').classList.contains('tt-chat-filter--current')).toBe(true);
    expect(host.textContent).not.toContain('種類');
    await act(async () => button('ASK：相談・質問').click());
    expect(button('ASK：相談・質問').getAttribute('aria-pressed')).toBe('false');
    expect(button('ASK：相談・質問').getAttribute('aria-current')).toBe('true');
    await act(async () => button('全状態を選択').click());
    expect(button('完了').getAttribute('aria-pressed')).toBe('true');
    expect(button('ASK：相談・質問').getAttribute('aria-pressed')).toBe('false');
    await act(async () => button('全状態をクリア').click());
    expect(button('進行中').getAttribute('aria-pressed')).toBe('false');
    await act(async () => button('全種類を選択').click());
    expect(button('ASK：相談・質問').getAttribute('aria-pressed')).toBe('true');
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
