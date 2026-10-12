/**
 * AIModelCatalog.ts
 * 各社 API が返すモデル一覧から、AIChat で選べる「最新の主要モデル」の ID を求める。
 *
 * クライアントはこの一覧を Status AIChat.ModelNames.{Claude|OpenAI|Gemini} に CSV で設定し、
 * 会話の送信時にはここに載っているモデルだけをサーバーが受け付ける（許可リストを兼ねる）。
 * 一覧 API は起動のたびに呼ぶと遅く、障害時に選択肢が消えるため、結果を保持して使い回す。
 */

export type CatalogProvider = 'anthropic' | 'openai' | 'gemini';
export type ModelCatalog = Record<CatalogProvider, string[]>;

// ── 「最新の主要モデル」の絞り込み（純粋関数） ─────────────────────────────

const CLAUDE_TIERS = ['opus', 'sonnet', 'haiku'];

/**
 * Claude: 系列（opus / sonnet / haiku）ごとに最新の版の1つ。
 * 版は名前の数字部分（claude-opus-4-1-20250805 なら 4.1）で比べ、日付は版に含めない。
 * 同じ版に日付なしの別名と日付付きの固定版があれば、別名の方を採る。
 */
export function latestClaudeModels(models: { id: string; created_at?: string }[]): string[] {
  const out: string[] = [];
  for (const tier of CLAUDE_TIERS) {
    const candidates = models
      .map(m => ({ m, parsed: new RegExp(`^claude-${tier}-(\\d+(?:-\\d{1,2})*)(?:-(\\d{8}))?$`).exec(m.id) }))
      .filter((c): c is { m: { id: string; created_at?: string }; parsed: RegExpExecArray } => c.parsed !== null)
      .sort((a, b) => compareVersion(b.parsed[1].replace(/-/g, '.'), a.parsed[1].replace(/-/g, '.'))
        || Number(!!a.parsed[2]) - Number(!!b.parsed[2])
        || (b.m.created_at ?? '').localeCompare(a.m.created_at ?? ''));
    if (candidates[0]) out.push(candidates[0].m.id);
  }
  return out;
}

/** 会話用ではない OpenAI の派生（コード生成・検索・音声・画像など） */
const OPENAI_SPECIAL = ['codex', 'chat', 'search', 'audio', 'realtime', 'tts', 'transcribe', 'image'];
const OPENAI_ORDER = ['', 'mini', 'nano', 'pro'];

/**
 * OpenAI: 最新の大版（gpt-6.x なら 6）について、系統（無印 / mini / nano / pro や sol・luna のような
 * 名前付き）ごとに最新の版を1つ。系統によって小版の進み方が違う（6.1 は sol だけ等）ため、
 * 最新の版番号だけで選ぶと他の系統が消える。日付付きの固定版と用途別の派生は除く。
 */
export function latestOpenAIModels(ids: string[]): string[] {
  const parsed = ids
    .map(id => ({ id, m: /^gpt-((\d+)(?:\.\d+)?)(?:-([a-z]+))?$/.exec(id) }))
    .filter((p): p is { id: string; m: RegExpExecArray } => p.m !== null && !OPENAI_SPECIAL.includes(p.m[3] ?? ''));
  if (parsed.length === 0) return [];
  const major = Math.max(...parsed.map(p => Number(p.m[2])));
  const newestByVariant = new Map<string, { id: string; version: string }>();
  for (const p of parsed.filter(p => Number(p.m[2]) === major)) {
    const variant = p.m[3] ?? '';
    const current = newestByVariant.get(variant);
    if (!current || compareVersion(p.m[1], current.version) > 0) newestByVariant.set(variant, { id: p.id, version: p.m[1] });
  }
  const rank = (variant: string) => { const i = OPENAI_ORDER.indexOf(variant); return i < 0 ? OPENAI_ORDER.length : i; };
  return [...newestByVariant.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([, v]) => v.id);
}

const GEMINI_TIERS = ['flash', 'pro', 'flash-lite'];

