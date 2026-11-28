'use strict';

/**
 * electron/aiCliRunner.cjs
 * ローカル AI CLI（claude / codex / antigravity）の自動検出と「設定隔離（空フォルダ cwd・設定無効化）」実行エンジン。
 * システム設計メモ §8 準拠。
 * 中身は electron/aiCli/ に分けてあり、ここでは今までと同じ名前でまとめて公開する（呼び出し側は変えない）。
 * システム設計メモ §8 準拠。
 */

const errors = require('./aiCli/errors.cjs');
const cliRuntime = require('./aiCli/cliRuntime.cjs');
const sandbox = require('./aiCli/sandbox.cjs');
const cliDetection = require('./aiCli/cliDetection.cjs');
const cliModels = require('./aiCli/cliModels.cjs');
const cliCommand = require('./aiCli/cliCommand.cjs');
const cliExecution = require('./aiCli/cliExecution.cjs');
const geminiNotebook = require('./aiCli/geminiNotebook.cjs');
const domainConversation = require('./aiCli/domainConversation.cjs');

module.exports = {
  AiCliError: errors.AiCliError,
  SUPPORTED_CLIS: cliDetection.SUPPORTED_CLIS,
  DEFAULT_MAX_CONCURRENT_CLI_PROCESSES: cliRuntime.DEFAULT_MAX_CONCURRENT_CLI_PROCESSES,
  setMaxConcurrentCliProcesses: cliRuntime.setMaxConcurrentCliProcesses,
  setDefaultMcpHost: cliRuntime.setDefaultMcpHost,
  getDefaultMcpHost: cliRuntime.getDefaultMcpHost,
  resolveExecutablePath: cliDetection.resolveExecutablePath,
  resolveGeminiNotebookExecutablePath: cliDetection.resolveGeminiNotebookExecutablePath,
  AI_AUTH_LOGIN_URLS: cliDetection.AI_AUTH_LOGIN_URLS,
  runAuthProbe: cliDetection.runAuthProbe,
  authProbeLoggedIn: cliDetection.authProbeLoggedIn,
  detectAiAuthentication: cliDetection.detectAiAuthentication,
  startAiAuthentication: cliDetection.startAiAuthentication,
  detectAvailableClis: cliDetection.detectAvailableClis,
  ensureIsolatedSandboxDir: sandbox.ensureIsolatedSandboxDir,
  createRunSandboxDir: sandbox.createRunSandboxDir,
  cleanupRunSandboxDir: sandbox.cleanupRunSandboxDir,
  prepareSandboxMcpConfig: sandbox.prepareSandboxMcpConfig,
  normalizeCliModel: cliModels.normalizeCliModel,
  parseAgyModelsOutput: cliModels.parseAgyModelsOutput,
  discoverAvailableModels: cliModels.discoverAvailableModels,
  readCliDefaultModel: cliModels.readCliDefaultModel,
  resolveModelLabel: cliModels.resolveModelLabel,
  buildCliArgs: cliCommand.buildCliArgs,
  buildCliInput: cliCommand.buildCliInput,
  extractCliResponse: cliCommand.extractCliResponse,
  executeIsolatedCli: cliExecution.executeIsolatedCli,
  parseGeminiNotebookResponse: geminiNotebook.parseGeminiNotebookResponse,
  parseGeminiNotebookTitle: geminiNotebook.parseGeminiNotebookTitle,
  getGeminiNotebookTitle: geminiNotebook.getGeminiNotebookTitle,
  runGeminiNotebookConversation: geminiNotebook.runGeminiNotebookConversation,
  runDomainAiConversation: domainConversation.runDomainAiConversation,
  describeCliFailure: cliCommand.describeCliFailure,
  cancelCliRun: cliExecution.cancelCliRun,
  AiCliCanceledError: errors.AiCliCanceledError,
};
