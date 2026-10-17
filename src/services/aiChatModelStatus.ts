/**
 * aiChatModelStatus.ts
 * AIChat のモデル選択を Status 変数として持つ（docs/Thinktank_Status-Action-Binding.md の # Panel AIChat）。
 *
 *   AIChat.ModelNames.{Claude|OpenAI|Gemini|Local} … そのプロバイダで今使える主要モデルの ID の CSV。先頭が選択中
 *   {Panel}.AIChat.ModelName                       … そのパネルが使うプロバイダ名（各パネルが保持）
 *
 * 使えるモデルの一覧は AI_MODEL_CATALOG を起動時に反映する（applyAiModelCatalog）。
 * モデルの選択はプロバイダ単位で全パネル共通、どのプロバイダを使うかはパネルごとに決まる。
 * 送信時の { provider, model } は selectionFor() で両者を組み合わせて作る。
 */

import type { AiModelSelection, AiProvider } from './aiModels';

export type AiChatProviderName = 'Claude' | 'OpenAI' | 'Gemini' | 'Local';

export const AI_CHAT_PROVIDER_NAMES: AiChatProviderName[] = ['Claude', 'OpenAI', 'Gemini', 'Local'];

/** 使えるモデルが無いときの値（Local AI は現時点で常にこれ） */
export const NO_MODEL = 'None';

const PROVIDER_OF: Record<AiChatProviderName, AiProvider> = {
  Claude: 'anthropic',
  OpenAI: 'openai',
  Gemini: 'gemini',
  Local:  'local',
};

/** 旧版はプロバイダ名を除いた表示名を保存していた。読み込み時に ID へ読み替える */
const LEGACY_NAMES: Record<string, string> = {
  'Opus 5': 'claude-opus-5', 'Sonnet 5': 'claude-sonnet-5', 'Opus 4.8': 'claude-opus-4-8', 'Haiku 4.5': 'claude-haiku-4-5',
  'GPT-5.6': 'gpt-5.6', '3.5 Flash': 'gemini-3.5-flash', '2.5 Pro': 'gemini-2.5-pro', '2.0 Flash': 'gemini-2.0-flash',
};

export function providerNameOf(provider: AiProvider): AiChatProviderName {
  return AI_CHAT_PROVIDER_NAMES.find(n => PROVIDER_OF[n] === provider) ?? 'Claude';
}

export function providerOf(name: AiChatProviderName): AiProvider {
  return PROVIDER_OF[name];
}

export function isProviderName(value: string): value is AiChatProviderName {
  return (AI_CHAT_PROVIDER_NAMES as string[]).includes(value);
}

// ── 使えるモデルの一覧（サーバーから取得） ─────────────────────────────────

/** null = まだ取得していない（その間は保存済みの値をそのまま使う） */
const available: Record<AiChatProviderName, string[] | null> = {
  Claude: null, OpenAI: null, Gemini: null, Local: [NO_MODEL],
};

export function availableModels(name: AiChatProviderName): string[] | null {
  return available[name];
}

/**
 * CSV を「使えるモデルすべて・先頭が選択中」の形に揃える。
 * 先頭が一覧にあればそれを選択中として残し、一覧の残りを後ろに並べる。一覧に無い ID は捨てる
 * （提供終了やタイプミスで送信先が壊れないように）。一覧の取得前は並びを変えない。
 */
export function normalizeModelNames(name: AiChatProviderName, csv: string, list = available[name]): string {
  const items = csv.split(',').map(s => s.trim()).filter(Boolean).map(s => LEGACY_NAMES[s] ?? s);
  if (list === null) return items.join(',') || NO_MODEL;
  if (list.length === 0) return NO_MODEL;
  const first = items.find(s => list.includes(s)) ?? list[0];
  return [first, ...list.filter(n => n !== first)].join(',');
}

// ── 状態（全パネル共通） ─────────────────────────────────────────────────────

const modelNames: Record<AiChatProviderName, string> = {
  Claude: NO_MODEL, OpenAI: NO_MODEL, Gemini: NO_MODEL, Local: NO_MODEL,
};

export function getModelNames(name: AiChatProviderName): string {
  return modelNames[name];
}

const listeners = new Set<() => void>();

/** モデル選択や一覧が変わったときに呼ばれる。同じプロバイダを使う他パネルの表示更新に使う */
export function onModelNamesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify(): void {
  for (const l of listeners) l();
}

export function setModelNames(name: AiChatProviderName, csv: string): void {
  const next = normalizeModelNames(name, csv);
  if (modelNames[name] === next) return;
  modelNames[name] = next;
  notify();
}

/** サーバーから得た一覧を反映し、保存済みの選択を残したまま CSV を揃え直す */
export function setAvailableModels(name: AiChatProviderName, ids: string[]): void {
  if (name === 'Local') return;
  available[name] = ids;
  modelNames[name] = normalizeModelNames(name, modelNames[name]);
  notify();
}

/** パネルのプロバイダ名から、送信に使う { provider, model } を作る */
export function selectionFor(name: AiChatProviderName): AiModelSelection {
  return { provider: PROVIDER_OF[name], model: modelNames[name].split(',')[0] || NO_MODEL };
}

/** そのプロバイダに送信できるモデルがあるか（Local や API キー未設定の社は false） */
export function canSend(name: AiChatProviderName): boolean {
  return name !== 'Local' && selectionFor(name).model !== NO_MODEL;
}

/**
 * 画面で選んだ { provider, model } を状態へ反映し、そのプロバイダ名を返す。
 * 選んだモデルをそのプロバイダの CSV の先頭へ移す（＝同じプロバイダを使う全パネルに効く）。
 */
export function applySelection(selection: AiModelSelection): AiChatProviderName {
  const name = providerNameOf(selection.provider);
  setModelNames(name, selection.model);
  return name;
}

/** 会話画面のモデル選択肢。AIChat.ModelNames.* に載っている ID をプロバイダごとに並べる */
export function modelChoices(): { name: AiChatProviderName; selection: AiModelSelection }[] {
  return AI_CHAT_PROVIDER_NAMES
    .filter(name => name !== 'Local')
    .flatMap(name => modelNames[name].split(',').filter(id => id && id !== NO_MODEL)
      .map(id => ({ name, selection: { provider: PROVIDER_OF[name], model: id } })));
}

/**
 * 各社の主要モデル。AI は各社の CLI で実行するため、ここに無いモデルも CLI 側で指定できる。
 * モデル一覧 API は API キーを要するので、取得せずにこの一覧を使う。
 */
export const AI_MODEL_CATALOG: Readonly<Record<AiProvider, readonly string[]>> = {
  anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-haiku-4-5'],
  openai: ['gpt-5.6'],
  gemini: ['gemini-3.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  local: [NO_MODEL],
};

/** 起動時に呼ぶ。保存済みの選択を先頭に残したまま、各社の一覧を catalog に揃える */
export function applyAiModelCatalog(catalog: Readonly<Partial<Record<AiProvider, readonly string[]>>> = AI_MODEL_CATALOG): void {
  for (const name of AI_CHAT_PROVIDER_NAMES) {
    const ids = catalog[PROVIDER_OF[name]];
    if (ids) setAvailableModels(name, [...ids]);
  }
}
