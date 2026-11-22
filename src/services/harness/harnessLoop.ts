/**
 * harnessLoop.ts
 * AIハーネスのループ。project の # 状態 が「進行中」の間、AI に実行を繰り返させる。
 * AI が利用者の判断を求めたら（waiting / done）「待機」にして止まる。完了にするのは利用者。
 * 無人で走り続けないよう、1回の起動で続ける回数に上限を設ける。
 * docs/261122/AIハーネス実装計画.md §5.1
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { readProjectStatus, setProjectState, type ProjectState } from '../../utils/thinkFormat';
import { appendHarnessChatTurn, ensureHarnessChat } from './harnessChat';
import { runHarnessTurn, type HarnessRequestReply, type HarnessTurnStage } from './harnessRun';

export const MAX_TURNS_PER_START = 5;
export const HARNESS_LOCK_KEY = 'harnessLock';
/** 異常終了で外れなかった実行中の印を、これより古ければ無視する */
export const HARNESS_LOCK_TTL_MS = 20 * 60 * 1000;
const INSTANCE_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

export interface HarnessLoopStatus {
  projectId: string;
  running: boolean;
  turn: number;
  maxTurns: number;
  stage?: HarnessTurnStage;
  startedAt: number;
  /** 終わったときの結果 */
  outcome?: { type: 'waiting' | 'stopped' | 'limit' | 'error'; message: string };
}

export interface HarnessLock { by: string; at: string }

/** ほかの画面・PCのループが実行中か（期限切れの印は無視する） */
export function lockedByOther(project: TTThink, nowMs = Date.now()): boolean {
  const lock = project.Metadata?.[HARNESS_LOCK_KEY] as Partial<HarnessLock> | undefined;
  if (!lock || typeof lock.by !== 'string' || lock.by === INSTANCE_ID || typeof lock.at !== 'string') return false;
  const at = Date.parse(lock.at);
  return Number.isFinite(at) && nowMs - at < HARNESS_LOCK_TTL_MS;
}

export interface StartHarnessLoopOptions {
  /** chat からの発言。状態の変更で起動したときは省略 */
  userMessage?: string;
  trigger: 'state' | 'chat';
  requestReply?: HarnessRequestReply;
  maxTurns?: number;
  aiWriteWaitMs?: number;
}

class HarnessLoopManager {
  private statuses = new Map<string, HarnessLoopStatus>();
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify(): void { this.listeners.forEach(fn => fn()); }

  getStatus(projectId: string): HarnessLoopStatus | undefined { return this.statuses.get(projectId); }

  isRunning(projectId: string): boolean { return !!this.statuses.get(projectId)?.running; }

  /** テスト用 */
  reset(): void { this.statuses.clear(); this.notify(); }

  /**
   * # 状態 と実行中の印を書き換えて保存する。利用者が編集中（未保存）なら書き換えない。
   * lock: true で印を付け、false で外す、undefined で触らない
   */
  private async writeState(vault: TTVault, project: TTThink, state: ProjectState | null, lock?: boolean): Promise<boolean> {
    if (project.IsMetaOnly) await project.LoadContent();
    if (project.IsDirty) return false;
    const previous = project.Content;
    const previousMeta = project.Metadata;
    if (state && readProjectStatus(previous).state !== state) project.Content = setProjectState(previous, state);
    if (lock === true) project.Metadata = { ...project.Metadata, [HARNESS_LOCK_KEY]: { by: INSTANCE_ID, at: new Date().toISOString() } };
    if (lock === false && project.Metadata?.[HARNESS_LOCK_KEY]) {
      const { [HARNESS_LOCK_KEY]: _removed, ...rest } = project.Metadata;
      project.Metadata = rest;
    }
    try {
      await project.SaveContent();
    } catch (error) {
      project.Content = previous;
      project.Metadata = previousMeta;
      console.warn('[harnessLoop] projectファイルの状態を保存できませんでした', error);
      return false;
    }
    vault.NotifyUpdated(false);
    return true;
  }

