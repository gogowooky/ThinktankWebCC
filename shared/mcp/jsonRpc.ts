/**
 * shared/mcp/jsonRpc.ts
 * MCP JSON-RPC 2.0 のリクエスト1件の処理（initialize・tools/list・tools/call・resources/*）。
 * 外からは shared/mcpProtocol.ts を通して使う。
 */

import { isSafeThinkId } from '../vaultFormat';
import { MCP_PROTOCOL_VERSION, MCP_SERVER_INFO, type McpJsonRpcRequest, type McpJsonRpcResponse, type McpResourceDefinition, type McpBackendAdapter } from './types';
import { THINKTANK_MCP_TOOLS, THINKTANK_MCP_RESOURCE_TEMPLATES } from './toolDefinitions';
import { executeMcpToolCall } from './toolCall';

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
