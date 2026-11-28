'use strict';

/**
 * electron/aiCli/cliRuntime.cjs
 * AI CLI の同時実行数の上限（セマフォ）と、既定の MCP ホスト。プロセス全体で1つだけ持つ状態。
 * 外からは electron/aiCliRunner.cjs を通して使う。
 */

const DEFAULT_MAX_CONCURRENT_CLI_PROCESSES = 4;

// PC版自身のIPCとWeb版中継リクエストが同時に集中した際、プロセス乱立によるメモリ枯渇を防ぐセマフォ。
let maxConcurrentCliProcesses = DEFAULT_MAX_CONCURRENT_CLI_PROCESSES;
let activeCliProcessCount = 0;
const cliWaitQueue = [];
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

module.exports = {
  DEFAULT_MAX_CONCURRENT_CLI_PROCESSES,
  setDefaultMcpHost,
  getDefaultMcpHost,
  setMaxConcurrentCliProcesses,
  acquireCliSlot,
  releaseCliSlot,
};
