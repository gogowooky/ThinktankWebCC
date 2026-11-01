/**
 * projectSummary.ts
 * 各パネルの AIView サブパネルの「現状要約」「進捗要約」「実績要約」。
 * ロード中の projectファイルの情報と、対応する「# ○○把握用プロンプト」で AI CLI に要約させ、
 * # AIまとめ の先頭の AIViewファイルへ AI CLI 自身が MCP（thinktank_update_think）で追記する。
 * AIViewファイルの新規作成と # AIまとめ へのタグの追加だけはアプリが行う
 * （MCP の thinktank_create_think は projectファイルの # 対象 に載せてしまうため）。
 */

import type { TTVault } from '../models/TTVault';
import type { TTThink } from '../models/TTThink';
import type { PanelRoleKey } from '../../shared/domainProfile';
import { AI_MODEL_PLACEHOLDER } from '../../shared/promptBuilder';
import { StorageManager } from './storage/StorageManager';
import type { ThinkSnapshotRecord } from './storage/StorageManager';
import { DomainProfileManager } from '../platform/DomainProfileManager';
import { FirestoreRelayClient } from '../platform/web/FirestoreRelayClient';
import { invokeIpc } from '../utils/ipcError';
import {
  addAiViewIdToHead, firstAiViewId, parseProject, readProjectSectionText, targetsAllThinks,
} from '../utils/thinkFormat';
import { aiViewEntryHeading, formatLocalDate, prependAiViewEntry } from '../utils/aiViewFormat';
import { diffLines } from '../utils/lineDiff';

export type ProjectSummaryKind = 'current' | 'progress' | 'result';

export interface ProjectSummarySpec {
  label: string;
  /** projectファイルの見出し（AIへの指示） */
  promptHeading: string;
  /** 比べる snapshot。none は現在の内容だけを読む */
  snapshot: 'none' | 'latest' | 'oldest';
  /** AI への依頼の中身 */
  task: string;
}

export const PROJECT_SUMMARIES: Record<ProjectSummaryKind, ProjectSummarySpec> = {
  current: {
    label: '現状要約', promptHeading: '現状把握用プロンプト', snapshot: 'none',
    task: '対象ファイルの現時点の内容をまとめて、プロジェクトの現状を要約してください。',
  },
  progress: {
    label: '進捗要約', promptHeading: '進捗把握用プロンプト', snapshot: 'latest',
    task: '各対象ファイルの最新のスナップショットから現在までの差分をもとに、その間の進捗を要約してください。',
  },
  result: {
    label: '実績要約', promptHeading: '実績把握用プロンプト', snapshot: 'oldest',
    task: '各対象ファイルの最古のスナップショットから現在までの差分をもとに、これまでの実績を要約してください。',
  },
};

export type SummaryPanelKey = 'thinktank' | 'seeds' | 'working' | 'harvest';

export const SUMMARY_KIND_OF_PANEL: Record<SummaryPanelKey, ProjectSummaryKind> = {
  thinktank: 'current',
  seeds: 'current',
  working: 'progress',
  harvest: 'result',
};

const PANEL_ROLE: Record<SummaryPanelKey, PanelRoleKey> = {
  thinktank: 'Thinktank', seeds: 'Seeds', working: 'Working', harvest: 'Harvest',
};

// AI CLI へ渡す文字数を抑える
const MAX_FILE_CHARS = 6_000;
const MAX_TOTAL_CHARS = 200_000;
const LOAD_CONCURRENCY = 6;
const AI_TIMEOUT_MS = 300_000;
// AI CLI の MCP での書き込みは、PC版は画面へ通知され、Web版は中継役PCが Firestore へ保存してから届く
const AI_WRITE_WAIT_MS = 10_000;
const AI_WRITE_POLL_MS = 500;

export interface SummaryTargetInput {
  id: string;
  title: string;
  contentType: string;
  content: string;
  /** progress / result で比べる snapshot。無ければ null */
  snapshot?: { body: string; title: string; snapshotAt: string } | null;
}

