'use strict';

/**
 * electron/aiCliRunner.cjs
 * ローカル AI CLI（claude / codex / antigravity）の自動検出と「設定隔離（空フォルダ cwd・設定無効化）」実行エンジン。
 * システム設計メモ §8 準拠。
 */

const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./shared-dist/index.js');

const SUPPORTED_CLIS = ['claude', 'codex', 'antigravity'];
const DEFAULT_MAX_CONCURRENT_CLI_PROCESSES = 4;

// PC版自身のIPCとWeb版中継リクエストが同時に集中した際、プロセス乱立によるメモリ枯渇を防ぐセマフォ。
let maxConcurrentCliProcesses = DEFAULT_MAX_CONCURRENT_CLI_PROCESSES;
let activeCliProcessCount = 0;
const cliWaitQueue = [];

function setMaxConcurrentCliProcesses(limit) {
  const n = Number(limit);
  maxConcurrentCliProcesses = Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_CONCURRENT_CLI_PROCESSES;
}

function acquireCliSlot() {
  if (activeCliProcessCount < maxConcurrentCliProcesses) {
    activeCliProcessCount += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    cliWaitQueue.push(resolve);
  });
}

function releaseCliSlot() {
  const next = cliWaitQueue.shift();
  if (next) {
    next();
  } else {
    activeCliProcessCount = Math.max(0, activeCliProcessCount - 1);
  }
}
const CLI_EXECUTABLE_NAMES = {
  claude: 'claude',
  codex: 'codex',
  antigravity: 'agy',
};

/**
 * Windows 環境では npm グローバルコマンドは .cmd ラッパーまたは .exe として配置される。
 * PowerShell の .ps1 ではなく spawn 可能な .exe / .cmd を優先して解決する。
 */
