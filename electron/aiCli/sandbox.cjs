'use strict';

/**
 * electron/aiCli/sandbox.cjs
 * 設定隔離用の作業フォルダ（空フォルダの cwd）と、そこに置く Thinktank MCP サーバーの接続設定。
 * 外からは electron/aiCliRunner.cjs を通して使う。
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
 * サンドボックスディレクトリ内に Thinktank MCP サーバー接続設定ファイルを生成する。
 * - Claude Code 用: mcp-config.json / .mcp.json
 * - Antigravity CLI 用: .agents/mcp_config.json
 * - Codex CLI 用: .codex/config.toml（codex は信頼済みでない作業ディレクトリのこれを読まないため、実際は buildCliArgs の -c で渡す）
 */
function prepareSandboxMcpConfig(sandboxDir, options = {}) {
  // このファイルは electron/aiCli/ にあるので、electron/ 直下の mcpServer.cjs を見るには1階層上がる
  const mcpServerScript = options.mcpServerScript || path.join(__dirname, '..', 'mcpServer.cjs');
  const execCommand = options.execCommand || process.execPath;
  const env = {
    ELECTRON_RUN_AS_NODE: '1',
    ...(options.pipePath ? { THINKTANK_MCP_PIPE: options.pipePath } : {}),
    ...(options.vaultDir ? { THINKTANK_VAULT_DIR: options.vaultDir } : {}),
    ...(options.localVaultRoot ? { THINKTANK_LOCAL_VAULT_ROOT: options.localVaultRoot } : {}),
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

module.exports = {
  ensureIsolatedSandboxDir,
  createRunSandboxDir,
  cleanupRunSandboxDir,
  prepareSandboxMcpConfig,
};
