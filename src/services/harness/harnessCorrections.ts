/**
 * harnessCorrections.ts
 * 利用者の訂正を、次回の前提に変える（記事 5章「訂正を、次回の前提に変える」）。
 * AI は行き先つきの「提案」を出すだけで、利用者が承認したものだけをアプリが行き先へ書き、最後に INDEX を作り直す。
 * 提案には本人の発言の引用を必須にし、今回の発言に含まれるかを確かめる（AI の思い込みを恒久ルールにしないため）。
 * 未決の提案は会話の原本である chat の metadata に置く。docs/261122/AIハーネス実装計画.md §3.6
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { extractJsonFromCliOutput } from '../../../shared/responseValidator';
import { formatLocalDate } from '../../utils/aiViewFormat';
import { THINK_ID_RE, appendProjectRule, projectHarnessIds, type HarnessField } from '../../utils/thinkFormat';
import { addHarnessAiWork, ensureHarnessAiWork } from './harnessAiWork';
import { appendHarnessChatTurn } from './harnessChat';
import { projectLineage } from './harnessContext';
import { HARNESS_CHAR_LIMITS, bodyOf, ensureRootHarness, refreshHarnessIndex } from './harnessRoot';
import { snapshotBeforeWrite } from './aiWorkVersions';

/** 訂正の種類。rules は project の # 規約 */
export const CORRECTION_KINDS = ['PROFILE', 'styles', 'projects', 'knowledge', 'rules'] as const;
export type CorrectionKind = typeof CORRECTION_KINDS[number];

export const CORRECTION_KIND_LABELS: Record<CorrectionKind, string> = {
  PROFILE: '共通の好み（PROFILE）',
  styles: '業務の作法（styles）',
  projects: '案件の現況（projects）',
  knowledge: '知見（knowledge）',
  rules: '働き方のルール（# 規約）',
};

export const CORRECTIONS_KEY = 'harnessCorrections';
const MAX_CANDIDATES = 5;

export interface CorrectionCandidate {
  kind: CorrectionKind;
  text: string;
  /** 本人の発言の引用（利用者の訂正）。週次の改善の提案では空 */
  userQuote: string;
  reason: string;
  /** 書き足す先の AIWork（既存のもの）。rules では書き足す先の project */
  targetId?: string;
  /** 新しく作る AIWork の名前（styles・knowledge） */
  targetName?: string;
  /** 週次の改善の提案の根拠（材料に載っていた project・AIWork の ID） */
  evidenceIds?: string[];
  /** user = 利用者の訂正、review = 週次の改善の提案 */
  origin?: 'user' | 'review';
}

export interface HarnessCorrection extends CorrectionCandidate {
  id: string;
  projectId: string;
  runId: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedAt?: string;
  /** 承認して書いた先（[aiwork:ID] か「# 規約」） */
  appliedTo?: string;
}

function squash(s: string): string {
  return s.replace(/\s+/g, '');
}

function shortText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;
}

/**
 * 応答の JSON の "corrections" を読む。種類・本文・根拠が揃ったものだけを採る。
 * 利用者の訂正（既定）は、引用が今回の発言に含まれるものだけ。利用者の発言が無い回（自動で続けた回）は採らない。
 * 週次の改善（evidenceIds を渡す）は、根拠の ID がすべて渡した材料にあるものだけ（記録から辿れない提案を採らない）。
 */
export function readCorrectionCandidates(
  rawText: string | undefined, userMessage: string | undefined, review?: { evidenceIds: ReadonlySet<string> },
): CorrectionCandidate[] {
  if (!rawText || (!review && !userMessage?.trim())) return [];
  const list = extractJsonFromCliOutput(rawText)?.corrections;
  if (!Array.isArray(list)) return [];
  const said = squash(userMessage ?? '');
  const out: CorrectionCandidate[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || out.length >= MAX_CANDIDATES) continue;
    const rec = item as Record<string, unknown>;
    const kind = CORRECTION_KINDS.find(k => k === rec.kind);
    const text = shortText(rec.text, 2_000);
    if (!kind || !text) continue;
    const targetId = typeof rec.targetId === 'string' && THINK_ID_RE.test(rec.targetId.trim()) ? rec.targetId.trim() : undefined;
    const targetName = shortText(rec.targetName, 60) ?? undefined;
    const base = { kind, text, reason: shortText(rec.reason, 1_000) ?? '', ...(targetId ? { targetId } : {}), ...(targetName ? { targetName } : {}) };
    if (review) {
      const evidenceIds = Array.isArray(rec.evidenceIds) ? [...new Set(rec.evidenceIds.filter((id): id is string => typeof id === 'string'))] : [];
      if (evidenceIds.length === 0 || !evidenceIds.every(id => review.evidenceIds.has(id))) continue;
      out.push({ ...base, userQuote: '', evidenceIds, origin: 'review' });
      continue;
    }
    const userQuote = shortText(rec.userQuote, 500);
    if (!userQuote || !said.includes(squash(userQuote))) continue;
    out.push({ ...base, userQuote, origin: 'user' });
  }
  return out;
}