function resolveExecutablePath(cliName) {
  if (!SUPPORTED_CLIS.includes(cliName)) return null;
  const executableName = CLI_EXECUTABLE_NAMES[cliName];

  if (process.platform === 'win32') {
    try {
      const out = execFileSync('where.exe', [executableName], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
      });
      const lines = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const exeOrCmd =
        lines.find((l) => l.toLowerCase().endsWith('.exe')) ||
        lines.find((l) => l.toLowerCase().endsWith('.cmd')) ||
        lines[0];
      if (exeOrCmd && fs.existsSync(exeOrCmd)) {
        return exeOrCmd;
      }
    } catch {
      // 既知の標準インストールパスを確認
    }
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const candidates = [
      path.join(appData, 'npm', `${executableName}.cmd`),
      path.join(localAppData, 'agy', 'bin', `${executableName}.exe`),
      path.join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin', `${executableName}.exe`),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  try {
    const out = execFileSync('which', [executableName], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    if (out && fs.existsSync(out)) return out;
  } catch {
    // 既定のインストール先を確認
  }
  const defaultPath = path.join(os.homedir(), '.local', 'bin', executableName);
  return fs.existsSync(defaultPath) ? defaultPath : null;
}

/**
 * 利用可能な AI CLI の一覧とパスを検出する。
 */
function detectAvailableClis() {
  const result = {};
  for (const name of SUPPORTED_CLIS) {
    const binPath = resolveExecutablePath(name);
    result[name] = {
      available: Boolean(binPath),
      path: binPath,
    };
  }
  return result;
}

/**
 * 設定隔離用の空ディレクトリを OS 一時領域に用意する。
 * CLAUDE.md / AGENTS.md 等のワークスペース指示の勝手な読み込みを防ぐ。
 */
function ensureIsolatedSandboxDir() {
  const dir = path.join(os.tmpdir(), 'thinktank-ai-cli-sandbox');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 複数プロセスの並列実行時に cwd 内のファイル作成・ロックが干渉しないよう、実行ごとの一時サブディレクトリを作成する。
 */
function createRunSandboxDir() {
  const baseDir = ensureIsolatedSandboxDir();
  const runDir = path.join(
    baseDir,
    `run_${Date.now()}_${process.pid}_${crypto.randomBytes(4).toString('hex')}`,
  );
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

function cleanupRunSandboxDir(runDir) {
  if (!runDir) return;
  try {
    fs.rmSync(runDir, { recursive: true, force: true });
  } catch {
    // Windows でプロセス終了直後にハンドルが一瞬残る場合があるため無視する
  }
}

/**
 * UI側のモデルID（claude-sonnet-5 等）を各 CLI が受け付けるモデル名／エイリアスへ正規化する。
 */
function normalizeCliModel(cliName, modelOverride) {
  const m = String(modelOverride || '').trim().toLowerCase();
  if (cliName === 'antigravity') {
    if (!m || m === 'none' || m.endsWith('-default') || m.endsWith('-isolated')) return null;
    if (!m.includes('gemini')) return null;
    if (m.includes('pro')) return 'gemini-3.1-pro-high';
    if (m.includes('flash')) return 'gemini-3.8-flash-medium';
    return null;
  }
  if (!modelOverride || modelOverride === 'None' || modelOverride.endsWith('-default') || modelOverride.endsWith('-isolated')) {
    return null;
  }
  if (cliName === 'claude') {
    if (m.includes('opus')) return 'opus';
    if (m.includes('haiku')) return 'haiku';
    if (m.includes('sonnet')) return 'sonnet';
    return modelOverride;
  }
  if (cliName === 'codex') {
    if (m === 'gpt-5.6') return null; // codex CLI の既定最新モデルを使用
    return modelOverride;
  }
  return modelOverride;
}

/**
 * CLI 種別ごとの設定隔離コマンド引数を組み立てる。
 * プロンプト本文は長大になるためコマンドライン引数ではなく標準入力（stdin）から渡す。
 */
function buildCliArgs(cliName, modelOverride) {
  const normalizedModel = normalizeCliModel(cliName, modelOverride);
  switch (cliName) {
    case 'claude': {
      const args = [
        '-p',
        '--safe-mode',
        '--setting-sources',
        'user',
        '--strict-mcp-config',
        '--output-format',
        'text',
      ];
      if (normalizedModel) {
        args.push('--model', normalizedModel);
      }
      return args;
    }
    case 'codex': {
      const args = [
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
      ];
      if (normalizedModel) {
        args.push('-m', normalizedModel);
      }
      args.push('-');
      return args;
    }
    case 'antigravity': {
      const args = [
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--sandbox',
      ];
      if (normalizedModel) {
        args.push('--model', normalizedModel);
      }
      return args;
    }
    default:
      throw new Error(`未対応の AI CLI です: ${cliName}`);
  }
}

/**
 * Antigravity のストリーミング入力だけは NDJSON の user event を要求する。
 */
function buildCliInput(cliName, promptText) {
  if (cliName !== 'antigravity') return promptText;
  return `${JSON.stringify({ event: 'user', message: { content: promptText } })}\n`;
}

/**
 * Antigravity の NDJSON から最終 result.response を取り出し、他 CLI と同じ本文契約へ揃える。
 */
function extractCliResponse(cliName, stdout) {
  if (cliName !== 'antigravity') return stdout;

  let terminalResult = null;
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event?.event === 'result' && event.result && typeof event.result === 'object') {
        terminalResult = event.result;
      }
    } catch {
      // 診断行は無視し、機械可読な最終 result のみを採用する。
    }
  }

  if (!terminalResult) {
    throw new Error('Antigravity CLI の最終結果を取得できませんでした。');
  }
  if (terminalResult.status !== 'SUCCESS') {
    throw new Error(terminalResult.error || `Antigravity CLI が ${terminalResult.status || '不明な状態'} で終了しました。`);
  }
  if (typeof terminalResult.response !== 'string' || !terminalResult.response.trim()) {
    throw new Error('Antigravity CLI の応答が空でした。');
  }
  return terminalResult.response;
}

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
}) {
  const binPath = binPathOverride || resolveExecutablePath(cliName);
  if (!binPath) {
    throw new Error(`AI CLI "${cliName}" がこの PC に見つかりません。`);
  }

  await acquireCliSlot();
  const sandboxDir = createRunSandboxDir();
  try {
    return await new Promise((resolve, reject) => {
      const args = buildCliArgs(cliName, model);
      const isCmdWrapper = process.platform === 'win32' && binPath.toLowerCase().endsWith('.cmd');
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
        try {
          child.kill();
        } catch {
          // ignore
        }
        reject(new Error(`AI CLI (${cliName}) がタイムアウトしました (${Math.round(timeoutMs / 1000)}秒)`));
      }, timeoutMs);

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
          reject(
            new Error(
              `AI CLI (${cliName}) が終了コード ${code} で失敗しました: ${(stderr || '').slice(0, 400)}`,
            ),
          );
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
          reject(new Error(`${err.message || err}${stderr ? `: ${stderr.slice(0, 400)}` : ''}`));
        }
      });

      child.stdin.write(buildCliInput(cliName, promptText), 'utf8');
      child.stdin.end();
    });
  } finally {
    cleanupRunSandboxDir(sandboxDir);
    releaseCliSlot();
  }
}

