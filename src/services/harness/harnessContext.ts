/**
 * harnessContext.ts
 * AIハーネスの1回の実行で AI に渡す文脈を組み立てる（記事の SessionStart）。
 * 常に読むもの（規約・PROFILE・INDEX・status・decision・log の直近）と、索引から辿るものを分ける。
 * docs/261122/AIハーネス実装計画.md §3.2
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import {
  PARENT_PROJECT_ID_KEY, PROJECT_RULES_HEADING, parseProject, projectHarnessIds,
  projectTargetIds, readProjectSectionText, readProjectStatus, type HarnessField,
} from '../../utils/thinkFormat';
import { latestAiViewEntries } from '../../utils/aiViewFormat';
import { HARNESS_CHAR_LIMITS, findRootProject } from './harnessRoot';

/**
 * アプリの既定の規約。記事の筆者が実際の失敗から足したルールで、利用者の規約より前に置く。
 */
export const HARNESS_DEFAULT_RULES = [
  '見出しや件名だけで「要対応」と判断しない。元のメール・スレッド・Think と照らし合わせた根拠を INBOX の項目に書く。',
  '古い記録を日付で一律に退避しない。退避してよいのは、終わった経緯だけ。',
  '確かめていないことを確かめたと書かない。未実施のことは未実施と書く。',
];
const MAX_STATUS_CHARS = 4_000;
const MAX_DECISION_CHARS = 8_000;
const LOG_ENTRIES = 3;
const MAX_LOG_CHARS = 6_000;
const CHAT_MESSAGES = 10;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…（以下 ${text.length - max} 文字省略）` : text;
}

function bodyOf(think: TTThink): string {
  return think.Content.split(/\r?\n/).slice(1).join('\n').trim();
}

async function loaded(think: TTThink | undefined | null): Promise<TTThink | null> {
  if (!think) return null;
  if (think.IsMetaOnly) await think.LoadContent();
  return think.IsMetaOnly ? null : think;
}

/** root（タイトル「Thinktank」）から対象 project までの project（親→子の順） */
export async function projectLineage(vault: TTVault, project: TTThink): Promise<TTThink[]> {
  const chain: TTThink[] = [];
  const seen = new Set<string>();
  let current: TTThink | null = project;
  while (current && !seen.has(current.ID)) {
    seen.add(current.ID);
    const ready = await loaded(current);
    if (ready) chain.unshift(ready);
    const parentId: unknown = current.Metadata?.[PARENT_PROJECT_ID_KEY];
    const parent = typeof parentId === 'string' ? vault.GetThink(parentId) : undefined;
    current = parent && parent.ContentType === 'project' ? parent : null;
  }
  const root = findRootProject(vault);
  if (root && !seen.has(root.ID)) {
    const ready = await loaded(root);
    if (ready) chain.unshift(ready);
  }
  return chain;
}

async function aiWorksOf(vault: TTVault, project: TTThink, field: HarnessField): Promise<TTThink[]> {
  const works: TTThink[] = [];
  for (const id of projectHarnessIds(project.Content, field)) {
    const think = vault.GetThink(id);
    if (think?.ContentType !== 'aiview') continue;
    const ready = await loaded(think);
    if (ready) works.push(ready);
  }
  return works;
}

/** 子から親へ辿って最初に見つかった項目の AIWork（PROFILE・INDEX・INBOX 用） */
async function nearestAiWork(vault: TTVault, lineage: TTThink[], field: HarnessField): Promise<TTThink | null> {
  for (const p of [...lineage].reverse()) {
    const [work] = await aiWorksOf(vault, p, field);
    if (work) return work;
  }
  return null;
}

export interface HarnessDocument {
  id: string;
  title: string;
  body: string;
  /** 本文の字数（省略前） */
  chars: number;
  limit?: number;
}

export interface HarnessContext {
  projectId: string;
  projectTitle: string;
  state: string;
  /** 親→子の順の規約（project タイトルと本文） */
  rules: Array<{ projectTitle: string; text: string }>;
  conditions: string;
  /** # 対象 の Think（本文は AI が MCP で読む） */
  targets: Array<{ id: string; title: string; contentType: string }>;
  otherTargets: string[];
  profile: HarnessDocument | null;
  index: HarnessDocument | null;
  projects: HarnessDocument[];
  styles: HarnessDocument[];
  status: HarnessDocument;
  decision: HarnessDocument;
  log: HarnessDocument;
  chatHistory: string;
}

function doc(think: TTThink, max: number, body = bodyOf(think), limit?: number): HarnessDocument {
  return { id: think.ID, title: think.Name, body: clip(body, max), chars: body.length, ...(limit ? { limit } : {}) };
}

function limited(think: TTThink, field: HarnessField): HarnessDocument {
  const limit = HARNESS_CHAR_LIMITS[field]!;
  return doc(think, limit * 2, bodyOf(think), limit);
}

export interface CollectHarnessContextInput {
  vault: TTVault;
  project: TTThink;
  log: TTThink;
  status: TTThink;
  decision: TTThink;
  chatHistory: string;
}

export async function collectHarnessContext(input: CollectHarnessContextInput): Promise<HarnessContext> {
  const { vault, project, log, status, decision } = input;
  const lineage = await projectLineage(vault, project);
  const rules = lineage.flatMap(p => {
    const text = readProjectSectionText(p.Content, PROJECT_RULES_HEADING);
    return text ? [{ projectTitle: parseProject(p.Content).title, text }] : [];
  });
  const targets = projectTargetIds(project.Content).flatMap(id => {
    const think = vault.GetThink(id);
    return think ? [{ id, title: think.Name, contentType: think.ContentType }] : [];
  });
  const targetText = readProjectSectionText(project.Content, '対象');
  const otherTargets = targetText.split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !/^\[[A-Za-z0-9_-]*:?[^\]]*\]/.test(l) && l !== '*');
  const profile = await nearestAiWork(vault, lineage, 'PROFILE');
  const index = await nearestAiWork(vault, lineage, 'INDEX');
  // 作法は project をまたいで使うため、祖先（root を含む）の styles も渡す
  const styles: TTThink[] = [];
  for (const p of lineage) {
    for (const work of await aiWorksOf(vault, p, 'styles')) if (!styles.includes(work)) styles.push(work);
  }
  return {
    projectId: project.ID,
    projectTitle: parseProject(project.Content).title,
    state: readProjectStatus(project.Content).state,
    rules,
    conditions: readProjectSectionText(project.Content, '条件'),
    targets,
    otherTargets,
    profile: profile ? limited(profile, 'PROFILE') : null,
    index: index ? limited(index, 'INDEX') : null,
    projects: (await aiWorksOf(vault, project, 'projects')).map(t => limited(t, 'projects')),
    styles: styles.map(t => limited(t, 'styles')),
    status: doc(status, MAX_STATUS_CHARS),
    decision: doc(decision, MAX_DECISION_CHARS),
    log: doc(log, MAX_LOG_CHARS, latestAiViewEntries(log.Content, LOG_ENTRIES)),
    chatHistory: input.chatHistory,
  };
}

export const HARNESS_CHAT_HISTORY_MESSAGES = CHAT_MESSAGES;

export interface HarnessMessageOptions {
  runId: string;
  /** log の記録のタイトル行に書く日時（yyyy-MM-dd HH:mm） */
  dateTime: string;
  /** 利用者の発言。自動で続ける回は undefined */
  userMessage?: string;
  /** 記録が足りなかったときの追加の依頼 */
  missing?: Array<'log' | 'status'>;
}

function section(lines: string[], heading: string, body: string): void {
  lines.push(`## ${heading}`, body.trim() || '（まだありません）', '');
}

