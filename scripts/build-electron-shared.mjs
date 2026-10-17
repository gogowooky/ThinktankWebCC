/**
 * scripts/build-electron-shared.mjs
 * shared/*.ts を CommonJS 形式で electron/shared-dist/ にコンパイルし、
 * package.json ("type": "commonjs") を配置することで electron/main.cjs からの require() を可能にする。
 * あわせて .thinktank/prompts/<profileId>/profile.json も最新の標準定義で出力（未存在時）する。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'electron', 'shared-dist');

mkdirSync(outDir, { recursive: true });

// 1. tsc で shared/*.ts を CommonJS として electron/shared-dist に出力
const tscBin = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
const sharedFiles = [
  'shared/vaultFormat.ts',
  'shared/conflict.ts',
  'shared/searchIndex.ts',
  'shared/domainProfile.ts',
  'shared/operations.ts',
  'shared/promptBuilder.ts',
  'shared/responseValidator.ts',
  'shared/relayProtocol.ts',
  'shared/relayCrypto.ts',
  'shared/firebaseAuth.ts',
  'shared/index.ts',
].map((f) => path.join(rootDir, f));

execFileSync(
  process.execPath,
  [
    tscBin,
    ...sharedFiles,
    '--outDir',
    outDir,
    '--module',
    'commonjs',
    '--target',
    'ES2022',
    '--moduleResolution',
    'node',
    '--esModuleInterop',
    'true',
    '--skipLibCheck',
    'true',
    '--declaration',
    'false',
  ],
  { stdio: 'inherit', cwd: rootDir },
);

// 2. ルート package.json が "type": "module" のため、electron/shared-dist/package.json に "type": "commonjs" を配置
writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8',
);

// 3. .thinktank/prompts/<id>/profile.json を生成（存在しない場合または --sync-prompts 指定時）
const syncPrompts = process.argv.includes('--sync-prompts');
const sharedIndexUrl = pathToFileURL(path.join(outDir, 'index.js')).href;
const sharedMod = await import(sharedIndexUrl);

for (const [profileId, profileObj] of Object.entries(sharedMod.BUILTIN_DOMAIN_PROFILES)) {
  const dir = path.join(rootDir, '.thinktank', 'prompts', profileId);
  mkdirSync(dir, { recursive: true });
  const profileJsonPath = path.join(dir, 'profile.json');
  if (syncPrompts || !existsSync(profileJsonPath)) {
    writeFileSync(profileJsonPath, JSON.stringify(profileObj, null, 2) + '\n', 'utf8');
  }
}

console.log('[build-electron-shared] Built electron/shared-dist and synced .thinktank/prompts');
