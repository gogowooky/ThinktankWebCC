import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const temporary = resolve(workspace, 'tmp', 'vitest');
mkdirSync(temporary, { recursive: true });
const args = process.argv.slice(2);
// デスクトップ環境でもメモリ使用量と一時ファイルの生成先を一定にする。
const defaults = args.some(arg => arg.startsWith('--maxWorkers')) ? [] : ['--maxWorkers=1'];
const child = spawn(process.execPath, [resolve(workspace, 'node_modules/vitest/vitest.mjs'), ...defaults, ...args], {
  cwd: workspace,
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); });
