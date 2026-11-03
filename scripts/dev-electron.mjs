// npm run dev:electron 用。concurrently -k は Electron が終わると Vite も止めるので、
// 設定の「再起動」は app.relaunch() を使わず、この親プロセスが Electron だけを起動し直す。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const RESTART_EXIT_CODE = 75;

function start() {
  const child = spawn(electronPath, ['electron/main.cjs'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      TT_DEV_RESTART_EXIT_CODE: String(RESTART_EXIT_CODE),
    },
  });
  const forward = (signal) => child.kill(signal);
  process.once('SIGINT', forward);
  process.once('SIGTERM', forward);
  child.on('exit', (code, signal) => {
    process.off('SIGINT', forward);
    process.off('SIGTERM', forward);
    if (code === RESTART_EXIT_CODE) {
      console.log('[dev-electron] 設定の再起動により Electron を起動し直します');
      start();
      return;
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

start();
