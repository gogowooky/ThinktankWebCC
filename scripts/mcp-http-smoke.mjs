#!/usr/bin/env node
/**
 * scripts/mcp-http-smoke.mjs
 * 起動中のシンクタンク（Web運用モード）の MCP HTTP サーバーに対する疎通確認。
 * MCP インターフェイス仕様書 11章の適合確認のうち、HTTP 越しに確かめられる項目を実行する。
 *
 * 使い方:
 *   node scripts/mcp-http-smoke.mjs --url http://127.0.0.1:47821/mcp --token "$TT_MCP_TOKEN" \
 *        [--wrong-pc-token "$TT_MCP_OTHER_PC_TOKEN"] [--expect-version 2.7.0] [--json]
 *
 * トークンは引数ではなく環境変数 TT_MCP_TOKEN / TT_MCP_OTHER_PC_TOKEN でも渡せる（シェル履歴に残さないため推奨）。
 *
 * 安全性: Vault は書き換えない。(v) は存在する Think に「古い expectedVersion」で更新を試み、競合で拒否されることだけを確かめる。
 * 出力にトークンは含めない。
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const asJson = args.includes('--json');

const url = opt('url', 'http://127.0.0.1:47821/mcp');
const token = opt('token', process.env.TT_MCP_TOKEN || '');
const otherPcToken = opt('wrong-pc-token', process.env.TT_MCP_OTHER_PC_TOKEN || '');
const expectVersion = opt('expect-version', '2.7.0');
const EXPECTED_TOOLS = 8;

const results = [];
function record(id, title, ok, detail) {
  results.push({ id, title, status: ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail });
}

async function rpc(body, bearer) {
  const headers = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // 本文なし（202 など）
  }
  return { status: res.status, json, pc: res.headers.get('x-thinktank-pc') };
}

async function callTool(name, toolArgs) {
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: toolArgs } }, token);
  const text = r.json?.result?.content?.[0]?.text;
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return { status: r.status, isError: Boolean(r.json?.result?.isError), payload };
}

async function main() {
  if (!token) {
    console.error('トークンがありません。--token か環境変数 TT_MCP_TOKEN で渡してください。');
    process.exit(2);
  }

  // (i) initialize
  const init = await rpc(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } },
    token,
  );
  const info = init.json?.result?.serverInfo;
  record(
    'i',
    `initialize の serverInfo.version が ${expectVersion}`,
    init.status === 200 && info?.name === 'thinktank' && info?.version === expectVersion,
    `HTTP ${init.status}, serverInfo=${JSON.stringify(info)}, X-Thinktank-Pc=${init.pc}`,
  );

  // (ii) tools/list
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, token);
  const names = (list.json?.result?.tools ?? []).map((t) => t.name);
  record('ii', `tools/list が ${EXPECTED_TOOLS} ツールを返す`, list.status === 200 && names.length === EXPECTED_TOOLS, `HTTP ${list.status}, ${names.length}件: ${names.join(', ')}`);
  const forbidden = names.filter((n) => /approve|reject|gate|delete|trash|remove/i.test(n));
  record('ii-gov', '承認・Gate・削除に当たるツールを公開していない', forbidden.length === 0, forbidden.length ? `公開されている: ${forbidden.join(', ')}` : 'なし');

  // (iii) thinktank_search
  const search = await callTool('thinktank_search', { query: '', limit: 1 });
  const keys = search.payload && typeof search.payload === 'object' ? Object.keys(search.payload) : [];
  record(
    'iii',
    'thinktank_search の応答に count / items / truncated がある',
    !search.isError && ['count', 'items', 'truncated'].every((k) => keys.includes(k)) && typeof search.payload.truncated === 'boolean',
    `keys=[${keys.join(', ')}], count=${search.payload?.count}, truncated=${search.payload?.truncated}`,
  );

  // (iv) 認証
  const noToken = await rpc({ jsonrpc: '2.0', id: 3, method: 'ping' });
  const badToken = await rpc({ jsonrpc: '2.0', id: 3, method: 'ping' }, 'ttmcp_this_is_not_a_valid_token');
  record('iv-a', 'トークンなしは 401', noToken.status === 401, `HTTP ${noToken.status}`);
  record('iv-b', '不正なトークンは 401', badToken.status === 401, `HTTP ${badToken.status}`);
  if (otherPcToken) {
    const wrong = await rpc({ jsonrpc: '2.0', id: 3, method: 'ping' }, otherPcToken);
    record('iv-c', '別PC向けトークンは拒否（403）', wrong.status === 403, `HTTP ${wrong.status}`);
  } else {
    record('iv-c', '別PC向けトークンは拒否（403）', null, '--wrong-pc-token が未指定のため未実施');
  }

  // (v) VERSION_CONFLICT
  const meta = await callTool('thinktank_list_meta', { limit: 1 });
  const target = meta.payload?.items?.[0]?.thinkid;
  if (!target) {
    record('v', '古い expectedVersion の更新が VERSION_CONFLICT（retryable:false）', null, 'Vault に Think が無いため未実施（Vault を書き換えない方針）');
  } else {
    const conflict = await callTool('thinktank_update_think', {
      thinkid: target,
      expectedVersion: '1999-01-01T00:00:00.000Z',
      appendBody: '[smoke] このテキストは書き込まれてはならない',
    });
    const err = conflict.payload?.error;
    record(
      'v',
      '古い expectedVersion の更新が VERSION_CONFLICT（retryable:false）',
      conflict.isError && err?.code === 'VERSION_CONFLICT' && err?.retryable === false,
      `isError=${conflict.isError}, error=${JSON.stringify({ code: err?.code, retryable: err?.retryable, thinkid: err?.thinkid })}`,
    );
  }
}

try {
  await main();
} catch (e) {
  record('error', '実行中の例外', false, e instanceof Error ? e.message : String(e));
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) console.log(`[${r.status}] (${r.id}) ${r.title}\n        ${r.detail}`);
}
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
