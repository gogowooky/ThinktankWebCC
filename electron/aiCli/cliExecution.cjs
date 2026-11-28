'use strict';

/**
 * electron/aiCli/cliExecution.cjs
 * AI CLI を設定隔離環境で起動して応答を得る処理と、その中断。
 * 外からは electron/aiCliRunner.cjs を通して使う。
 */

const { spawn, execFile } = require('child_process');
const { startMcpBridgeServer } = require('../mcpBridge.cjs');
const { AiCliDeniedError, AiCliCanceledError } = require('./errors.cjs');
const { getDefaultMcpHost, acquireCliSlot, releaseCliSlot } = require('./cliRuntime.cjs');
const { createRunSandboxDir, cleanupRunSandboxDir, prepareSandboxMcpConfig } = require('./sandbox.cjs');
const { resolveExecutablePath } = require('./cliDetection.cjs');
const { quoteForCmd, buildCliArgs, buildCliInput, extractCliResponse, describeCliFailure } = require('./cliCommand.cjs');

/** runId → 中断の手段。executeIsolatedCli の間だけ登録する */
const runningCliRuns = new Map();

/**
 * 指定された AI CLI を設定隔離環境で起動し、標準入力からプロンプトを渡して出力を取得する。
 */
async function executeIsolatedCli({
  cliName = 'claude',
  model,
  promptText,
  timeoutMs = 120_000,
  spawnImpl = spawn,
  binPathOverride,
  mcpHost,
  projectId,
  /** cancelCliRun で中断するときの識別子（画面の会話の requestId） */
  runId,
  timing,
}) {
  const binPath = binPathOverride || resolveExecutablePath(cliName);
  if (!binPath) {
    throw new Error(`AI CLI "${cliName}" がこの PC に見つかりません。`);
  }

  // 中断（cancelCliRun）は順番待ち中・実行中のどちらでも受け付ける
  const run = { canceled: false, cancel: () => { run.canceled = true; } };
  if (runId) runningCliRuns.set(runId, run);

  const queuedAt = performance.now();
  await acquireCliSlot();
  const admittedAt = performance.now();
  if (timing) timing.queueMs = Math.round(admittedAt - queuedAt);
  let sandboxDir;
  let processStart;
  const activeMcpHost = mcpHost !== undefined ? mcpHost : getDefaultMcpHost();
  let bridgeServer = null;
  try {
    if (run.canceled) throw new AiCliCanceledError();
    sandboxDir = createRunSandboxDir();
    if (activeMcpHost) {
      bridgeServer = await startMcpBridgeServer(activeMcpHost, timing);
    }
    const vaultDir =
      activeMcpHost && activeMcpHost.vaultEngine && typeof activeMcpHost.vaultEngine.getVaultDir === 'function'
        ? activeMcpHost.vaultEngine.getVaultDir()
        : undefined;
    const userDataDir =
      activeMcpHost && activeMcpHost.vaultEngine ? activeMcpHost.vaultEngine.userDataDir : undefined;
    const localVaultRoot =
      activeMcpHost && activeMcpHost.vaultEngine ? activeMcpHost.vaultEngine.localVaultRoot || undefined : undefined;

    const { mcpConfigPath, mcpServerScript, execCommand, env: mcpEnv } = prepareSandboxMcpConfig(sandboxDir, {
      pipePath: bridgeServer ? bridgeServer.pipePath : undefined,
      vaultDir,
      localVaultRoot,
      userDataDir,
      projectId,
    });

    return await new Promise((resolve, reject) => {
      const isCmdWrapper = process.platform === 'win32' && binPath.toLowerCase().endsWith('.cmd');
      const cliArgs = buildCliArgs(cliName, model, {
        mcpConfigPath,
        mcpServer: { command: execCommand, args: [mcpServerScript], env: mcpEnv },
      });
      const args = isCmdWrapper ? quoteForCmd(cliArgs) : cliArgs;
      // claude / codex CLI はローカルの CLI ログインセッション（サブスクリプション認証）を使用するため、
      // 環境変数に古い ANTHROPIC_API_KEY / OPENAI_API_KEY が残っていると "Invalid API key" エラーになるのを防ぐ。
      const childEnv = {
        ...process.env,
        NO_COLOR: '1',
        CI: '1',
      };
      if (cliName === 'claude') {
        delete childEnv.ANTHROPIC_API_KEY;
      } else if (cliName === 'codex') {
        delete childEnv.OPENAI_API_KEY;
      }

      processStart = performance.now();
      if (timing) timing.setupMs = Math.round(processStart - admittedAt);
      const child = spawnImpl(binPath, args, {
        cwd: sandboxDir,
        shell: isCmdWrapper,
        windowsHide: true,
        env: childEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let finished = false;

      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        killProcessTree(child);
        reject(new Error(`AI CLI (${cliName}) がタイムアウトしました (${Math.round(timeoutMs / 1000)}秒)`));
      }, timeoutMs);

      run.cancel = () => {
        run.canceled = true;
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        killProcessTree(child);
        reject(new AiCliCanceledError());
      };
      if (run.canceled) run.cancel();

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(describeCliFailure(cliName, code, stderr)));
          return;
        }
        try {
          resolve({
            cliName,
            stdout: extractCliResponse(cliName, stdout),
            stderr,
            exitCode: code ?? 0,
            sandboxDir,
          });
        } catch (err) {
          if (err instanceof AiCliDeniedError) { reject(err); return; }
          reject(new Error(`${err.message || err}${stderr ? `: ${stderr.slice(0, 400)}` : ''}`));
        }
      });

      if (finished) return;
      child.stdin.write(buildCliInput(cliName, promptText), 'utf8');
      child.stdin.end();
    });
  } finally {
    if (timing) {
      if (processStart !== undefined) timing.processMs = Math.round(performance.now() - processStart);
      else timing.setupMs = Math.round(performance.now() - admittedAt);
    }
    if (runId && runningCliRuns.get(runId) === run) runningCliRuns.delete(runId);
    if (bridgeServer) {
      await bridgeServer.close().catch(() => {});
    }
    if (sandboxDir) cleanupRunSandboxDir(sandboxDir);
    releaseCliSlot();
  }
}

/** 実行中・順番待ち中の AI CLI を中断する（画面の「中断」）。該当が無ければ false */
function cancelCliRun(runId) {
  const run = runId ? runningCliRuns.get(runId) : undefined;
  if (!run) return false;
  run.cancel();
  return true;
}

/**
 * 子プロセスを孫プロセスごと止める。Windows の .cmd ラッパー（shell: true）では
 * child.kill() が cmd.exe だけを止め、実際の CLI が残るため taskkill /T を使う
 */
function killProcessTree(child) {
  try {
    if (process.platform === 'win32' && child.pid) {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    } else {
      child.kill();
    }
  } catch {
    // 既に終了している
  }
}

module.exports = {
  executeIsolatedCli,
  cancelCliRun,
  killProcessTree,
};
