import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const temporary = resolve(workspace, 'tmp', 'vitest');
mkdirSync(temporary, { recursive: true });
const args = process.argv.slice(2);
// 一時ファイルの生成先を一定にする。並列数は CPU の半分までにして、速さとメモリ使用量の釣り合いを取る
// （直列だと jsdom の準備が積み重なり全体で約3倍かかる）。--maxWorkers=1 を渡せば直列で動く。
const defaults = args.some(arg => arg.startsWith('--maxWorkers')) ? [] : ['--maxWorkers=50%'];
const child = spawn(process.execPath, [resolve(workspace, 'node_modules/vitest/vitest.mjs'), ...defaults, ...args], {
  cwd: workspace,
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); });
