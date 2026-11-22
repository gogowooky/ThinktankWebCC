/**
 * harnessBoard.ts
 * 共有ボード（project の # board の AIWork）。担当ごとの作業・報告・検証の状態を1か所に集める（記事 7章）。
 * 書くのはアプリだけ: 担当の報告はアプリが行に書き、まとめ役の検証は応答の JSON（verify）からアプリが書く。
 * こうして書き手を1人にし、本文の形も崩れないようにする。人が読む表の後ろに、アプリが読むデータを置く。
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { extractJsonFromCliOutput } from '../../../shared/responseValidator';
import { snapshotBeforeWrite } from './aiWorkVersions';

export const BOARD_ROW_STATES = ['assigned', 'running', 'reported', 'verified', 'rejected', 'blocked', 'failed'] as const;
export type BoardRowState = typeof BOARD_ROW_STATES[number];

const STATE_LABELS: Record<BoardRowState, string> = {
  assigned: '依頼済み', running: '作業中', reported: '報告済み（未検証）', verified: '検証済み',
  rejected: '差し戻し', blocked: '本人の判断待ち', failed: '失敗',
};

export interface BoardRow {
  id: string;
  role: string;
  /** 役割 project の ID。定義に無い役割（即席の担当）なら無い */
  roleId?: string;
  task: string;
  state: BoardRowState;
  report?: string;
  /** まとめ役の検証の所見、または失敗の理由 */
  note?: string;
  model?: string;
  runId?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface BoardData {
  goal: string;
  doneCriteria: string;
  rows: BoardRow[];
}

const DATA_RE = /<!-- harness-board-data (.*?) -->/s;

export function emptyBoard(): BoardData {
  return { goal: '', doneCriteria: '', rows: [] };
}

export function readBoard(think: TTThink | null): BoardData {
  const m = think ? DATA_RE.exec(think.Content) : null;
  if (!m) return emptyBoard();
  try {
    const data = JSON.parse(m[1]) as Partial<BoardData>;
    return {
      goal: typeof data.goal === 'string' ? data.goal : '',
      doneCriteria: typeof data.doneCriteria === 'string' ? data.doneCriteria : '',
      rows: Array.isArray(data.rows) ? data.rows.filter((r): r is BoardRow =>
        !!r && typeof r.id === 'string' && typeof r.task === 'string' && BOARD_ROW_STATES.includes(r.state)) : [],
    };
  } catch {
    return emptyBoard();
  }
}

/** 人が読む本文。データ部はコメントにして、> や < を含む報告でもコメントが閉じないようにする */
export function serializeBoard(title: string, data: BoardData): string {
  const lines = [title, `ゴール: ${data.goal || '（未設定）'}`, `完了条件: ${data.doneCriteria || '（未設定）'}`, ''];
  for (const r of data.rows) {
    lines.push(`## ${r.id} ［${STATE_LABELS[r.state]}］ ${r.role}${r.roleId ? '' : '（即席の担当）'}`);
    lines.push(`- 作業: ${r.task}`);
    if (r.model || r.runId) lines.push(`- 実行: ${[r.model, r.runId, r.startedAt, r.endedAt].filter(Boolean).join(' / ')}`);
    if (r.report) lines.push('- 報告:', ...r.report.split(/\r?\n/).map(l => `  ${l}`));
    if (r.note) lines.push(`- 検証・所見: ${r.note}`);
    lines.push('');
  }
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  lines.push(`<!-- harness-board-data ${json} -->`);
  return lines.join('\n');
}

export async function writeBoard(vault: TTVault, board: TTThink, data: BoardData): Promise<void> {
  if (board.IsMetaOnly) await board.LoadContent();
  const next = serializeBoard(board.TitleLine || board.Name, data);
  if (next === board.Content) return;
  await snapshotBeforeWrite(board);
  const previous = board.Content;
  board.Content = next;
  try { await board.SaveContent(); }
  catch (error) { board.Content = previous; throw error; }
  vault.NotifyUpdated(false);
}

export interface TeamAssignment { role: string; task: string }
export interface TeamDirective { goal?: string; doneCriteria?: string; assignments: TeamAssignment[] }
export interface VerifyItem { id: string; result: 'verified' | 'rejected' | 'blocked'; note: string }

const MAX_ASSIGNMENTS = 6;

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** 応答の JSON の "team"（まとめ役が決めた分担）。無ければ null */
export function readTeamDirective(rawText: string | undefined): TeamDirective | null {
  const team = rawText ? extractJsonFromCliOutput(rawText)?.team : undefined;
  if (!team || typeof team !== 'object' || Array.isArray(team)) return null;
  const rec = team as Record<string, unknown>;
  const assignments = Array.isArray(rec.assignments) ? rec.assignments.flatMap(a => {
    if (!a || typeof a !== 'object') return [];
    const role = str((a as Record<string, unknown>).role, 40);
    const task = str((a as Record<string, unknown>).task, 2_000);
    return role && task ? [{ role, task }] : [];
  }).slice(0, MAX_ASSIGNMENTS) : [];
  const goal = str(rec.goal, 500);
  const doneCriteria = str(rec.doneCriteria, 1_000);
  return { ...(goal ? { goal } : {}), ...(doneCriteria ? { doneCriteria } : {}), assignments };
}

/** 応答の JSON の "verify"（まとめ役が根拠を確かめた結果） */
export function readVerifyItems(rawText: string | undefined): VerifyItem[] {
  const list = rawText ? extractJsonFromCliOutput(rawText)?.verify : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap(v => {
    if (!v || typeof v !== 'object') return [];
    const rec = v as Record<string, unknown>;
    const id = str(rec.id, 20);
    const result = rec.result === 'verified' || rec.result === 'rejected' || rec.result === 'blocked' ? rec.result : null;
    return id && result ? [{ id, result, note: str(rec.note, 1_000) ?? '' }] : [];
  });
}

/** 検証は報告のある行だけに付ける（報告の無い行を検証済みにしない） */
export function applyVerify(data: BoardData, items: VerifyItem[]): { data: BoardData; applied: VerifyItem[] } {
  const applied: VerifyItem[] = [];
  const rows = data.rows.map(r => {
    const v = items.find(i => i.id === r.id);
    if (!v || !r.report || !['reported', 'rejected', 'blocked', 'verified'].includes(r.state)) return r;
    applied.push(v);
    return { ...r, state: v.result, note: v.note || r.note };
  });
  return { data: { ...data, rows }, applied };
}

/** AI に渡すボードの要約（報告は長ければ省略） */
export function boardForPrompt(data: BoardData, maxReport = 2_000): string {
  if (data.rows.length === 0) return '';
  return [
    `ゴール: ${data.goal || '（未設定）'}`, `完了条件: ${data.doneCriteria || '（未設定）'}`,
    ...data.rows.map(r => [
      `- ${r.id} ［${r.state}］ ${r.role}: ${r.task}`,
      ...(r.report ? [`  報告: ${r.report.length > maxReport ? `${r.report.slice(0, maxReport)}…（省略）` : r.report}`] : []),
      ...(r.note ? [`  所見: ${r.note}`] : []),
    ].join('\n')),
  ].join('\n');
}

export function boardRowLabel(state: BoardRowState): string {
  return STATE_LABELS[state];
}
