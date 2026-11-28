'use strict';

/**
 * electron/aiCli/cliModels.cjs
 * UI のモデル ID と各 CLI のモデル名の対応、利用者設定の既定モデル、使えるモデル候補の取得。
 * 外からは electron/aiCliRunner.cjs を通して使う。
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveExecutablePath, runAuthProbe } = require('./cliDetection.cjs');

/**
 * UI側のモデルID（claude-sonnet-5 等）を各 CLI が受け付けるモデル名／エイリアスへ正規化する。
 */
function normalizeCliModel(cliName, modelOverride) {
  const raw = String(modelOverride || '').trim();
  const m = raw.toLowerCase();
  if (!raw || m === 'none' || m.endsWith('-default') || m.endsWith('-isolated')) {
    return null;
  }
  if (cliName === 'antigravity') {
    if (m === 'gemini-2.5-pro') return 'gemini-3.1-pro-high';
    if (m === 'gemini-3.5-flash' || m === 'gemini-2.0-flash') return 'gemini-3.8-flash-medium';
    return raw;
  }
  if (cliName === 'claude') {
    if (m === 'opus' || m === 'sonnet' || m === 'haiku' || m === 'fable') return m;
    if (m.includes('opus')) return 'opus';
    if (m.includes('haiku')) return 'haiku';
    if (m.includes('sonnet')) return 'sonnet';
    return raw;
  }
  if (cliName === 'codex') {
    if (m === 'gpt-5.6') return null; // codex CLI の既定最新モデルを使用
    return raw;
  }
  return raw;
}

/** agy models の出力（<id>\t<label>）からモデル ID の配列を抽出する */
function parseAgyModelsOutput(stdout) {
  const seen = new Set();
  const gemini = [];
  const others = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const token = trimmed.split(/\t/)[0].trim();
    if (!token || !/^[a-z0-9][a-z0-9._-]*-[a-z0-9._-]+$/i.test(token) || seen.has(token)) continue;
    seen.add(token);
    if (token.toLowerCase().startsWith('gemini-')) gemini.push(token);
    else others.push(token);
  }
  return [...gemini, ...others];
}

/**
 * API キーを使わずに各 CLI のローカルキャッシュ・公式コマンド・設定ファイルから
 * 利用可能な最新モデル ID 一覧を非同期で取得する。
 */
async function discoverAvailableModels({
  homeDir = os.homedir(),
  spawnImpl = spawn,
  agyPathOverride,
  timeoutMs = 12_000,
} = {}) {
  const uniq = (list, max = 12) => [...new Set(list.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()))].slice(0, max);

  // OpenAI (Codex): ~/.codex/config.toml の既定モデル + ~/.codex/models_cache.json の models[].slug
  const openAiPromise = (async () => {
    const list = [];
    const def = readCliDefaultModel('codex', homeDir);
    if (def) list.push(def);
    try {
      const codexHome = process.env.CODEX_HOME || path.join(homeDir, '.codex');
      const raw = await fs.promises.readFile(path.join(codexHome, 'models_cache.json'), 'utf8');
      const parsed = JSON.parse(raw);
      const models = Array.isArray(parsed?.models) ? parsed.models : [];
      for (const item of models) {
        const slug = item?.slug || item?.id || item?.name;
        if (typeof slug === 'string' && slug.trim()) list.push(slug.trim());
      }
    } catch {
      // キャッシュ未作成時は空のまま返す
    }
    return uniq(list, 10);
  })();

  // Gemini (Antigravity): agy models の出力から取得（gemini-* を優先）
  const geminiPromise = (async () => {
    const agyPath = agyPathOverride !== undefined ? agyPathOverride : resolveExecutablePath('antigravity');
    if (!agyPath) return [];
    try {
      const probe = await runAuthProbe({ binPath: agyPath, args: ['models'], timeoutMs, spawnImpl });
      if (probe.timedOut || probe.exitCode !== 0) return [];
      const ids = parseAgyModelsOutput(probe.stdout);
      const geminiOnly = ids.filter((id) => id.toLowerCase().startsWith('gemini-'));
      return uniq(geminiOnly.length ? geminiOnly : ids, 10);
    } catch {
      return [];
    }
  })();

  // Claude (Claude Code): ~/.claude/settings.json の既定モデル + 公式エイリアス
  const claudePromise = (async () => {
    const list = [];
    const def = readCliDefaultModel('claude', homeDir);
    if (def) list.push(def);
    list.push('opus', 'sonnet', 'haiku');
    return uniq(list, 6);
  })();

  const [OpenAI, Gemini, Claude] = await Promise.all([openAiPromise, geminiPromise, claudePromise]);
  return { OpenAI, Gemini, Claude };
}

/** 各 CLI の利用者設定にある既定モデル（モデルを指定しないときに CLI が使うもの）。読めなければ null */
function readCliDefaultModel(cliName, homeDir = os.homedir()) {
  try {
    if (cliName === 'codex') {
      const codexHome = process.env.CODEX_HOME || path.join(homeDir, '.codex');
      const toml = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
      // 最初の [table] より前の最上位キーだけを見る
      const top = toml.split(/^\s*\[/m)[0];
      const m = top.match(/^\s*model\s*=\s*["']([^"']+)["']/m);
      return m ? m[1] : null;
    }
    if (cliName === 'claude') {
      const settings = JSON.parse(fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf8'));
      return typeof settings.model === 'string' && settings.model.trim() ? settings.model.trim() : null;
    }
  } catch {
    // 設定ファイルが無い・読めないときは既定モデル扱い
  }
  return null;
}

/** 記録に残す AI モデル名。指定モデル → CLI の既定モデル → 「CLI名（既定モデル）」の順 */
function resolveModelLabel(cliName, modelOverride, homeDir) {
  return normalizeCliModel(cliName, modelOverride)
    || readCliDefaultModel(cliName, homeDir)
    || `${cliName}（既定モデル）`;
}

module.exports = {
  normalizeCliModel,
  parseAgyModelsOutput,
  discoverAvailableModels,
  readCliDefaultModel,
  resolveModelLabel,
};
