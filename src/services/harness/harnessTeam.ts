/**
 * harnessTeam.ts
 * まとめ役が決めた分担を、担当（役割）の AI CLI に任せる（記事 7章「仕事の中身で、チームを自分で組む」）。
 * 担当は記録を書かない（MCP で既存の Think を書き換えられない）。結果と根拠を回答で返し、アプリが board の行に書く。
 * 担当は並行して動かす（同時に動く数は PC版の AI CLI の同時実行数の上限で決まる）。
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { DomainProfileManager } from '../../platform/DomainProfileManager';
import { parseProject, projectTargetIds } from '../../utils/thinkFormat';
import { ensureHarnessAiWork } from './harnessAiWork';
import { readBoard, writeBoard, type BoardData, type BoardRow, type TeamDirective } from './harnessBoard';
import { findRole, listRoles, type HarnessCliName, type HarnessRole } from './harnessRoles';
import { projectLineage } from './harnessContext';
import type { HarnessRequestReply } from './harnessRun';

const WORKER_TIMEOUT_MS = 600_000;

function newRunId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

/** 分担を board の行にする（既存の行の続きの番号を振る） */
export function addAssignments(data: BoardData, team: TeamDirective, roles: HarnessRole[]): { data: BoardData; added: BoardRow[] } {
  let next = data.rows.reduce((max, r) => Math.max(max, Number(/^T(\d+)$/.exec(r.id)?.[1] ?? 0)), 0);
  const added = team.assignments.map(a => {
    const role = findRole(roles, a.role);
    return { id: `T${++next}`, role: role?.name ?? a.role, ...(role ? { roleId: role.id } : {}), task: a.task, state: 'assigned' as const };
  });
  return {
    data: { goal: team.goal ?? data.goal, doneCriteria: team.doneCriteria ?? data.doneCriteria, rows: [...data.rows, ...added] },
    added,
  };
}

export function buildWorkerMessage(project: TTThink, vault: TTVault, data: BoardData, row: BoardRow, role: HarnessRole | null): string {
  const title = parseProject(project.Content).title;
  const targets = projectTargetIds(project.Content).flatMap(id => {
    const t = vault.GetThink(id);
    return t ? [`- [${t.ContentType}:${id}] ${t.Name}`] : [];
  });
  return [
    `あなたは projectファイル「${title}」のチームの担当「${row.role}」です。まとめ役から次の作業を任されました。`,
    '',
    '# 担当の役割',
    role?.rules || '（定義の無い即席の担当です。作業の内容から、必要な読み方・確かめ方を自分で決める）',
    '',
    '# チームのゴール',
    `ゴール: ${data.goal || '（未設定）'}`,
    `完了条件: ${data.doneCriteria || '（未設定）'}`,
    '',
    `# 任された作業（${row.id}）`,
    row.task,
    '',
    '# 対象（本文は thinktank_get_record で読む）',
    ...(targets.length ? targets : ['（なし）']),
    '',
    '# 守ること',
    '- 既存の Think は書き換えられません（試みると拒否されます）。記録はまとめ役とアプリが書きます。',
    '- reply に、結果と根拠（どの Think のどこか）を書く。確かめられなかったこと・やっていないことは、そうはっきり書く。',
    '- 任された作業の範囲を超えない。判断に迷ったら、その点を reply に書いて終える。',
  ].join('\n');
}

export interface RunTeamOptions {
  vault: TTVault;
  project: TTThink;
  team: TeamDirective;
  requestReply: HarnessRequestReply;
  defaultCliName?: HarnessCliName;
  defaultModel?: string;
  now?: () => Date;
  onProgress?: (running: number) => void;
}

/** 分担を board に書き、担当を並行して動かし、報告を行に書く。追加した行を返す */
export async function runTeam(options: RunTeamOptions): Promise<BoardRow[]> {
  const { vault, project, team, requestReply, defaultCliName, defaultModel, now = () => new Date(), onProgress = () => {} } = options;
  const board = await ensureHarnessAiWork(vault, project, 'board');
  if (board.IsMetaOnly) await board.LoadContent();
  const roles = await listRoles(vault, await projectLineage(vault, project));
  const assigned = addAssignments(readBoard(board), team, roles);
  let data = assigned.data;
  await writeBoard(vault, board, data);

  const update = async (id: string, patch: Partial<BoardRow>) => {
    data = { ...data, rows: data.rows.map(r => (r.id === id ? { ...r, ...patch } : r)) };
    await writeBoard(vault, board, data).catch(error => console.warn('[harnessTeam] board を保存できませんでした', error));
  };

  let running = 0;
  await Promise.all(assigned.added.map(async row => {
    const role = row.roleId ? roles.find(r => r.id === row.roleId) ?? null : null;
    const runId = newRunId();
    running++;
    onProgress(running);
    await update(row.id, { state: 'running', runId, startedAt: now().toISOString() });
    try {
      const cliName = role?.cli ?? defaultCliName;
      const model = role?.model ?? (role?.cli ? undefined : defaultModel);
      const res = await requestReply({
        requestId: runId,
        profileId: DomainProfileManager.activeProfile.id,
        panelRole: 'Seeds',
        bundleId: project.ID,
        projectId: project.ID,
        bundleTitle: parseProject(project.Content).title,
        relatedDocuments: [],
        userMessage: buildWorkerMessage(project, vault, data, row, role),
        timeoutMs: WORKER_TIMEOUT_MS,
        harness: { writableIds: [] },
        ...(cliName ? { cliName } : {}),
        ...(model ? { model } : {}),
      }, row.id);
      const report = (res.reply ?? '').trim();
      await update(row.id, {
        state: report ? 'reported' : 'failed', ...(report ? { report } : { note: '担当の回答が空でした。' }),
        endedAt: now().toISOString(), ...(res.modelLabel ? { model: res.modelLabel } : {}),
      });
    } catch (error) {
      await update(row.id, { state: 'failed', note: error instanceof Error ? error.message : String(error), endedAt: now().toISOString() });
    } finally {
      running--;
      onProgress(running);
    }
  }));
  return data.rows.filter(r => assigned.added.some(a => a.id === r.id));
}
