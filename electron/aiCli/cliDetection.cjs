'use strict';

/**
 * electron/aiCli/cliDetection.cjs
 * AI CLI（claude / codex / antigravity / nlm）の場所の検出と、ブラウザ認証の確認・開始。
 * 外からは electron/aiCliRunner.cjs を通して使う。
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AiCliError } = require('./errors.cjs');
const { ensureIsolatedSandboxDir } = require('./sandbox.cjs');

const SUPPORTED_CLIS = ['claude', 'codex', 'antigravity'];

const AI_AUTH_LOGIN_URLS = Object.freeze({
  OpenAI: 'https://chatgpt.com/auth/login',
  Gemini: 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2F',
  Claude: 'https://claude.ai/login',
  GNB: 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fnotebook.google.com%2F',
  Local: '',
});

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

module.exports = {
  SUPPORTED_CLIS,
  AI_AUTH_LOGIN_URLS,
  CLI_EXECUTABLE_NAMES,
  resolveExecutablePath,
  resolveGeminiNotebookExecutablePath,
  runAuthProbe,
  authProbeLoggedIn,
  detectAiAuthentication,
  startAiAuthentication,
  detectAvailableClis,
};
