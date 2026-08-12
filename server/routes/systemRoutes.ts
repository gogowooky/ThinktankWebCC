import { Router } from 'express';
import { execFile } from 'child_process';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname, isAbsolute, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEARCH_TAG_FILE = resolve(__dirname, '../../docs/DefaultSearchTag.md');

// 関連付けを介して即座にコードが実行される拡張子。ノート内のパスを開くという
// 本来の用途（文書・画像・フォルダ）に実行可能ファイルは含まれないため拒否する。
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.com', '.scr', '.pif', '.msi', '.msp', '.cpl', '.dll',
  '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse',
  '.wsf', '.wsh', '.hta', '.jar', '.reg', '.lnk', '.url', '.inf',
  '.sh', '.bash', '.zsh', '.command', '.app', '.desktop',
]);

type OpenVerdict =
  | { ok: true; resolved: string }
  | { ok: false; reason: string };

/**
 * /open に渡されたパスを検証する。
 * この API は「ローカルの文書を既定のアプリで開く」ためのものであり、
 * 任意の実行ファイルを起動する手段になってはならない。
 */
export function validateOpenPath(input: string): OpenVerdict {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'path is empty' };

  // NUL 混入によるパス切り詰めを防ぐ
  if (raw.includes('\0')) return { ok: false, reason: 'path contains NUL' };

  // UNC パス（\\server\share\payload.exe）はリモートの実行ファイルを掴まされる
  if (raw.startsWith('\\\\') || raw.startsWith('//')) {
    return { ok: false, reason: 'UNC path is not allowed' };
  }

  // file:// 等のスキーム付き入力は対象外（相対パスも曖昧なので拒否）
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    return { ok: false, reason: 'URL is not allowed' };
  }
  if (!isAbsolute(raw)) return { ok: false, reason: 'path must be absolute' };

  const resolved = resolve(raw);

  if (!existsSync(resolved)) return { ok: false, reason: 'path does not exist' };

  // ディレクトリはエクスプローラで開くだけなので許可する
  if (statSync(resolved).isDirectory()) return { ok: true, resolved };

  if (BLOCKED_EXTENSIONS.has(extname(resolved).toLowerCase())) {
    return { ok: false, reason: 'executable file type is not allowed' };
  }

  return { ok: true, resolved };
}

// search-tags は副作用のない参照データ（検索URLテンプレート）の読み取り専用APIで、
// 秘匿すべき情報を含まない。apiAuth（共有シークレット）の前段で公開し、
// Viteのdevプロキシ経由でしかヘッダーが付与されない構成に依存させない
// （パッケージ版Electronやプロキシなし環境でも動くようにするため）。
export function createPublicSystemRoutes(): Router {
  const router = Router();

  router.get('/search-tags', (_req, res) => {
    try {
      const text = readFileSync(SEARCH_TAG_FILE, 'utf-8');
      const tags: Record<string, string> = {};
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const firstComma = trimmed.indexOf(',');
        const lastComma  = trimmed.lastIndexOf(',');
        if (firstComma === -1 || firstComma === lastComma) continue;
        const id  = trimmed.slice(0, firstComma).trim();
        const url = trimmed.slice(lastComma + 1).trim();
        // NoURL は「WebSearchタグではないActionTag」のメニュー確認用の印であり、
        // 実URLテンプレートではないため配信対象から除外する
        if (id && url && url !== 'NoURL') tags[id] = url;
      }
      res.json(tags);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // search-tag-items は TextEditor.CurrentEditor.DoOnCursorPos:Menu（タグ挿入メニュー）用に、
  // ID と Description（"親)親名 > 子)子名" 形式）を NoURL 行も含めて全件返す。
  // /search-tags と異なり URL テンプレートの有無で絞り込まない（ActionTag系もメニュー対象のため）。
  router.get('/search-tag-items', (_req, res) => {
    try {
      const text = readFileSync(SEARCH_TAG_FILE, 'utf-8');
      const items: { id: string; description: string }[] = [];
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const firstComma = trimmed.indexOf(',');
        const lastComma  = trimmed.lastIndexOf(',');
        if (firstComma === -1 || firstComma === lastComma) continue;
        const id          = trimmed.slice(0, firstComma).trim();
        const description = trimmed.slice(firstComma + 1, lastComma).trim().replace(/^"|"$/g, '');
        if (id && description) items.push({ id, description });
      }
      res.json(items);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}

export function createSystemRoutes(): Router {
  const router = Router();

  router.post('/open', (req, res) => {
    const { path: filePath } = req.body as { path?: unknown };
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    const verdict = validateOpenPath(filePath);
    if (!verdict.ok) {
      console.warn(`[Server] Blocked open request (${verdict.reason}): ${filePath}`);
      res.status(400).json({ error: verdict.reason });
      return;
    }
    const target = verdict.resolved;

    console.log(`[Server] Attempting to open path: ${target}`);

    // Windows で `cmd /c start` を使わない理由:
    // execFile が引数をクォートしても cmd.exe は受け取った文字列を再パースするため、
    // 引用符を含む入力から `&` 等のメタ文字を注入する余地が残る
    // （Node の .bat/.cmd 向けエスケープは cmd.exe 直接起動には適用されない）。
    // explorer.exe は引数を再解釈しないので、この経路を断てる。
    const platform = process.platform;
    const [cmd, args] = platform === 'win32'
      ? ['explorer.exe', [target]]
      : platform === 'darwin'
        ? ['open', [target]]
        : ['xdg-open', [target]];

    execFile(cmd, args, (error) => {
      // explorer.exe は成功時も終了コード 1 を返すことがあるため、
      // Windows では起動できたかどうかを終了コードで判定しない。
      if (error && platform !== 'win32') {
        console.error(`[Server] Failed to open path: ${target}`, error);
        res.status(500).json({ error: 'failed to open path' });
        return;
      }
      res.json({ success: true });
    });
  });

  return router;
}