/** AI へ渡す依頼文 */
export function buildHarnessMessage(ctx: HarnessContext, opts: HarnessMessageOptions): string {
  const lines: string[] = [];
  if (opts.missing) {
    lines.push(`projectファイル「${ctx.projectTitle}」の作業記録が足りないため、次を書いてから終えてください（作業そのものはやり直さない）。`);
    if (opts.missing.includes('log')) lines.push(`- log（thinkid="${ctx.log.id}"）の先頭に、今回の実行の記録「# [${opts.dateTime}] 実行 ${opts.runId}」を追記する（観点・判断と理由・エラーと対処）`);
    if (opts.missing.includes('status')) lines.push(`- status（thinkid="${ctx.status.id}"）を今の状態（フェーズ・直近の成果・未了・次の行動・期限）に書き直す`);
    lines.push('- 決定があれば decision に追加する', '');
  } else {
    lines.push(`あなたは projectファイル「${ctx.projectTitle}」（thinkid="${ctx.projectId}"）の仕事を、利用者の代わりに進めるエージェントです。`);
    lines.push('下の規約と記録を読み、status の「次の行動」から仕事を進めてください。会話はセッションをまたいで消えるため、続きに必要なことは必ず記録に残します。', '');
  }

  lines.push('# 規約（アプリの既定のあとに、親から子の順。後のものほど優先）');
  lines.push('## アプリの既定', ...HARNESS_DEFAULT_RULES.map(r => `- ${r}`));
  for (const r of ctx.rules) lines.push(`## ${r.projectTitle}`, r.text);
  lines.push('');

  const size = (d: HarnessDocument) => (d.limit ? `（${d.chars}/${d.limit}字${d.chars > d.limit * 0.9 ? '。上限に近いので、細かな内容を styles・knowledge へ分ける提案をする' : ''}）` : '');
  lines.push('# 利用者と文脈');
  section(lines, `PROFILE（利用者の好み）${ctx.profile ? ` thinkid="${ctx.profile.id}"${size(ctx.profile)}` : ''}`, ctx.profile?.body ?? '');
  section(lines, `INDEX（文脈の索引。必要な文脈は thinktank_get_record で読む）${ctx.index ? ` thinkid="${ctx.index.id}"` : ''}`, ctx.index?.body ?? '');
  for (const p of ctx.projects) section(lines, `projects: ${p.title} thinkid="${p.id}"${size(p)}`, p.body);
  for (const s of ctx.styles) section(lines, `styles: ${s.title} thinkid="${s.id}"${size(s)}`, s.body);

  lines.push('# この project');
  lines.push(`- 状態: ${ctx.state}`);
  if (ctx.conditions) lines.push(`- 条件:\n${ctx.conditions}`);
  lines.push(`- 対象（本文は thinktank_get_record で読む）: ${ctx.targets.length ? '' : 'なし'}`);
  for (const t of ctx.targets) lines.push(`  - [${t.contentType}:${t.id}] ${t.title}`);
  for (const o of ctx.otherTargets) lines.push(`  - ${o}`);
  lines.push('');
  section(lines, `status（現在地） thinkid="${ctx.status.id}"`, ctx.status.body);
  section(lines, `decision（決定の一覧。ここに無い決定は未決） thinkid="${ctx.decision.id}"`, ctx.decision.body);
  section(lines, `log（経緯。直近の記録だけ。古いものは thinktank_get_record で読む） thinkid="${ctx.log.id}"`, ctx.log.body);
  if (ctx.chatHistory) section(lines, '直近の会話', ctx.chatHistory);

  lines.push('# 今回の依頼');
  lines.push(opts.userMessage?.trim() ? `利用者の発言: ${opts.userMessage.trim()}` : '（利用者の発言なし。status の次の行動から続ける）');
  lines.push('');

  lines.push('# 記録の書き方（必ず守る）');
  lines.push('書き換えてよいのは次の3つの AIWork だけです。ほかの Think を書き換えようとすると拒否されます。新しい成果物は thinktank_create_think で projectId を指定して作ってかまいません。');
  lines.push(`1. log（thinkid="${ctx.log.id}"）: thinktank_get_record で本文と updatedAt を読み、thinktank_update_think（expectedVersion=updatedAt）で、タイトル行の直後に次の記録を加え、既存の記録はそのまま後ろに続ける。`);
  lines.push('```', `# [${opts.dateTime}] 実行 ${opts.runId}`, '（観点・判断と理由・エラーと対処。見出しは ## 以下）', '```');
  lines.push(`2. status（thinkid="${ctx.status.id}"）: フェーズ・直近の成果・未了・次の行動・期限を、今の状態に書き直す（1画面に収める）。`);
  lines.push(`3. decision（thinkid="${ctx.decision.id}"）: 利用者と決めたことがあれば「決定・理由・根拠（利用者の発言）・日付」で追加する。既存の決定は消さない。`);
  lines.push('- 「今回だけ」の指示は log にだけ残す。');
  lines.push('');

  lines.push('# 訂正の提案（「今後は」「いつも」と言われたとき）');
  lines.push('利用者が今後も続けてほしいことを言ったら、PROFILE・styles・knowledge・規約は書き換えず、応答の JSON の "corrections" で提案する。利用者が承認したものだけをアプリが書き込む。行き先は種類で決める:');
  lines.push('- PROFILE: どの作業にも共通する好み');
  lines.push('- styles: 特定の業務のやり方（targetName に業務名。既存の styles に足すなら targetId）');
  lines.push('- projects: この project の現況');
  lines.push('- knowledge: 繰り返し出る技術の罠や手順（targetName に題名）');
  lines.push('- rules: 働き方のルール（この project の # 規約）');
  lines.push('userQuote には今回の利用者の発言から、根拠になる部分をそのまま写す（言い換えない）。「今回だけ」「今日は」の指示は提案にしない。');
  lines.push('');

  lines.push('# 止まる場面');
  lines.push('次の場面では作業を進めず、利用者に確認する: 元に戻せない操作、外部への送信、依頼範囲の変更、価値判断が必要な完了の判定。');
  lines.push('');
  lines.push('# 応答の JSON に加える項目');
  lines.push('応答の JSON には、上の形式に加えて次の "harness" を必ず入れる。');
  lines.push('```json');
  lines.push('{ "harness": { "state": "continue | waiting | done", "question": "waiting / done のときに利用者へ聞くこと" } }');
  lines.push('```');
  lines.push('訂正の提案があるときだけ、次の "corrections" も入れる（最大5件）。');
  lines.push('```json');
  lines.push('{ "corrections": [ { "kind": "PROFILE | styles | projects | knowledge | rules", "text": "書き足す1文", "userQuote": "利用者の発言の写し", "reason": "理由", "targetId": "既存の AIWork の thinkid（任意）", "targetName": "新しく作るときの名前（任意）" } ] }');
  lines.push('```');
  lines.push('- continue: 利用者の返事を待たずに次の作業へ進める');
  lines.push('- waiting: 利用者の判断や情報が要る（question に聞くことを書く）');
  lines.push('- done: 完了条件を満たしたと考える（question で「完了としてよいか」を、成果の要約と確かめた内容を添えて聞く）');
  lines.push('reply には、利用者に伝えること（今回したこと・結果・聞きたいこと）を書く。');
  return lines.join('\n');
}
