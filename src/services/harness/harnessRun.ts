/**
 * harnessRun.ts
 * AIハーネスの1回の実行。文脈を組み立てて AI CLI に依頼し、記録（log・status）が残ったかをアプリが確かめる。
 * 足りなければ一度だけ追加で依頼し、それでも無ければ AI の回答をアプリが log に残して「記録が不完全」とする（記事の Stop hook）。
 * 会話は chat に、関連chat・変更／作成した Think は log の記録の末尾にアプリが残す（記事の SessionEnd）。
 * docs/261122/AIハーネス実装計画.md §3.2〜§3.5
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { extractJsonFromCliOutput } from '../../../shared/responseValidator';
import { DomainProfileManager } from '../../platform/DomainProfileManager';
import { FirestoreRelayClient } from '../../platform/web/FirestoreRelayClient';
import { invokeIpc } from '../../utils/ipcError';
import {
  appendToHarnessRunEntry, formatLocalDateTime, harnessRunLabel, hasHarnessRunEntry, prependAiViewEntry,
} from '../../utils/aiViewFormat';
import { StorageManager } from '../storage/StorageManager';
import { ensureHarnessAiWork } from './harnessAiWork';
import { appendHarnessChatTurn, ensureHarnessChat, recentHarnessChatText } from './harnessChat';
import {
  HARNESS_CHAT_HISTORY_MESSAGES, buildHarnessMessage, collectHarnessContext, type HarnessContext,
} from './harnessContext';
import { snapshotBeforeWrite } from './aiWorkVersions';
import { ensureRootHarness } from './harnessRoot';
import { formatCorrectionsForChat, readCorrectionCandidates, stageCorrections } from './harnessCorrections';

export type HarnessDirectiveState = 'continue' | 'waiting' | 'done';
export interface HarnessDirective {
  state: HarnessDirectiveState;
  question?: string;
}

/** AI の応答 JSON の "harness" を読む。無い・読めなければ null */
export function readHarnessDirective(rawText: string | undefined): HarnessDirective | null {
  if (!rawText) return null;
  const obj = extractJsonFromCliOutput(rawText);
  const harness = obj?.harness;
  if (!harness || typeof harness !== 'object' || Array.isArray(harness)) return null;
  const { state, question } = harness as Record<string, unknown>;
  if (state !== 'continue' && state !== 'waiting' && state !== 'done') return null;
  return { state, ...(typeof question === 'string' && question.trim() ? { question: question.trim() } : {}) };
}

export interface HarnessRecord {
  createdThinkIds: string[];
  updatedThinkIds: string[];
  deniedThinkIds?: string[];
}

export interface HarnessAiResponse {
  reply: string;
  modelLabel?: string;
  rawText?: string;
  harnessRecord?: HarnessRecord;
}

export type HarnessRequestReply = (payload: Record<string, unknown>) => Promise<HarnessAiResponse>;

const AI_TIMEOUT_MS = 600_000;
const AI_WRITE_WAIT_MS = 10_000;
const AI_WRITE_POLL_MS = 500;

async function requestHarnessReply(payload: Record<string, unknown>): Promise<HarnessAiResponse> {
  const electronAi = typeof window !== 'undefined' ? window.electronAPI?.ai : undefined;
  if (electronAi?.conversation) return invokeIpc(() => electronAi.conversation(payload)) as Promise<HarnessAiResponse>;
  if (FirestoreRelayClient.isConfigured()) {
    const res = await FirestoreRelayClient.request<typeof payload, HarnessAiResponse>('ai.conversation', payload, AI_TIMEOUT_MS + 30_000);
    if (!res.ok || !res.result) throw new Error(res.error || 'Firebase E2EE 中継でのAI応答取得に失敗しました。');
    return res.result;
  }
  throw new Error('AIに接続できません。PC版を使うか、PC連携を設定してください。');
}

