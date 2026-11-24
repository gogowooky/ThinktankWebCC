import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeDiscoveredModels } from '../src/services/aiChatModelStatus';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { normalizeCliModel, parseAgyModelsOutput, discoverAvailableModels } = require('./aiCliRunner.cjs');

let tempHome: string;
beforeEach(() => { tempHome = fs.mkdtempSync(join(tmpdir(), 'tt-model-disc-')); });
afterEach(() => { fs.rmSync(tempHome, { recursive: true, force: true }); });

it('normalizeCliModel は Antigravity の最新モデル ID をそのまま通し、旧名称は互換変換する', () => {
  expect(normalizeCliModel('antigravity', 'gemini-4-neon-high')).toBe('gemini-4-neon-high');
  expect(normalizeCliModel('antigravity', 'gemini-2.5-pro')).toBe('gemini-3.1-pro-high');
  expect(normalizeCliModel('antigravity', 'gemini-3.5-flash')).toBe('gemini-3.8-flash-medium');
  expect(normalizeCliModel('antigravity', 'None')).toBeNull();
  expect(normalizeCliModel('claude', 'opus')).toBe('opus');
  expect(normalizeCliModel('codex', 'gpt-6.2-sol')).toBe('gpt-6.2-sol');
});

it('parseAgyModelsOutput は agy models の出力からモデル ID を抽出する', () => {
  const out = [
    'Fetching available models...',
    'gemini-4-neon-high\tGemini 4 Neon (High)',
    'gemini-4-hydrogen-medium\tGemini 4 Hydrogen (Medium)',
    'claude-opus-5-5-high\tClaude Opus 5.5 (High)',
  ].join('\n');
  expect(parseAgyModelsOutput(out)).toEqual(['gemini-4-neon-high', 'gemini-4-hydrogen-medium', 'claude-opus-5-5-high']);
});

it('discoverAvailableModels はローカルキャッシュ・設定・agy models から API キー不要でモデル一覧を取得する', async () => {
  fs.mkdirSync(join(tempHome, '.codex'), { recursive: true });
  fs.writeFileSync(join(tempHome, '.codex', 'config.toml'), 'model = "gpt-6.2-astra"\n', 'utf8');
  fs.writeFileSync(
    join(tempHome, '.codex', 'models_cache.json'),
    JSON.stringify({ models: [{ slug: 'gpt-6.2-sol' }, { slug: 'gpt-6.2-astra' }] }),
    'utf8',
  );
  fs.mkdirSync(join(tempHome, '.claude'), { recursive: true });
  fs.writeFileSync(join(tempHome, '.claude', 'settings.json'), JSON.stringify({ model: 'sonnet' }), 'utf8');

  const fakeSpawn = () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('gemini-4-neon-high\tGemini 4 Neon\ngemini-3.8-flash-medium\tFlash\n'));
      child.emit('close', 0);
    });
    return child;
  };

  const res = await discoverAvailableModels({ homeDir: tempHome, agyPathOverride: 'agy', spawnImpl: fakeSpawn });
  expect(res.OpenAI).toEqual(['gpt-6.2-astra', 'gpt-6.2-sol']);
  expect(res.Gemini).toEqual(['gemini-4-neon-high', 'gemini-3.8-flash-medium']);
  expect(res.Claude).toEqual(['sonnet', 'opus', 'haiku']);
});

it('mergeDiscoveredModels は先頭の選択中モデルを維持しつつ未登録モデルだけを後ろへ追加する', () => {
  expect(mergeDiscoveredModels('None', ['gpt-6.2-sol', 'gpt-6.1-terra'])).toBe('gpt-6.2-sol,gpt-6.1-terra');
  expect(mergeDiscoveredModels('gpt-5.6-sol,gpt-6.2-sol', ['gpt-6.2-sol', 'gpt-6.2-astra']))
    .toBe('gpt-5.6-sol,gpt-6.2-sol,gpt-6.2-astra');
});
