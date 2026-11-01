/**
 * aiChatModelStatus.ts
 * AIChat のモデル選択を Status 変数として持つ（docs/Thinktank_Status-Action-Binding.md の # Panel AIChat）。
 *
 *   AIChat.ModelNames.{Claude|OpenAI|Gemini|GNB|Local} … モデル ID（GNB は Notebook ID）の CSV。先頭が選択中
 *   {Panel}.AIChat.ModelName                       … そのパネルが使うプロバイダ名（各パネルが保持）
 *
 * CSV は Thinktank>設定>AIモデル設定（または Status）で利用者が入力したものをそのまま一覧とする。
 * 各社のモデル一覧 API は API キーを要するため取得せず、既定値も入れない（未入力は None）。
 * モデルの選択はプロバイダ単位で全パネル共通、どのプロバイダを使うかはパネルごとに決まる。
 * 送信時の { provider, model } は selectionFor() で両者を組み合わせて作る。
 */

import type { AiModelSelection, AiProvider } from './aiModels';

export type AiChatProviderName = 'Claude' | 'OpenAI' | 'Gemini' | 'GNB' | 'Local';

export const AI_CHAT_PROVIDER_NAMES: AiChatProviderName[] = ['Claude', 'OpenAI', 'Gemini', 'GNB', 'Local'];

/** 使えるモデルが無いときの値（Local AI は現時点で常にこれ） */
export const NO_MODEL = 'None';

const PROVIDER_OF: Record<AiChatProviderName, AiProvider> = {
  Claude: 'anthropic',
  OpenAI: 'openai',
  Gemini: 'gemini',
  GNB: 'gnb',
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

/**
 * CSV を「重複なし・先頭が選択中」の形に揃える。旧版の表示名は ID へ読み替え、
 * 空や None だけのときは None にする。
 */
export function normalizeModelNames(csv: string): string {
  const items = csv.split(',').map(s => s.trim()).filter(s => s && s !== NO_MODEL).map(s => LEGACY_NAMES[s] ?? s);
  return [...new Set(items)].join(',') || NO_MODEL;
}

/** CSV に含まれるモデル ID（None は空配列） */
export function modelIdsOf(csv: string): string[] {
  const normalized = normalizeModelNames(csv);
  return normalized === NO_MODEL ? [] : normalized.split(',');
}

// ── 状態（全パネル共通） ─────────────────────────────────────────────────────

const modelNames: Record<AiChatProviderName, string> = {
  Claude: NO_MODEL, OpenAI: NO_MODEL, Gemini: NO_MODEL, GNB: NO_MODEL, Local: NO_MODEL,
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

/** CSV をそのプロバイダのモデル一覧（先頭が選択中）として設定する */
export function setModelNames(name: AiChatProviderName, csv: string): void {
  const next = normalizeModelNames(csv);
  if (modelNames[name] === next) return;
  modelNames[name] = next;
  notify();
}

/** 一覧の中のモデルを選択中（先頭）にする。一覧に無い ID は無視する */
export function selectModel(name: AiChatProviderName, id: string): void {
  const ids = modelIdsOf(modelNames[name]);
  if (!ids.includes(id)) return;
  setModelNames(name, [id, ...ids.filter(n => n !== id)].join(','));
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
 * 指定された { provider, model } を状態へ反映し、そのプロバイダ名を返す。
 * そのモデルをプロバイダの CSV の先頭へ移す（＝同じプロバイダを使う全パネルに効く）。
 * 明示して指定されたモデルなので、一覧に無ければ先頭に加える。
 */
export function applySelection(selection: AiModelSelection): AiChatProviderName {
  const name = providerNameOf(selection.provider);
  const ids = modelIdsOf(modelNames[name]);
  setModelNames(name, [selection.model, ...ids.filter(n => n !== selection.model)].join(','));
  return name;
}

/** 会話画面のモデル選択肢。AIChat.ModelNames.* に載っている ID をプロバイダごとに並べる */
export function modelChoices(): { name: AiChatProviderName; selection: AiModelSelection }[] {
  return AI_CHAT_PROVIDER_NAMES
    .filter(name => name !== 'Local')
    .flatMap(name => modelNames[name].split(',').filter(id => id && id !== NO_MODEL)
      .map(id => ({ name, selection: { provider: PROVIDER_OF[name], model: id } })));
}
