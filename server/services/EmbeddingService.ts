/**
 * EmbeddingService.ts
 * Phase 15: Google Generative Language API (text-embedding-004) でテキストをベクトル化する。
 * 768次元。GEMINI_API_KEY 環境変数で認証。
 * フォールバック: Vertex AI (GOOGLE_SERVICE_ACCOUNT_KEY) も対応。
 */

import { GoogleAuth } from 'google-auth-library';

const MODEL      = 'text-embedding-004';
const DIMENSIONS = 768;
const MAX_CHARS  = 8000;

// Gemini API (AI Studio) エンドポイント — 無料枠あり、API キーのみで利用可能
const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;

// Vertex AI エンドポイント — Vertex AI API の有効化が必要
const VERTEX_ENDPOINT = (project: string, region: string, model: string) =>
  `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google/models/${model}:predict`;

interface GeminiEmbedRequest {
  requests: Array<{ model: string; content: { parts: Array<{ text: string }> }; taskType?: string }>;
}

interface GeminiEmbedResponse {
  embeddings: Array<{ values: number[] }>;
}

interface VertexEmbedResponse {
  predictions: Array<{ embeddings: { values: number[] } }>;
}

export class EmbeddingService {
  private geminiApiKey: string | undefined;
  private vertexAuth: GoogleAuth | null = null;
  private vertexProjectId: string | undefined;
  private vertexRegion = 'us-central1';
  public readonly dimensions = DIMENSIONS;
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

  // ── Gemini API (batchEmbedContents) ──────────────────────────────────────

  private async embedGemini(texts: string[]): Promise<number[][]> {
    const CHUNK = 100; // Gemini の batchEmbedContents 上限
    const results: number[][] = [];

    for (let offset = 0; offset < texts.length; offset += CHUNK) {
      const chunk = texts.slice(offset, offset + CHUNK);
      const body: GeminiEmbedRequest = {
        requests: chunk.map(t => ({
          model:    `models/${MODEL}`,
          content:  { parts: [{ text: t.substring(0, MAX_CHARS) }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        })),
      };

      const res = await fetch(`${GEMINI_ENDPOINT(MODEL)}?key=${this.geminiApiKey}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`[EmbeddingService] Gemini API error ${res.status}: ${errText}`);
      }

      const data = await res.json() as GeminiEmbedResponse;
      for (const emb of data.embeddings) results.push(emb.values);
    }
    return results;
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
