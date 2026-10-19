'use strict';

/**
 * electron/aiCliRunner.cjs
 * ローカル AI CLI（claude / codex / gemini）の自動検出と「設定隔離（空フォルダ cwd・設定無効化）」実行エンジン。
 * システム設計メモ §8 準拠。
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./shared-dist/index.js');

const SUPPORTED_CLIS = ['claude', 'codex', 'gemini'];

/**
 * Windows 環境では npm グローバルコマンドは .cmd ラッパーまたは .exe として配置される。
 * PowerShell の .ps1 ではなく spawn 可能な .exe / .cmd を優先して解決する。
 */
function resolveExecutablePath(cliName) {
  if (!SUPPORTED_CLIS.includes(cliName)) return null;

  if (process.platform === 'win32') {
    try {
      const out = execFileSync('where.exe', [cliName], {
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
      path.join(appData, 'npm', `${cliName}.cmd`),
      path.join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin', `${cliName}.exe`),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  try {
    const out = execFileSync('which', [cliName], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    return out && fs.existsSync(out) ? out : null;
  } catch {
    return null;
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
 * CLAUDE.md / AGENTS.md / GEMINI.md 等の勝手な読み込みを防ぐ。
 */
function ensureIsolatedSandboxDir() {
  const dir = path.join(os.tmpdir(), 'thinktank-ai-cli-sandbox');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 環境変数に GEMINI_API_KEY が無い場合、プロジェクト直下または server/.env から補完する。
 */
let cachedEnvGeminiKey = null;
function resolveGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (cachedEnvGeminiKey !== null) return cachedEnvGeminiKey || undefined;
  const envFiles = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../server/.env'),
  ];
  for (const envPath of envFiles) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/m);
      if (match && match[1]) {
        const val = match[1].trim().replace(/^['"]|['"]$/g, '');
        if (val) {
          cachedEnvGeminiKey = val;
          return val;
        }
      }
    } catch {
      // ignore
    }
  }
  cachedEnvGeminiKey = '';
  return undefined;
}

/**
 * UI側のモデルID（claude-sonnet-5 等）を各 CLI が受け付けるモデル名／エイリアスへ正規化する。
 */
function normalizeCliModel(cliName, modelOverride) {
  const m = String(modelOverride || '').trim().toLowerCase();
  if (cliName === 'gemini') {
    // gemini CLI は -m 未指定だと内部ルーターが廃止済みの gemini-2.5-pro / 2.5-flash を選択して
    // ModelNotFoundError (404) になるため、常に利用可能な現行モデルを明示指定する。
    if (!m || m === 'none' || m.endsWith('-default') || m.endsWith('-isolated')) {
      return 'gemini-3.8-flash';
    }
    if (m.includes('2.5-pro') || m.includes('1.5-pro') || m === 'pro') {
      return 'gemini-3.1-pro-preview';
    }
    if (m.includes('flash')) {
      return 'gemini-3.8-flash';
    }
    return modelOverride;
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
    case 'gemini': {
      const args = [
        '-p',
        '標準入力の指示に従いJSONで回答してください。',
        '--output-format',
        'text',
      ];
      if (normalizedModel) {
        args.push('-m', normalizedModel);
      }
      return args;
    }
    default:
      throw new Error(`未対応の AI CLI です: ${cliName}`);
  }
}

/**
 * 指定された AI CLI を設定隔離環境で起動し、標準入力からプロンプトを渡して出力を取得する。
 */
function executeIsolatedCli({ cliName = 'claude', model, promptText, timeoutMs = 120_000 }) {
  return new Promise((resolve, reject) => {
    const binPath = resolveExecutablePath(cliName);
    if (!binPath) {
      reject(new Error(`AI CLI "${cliName}" がこの PC に見つかりません。`));
      return;
    }

    const sandboxDir = ensureIsolatedSandboxDir();
    const args = buildCliArgs(cliName, model);
    const isCmdWrapper = process.platform === 'win32' && binPath.toLowerCase().endsWith('.cmd');
    const geminiApiKey = cliName === 'gemini' ? resolveGeminiApiKey() : undefined;

    // claude / codex CLI はローカルの CLI ログインセッション（サブスクリプション認証）を使用するため、
    // 環境変数に古い ANTHROPIC_API_KEY / OPENAI_API_KEY が残っていると "Invalid API key" エラーになるのを防ぐ。
    const childEnv = {
      ...process.env,
      GEMINI_CLI_TRUST_WORKSPACE: 'true',
      NO_COLOR: '1',
      CI: '1',
    };
    if (cliName === 'claude') {
      delete childEnv.ANTHROPIC_API_KEY;
    } else if (cliName === 'codex') {
      delete childEnv.OPENAI_API_KEY;
    } else if (cliName === 'gemini' && geminiApiKey) {
      childEnv.GEMINI_API_KEY = geminiApiKey;
    }

    const child = spawn(binPath, args, {
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
      resolve({
        cliName,
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    child.stdin.write(promptText, 'utf8');
    child.stdin.end();
  });
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
  const detected = detectAvailableClis();
  const selectedCli = detected[cliName]?.available
    ? cliName
    : SUPPORTED_CLIS.find((c) => detected[c]?.available);
  if (!selectedCli) {
    throw new AiCliError(
      'AI CLI（Claude Code・Codex・Gemini CLI）がこの PC に見つかりません。いずれかをインストールしてログインすると、AI に相談できます。',
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
  resolveExecutablePath,
  detectAvailableClis,
  ensureIsolatedSandboxDir,
  buildCliArgs,
  executeIsolatedCli,
  runDomainAiConversation,
};