/** 正本から読み直す（Web版では AI CLI の書き込みが画面へ通知されないため） */
async function refetch(think: TTThink): Promise<void> {
  try {
    const record = await StorageManager.instance.getRecord(think.ID);
    if (!record || record.meta.isDeleted) return;
    const content = `${record.meta.title}\n${record.body}`;
    if (content === think.Content || think.IsDirty) return;
    const known = Date.parse(think.UpdatedAt);
    const fetched = Date.parse(record.meta.updatedAt ?? '');
    if (Number.isFinite(known) && !(fetched > known)) return;
    think.setContentSilent(content);
    think.markSaved();
    if (record.meta.updatedAt) think.UpdatedAt = record.meta.updatedAt;
  } catch {
    // 読み直せなくても、通知での反映を待つ
  }
}

async function waitUntil(thinks: TTThink[], done: () => boolean, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (done()) return true;
    for (const t of thinks) await refetch(t);
    if (done()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, AI_WRITE_POLL_MS));
  }
}

function bodyOf(think: TTThink): string {
  return think.Content.split(/\r?\n/).slice(1).join('\n').trim();
}

function newRunId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

function mergeRecord(a: HarnessRecord | undefined, b: HarnessRecord | undefined): HarnessRecord {
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    createdThinkIds: uniq([...(a?.createdThinkIds ?? []), ...(b?.createdThinkIds ?? [])]),
    updatedThinkIds: uniq([...(a?.updatedThinkIds ?? []), ...(b?.updatedThinkIds ?? [])]),
    deniedThinkIds: uniq([...(a?.deniedThinkIds ?? []), ...(b?.deniedThinkIds ?? [])]),
  };
}

function thinkTag(vault: TTVault, id: string): string {
  const type = vault.GetThink(id)?.ContentType;
  return `[${type === 'aiview' ? 'aiwork' : type ?? 'memo'}:${id}]`;
}

export type HarnessTurnStage = 'prepare' | 'ai' | 'verify' | 'retry' | 'record';

export interface RunHarnessTurnOptions {
  vault: TTVault;
  projectId: string;
  /** 利用者の発言。自動で続ける回は省略 */
  userMessage?: string;
  /** chat に残す発言の見出し（省略時は userMessage、無ければ「（自動）続き」） */
  chatQuestion?: string;
  /** テスト用。省略時は PC版 IPC か PC連携の中継で AI CLI に依頼する */
  requestReply?: HarnessRequestReply;
  now?: () => Date;
  aiWriteWaitMs?: number;
  onStage?: (stage: HarnessTurnStage) => void;
}

export interface HarnessTurnResult {
  runId: string;
  directive: HarnessDirective | null;
  reply: string;
  model: string;
  /** false = log か status が AI によって書かれなかった */
  recordComplete: boolean;
  /** log の記録を書いたのが AI か、AI が書かなかったのでアプリか */
  logWrittenBy: 'ai' | 'app';
  record: HarnessRecord;
  chatId: string;
  /** 今回の訂正の提案（未承認） */
  correctionIds: string[];
}

