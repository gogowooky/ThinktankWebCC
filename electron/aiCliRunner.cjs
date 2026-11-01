'use strict';

/**
 * electron/aiCliRunner.cjs
 * ローカル AI CLI（claude / codex / antigravity）の自動検出と「設定隔離（空フォルダ cwd・設定無効化）」実行エンジン。
 * システム設計メモ §8 準拠。
 */

const { spawn, execFile, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./shared-dist/index.js');
const { startMcpBridgeServer } = require('./mcpBridge.cjs');

const SUPPORTED_CLIS = ['claude', 'codex', 'antigravity'];
const DEFAULT_MAX_CONCURRENT_CLI_PROCESSES = 4;
const AI_AUTH_LOGIN_URLS = Object.freeze({
  OpenAI: 'https://chatgpt.com/auth/login',
  Gemini: 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2F',
  Claude: 'https://claude.ai/login',
  GNB: 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fnotebook.google.com%2F',
  Local: '',
});

// PC版自身のIPCとWeb版中継リクエストが同時に集中した際、プロセス乱立によるメモリ枯渇を防ぐセマフォ。
let maxConcurrentCliProcesses = DEFAULT_MAX_CONCURRENT_CLI_PROCESSES;
let activeCliProcessCount = 0;
const cliWaitQueue = [];
/** runId → 中断の手段。executeIsolatedCli の間だけ登録する */
const runningCliRuns = new Map();
let defaultMcpHost = null;

function setDefaultMcpHost(mcpHost) {
  defaultMcpHost = mcpHost || null;
}

function getDefaultMcpHost() {
  return defaultMcpHost;
}

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

/** Gemini Notebook CLI (nlm) は通常のモデル CLI とは別に検出する。 */
function resolveGeminiNotebookExecutablePath() {
  const executableName = 'nlm';
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('where.exe', [executableName], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
      });
      // Notebook ID と質問を引数で安全に渡すため、shell が必要な .cmd は使用しない。
      const exePath = out.split(/\r?\n/).map((line) => line.trim()).find((line) => line.toLowerCase().endsWith('.exe'));
      if (exePath && fs.existsSync(exePath)) return exePath;
    } catch {
      // 既知の標準インストールパスを確認
    }
    const candidates = [
      path.join(os.homedir(), '.local', 'bin', 'nlm.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nlm', 'nlm.exe'),
    ];
    return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
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

function runAuthProbe({ binPath, args, timeoutMs = 8000, spawnImpl = spawn }) {
  if (!binPath) return Promise.resolve({ exitCode: null, stdout: '', stderr: '', timedOut: false });
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(binPath, args, {
        cwd: ensureIsolatedSandboxDir(),
        shell: process.platform === 'win32' && binPath.toLowerCase().endsWith('.cmd'),
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1', CI: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ exitCode: null, stdout: '', stderr: String(err?.message || err), timedOut: false });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const append = (current, chunk) => `${current}${chunk.toString('utf8')}`.slice(-64 * 1024);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      finish({ exitCode: null, stdout, stderr, timedOut: true });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.on('error', (err) => finish({ exitCode: null, stdout, stderr: append(stderr, Buffer.from(String(err?.message || err))), timedOut: false }));
    child.on('close', (code) => finish({ exitCode: code, stdout, stderr, timedOut: false }));
  });
}

function authProbeLoggedIn(provider, probe) {
  const output = `${probe.stdout || ''}\n${probe.stderr || ''}`;
  if (probe.timedOut || probe.exitCode !== 0) return false;
  if (provider === 'Claude') {
    try {
      return JSON.parse(probe.stdout).loggedIn === true;
    } catch {
      return /logged[ -]?in/i.test(output) && !/not logged[ -]?in/i.test(output);
    }
  }
  if (provider === 'OpenAI') return /logged in/i.test(output) && !/not logged in/i.test(output);
  if (provider === 'Gemini') return !/not logged into Antigravity|please sign in/i.test(output);
  if (provider === 'GNB') return true; // nlm login --check は有効な認証だけ終了コード0
  return provider === 'Local';
}

