/**
 * harnessReview.ts
 * 週次の改善ループ（記事 9章 harness-review・skill-mining）と、日次一覧・週報の材料。
 * 事実を集めるのは機械（アプリ）、改善の判断は AI と利用者に分ける。
 * 「週次の改善」project を通常のループで動かし、1週間分の記録を材料として渡す。改善案は訂正の提案と同じく承認制で、
 * 根拠は材料にある ID で確かめる。採用・見送りは週次の改善 project の decision に残し、同じ案を繰り返させない。
 * 日次一覧は保存せず、その日の log の記録を集めて表示する。docs/261122/AIハーネス実装計画.md Phase 5
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { formatLocalDate } from '../../utils/aiViewFormat';
import {
  PROJECT_RULES_HEADING, PROJECT_RULES_PLACEHOLDER, isHarnessProject, isRootProjectTitle, parseProject, projectHarnessIds,
} from '../../utils/thinkFormat';
import { ensureRootHarness, findRootProject } from './harnessRoot';

export const REVIEW_TITLE = '週次の改善';
export const REVIEW_METADATA_KEY = 'harnessReview';
export const REVIEW_INTERVAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOAD_CONCURRENCY = 6;
const MAX_DIGEST_LINE = 160;

export const REVIEW_RULES = [
  'この project は、ハーネス全体の週次の見直しを行う。下の「1週間の材料」だけを根拠にする。',
  '見る観点: 3回以上繰り返している作業／毎回口で伝えている指示／繰り返し出る失敗や罠／使われていない作法（styles）／規約と実際の運用のずれ／点検（doctor）の警告への対応。',
  '改善案は corrections で出し、evidenceIds に根拠の project・AIWork の ID（材料に載っているものだけ）を書く。規約の改善は rules とし、targetId に直す project の ID を書く。',
  '前回までの採否（decision）を読み、見送った案を同じ理由で出し直さない。候補が無ければ「今回は候補なし」で終える。無理に作らない。',
  'log の今回の記録に「## 週報（下書き）」として、1週間で進んだこと・止まっていること・決まったことを書く。',
  '提案があれば waiting で「提案を確かめてください」と聞き、無ければ done で終える。',
].join('\n');

/** 週次の改善 project か */
export function isReviewProject(project: TTThink | null | undefined): boolean {
  return !!project && project.ContentType === 'project' && project.Metadata?.[REVIEW_METADATA_KEY] === true;
}

async function loadAll(things: TTThink[]): Promise<void> {
  const pending = things.filter(t => t.IsMetaOnly);
  let next = 0;
  const worker = async () => { while (next < pending.length) await pending[next++].LoadContent(); };
  await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, pending.length) }, worker));
}

export interface ActivityEntry {
  date: string;
  time: string;
  projectId: string;
  projectTitle: string;
  logId: string;
  heading: string;
  firstLine: string;
}

const ENTRY_HEADING_RE = /^#\s+\[(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?\]\s+(.*)$/;

/** log の記録の日付・見出し・本文の最初の行 */
export function logEntries(content: string): Array<{ date: string; time: string; heading: string; firstLine: string }> {
  const out: Array<{ date: string; time: string; heading: string; firstLine: string }> = [];
  const lines = content.split(/\r?\n/).slice(1);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { inFence = !inFence; continue; }
    const m = inFence ? null : ENTRY_HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const first = lines.slice(i + 1).find(l => l.trim() && !/^\(.*\)$/.test(l.trim()) && !ENTRY_HEADING_RE.test(l)) ?? '';
    out.push({ date: m[1], time: m[2] ?? '', heading: m[3].trim(), firstLine: first.trim().slice(0, MAX_DIGEST_LINE) });
  }
  return out;
}

/**
 * from〜to（yyyy-MM-dd、両端を含む）に書かれた、ハーネスの project の log の記録。新しい順。
 * 週次の改善 project 自身は除く
 */
