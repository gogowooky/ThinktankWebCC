/**
 * shared/mcpProtocol.ts
 * Thinktank を Model Context Protocol (MCP) サーバーとして AI CLI（claude / codex / antigravity）へ
 * 公開するための JSON-RPC 2.0 プロトコル処理、ツール・リソーススキーマ定義、および実行ディスパッチャ。
 *
 * ガバナンス原則（Human-in-the-Loop）:
 * - 検索・閲覧・新規Think作成・昇格候補（pending_review）の提案は AI に許可する。
 * - 公式レコードへの昇格承認（approvePromotionCandidate）、Gate通過承認（updateGateStatus）、
 *   および既存Thinkの削除（deleteRecord）は人間専用の操作とし、MCPツールとして公開しない。
 * - 既存Thinkの更新（thinktank_update_think）には expectedVersion（楽観ロック）を必須とし、
 *   画面で人間が未保存編集中（dirty）のThinkに対する上書きは拒否する。
 */

import type { VaultThinkMeta } from './vaultFormat';
import { isSafeThinkId } from './vaultFormat';
import type { DomainProfile, PromotionTargetType } from './domainProfile';
import type { CitationRef, PromotionCandidate, PromotedRecord, GateRecord } from './operations';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_SERVER_INFO = {
  name: 'thinktank',
  version: '2.6.4',
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
  category?: 'memo' | 'task' | 'links' | 'table';
  keywords?: string;
  relatedIds?: string;
  projectId?: string;
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
}

export const THINKTANK_MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'thinktank_search',
    description:
      'Thinktank Vault内のThink（メモ・課題・Project・チャット等）をキーワード・タグ・カテゴリ指定で全文検索し、一致したメタデータ一覧を返す。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '検索クエリ（スペース区切りでAND検索、#タグ、category:memo 等の指定が可能）',
        },
        category: {
          type: 'string',
          description: '絞り込むカテゴリ（memo, task, project, chat, links, table 等。省略時は全件）',
        },
        limit: {
          type: 'number',
          description: '最大取得件数（既定: 50、最大: 200）',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_list_meta',
    description:
      'Vault内の最新Thinkメタデータ一覧、または指定した projectId（Project）に紐づく関連Think一覧を取得する。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: '特定のProjectに属するThink一覧を取得する場合のthinkid',
        },
        category: {
          type: 'string',
          description: 'カテゴリによる絞り込み（memo, task, project, chat 等）',
        },
        limit: {
          type: 'number',
          description: '最大取得件数（既定: 50、最大: 200）',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_get_record',
    description:
      '指定した thinkid のThinkレコード全文（タイトル・本文・メタデータ・思考支援情報・updatedAt）を取得する。',
    inputSchema: {
      type: 'object',
      properties: {
        thinkid: {
          type: 'string',
          description: '取得対象のThink ID（例: 2026-10-19-100000）',
        },
        includeSupport: {
          type: 'boolean',
          description: '思考支援・業務管理メタデータ（support）を含めるか（既定: true）',
        },
      },
      required: ['thinkid'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_get_project_context',
    description:
      '指定した projectId（Project）の全体文脈（目標・フェーズ・次アクション・関連Think一覧・公式レコード・昇格候補・Gate状態）を一括取得する。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: '対象のProjectのthinkid',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_create_think',
    description:
      '新しいThink（メモ・課題等）をVaultに作成し、必要に応じて指定した projectId（Project）に関連付ける。',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '新規Thinkのタイトル（1行目）',
        },
        body: {
          type: 'string',
          description: 'Thinkの本文（Markdown形式）',
        },
        category: {
          type: 'string',
          enum: ['memo', 'task', 'links', 'table'],
          description: 'Thinkの種別（既定: memo）',
        },
        keywords: {
          type: 'string',
          description: 'カンマ区切りのキーワード・タグ',
        },
        relatedIds: {
          type: 'string',
          description: '関連するThink ID（カンマ区切り）',
        },
        projectId: {
          type: 'string',
          description: '作成したThinkを自動的に紐づける親Projectのthinkid',
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_update_think',
    description:
      '既存Thinkのタイトル・本文・キーワードを更新する。事前に thinktank_get_record で取得した expectedVersion（updatedAt）が必須。人間が画面で未保存編集中のThinkは保護のため更新できない。',
    inputSchema: {
      type: 'object',
      properties: {
        thinkid: {
          type: 'string',
          description: '更新対象のthinkid',
        },
        expectedVersion: {
          type: 'string',
          description: '楽観ロック用の現在バージョン（thinktank_get_record で取得した updatedAt）',
        },
        title: {
          type: 'string',
          description: '新しいタイトル（省略時は既存タイトルを維持）',
        },
        body: {
          type: 'string',
          description: '本文全体を置き換える場合の新しい本文（appendBody と同時指定不可）',
        },
        appendBody: {
          type: 'string',
          description: '既存の本文末尾に追記するテキスト（body と同時指定不可）',
        },
        keywords: {
          type: 'string',
          description: '新しいキーワード（省略時は既存を維持）',
        },
        relatedIds: {
          type: 'string',
          description: '新しい関連ID（省略時は既存を維持）',
        },
      },
      required: ['thinkid', 'expectedVersion'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_add_promotion_candidate',
    description:
      '対話や資料分析から抽出した重要決定（decision）・根拠（evidence）・リスク（risk）・前提（assumption）・アクション（action）・知見（learning）を、指定Projectの昇格候補（pending_review：人間によるレビュー待ち）として登録する。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: '登録先Projectのthinkid',
        },
        type: {
          type: 'string',
          enum: ['decision', 'evidence', 'risk', 'assumption', 'action', 'gate_result', 'learning'],
          description: '昇格候補の種別',
        },
        title: {
          type: 'string',
          description: '昇格候補の簡潔なタイトル',
        },
        summary: {
          type: 'string',
          description: '要旨・結論',
        },
        rationale: {
          type: 'string',
          description: '背景・理由・根拠',
        },
        impactScope: {
          type: 'string',
          description: '影響範囲',
        },
        proposedOwner: {
          type: 'string',
          description: '想定担当者または決定者ロール',
        },
        dueDate: {
          type: 'string',
          description: '期限（任意）',
        },
        citations: {
          type: 'array',
          description: '根拠となったThinkの引用リスト',
          items: {
            type: 'object',
            properties: {
              sourceThinkid: { type: 'string' },
              sourceTitle: { type: 'string' },
              snippet: { type: 'string' },
            },
            required: ['sourceThinkid'],
          },
        },
      },
      required: ['projectId', 'type', 'title', 'summary'],
      additionalProperties: false,
    },
  },
];