  private async note(vault: TTVault, project: TTThink, message: string): Promise<void> {
    try {
      const chat = await ensureHarnessChat(vault, project);
      await appendHarnessChatTurn(vault, chat, { question: '（アプリ）', model: 'Thinktank', createdAt: new Date().toISOString(), reply: message });
    } catch (error) {
      console.warn('[harnessLoop] chat に記録できませんでした', error);
    }
  }

  /** ループを始める。既に実行中なら何もしない（false） */
  async start(vault: TTVault, projectId: string, options: StartHarnessLoopOptions): Promise<boolean> {
    if (this.isRunning(projectId)) return false;
    const project = vault.GetThink(projectId);
    if (!project || project.ContentType !== 'project') return false;
    const maxTurns = options.maxTurns ?? MAX_TURNS_PER_START;
    const status: HarnessLoopStatus = { projectId, running: true, turn: 0, maxTurns, startedAt: Date.now() };
    this.statuses.set(projectId, status);
    this.notify();

    const finish = async (outcome: NonNullable<HarnessLoopStatus['outcome']>, state: ProjectState | null) => {
      await this.writeState(vault, project, state, false);
      status.running = false;
      status.stage = undefined;
      status.outcome = outcome;
      this.notify();
    };

    try {
      if (project.IsMetaOnly) await project.LoadContent();
      if (lockedByOther(project)) {
        await finish({ type: 'stopped', message: 'ほかの画面またはPCでAIが作業中のため、始めませんでした。' }, null);
        return false;
      }
      // chat からの発言は、未着手・待機・保留・完了でも作業を再開する合図として扱う
      await this.writeState(vault, project, '進行中', true);

      for (let turn = 1; turn <= maxTurns; turn++) {
        const state = readProjectStatus(project.Content).state;
        if (state !== '進行中') {
          await finish({ type: 'stopped', message: `状態が「${state}」になったため止めました。` }, null);
          return true;
        }
        status.turn = turn;
        this.notify();
        const first = turn === 1;
        const result = await runHarnessTurn({
          vault, projectId,
          ...(first && options.userMessage ? { userMessage: options.userMessage } : {}),
          ...(first && !options.userMessage && options.trigger === 'state' ? { chatQuestion: '（開始）状態を「進行中」にしました' } : {}),
          ...(options.requestReply ? { requestReply: options.requestReply } : {}),
          ...(options.aiWriteWaitMs !== undefined ? { aiWriteWaitMs: options.aiWriteWaitMs } : {}),
          onStage: stage => { status.stage = stage; this.notify(); },
        });
        const directive = result.directive;
        if (!directive || directive.state !== 'continue') {
          const message = !directive
            ? 'AI が次の進め方（harness.state）を返さなかったため、確認を待ちます。'
            : directive.state === 'done' ? 'AI が完了と判断しました。chat で確認して、よければ状態を「完了」にしてください。'
              : 'AI があなたの返事を待っています。';
          await finish({ type: 'waiting', message }, '待機');
          return true;
        }
      }
      await this.note(vault, project, `続けて実行する上限（${maxTurns}回）に達したため止めました。続けるときは返信するか、状態を「進行中」にしてください。`);
      await finish({ type: 'limit', message: `続けて実行する上限（${maxTurns}回）に達したため止めました。` }, '待機');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.note(vault, project, `エラーのため止めました: ${message}`);
      await finish({ type: 'error', message: `エラーのため止めました: ${message}` }, '待機');
      return true;
    }
  }

  /** 実行中のループを、今の実行が終わったところで止める（状態を「保留」にする） */
  async requestStop(vault: TTVault, projectId: string): Promise<void> {
    const project = vault.GetThink(projectId);
    if (!project || project.ContentType !== 'project') return;
    await this.writeState(vault, project, '保留');
  }
}

export const HarnessLoop = new HarnessLoopManager();
