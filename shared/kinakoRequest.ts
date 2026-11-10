/**
 * shared/kinakoRequest.ts
 * きなこ（クラウド側 AI）→ シンクタンクの非同期ファシリテーション依頼（MCP 仕様書 第8章）。
 *
 * ツール呼び出しそのものとは別に、「PC が起動していない間は溜め、起きたらまとめて実行して結果を返す」ための
 * エンベロープ・状態遷移・結果の形を定める。トランスポート（Firestore 中継）には依存しない。
 */

import type { RelayRequestStatus } from './relayProtocol';
import { isSafeThinkId } from './vaultFormat';

export const KINAKO_REQUEST_KINDS = [
  'filing_proposal',
  'project_summary',
  'discussion_summary',
  'promotion_candidates',
] as const;
export type KinakoRequestKind = (typeof KINAKO_REQUEST_KINDS)[number];

export type KinakoRequestMode = 'web' | 'local';

/** 依頼のライフサイクル（8.2）。queued/running は進行中、done/conflict/failed は終端。 */
export type KinakoRequestStatus = 'queued' | 'running' | 'done' | 'conflict' | 'failed';
export type KinakoTerminalStatus = Extract<KinakoRequestStatus, 'done' | 'conflict' | 'failed'>;

export interface KinakoRequestEnvelope {
  /** きなこが発行する一意なID。再送しても二重実行しないための冪等キー。 */
  requestId: string;
  /** 対象PCの識別子（PC の deviceId、または deviceName）。 */
  targetPc: string;
  mode: KinakoRequestMode;
  kind: KinakoRequestKind;
  projectId?: string;
  /** 依頼内容（自然言語。プロジェクト固有プロンプトへの参照を含む）。 */
  instructions: string;
  sourceThinkIds: string[];
  createdAt: string;
  requestedBy: 'kinako';
}

export interface KinakoConflict {
  thinkid: string;
  /** VERSION_CONFLICT / EDITING_IN_PROGRESS など（McpErrorCode）。 */
  code: string;
  reason: string;
}

export interface KinakoRequestResult {
  requestId: string;
  targetPc: string;
  status: KinakoTerminalStatus;
  createdThinkIds: string[];
  updatedThinkIds: string[];
  /** 登録した昇格候補のID一覧。 */
  candidateIds: string[];
  /** 実際に全文を読んだ材料のID。 */
  usedSourceIds: string[];
  conflicts: KinakoConflict[];
  /** AI の最終報告（人間が読む要約）。 */
  summary?: string;
  failure?: { code: string; message: string };
  completedAt: string;
}

const MAX_INSTRUCTIONS_CHARS = 20_000;
const MAX_SOURCE_IDS = 100;
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export type KinakoValidation =
  | { status: 'ok'; value: KinakoRequestEnvelope }
  | { status: 'error'; message: string };

/** 外部（きなこ）から届いた値を検証して正規化する。信頼しない前提で、未知の項目は捨てる。 */
export function validateKinakoRequestEnvelope(raw: unknown): KinakoValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'error', message: '依頼がオブジェクトではありません。' };
  }
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const requestId = str(r.requestId);
  if (!REQUEST_ID_RE.test(requestId)) {
    return { status: 'error', message: 'requestId は英数字・. _ : - の3〜128文字で指定してください。' };
  }
  const targetPc = str(r.targetPc);
  if (!targetPc) return { status: 'error', message: 'targetPc（対象PCの識別子）は必須です。' };

  const kind = str(r.kind) as KinakoRequestKind;
  if (!KINAKO_REQUEST_KINDS.includes(kind)) {
    return { status: 'error', message: `kind が不正です: ${str(r.kind)}` };
  }
  const mode = str(r.mode);
  if (mode !== 'web' && mode !== 'local') {
    return { status: 'error', message: 'mode は web か local で指定してください。' };
  }
  if (str(r.requestedBy) !== 'kinako') {
    return { status: 'error', message: 'requestedBy は kinako で指定してください。' };
  }
  const instructions = str(r.instructions);
  if (!instructions) return { status: 'error', message: 'instructions は必須です。' };
  if (instructions.length > MAX_INSTRUCTIONS_CHARS) {
    return { status: 'error', message: `instructions は ${MAX_INSTRUCTIONS_CHARS} 文字以内にしてください。` };
  }

  const projectId = str(r.projectId);
  if (projectId && !isSafeThinkId(projectId)) {
    return { status: 'error', message: `projectId が不正です: ${projectId}` };
  }
  if ((kind === 'project_summary' || kind === 'discussion_summary') && !projectId) {
    return { status: 'error', message: `${kind} には projectId が必須です。` };
  }

  const sourceThinkIds: string[] = [];
  if (r.sourceThinkIds !== undefined) {
    if (!Array.isArray(r.sourceThinkIds)) {
      return { status: 'error', message: 'sourceThinkIds は配列で指定してください。' };
    }
    if (r.sourceThinkIds.length > MAX_SOURCE_IDS) {
      return { status: 'error', message: `sourceThinkIds は ${MAX_SOURCE_IDS} 件までです。` };
    }
    for (const item of r.sourceThinkIds) {
      const id = str(item);
      if (!isSafeThinkId(id)) return { status: 'error', message: `sourceThinkIds に不正なIDがあります: ${id}` };
      if (!sourceThinkIds.includes(id)) sourceThinkIds.push(id);
    }
  }

  const createdAt = str(r.createdAt);
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
    return { status: 'error', message: 'createdAt は ISO 8601 で指定してください。' };
  }

  return {
    status: 'ok',
    value: {
      requestId,
      targetPc,
      mode,
      kind,
      ...(projectId ? { projectId } : {}),
      instructions,
      sourceThinkIds,
      createdAt,
      requestedBy: 'kinako',
    },
  };
}

