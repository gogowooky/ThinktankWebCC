/**
 * harnessAiWork.ts
 * projectファイルのハーネス項目（log・status・decision 等）が指す AIWork を探し、無ければ作って参照を書き込む。
 * AIWork の保存上の種別は aiview（旧 AIViewファイル）。docs/261122/AIハーネス実装計画.md §2・§3.1
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import {
  HARNESS_MULTI_FIELDS, parseProject, projectHarnessIds, setProjectHarnessId, type HarnessField,
} from '../../utils/thinkFormat';

/** 画面や AIWork のタイトルに添える項目の説明 */
export const HARNESS_FIELD_LABELS: Record<HarnessField, string> = {
  log: '経緯',
  status: '現在地',
  decision: '決定',
  board: '共有ボード',
  PROFILE: '利用者の好み',
  INDEX: '文脈の索引',
  INBOX: '未対応',
  projects: '案件の現況',
  styles: '業務の作法',
  knowledge: '知見',
  doctor: '診断レポート',
};

function asAiWork(vault: TTVault, id: string): TTThink | null {
  const think = vault.GetThink(id);
  return think && think.ContentType === 'aiview' ? think : null;
}

/** 項目に書かれた AIWork のうち、Vault にあるもの（書かれた順） */
export function findHarnessAiWorks(vault: TTVault, project: TTThink, field: HarnessField): TTThink[] {
  return projectHarnessIds(project.Content, field).flatMap(id => asAiWork(vault, id) ?? []);
}

export function findHarnessAiWork(vault: TTVault, project: TTThink, field: HarnessField): TTThink | null {
  return findHarnessAiWorks(vault, project, field)[0] ?? null;
}

/** AIWork のタイトル。複数の項目では name（例: 朝の報告）で区別する */
export function harnessAiWorkTitle(projectTitle: string, field: HarnessField, name?: string): string {
  return `${projectTitle}｜${field}${name ? `｜${name}` : ''}`;
}

async function loadProject(project: TTThink): Promise<void> {
  if (project.IsMetaOnly) await project.LoadContent();
  if (project.IsMetaOnly) throw new Error('projectファイルの本文を読み込めませんでした。');
  if (project.ContentType !== 'project') throw new Error('projectファイルではありません。');
}

async function createAndLink(vault: TTVault, project: TTThink, field: HarnessField, name?: string): Promise<TTThink> {
  const title = harnessAiWorkTitle(parseProject(project.Content).title, field, name);
  const aiWork = await vault.CreateAiViewThink(title);
  const previous = project.Content;
  project.Content = setProjectHarnessId(previous, field, aiWork.ID);
  try { await project.SaveContent(); }
  catch (error) { project.Content = previous; throw error; }
  vault.NotifyUpdated(false);
  return aiWork;
}

// 同じ項目へ同時に作ると AIWork が二重にできるため、作成中の処理を共有する
const pending = new Map<string, Promise<TTThink>>();

/**
 * 項目の AIWork を返す。無い（未記載・Vault に無い・aiview でない）ときは作って項目に書き込む。
 * 複数の項目では先頭のものを返す。
 */
export async function ensureHarnessAiWork(vault: TTVault, project: TTThink, field: HarnessField): Promise<TTThink> {
  await loadProject(project);
  const existing = findHarnessAiWork(vault, project, field);
  if (existing) return existing;
  const key = `${project.ID}:${field}`;
  const running = pending.get(key);
  if (running) return running;
  const job = createAndLink(vault, project, field).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

/** 複数の項目（projects・styles・knowledge）に、新しい AIWork を作って加える */
export async function addHarnessAiWork(vault: TTVault, project: TTThink, field: HarnessField, name: string): Promise<TTThink> {
  if (!HARNESS_MULTI_FIELDS.has(field)) throw new Error(`${field} は1件だけの項目です。`);
  await loadProject(project);
  return createAndLink(vault, project, field, name.trim() || undefined);
}