export interface SummaryWriteTarget {
  aiViewId: string;
  title: string;
  date: string;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…（以下 ${text.length - max} 文字省略）` : text;
}

/** AI へ渡す依頼文。projectファイルの情報・指示・対象ファイル（または差分）と、AIViewファイルへの書き込み方を並べる */
export function buildProjectSummaryMessage(
  kind: ProjectSummaryKind, projectContent: string, targets: SummaryTargetInput[],
  write: SummaryWriteTarget, options: { recentOnly?: boolean } = {},
): string {
  const spec = PROJECT_SUMMARIES[kind];
  const project = parseProject(projectContent);
  const heading = aiViewEntryHeading(write.date, spec.label);
  const lines: string[] = [];
  lines.push(`projectファイル「${project.title}」の${spec.label}を作成し、AIViewファイルへ書き込んでください。`);
  lines.push(spec.task);
  lines.push('');
  lines.push('## 書き込み方');
  lines.push(`1. thinktank_get_record で thinkid="${write.aiViewId}"（AIViewファイル）の本文と updatedAt を取得する。`);
  lines.push(`2. thinktank_update_think で thinkid="${write.aiViewId}"・expectedVersion=取得した updatedAt・title="${write.title}" を指定し、`
    + 'body には次の記録を先頭に置き、その後に既存の本文をそのまま続けたものを渡す（既存の記録は消さない・書き換えない）。'
    + '記録の1行目はタイトル行、2行目は括弧で囲んだ AI モデル名（下のとおり）、要約は3行目から書く。');
  lines.push('```');
  lines.push(heading);
  lines.push(`(${AI_MODEL_PLACEHOLDER})`);
  lines.push('（要約。見出しは ## 以下だけを使う）');
  lines.push('```');
  lines.push(`3. この依頼で書き換えるのは AIViewファイル（${write.aiViewId}）だけにする。`);
  lines.push('4. reply には書き込んだ要約と同じ内容（タイトル行・モデル名の行を除く）を書く。');
  lines.push('');
  lines.push('## projectファイル');
  lines.push(`- タイトル: ${project.title}`);
  lines.push(`- 見通し: ${readProjectSectionText(projectContent, '見通し') || '未設定'}`);
  lines.push(`- 状態: ${readProjectSectionText(projectContent, '状態') || '不明'}`);
  const conditions = readProjectSectionText(projectContent, '条件');
  if (conditions) lines.push(`- 条件:\n${conditions}`);
  lines.push('');
  lines.push(`## 指示（# ${spec.promptHeading}）`);
  lines.push(readProjectSectionText(projectContent, spec.promptHeading) || '（指示なし。上の依頼に沿って要約してください）');
  lines.push('');
  lines.push(`## 対象ファイル（${targets.length}件）`);
  if (options.recentOnly) lines.push('（# 対象 が「*」のため、1か月以内に更新されたファイルに限っています）');

  let used = lines.join('\n').length;
  let omitted = 0;
  const unchanged: string[] = [];
  for (const t of targets) {
    const block: string[] = [];
    const header = `### [${t.contentType}:${t.id}] ${t.title}`;
    if (spec.snapshot === 'none') {
      block.push(header, clip(t.content, MAX_FILE_CHARS));
    } else if (!t.snapshot) {
      block.push(header, '（スナップショットが無いため比較できません。現在の内容）', clip(t.content, MAX_FILE_CHARS));
    } else {
      const diff = diffLines(`${t.snapshot.title}\n${t.snapshot.body}`, t.content);
      if (!diff.changed) { unchanged.push(`${t.title}（${t.id}）`); continue; }
      block.push(header, `スナップショット: ${t.snapshot.snapshotAt}`, '```diff', clip(diff.lines.join('\n'), MAX_FILE_CHARS), '```');
    }
    const text = block.join('\n');
    if (used + text.length > MAX_TOTAL_CHARS) { omitted++; continue; }
    lines.push(text, '');
    used += text.length + 1;
  }
  if (unchanged.length) lines.push(`### 変更なし（${unchanged.length}件）`, unchanged.join('、'), '');
  if (omitted) lines.push(`（文字数の上限のため ${omitted} 件は省略しました）`);
  return lines.join('\n');
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function pickSnapshot(records: ThinkSnapshotRecord[], which: 'latest' | 'oldest'): ThinkSnapshotRecord | null {
  if (records.length === 0) return null;
  return which === 'latest' ? records[records.length - 1] : records[0];
}

/** projectファイルから配下の project をたどり、本文で名指しされた Think と「*」の有無を集める */
async function projectTree(vault: TTVault, rootId: string): Promise<{ named: Set<string>; targetsAll: boolean }> {
  const named = new Set<string>();
  let targetsAll = false;
  const visited = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const project = vault.GetThink(id);
    if (!project || project.ContentType !== 'project') continue;
    if (project.IsMetaOnly) await project.LoadContent();
    if (targetsAllThinks(project.Content)) targetsAll = true;
    for (const ref of parseProject(project.Content).ids) {
      named.add(ref);
      if (vault.GetThink(ref)?.ContentType === 'project') queue.push(ref);
    }
  }
  return { named, targetsAll };
}