/**
 * Gemini: 階層（flash / pro / flash-lite）ごとに最新の安定版1つ。
 * preview / exp / 日付付き / 音声・画像・埋め込み用などの派生は除く。
 */
export function latestGeminiModels(models: { name: string; supportedGenerationMethods?: string[] }[]): string[] {
  const ids = models
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
  const out: string[] = [];
  for (const tier of GEMINI_TIERS) {
    const candidates = ids
      .map(id => new RegExp(`^gemini-(\\d+(?:\\.\\d+)?)-${tier}$`).exec(id))
      .filter((m): m is RegExpExecArray => m !== null)
      .sort((a, b) => compareVersion(b[1], a[1]));
    if (candidates[0]) out.push(candidates[0][0]);
  }
  return out;
}

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ── 一覧 API の呼び出しと保持 ─────────────────────────────────────────────

type Fetch = typeof fetch;

async function getJson(request: Fetch, url: string, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const response = await request(url, { headers, signal, redirect: 'error' });
  if (!response.ok) throw new Error(`model list ${response.status}`);
  return response.json();
}

async function listClaude(key: string, request: Fetch, signal: AbortSignal): Promise<string[]> {
  const data = await getJson(request, 'https://api.anthropic.com/v1/models?limit=1000',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal) as { data?: { id: string; created_at?: string }[] };
  return latestClaudeModels(data.data ?? []);
}

async function listOpenAI(key: string, request: Fetch, signal: AbortSignal): Promise<string[]> {
  const data = await getJson(request, 'https://api.openai.com/v1/models',
    { Authorization: `Bearer ${key}` }, signal) as { data?: { id: string }[] };
  return latestOpenAIModels((data.data ?? []).map(m => m.id));
}

async function listGemini(key: string, request: Fetch, signal: AbortSignal): Promise<string[]> {
  const models: { name: string; supportedGenerationMethods?: string[] }[] = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const data = await getJson(request, url, { 'x-goog-api-key': key }, signal) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string;
    };
    models.push(...(data.models ?? []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return latestGeminiModels(models);
}

const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

export class AIModelCatalog {
  private cache: { at: number; value: ModelCatalog } | null = null;
  private loading: Promise<ModelCatalog> | null = null;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly request: Fetch = fetch) {}

  /** 保持中の一覧（期限切れなら取り直す）。取得に失敗したプロバイダは前回の一覧を使う */
  async get(): Promise<ModelCatalog> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.value;
    this.loading ??= this.load().finally(() => { this.loading = null; });
    return this.loading;
  }

  async allows(provider: string, model: string): Promise<boolean> {
    if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'gemini') return false;
    return (await this.get())[provider].includes(model);
  }

  private async load(): Promise<ModelCatalog> {
    const previous = this.cache?.value;
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const keys = {
      anthropic: this.env.ANTHROPIC_API_KEY?.trim(),
      openai:    this.env.OPENAI_API_KEY?.trim(),
      gemini:    this.env.GEMINI_API_KEY?.trim(),
    };
    const listers: Record<CatalogProvider, (key: string) => Promise<string[]>> = {
      anthropic: key => listClaude(key, this.request, signal),
      openai:    key => listOpenAI(key, this.request, signal),
      gemini:    key => listGemini(key, this.request, signal),
    };
    const providers: CatalogProvider[] = ['anthropic', 'openai', 'gemini'];
    const results = await Promise.all(providers.map(async p => {
      const key = keys[p];
      if (!key) return [];
      try {
        return await listers[p](key);
      } catch (e) {
        console.warn(`[AIModelCatalog] ${p} のモデル一覧を取得できません:`, e instanceof Error ? e.message : e);
        return previous?.[p] ?? [];
      }
    }));
    const value = { anthropic: results[0], openai: results[1], gemini: results[2] };
    this.cache = { at: Date.now(), value };
    return value;
  }
}

export const aiModelCatalog = new AIModelCatalog();
