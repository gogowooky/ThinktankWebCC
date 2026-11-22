/**
 * harnessRoot.ts
 * root（タイトル「Thinktank」の projectファイル）に置く、全 project 共通の PROFILE・INDEX・INBOX。
 * INDEX はアプリが作る索引で、文脈（PROFILE・styles・knowledge・projects・INBOX）の場所と更新日を並べる。
 * 手書きにしないのは、記事で「INDEX と実際のファイルのずれ」が繰り返し起きたため（作る側を機械にすれば、ずれない）。
 * docs/261122/AIハーネス実装計画.md §3.6・Phase 2
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { formatLocalDate } from '../../utils/aiViewFormat';
import {
  ROOT_PROJECT_TITLE, isHarnessProject, isRootProjectTitle, parseProject, projectHarnessIds, type HarnessField,
} from '../../utils/thinkFormat';
import { HARNESS_FIELD_LABELS, ensureHarnessAiWork } from './harnessAiWork';
import { snapshotBeforeWrite } from './aiWorkVersions';

/** 記事の上限（PROFILE・INDEX は 3,000字、projects は 5,000字、styles・knowledge は 3,000字、INBOX は 10,000字） */
export const HARNESS_CHAR_LIMITS: Partial<Record<HarnessField, number>> = {
  PROFILE: 3_000, INDEX: 3_000, projects: 5_000, styles: 3_000, knowledge: 3_000, INBOX: 10_000,
};

const TEMPLATES: Partial<Record<HarnessField, string>> = {
  PROFILE: '（どの作業にも共通する、利用者の好みと目指す姿。承認した訂正がここに加わる。上限 3,000字）',
  INBOX: '（未対応の用件。1項目ごとに出典（元のメール・スレッド・Think の参照）を書く。対応したら消す。上限 10,000字）',
};

/** root の projectファイル（同名が複数あれば最も古いもの。画面の「root」と同じ選び方） */
export function findRootProject(vault: TTVault): TTThink | null {
  return vault.GetProjects()
    .filter(p => isRootProjectTitle(p.Name))
    .sort((a, b) => a.ID.localeCompare(b.ID))[0] ?? null;
}

export function bodyOf(think: TTThink): string {
  return think.Content.split(/\r?\n/).slice(1).join('\n').trim();
}

async function withTemplate(work: TTThink, field: HarnessField): Promise<TTThink> {
  const template = TEMPLATES[field];
  if (!template || bodyOf(work)) return work;
  if (work.IsMetaOnly) await work.LoadContent();
  if (bodyOf(work)) return work;
  work.Content = `${work.TitleLine || work.Name}\n${template}`;
  await work.SaveContent();
  return work;
}

export interface RootHarness {
  root: TTThink;
  profile: TTThink;
  index: TTThink;
  inbox: TTThink;
}

/** root と、その PROFILE・INDEX・INBOX を用意する（無ければ作る）。INDEX は作り直す */
export async function ensureRootHarness(vault: TTVault): Promise<RootHarness> {
  const root = findRootProject(vault) ?? await vault.CreateProject(ROOT_PROJECT_TITLE);
  if (root.IsMetaOnly) await root.LoadContent();
  const profile = await withTemplate(await ensureHarnessAiWork(vault, root, 'PROFILE'), 'PROFILE');
  const index = await ensureHarnessAiWork(vault, root, 'INDEX');
  const inbox = await withTemplate(await ensureHarnessAiWork(vault, root, 'INBOX'), 'INBOX');
  await refreshHarnessIndex(vault, index);
  return { root, profile, index, inbox };
}

const INDEX_FIELDS: HarnessField[] = ['PROFILE', 'styles', 'knowledge', 'projects', 'INBOX'];

/** INDEX の本文。読み込み済みのハーネス project の文脈を、種類ごとに場所・更新日・字数で並べる */
export function buildHarnessIndexBody(vault: TTVault): string {
  const projects = vault.GetProjects().filter(p => !p.IsMetaOnly && isHarnessProject(p.Content))
    .sort((a, b) => (isRootProjectTitle(b.Name) ? 1 : 0) - (isRootProjectTitle(a.Name) ? 1 : 0) || a.ID.localeCompare(b.ID));
  const lines = ['（アプリが作る文脈の索引。手で書き換えない。本文は thinktank_get_record で読む）'];
  for (const field of INDEX_FIELDS) {
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const project of projects) {
      for (const id of projectHarnessIds(project.Content, field)) {
        const work = vault.GetThink(id);
        if (!work || work.ContentType !== 'aiview' || seen.has(id)) continue;
        seen.add(id);
        const updated = work.UpdatedAt ? formatLocalDate(new Date(work.UpdatedAt)) : '不明';
        const chars = work.IsMetaOnly ? '' : `、${bodyOf(work).length}字`;
        const owner = isRootProjectTitle(project.Name) ? '' : `（${parseProject(project.Content).title}）`;
        rows.push(`- [aiwork:${id}] ${work.Name}${owner}（更新 ${updated}${chars}）`);
      }
    }
    if (rows.length) lines.push(`## ${field}（${HARNESS_FIELD_LABELS[field]}）`, ...rows);
  }
  return lines.join('\n');
}

/** INDEX を作り直す。内容が変わらなければ保存しない */
export async function refreshHarnessIndex(vault: TTVault, index: TTThink): Promise<boolean> {
  if (index.IsMetaOnly) await index.LoadContent();
  const next = `${index.TitleLine || index.Name}\n${buildHarnessIndexBody(vault)}`;
  if (next.trim() === index.Content.trim()) return false;
  await snapshotBeforeWrite(index);
  const previous = index.Content;
  index.Content = next;
  try { await index.SaveContent(); }
  catch (error) { index.Content = previous; throw error; }
  vault.NotifyUpdated(false);
  return true;
}