function oneMonthBefore(now: Date): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d.getTime();
}

/**
 * 要約の対象。配下の Think（project 自身・この project の AIまとめ / AI議論は除く）。
 * 「*」で全ファイルを対象にしているときは、名指しされていないものを1か月以内に更新されたものに限る
 */
async function collectTargets(vault: TTVault, project: TTThink, spec: ProjectSummarySpec, now: Date)
  : Promise<{ targets: SummaryTargetInput[]; recentOnly: boolean }> {
  const parsed = parseProject(project.Content);
  const own = new Set([project.ID, ...parsed.aiSummaryIds, ...parsed.aiDiscussionIds]);
  const tree = await projectTree(vault, project.ID);
  const since = oneMonthBefore(now);
  const isRecent = (t: TTThink) => {
    const at = Date.parse(t.UpdatedAt);
    return Number.isFinite(at) && at >= since;
  };
  const members = (await vault.GetThinksForProjectAsync(project.ID))
    .filter(t => !own.has(t.ID))
    .filter(t => !tree.targetsAll || tree.named.has(t.ID) || isRecent(t));
  const targets = await mapLimited(members, LOAD_CONCURRENCY, async think => {
    if (think.IsMetaOnly) await think.LoadContent();
    const snapshot = spec.snapshot === 'none'
      ? undefined
      : pickSnapshot(await StorageManager.instance.listSnapshots(think.ID).catch(() => []), spec.snapshot);
    return {
      id: think.ID, title: think.Name, contentType: think.ContentType, content: think.Content,
      ...(snapshot === undefined ? {} : { snapshot }),
    };
  });
  return { targets, recentOnly: tree.targetsAll };
}

export interface AiReply {
  reply: string;
  /** AI CLI を起動した側が決めた AI モデル名 */
  modelLabel?: string;
}

async function requestAiReply(payload: Record<string, unknown>): Promise<AiReply> {
  const electronAi = typeof window !== 'undefined' ? window.electronAPI?.ai : undefined;
  let res: AiReply;
  if (electronAi?.conversation) {
    res = await invokeIpc(() => electronAi.conversation(payload));
  } else if (FirestoreRelayClient.isConfigured()) {
    const relayRes = await FirestoreRelayClient.request<typeof payload, AiReply>('ai.conversation', payload, AI_TIMEOUT_MS + 30_000);
    if (!relayRes.ok || !relayRes.result) throw new Error(relayRes.error || 'Firebase E2EE 中継でのAI応答取得に失敗しました。');
    res = relayRes.result;
  } else {
    throw new Error('AIに接続できません。PC版を使うか、PC連携を設定してください。');
  }
  return { reply: (res.reply ?? '').trim(), ...(res.modelLabel ? { modelLabel: res.modelLabel } : {}) };
}

/** # AIまとめ の先頭の AIViewファイル。読み取れなければ null */
export function findSummaryAiView(vault: TTVault, project: TTThink): TTThink | null {
  const id = firstAiViewId(project.Content);
  const think = id ? vault.GetThink(id) : undefined;
  return think && think.ContentType === 'aiview' ? think : null;
}

/** AIViewファイルの2行目以降の先頭が、今回の記録のタイトル行か */
function startsWithEntry(content: string, heading: string): boolean {
  const firstEntryLine = content.split(/\r?\n/).slice(1).find(l => l.trim() !== '');
  return firstEntryLine?.trim() === heading;
}

/** 正本から読み直す（Web版では AI CLI の書き込みが画面へ通知されないため） */
async function refetch(think: TTThink): Promise<void> {
  try {
    const record = await StorageManager.instance.getRecord(think.ID);
    if (!record || record.meta.isDeleted) return;
    const content = `${record.meta.title}\n${record.body}`;
    if (content === think.Content) return;
    // 通知で先に反映された新しい内容を、古い正本で戻さない
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

/** AI CLI が AIViewファイルを書き換えたか（before から変わり、先頭が今回の記録になったか）を待って確かめる */
async function waitForAiWrite(think: TTThink, before: string, heading: string, waitMs: number): Promise<boolean> {
  const written = () => think.Content !== before && startsWithEntry(think.Content, heading);
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (written()) return true;
    await refetch(think);
    if (written()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, AI_WRITE_POLL_MS));
  }
}

