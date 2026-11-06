/**
 * perfLog.ts
 * 起動の節目と入力の遅れを記録する。PC版は TT_PERF=1 で起動したとき、
 * Web版は localStorage の tt-perf を 1 にしたときだけ動く。
 */

const INPUT_DELAY_THRESHOLD_MS = 50;
const INPUT_EVENTS = new Set(['keydown', 'pointerdown', 'click']);

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.electronAPI?.perfEnabled) return true;
  try {
    return localStorage.getItem('tt-perf') === '1';
  } catch {
    return false;
  }
}

const enabled = isEnabled();

export function perfMark(label: string): void {
  if (enabled) console.info(`[Perf] renderer:${label} ${Math.round(performance.now())}ms`);
}

function observe(init: PerformanceObserverInit & { durationThreshold?: number }, onEntry: (entry: PerformanceEntry) => void): void {
  try {
    new PerformanceObserver(list => list.getEntries().forEach(onEntry)).observe(init);
  } catch {
    // 対応していない環境では記録しないだけ
  }
}

export function startPerfObservers(): void {
  if (!enabled) return;
  observe({ type: 'longtask' }, entry => {
    console.info(`[Perf] renderer:longtask ${Math.round(entry.duration)}ms at ${Math.round(entry.startTime)}ms`);
  });
  observe({ type: 'event', durationThreshold: INPUT_DELAY_THRESHOLD_MS }, entry => {
    // 1回の操作で pointerenter などが何十件も出るので、操作の起点だけを残す
    if (!INPUT_EVENTS.has(entry.name)) return;
    console.info(`[Perf] renderer:input ${entry.name} ${Math.round(entry.duration)}ms`);
  });
}
