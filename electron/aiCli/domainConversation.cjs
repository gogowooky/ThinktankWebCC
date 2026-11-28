'use strict';

/**
 * electron/aiCli/domainConversation.cjs
 * ドメインプロファイルと Bundle の文脈から依頼文を作り、AI CLI に相談する入口。
 * 外からは electron/aiCliRunner.cjs を通して使う。
 */

const shared = require('../shared-dist/index.js');
const { RecordingMcpHost } = require('../mcpBridge.cjs');
const { AiCliDeniedError, AiCliError, AiCliCanceledError } = require('./errors.cjs');
const { getDefaultMcpHost } = require('./cliRuntime.cjs');
const { SUPPORTED_CLIS, detectAvailableClis } = require('./cliDetection.cjs');
const { resolveModelLabel } = require('./cliModels.cjs');
const { executeIsolatedCli } = require('./cliExecution.cjs');

/**
 * ドメインプロファイルと Bundle コンテキストからプロンプトを生成し、
 * ローカル AI CLI（またはテスト/オフライン時の構造化フォールバック）を実行して検証済み応答を返す。
 */
async function runDomainAiConversation(params) {
  if (params.measureHarness !== true || !Array.isArray(params.harness?.writableIds)) {
    return executeDomainConversation(params);
  }
  const start = performance.now();
  const timing = { hostMs: 0, tools: {} };
  try {
    const result = await executeDomainConversation(params, timing);
    return { ...result, harnessTiming: timing };
  } catch (error) {
    // IPCとWeb中継の両方で途中までの計測を渡し、呼び出し側で通常の失敗として処理する。
    return { reply: '', harnessTiming: timing, harnessTimingError: error?.message ?? String(error) };
  } finally {
    timing.hostMs = Math.round(performance.now() - start);
  }
}

async function executeDomainConversation(params, timing) {
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
  const detectStart = performance.now();
  const detected = detectAvailableClis();
  if (timing) timing.detectMs = Math.round(performance.now() - detectStart);
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
  const baseMcpHost = mcpHost !== undefined ? mcpHost : getDefaultMcpHost();
  // AIハーネスの実行は、書き換えてよい AIWork を限り、作成・更新した Think を AI の自己申告ではなく実際の呼び出しから記録する
  const harnessWritableIds = params.harness && Array.isArray(params.harness.writableIds)
    ? params.harness.writableIds.filter((id) => shared.isSafeThinkId(String(id)))
    : null;
  const harnessHost = baseMcpHost && harnessWritableIds
    ? new RecordingMcpHost(baseMcpHost, { writableIds: harnessWritableIds })
    : null;
  const activeMcpHost = harnessHost || baseMcpHost;
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
      timing,
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
    ...(harnessHost ? { harnessRecord: harnessHost.recorded } : {}),
  };
}

module.exports = {
  runDomainAiConversation,
  executeDomainConversation,
};
