import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const { runDomainAiConversation, AiCliError } = require('./aiCliRunner.cjs') as {
  runDomainAiConversation: (params: Record<string, unknown>) => Promise<{ reply: string }>;
  AiCliError: new (message: string) => Error;
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
    await expect(run).rejects.toThrow('AI CLI（Claude Code・Codex・Gemini CLI）がこの PC に見つかりません');
  });
});
