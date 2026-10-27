import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { EventEmitter } = require('node:events') as typeof import('node:events');
const {
  runDomainAiConversation,
  executeIsolatedCli,
  setMaxConcurrentCliProcesses,
  DEFAULT_MAX_CONCURRENT_CLI_PROCESSES,
  AiCliError,
  SUPPORTED_CLIS,
  buildCliArgs,
  buildCliInput,
  extractCliResponse,
} = require('./aiCliRunner.cjs') as {
  runDomainAiConversation: (params: Record<string, unknown>) => Promise<{ reply: string }>;
  executeIsolatedCli: (params: Record<string, unknown>) => Promise<{
    cliName: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    sandboxDir: string;
  }>;
  setMaxConcurrentCliProcesses: (limit?: number) => void;
  DEFAULT_MAX_CONCURRENT_CLI_PROCESSES: number;
  AiCliError: new (message: string) => Error;
  SUPPORTED_CLIS: string[];
  buildCliArgs: (cliName: string, model?: string) => string[];
  buildCliInput: (cliName: string, prompt: string) => string;
  extractCliResponse: (cliName: string, stdout: string) => string;
};

let emptyDir: string;

beforeEach(() => {
  // CLI がどこにも無い PC を再現する（PATH も、既定のインストール先も空のフォルダにする）
  emptyDir = fs.mkdtempSync(join(tmpdir(), 'thinktank-no-cli-'));
  vi.stubEnv('PATH', emptyDir);
  vi.stubEnv('Path', emptyDir);
  vi.stubEnv('APPDATA', emptyDir);
  vi.stubEnv('LOCALAPPDATA', emptyDir);
});

afterEach(() => {
  setMaxConcurrentCliProcesses(DEFAULT_MAX_CONCURRENT_CLI_PROCESSES);
  vi.unstubAllEnvs();
  fs.rmSync(emptyDir, { recursive: true, force: true });
});

describe('runDomainAiConversation without any AI CLI', () => {
  it('fails with a clear message instead of returning a canned answer', async () => {
    const run = runDomainAiConversation({
      cliName: 'claude',
      bundleId: 'b1',
      bundleTitle: 'テーマ',
      relatedDocuments: [{ thinkid: '2026-10-19-100000', title: '資料', excerpt: '本文' }],
      userMessage: 'この資料の論点は？',
    });
    await expect(run).rejects.toBeInstanceOf(AiCliError);
    await expect(run).rejects.toThrow('AI CLI（Claude Code・Codex・Antigravity CLI）がこの PC に見つかりません');
  });
});

describe('Antigravity CLI adapter', () => {
  it('replaces Gemini CLI in the supported CLI list', () => {
    expect(SUPPORTED_CLIS).toEqual(['claude', 'codex', 'antigravity']);
  });

  it('uses sandboxed stream-json mode and maps the app model to an Antigravity model slug', () => {
    expect(buildCliArgs('antigravity', 'gemini-3.5-flash')).toEqual([
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--sandbox',
      '--model',
      'gemini-3.8-flash-medium',
    ]);
  });

  it('encodes a prompt as one user event and extracts the terminal response', () => {
    const input = buildCliInput('antigravity', '論点を整理して');
    expect(JSON.parse(input)).toEqual({
      event: 'user',
      message: { content: '論点を整理して' },
    });

    const output = [
      JSON.stringify({ event: 'init', init: { cwd: 'sandbox' } }),
      JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: '{"reply":"回答"}\n' } }),
    ].join('\n');
    expect(extractCliResponse('antigravity', output)).toBe('{"reply":"回答"}\n');
  });

  it('turns an Antigravity error result into an execution error', () => {
    const output = JSON.stringify({
      event: 'result',
      result: { status: 'ERROR', response: '', error: 'authentication required' },
    });
    expect(() => extractCliResponse('antigravity', output)).toThrow('authentication required');
  });
});

describe('Parallel AI CLI execution and sandbox isolation', () => {
  it('assigns distinct sandbox directories to concurrent invocations and cleans them up on completion', async () => {
    const spawnedDirs: string[] = [];
    const finishes: Array<() => void> = [];

    const fakeSpawn = vi.fn((_bin: string, _args: string[], opts: { cwd: string }) => {
      spawnedDirs.push(opts.cwd);
      expect(fs.existsSync(opts.cwd)).toBe(true);

      const child = new EventEmitter() as InstanceType<typeof EventEmitter> & {
        stdout: InstanceType<typeof EventEmitter>;
        stderr: InstanceType<typeof EventEmitter>;
        stdin: { write: (chunk: string) => void; end: () => void };
        kill: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write: vi.fn(), end: vi.fn() };
      child.kill = vi.fn();

      finishes.push(() => {
        child.stdout.emit('data', Buffer.from('{"reply":"ok"}', 'utf8'));
        child.emit('close', 0);
      });
      return child;
    });

    const p1 = executeIsolatedCli({
      cliName: 'claude',
      model: 'claude-sonnet-5',
      promptText: 'q1',
      binPathOverride: '/fake/claude',
      spawnImpl: fakeSpawn,
    });
    const p2 = executeIsolatedCli({
      cliName: 'codex',
      model: 'gpt-5.6',
      promptText: 'q2',
      binPathOverride: '/fake/codex',
      spawnImpl: fakeSpawn,
    });

    await vi.waitFor(() => {
      expect(spawnedDirs.length).toBe(2);
    });
    expect(spawnedDirs[0]).not.toBe(spawnedDirs[1]);

    finishes.forEach((fn) => fn());
    await Promise.all([p1, p2]);

    expect(fs.existsSync(spawnedDirs[0])).toBe(false);
    expect(fs.existsSync(spawnedDirs[1])).toBe(false);
  });

  it('respects the concurrency semaphore limit and starts queued processes as slots free up', async () => {
    setMaxConcurrentCliProcesses(2);
    const activeOrder: string[] = [];
    const finishes: Array<() => void> = [];

    const fakeSpawn = vi.fn((bin: string) => {
      activeOrder.push(bin);
      const child = new EventEmitter() as InstanceType<typeof EventEmitter> & {
        stdout: InstanceType<typeof EventEmitter>;
        stderr: InstanceType<typeof EventEmitter>;
        stdin: { write: (chunk: string) => void; end: () => void };
        kill: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write: vi.fn(), end: vi.fn() };
      child.kill = vi.fn();

      finishes.push(() => {
        child.stdout.emit('data', Buffer.from('{"reply":"done"}', 'utf8'));
        child.emit('close', 0);
      });
      return child;
    });

    const r1 = executeIsolatedCli({
      cliName: 'claude',
      promptText: '1',
      binPathOverride: 'cli-1',
      spawnImpl: fakeSpawn,
    });
    const r2 = executeIsolatedCli({
      cliName: 'codex',
      promptText: '2',
      binPathOverride: 'cli-2',
      spawnImpl: fakeSpawn,
    });
    const r3 = executeIsolatedCli({
      cliName: 'claude',
      promptText: '3',
      binPathOverride: 'cli-3',
      spawnImpl: fakeSpawn,
    });

    await vi.waitFor(() => {
      expect(activeOrder).toEqual(['cli-1', 'cli-2']);
    });

    // 1つ目が完了すると3つ目が起動する
    finishes[0]();
    await r1;
    await vi.waitFor(() => {
      expect(activeOrder).toEqual(['cli-1', 'cli-2', 'cli-3']);
    });

    finishes[1]();
    finishes[2]();
    await Promise.all([r2, r3]);
  });
});
