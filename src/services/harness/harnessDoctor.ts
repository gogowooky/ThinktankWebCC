/**
 * harnessDoctor.ts
 * AIハーネスの点検（記事 8章 harness-doctor）。「壊れないようにする」ではなく「壊れたら即わかる」ための検査で、
 * 報告するだけで直さない。直すかどうかは、原因を調べたうえで利用者が決める。
 * clean は「下の検査の範囲で異常なし」の意味であり、それ以上ではない。
 * 常駐はせず、PC版の起動後とループの終わりに、前回から7日以上たっていれば root の # doctor へ報告を書く。
 * docs/261122/AIハーネス実装計画.md §3.8
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { formatLocalDateTime, latestAiViewEntries, prependAiViewEntry } from '../../utils/aiViewFormat';
import {
  HARNESS_FIELDS, HARNESS_MULTI_FIELDS, isHarnessProject, parseProject, projectHarnessIds, readProjectStatus,
  type HarnessField,
} from '../../utils/thinkFormat';
import { HARNESS_CHAT_METADATA_KEY } from './harnessChat';
import { HARNESS_LOCK_KEY, HARNESS_LOCK_TTL_MS } from './harnessLoop';
import { HARNESS_CHAR_LIMITS, bodyOf, ensureRootHarness, findRootProject } from './harnessRoot';
import { ensureHarnessAiWork } from './harnessAiWork';
import { snapshotBeforeWrite } from './aiWorkVersions';

export type DoctorLevel = 'NG' | 'WARN';
export interface DoctorFinding {
  level: DoctorLevel;
  area: string;
  /** 何が・どこで・どうすればよいか */
  message: string;
}

export const DOCTOR_INTERVAL_DAYS = 7;
const STATUS_STALE_DAYS = 7;
const PROJECTS_STALE_DAYS = 30;
const DOCTOR_ENTRIES_KEPT = 10;
const LOAD_CONCURRENCY = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const INDEX_FIELDS: HarnessField[] = ['PROFILE', 'styles', 'knowledge', 'projects', 'INBOX'];
const CLI_PROVIDER: Record<string, string> = { claude: 'Claude', codex: 'OpenAI', antigravity: 'Gemini', gemini: 'Gemini' };

/** 冒頭に書く「検査しないもの」。clean を「全部正しい」と誤解させないため */
export const DOCTOR_NOT_CHECKED = [
  '文書どうしの内容の矛盾（PROFILE と決定の食い違いなど）',
  'PROFILE・規約が本人の考えに合っているか',
  'AI が書いた記録の内容が正しいか',
  '読み込めなかった projectファイル',
];

export interface ToolStatus { cli: string; available: boolean; loggedIn: boolean }

export interface DoctorEnv {
  now?: Date;
  /** 設定の AI CLI が使えるか。PC版でなければ null（検査しない） */
  toolStatus?: () => Promise<ToolStatus | null>;
}

async function defaultToolStatus(): Promise<ToolStatus | null> {
  const ai = typeof window !== 'undefined' ? window.electronAPI?.ai : undefined;
  if (!ai?.getStatus || !ai.getAuthStatus) return null;
  const status = await ai.getStatus() as { preferredCli?: string };
  const cli = status.preferredCli || 'claude';
  const auth = await ai.getAuthStatus() as Record<string, { available?: boolean; loggedIn?: boolean } | undefined>;
  const entry = auth[CLI_PROVIDER[cli] ?? ''];
  return { cli, available: !!entry?.available, loggedIn: !!entry?.loggedIn };
}

async function mapLimited<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, items.length) }, worker));
}

function daysSince(iso: string, now: Date): number | null {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? Math.floor((now.getTime() - at) / DAY_MS) : null;
}

const AIWORK_REF_RE = /\[(?:aiwork|aiview):([^\]\s]+)\]/g;