/**
 * ドメインプロファイルと Bundle コンテキストからプロンプトを生成し、
 * ローカル AI CLI（またはテスト/オフライン時の構造化フォールバック）を実行して検証済み応答を返す。
 */
async function runDomainAiConversation(params) {
  const {
    cliName = 'claude',
    model,
    profile,
    panelRole,
    agentId,
    bundleId,
    bundleTitle,
    bundleSummary,
    currentPhase,
    nextAction,
    subtasks,
    pausePoints,
    promotedRecords,
    gates,
    relatedDocuments,
    recentMessages,
    userMessage,
    timeoutMs = 120_000,
  } = params;

  const resolvedProfile = profile || shared.getBuiltinDomainProfile('clinical-trial');
  const promptText = shared.buildConversationPrompt({
    profile: resolvedProfile,
    panelRole,
    agentId,
    bundleId: bundleId || 'default',
    bundleTitle: bundleTitle || '無題のテーマ',
    bundleSummary,
    currentPhase,
    nextAction,
    subtasks,
    pausePoints,
    promotedRecords,
    gates,
    relatedDocuments,
    recentMessages,
    userMessage,
  });

  // 指定された CLI が無ければ、インストール済みの他の CLI へ自動で切り替える
  const requestedCli = cliName === 'gemini' ? 'antigravity' : cliName;
  const detected = detectAvailableClis();
  const selectedCli = detected[requestedCli]?.available
    ? requestedCli
    : SUPPORTED_CLIS.find((c) => detected[c]?.available);
  if (!selectedCli) {
    throw new AiCliError(
      'AI CLI（Claude Code・Codex・Antigravity CLI）がこの PC に見つかりません。いずれかをインストールしてログインすると、AI に相談できます。',
    );
  }

  // 失敗したときは AI の回答に見える定型文を返さず、必ずエラーにする。
  // 以前は「資料を確認しました」「論点を抽出しました」という定型文と作り上げた昇格候補を AI の回答として返しており、
  // 利用者が AI が資料を読んで答えたと思い込み、誤った内容を記録に残すおそれがあった。
  let execResult;
  try {
    execResult = await executeIsolatedCli({ cliName: selectedCli, model, promptText, timeoutMs });
  } catch (err) {
    throw new AiCliError(`AI CLI（${selectedCli}）の実行に失敗しました: ${err.message || err}`);
  }
  return {
    ...shared.validateAiCliResponse(execResult.stdout),
    executedCli: selectedCli,
  };
}

class AiCliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiCliError';
  }
}

module.exports = {
  AiCliError,
  SUPPORTED_CLIS,
  DEFAULT_MAX_CONCURRENT_CLI_PROCESSES,
  setMaxConcurrentCliProcesses,
  resolveExecutablePath,
  detectAvailableClis,
  ensureIsolatedSandboxDir,
  createRunSandboxDir,
  cleanupRunSandboxDir,
  normalizeCliModel,
  buildCliArgs,
  buildCliInput,
  extractCliResponse,
  executeIsolatedCli,
  runDomainAiConversation,
};
