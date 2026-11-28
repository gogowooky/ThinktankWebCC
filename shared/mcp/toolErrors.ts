/**
 * shared/mcp/toolErrors.ts
 * MCP ツールのエラーコードの判別と、ツール結果・エラーの整形。
 * 外からは shared/mcpProtocol.ts を通して使う。
 */

/** MCP ツールエラーの機械判別用コード（仕様書 7.2）。 */
export type McpErrorCode =
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'EDITING_IN_PROGRESS'
  | 'INVALID_ARGUMENT'
  | 'INVALID_ID'
  | 'UNKNOWN_TOOL'
  /** この依頼で書き換えを許されていない Think（AIハーネスの書き込み制限） */
  | 'PERMISSION_DENIED'
  | 'INTERNAL_ERROR';

export interface McpToolErrorPayload {
  ok: false;
  error: {
    code: McpErrorCode;
    /** 従来どおりの日本語メッセージ（人間向け） */
    message: string;
    thinkid?: string;
    retryable: boolean;
  };
}

const MCP_ERROR_CODES: ReadonlySet<string> = new Set<McpErrorCode>([
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'EDITING_IN_PROGRESS',
  'INVALID_ARGUMENT',
  'INVALID_ID',
  'UNKNOWN_TOOL',
  'PERMISSION_DENIED',
  'INTERNAL_ERROR',
]);

/**
 * VERSION_CONFLICT と EDITING_IN_PROGRESS は「人間が触っている」サインなので、自動リトライで押し切らない。
 * INVALID_ARGUMENT だけは引数を直した 1 回の再試行を許す。
 */
export const RETRYABLE_BY_CODE: Record<McpErrorCode, boolean> = {
  NOT_FOUND: false,
  VERSION_CONFLICT: false,
  EDITING_IN_PROGRESS: false,
  INVALID_ARGUMENT: true,
  INVALID_ID: false,
  UNKNOWN_TOOL: false,
  PERMISSION_DENIED: false,
  INTERNAL_ERROR: false,
};

export function isMcpErrorCode(value: unknown): value is McpErrorCode {
  return typeof value === 'string' && MCP_ERROR_CODES.has(value);
}

/**
 * バックエンドが送出した例外を MCP エラーコードへ分類する。
 * 型付きの `code` を最優先し、無い場合だけ従来の日本語メッセージで判定する（旧バックエンドとの互換用）。
 */
export function classifyMcpError(err: unknown): McpErrorCode {
  const code = (err as { code?: unknown } | null)?.code;
  if (isMcpErrorCode(code)) return code;
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('編集中')) return 'EDITING_IN_PROGRESS';
  if (message.includes('競合')) return 'VERSION_CONFLICT';
  if (message.includes('見つかりません')) return 'NOT_FOUND';
  if (message.includes('不正な thinkid') || message.includes('不正な projectId')) return 'INVALID_ID';
  return 'INTERNAL_ERROR';
}

export function formatToolResult(payload: unknown, isError = false): {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
} {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

export function formatToolError(code: McpErrorCode, message: string, thinkid?: string) {
  const payload: McpToolErrorPayload = {
    ok: false,
    error: {
      code,
      message,
      ...(thinkid ? { thinkid } : {}),
      retryable: RETRYABLE_BY_CODE[code],
    },
  };
  return formatToolResult(payload, true);
}

/** 引数の thinkid / projectId のうち、エラーに添えられるものを返す。 */
export function pickErrorThinkId(args: Record<string, unknown>): string | undefined {
  for (const key of ['thinkid', 'projectId', 'bundleId']) {
    const v = args[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}
