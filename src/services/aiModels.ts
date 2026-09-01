/**
 * aiModels.ts
 * AI Chat のホスト（プロバイダ・モデル）選択に関する共有定義。
 *
 * 選択肢はユーザー確認済みの8モデル（Claude 4種・OpenAI 1種・Gemini 3種）。
 * サーバー側 server/config/aiModels.ts に同じ内容の許可リストを持つため、
 * 変更する場合は両方を更新すること。
 */

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface AiModelOption {
  provider: AiProvider;
  model:    string;
  label:    string;
}

export interface AiModelSelection {
  provider: AiProvider;
  model:    string;
}

export const AI_MODEL_OPTIONS: AiModelOption[] = [
  { provider: 'anthropic', model: 'claude-opus-5',    label: 'Claude Opus 5' },
  { provider: 'anthropic', model: 'claude-sonnet-5',  label: 'Claude Sonnet 5' },
  { provider: 'anthropic', model: 'claude-opus-4-8',  label: 'Claude Opus 4.8' },
  { provider: 'anthropic', model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { provider: 'openai',    model: 'gpt-5.6',          label: 'GPT-5.6' },
  { provider: 'gemini',    model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { provider: 'gemini',    model: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro' },
  { provider: 'gemini',    model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

export const DEFAULT_AI_MODEL_SELECTION: AiModelSelection = {
  provider: AI_MODEL_OPTIONS[0].provider,
  model:    AI_MODEL_OPTIONS[0].model,
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Claude',
  openai:    'OpenAI',
  gemini:    'Gemini',
};

/** サーバーで API キーが設定済みか（プロバイダ別）。true のものだけ選択肢に出す。 */
export type AiProviderAvailability = Record<AiProvider, boolean>;

const ALL_PROVIDERS_AVAILABLE: AiProviderAvailability = {
  anthropic: true,
  openai:    true,
  gemini:    true,
};

/**
 * サーバーの /api/chat/providers を叩き、利用可能なプロバイダを返す。
 * 取得失敗時は「全て利用可能」を返す（フェイルオープン）。
 * 実際に使えないプロバイダを選んでも送信はサーバー側で 503 になるだけで、
 * ネットワーク一時障害でドロップダウンが空になるより害が小さい。
 */
export async function fetchAiProviderAvailability(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<AiProviderAvailability> {
  try {
    const res = await apiFetch('/api/chat/providers');
    if (!res.ok) return { ...ALL_PROVIDERS_AVAILABLE };
    const raw = (await res.json()) as Partial<AiProviderAvailability>;
    return {
      anthropic: raw.anthropic === true,
      openai:    raw.openai    === true,
      gemini:    raw.gemini    === true,
    };
  } catch {
    return { ...ALL_PROVIDERS_AVAILABLE };
  }
}

/** 利用可能なプロバイダのモデルだけに絞った選択肢一覧 */
export function availableModelOptions(availability: AiProviderAvailability): AiModelOption[] {
  return AI_MODEL_OPTIONS.filter(o => availability[o.provider]);
}

function isValidSelection(v: unknown): v is AiModelSelection {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s['provider'] === 'string' && typeof s['model'] === 'string' &&
    AI_MODEL_OPTIONS.some(o => o.provider === s['provider'] && o.model === s['model']);
}

/** value="provider:model" 形式の <select> value を分解する */
export function parseSelectionValue(value: string): AiModelSelection | null {
  const idx = value.indexOf(':');
  if (idx < 0) return null;
  const provider = value.slice(0, idx);
  const model    = value.slice(idx + 1);
  const found = AI_MODEL_OPTIONS.find(o => o.provider === provider && o.model === model);
  return found ? { provider: found.provider, model: found.model } : null;
}

export function selectionToValue(selection: AiModelSelection): string {
  return `${selection.provider}:${selection.model}`;
}

/** 選択中モデルの表示名（チャットの発言者名などに使う）。未登録IDはモデルIDをそのまま返す */
export function modelLabel(selection: AiModelSelection): string {
  const found = AI_MODEL_OPTIONS.find(
    o => o.provider === selection.provider && o.model === selection.model,
  );
  return found ? found.label : selection.model;
}

/**
 * AI発言の先頭に付ける「(モデル名)」の1行（末尾の改行を含む）。
 * 発言そのものに含めるので、保管したチャットにもどのモデルの回答かが残る。
 * 表示側はこの行を含む本文をそのまま描画する（発言者名の別表示は持たない）。
 */
export function aiSpeakerPrefix(selection: AiModelSelection): string {
  return `(${modelLabel(selection)})\n`;
}

/**
 * localStorage からパネル別のモデル選択を読み込む。
 * 未選択・不正値・localStorage 利用不可（プライベートモード等）の場合はデフォルトを返す。
 */
export function loadAiModelSelection(storageKey: string): AiModelSelection {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidSelection(parsed)) return parsed;
    }
  } catch {
    // localStorage 利用不可 / JSON 不正 → デフォルトへフォールバック
  }
  return { ...DEFAULT_AI_MODEL_SELECTION };
}

export function saveAiModelSelection(storageKey: string, selection: AiModelSelection): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(selection));
  } catch {
    // 保存できなくても致命的ではない（次回起動時にデフォルトへ戻るだけ）
  }
}
