/**
 * shared/mcp/types.ts
 * MCP の JSON-RPC・ツール・リソースの型と、プロトコル版・サーバー情報。バックエンドとの取り決め（McpBackendAdapter）もここ。
 * 外からは shared/mcpProtocol.ts を通して使う。
 */

import type { VaultThinkMeta } from '../vaultFormat';
import type { DomainProfile, PromotionTargetType } from '../domainProfile';
import type { CitationRef, PromotionCandidate, PromotedRecord, GateRecord } from '../operations';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_SERVER_INFO = {
  name: 'thinktank',
  version: '2.7.0',
};

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
}

export interface McpResourceTemplateDefinition {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType: string;
}

export interface McpThinkRecord {
  meta: VaultThinkMeta;
  body: string;
  support: Record<string, unknown>;
  updatedAt: string;
}

export interface McpProjectContextResult {
  projectId: string;
  title: string;
  updatedAt: string;
  body: string;
  thinkSupport?: Record<string, unknown>;
  relatedThinks: VaultThinkMeta[];
  activePromotedRecords: PromotedRecord[];
  pendingCandidates: PromotionCandidate[];
  gates: GateRecord[];
}

export interface McpCreateThinkParams {
  title: string;
  body?: string;
  category?: 'memo' | 'aiview' | 'task' | 'links' | 'table';
  keywords?: string;
  relatedIds?: string;
  /** 後方互換用。projectIds と併用した場合は両方に登録する。 */
  projectId?: string;
  /** 作成と同時に「# 対象」へ登録する Project（複数可）。 */
  projectIds?: string[];
}

export interface McpUpdateThinkParams {
  thinkid: string;
  expectedVersion: string;
  title?: string;
  body?: string;
  appendBody?: string;
  keywords?: string;
  relatedIds?: string;
}

export interface McpAddPromotionCandidateParams {
  projectId: string;
  type: PromotionTargetType;
  title: string;
  summary: string;
  rationale?: string;
  impactScope?: string;
  proposedOwner?: string;
  dueDate?: string;
  citations?: CitationRef[];
}

export interface McpBackendAdapter {
  search(params: { query: string; limit?: number; category?: string }): Promise<VaultThinkMeta[]>;
  listMeta(params: { projectId?: string; category?: string; limit?: number }): Promise<VaultThinkMeta[]>;
  getRecord(params: { thinkid: string; includeSupport?: boolean }): Promise<McpThinkRecord | null>;
  getProjectContext(params: { projectId: string }): Promise<McpProjectContextResult | null>;
  createThink(params: McpCreateThinkParams): Promise<VaultThinkMeta>;
  updateThink(params: McpUpdateThinkParams): Promise<VaultThinkMeta>;
  addPromotionCandidate(params: McpAddPromotionCandidateParams): Promise<{
    projectId: string;
    candidateId: string;
    updatedAt: string;
    totalPendingCandidates: number;
  }>;
  getDomainProfile(profileId?: string): Promise<DomainProfile>;
  callGoogleWorkspace?(kind: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}