export type ProjectSummaryProgress =
  | { stage: 'collect' }
  | { stage: 'ai'; targetCount: number }
  | { stage: 'verify' };

export interface GenerateProjectSummaryOptions {
  kind: ProjectSummaryKind;
  panelKey: SummaryPanelKey;
  vault: TTVault;
  projectId: string;
  /** テスト用。省略時は PC版 IPC か PC連携の中継で AI CLI に依頼する */
  requestReply?: (payload: Record<string, unknown>) => Promise<AiReply>;
  now?: Date;
  /** AI CLI の書き込みが届くのを待つ時間 */
  aiWriteWaitMs?: number;
  /** 進み具合（画面の状況表示用） */
  onProgress?: (progress: ProjectSummaryProgress) => void;
}

export interface ProjectSummaryResult {
  aiView: TTThink;
  /** ai = AI CLI が MCP で書き込んだ。app = 書き込まれなかったので AI の回答をアプリが追記した */
  writtenBy: 'ai' | 'app';
}

/** 要約を AIViewファイルの先頭へ追記させ、その AIViewファイルを返す */
export async function generateProjectSummary(options: GenerateProjectSummaryOptions): Promise<ProjectSummaryResult> {
  const {
    kind, panelKey, vault, projectId, requestReply = requestAiReply, now = new Date(),
    aiWriteWaitMs = AI_WRITE_WAIT_MS, onProgress = () => {},
  } = options;
  const spec = PROJECT_SUMMARIES[kind];
  const project = vault.GetThink(projectId);
  if (!project || project.ContentType !== 'project') throw new Error('projectファイルがロードされていません。');
  if (project.IsMetaOnly) await project.LoadContent();
  if (project.IsMetaOnly) throw new Error('projectファイルの本文を読み込めませんでした。');

  onProgress({ stage: 'collect' });
  const { targets, recentOnly } = await collectTargets(vault, project, spec, now);
  const title = parseProject(project.Content).title;

  // 書き込み先を先に用意する。読み取れなければ作って # AIまとめ の先頭に載せる
  let aiView = findSummaryAiView(vault, project);
  if (!aiView) {
    aiView = await vault.CreateAiViewThink(title);
    const previousProject = project.Content;
    project.Content = addAiViewIdToHead(previousProject, aiView.ID);
    try { await project.SaveContent(); }
    catch (error) { project.Content = previousProject; throw error; }
    vault.NotifyUpdated(false);
  }
  if (aiView.IsMetaOnly) await aiView.LoadContent();

  const date = formatLocalDate(now);
  const heading = aiViewEntryHeading(date, spec.label);
  const before = aiView.Content;
  onProgress({ stage: 'ai', targetCount: targets.length });
  const { reply, modelLabel } = await requestReply({
    profileId: DomainProfileManager.activeProfile.id,
    panelRole: PANEL_ROLE[panelKey],
    bundleId: project.ID,
    projectId: project.ID,
    bundleTitle: title,
    relatedDocuments: [],
    userMessage: buildProjectSummaryMessage(kind, project.Content, targets, { aiViewId: aiView.ID, title, date }, { recentOnly }),
    timeoutMs: AI_TIMEOUT_MS,
  });

  onProgress({ stage: 'verify' });
  if (await waitForAiWrite(aiView, before, heading, aiWriteWaitMs)) {
    vault.NotifyUpdated(false);
    return { aiView, writtenBy: 'ai' };
  }

  // AI CLI が書き込めなかった（MCP が使えない等）ときは、回答をアプリが同じ書式で追記する
  if (!reply) throw new Error('AIがAIViewファイルへ書き込まず、応答も空でした。');
  aiView.Content = prependAiViewEntry(before, title, { date, label: spec.label, model: modelLabel, body: reply });
  try { await aiView.SaveContent(); }
  catch (error) { aiView.Content = before; throw error; }
  vault.NotifyUpdated(false);
  return { aiView, writtenBy: 'app' };
}