export const THINKTANK_MCP_RESOURCE_TEMPLATES: readonly McpResourceTemplateDefinition[] = [
  {
    uriTemplate: 'thinktank://think/{thinkid}',
    name: 'Think Record',
    description: '指定した thinkid のThinkレコード（メタデータ・本文・思考支援情報）',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'thinktank://profile/{profileId}',
    name: 'Domain Profile',
    description: 'Thinktank ドメインプロファイル定義（clinical-trial / elderly-support 等）',
    mimeType: 'application/json',
  },
];

const VALID_PROMOTION_TYPES: ReadonlySet<PromotionTargetType> = new Set([
  'decision',
  'evidence',
  'risk',
  'assumption',
  'action',
  'gate_result',
  'learning',
]);

const VALID_CREATE_CATEGORIES: ReadonlySet<'memo' | 'task' | 'links' | 'table'> = new Set([
  'memo',
  'task',
  'links',
  'table',
]);

function clampLimit(raw: unknown, defaultLimit = 50, maxLimit = 200): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return defaultLimit;
  return Math.min(Math.floor(num), maxLimit);
}

function resolveProjectIdArg(args: Record<string, unknown>): string | undefined {
  const raw = typeof args.projectId === 'string' && args.projectId.trim()
    ? args.projectId.trim()
    : typeof args.bundleId === 'string' && args.bundleId.trim()
      ? args.bundleId.trim()
      : undefined;
  return raw;
}