/** AIモデル設定画面用。各CLIの保存済みブラウザ認証が現在有効かを調べる。 */
async function detectAiAuthentication({ spawnImpl = spawn, pathsOverride = {} } = {}) {
  const cliPaths = {
    OpenAI: pathsOverride.OpenAI !== undefined ? pathsOverride.OpenAI : resolveExecutablePath('codex'),
    Gemini: pathsOverride.Gemini !== undefined ? pathsOverride.Gemini : resolveExecutablePath('antigravity'),
    Claude: pathsOverride.Claude !== undefined ? pathsOverride.Claude : resolveExecutablePath('claude'),
    GNB: pathsOverride.GNB !== undefined ? pathsOverride.GNB : resolveGeminiNotebookExecutablePath(),
  };
  const probeArgs = {
    OpenAI: ['login', 'status'],
    Gemini: ['models'],
    Claude: ['auth', 'status'],
    GNB: ['login', '--check'],
  };
  const providers = ['OpenAI', 'Gemini', 'Claude', 'GNB'];
  const probes = await Promise.all(providers.map((provider) => runAuthProbe({
    binPath: cliPaths[provider],
    args: probeArgs[provider],
    timeoutMs: provider === 'Gemini' || provider === 'GNB' ? 12_000 : 8000,
    spawnImpl,
  })));

  const status = {};
  providers.forEach((provider, index) => {
    status[provider] = {
      available: Boolean(cliPaths[provider]),
      loggedIn: Boolean(cliPaths[provider]) && authProbeLoggedIn(provider, probes[index]),
      loginUrl: AI_AUTH_LOGIN_URLS[provider],
    };
  });
  // Local AI は接続先が未実装のため、認証済みとは扱わない。
  status.Local = { available: false, loggedIn: false, loginUrl: '' };
  return status;
}

