#!/usr/bin/env node
'use strict';

/**
 * electron/mcpServer.cjs
 * AI CLI（claude / codex / antigravity）から stdio 経由で起動される Thinktank MCP サーバー。
 * - 親プロセス（Electron main / aiCliRunner）から起動された場合は THINKTANK_MCP_PIPE（Named Pipe / Unix Socket）
 *   を通じて親プロセスの ThinktankMcpHost（インメモリキャッシュ＋Firestore正本同期＋画面即時反映）へ委譲する。
 * - 単体起動された場合は THINKTANK_VAULT_DIR / THINKTANK_USER_DATA_DIR から直接 VaultEngine を初期化する。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./shared-dist/index.js');
const { VaultEngine } = require('./vaultEngine.cjs');
const { ThinktankMcpHost, forwardJsonRpcOverPipe } = require('./mcpBridge.cjs');

function resolveStandaloneVaultEngine() {
  const appRootDir = path.resolve(__dirname, '..');
  const userDataDir =
    process.env.THINKTANK_USER_DATA_DIR ||
    path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'thinktank');

  let defaultVaultDir = process.env.THINKTANK_VAULT_DIR || '';
  if (!defaultVaultDir) {
    const gDriveCandidates = [
      'G:\\マイドライブ\\Thinktank\\vault_ver2',
      'G:\\My Drive\\Thinktank\\vault_ver2',
    ];
    for (const candidate of gDriveCandidates) {
      if (fs.existsSync(candidate)) {
        defaultVaultDir = candidate;
        break;
      }
    }
  }
  if (!defaultVaultDir) {
    defaultVaultDir = path.join(userDataDir, 'thinktank', 'vault_ver2');
  }

  const engine = new VaultEngine({
    userDataDir,
    appRootDir,
    defaultVaultDir,
    deviceIdPrefix: 'mcp',
    autoIndexRefresh: false,
  });
  if (process.env.THINKTANK_VAULT_DIR && engine.config.vaultDir !== process.env.THINKTANK_VAULT_DIR) {
    engine.config.vaultDir = process.env.THINKTANK_VAULT_DIR;
  }
  return engine;
}

let fallbackHost = null;
function getFallbackHost() {
  if (!fallbackHost) {
    fallbackHost = new ThinktankMcpHost({
      vaultEngine: resolveStandaloneVaultEngine(),
    });
  }
  return fallbackHost;
}

async function dispatchJsonRpcRequest(request) {
  const pipePath = process.env.THINKTANK_MCP_PIPE;
  if (pipePath) {
    try {
      return await forwardJsonRpcOverPipe(pipePath, request);
    } catch {
      // パイプ接続に失敗した場合はローカル VaultEngine へフォールバックする
    }
  }
  return shared.handleMcpJsonRpcMessage(request, getFallbackHost());
}

function sendJsonRpcResponse(responseObj, useContentLengthHeader = false) {
  if (!responseObj) return;
  const json = JSON.stringify(responseObj);
  if (useContentLengthHeader) {
    const byteLen = Buffer.byteLength(json, 'utf8');
    process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`, 'utf8');
  } else {
    process.stdout.write(`${json}\n`, 'utf8');
  }
}

/**
 * 標準入力ストリームから改行区切り JSON-RPC および Content-Length フレーミングの両方を解釈する。
 */
function startStdioMcpServer() {
  let rawBuffer = Buffer.alloc(0);
  let activeCount = 0;
  let stdinEnded = false;

  const checkExit = () => {
    if (stdinEnded && activeCount === 0) {
      process.exit(0);
    }
  };

  const trackAsync = (promise) => {
    activeCount += 1;
    void promise.finally(() => {
      activeCount = Math.max(0, activeCount - 1);
      checkExit();
    });
  };

  const processBuffer = () => {
    while (rawBuffer.length > 0) {
      const preview = rawBuffer.slice(0, Math.min(rawBuffer.length, 64)).toString('utf8');

      if (preview.startsWith('Content-Length:')) {
        const headerEnd = rawBuffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return; // ヘッダ到着待ち
        const headerStr = rawBuffer.slice(0, headerEnd).toString('utf8');
        const match = headerStr.match(/Content-Length:\s*(\d+)/i);
        const contentLen = match ? Number(match[1]) : 0;
        const bodyStart = headerEnd + 4;
        if (rawBuffer.length < bodyStart + contentLen) return; // ボディ到着待ち

        const bodyStr = rawBuffer.slice(bodyStart, bodyStart + contentLen).toString('utf8');
        rawBuffer = rawBuffer.slice(bodyStart + contentLen);

        trackAsync(handleIncomingJsonString(bodyStr, true));
        continue;
      }

      const nlIdx = rawBuffer.indexOf(0x0a); // '\n'
      if (nlIdx === -1) return;
      const lineStr = rawBuffer.slice(0, nlIdx).toString('utf8').trim();
      rawBuffer = rawBuffer.slice(nlIdx + 1);
      if (!lineStr) continue;

      trackAsync(handleIncomingJsonString(lineStr, false));
    }
  };

  const handleIncomingJsonString = async (jsonStr, useContentLength) => {
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      sendJsonRpcResponse(
        {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        },
        useContentLength,
      );
      return;
    }

    if (Array.isArray(parsed)) {
      const responses = [];
      for (const item of parsed) {
        const res = await dispatchJsonRpcRequest(item);
        if (res) responses.push(res);
      }
      if (responses.length > 0) {
        sendJsonRpcResponse(responses, useContentLength);
      }
      return;
    }

    const res = await dispatchJsonRpcRequest(parsed);
    if (res) {
      sendJsonRpcResponse(res, useContentLength);
    }
  };

  process.stdin.on('data', (chunk) => {
    rawBuffer = Buffer.concat([rawBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    processBuffer();
  });

  process.stdin.on('end', () => {
    stdinEnded = true;
    checkExit();
  });
}

if (require.main === module) {
  startStdioMcpServer();
}

module.exports = {
  startStdioMcpServer,
  dispatchJsonRpcRequest,
};
