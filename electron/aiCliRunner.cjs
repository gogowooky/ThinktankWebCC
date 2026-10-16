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
 * UI側のモデルID（claude-sonnet-5 等）を各 CLI が受け付けるモデル名／エイリアスへ正規化する。
 */
function normalizeCliModel(cliName, modelOverride) {
  if (!modelOverride || modelOverride === 'None' || modelOverride.endsWith('-default') || modelOverride.endsWith('-isolated')) {
    return null;
  }
  const m = String(modelOverride).trim().toLowerCase();
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
  if (cliName === 'gemini') {
    if (m === 'gemini-3.5-flash') return 'gemini-2.5-flash';
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

    const child = spawn(binPath, args, {
      cwd: sandboxDir,
      shell: isCmdWrapper,
      windowsHide: true,
      env: {
        ...process.env,
        NO_COLOR: '1',
        CI: '1',
      },
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
    allowFallbackOnCliError = true,
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

  // 利用可能な CLI を選択（指定された CLI が無ければインストール済みの他の CLI へ自動切替）
  const detected = detectAvailableClis();
  let selectedCli = cliName;
  if (!detected[selectedCli]?.available) {
    const firstAvailable = SUPPORTED_CLIS.find((c) => detected[c]?.available);
    if (firstAvailable) {
      selectedCli = firstAvailable;
    }
  }

  try {
    const execResult = await executeIsolatedCli({
      cliName: selectedCli,
      model,
      promptText,
      timeoutMs,
    });
    const validated = shared.validateAiCliResponse(execResult.stdout);
    return {
      ...validated,
      executedCli: selectedCli,
      fallbackUsed: false,
    };
  } catch (err) {
    if (!allowFallbackOnCliError) {
      throw err;
    }
    const docTitles = (relatedDocuments || []).map((d) => `「${d.title}」(${d.thinkid})`).slice(0, 3);
    const agentObj = agentId
      ? resolvedProfile.agents.find((a) => a.id === agentId)
      : null;
    const roleHeader = agentObj
      ? `【${agentObj.name}】`
      : `【${resolvedProfile.name} (${panelRole || 'Discuss'})】`;

    const fallbackReply = [
      `${roleHeader} として「${bundleTitle || bundleId}」のコンテキストと参照資料（${
        docTitles.length > 0 ? docTitles.join('、') : '参照資料なし'
      }）を確認しました。`,
      '',
      `ご質問: 「${userMessage}」`,
      '',
      docTitles.length > 0
        ? `現在の関連メモ ${(relatedDocuments || [])[0].title} [:>1] に基づき、上位共有（昇格候補）として検討すべき論点を抽出しました。内容をご確認のうえ、承認または修正してください。`
        : '現在このテーマに紐づく根拠メモが不足しています（insufficientEvidence）。まずは関連するメモや記録を関連付けるか、現状の前提条件を教えてください。',
      '',
      `（※ローカル AI CLI [${selectedCli}] 呼び出し時の診断情報: ${err.message}）`,
    ].join('\n');

    const firstDoc = (relatedDocuments || [])[0];
    const citations = firstDoc
      ? [
          {
            sourceThinkid: firstDoc.thinkid,
            sourceTitle: firstDoc.title,
            snippet: (firstDoc.excerpt || '').slice(0, 120),
          },
        ]
      : [];

    const defaultKind = resolvedProfile.id === 'elderly-support' ? 'action' : 'risk';
    const promotionCandidates = [
      {
        type: defaultKind,
        title:
          resolvedProfile.id === 'elderly-support'
            ? `「${(userMessage || '').slice(0, 24)}」に関する確認メモ`
            : `「${(userMessage || '').slice(0, 24)}」に関する検討・リスク確認`,
        summary: userMessage,
        rationale: agentObj
          ? `${agentObj.name} の観点からの初期抽出`
          : `${resolvedProfile.name} プロファイルに基づく初期抽出`,
        impactScope: bundleTitle || bundleId,
        citations,
      },
    ];

    return {
      reply: fallbackReply,
      insufficientEvidence: !firstDoc,
      citations,
      proposals: [],
      subtaskCandidates: [],
      pauseCandidates: [],
      promotionCandidates,
      rawText: fallbackReply,
      parsedAsJson: false,
      executedCli: selectedCli,
      fallbackUsed: true,
      cliError: err.message,
    };
  }
}

module.exports = {
  SUPPORTED_CLIS,
  resolveExecutablePath,
  detectAvailableClis,
  ensureIsolatedSandboxDir,
  buildCliArgs,
  executeIsolatedCli,
  runDomainAiConversation,
};
