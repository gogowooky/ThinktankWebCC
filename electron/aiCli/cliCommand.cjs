'use strict';

/**
 * electron/aiCli/cliCommand.cjs
 * CLI 種別ごとの起動引数・標準入力の組み立てと、出力・失敗の読み取り。
 * 外からは electron/aiCliRunner.cjs を通して使う。
 */

const { AiCliDeniedError } = require('./errors.cjs');
const { normalizeCliModel } = require('./cliModels.cjs');

/** TOML の文字列。バックスラッシュをそのまま書けるリテラル文字列を優先する */
function tomlString(value) {
  const s = String(value);
  return /['\r\n]/.test(s) ? JSON.stringify(s) : `'${s}'`;
}

/** codex の -c で Thinktank MCP サーバーを登録する引数 */
function codexMcpConfigArgs(mcpServer) {
  const envEntries = Object.entries(mcpServer.env || {})
    .map(([k, v]) => `${k} = ${tomlString(v)}`)
    .join(', ');
  return [
    '-c', `mcp_servers.thinktank.command=${tomlString(mcpServer.command)}`,
    '-c', `mcp_servers.thinktank.args=[${(mcpServer.args || []).map(tomlString).join(', ')}]`,
    '-c', `mcp_servers.thinktank.env={ ${envEntries} }`,
    '-c', 'mcp_servers.thinktank.default_tools_approval_mode="approve"',
  ];
}

/**
 * cmd.exe 経由（.cmd ラッパー）で起動するときは引数が空白で区切り直されるため、空白などを含む引数を引用符で囲む。
 * 引数の中の " は cmd でうまく渡せないので、そのまま渡す
 */
function quoteForCmd(args) {
  return args.map((a) => (/[\s&|<>^()]/.test(a) && !a.includes('"') ? `"${a}"` : a));
}

/**
 * CLI 種別ごとの設定隔離コマンド引数を組み立てる。
 * プロンプト本文は長大になるためコマンドライン引数ではなく標準入力（stdin）から渡す。
 */
function buildCliArgs(cliName, modelOverride, options = {}) {
  const normalizedModel = normalizeCliModel(cliName, modelOverride);
  const mcpConfigPath = options && typeof options.mcpConfigPath === 'string' ? options.mcpConfigPath : null;
  const mcpServer = options && options.mcpServer ? options.mcpServer : null;
  switch (cliName) {
    case 'claude': {
      // --safe-mode は --mcp-config で渡した MCP サーバーまで無効にするため、MCP を使うときは
      // --restricted（設定ファイル・コード実行ツールを使わない）で隔離する
      const args = mcpConfigPath
        ? ['-p', '--restricted', '--strict-mcp-config', '--output-format', 'text',
          '--mcp-config', mcpConfigPath, '--allowedTools', 'mcp__thinktank__*']
        : ['-p', '--safe-mode', '--setting-sources', 'user', '--strict-mcp-config', '--output-format', 'text'];
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
      // codex は作業ディレクトリの .codex/config.toml を読まない（信頼済みプロジェクトだけ）ため -c で渡す。
      // exec は承認を求められないので、Thinktank MCP のツールは承認済みにする
      if (mcpServer) {
        args.push(...codexMcpConfigArgs(mcpServer));
      }
      if (normalizedModel) {
        args.push('-m', normalizedModel);
      }
      args.push('-');
      return args;
    }
    case 'antigravity': {
      const args = [
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--sandbox',
      ];
      // ヘッドレス実行では MCP の呼び出しが自動で拒否されるため、Thinktank MCP だけ許可する
      if (mcpConfigPath) {
        args.push('--settings', JSON.stringify({ permissions: { allow: ['mcp(thinktank/*)'] } }));
      }
      if (normalizedModel) {
        args.push('--model', normalizedModel);
      }
      return args;
    }
    default:
      throw new Error(`未対応の AI CLI です: ${cliName}`);
  }
}

/**
 * Antigravity のストリーミング入力だけは NDJSON の user event を要求する。
 */
function buildCliInput(cliName, promptText) {
  if (cliName !== 'antigravity') return promptText;
  return `${JSON.stringify({ event: 'user', message: { content: promptText } })}\n`;
}

/**
 * Antigravity の NDJSON から最終 result.response を取り出し、他 CLI と同じ本文契約へ揃える。
 */
function extractCliResponse(cliName, stdout) {
  if (cliName !== 'antigravity') return stdout;

  let terminalResult = null;
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event?.event === 'result' && event.result && typeof event.result === 'object') {
        terminalResult = event.result;
      }
    } catch {
      // 診断行は無視し、機械可読な最終 result のみを採用する。
    }
  }

  if (!terminalResult) {
    throw new Error('Antigravity CLI の最終結果を取得できませんでした。');
  }
  if (terminalResult.status !== 'SUCCESS') {
    throw new Error(terminalResult.error || `Antigravity CLI が ${terminalResult.status || '不明な状態'} で終了しました。`);
  }
  if (typeof terminalResult.response !== 'string' || !terminalResult.response.trim()) {
    // ヘッドレスでは承認を求められない操作（シェルコマンド等）を試みると、自動で拒否されて応答が空で終わる
    const denied = Array.isArray(terminalResult.denied_actions)
      ? terminalResult.denied_actions.map((a) => a?.display_name || a?.action).filter(Boolean)
      : [];
    if (denied.length) {
      throw new AiCliDeniedError(
        `Antigravity が許可されていない操作（${[...new Set(denied)].join('・')}）を使おうとしたため、応答できませんでした。`
        + '質問を変えて送り直すか、別の AI を選んでください。',
      );
    }
    throw new Error('Antigravity CLI の応答が空でした。');
  }
  return terminalResult.response;
}

/**
 * 終了コードが 0 以外で応答も無かったときの説明。
 * codex の stderr は先頭に実行情報と依頼文の写しが並び、原因は末尾に出るため、末尾の ERROR 行を優先して示す。
 */
function describeCliFailure(cliName, code, stderr) {
  // eslint-disable-next-line no-control-regex
  const text = String(stderr || '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  const modelError = /"message":"(The '[^']+' model is not supported[^"]*)"/.exec(text);
  if (modelError) {
    return `AI CLI（${cliName}）の既定のモデルがこのアカウントでは使えません（${modelError[1]}）。`
      + `${cliName} の設定（codex は ~/.codex/config.toml の model）で使えるモデルに変えてください。`;
  }
  if (/401 Unauthorized|Not logged in|Missing bearer|not authenticated|Invalid API key|Please run .*login/i.test(text)) {
    return `AI CLI（${cliName}）にログインしていません（認証エラー）。Thinktank の設定の「AIモデル」でログインし直すか、別の AI CLI を選んでください。`;
  }
  const lines = [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  const errors = lines.filter((l) => /\berror\b/i.test(l));
  const detail = (errors.length ? errors.slice(-3) : lines.slice(-5)).join(' / ');
  return `AI CLI (${cliName}) が終了コード ${code} で失敗しました: ${detail.slice(-600)}`;
}

module.exports = {
  tomlString,
  codexMcpConfigArgs,
  quoteForCmd,
  buildCliArgs,
  buildCliInput,
  extractCliResponse,
  describeCliFailure,
};
