/**
 * shared/mcp/toolCall.ts
 * MCP の tools/call を検証してバックエンドへ振り分ける。
 * 外からは shared/mcpProtocol.ts を通して使う。
 */

import { isSafeThinkId } from '../vaultFormat';
import type { McpBackendAdapter } from './types';
import { type McpToolErrorPayload, RETRYABLE_BY_CODE, classifyMcpError, formatToolResult, formatToolError, pickErrorThinkId } from './toolErrors';
import { type CreateCategory, VALID_CREATE_CATEGORIES, clampLimit, MAX_BATCH_CANDIDATES, resolveProjectIdArg, resolveProjectIdsArg, type ParsedCandidate, parseCandidateInput } from './toolArgs';

/**
 * MCP の `tools/call` を処理し、バリデーションとバックエンド呼び出しを行う。
 * エラーはすべて `{ ok:false, error:{ code, message, thinkid?, retryable } }` の JSON を text に載せ、isError を立てる。
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
        // 1件多く取り、上限到達で打ち切られたかを truncated として明示する。
        const fetched = await backend.search({ query, limit: limit + 1, category });
        const results = fetched.slice(0, limit);
        return formatToolResult({
          count: results.length,
          truncated: fetched.length > limit,
          items: results,
        });
      }

      case 'thinktank_list_meta': {
        const projectId = resolveProjectIdArg(args);
        if (projectId && !isSafeThinkId(projectId)) {
          return formatToolError('INVALID_ID', `不正な projectId です: ${projectId}`, projectId);
        }
        const category = typeof args.category === 'string' && args.category.trim() ? args.category.trim() : undefined;
        const limit = clampLimit(args.limit, 50, 200);
        const fetched = await backend.listMeta({ projectId, category, limit: limit + 1 });
        const items = fetched.slice(0, limit);
        return formatToolResult({
          count: items.length,
          truncated: fetched.length > limit,
          items,
        });
      }

      case 'thinktank_get_record': {
        const thinkid = typeof args.thinkid === 'string' ? args.thinkid.trim() : '';
        if (!isSafeThinkId(thinkid)) {
          return formatToolError('INVALID_ID', `不正な thinkid です: ${thinkid}`, thinkid || undefined);
        }
        const includeSupport = args.includeSupport !== false;
        const record = await backend.getRecord({ thinkid, includeSupport });
        if (!record) {
          return formatToolError('NOT_FOUND', `指定された Think が見つかりません: ${thinkid}`, thinkid);
        }
        return formatToolResult(record);
      }

      case 'thinktank_get_project_context': {
        const projectId = resolveProjectIdArg(args) ?? '';
        if (!isSafeThinkId(projectId)) {
          return formatToolError('INVALID_ID', `不正な projectId です: ${projectId}`, projectId || undefined);
        }
        const ctx = await backend.getProjectContext({ projectId });
        if (!ctx) {
          return formatToolError('NOT_FOUND', `指定された Project が見つかりません: ${projectId}`, projectId);
        }
        return formatToolResult(ctx);
      }

      case 'thinktank_create_think': {
        const title = typeof args.title === 'string' ? args.title.replace(/[\r\n]+/g, ' ').trim() : '';
        if (!title) {
          return formatToolError('INVALID_ARGUMENT', '新規 Think の作成には title が必須です。');
        }
        const rawCategory = typeof args.category === 'string' ? args.category.trim() : 'memo';
        const category = VALID_CREATE_CATEGORIES.has(rawCategory as CreateCategory)
          ? (rawCategory as CreateCategory)
          : 'memo';
        const body = typeof args.body === 'string' ? args.body : '';
        const keywords = typeof args.keywords === 'string' ? args.keywords.trim() : undefined;
        const relatedIds = typeof args.relatedIds === 'string' ? args.relatedIds.trim() : undefined;
        const { ids: projectIds, invalid } = resolveProjectIdsArg(args);
        if (invalid) {
          return formatToolError('INVALID_ID', `不正な projectId です: ${invalid}`, invalid);
        }
        const saved = await backend.createThink({
          title,
          body,
          category,
          keywords,
          relatedIds,
          projectId: projectIds[0],
          projectIds: projectIds.length > 0 ? projectIds : undefined,
        });
        return formatToolResult({
          ok: true,
          created: saved,
        });
      }

      case 'thinktank_update_think': {
        const thinkid = typeof args.thinkid === 'string' ? args.thinkid.trim() : '';
        if (!isSafeThinkId(thinkid)) {
          return formatToolError('INVALID_ID', `不正な thinkid です: ${thinkid}`, thinkid || undefined);
        }
        const expectedVersion = typeof args.expectedVersion === 'string' ? args.expectedVersion.trim() : '';
        if (!expectedVersion) {
          return formatToolError(
            'INVALID_ARGUMENT',
            '既存 Think の更新には expectedVersion（取得時の updatedAt）の指定が必須です。',
            thinkid,
          );
        }
        if (args.body !== undefined && args.appendBody !== undefined) {
          return formatToolError('INVALID_ARGUMENT', 'body と appendBody は同時に指定できません。', thinkid);
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
          return formatToolError('INVALID_ID', `不正な projectId です: ${projectId}`, projectId || undefined);
        }
        const parsed = parseCandidateInput(args);
        if (parsed.status === 'error') {
          return formatToolError(parsed.error.code, parsed.error.message, projectId);
        }
        const res = await backend.addPromotionCandidate({ projectId, ...parsed.value });
        return formatToolResult({
          ok: true,
          status: 'pending_review',
          ...res,
        });
      }

      case 'thinktank_add_promotion_candidates': {
        const projectId = resolveProjectIdArg(args) ?? '';
        if (!isSafeThinkId(projectId)) {
          return formatToolError('INVALID_ID', `不正な projectId です: ${projectId}`, projectId || undefined);
        }
        if (!Array.isArray(args.candidates) || args.candidates.length === 0) {
          return formatToolError('INVALID_ARGUMENT', 'candidates に 1 件以上の昇格候補を指定してください。', projectId);
        }
        if (args.candidates.length > MAX_BATCH_CANDIDATES) {
          return formatToolError(
            'INVALID_ARGUMENT',
            `一括登録できる昇格候補は ${MAX_BATCH_CANDIDATES} 件までです（指定: ${args.candidates.length} 件）。`,
            projectId,
          );
        }
        // 1件でも不正なら何も登録しない。検証を先に全件済ませ、登録途中の中途半端な状態を避ける。
        const parsedList: ParsedCandidate[] = [];
        for (let i = 0; i < args.candidates.length; i++) {
          const item = args.candidates[i];
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return formatToolError('INVALID_ARGUMENT', `candidates[${i}] はオブジェクトで指定してください。`, projectId);
          }
          const parsed = parseCandidateInput(item as Record<string, unknown>);
          if (parsed.status === 'error') {
            return formatToolError(parsed.error.code, `candidates[${i}]: ${parsed.error.message}`, projectId);
          }
          parsedList.push(parsed.value);
        }

        // 登録は直列。Project 側の保存が楽観ロックで連鎖するため並列にしない。
        const results: Array<
          | { index: number; ok: true; candidateId: string; updatedAt: string }
          | { index: number; ok: false; error: McpToolErrorPayload['error'] }
        > = [];
        let totalPendingCandidates: number | undefined;
        let registered = 0;
        for (let i = 0; i < parsedList.length; i++) {
          try {
            const res = await backend.addPromotionCandidate({ projectId, ...parsedList[i] });
            registered += 1;
            totalPendingCandidates = res.totalPendingCandidates;
            results.push({ index: i, ok: true, candidateId: res.candidateId, updatedAt: res.updatedAt });
          } catch (err) {
            const code = classifyMcpError(err);
            results.push({
              index: i,
              ok: false,
              error: {
                code,
                message: err instanceof Error ? err.message : String(err),
                thinkid: projectId,
                retryable: RETRYABLE_BY_CODE[code],
              },
            });
            // 競合・編集中は後続も同じ理由で失敗するため、押し切らず打ち切る。
            if (code === 'VERSION_CONFLICT' || code === 'EDITING_IN_PROGRESS') break;
          }
        }
        const payload = {
          ok: registered === parsedList.length,
          status: 'pending_review' as const,
          projectId,
          requested: parsedList.length,
          registered,
          totalPendingCandidates,
          results,
        };
        return formatToolResult(payload, registered === 0);
      }

      case 'thinktank_google_gmail_search':
      case 'thinktank_google_gmail_read':
      case 'thinktank_google_calendar_events':
      case 'thinktank_google_tasks_list':
      case 'thinktank_google_drive_search':
      case 'thinktank_google_drive_read':
      case 'thinktank_google_drive_write': {
        const a = args ?? {};
        if (typeof backend.callGoogleWorkspace !== 'function') {
          return formatToolError(
            'INTERNAL_ERROR',
            'この実行環境では Google Workspace 連携（GAS）が有効になっていません。',
          );
        }
        const kindMap: Record<string, string> = {
          thinktank_google_gmail_search: 'gmail_search',
          thinktank_google_gmail_read: 'gmail_read',
          thinktank_google_calendar_events: 'calendar_events',
          thinktank_google_tasks_list: 'tasks_list',
          thinktank_google_drive_search: 'drive_search',
          thinktank_google_drive_read: 'drive_read',
          thinktank_google_drive_write: 'drive_write',
        };
        if (name === 'thinktank_google_gmail_read' && (!a.threadId || typeof a.threadId !== 'string')) {
          return formatToolError('INVALID_ARGUMENT', 'threadId は必須です。');
        }
        if (name === 'thinktank_google_drive_read' && (!a.fileId || typeof a.fileId !== 'string')) {
          return formatToolError('INVALID_ARGUMENT', 'fileId は必須です。');
        }
        if (name === 'thinktank_google_drive_write') {
          if (typeof a.content !== 'string') {
            return formatToolError('INVALID_ARGUMENT', 'content（文字列）は必須です。');
          }
          if ((!a.fileId || typeof a.fileId !== 'string') && (!a.name || typeof a.name !== 'string')) {
            return formatToolError('INVALID_ARGUMENT', '既存ファイル更新時は fileId、新規作成時は name が必要です。');
          }
        }
        const result = await backend.callGoogleWorkspace(kindMap[name], a);
        return formatToolResult(result, false);
      }

      default:
        return formatToolError('UNKNOWN_TOOL', `未知の MCP ツールです: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return formatToolError(
      classifyMcpError(err),
      `ツール実行エラー (${name}): ${message}`,
      pickErrorThinkId(args),
    );
  }
}
