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
 *
 * 中身は shared/mcp/ に分けてあり、ここでは元から公開していた名前だけを公開する（内部の補助関数は出さない）。
 */

export type { McpJsonRpcRequest, McpJsonRpcResponse, McpToolDefinition, McpResourceDefinition, McpResourceTemplateDefinition, McpThinkRecord, McpProjectContextResult, McpCreateThinkParams, McpUpdateThinkParams, McpAddPromotionCandidateParams, McpBackendAdapter } from './mcp/types';
export { MCP_PROTOCOL_VERSION, MCP_SERVER_INFO } from './mcp/types';
export { THINKTANK_MCP_TOOLS, THINKTANK_MCP_RESOURCE_TEMPLATES } from './mcp/toolDefinitions';
export type { McpErrorCode, McpToolErrorPayload } from './mcp/toolErrors';
export { isMcpErrorCode, classifyMcpError } from './mcp/toolErrors';
export { executeMcpToolCall } from './mcp/toolCall';
export { handleMcpJsonRpcMessage } from './mcp/jsonRpc';
