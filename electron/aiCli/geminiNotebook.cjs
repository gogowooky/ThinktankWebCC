'use strict';

/**
 * electron/aiCli/geminiNotebook.cjs
 * GeminiNotebook CLI（nlm）でのタイトル取得と質問。
 * 外からは electron/aiCliRunner.cjs を通して使う。
 */

const { spawn } = require('child_process');
const { AiCliError } = require('./errors.cjs');
const { acquireCliSlot, releaseCliSlot } = require('./cliRuntime.cjs');
const { createRunSandboxDir, cleanupRunSandboxDir } = require('./sandbox.cjs');
const { resolveGeminiNotebookExecutablePath, runAuthProbe } = require('./cliDetection.cjs');

function parseGeminiNotebookResponse(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) throw new Error('GeminiNotebook CLI の応答が空でした。');

  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    // 更新通知などが標準出力に混ざった場合も、最後の JSON オブジェクトを読み取る。
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('GeminiNotebook CLI のJSON応答を解析できませんでした。');
    try {
      value = JSON.parse(raw.slice(start, end + 1));
    } catch {
      throw new Error('GeminiNotebook CLI のJSON応答を解析できませんでした。');
    }
  }

  if (value?.error) throw new Error(String(value.error));
  if (typeof value?.answer !== 'string' || !value.answer.trim()) {
    throw new Error('GeminiNotebook CLI の回答が空でした。');
  }
  return value.answer.trim();
}

function parseGeminiNotebookTitle(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) throw new Error('GeminiNotebook CLI のNotebook情報が空でした。');
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('GeminiNotebook CLI のNotebook情報を解析できませんでした。');
    try {
      value = JSON.parse(raw.slice(start, end + 1));
    } catch {
      throw new Error('GeminiNotebook CLI のNotebook情報を解析できませんでした。');
    }
  }
  const title = value?.title ?? value?.name ?? value?.notebook?.title ?? value?.notebook?.name;
  if (typeof title !== 'string' || !title.trim()) throw new Error('Notebookタイトルを取得できませんでした。');
  return title.trim();
}

/** CSV先頭のNotebook IDに対応する表示タイトルを取得する。 */
async function getGeminiNotebookTitle({
  notebookId,
  timeoutMs = 20_000,
  spawnImpl = spawn,
  binPathOverride,
} = {}) {
  const id = String(notebookId || '').trim();
  if (!id || id === 'None') throw new AiCliError('GeminiNotebook の Notebook ID が設定されていません。');
  const binPath = binPathOverride || resolveGeminiNotebookExecutablePath();
  if (!binPath) throw new AiCliError('GeminiNotebook CLI（nlm）がこの PC に見つかりません。');

  const probe = await runAuthProbe({
    binPath,
    args: ['notebook', 'get', id, '--json'],
    timeoutMs,
    spawnImpl,
  });
  if (probe.timedOut) throw new AiCliError(`Notebookタイトルの取得がタイムアウトしました (${Math.round(timeoutMs / 1000)}秒)`);
  if (probe.exitCode !== 0) {
    throw new AiCliError(`Notebookタイトルを取得できませんでした: ${(probe.stderr || probe.stdout || '').slice(0, 400)}`);
  }
  try {
    return parseGeminiNotebookTitle(probe.stdout);
  } catch (err) {
    throw new AiCliError(err.message || String(err));
  }
}

/** 設定された Notebook ID に対して nlm notebook query を実行する。 */
async function runGeminiNotebookConversation({
  notebookId,
  userMessage,
  timeoutMs = 180_000,
  spawnImpl = spawn,
  binPathOverride,
} = {}) {
  const id = String(notebookId || '').trim();
  const question = String(userMessage || '').trim();
  if (!id || id === 'None') throw new AiCliError('GeminiNotebook の Notebook ID が設定されていません。');
  if (!question) throw new AiCliError('GeminiNotebook に送る質問が空です。');

  const binPath = binPathOverride || resolveGeminiNotebookExecutablePath();
  if (!binPath) {
    throw new AiCliError('GeminiNotebook CLI（nlm）がこの PC に見つかりません。nlm をインストールしてログインしてください。');
  }

  await acquireCliSlot();
  const sandboxDir = createRunSandboxDir();
  try {
    const answer = await new Promise((resolve, reject) => {
      const cliTimeoutSeconds = Math.max(1, Math.floor(Math.max(1000, timeoutMs - 5000) / 1000));
      const args = ['notebook', 'query', id, question, '--json', '--timeout', String(cliTimeoutSeconds)];
      const child = spawnImpl(binPath, args, {
        cwd: sandboxDir,
        shell: false,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1', CI: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        try { child.kill(); } catch { /* ignore */ }
        reject(new Error(`GeminiNotebook CLI がタイムアウトしました (${Math.round(timeoutMs / 1000)}秒)`));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
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
        if (code !== 0) {
          reject(new Error(`終了コード ${code}: ${(stderr || stdout).slice(0, 400)}`));
          return;
        }
        try {
          resolve(parseGeminiNotebookResponse(stdout));
        } catch (err) {
          reject(new Error(`${err.message || err}${stderr ? `: ${stderr.slice(0, 400)}` : ''}`));
        }
      });
    });

    return {
      reply: answer,
      insufficientEvidence: false,
      citations: [],
      proposals: [],
      executedCli: 'nlm',
    };
  } catch (err) {
    if (err instanceof AiCliError) throw err;
    throw new AiCliError(`GeminiNotebook CLI の実行に失敗しました: ${err.message || err}`);
  } finally {
    cleanupRunSandboxDir(sandboxDir);
    releaseCliSlot();
  }
}

module.exports = {
  parseGeminiNotebookResponse,
  parseGeminiNotebookTitle,
  getGeminiNotebookTitle,
  runGeminiNotebookConversation,
};