/** 未ログイン／再ログイン表示から、各CLIが提供する対話的なブラウザ認証を別プロセスで開始する。 */
function startAiAuthentication(provider, { spawnImpl = spawn, pathsOverride = {}, onClose } = {}) {
  const commands = {
    OpenAI: { binPath: pathsOverride.OpenAI !== undefined ? pathsOverride.OpenAI : resolveExecutablePath('codex'), args: ['login'] },
    Gemini: { binPath: pathsOverride.Gemini !== undefined ? pathsOverride.Gemini : resolveExecutablePath('antigravity'), args: [] },
    Claude: { binPath: pathsOverride.Claude !== undefined ? pathsOverride.Claude : resolveExecutablePath('claude'), args: ['auth', 'login'] },
    GNB: { binPath: pathsOverride.GNB !== undefined ? pathsOverride.GNB : resolveGeminiNotebookExecutablePath(), args: ['login', '--storage', 'protected'] },
  };
  const command = commands[provider];
  if (!command) throw new AiCliError(provider === 'Local' ? 'Local AI はブラウザログイン不要です。' : '未対応のAIプロバイダです。');
  if (!command.binPath) throw new AiCliError(`${provider} のCLIがこの PC に見つかりません。`);

  try {
    const child = spawnImpl(command.binPath, command.args, {
      cwd: ensureIsolatedSandboxDir(),
      shell: process.platform === 'win32' && command.binPath.toLowerCase().endsWith('.cmd'),
      detached: true,
      windowsHide: false,
      stdio: 'ignore',
      env: { ...process.env, NO_COLOR: '1' },
    });
    child.once?.('error', () => {});
    if (typeof onClose === 'function') {
      child.once?.('close', (code) => {
        try { onClose(code); } catch { /* ignore */ }
      });
    }
    child.unref?.();
    return { started: true, loginUrl: AI_AUTH_LOGIN_URLS[provider] };
  } catch (err) {
    throw new AiCliError(`${provider} のブラウザ認証を開始できませんでした: ${err.message || err}`);
  }
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

/** 各 CLI の利用者設定にある既定モデル（モデルを指定しないときに CLI が使うもの）。読めなければ null */
function readCliDefaultModel(cliName, homeDir = os.homedir()) {
  try {
    if (cliName === 'codex') {
      const codexHome = process.env.CODEX_HOME || path.join(homeDir, '.codex');
      const toml = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
      // 最初の [table] より前の最上位キーだけを見る
      const top = toml.split(/^\s*\[/m)[0];
      const m = top.match(/^\s*model\s*=\s*["']([^"']+)["']/m);
      return m ? m[1] : null;
    }
    if (cliName === 'claude') {
      const settings = JSON.parse(fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf8'));
      return typeof settings.model === 'string' && settings.model.trim() ? settings.model.trim() : null;
    }
  } catch {
    // 設定ファイルが無い・読めないときは既定モデル扱い
  }
  return null;
}

/** 記録に残す AI モデル名。指定モデル → CLI の既定モデル → 「CLI名（既定モデル）」の順 */
function resolveModelLabel(cliName, modelOverride, homeDir) {
  return normalizeCliModel(cliName, modelOverride)
    || readCliDefaultModel(cliName, homeDir)
    || `${cliName}（既定モデル）`;
}

/**
 * サンドボックスディレクトリ内に Thinktank MCP サーバー接続設定ファイルを生成する。
 * - Claude Code 用: mcp-config.json / .mcp.json
 * - Antigravity CLI 用: .agents/mcp_config.json
 * - Codex CLI 用: .codex/config.toml（codex は信頼済みでない作業ディレクトリのこれを読まないため、実際は buildCliArgs の -c で渡す）
 */
function prepareSandboxMcpConfig(sandboxDir, options = {}) {
  const mcpServerScript = options.mcpServerScript || path.join(__dirname, 'mcpServer.cjs');
  const execCommand = options.execCommand || process.execPath;
  const env = {
    ELECTRON_RUN_AS_NODE: '1',
    ...(options.pipePath ? { THINKTANK_MCP_PIPE: options.pipePath } : {}),
    ...(options.vaultDir ? { THINKTANK_VAULT_DIR: options.vaultDir } : {}),
    ...(options.userDataDir ? { THINKTANK_USER_DATA_DIR: options.userDataDir } : {}),
    ...(options.projectId ? { THINKTANK_DEFAULT_PROJECT_ID: options.projectId } : {}),
  };

  const mcpJsonObj = {
    mcpServers: {
      thinktank: {
        command: execCommand,
        args: [mcpServerScript],
        env,
      },
    },
  };
  const mcpJsonText = JSON.stringify(mcpJsonObj, null, 2) + '\n';

  const mcpConfigPath = path.join(sandboxDir, 'mcp-config.json');
  fs.writeFileSync(mcpConfigPath, mcpJsonText, 'utf8');
  fs.writeFileSync(path.join(sandboxDir, '.mcp.json'), mcpJsonText, 'utf8');

  const agyAgentsDir = path.join(sandboxDir, '.agents');
  fs.mkdirSync(agyAgentsDir, { recursive: true });
  fs.writeFileSync(path.join(agyAgentsDir, 'mcp_config.json'), mcpJsonText, 'utf8');

  const codexDir = path.join(sandboxDir, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  const envTomlEntries = Object.entries(env)
    .map(([k, v]) => `${k} = ${JSON.stringify(String(v))}`)
    .join(', ');
  const codexToml = [
    '[mcp_servers.thinktank]',
    `command = ${JSON.stringify(execCommand)}`,
    `args = [${JSON.stringify(mcpServerScript)}]`,
    `env = { ${envTomlEntries} }`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(codexDir, 'config.toml'), codexToml, 'utf8');

  return {
    mcpConfigPath,
    mcpServerScript,
    execCommand,
    env,
  };
}

/** TOML の文字列。バックスラッシュをそのまま書けるリテラル文字列を優先する */
function tomlString(value) {
  const s = String(value);
  return /['\r\n]/.test(s) ? JSON.stringify(s) : `'${s}'`;
}

/** codex の -c で Thinktank MCP サーバーを登録する引数 */
function codexMcpConfigArgs(mcpServer) {
  const envEntries = Object.entries(mcpServer.env || {})
    .map(([k, v]) => `${k} = ${tomlString(v)}`)
    .join(', ');
  return [
    '-c', `mcp_servers.thinktank.command=${tomlString(mcpServer.command)}`,
    '-c', `mcp_servers.thinktank.args=[${(mcpServer.args || []).map(tomlString).join(', ')}]`,
    '-c', `mcp_servers.thinktank.env={ ${envEntries} }`,
    '-c', 'mcp_servers.thinktank.default_tools_approval_mode="approve"',
  ];
}

/**
 * cmd.exe 経由（.cmd ラッパー）で起動するときは引数が空白で区切り直されるため、空白などを含む引数を引用符で囲む。
 * 引数の中の " は cmd でうまく渡せないので、そのまま渡す
 */
function quoteForCmd(args) {
  return args.map((a) => (/[\s&|<>^()]/.test(a) && !a.includes('"') ? `"${a}"` : a));
}

/**
 * CLI 種別ごとの設定隔離コマンド引数を組み立てる。
 * プロンプト本文は長大になるためコマンドライン引数ではなく標準入力（stdin）から渡す。
 */
function buildCliArgs(cliName, modelOverride, options = {}) {
  const normalizedModel = normalizeCliModel(cliName, modelOverride);
  const mcpConfigPath = options && typeof options.mcpConfigPath === 'string' ? options.mcpConfigPath : null;
  const mcpServer = options && options.mcpServer ? options.mcpServer : null;
  switch (cliName) {
    case 'claude': {
      // --safe-mode は --mcp-config で渡した MCP サーバーまで無効にするため、MCP を使うときは
      // --restricted（設定ファイル・コード実行ツールを使わない）で隔離する
      const args = mcpConfigPath
        ? ['-p', '--restricted', '--strict-mcp-config', '--output-format', 'text',
          '--mcp-config', mcpConfigPath, '--allowedTools', 'mcp__thinktank__*']
        : ['-p', '--safe-mode', '--setting-sources', 'user', '--strict-mcp-config', '--output-format', 'text'];
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
      // codex は作業ディレクトリの .codex/config.toml を読まない（信頼済みプロジェクトだけ）ため -c で渡す。
      // exec は承認を求められないので、Thinktank MCP のツールは承認済みにする
      if (mcpServer) {
        args.push(...codexMcpConfigArgs(mcpServer));
      }
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
      // ヘッドレス実行では MCP の呼び出しが自動で拒否されるため、Thinktank MCP だけ許可する
      if (mcpConfigPath) {
        args.push('--settings', JSON.stringify({ permissions: { allow: ['mcp(thinktank/*)'] } }));
      }
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
    // ヘッドレスでは承認を求められない操作（シェルコマンド等）を試みると、自動で拒否されて応答が空で終わる
    const denied = Array.isArray(terminalResult.denied_actions)
      ? terminalResult.denied_actions.map((a) => a?.display_name || a?.action).filter(Boolean)
      : [];
    if (denied.length) {
      throw new AiCliDeniedError(
        `Antigravity が許可されていない操作（${[...new Set(denied)].join('・')}）を使おうとしたため、応答できませんでした。`
        + '質問を変えて送り直すか、別の AI を選んでください。',
      );
    }
    throw new Error('Antigravity CLI の応答が空でした。');
  }
  return terminalResult.response;
}

/** 許可していない操作を AI CLI が求めて止まった。stderr の英語の詳細は付けずに伝える */
class AiCliDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiCliDeniedError';
  }
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
  mcpHost,
  projectId,
  /** cancelCliRun で中断するときの識別子（画面の会話の requestId） */
  runId,
}) {
  const binPath = binPathOverride || resolveExecutablePath(cliName);
  if (!binPath) {
    throw new Error(`AI CLI "${cliName}" がこの PC に見つかりません。`);
  }

  // 中断（cancelCliRun）は順番待ち中・実行中のどちらでも受け付ける
  const run = { canceled: false, cancel: () => { run.canceled = true; } };
  if (runId) runningCliRuns.set(runId, run);

  await acquireCliSlot();
  const sandboxDir = createRunSandboxDir();
  const activeMcpHost = mcpHost !== undefined ? mcpHost : defaultMcpHost;
  let bridgeServer = null;
  try {
    if (run.canceled) throw new AiCliCanceledError();
    if (activeMcpHost) {
      bridgeServer = await startMcpBridgeServer(activeMcpHost);
    }
    const vaultDir =
      activeMcpHost && activeMcpHost.vaultEngine && typeof activeMcpHost.vaultEngine.getVaultDir === 'function'
        ? activeMcpHost.vaultEngine.getVaultDir()
        : undefined;
    const userDataDir =
      activeMcpHost && activeMcpHost.vaultEngine ? activeMcpHost.vaultEngine.userDataDir : undefined;

    const { mcpConfigPath, mcpServerScript, execCommand, env: mcpEnv } = prepareSandboxMcpConfig(sandboxDir, {
      pipePath: bridgeServer ? bridgeServer.pipePath : undefined,
      vaultDir,
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
          if (err instanceof AiCliDeniedError) { reject(err); return; }
          reject(new Error(`${err.message || err}${stderr ? `: ${stderr.slice(0, 400)}` : ''}`));
        }
      });

      if (finished) return;
      child.stdin.write(buildCliInput(cliName, promptText), 'utf8');
      child.stdin.end();
    });
  } finally {
    if (runId && runningCliRuns.get(runId) === run) runningCliRuns.delete(runId);
    if (bridgeServer) {
      await bridgeServer.close().catch(() => {});
    }
    cleanupRunSandboxDir(sandboxDir);
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
    gates,
    relatedDocuments,
    recentMessages,
    userMessage,
    timeoutMs = 120_000,
    mcpHost,
  } = params;

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
  // 実際に使う CLI とモデルはここで決まるため、依頼文の差し込み記号をモデル名に置き換える
  const modelLabel = resolveModelLabel(selectedCli, model);

  const resolvedProfile = profile || shared.getBuiltinDomainProfile('clinical-trial');
  const activeMcpHost = mcpHost !== undefined ? mcpHost : defaultMcpHost;
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
    gates,
    relatedDocuments,
    recentMessages,
    userMessage: String(userMessage ?? '').split(shared.AI_MODEL_PLACEHOLDER).join(modelLabel),
    mcpEnabled: true,
  });

  // 失敗したときは AI の回答に見える定型文を返さず、必ずエラーにする。
  // 以前は「資料を確認しました」「論点を抽出しました」という定型文と作り上げた昇格候補を AI の回答として返しており、
  // 利用者が AI が資料を読んで答えたと思い込み、誤った内容を記録に残すおそれがあった。
  let execResult;
  try {
    execResult = await executeIsolatedCli({
      cliName: selectedCli,
      model,
      promptText,
      timeoutMs,
      mcpHost: activeMcpHost,
      projectId: params.projectId || bundleId,
      runId: params.requestId,
    });
  } catch (err) {
    if (err instanceof AiCliCanceledError) throw err;
    if (err instanceof AiCliDeniedError) throw new AiCliError(err.message);
    throw new AiCliError(`AI CLI（${selectedCli}）の実行に失敗しました: ${err.message || err}`);
  }
  return {
    ...shared.validateAiCliResponse(execResult.stdout),
    executedCli: selectedCli,
    modelLabel,
  };
}

class AiCliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiCliError';
  }
}

class AiCliCanceledError extends Error {
  constructor() {
    super('AI CLI の実行を中断しました。');
    this.name = 'AiCliCanceledError';
  }
}

module.exports = {
  AiCliError,
  SUPPORTED_CLIS,
  DEFAULT_MAX_CONCURRENT_CLI_PROCESSES,
  setMaxConcurrentCliProcesses,
  setDefaultMcpHost,
  getDefaultMcpHost,
  resolveExecutablePath,
  resolveGeminiNotebookExecutablePath,
  AI_AUTH_LOGIN_URLS,
  runAuthProbe,
  authProbeLoggedIn,
  detectAiAuthentication,
  startAiAuthentication,
  detectAvailableClis,
  ensureIsolatedSandboxDir,
  createRunSandboxDir,
  cleanupRunSandboxDir,
  prepareSandboxMcpConfig,
  normalizeCliModel,
  readCliDefaultModel,
  resolveModelLabel,
  buildCliArgs,
  buildCliInput,
  extractCliResponse,
  executeIsolatedCli,
  parseGeminiNotebookResponse,
  parseGeminiNotebookTitle,
  getGeminiNotebookTitle,
  runGeminiNotebookConversation,
  runDomainAiConversation,
  cancelCliRun,
  AiCliCanceledError,
};
