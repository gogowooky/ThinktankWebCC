import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { EventEmitter } = require('node:events') as typeof import('node:events');
const {
  runDomainAiConversation,
  runGeminiNotebookConversation,
  getGeminiNotebookTitle,
  authProbeLoggedIn,
  detectAiAuthentication,
  startAiAuthentication,
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
  runGeminiNotebookConversation: (params: Record<string, unknown>) => Promise<{
    reply: string;
    citations: unknown[];
    proposals: unknown[];
    executedCli: string;
  }>;
  getGeminiNotebookTitle: (params: Record<string, unknown>) => Promise<string>;
  authProbeLoggedIn: (provider: string, probe: Record<string, unknown>) => boolean;
  detectAiAuthentication: (options?: Record<string, unknown>) => Promise<Record<string, { available: boolean; loggedIn: boolean; loginUrl: string }>>;
  startAiAuthentication: (provider: string, options?: Record<string, unknown>) => { started: boolean; loginUrl: string };
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
  buildCliArgs: (cliName: string, model?: string, options?: Record<string, unknown>) => string[];
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

describe('Thinktank MCP を各 CLI に渡す引数', () => {
  const mcpServer = {
    command: 'C:\\Program Files\\Thinktank\\Thinktank.exe',
    args: ['C:\\app\\electron\\mcpServer.cjs'],
    env: { ELECTRON_RUN_AS_NODE: '1', THINKTANK_MCP_PIPE: '\\\\.\\pipe\\tt-1' },
  };
  const options = { mcpConfigPath: 'C:\\tmp\\run\\mcp-config.json', mcpServer };

  it('claude: --safe-mode は MCP も無効にするため使わず、--restricted で隔離して Thinktank MCP だけ許可する', () => {
    const args = buildCliArgs('claude', undefined, options);
    expect(args).not.toContain('--safe-mode');
    expect(args).toEqual(expect.arrayContaining(['--restricted', '--strict-mcp-config', '--mcp-config', options.mcpConfigPath]));
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('mcp__thinktank__*');
    // MCP を渡さないときは従来どおり --safe-mode
    expect(buildCliArgs('claude')).toContain('--safe-mode');
  });

  it('codex: 作業ディレクトリの .codex/config.toml は読まれないため -c で登録し、ツールを承認済みにする', () => {
    const args = buildCliArgs('codex', undefined, options);
    const configs = args.flatMap((a, i) => (args[i - 1] === '-c' ? [a] : []));
    expect(configs).toEqual([
      "mcp_servers.thinktank.command='C:\\Program Files\\Thinktank\\Thinktank.exe'",
      "mcp_servers.thinktank.args=['C:\\app\\electron\\mcpServer.cjs']",
      "mcp_servers.thinktank.env={ ELECTRON_RUN_AS_NODE = '1', THINKTANK_MCP_PIPE = '\\\\.\\pipe\\tt-1' }",
      'mcp_servers.thinktank.default_tools_approval_mode="approve"',
    ]);
    expect(args[args.length - 1]).toBe('-');
  });

  it('antigravity: ヘッドレスでは MCP が自動で拒否されるため、Thinktank MCP だけ許可する設定を渡す', () => {
    const args = buildCliArgs('antigravity', undefined, options);
    expect(JSON.parse(args[args.indexOf('--settings') + 1])).toEqual({ permissions: { allow: ['mcp(thinktank/*)'] } });
  });
});

describe('Antigravity が許可されていない操作で止まったとき', () => {
  it('英語の詳細ではなく、何が起きたかと次の手を日本語で伝える', () => {
    const output = JSON.stringify({
      event: 'result',
      result: { status: 'SUCCESS', response: '', denied_actions: [{ action: 'command', display_name: 'RunCommand' }] },
    });
    expect(() => extractCliResponse('antigravity', output)).toThrow(
      'Antigravity が許可されていない操作（RunCommand）を使おうとしたため、応答できませんでした。質問を変えて送り直すか、別の AI を選んでください。',
    );
  });
});

describe('実行中の AI CLI の中断', () => {
  const { cancelCliRun, AiCliCanceledError } = require('./aiCliRunner.cjs') as {
    cancelCliRun: (runId: string) => boolean;
    AiCliCanceledError: new () => Error;
  };

  it('runId を指定して中断すると、プロセスを止めて中断のエラーで返す', async () => {
    const child = new EventEmitter() as InstanceType<typeof EventEmitter> & {
      stdout: InstanceType<typeof EventEmitter>; stderr: InstanceType<typeof EventEmitter>;
      stdin: { write: () => void; end: () => void }; kill: () => void;
    };
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { write: vi.fn(), end: vi.fn() };
    child.kill = vi.fn();
    const spawned = vi.fn(() => child);
    const run = executeIsolatedCli({
      cliName: 'codex', promptText: 'q', binPathOverride: '/fake/codex', spawnImpl: spawned, runId: 'req-1',
    });
    await vi.waitFor(() => expect(spawned).toHaveBeenCalled());
    expect(cancelCliRun('req-1')).toBe(true);
    await expect(run).rejects.toBeInstanceOf(AiCliCanceledError);
    expect(child.kill).toHaveBeenCalled();
    // 終わった実行は中断の対象に残らない
    expect(cancelCliRun('req-1')).toBe(false);
  });
});

describe('記録に残す AI モデル名', () => {
  const { resolveModelLabel } = require('./aiCliRunner.cjs') as {
    resolveModelLabel: (cliName: string, model?: string, homeDir?: string) => string;
  };

  it('指定モデル → CLI 設定の既定モデル → 「CLI名（既定モデル）」の順に決める', () => {
    const home = fs.mkdtempSync(join(tmpdir(), 'thinktank-home-'));
    vi.stubEnv('CODEX_HOME', '');
    try {
      expect(resolveModelLabel('claude', 'claude-opus-5', home)).toBe('opus');
      expect(resolveModelLabel('codex', '', home)).toBe('codex（既定モデル）');
      fs.mkdirSync(join(home, '.codex'));
      fs.writeFileSync(join(home, '.codex', 'config.toml'), 'model = "gpt-5.6-sol"\n[mcp_servers.x]\nmodel = "other"\n');
      expect(resolveModelLabel('codex', '', home)).toBe('gpt-5.6-sol');
      fs.mkdirSync(join(home, '.claude'));
      fs.writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ model: 'sonnet' }));
      expect(resolveModelLabel('claude', undefined, home)).toBe('sonnet');
      expect(resolveModelLabel('antigravity', '', home)).toBe('antigravity（既定モデル）');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('GeminiNotebook CLI adapter', () => {
  it('queries the selected Notebook ID and returns the JSON answer', async () => {
    const fakeSpawn = vi.fn((_bin: string, args: string[], opts: { shell: boolean; cwd: string }) => {
      expect(args.slice(0, 5)).toEqual([
        'notebook', 'query', 'notebook-123', 'この資料の要点は？', '--json',
      ]);
      expect(args).toContain('--timeout');
      expect(opts.shell).toBe(false);
      expect(fs.existsSync(opts.cwd)).toBe(true);

      const child = new EventEmitter() as InstanceType<typeof EventEmitter> & {
        stdout: InstanceType<typeof EventEmitter>;
        stderr: InstanceType<typeof EventEmitter>;
        kill: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from(JSON.stringify({ answer: 'Notebookに基づく回答' }), 'utf8'));
        child.emit('close', 0);
      });
      return child;
    });

    const response = await runGeminiNotebookConversation({
      notebookId: 'notebook-123',
      userMessage: 'この資料の要点は？',
      binPathOverride: '/fake/nlm',
      spawnImpl: fakeSpawn,
      timeoutMs: 20_000,
    });

    expect(response).toEqual({
      reply: 'Notebookに基づく回答',
      insufficientEvidence: false,
      citations: [],
      proposals: [],
      executedCli: 'nlm',
    });
  });

  it('rejects an unset Notebook ID before starting the CLI', async () => {
    await expect(runGeminiNotebookConversation({ notebookId: 'None', userMessage: '質問' }))
      .rejects.toThrow('Notebook ID が設定されていません');
  });

  it('gets the configured Notebook title as JSON', async () => {
    const fakeSpawn = vi.fn((_bin: string, args: string[]) => {
      expect(args).toEqual(['notebook', 'get', 'notebook-123', '--json']);
      const child = new EventEmitter() as InstanceType<typeof EventEmitter> & {
        stdout: InstanceType<typeof EventEmitter>;
        stderr: InstanceType<typeof EventEmitter>;
        kill: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from(JSON.stringify({ id: 'notebook-123', title: '臨床研究ノート' })));
        child.emit('close', 0);
      });
      return child;
    });
    await expect(getGeminiNotebookTitle({
      notebookId: 'notebook-123',
      binPathOverride: '/fake/nlm',
      spawnImpl: fakeSpawn,
    })).resolves.toBe('臨床研究ノート');
  });
});