export async function runHarnessTurn(options: RunHarnessTurnOptions): Promise<HarnessTurnResult> {
  const {
    vault, projectId, userMessage, requestReply = requestHarnessReply, now = () => new Date(),
    aiWriteWaitMs = AI_WRITE_WAIT_MS, onStage = () => {},
  } = options;
  onStage('prepare');
  const project = vault.GetThink(projectId);
  if (!project || project.ContentType !== 'project') throw new Error('projectファイルが見つかりません。');
  if (project.IsMetaOnly) await project.LoadContent();

  await ensureRootHarness(vault);
  const log = await ensureHarnessAiWork(vault, project, 'log');
  const status = await ensureHarnessAiWork(vault, project, 'status');
  const decision = await ensureHarnessAiWork(vault, project, 'decision');
  const chat = await ensureHarnessChat(vault, project);
  for (const work of [log, status, decision]) {
    if (work.IsMetaOnly) await work.LoadContent();
    await snapshotBeforeWrite(work);
  }

  const ctx: HarnessContext = await collectHarnessContext({
    vault, project, log, status, decision,
    chatHistory: recentHarnessChatText(chat, HARNESS_CHAT_HISTORY_MESSAGES),
  });
  const runId = newRunId();
  const dateTime = formatLocalDateTime(now());
  const statusBefore = status.Content;
  const writableIds = [log.ID, status.ID, decision.ID];
  const payload = (message: string, requestId: string) => ({
    requestId,
    profileId: DomainProfileManager.activeProfile.id,
    panelRole: 'Seeds',
    bundleId: project.ID,
    projectId: project.ID,
    bundleTitle: ctx.projectTitle,
    relatedDocuments: [],
    userMessage: message,
    timeoutMs: AI_TIMEOUT_MS,
    harness: { writableIds },
  });

  onStage('ai');
  const first = await requestReply(payload(buildHarnessMessage(ctx, { runId, dateTime, userMessage }), runId));
  let record = mergeRecord(first.harnessRecord, undefined);

  onStage('verify');
  const logOk = () => hasHarnessRunEntry(log.Content, runId);
  const statusOk = () => status.Content !== statusBefore || bodyOf(status) !== '';
  const missingNow = () => [...(logOk() ? [] : ['log' as const]), ...(statusOk() ? [] : ['status' as const])];
  await waitUntil([log, status], () => missingNow().length === 0, aiWriteWaitMs);

  let missing = missingNow();
  if (missing.length > 0) {
    onStage('retry');
    const retry = await requestReply(payload(buildHarnessMessage(ctx, { runId, dateTime, missing }), `${runId}-retry`));
    record = mergeRecord(record, retry.harnessRecord);
    await waitUntil([log, status], () => missingNow().length === 0, aiWriteWaitMs);
    missing = missingNow();
  }

  onStage('record');
  const model = first.modelLabel || 'AI';
  const reply = (first.reply ?? '').trim();
  let logWrittenBy: 'ai' | 'app' = 'ai';
  if (!logOk()) {
    logWrittenBy = 'app';
    const before = log.Content;
    log.Content = prependAiViewEntry(before, log.TitleLine || log.Name, {
      date: dateTime, label: harnessRunLabel(runId), model,
      body: `（AI CLI が記録を書かなかったため、アプリが回答を残しました）\n\n${reply || '（応答なし）'}`,
    });
    try { await log.SaveContent(); } catch (error) { log.Content = before; throw error; }
  }

  const footer = [
    `- 関連chat: [chat:${chat.ID}]`,
    ...(record.updatedThinkIds.filter(id => id !== log.ID).length
      ? [`- 変更したThink: ${record.updatedThinkIds.filter(id => id !== log.ID).map(id => thinkTag(vault, id)).join(', ')}`] : []),
    ...(record.createdThinkIds.length ? [`- 作成したThink: ${record.createdThinkIds.map(id => thinkTag(vault, id)).join(', ')}`] : []),
    ...(record.deniedThinkIds?.length ? [`- 書き換えを拒否したThink: ${record.deniedThinkIds.map(id => thinkTag(vault, id)).join(', ')}`] : []),
  ];
  const withFooter = appendToHarnessRunEntry(log.Content, runId, footer);
  if (withFooter !== log.Content) {
    const before = log.Content;
    log.Content = withFooter;
    try { await log.SaveContent(); }
    catch (error) { log.Content = before; console.warn('[harnessRun] log に関連情報を残せませんでした', error); }
  }

  const directive = readHarnessDirective(first.rawText);
  const corrections = stageCorrections(chat, project.ID, runId, readCorrectionCandidates(first.rawText, userMessage), now());
  const question = directive?.question && !reply.includes(directive.question) ? `\n\n**確認**: ${directive.question}` : '';
  const proposals = corrections.length ? `\n\n${formatCorrectionsForChat(corrections)}` : '';
  const incomplete = missing.length > 0 ? `\n\n（記録が不完全です: ${missing.join('・')} が書かれませんでした）` : '';
  await appendHarnessChatTurn(vault, chat, {
    question: options.chatQuestion ?? (userMessage?.trim() || '（自動）続き'),
    model,
    createdAt: now().toISOString(),
    reply: `${reply || '（応答なし）'}${question}${proposals}${incomplete}`,
  });
  vault.NotifyUpdated(false);

  return {
    runId, directive, reply, model, recordComplete: missing.length === 0, logWrittenBy, record, chatId: chat.ID,
    correctionIds: corrections.map(c => c.id),
  };
}