export async function collectActivity(vault: TTVault, from: string, to: string): Promise<ActivityEntry[]> {
  await loadAll(vault.GetProjects());
  const out: ActivityEntry[] = [];
  for (const p of vault.GetProjects()) {
    if (p.IsMetaOnly || !isHarnessProject(p.Content) || isReviewProject(p)) continue;
    const [logId] = projectHarnessIds(p.Content, 'log');
    const log = logId ? vault.GetThink(logId) : undefined;
    if (!log || log.ContentType !== 'aiview') continue;
    if (log.IsMetaOnly) await log.LoadContent();
    for (const e of logEntries(log.Content)) {
      if (e.date < from || e.date > to) continue;
      out.push({ ...e, projectId: p.ID, projectTitle: parseProject(p.Content).title, logId: log.ID });
    }
  }
  return out.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

/** 日次一覧の行（AIChat や週報の材料に使う） */
export function formatActivity(entries: ActivityEntry[]): string {
  return entries.map(e => `- ${e.date}${e.time ? ` ${e.time}` : ''} 「${e.projectTitle}」 ${e.heading}${e.firstLine ? `: ${e.firstLine}` : ''}`
    + `（project ${e.projectId}／log ${e.logId}）`).join('\n');
}

/** 週次の改善 project を用意する（無ければ root の配下に作る） */
export async function ensureReviewProject(vault: TTVault): Promise<TTThink> {
  const existing = vault.GetProjects().find(p => isReviewProject(p));
  if (existing) {
    if (existing.IsMetaOnly) await existing.LoadContent();
    return existing;
  }
  const { root } = await ensureRootHarness(vault);
  const project = await vault.CreateProject(REVIEW_TITLE, root.ID);
  project.Metadata = { ...project.Metadata, [REVIEW_METADATA_KEY]: true };
  project.Content = project.Content
    .replace('# 見通し\n未設定', '# 見通し\nエリア')
    .replace(`# ${PROJECT_RULES_HEADING}\n${PROJECT_RULES_PLACEHOLDER}`, `# ${PROJECT_RULES_HEADING}\n${REVIEW_RULES}`);
  await project.SaveContent();
  vault.NotifyUpdated(false);
  return project;
}

export interface ReviewMaterial {
  text: string;
  /** 改善案の根拠にしてよい ID（材料に載っている project・log・doctor・PROFILE・styles 等） */
  evidenceIds: Set<string>;
  entryCount: number;
}

/** 週次の見直しの材料: 1週間の log の記録（日次一覧）・最新の点検の報告・文脈の一覧 */
export async function collectReviewMaterial(vault: TTVault, now: Date): Promise<ReviewMaterial> {
  const to = formatLocalDate(now);
  const from = formatLocalDate(new Date(now.getTime() - (REVIEW_INTERVAL_DAYS - 1) * DAY_MS));
  const entries = await collectActivity(vault, from, to);
  const evidenceIds = new Set<string>();
  for (const e of entries) { evidenceIds.add(e.projectId); evidenceIds.add(e.logId); }
  const lines = [`## 1週間の記録（${from}〜${to}、${entries.length}件）`, formatActivity(entries) || '（記録なし）', ''];

  const root = findRootProject(vault);
  if (root && !root.IsMetaOnly) {
    evidenceIds.add(root.ID);
    const [doctorId] = projectHarnessIds(root.Content, 'doctor');
    const doctor = doctorId ? vault.GetThink(doctorId) : undefined;
    if (doctor?.ContentType === 'aiview') {
      if (doctor.IsMetaOnly) await doctor.LoadContent();
      evidenceIds.add(doctor.ID);
      const latest = doctor.Content.split(/\r?\n/).slice(1).join('\n').split(/\n(?=#\s+\[)/)[0]?.trim() ?? '';
      lines.push(`## 最新の点検の報告（doctor ${doctor.ID}）`, latest || '（まだありません）', '');
    }
    const contexts: string[] = [];
    for (const field of ['PROFILE', 'styles', 'knowledge'] as const) {
      for (const id of projectHarnessIds(root.Content, field)) {
        const work = vault.GetThink(id);
        if (work?.ContentType !== 'aiview') continue;
        evidenceIds.add(id);
        contexts.push(`- ${field}: ${work.Name}（${id}、更新 ${work.UpdatedAt ? formatLocalDate(new Date(work.UpdatedAt)) : '不明'}）`);
      }
    }
    lines.push('## 文脈の一覧（使われているかの目安。本文は thinktank_get_record で読む）', contexts.join('\n') || '（なし）');
  }
  for (const p of vault.GetProjects()) {
    if (!p.IsMetaOnly && isHarnessProject(p.Content) && !isRootProjectTitle(p.Name)) evidenceIds.add(p.ID);
  }
  return { text: lines.join('\n'), evidenceIds, entryCount: entries.length };
}

/** 前回の見直しの日（週次の改善 project の log の先頭の記録の日付） */
export async function lastReviewDate(vault: TTVault, review: TTThink): Promise<Date | null> {
  const [logId] = projectHarnessIds(review.Content, 'log');
  const log = logId ? vault.GetThink(logId) : undefined;
  if (!log) return null;
  if (log.IsMetaOnly) await log.LoadContent();
  const [latest] = logEntries(log.Content);
  if (!latest) return null;
  const [y, m, d] = latest.date.split('-').map(Number);
  return new Date(y, m - 1, d);
}