/** 提案の根拠の表示（本人の発言か、週次の改善の根拠の ID） */
export function correctionBasis(c: CorrectionCandidate): string {
  return c.evidenceIds?.length ? `根拠: ${c.evidenceIds.map(id => `[${id}]`).join(' ')}` : `本人の発言:「${c.userQuote}」`;
}

export function readCorrections(chat: TTThink | null): HarnessCorrection[] {
  const list = chat?.Metadata?.[CORRECTIONS_KEY];
  return Array.isArray(list) ? list.filter((c): c is HarnessCorrection =>
    !!c && typeof c === 'object' && typeof (c as HarnessCorrection).id === 'string'
    && CORRECTION_KINDS.includes((c as HarnessCorrection).kind)) : [];
}

export function pendingCorrections(chat: TTThink | null): HarnessCorrection[] {
  return readCorrections(chat).filter(c => c.status === 'pending');
}

/** 提案を chat の metadata に加える（保存は呼び出し側の chat の保存で行う） */
export function stageCorrections(chat: TTThink, projectId: string, runId: string, candidates: CorrectionCandidate[], now: Date): HarnessCorrection[] {
  const added = candidates.map((c, i) => ({
    ...c, id: `${runId}-${i + 1}`, projectId, runId, createdAt: now.toISOString(), status: 'pending' as const,
  }));
  if (added.length) chat.Metadata = { ...chat.Metadata, [CORRECTIONS_KEY]: [...readCorrections(chat), ...added] };
  return added;
}

/** chat に残す、提案の一覧（承認は AIChat のボタンで行う） */
export function formatCorrectionsForChat(list: HarnessCorrection[]): string {
  if (!list.length) return '';
  const review = list.some(c => c.origin === 'review');
  return [
    `### ${review ? '改善' : '訂正'}の提案（未承認。AIChat で承認すると次回から使われます）`,
    ...list.map(c => `- ${CORRECTION_KIND_LABELS[c.kind]}: ${c.text}（${correctionBasis(c)}）`),
  ].join('\n');
}

async function loadedAiWork(vault: TTVault, id: string | undefined): Promise<TTThink | null> {
  const think = id ? vault.GetThink(id) : undefined;
  if (!think || think.ContentType !== 'aiview') return null;
  if (think.IsMetaOnly) await think.LoadContent();
  return think;
}

/** 書き足す先の AIWork。指定の ID・名前が祖先の同じ種類の項目にあればそれ、無ければ作る */
async function resolveTarget(vault: TTVault, project: TTThink, c: HarnessCorrection): Promise<TTThink> {
  const lineage = await projectLineage(vault, project);
  const { root, profile } = await ensureRootHarness(vault);
  if (c.kind === 'PROFILE') {
    for (const p of [...lineage].reverse()) {
      const [id] = projectHarnessIds(p.Content, 'PROFILE');
      const work = await loadedAiWork(vault, id);
      if (work) return work;
    }
    return profile;
  }
  const field = c.kind as Exclude<CorrectionKind, 'PROFILE' | 'rules'>;
  const owners = field === 'projects' ? [project] : lineage;
  const candidates = owners.flatMap(p => projectHarnessIds(p.Content, field));
  if (c.targetId && candidates.includes(c.targetId)) {
    const work = await loadedAiWork(vault, c.targetId);
    if (work) return work;
  }
  if (c.targetName) {
    for (const id of candidates) {
      const work = await loadedAiWork(vault, id);
      if (work && work.Name.endsWith(`｜${c.targetName}`)) return work;
    }
  }
  if (field === 'projects') return ensureHarnessAiWork(vault, project, 'projects');
  // styles・knowledge は project をまたいで使うため root に置く
  return addHarnessAiWork(vault, root, field, c.targetName ?? (field === 'styles' ? '共通の作法' : '共通の知見'));
}

function entryLine(c: HarnessCorrection, now: Date): string {
  const basis = c.evidenceIds?.length
    ? `週次の改善、根拠: ${c.evidenceIds.map(id => `[${id}]`).join(' ')}`
    : `根拠:「${c.userQuote.replace(/\r?\n/g, ' ')}」`;
  return `- ${c.text.replace(/\r?\n/g, ' ')}（${formatLocalDate(now)}、${basis}）`;
}