describe('AI CLI browser authentication', () => {
  it('recognizes each CLI authentication response without exposing account details', () => {
    expect(authProbeLoggedIn('Claude', { exitCode: 0, stdout: '{"loggedIn":true}', stderr: '', timedOut: false })).toBe(true);
    expect(authProbeLoggedIn('OpenAI', { exitCode: 0, stdout: 'Logged in using ChatGPT', stderr: '', timedOut: false })).toBe(true);
    expect(authProbeLoggedIn('Gemini', { exitCode: 1, stdout: '', stderr: 'Please sign in', timedOut: false })).toBe(false);
    expect(authProbeLoggedIn('GNB', { exitCode: 0, stdout: 'Authentication valid', stderr: '', timedOut: false })).toBe(true);
    expect(authProbeLoggedIn('GNB', { exitCode: 0, stdout: 'Authentication valid', stderr: '', timedOut: true })).toBe(false);
  });

  it('reports login status for cloud CLIs and leaves Local unset', async () => {
    const fakeSpawn = vi.fn((_bin: string, args: string[]) => {
      const child = new EventEmitter() as InstanceType<typeof EventEmitter> & {
        stdout: InstanceType<typeof EventEmitter>;
        stderr: InstanceType<typeof EventEmitter>;
        kill: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      queueMicrotask(() => {
        const command = args.join(' ');
        if (command === 'auth status') child.stdout.emit('data', Buffer.from('{"loggedIn":true}'));
        else if (command === 'login status') child.stdout.emit('data', Buffer.from('Logged in using ChatGPT'));
        else if (command === 'models') child.stderr.emit('data', Buffer.from('Please sign in'));
        else child.stdout.emit('data', Buffer.from('Authentication valid'));
        child.emit('close', command === 'models' ? 1 : 0);
      });
      return child;
    });

    const status = await detectAiAuthentication({
      spawnImpl: fakeSpawn,
      pathsOverride: { OpenAI: '/fake/codex', Gemini: '/fake/agy', Claude: '/fake/claude', GNB: '/fake/nlm' },
    });
    expect(status.OpenAI.loggedIn).toBe(true);
    expect(status.Gemini.loggedIn).toBe(false);
    expect(status.Claude.loggedIn).toBe(true);
    expect(status.GNB.loggedIn).toBe(true);
    expect(status.Local).toMatchObject({ available: false, loggedIn: false, loginUrl: '' });
  });

  it('starts the selected CLI browser login in a detached process', () => {
    const child = new EventEmitter() as InstanceType<typeof EventEmitter> & { unref: () => void };
    child.unref = vi.fn();
    const fakeSpawn = vi.fn(() => child);
    const result = startAiAuthentication('GNB', {
      spawnImpl: fakeSpawn,
      pathsOverride: { GNB: '/fake/nlm' },
    });
    expect(fakeSpawn).toHaveBeenCalledWith('/fake/nlm', ['login', '--storage', 'protected'], expect.objectContaining({
      detached: true,
      windowsHide: false,
    }));
    expect(child.unref).toHaveBeenCalled();
    expect(result.started).toBe(true);
  });
});

describe('Parallel AI CLI execution and sandbox isolation', () => {
  it('assigns distinct sandbox directories to concurrent invocations and cleans them up on completion', async () => {
    const spawnedDirs: string[] = [];
    const finishes: Array<() => void> = [];

    const fakeSpawn = vi.fn((bin: string, args: string[], opts: { cwd: string }) => {
      spawnedDirs.push(opts.cwd);
      expect(fs.existsSync(opts.cwd)).toBe(true);
      // サンドボックス内に各CLI用のMCP設定ファイルが自動生成されていること
      expect(fs.existsSync(join(opts.cwd, 'mcp-config.json'))).toBe(true);
      expect(fs.existsSync(join(opts.cwd, '.agents', 'mcp_config.json'))).toBe(true);
      expect(fs.existsSync(join(opts.cwd, '.codex', 'config.toml'))).toBe(true);
      if (bin.includes('claude')) {
        expect(args).toContain('--mcp-config');
        expect(args).toContain('mcp__thinktank__*');
      }

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
