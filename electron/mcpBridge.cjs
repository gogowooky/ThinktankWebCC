'use strict';

/**
 * electron/mcpBridge.cjs
 * VaultEngine と Electron メインプロセスを MCP プロトコルハンドラ（shared/mcpProtocol.ts）へ接続するホストおよび
 * AI CLI サブプロセス（mcpServer.cjs）とのプロセス間通信（Named Pipe / Unix Domain Socket）ブリッジ。
 */

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const shared = require('./shared-dist/index.js');

const PROJECT_THINK_TAG_RE = /^(?:\*\s+)?\[(?:([A-Za-z0-9_-]+):)?([^\]:\s]+)\]/;

/**
 * Project 本文からリンクされている Think ID 一覧を抽出する。
 */
function extractLinkedIdsFromProjectBody(body) {
  const ids = new Set();
  for (const line of String(body || '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    const tagMatch = s.match(PROJECT_THINK_TAG_RE);
    if (tagMatch && shared.isSafeThinkId(tagMatch[2])) {
      ids.add(tagMatch[2]);
      continue;
    }
    if (s.startsWith('* ')) {
      const candidate = s.slice(2).split('|')[0].trim().replace(/^\[|\]$/g, '');
      if (shared.isSafeThinkId(candidate)) {
        ids.add(candidate);
      }
    }
  }
  return ids;
}

/**
 * Project 本文の「# 対象」セクション（または末尾）に新規 Think 参照行を追加する。
 */
function appendThinkToProjectBody(body, item) {
  const tag = item.category || 'memo';
  const targetLine = item.title ? `[${tag}:${item.thinkid}]: ${item.title}` : `[${tag}:${item.thinkid}]`;
  const existingIds = extractLinkedIdsFromProjectBody(body);
  if (existingIds.has(item.thinkid)) return body;

  const lines = String(body || '').split(/\r?\n/);
  const targetHeadingIdx = lines.findIndex((l) => /^#\s+対象\s*$/.test(l.trim()));
  if (targetHeadingIdx === -1) {
    const trimmed = String(body || '').trimEnd();
    return trimmed ? `${trimmed}\n${targetLine}` : targetLine;
  }

  let nextHeadingIdx = lines.findIndex(
    (l, idx) => idx > targetHeadingIdx && /^#+\s+/.test(l.trim()),
  );
  if (nextHeadingIdx === -1) nextHeadingIdx = lines.length;

  return [
    ...lines.slice(0, nextHeadingIdx),
    targetLine,
    ...lines.slice(nextHeadingIdx),
  ].join('\n');
}

/**
 * 既存 ID と衝突しない新規 thinkid (yyyy-MM-dd-HHmmss) を生成する。
 */
function generateUniqueThinkId(existingIdsSet, baseDate = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const formatId = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

  let current = new Date(baseDate.getTime());
  for (let i = 0; i < 60; i++) {
    const id = formatId(current);
    if (!existingIdsSet.has(id)) return id;
    current = new Date(current.getTime() - 1000);
  }
  return `${formatId(baseDate)}-${crypto.randomBytes(2).toString('hex')}`;
}

class ThinktankMcpHost {
  /**
   * @param {{
   *   vaultEngine: import('./vaultEngine.cjs').VaultEngine,
   *   isThinkDirty?: (thinkid: string) => Promise<boolean> | boolean,
   *   onRecordMutated?: (event: { action: string, thinkid: string, projectId?: string, candidateId?: string }) => Promise<void> | void,
   * }} options
   */
  constructor({ vaultEngine, isThinkDirty, onRecordMutated }) {
    if (!vaultEngine) {
      throw new Error('ThinktankMcpHost requires a vaultEngine instance.');
    }
    this.vaultEngine = vaultEngine;
    this.isThinkDirty = isThinkDirty || null;
    this.onRecordMutated = onRecordMutated || null;
  }

  async search({ query, limit = 50, category }) {
    const effectiveQuery = category ? `category:${category} ${query || ''}`.trim() : (query || '');
    return this.vaultEngine.search(effectiveQuery, limit);
  }

  async listMeta({ projectId, category, limit = 50 } = {}) {
    let metas = this.vaultEngine.listMeta();

    if (projectId) {
      const projectRec = this.vaultEngine.getRecord(projectId);
      const linkedIds = new Set();
      if (projectRec) {
        for (const id of extractLinkedIdsFromProjectBody(projectRec.body)) {
          linkedIds.add(id);
        }
        if (projectRec.meta.relatedIds) {
          for (const id of String(projectRec.meta.relatedIds).split(',')) {
            const trimmed = id.trim();
            if (trimmed) linkedIds.add(trimmed);
          }
        }
      }
      metas = metas.filter((m) => {
        if (m.thinkid === projectId) return false;
        if (linkedIds.has(m.thinkid)) return true;
        if (m.relatedIds) {
          const rels = String(m.relatedIds)
            .split(',')
            .map((s) => s.trim());
          if (rels.includes(projectId)) return true;
        }
        return false;
      });
    }

    if (category) {
      const catLower = category.toLowerCase();
      metas = metas.filter((m) => {
        const mCat = String(m.category || '').toLowerCase();
        if (catLower === 'project') {
          return mCat === 'project' || mCat === 'bundle';
        }
        return mCat === catLower;
      });
    }

    return metas.slice(0, limit);
  }

  async getRecord({ thinkid, includeSupport = true }) {
    const rec = this.vaultEngine.getRecord(thinkid);
    if (!rec) return null;
    return {
      meta: rec.meta,
      body: rec.body,
      support: includeSupport !== false ? rec.support : {},
      updatedAt: rec.updatedAt,
    };
  }

  async getProjectContext({ projectId }) {
    const rec = this.vaultEngine.getRecord(projectId);
    if (!rec) return null;
    const profile = this.vaultEngine.getActiveDomainProfile();
    const ops = shared.extractOperationsState(rec.support, profile);
    const relatedThinks = await this.listMeta({ projectId, limit: 100 });
    return {
      projectId,
      title: rec.meta.title,
      updatedAt: rec.updatedAt,
      body: rec.body,
      thinkSupport:
        rec.support && typeof rec.support.thinkSupport === 'object'
          ? rec.support.thinkSupport
          : undefined,
      relatedThinks,
      activePromotedRecords: ops.promotedRecords.filter((r) => r.status !== 'superseded'),
      pendingCandidates: ops.promotionCandidates.filter((c) => c.status === 'pending_review'),
      gates: ops.gates,
    };
  }

  async createThink({ title, body = '', category = 'memo', keywords = '', relatedIds = '', projectId }) {
    const existingIds = new Set(this.vaultEngine.listMeta().map((m) => m.thinkid));
    const thinkid = generateUniqueThinkId(existingIds);

    const relSet = new Set(
      String(relatedIds || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (projectId) relSet.add(projectId);

    const savedMeta = this.vaultEngine.saveRecord({
      thinkid,
      title,
      body,
      category,
      keywords,
      relatedIds: Array.from(relSet).join(','),
    });

    if (projectId) {
      const projectRec = this.vaultEngine.getRecord(projectId);
      if (projectRec) {
        const projectDirty = this.isThinkDirty ? await this.isThinkDirty(projectId) : false;
        if (!projectDirty) {
          const nextProjectBody = appendThinkToProjectBody(projectRec.body, {
            thinkid,
            category,
            title,
          });
          const projectRelSet = new Set(
            String(projectRec.meta.relatedIds || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          );
          projectRelSet.add(thinkid);
          this.vaultEngine.saveRecord({
            thinkid: projectId,
            title: projectRec.meta.title,
            body: nextProjectBody,
            category: projectRec.meta.category,
            keywords: projectRec.meta.keywords,
            relatedIds: Array.from(projectRelSet).join(','),
          });
        }
      }
    }

    if (this.onRecordMutated) {
      await this.onRecordMutated({ action: 'create', thinkid, projectId });
    }
    return savedMeta;
  }

  async updateThink({ thinkid, expectedVersion, title, body, appendBody, keywords, relatedIds }) {
    if (this.isThinkDirty && (await this.isThinkDirty(thinkid))) {
      throw new Error(
        `Think "${thinkid}" は現在画面のエディタで編集中（未保存変更あり）のため、AI からの上書きは保護されています。`,
      );
    }

    const existing = this.vaultEngine.getRecord(thinkid);
    if (!existing) {
      throw new Error(`更新対象の Think が見つかりません: ${thinkid}`);
    }

    let nextBody = existing.body;
    if (body !== undefined) {
      nextBody = body;
    } else if (appendBody !== undefined) {
      nextBody = existing.body ? `${existing.body}\n${appendBody}` : appendBody;
    }

    const savedMeta = this.vaultEngine.saveRecord({
      thinkid,
      expectedVersion,
      title: title !== undefined ? title : existing.meta.title,
      body: nextBody,
      category: existing.meta.category,
      keywords: keywords !== undefined ? keywords : existing.meta.keywords,
      relatedIds: relatedIds !== undefined ? relatedIds : existing.meta.relatedIds,
    });

    if (this.onRecordMutated) {
      await this.onRecordMutated({ action: 'update', thinkid });
    }
    return savedMeta;
  }

  async addPromotionCandidate(params) {
    const {
      projectId,
      type,
      title,
      summary,
      rationale,
      impactScope,
      proposedOwner,
      dueDate,
      citations,
    } = params;

    const existing = this.vaultEngine.getRecord(projectId);
    if (!existing) {
      throw new Error(`昇格候補の登録先 Project が見つかりません: ${projectId}`);
    }

    const profile = this.vaultEngine.getActiveDomainProfile();
    const opsState = shared.extractOperationsState(existing.support, profile);
    const candidateId = `cand_mcp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const nextOps = shared.addPromotionCandidate(
      opsState,
      {
        id: candidateId,
        bundleId: projectId,
        type,
        title,
        summary,
        rationale,
        impactScope,
        proposedOwner,
        dueDate,
        citations: citations || [],
        createdBy: 'ai',
      },
      'ai',
    );

    const saved = this.vaultEngine.saveSupportMetadata(
      projectId,
      { operations: nextOps },
      existing.updatedAt,
    );

    if (this.onRecordMutated) {
      await this.onRecordMutated({
        action: 'promotion_candidate',
        thinkid: projectId,
        projectId,
        candidateId,
      });
    }

    return {
      projectId,
      candidateId,
      updatedAt: saved.updatedAt,
      totalPendingCandidates: nextOps.promotionCandidates.filter(
        (c) => c.status === 'pending_review',
      ).length,
    };
  }

  async getDomainProfile(profileId) {
    return profileId
      ? this.vaultEngine.getDomainProfileById(profileId)
      : this.vaultEngine.getActiveDomainProfile();
  }
}

/**
 * プロセス間通信用の Named Pipe (Windows) / Unix Domain Socket (POSIX) パスを生成する。
 */
function createUniquePipePath() {
  const token = `${process.pid}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\thinktank-mcp-${token}`;
  }
  return path.join(os.tmpdir(), `tt-mcp-${token}.sock`);
}

/**
 * 親プロセス（Electron main / aiCliRunner）内で MCP JSON-RPC ブリッジサーバーを起動する。
 * AI CLI が起動した `electron/mcpServer.cjs` サブプロセスからの JSON-RPC 要求を受け取り、
 * 親プロセスの `ThinktankMcpHost` で処理して応答を返す。
 */
async function startMcpBridgeServer(mcpHost) {
  const pipePath = createUniquePipePath();
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {
      // クライアント側が先に切断した場合の EPIPE / ECONNRESET を無視する
    });
    socket.on('close', () => sockets.delete(socket));

    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let nlIdx;
      while ((nlIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nlIdx).trim();
        buffer = buffer.slice(nlIdx + 1);
        if (!line) continue;
        void (async () => {
          let req;
          try {
            req = JSON.parse(line);
          } catch {
            const errRes = {
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: 'Parse error' },
            };
            if (!socket.destroyed) socket.write(JSON.stringify(errRes) + '\n');
            return;
          }
          const res = await shared.handleMcpJsonRpcMessage(req, mcpHost);
          if (res && !socket.destroyed) {
            socket.write(JSON.stringify(res) + '\n');
          }
        })();
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(pipePath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  return {
    pipePath,
    close: async () => {
      for (const s of sockets) {
        try {
          s.destroy();
        } catch {
          // ignore
        }
      }
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
      if (process.platform !== 'win32' && fs.existsSync(pipePath)) {
        try {
          fs.unlinkSync(pipePath);
        } catch {
          // ignore
        }
      }
    },
  };
}

/**
 * Named Pipe 経由で親プロセスの MCP ブリッジサーバーへ JSON-RPC リクエストを転送するクライアント。
 */
function forwardJsonRpcOverPipe(pipePath, request, timeoutMs = 30_000) {
  if (request.id === undefined || String(request.method || '').startsWith('notifications/')) {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const client = net.createConnection(pipePath);
    let buffer = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.destroy();
      reject(new Error('MCP Bridge pipe request timed out'));
    }, timeoutMs);

    client.on('connect', () => {
      client.write(JSON.stringify(request) + '\n', 'utf8');
    });

    client.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const nlIdx = buffer.indexOf('\n');
      if (nlIdx !== -1 && !settled) {
        settled = true;
        clearTimeout(timer);
        const line = buffer.slice(0, nlIdx).trim();
        client.end();
        try {
          resolve(JSON.parse(line));
        } catch (err) {
          reject(err);
        }
      }
    });

    client.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

module.exports = {
  ThinktankMcpHost,
  extractLinkedIdsFromProjectBody,
  appendThinkToProjectBody,
  generateUniqueThinkId,
  startMcpBridgeServer,
  forwardJsonRpcOverPipe,
};