/** 規約を書き足す project。週次の改善では targetId の project（無ければ対象 project） */
async function rulesTarget(vault: TTVault, project: TTThink, c: HarnessCorrection): Promise<TTThink> {
  const other = c.targetId ? vault.GetThink(c.targetId) : undefined;
  const target = other && other.ContentType === 'project' ? other : project;
  if (target.IsMetaOnly) await target.LoadContent();
  return target;
}

/**
 * 週次の改善の提案の採否を、提案した project（週次の改善）の decision に残す。
 * 見送った判断も残すと、次の見直しで同じ案を繰り返さずに済む（記事 9章）
 */
async function recordReviewDecision(vault: TTVault, c: HarnessCorrection, adopted: boolean, now: Date): Promise<void> {
  const owner = vault.GetThink(c.projectId);
  if (!owner || owner.ContentType !== 'project') return;
  if (owner.IsMetaOnly) await owner.LoadContent();
  const decision = await ensureHarnessAiWork(vault, owner, 'decision');
  if (decision.IsMetaOnly) await decision.LoadContent();
  await snapshotBeforeWrite(decision);
  const previous = decision.Content;
  decision.Content = `${previous.replace(/\s+$/, '')}\n- ［${adopted ? '採用' : '見送り'}］${CORRECTION_KIND_LABELS[c.kind]}: ${c.text.replace(/\r?\n/g, ' ')}`
    + `（${formatLocalDate(now)}${c.reason ? `、理由: ${c.reason.replace(/\r?\n/g, ' ')}` : ''}、${correctionBasis(c)}）`;
  try { await decision.SaveContent(); } catch (error) { decision.Content = previous; throw error; }
}

export interface DecideCorrectionResult {
  correction: HarnessCorrection;
  /** 上限を超えた行き先（分割を考える目安） */
  overLimit?: { field: HarnessField; chars: number; limit: number };
}

/**
 * 提案を承認・却下する。承認すると行き先へ1行書き足し、INDEX を作り直し、chat に結果を残す。
 * projectファイルが編集中（未保存）で行き先が # 規約 のときは承認しない
 */
export async function decideCorrection(
  vault: TTVault, project: TTThink, chat: TTThink, correctionId: string, decision: 'approve' | 'reject', now = new Date(),
): Promise<DecideCorrectionResult> {
  const list = readCorrections(chat);
  const target = list.find(c => c.id === correctionId);
  if (!target || target.status !== 'pending') throw new Error('この提案は見つからないか、すでに決まっています。');
  const decided: HarnessCorrection = { ...target, status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: now.toISOString() };
  let overLimit: DecideCorrectionResult['overLimit'];

  if (decision === 'approve') {
    if (target.kind === 'rules') {
      const ruled = await rulesTarget(vault, project, target);
      if (ruled.IsDirty) throw new Error('projectファイルを保存してから承認してください。');
      const previous = ruled.Content;
      ruled.Content = appendProjectRule(previous, entryLine(target, now));
      try { await ruled.SaveContent(); } catch (error) { ruled.Content = previous; throw error; }
      decided.appliedTo = ruled === project ? '# 規約' : `[project:${ruled.ID}] の # 規約`;
    } else {
      const work = await resolveTarget(vault, project, target);
      await snapshotBeforeWrite(work);
      const previous = work.Content;
      work.Content = `${previous.replace(/\s+$/, '')}\n${entryLine(target, now)}`;
      try { await work.SaveContent(); } catch (error) { work.Content = previous; throw error; }
      decided.appliedTo = `[aiwork:${work.ID}]`;
      const field = target.kind as HarnessField;
      const limit = HARNESS_CHAR_LIMITS[field];
      const chars = bodyOf(work).length;
      if (limit && chars > limit) overLimit = { field, chars, limit };
    }
    const { index } = await ensureRootHarness(vault);
    await refreshHarnessIndex(vault, index);
  }

  if (target.origin === 'review') await recordReviewDecision(vault, target, decision === 'approve', now);

  chat.Metadata = { ...chat.Metadata, [CORRECTIONS_KEY]: list.map(c => (c.id === correctionId ? decided : c)) };
  const message = decision === 'approve'
    ? `訂正を反映しました（${CORRECTION_KIND_LABELS[target.kind]} → ${decided.appliedTo}）: ${target.text}`
      + (overLimit ? `\n${overLimit.field} が上限を超えました（${overLimit.chars}/${overLimit.limit}字）。細かな内容を styles・knowledge へ分けることを検討してください。` : '')
    : `訂正の提案を見送りました: ${target.text}`;
  await appendHarnessChatTurn(vault, chat, { question: '（アプリ）', model: 'Thinktank', createdAt: now.toISOString(), reply: message });
  vault.NotifyUpdated(false);
  return { correction: decided, ...(overLimit ? { overLimit } : {}) };
}
