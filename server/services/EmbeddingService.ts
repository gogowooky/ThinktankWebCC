/**
 * EmbeddingService.ts
 * Phase 15: Google Vertex AI text-embedding-004 を使ってテキストをベクトル化する。
 * 768次元。GOOGLE_SERVICE_ACCOUNT_KEY の service account で認証。
 */

import { GoogleAuth } from 'google-auth-library';

const MODEL       = 'text-embedding-004';
const DIMENSIONS  = 768;
const REGION      = 'us-central1';
const MAX_CHARS   = 8000;
const BATCH_LIMIT = 250; // Vertex AI の1リクエスト上限

interface VertexEmbedInstance {
  content: string;
  task_type?: string;
}

interface VertexEmbedResponse {
  predictions: Array<{
    embeddings: {
      values: number[];
      statistics: { token_count: number; truncated: boolean };
    };
  }>;
}

export class EmbeddingService {
  private auth: GoogleAuth | null = null;
  private projectId: string | undefined;
  public readonly dimensions = DIMENSIONS;

  async initialize(): Promise<boolean> {
    try {
      const credentials = process.env['GOOGLE_SERVICE_ACCOUNT_KEY'];
      if (!credentials) {
        console.error('[EmbeddingService] GOOGLE_SERVICE_ACCOUNT_KEY not set');
        return false;
      }
      const keyFile = JSON.parse(credentials) as { project_id?: string };
      this.projectId = keyFile.project_id;
      this.auth = new GoogleAuth({
        credentials: keyFile,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      console.log(`[EmbeddingService] Initialized (project: ${this.projectId}, model: ${MODEL})`);
      return true;
    } catch (error) {
      console.error('[EmbeddingService] Initialization failed:', error);
      return false;
    }
  }

  private get endpoint(): string {
    return `https://${REGION}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${REGION}/publishers/google/models/${MODEL}:predict`;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.auth || !this.projectId) throw new Error('[EmbeddingService] Not initialized');

    const client = await this.auth.getClient();
    const tokenResult = await client.getAccessToken();
    const token = tokenResult.token;
    if (!token) throw new Error('[EmbeddingService] Failed to get access token');

    const results: number[][] = [];

    // BATCH_LIMIT ごとに分割してリクエスト
    for (let offset = 0; offset < texts.length; offset += BATCH_LIMIT) {
      const chunk = texts.slice(offset, offset + BATCH_LIMIT);
      const instances: VertexEmbedInstance[] = chunk.map(t => ({
        content: t.substring(0, MAX_CHARS),
        task_type: 'RETRIEVAL_DOCUMENT',
      }));

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ instances }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`[EmbeddingService] API error ${res.status}: ${body}`);
      }

      const data = await res.json() as VertexEmbedResponse;
      for (const pred of data.predictions) {
        results.push(pred.embeddings.values);
      }
    }

    return results;
  }
}

export const embeddingService = new EmbeddingService();
