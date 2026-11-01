/**
 * chatAiSetting.ts
 * chatファイルごとの AI（metadata の provider / model / notebookid）。
 *
 *   provider   … AiProvider（anthropic / openai / gemini / gnb / local）
 *   model      … 送信に使うモデル ID（GNB は Notebook ID）
 *   notebookid … GNB で使う Notebook ID（Dictionary ai_settings.gnb.notebookid の値）
 *
 * 書かれていない項目は、Pane の AI（Thinktank>設定>Default AI の Panes と AIモデル設定）に従う。
 */

import type { TTThink } from '../models/TTThink';
import type { AiModelSelection, AiProvider } from './aiModels';
import { NO_MODEL, providerNameOf, selectionFor, type AiChatProviderName } from './aiChatModelStatus';
import { lookupDictionary } from '../utils/defaultDictionary';
import { StorageManager } from './storage/StorageManager';

export const CHAT_AI_PROVIDER_KEY = 'provider';
export const CHAT_AI_MODEL_KEY = 'model';
export const CHAT_AI_NOTEBOOK_KEY = 'notebookid';

/** Dictionary で GNB の Notebook 名 → Notebook ID を引くキー */
export const GNB_NOTEBOOK_DICTIONARY_KEY = 'ai_settings.gnb.notebookid';

const PROVIDERS: readonly AiProvider[] = ['anthropic', 'openai', 'gemini', 'gnb', 'local'];

/** Thinktank>設定>Default AI のドロップダウンと同じ呼び方 */
const PROVIDER_LABELS: Record<AiChatProviderName, string> = {
  OpenAI: 'ChatGPT', Claude: 'Claude', Gemini: 'Gemini', GNB: 'GNB', Local: 'Local',
};

export function aiProviderLabel(provider: AiProvider): string {
  return PROVIDER_LABELS[providerNameOf(provider)];
}

/** GNB（Gemini Notebook）の Notebook のページ。ID が無ければトップ */
export function geminiNotebookUrl(notebookId: string): string {
  const id = notebookId.trim();
  return id ? `https://notebook.google.com/notebook/${encodeURIComponent(id)}` : 'https://notebook.google.com/';
}

const PROVIDER_SITES: Partial<Record<AiProvider, string>> = {
  openai: 'https://chatgpt.com/',
  anthropic: 'https://claude.ai/',
  gemini: 'https://gemini.google.com/',
};

/** AI 種別の Web サイト。GNB は使っている Notebook のページ。Local は無い */
export function aiProviderSiteUrl(selection: AiModelSelection): string | null {
  if (selection.provider === 'gnb') return geminiNotebookUrl(selection.model === NO_MODEL ? '' : selection.model);
  return PROVIDER_SITES[selection.provider] ?? null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

/** そのプロバイダで今選ばれているモデル（AIモデル設定の CSV の先頭） */
function currentModelOf(provider: AiProvider): string {
  return selectionFor(providerNameOf(provider)).model;
}

/** chatファイルに設定されている AI。metadata に無い項目は fallback（Pane の AI）に従う */
export function chatAiSelection(metadata: Record<string, unknown> | undefined, fallback: AiModelSelection): AiModelSelection {
  const meta = metadata ?? {};
  const provider = isAiProvider(meta[CHAT_AI_PROVIDER_KEY]) ? meta[CHAT_AI_PROVIDER_KEY] as AiProvider : fallback.provider;
  const ownModel = meta[CHAT_AI_PROVIDER_KEY] === provider ? text(meta[CHAT_AI_MODEL_KEY]) : '';
  const inherited = fallback.provider === provider ? fallback.model : currentModelOf(provider);
  if (provider === 'gnb') {
    return { provider, model: text(meta[CHAT_AI_NOTEBOOK_KEY]) || ownModel || inherited || NO_MODEL };
  }
  return { provider, model: ownModel || inherited || NO_MODEL };
}

/** 新しい chatファイルに書く metadata（作成時の Pane の AI を記録する） */
export function chatAiMetadata(selection: AiModelSelection): Record<string, string> {
  return {
    [CHAT_AI_PROVIDER_KEY]: selection.provider,
    [CHAT_AI_MODEL_KEY]: selection.model,
    ...(selection.provider === 'gnb' ? { [CHAT_AI_NOTEBOOK_KEY]: selection.model } : {}),
  };
}

export interface GnbNotebook {
  name: string;
  id: string;
}

/** Dictionary ai_settings.gnb.notebookid に登録された Notebook（名前: ID の対応表、記述順） */
export function gnbNotebooks(): GnbNotebook[] {
  const table = lookupDictionary(GNB_NOTEBOOK_DICTIONARY_KEY);
  if (!table || typeof table !== 'object' || Array.isArray(table)) return [];
  return Object.entries(table as Record<string, unknown>)
    .flatMap(([name, id]) => (typeof id === 'string' && id.trim() ? [{ name, id: id.trim() }] : []));
}

/** Notebook ID から Dictionary の Notebook 名を引く。登録が無ければ undefined */
export function gnbNotebookName(id: string): string | undefined {
  return gnbNotebooks().find(nb => nb.id === id)?.name;
}

/** 会話画面で選べる AI 種別（Thinktank>設定>Default AI のドロップダウンと同じ並び） */
export const CHAT_AI_PROVIDER_CHOICES: readonly AiProvider[] = ['openai', 'anthropic', 'gemini', 'gnb', 'local'];

/** このチャットの GNB で使う Notebook ID を metadata に書く */
export function setChatNotebook(think: TTThink, notebookId: string): Promise<void> {
  return writeChatAi(think, {
    [CHAT_AI_PROVIDER_KEY]: 'gnb',
    [CHAT_AI_MODEL_KEY]: notebookId,
    [CHAT_AI_NOTEBOOK_KEY]: notebookId,
  });
}

/**
 * このチャットの AI 種別を metadata に書く。モデルはその種別で今選ばれているもの
 * （AIモデル設定の先頭）。GNB はこのチャットに設定済みの Notebook があればそれを使う
 */
export function setChatProvider(think: TTThink, provider: AiProvider, fallback: AiModelSelection): Promise<void> {
  const notebookId = text(think.Metadata?.[CHAT_AI_NOTEBOOK_KEY]);
  if (provider === 'gnb' && notebookId) return setChatNotebook(think, notebookId);
  const model = fallback.provider === provider ? fallback.model : currentModelOf(provider);
  return writeChatAi(think, {
    [CHAT_AI_PROVIDER_KEY]: provider,
    [CHAT_AI_MODEL_KEY]: model,
    ...(provider === 'gnb' && model !== NO_MODEL ? { [CHAT_AI_NOTEBOOK_KEY]: model } : {}),
  });
}

async function writeChatAi(think: TTThink, patch: Record<string, string>): Promise<void> {
  if (think.IsMetaOnly) {
    // 本文未取得のまま Think 全体を保存すると本文を失うので、metadata だけを書き換える
    const saved = await StorageManager.instance.updateMetadata(think.ID, patch, think.UpdatedAt || undefined);
    think.Metadata = saved.metadata ?? { ...think.Metadata, ...patch };
    think.markMetadataSaved();
    if (saved.updatedAt) think.UpdatedAt = saved.updatedAt;
    return;
  }
  const previous = think.Metadata;
  think.Metadata = { ...previous, ...patch };
  try { await think.SaveContent(); }
  catch (error) { think.Metadata = previous; throw error; }
}