/** 検査して見つかったこと（NG が先） */
export async function collectDoctorFindings(vault: TTVault, env: DoctorEnv = {}): Promise<DoctorFinding[]> {
  const now = env.now ?? new Date();
  const findings: DoctorFinding[] = [];
  const add = (level: DoctorLevel, area: string, message: string) => findings.push({ level, area, message });

  await mapLimited(vault.GetProjects().filter(p => p.IsMetaOnly), p => p.LoadContent());
  const projects = vault.GetProjects().filter(p => !p.IsMetaOnly && isHarnessProject(p.Content));
  const titleOf = (p: TTThink) => parseProject(p.Content).title;
  const works = new Map<string, TTThink>();

  for (const p of projects) {
    const name = `project「${titleOf(p)}」`;
    for (const field of HARNESS_FIELDS) {
      const ids = projectHarnessIds(p.Content, field);
      if (ids.length > 1 && !HARNESS_MULTI_FIELDS.has(field)) {
        add('WARN', '参照', `${name} の # ${field} に AIWork が ${ids.length} 件あります。使われるのは先頭だけです。1件にしてください。`);
      }
      for (const id of ids) {
        const think = vault.GetThink(id);
        if (!think) { add('NG', '参照', `${name} の # ${field} が指す ${id} が Vault にありません。項目から消すか、AIWork を作り直してください。`); continue; }
        if (think.ContentType !== 'aiview') { add('NG', '参照', `${name} の # ${field} が指す ${id} は AIWork ではありません（${think.ContentType}）。項目を直してください。`); continue; }
        works.set(id, think);
        if (think.IsMetaOnly) await think.LoadContent();
        const limit = HARNESS_CHAR_LIMITS[field];
        const chars = bodyOf(think).length;
        if (limit && chars > limit) add('WARN', '字数', `${name} の ${field}「${think.Name}」が上限を超えています（${chars}/${limit}字）。広げずに styles・knowledge へ分けてください。`);
        if (field === 'projects') {
          const days = daysSince(think.UpdatedAt, now);
          if (days !== null && days >= PROJECTS_STALE_DAYS) add('WARN', '鮮度', `${name} の projects「${think.Name}」が ${days} 日更新されていません。現況を確かめて更新してください。`);
        }
      }
    }

    const state = readProjectStatus(p.Content).state;
    const [statusId] = projectHarnessIds(p.Content, 'status');
    const status = statusId ? vault.GetThink(statusId) : undefined;
    if (state === '進行中' && status?.ContentType === 'aiview') {
      const days = daysSince(status.UpdatedAt, now);
      if (days !== null && days >= STATUS_STALE_DAYS) add('WARN', '鮮度', `${name} は進行中ですが、status が ${days} 日更新されていません。現在地を更新するか、終わっていれば状態を完了にしてください。`);
    }

    const lock = p.Metadata?.[HARNESS_LOCK_KEY] as { at?: unknown } | undefined;
    if (lock && typeof lock.at === 'string') {
      const at = Date.parse(lock.at);
      if (Number.isFinite(at) && now.getTime() - at >= HARNESS_LOCK_TTL_MS) add('WARN', '実行', `${name} に実行中の印が残っています（${lock.at}）。前回のループが途中で終わった可能性があります。chat と log を確かめてください。`);
    }

    for (const chatId of parseProject(p.Content).aiDiscussionIds) {
      const chat = vault.GetThink(chatId);
      if (!chat) { add('WARN', '原本', `${name} の # AI議論 が指す chat ${chatId} が Vault にありません。会話の原本を辿れません。`); continue; }
      const mark = chat.Metadata?.[HARNESS_CHAT_METADATA_KEY] as { projectId?: unknown } | undefined;
      if (mark && mark.projectId !== p.ID) add('WARN', '原本', `${name} の # AI議論 にある chat「${chat.Name}」は、別の project のハーネスの chat です。載せる先を確かめてください。`);
    }
  }

  // chat から project への向き。project 側の # AI議論 から外れた会話の原本を見つける
  const byId = new Map(projects.map(p => [p.ID, p]));
  for (const chat of vault.GetThinks().filter(t => t.ContentType === 'chat')) {
    const mark = chat.Metadata?.[HARNESS_CHAT_METADATA_KEY] as { projectId?: unknown } | undefined;
    const owner = typeof mark?.projectId === 'string' ? byId.get(mark.projectId) : undefined;
    if (owner && !parseProject(owner.Content).aiDiscussionIds.includes(chat.ID)) {
      add('WARN', '原本', `chat「${chat.Name}」が project「${titleOf(owner)}」の # AI議論 に載っていません。[chat:${chat.ID}] を加えてください。`);
    }
  }

  const root = findRootProject(vault);
  if (root && !root.IsMetaOnly && isHarnessProject(root.Content)) {
    const [indexId] = projectHarnessIds(root.Content, 'INDEX');
    const index = indexId ? vault.GetThink(indexId) : undefined;
    if (index?.ContentType === 'aiview') {
      if (index.IsMetaOnly) await index.LoadContent();
      const listed = new Set([...index.Content.matchAll(AIWORK_REF_RE)].map(m => m[1]));
      for (const id of listed) {
        if (vault.GetThink(id)?.ContentType !== 'aiview') add('NG', 'INDEX', `INDEX に載っている ${id} が Vault にありません。次の実行か訂正の承認で INDEX が作り直されるまで、AI が無い文脈を探します。`);
      }
      for (const p of projects) {
        for (const field of INDEX_FIELDS) {
          for (const id of projectHarnessIds(p.Content, field)) {
            if (works.has(id) && !listed.has(id)) add('WARN', 'INDEX', `project「${titleOf(p)}」の ${field}「${works.get(id)!.Name}」が INDEX に載っていません。AI が見つけられません（次の実行で INDEX が作り直されます）。`);
          }
        }
      }
    }
    const [inboxId] = projectHarnessIds(root.Content, 'INBOX');
    const inbox = inboxId ? works.get(inboxId) : undefined;
    if (inbox) {
      const items = bodyOf(inbox).split(/\r?\n/).filter(l => /^\s*[-*]\s+/.test(l));
      const noSource = items.filter(l => !/\[[A-Za-z0-9_-]+:[^\]]+\]|https?:\/\//.test(l));
      if (noSource.length) add('WARN', 'INBOX', `INBOX の ${noSource.length} 件に出典（元のメール・スレッド・Think の参照）がありません。見出しだけで要対応にしていないか、元を確かめてください。`);
    }
  }

  const tool = await (env.toolStatus ?? defaultToolStatus)().catch(() => null);
  if (tool && !tool.available) add('NG', '道具', `設定の AI CLI（${tool.cli}）がこの PC に見つかりません。インストールするか、設定の「AIモデル」で別の CLI を選んでください。`);
  else if (tool && !tool.loggedIn) add('NG', '道具', `設定の AI CLI（${tool.cli}）にログインしていません。設定の「AIモデル」でログインしてください。`);

  return findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'NG' ? -1 : 1));
}

