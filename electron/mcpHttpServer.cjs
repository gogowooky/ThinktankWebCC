'use strict';

/**
 * electron/mcpHttpServer.cjs
 * きなこ（クラウド側 AI）が Tailscale 越しに接続するための MCP Streamable HTTP トランスポート（POST /mcp）。
 *
 * 方針（docs: MCP インターフェイス仕様書 3.3）:
 * - ツール定義・処理本体は変えない。受けた JSON-RPC をそのまま shared.handleMcpJsonRpcMessage（ThinktankMcpHost）へ渡す。
 * - 既定は OFF。ON にしても待ち受けは localhost か Tailscale のアドレスに限る（LAN 全体へは出さない）。
 * - 認証は PC ごとに発行する Bearer トークン。保存するのは SHA-256 ハッシュだけで、平文は発行時に1度だけ返す。
 * - ローカル運用モードでは起動しない（外部接続なしが前提のため）。
 *
 * claude.md の「HTTP の API サーバーを新設しない」は廃止済みの Express/Cloud Run を指す。
 * これは Electron メインプロセス内の MCP 専用エンドポイントであり、その例外として置く。
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const shared = require('./shared-dist/index.js');

const CONFIG_FILE = 'mcp-http-config.json';
const DEFAULT_PORT = 47821;
const DEFAULT_BIND_ADDRESS = '127.0.0.1';
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const TOKEN_PREFIX = 'ttmcp_';

/** Tailscale の IPv4 (100.64.0.0/10) / IPv6 (fd7a:115c:a1e0::/48) か、ループバックだけを許す。 */
function isAllowedBindAddress(address) {
  const kind = classifyAddress(address);
  return kind === 'loopback' || kind === 'tailscale';
}

/** 'loopback' | 'tailscale' | 'other'。設定画面の表示と、待ち受けの許可判定で同じ分類を使う。 */
function classifyAddress(address) {
  const a = String(address || '').trim().toLowerCase();
  if (a === '127.0.0.1' || a === '::1' || a === 'localhost') return 'loopback';
  if (net.isIPv4(a)) {
    const [o1, o2] = a.split('.').map(Number);
    return o1 === 100 && o2 >= 64 && o2 <= 127 ? 'tailscale' : 'other';
  }
  if (net.isIPv6(a)) return a.startsWith('fd7a:115c:a1e0:') ? 'tailscale' : 'other';
  return 'other';
}

/**
 * このPCで待ち受けに選べるアドレス（localhost と Tailscale のみ）。
 * LAN など他のアドレスは、待ち受けに使えないので画面にも出さない。
 */
