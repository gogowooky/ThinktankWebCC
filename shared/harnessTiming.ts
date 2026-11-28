export const TIMING_STAGES = {
  start: '開始・状態保存', prepare: '記録の準備', snapshots: '版の確認・保存', context: '文脈の組み立て',
  ai: 'まとめ役への依頼', verify: '記録の反映待ち', retry: '追記の依頼', retryVerify: '追記の反映待ち',
  record: '会話と記録の保存', team: '担当の分担・報告待ち', finish: '終了・状態保存',
} as const;
export type TimingStage = keyof typeof TIMING_STAGES;

export interface HostTiming {
  hostMs: number;
  detectMs?: number;
  queueMs?: number;
  setupMs?: number;
  processMs?: number;
  tools: Record<string, { count: number; errors: number; ms: number; maxMs: number }>;
}

export interface HarnessTimingReport {
  version: 1;
  startedAt: string;
  totalMs: number;
  outcome: string;
  stages: { turn: number; stage: TimingStage; ms: number }[];
  calls: { turn: number; role: string; requestId: string; ms: number; ok: boolean; host?: HostTiming }[];
}

const seconds = (ms: number) => (ms / 1000).toFixed(3) + '秒';

export function harnessStageTotals(report: HarnessTimingReport): Map<TimingStage, number> {
  const totals = new Map<TimingStage, number>();
  for (const step of report.stages) totals.set(step.stage, (totals.get(step.stage) ?? 0) + step.ms);
  return totals;
}

const outcomeLabels: Record<string, string> = { waiting: '待機', stopped: '停止', limit: '回数上限', error: 'エラー' };

export function formatHarnessTiming(report: HarnessTimingReport): string {
  const totals = harnessStageTotals(report);
  const lines = [`${report.startedAt}　全体 ${seconds(report.totalMs)}　${outcomeLabels[report.outcome] ?? report.outcome}`, '段階別の実時間（長い順）'];
  for (const [stage, ms] of [...totals].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${TIMING_STAGES[stage]}　${seconds(ms)}`);
  }
  lines.push('各ターンの経過');
  for (const step of report.stages) {
    lines.push(`  ${step.turn ? step.turn + '回目' : '開始時'}　${TIMING_STAGES[step.stage]}　${seconds(step.ms)}`);
  }
  lines.push('AIへの依頼とMCPの内訳（上の実時間に含まれます）');
  for (const call of report.calls) {
    lines.push(`  ${call.turn}回目　${call.role}　${call.requestId}　往復 ${seconds(call.ms)}　${call.ok ? '応答あり' : '失敗'}`);
    const host = call.host;
    if (!host) { lines.push('    PC側の内訳を取得できませんでした。'); continue; }
    const parts: [string, number | undefined][] = [
      ['PC側全体', host.hostMs], ['CLI検出', host.detectMs], ['実行枠待ち', host.queueMs],
      ['起動準備', host.setupMs], ['CLI実行（ツール時間込み）', host.processMs],
    ];
    for (const [label, ms] of parts) if (ms !== undefined) lines.push(`    ${label}　${seconds(ms)}`);
    const tools = Object.entries(host.tools).sort((a,b) => b[1].ms - a[1].ms);
    if (!tools.length) lines.push('    PCのMCP中継で完了したツール呼び出しは0件です。');
    for (const [tool, stat] of tools) {
      lines.push(`    ${tool}　${stat.count}回（失敗${stat.errors}回）　累計 ${seconds(stat.ms)}　最長 ${seconds(stat.maxMs)}`);
    }
  }
  return lines.join('\n');
}