/** 報告の本文（タイトル行は prependAiViewEntry が付ける） */
export function formatDoctorReport(findings: DoctorFinding[]): string {
  const ng = findings.filter(f => f.level === 'NG').length;
  const warn = findings.length - ng;
  return [
    `NG: ${ng} / WARN: ${warn}${findings.length === 0 ? '（clean: 下の検査の範囲で異常なし）' : ''}`,
    ...findings.map(f => `- ${f.level} [${f.area}] ${f.message}`),
    '',
    '検査の範囲: 参照・字数・鮮度・実行中の印・会話の原本（両方向）・INDEX（両方向）・INBOX の出典・AI CLI のログイン',
    `検査しないもの: ${DOCTOR_NOT_CHECKED.join('／')}`,
  ].join('\n');
}

const DOCTOR_HEADING_RE = /^#\s+\[(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?\]\s+点検/m;

/** 前回の点検日（# doctor の先頭の記録の日付）。無ければ null */
export function lastDoctorDate(doctor: TTThink | null): Date | null {
  const m = doctor ? DOCTOR_HEADING_RE.exec(doctor.Content) : null;
  if (!m) return null;
  const [y, mo, d] = m[1].split('-').map(Number);
  return new Date(y, mo - 1, d);
}

/** 点検して root の # doctor の先頭に報告を書く（古い報告は直近10件だけ残す。前の版はスナップショットにある） */
export async function runHarnessDoctor(vault: TTVault, env: DoctorEnv = {}): Promise<{ findings: DoctorFinding[]; doctor: TTThink }> {
  const now = env.now ?? new Date();
  const { root } = await ensureRootHarness(vault);
  const findings = await collectDoctorFindings(vault, { ...env, now });
  const doctor = await ensureHarnessAiWork(vault, root, 'doctor');
  if (doctor.IsMetaOnly) await doctor.LoadContent();
  await snapshotBeforeWrite(doctor);
  const title = doctor.TitleLine || doctor.Name;
  const added = prependAiViewEntry(doctor.Content, title, { date: formatLocalDateTime(now), label: '点検', body: formatDoctorReport(findings) });
  const previous = doctor.Content;
  doctor.Content = `${title}\n${latestAiViewEntries(added, DOCTOR_ENTRIES_KEPT)}\n`;
  try { await doctor.SaveContent(); }
  catch (error) { doctor.Content = previous; throw error; }
  vault.NotifyUpdated(false);
  return { findings, doctor };
}

let running: Promise<boolean> | null = null;

/** 前回の点検から7日以上たっていれば点検する。点検したら true。失敗しても呼び出し元を止めない */
export function maybeRunHarnessDoctor(vault: TTVault, env: DoctorEnv = {}): Promise<boolean> {
  if (running) return running;
  const job = (async () => {
    try {
      const now = env.now ?? new Date();
      const root = findRootProject(vault);
      if (!root) return false;
      if (root.IsMetaOnly) await root.LoadContent();
      if (!isHarnessProject(root.Content)) return false;
      const [doctorId] = projectHarnessIds(root.Content, 'doctor');
      const doctor = doctorId ? vault.GetThink(doctorId) ?? null : null;
      if (doctor?.IsMetaOnly) await doctor.LoadContent();
      const last = lastDoctorDate(doctor);
      if (last && now.getTime() - last.getTime() < DOCTOR_INTERVAL_DAYS * DAY_MS) return false;
      await runHarnessDoctor(vault, { ...env, now });
      return true;
    } catch (error) {
      console.warn('[harnessDoctor] 点検できませんでした', error);
      return false;
    }
  })();
  // 中で await せずに終わると、finally で消してから代入することになるため、終わった後に外す
  running = job;
  void job.finally(() => { if (running === job) running = null; });
  return job;
}