function listSelectableAddresses(interfaces = os.networkInterfaces()) {
  const result = [{ address: '127.0.0.1', kind: 'loopback', interface: 'lo' }];
  for (const [name, infos] of Object.entries(interfaces || {})) {
    for (const info of infos || []) {
      if (!info || info.internal) continue;
      if (classifyAddress(info.address) === 'tailscale' && !result.some((r) => r.address === info.address)) {
        result.push({ address: info.address, kind: 'tailscale', interface: name });
      }
    }
  }
  return result;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function generateToken() {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function normalizeConfig(raw) {
  const port = Number(raw && raw.port);
  const bindAddress = raw && isAllowedBindAddress(raw.bindAddress) ? String(raw.bindAddress).trim() : DEFAULT_BIND_ADDRESS;
  return {
    enabled: Boolean(raw && raw.enabled),
    bindAddress,
    port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_PORT,
    tokens: Array.isArray(raw && raw.tokens)
      ? raw.tokens
          .filter((t) => t && typeof t.id === 'string' && typeof t.tokenHash === 'string')
          .map((t) => ({
            id: t.id,
            label: typeof t.label === 'string' ? t.label : '',
            pcId: typeof t.pcId === 'string' ? t.pcId : '',
            tokenHash: t.tokenHash,
            createdAt: typeof t.createdAt === 'string' ? t.createdAt : '',
            ...(typeof t.revokedAt === 'string' && t.revokedAt ? { revokedAt: t.revokedAt } : {}),
          }))
      : [],
  };
}

class McpHttpServer {
  /**
   * @param {{
   *   userDataDir: string,
   *   mcpHost: object,
   *   getDeviceId: () => string,
   *   isLocalMode?: boolean,
   * }} options
   */
  constructor({ userDataDir, mcpHost, getDeviceId, isLocalMode = false }) {
    this.configPath = path.join(userDataDir, CONFIG_FILE);
    this.mcpHost = mcpHost;
    this.getDeviceId = getDeviceId;
    this.isLocalMode = isLocalMode;
    this.server = null;
    this.lastError = '';
    this.config = this._loadConfig();
  }

  _loadConfig() {
    try {
      return normalizeConfig(JSON.parse(fs.readFileSync(this.configPath, 'utf8')));
    } catch {
      return normalizeConfig(null);
    }
  }

  _saveConfig() {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  /** トークンのハッシュを含めない公開用の状態。 */
  getStatus() {
    const listening = Boolean(this.server && this.server.listening);
    const host = this.config.bindAddress.includes(':') ? `[${this.config.bindAddress}]` : this.config.bindAddress;
    return {
      // ローカル運用モードでは、設定ファイルが「有効」のままでも常に無効として扱う（起動しない）
      enabled: this.config.enabled && !this.isLocalMode,
      listening,
      localMode: this.isLocalMode,
      bindAddress: this.config.bindAddress,
      /** 待ち受けアドレスの種類。'tailscale' でなければ、きなこ（別端末）からは届かない。 */
      bindKind: classifyAddress(this.config.bindAddress),
      /** 待ち受けに選べるアドレス（localhost と、このPCに見つかった Tailscale のアドレス） */
      addresses: listSelectableAddresses(),
      /** 待ち受け中のときだけ、接続先 URL を返す */
      endpointUrl: listening ? `http://${host}:${this.config.port}/mcp` : '',
      port: this.config.port,
      pcId: this.getDeviceId(),
      lastError: this.lastError,
      tokens: this.config.tokens.map((t) => ({
        id: t.id,
        label: t.label,
        pcId: t.pcId,
        createdAt: t.createdAt,
        revokedAt: t.revokedAt || '',
      })),
    };
  }

  async start() {
    if (this.isLocalMode || !this.config.enabled || this.server) return this.getStatus();
    if (!isAllowedBindAddress(this.config.bindAddress)) {
      this.lastError = `待ち受けアドレスは localhost か Tailscale のアドレスに限られます: ${this.config.bindAddress}`;
      return this.getStatus();
    }
    const server = http.createServer((req, res) => {
      void this._handle(req, res).catch(() => {
        if (!res.headersSent) this._send(res, 500, { error: 'Internal Server Error' });
        else res.end();
      });
    });
    // 切断済みクライアントを残さない。
    server.requestTimeout = 60_000;
    server.headersTimeout = 15_000;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.config.port, this.config.bindAddress, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      this.server = server;
      this.lastError = '';
    } catch (err) {
      this.lastError = `MCP HTTP の待ち受けに失敗しました: ${err.message || err}`;
    }
    return this.getStatus();
  }

  async stop() {
    const server = this.server;
    this.server = null;
    if (!server) return;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
  }

  async setEnabled(enabled) {
    if (enabled && this.isLocalMode) {
      throw new Error('ローカル運用モードでは MCP の HTTP 接続を有効にできません。');
    }
    this.config.enabled = Boolean(enabled);
    this._saveConfig();
    await this.stop();
    if (this.config.enabled) await this.start();
    return this.getStatus();
  }

  async configure({ bindAddress, port } = {}) {
    if (bindAddress !== undefined) {
      if (!isAllowedBindAddress(bindAddress)) {
        throw new Error('待ち受けアドレスは localhost か Tailscale のアドレス（100.64.0.0/10）に限られます。');
      }
      this.config.bindAddress = String(bindAddress).trim();
    }
    if (port !== undefined) {
      const p = Number(port);
      if (!Number.isInteger(p) || p < 1024 || p > 65535) {
        throw new Error('ポート番号は 1024〜65535 の整数で指定してください。');
      }
      this.config.port = p;
    }
    this._saveConfig();
    if (this.config.enabled) {
      await this.stop();
      await this.start();
    }
    return this.getStatus();
  }

  /** このPC宛のトークンを発行する。平文はこの戻り値でしか得られない。 */
  createToken({ label } = {}) {
    if (this.isLocalMode) {
      throw new Error('ローカル運用モードでは MCP の HTTP トークンを発行できません。');
    }
    const token = generateToken();
    const entry = {
      id: `tok_${crypto.randomBytes(6).toString('hex')}`,
      label: typeof label === 'string' ? label.trim().slice(0, 80) : '',
      pcId: this.getDeviceId(),
      tokenHash: hashToken(token),
      createdAt: new Date().toISOString(),
    };
    this.config.tokens.push(entry);
    this._saveConfig();
    return { id: entry.id, token, pcId: entry.pcId, label: entry.label, createdAt: entry.createdAt };
  }

  /** 有効なトークンをすべて失効させ、新しいトークンを1つ発行する（漏えい時・受け渡し直し用）。 */
  reissueToken({ label } = {}) {
    if (this.isLocalMode) {
      throw new Error('ローカル運用モードでは MCP の HTTP トークンを発行できません。');
    }
    const now = new Date().toISOString();
    for (const t of this.config.tokens) {
      if (!t.revokedAt) t.revokedAt = now;
    }
    return this.createToken({ label });
  }

  revokeToken(id) {
    const entry = this.config.tokens.find((t) => t.id === id);
    if (!entry) throw new Error(`トークンが見つかりません: ${id}`);
    if (!entry.revokedAt) {
      entry.revokedAt = new Date().toISOString();
      this._saveConfig();
    }
    return this.getStatus();
  }

  /** @returns {{ ok: true, entry: object } | { ok: false, status: number, message: string }} */
  authenticate(authorizationHeader) {
    const m = /^Bearer\s+(\S+)$/i.exec(String(authorizationHeader || '').trim());
    if (!m) return { ok: false, status: 401, message: 'Bearer トークンが必要です。' };
    const hash = hashToken(m[1]);
    const entry = this.config.tokens.find((t) => !t.revokedAt && safeEqualHex(t.tokenHash, hash));
    if (!entry) return { ok: false, status: 401, message: 'トークンが無効です。' };
    // 別PC向けに発行したトークンでは、このPCの文脈を読ませない（PC間で材料を混ぜない）。
    if (entry.pcId && entry.pcId !== this.getDeviceId()) {
      return { ok: false, status: 403, message: 'このトークンは別のPC向けです。' };
    }
    return { ok: true, entry };
  }

  _send(res, status, body, extraHeaders = {}) {
    const text = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Thinktank-Pc': this.getDeviceId(),
      ...extraHeaders,
    });
    res.end(text);
  }

  _isAllowedOrigin(origin) {
    if (!origin) return true; // サーバー間通信（きなこ）は Origin を付けない
    try {
      const host = new URL(origin).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      return host === 'localhost' || host === this.config.bindAddress.toLowerCase();
    } catch {
      return false;
    }
  }

  async _readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error('payload too large'), { status: 413 });
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  async _handle(req, res) {
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== '/mcp') return this._send(res, 404, { error: 'Not Found' });

    // DNS rebinding 対策: ブラウザ由来の他オリジンは認証より前に拒否する。
    if (!this._isAllowedOrigin(req.headers.origin)) return this._send(res, 403, { error: 'Forbidden origin' });

    const auth = this.authenticate(req.headers.authorization);
    if (!auth.ok) {
      return this._send(res, auth.status, { error: auth.message }, auth.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {});
    }

    // サーバー起点の SSE ストリームは提供しない（1リクエスト1レスポンスのみ）。
    if (req.method !== 'POST') return this._send(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });

    let parsed;
    try {
      const raw = await this._readBody(req);
      parsed = JSON.parse(raw);
    } catch (err) {
      if (err && err.status === 413) return this._send(res, 413, { error: 'Payload Too Large' });
      return this._send(res, 400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
    }

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return this._send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
      }
      const responses = [];
      for (const item of parsed) {
        const r = await shared.handleMcpJsonRpcMessage(item, this.mcpHost);
        if (r) responses.push(r);
      }
      if (responses.length === 0) return this._send(res, 202);
      return this._send(res, 200, responses);
    }

    const response = await shared.handleMcpJsonRpcMessage(parsed, this.mcpHost);
    if (!response) return this._send(res, 202);
    return this._send(res, 200, response);
  }
}

module.exports = {
  McpHttpServer,
  isAllowedBindAddress,
  classifyAddress,
  listSelectableAddresses,
  hashToken,
  DEFAULT_PORT,
};