/** 依頼の宛先がこのPCか。PC間で依頼・材料を混ぜないための照合（8.1・11章）。 */
export function matchesTargetPc(
  targetPc: string,
  self: { deviceId: string; deviceName?: string },
): boolean {
  const t = targetPc.trim();
  if (!t) return false;
  return t === self.deviceId || (Boolean(self.deviceName) && t === self.deviceName);
}

/**
 * Firestore 中継の状態＋結果から、きなこ向けの状態を求める。
 * 中継側は成功（succeeded）でも、書けなかった箇所があれば conflict を返すため、結果の status を優先する。
 */
export function relayStatusToKinakoStatus(
  relayStatus: RelayRequestStatus,
  result?: Pick<KinakoRequestResult, 'status'> | null,
): KinakoRequestStatus {
  switch (relayStatus) {
    case 'queued':
      return 'queued';
    case 'running':
      return 'running';
    case 'succeeded':
      return result?.status ?? 'done';
    case 'failed':
    case 'canceled':
    case 'expired':
    default:
      return 'failed';
  }
}

/** 実行側（PC の AI）に渡す依頼文。ガバナンスは MCP ツール側で担保するため、ここでは手順だけを示す。 */
export function buildKinakoRequestPrompt(envelope: KinakoRequestEnvelope): string {
  const lines: string[] = [
    'きなこからの依頼です。Thinktank の MCP ツール（thinktank_*）だけを使って実行してください。',
    '',
    `依頼ID: ${envelope.requestId}`,
    `種別: ${envelope.kind}`,
  ];
  if (envelope.projectId) lines.push(`対象Project: ${envelope.projectId}`);
  if (envelope.sourceThinkIds.length > 0) {
    lines.push(`材料にするThink: ${envelope.sourceThinkIds.join(', ')}`);
  }
  lines.push(
    '',
    '## 依頼内容',
    envelope.instructions,
    '',
    '## 作法',
    '- Project の作業は thinktank_get_project_context から始め、材料は thinktank_get_record で全文を読む（メタデータだけで判断しない）。',
    '- まとめは Project の「# AIまとめ」に記載された [aiview:ID] の先頭ファイルへ appendBody で日報形式に追記する。まとめ先が無い場合だけ category: aiview で作成する。',
    '- 振り分け・統合・重要事項の提案は対象Thinkを書き換えず、thinktank_add_promotion_candidate(s) で昇格候補にする。citations に根拠Thinkを必ず付ける。',
    '- 更新に失敗（VERSION_CONFLICT・EDITING_IN_PROGRESS）しても再試行で押し切らない。人間が触っているサインとして、その旨を最終報告に書く。',
    '- 削除・昇格の承認は行わない（ツールが存在しない）。',
    '- 最終報告は、実施した内容を日本語で簡潔に。',
  );
  return lines.join('\n');
}
