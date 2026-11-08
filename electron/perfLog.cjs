'use strict';

/**
 * 起動と同期処理の所要時間を TT_PERF=1 のときだけ記録する。
 * MCP サーバーは標準出力を JSON-RPC に使うので、出力先は標準エラーにする。
 */

const enabled = process.env.TT_PERF === '1';
const SLOW_MS = 20;

function perfMark(label) {
  if (enabled) console.error(`[Perf] main:${label} ${Math.round(process.uptime() * 1000)}ms`);
}

/** Promise を返す処理は完了までの時間を測る（その間メインプロセスは止まらない）。 */
function perfTime(label, fn) {
  if (!enabled) return fn();
  const start = performance.now();
  const done = () => {
    const elapsed = performance.now() - start;
    if (elapsed >= SLOW_MS) console.error(`[Perf] main:${label} ${Math.round(elapsed)}ms`);
  };
  let result;
  try {
    result = fn();
  } catch (err) {
    done();
    throw err;
  }
  if (result && typeof result.then === 'function') return result.finally(done);
  done();
  return result;
}

module.exports = { perfEnabled: enabled, perfMark, perfTime };
