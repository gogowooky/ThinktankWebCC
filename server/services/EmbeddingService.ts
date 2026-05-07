/**
 * EmbeddingService.ts
 * Phase 15: Google Generative Language API (gemini-embedding-001) でテキストをベクトル化する。
 * 3072次元。GEMINI_API_KEY 環境変数で認証。
 * フォールバック: Vertex AI (GOOGLE_SERVICE_ACCOUNT_KEY) も対応。
 */

import { GoogleAuth } from 'google-auth-library';

const MODEL      = 'gemini-embedding-001';
const DIMENSIONS = 3072;
const MAX_CHARS  = 8000;

// Gemini API (AI Studio) エンドポイント — text-embedding-004 は v1beta が必要
const GEMINI_SINGLE = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;

// Vertex AI エンドポイント — Vertex AI API の有効化が必要
const VERTEX_ENDPOINT = (project: string, region: string, model: string) =>
  `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google/models/${model}:predict`;

interface VertexEmbedResponse {
  predictions: Array<{ embeddings: { values: number[] } }>;
}

export class EmbeddingService {
  private geminiApiKey: string | undefined;
  private vertexAuth: GoogleAuth | null = null;
  private vertexProjectId: string | undefined;
  private vertexRegion = 'us-central1';
  public readonly dimensions = DIMENSIONS;
  public readonly modelName  = MODEL;
  private mode: 'gemini' | 'vertex' | 'none' = 'none';

  async initialize(): Promise<boolean> {
    // 1. Gemini API Key を優先
    this.geminiApiKey = process.env['GEMINI_API_KEY'];
    if (this.geminiApiKey) {
      this.mode = 'gemini';
      console.log(`[EmbeddingService] Initialized (mode: Gemini API, model: ${MODEL})`);
      return true;
    }

    // 2. Vertex AI (service account) にフォールバック
    const credentials = process.env['GOOGLE_SERVICE_ACCOUNT_KEY'];
    if (credentials) {
      try {
        const keyFile = JSON.parse(credentials) as { project_id?: string };
        this.vertexProjectId = keyFile.project_id;
        this.vertexAuth = new GoogleAuth({
          credentials: keyFile,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
        this.mode = 'vertex';
        console.log(`[EmbeddingService] Initialized (mode: Vertex AI, project: ${this.vertexProjectId})`);
        return true;
      } catch (error) {
        console.error('[EmbeddingService] Vertex AI init failed:', error);
      }
    }

    console.warn('[EmbeddingService] No embedding credentials found. Set GEMINI_API_KEY in server/.env');
    return false;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.mode === 'gemini') return this.embedGemini(texts);
    if (this.mode === 'vertex') return this.embedVertex(texts);
    throw new Error('[EmbeddingService] Not initialized. Set GEMINI_API_KEY in server/.env');
  }

  // ── Gemini API (embedContent を並列呼び出し) ─────────────────────────────

  private async embedGemini(texts: string[]): Promise<number[][]> {
    const REQUEST_INTERVAL = 700; // リクエスト間隔 ms（≒85 RPM、課金後も安全圏）
    const results: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i++) {
      results[i] = await this.embedSingle(texts[i]);
      if (i + 1 < texts.length) {
        await new Promise(r => setTimeout(r, REQUEST_INTERVAL));
      }
    }
    return results;
  }

  private async embedSingle(text: string, retries = 8): Promise<number[]> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(`${GEMINI_SINGLE(MODEL)}?key=${this.geminiApiKey}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:    `models/${MODEL}`,
          content:  { parts: [{ text: text.substring(0, MAX_CHARS) }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      });
      if (res.ok) {
        const data = await res.json() as { embedding: { values: number[] } };
        return data.embedding.values;
      }
      if (res.status === 429 && attempt < retries) {
        const wait = Math.min(2000 * 2 ** attempt, 60000); // 2s → 4s → 8s … 最大60s
        console.warn(`[EmbeddingService] Rate limited (429). Retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      const errText = await res.text();
      throw new Error(`[EmbeddingService] Gemini API error ${res.status}: ${errText}`);
    }
    throw new Error('[EmbeddingService] Max retries exceeded');
  }

  // ── Vertex AI ──────────────────────────────────────────────────────────

  private async embedVertex(texts: string[]): Promise<number[][]> {
    if (!this.vertexAuth || !this.vertexProjectId) {
      throw new Error('[EmbeddingService] Vertex AI not initialized');
    }
    const CHUNK = 250;
    const results: number[][] = [];
    const client = await this.vertexAuth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('[EmbeddingService] Failed to get access token');

    const endpoint = VERTEX_ENDPOINT(this.vertexProjectId, this.vertexRegion, MODEL);

    for (let offset = 0; offset < texts.length; offset += CHUNK) {
      const chunk = texts.slice(offset, offset + CHUNK);
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ instances: chunk.map(t => ({ content: t.substring(0, MAX_CHARS), task_type: 'RETRIEVAL_DOCUMENT' })) }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`[EmbeddingService] Vertex API error ${res.status}: ${errText}`);
      }

      const data = await res.json() as VertexEmbedResponse;
      for (const pred of data.predictions) results.push(pred.embeddings.values);
    }
    return results;
  }
}

export const embeddingService = new EmbeddingService();
