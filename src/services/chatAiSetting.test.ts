// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({
  save: vi.fn(async () => ({ updatedAt: '2026-11-01T00:00:00Z' })),
  updateMetadata: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ updatedAt: '2026-11-01T01:00:00Z', metadata: { keep: 1, ...patch } })),
}));
vi.mock('./storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTThink } from '../models/TTThink';
import { setModelNames } from './aiChatModelStatus';
import {
  aiProviderLabel, chatAiMetadata, chatAiSelection, gnbNotebookName, gnbNotebooks, setChatNotebook,
} from './chatAiSetting';
import { applyDictionaryOverride, resetDictionaryOverride } from '../utils/defaultDictionary';

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { resetDictionaryOverride(); setModelNames('Claude', 'None'); setModelNames('GNB', 'None'); });

it('AI 種別は Default AI のドロップダウンと同じ呼び方', () => {
  expect(['openai', 'anthropic', 'gemini', 'gnb', 'local'].map(p => aiProviderLabel(p as never)))
    .toEqual(['ChatGPT', 'Claude', 'Gemini', 'GNB', 'Local']);
});

it('chatファイルの metadata に AI が無ければ Pane の AI、あればそれを使う', () => {
  const pane = { provider: 'anthropic' as const, model: 'claude-opus-5' };
  expect(chatAiSelection({}, pane)).toEqual(pane);
  expect(chatAiSelection({ provider: 'anthropic', model: 'claude-sonnet-5' }, pane)).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5' });
  // プロバイダだけが違うときのモデルは、そのプロバイダで選ばれているもの
  setModelNames('GNB', 'nb-default');
  expect(chatAiSelection({ provider: 'gnb' }, pane)).toEqual({ provider: 'gnb', model: 'nb-default' });
  // GNB は notebookid を優先する
  expect(chatAiSelection({ provider: 'gnb', model: 'nb-old', notebookid: 'nb-chat' }, pane)).toEqual({ provider: 'gnb', model: 'nb-chat' });
  expect(chatAiSelection({ provider: 'unknown' }, pane)).toEqual(pane);
});

it('新しい chatファイルには作成時の AI を書き、GNB は notebookid も書く', () => {
  expect(chatAiMetadata({ provider: 'openai', model: 'gpt-5.6' })).toEqual({ provider: 'openai', model: 'gpt-5.6' });
  expect(chatAiMetadata({ provider: 'gnb', model: 'nb-1' })).toEqual({ provider: 'gnb', model: 'nb-1', notebookid: 'nb-1' });
});

it('Notebook は Dictionary の ai_settings.gnb.notebookid（名前: ID）から引く', () => {
  // 既定の辞書（docs/DefaultDictionary.yaml）に登録がある
  expect(gnbNotebooks().length).toBeGreaterThan(0);
  expect(gnbNotebookName('06a7574d-c658-426a-9779-d2674f535411')).toBe('AS:公開情報');

  applyDictionaryOverride({ ai_settings: { gnb: { notebookid: { 'ノートA': 'id-a', 'ノートB': 'id-b', 空: '' } } } });
  expect(gnbNotebooks()).toEqual([{ name: 'ノートA', id: 'id-a' }, { name: 'ノートB', id: 'id-b' }]);
  expect(gnbNotebookName('id-b')).toBe('ノートB');
  expect(gnbNotebookName('id-x')).toBeUndefined();
});

it('このチャットの Notebook を metadata に保存する（他の metadata は残す）', async () => {
  const chat = new TTThink(); chat.ID = '2026-11-01-000001'; chat.ContentType = 'chat';
  chat.setContentSilent('ASK:Working｜新しい相談'); chat.Metadata = { thinkConversations: { schemaVersion: 1, turns: [] } };
  chat.markSaved(); chat.markMetadataSaved();
  await setChatNotebook(chat, 'id-a');
  expect(chat.Metadata).toEqual({ thinkConversations: { schemaVersion: 1, turns: [] }, provider: 'gnb', model: 'id-a', notebookid: 'id-a' });
  expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ thinkid: chat.ID, metadata: chat.Metadata }));

  // 本文未取得のときは metadata だけを書き換える
  const meta = new TTThink(); meta.ID = '2026-11-01-000002'; meta.ContentType = 'chat'; meta.IsMetaOnly = true;
  await setChatNotebook(meta, 'id-b');
  expect(storage.updateMetadata).toHaveBeenCalledWith(meta.ID, { provider: 'gnb', model: 'id-b', notebookid: 'id-b' }, undefined);
  expect(meta.Metadata).toMatchObject({ keep: 1, notebookid: 'id-b' });
});