function formatToolResult(payload: unknown, isError = false): {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
} {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * MCP の `tools/call` を処理し、バリデーションとバックエンド呼び出しを行う。
 */
export async function executeMcpToolCall(
  name: string,
  rawArgs: Record<string, unknown> | undefined,
  backend: McpBackendAdapter,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const args = rawArgs ?? {};
  try {
    switch (name) {
      case 'thinktank_search': {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        const category = typeof args.category === 'string' && args.category.trim() ? args.category.trim() : undefined;
        const limit = clampLimit(args.limit, 50, 200);
        const results = await backend.search({ query, limit, category });
        return formatToolResult({
          count: results.length,
          items: results,
        });
      }

      case 'thinktank_list_meta': {
        const projectId = resolveProjectIdArg(args);
        if (projectId && !isSafeThinkId(projectId)) {
          return formatToolResult(`不正な projectId です: ${projectId}`, true);
        }
        const category = typeof args.category === 'string' && args.category.trim() ? args.category.trim() : undefined;
        const limit = clampLimit(args.limit, 50, 200);
        const items = await backend.listMeta({ projectId, category, limit });
        return formatToolResult({
          count: items.length,
          items,
        });
      }

      case 'thinktank_get_record': {
        const thinkid = typeof args.thinkid === 'string' ? args.thinkid.trim() : '';
        if (!isSafeThinkId(thinkid)) {
          return formatToolResult(`不正な thinkid です: ${thinkid}`, true);
        }
        const includeSupport = args.includeSupport !== false;
        const record = await backend.getRecord({ thinkid, includeSupport });
        if (!record) {
          return formatToolResult(`指定された Think が見つかりません: ${thinkid}`, true);
        }
        return formatToolResult(record);
      }

      case 'thinktank_get_project_context': {
        const projectId = resolveProjectIdArg(args) ?? '';
        if (!isSafeThinkId(projectId)) {
          return formatToolResult(`不正な projectId です: ${projectId}`, true);
        }
        const ctx = await backend.getProjectContext({ projectId });
        if (!ctx) {
          return formatToolResult(`指定された Project が見つかりません: ${projectId}`, true);
        }
        return formatToolResult(ctx);
      }

      case 'thinktank_create_think': {
        const title = typeof args.title === 'string' ? args.title.replace(/[\r\n]+/g, ' ').trim() : '';
        if (!title) {
          return formatToolResult('新規 Think の作成には title が必須です。', true);
        }
        const rawCategory = typeof args.category === 'string' ? args.category.trim() : 'memo';
        const category = VALID_CREATE_CATEGORIES.has(rawCategory as 'memo' | 'task' | 'links' | 'table')
          ? (rawCategory as 'memo' | 'task' | 'links' | 'table')
          : 'memo';
        const body = typeof args.body === 'string' ? args.body : '';
        const keywords = typeof args.keywords === 'string' ? args.keywords.trim() : undefined;
        const relatedIds = typeof args.relatedIds === 'string' ? args.relatedIds.trim() : undefined;
        const projectId = resolveProjectIdArg(args);
        if (projectId && !isSafeThinkId(projectId)) {
          return formatToolResult(`不正な projectId です: ${projectId}`, true);
        }
        const saved = await backend.createThink({
          title,
          body,
          category,
          keywords,
          relatedIds,
          projectId,
        });
        return formatToolResult({
          ok: true,
          created: saved,
        });
      }

      case 'thinktank_update_think': {
        const thinkid = typeof args.thinkid === 'string' ? args.thinkid.trim() : '';
        if (!isSafeThinkId(thinkid)) {
          return formatToolResult(`不正な thinkid です: ${thinkid}`, true);
        }
        const expectedVersion = typeof args.expectedVersion === 'string' ? args.expectedVersion.trim() : '';
        if (!expectedVersion) {
          return formatToolResult(
            '既存 Think の更新には expectedVersion（取得時の updatedAt）の指定が必須です。',
            true,
          );
        }
        if (args.body !== undefined && args.appendBody !== undefined) {
          return formatToolResult('body と appendBody は同時に指定できません。', true);
        }
        const saved = await backend.updateThink({
          thinkid,
          expectedVersion,
          title: typeof args.title === 'string' ? args.title.replace(/[\r\n]+/g, ' ').trim() : undefined,
          body: typeof args.body === 'string' ? args.body : undefined,
          appendBody: typeof args.appendBody === 'string' ? args.appendBody : undefined,
          keywords: typeof args.keywords === 'string' ? args.keywords : undefined,
          relatedIds: typeof args.relatedIds === 'string' ? args.relatedIds : undefined,
        });
        return formatToolResult({
          ok: true,
          updated: saved,
        });
      }

      case 'thinktank_add_promotion_candidate': {
        const projectId = resolveProjectIdArg(args) ?? '';
        if (!isSafeThinkId(projectId)) {
          return formatToolResult(`不正な projectId です: ${projectId}`, true);
        }
        const rawType = typeof args.type === 'string' ? args.type.trim() : '';
        if (!VALID_PROMOTION_TYPES.has(rawType as PromotionTargetType)) {
          return formatToolResult(`不正な昇格候補 type です: ${rawType}`, true);
        }
        const title = typeof args.title === 'string' ? args.title.trim() : '';
        const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
        if (!title || !summary) {
          return formatToolResult('昇格候補の登録には title と summary が必須です。', true);
        }
        const citations: CitationRef[] = [];
        if (Array.isArray(args.citations)) {
          for (const item of args.citations) {
            if (!item || typeof item !== 'object') continue;
            const c = item as Record<string, unknown>;
            const sourceThinkid = typeof c.sourceThinkid === 'string' ? c.sourceThinkid.trim() : '';
            if (!sourceThinkid) continue;
            citations.push({
              sourceThinkid,
              sourceTitle: typeof c.sourceTitle === 'string' ? c.sourceTitle.trim() : undefined,
              snippet: typeof c.snippet === 'string' ? c.snippet.trim() : undefined,
            });
          }
        }
        const res = await backend.addPromotionCandidate({
          projectId,
          type: rawType as PromotionTargetType,
          title,
          summary,
          rationale: typeof args.rationale === 'string' ? args.rationale.trim() : undefined,
          impactScope: typeof args.impactScope === 'string' ? args.impactScope.trim() : undefined,
          proposedOwner: typeof args.proposedOwner === 'string' ? args.proposedOwner.trim() : undefined,
          dueDate: typeof args.dueDate === 'string' ? args.dueDate.trim() : undefined,
          citations,
        });
        return formatToolResult({
          ok: true,
          status: 'pending_review',
          ...res,
        });
      }

      default:
        return formatToolResult(`未知の MCP ツールです: ${name}`, true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return formatToolResult(`ツール実行エラー (${name}): ${message}`, true);
  }
}

/**
 * MCP JSON-RPC 2.0 リクエスト1件を処理し、レスポンスを返す（Notification の場合は null）。
 */
export async function handleMcpJsonRpcMessage(
  request: McpJsonRpcRequest,
  backend: McpBackendAdapter,
): Promise<McpJsonRpcResponse | null> {
  if (!request || typeof request !== 'object' || typeof request.method !== 'string') {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    };
  }

  // Notification（id が存在しない、または notifications/ で始まる）はレスポンスを返さない
  if (request.id === undefined || request.method.startsWith('notifications/')) {
    return null;
  }

  const id = request.id ?? null;
  const params = request.params ?? {};

  try {
    switch (request.method) {
      case 'initialize': {
        const clientProtocol =
          typeof params.protocolVersion === 'string' && params.protocolVersion.trim()
            ? params.protocolVersion.trim()
            : MCP_PROTOCOL_VERSION;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: clientProtocol,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
            },
            serverInfo: MCP_SERVER_INFO,
          },
        };
      }

      case 'ping': {
        return {
          jsonrpc: '2.0',
          id,
          result: {},
        };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: THINKTANK_MCP_TOOLS,
          },
        };
      }

      case 'tools/call': {
        const toolName = typeof params.name === 'string' ? params.name : '';
        const toolArgs =
          params.arguments && typeof params.arguments === 'object'
            ? (params.arguments as Record<string, unknown>)
            : undefined;
        const callResult = await executeMcpToolCall(toolName, toolArgs, backend);
        return {
          jsonrpc: '2.0',
          id,
          result: callResult,
        };
      }

      case 'resources/templates/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resourceTemplates: THINKTANK_MCP_RESOURCE_TEMPLATES,
          },
        };
      }

      case 'resources/list': {
        const metas = await backend.listMeta({ limit: 30 });
        const profile = await backend.getDomainProfile();
        const resources: McpResourceDefinition[] = [
          {
            uri: `thinktank://profile/${profile.id}`,
            name: `Domain Profile: ${profile.name}`,
            description: profile.subtitle,
            mimeType: 'application/json',
          },
          ...metas.map((m) => ({
            uri: `thinktank://think/${m.thinkid}`,
            name: m.title || m.thinkid,
            description: `[${m.category}] updatedAt: ${m.updatedAt}`,
            mimeType: 'application/json',
          })),
        ];
        return {
          jsonrpc: '2.0',
          id,
          result: { resources },
        };
      }

      case 'resources/read': {
        const uri = typeof params.uri === 'string' ? params.uri.trim() : '';
        if (uri.startsWith('thinktank://think/')) {
          const thinkid = decodeURIComponent(uri.slice('thinktank://think/'.length));
          if (!isSafeThinkId(thinkid)) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: `不正な thinkid URI です: ${uri}` },
            };
          }
          const rec = await backend.getRecord({ thinkid, includeSupport: true });
          if (!rec) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32002, message: `Think が見つかりません: ${thinkid}` },
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(rec, null, 2),
                },
              ],
            },
          };
        }
        if (uri.startsWith('thinktank://profile/')) {
          const profileId = decodeURIComponent(uri.slice('thinktank://profile/'.length));
          const profile = await backend.getDomainProfile(profileId || undefined);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(profile, null, 2),
                },
              ],
            },
          };
        }
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `未対応の Resource URI です: ${uri}` },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`,
          },
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Internal error: ${message}`,
      },
    };
  }
}
