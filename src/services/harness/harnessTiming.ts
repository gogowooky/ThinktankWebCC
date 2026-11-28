import type { HarnessTimingReport, TimingStage } from '../../../shared/harnessTiming';
import type { HarnessRequestReply } from './harnessRun';

const storageKey = (projectId: string) => 'thinktank.harnessTiming.v1.' + projectId;

export function lastHarnessTiming(projectId: string): HarnessTimingReport | undefined {
  try {
    const report = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? 'null');
    if (report?.version === 1 && Array.isArray(report.stages) && Array.isArray(report.calls)) return report;
  } catch { /* 一時ストレージが使えない環境でも計測はメモリで続く。 */ }
}

export class HarnessTimer {
  private readonly started = performance.now();
  private since = this.started;
  private stage: TimingStage = 'start';
  private turn = 0;
  private readonly report: HarnessTimingReport = {
    version: 1, startedAt: new Date().toISOString(), totalMs: 0, outcome: '',
    stages: [], calls: [],
  };

  private closeStage(now: number) {
    this.report.stages.push({ turn: this.turn, stage: this.stage, ms: Math.round(now - this.since) });
    this.since = now;
  }

  enter(stage: TimingStage, turn: number) {
    const now = performance.now();
    this.closeStage(now);
    this.turn = turn;
    this.stage = stage;
  }

  measureCalls(request: HarnessRequestReply): HarnessRequestReply {
    return async (payload, workerRow) => {
      const start = performance.now();
      const call: HarnessTimingReport['calls'][number] = {
        turn: this.turn, role: workerRow ?? (this.stage === 'retry' ? 'まとめ役（追記）' : 'まとめ役'),
        requestId: String(payload.requestId), ms: 0, ok: false,
      };
      this.report.calls.push(call);
      try {
        const reply = await request({ ...payload, measureHarness: true });
        call.host = reply.harnessTiming;
        if (reply.harnessTimingError !== undefined) throw new Error(reply.harnessTimingError);
        call.ok = true;
        return reply;
      } finally {
        call.ms = Math.round(performance.now() - start);
      }
    };
  }

  finish(projectId: string, outcome: string) {
    const now = performance.now();
    this.closeStage(now);
    this.report.totalMs = Math.round(now - this.started);
    this.report.outcome = outcome;
    try { localStorage.setItem(storageKey(projectId), JSON.stringify(this.report)); }
    catch { /* 容量不足でも、現在の画面からレポートを書き出せる。 */ }
    return this.report;
  }
}
