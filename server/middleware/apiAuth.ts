/**
 * apiAuth.ts
 * /api/* のアクセス制御ミドルウェア。経路を3つ扱い、上から順に評価する。
 *
 *  1. IAP（Cloud Run 直接統合）— 公開環境。Cloud Run がコンテナに到達する前に
 *     IAP ポリシーを適用するため、ここに来た時点で既に認可済みである。
 *     run.app を含む全 ingress 経路が保護されるので迂回経路は存在しない。
 *     そのうえで多層防御として署名付きJWTを検証する。
 *  2. API_SHARED_SECRET — ローカル/パッケージ版Electron が叩くローカルサーバー経路。
 *     IAP はこの層を守れないため両方が必要になる。
 *  3. どちらも未設定 — ローカル開発時のみ許容。
 *
 * 【フェイルクローズ】
 * 以前は「未設定なら認証をスキップ」というフェイルオープンだったが、設定漏れが
 * そのまま Vault 全件の読み書き削除・AI APIキーの第三者利用・/api/system/open
 * （任意パス起動）の無認証公開に直結する。公開ホスティング上でどちらの認証も
 * 設定されていない場合は警告ではなく起動中止に倒す（assertApiAuthConfigured）。
 *
 * 署名なしヘッダー x-goog-authenticated-user-email は使わない。IAP を迂回された
 * 場合に偽装可能であると公式に警告されており、必ず署名付きの
 * x-goog-iap-jwt-assertion を検証する必要があるため。
 */
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const HEADER_NAME = 'x-thinktank-api-key';

/** シークレットの最低長。`openssl rand -hex 32` なら 64 文字になる */
const MIN_SECRET_LENGTH = 16;

const IAP_JWT_HEADER = 'x-goog-iap-jwt-assertion';
const IAP_ISSUER     = 'https://cloud.google.com/iap';

/**
 * Cloud Run は実行時に K_SERVICE を必ず設定する。
 * 「インターネットから到達しうるホスティング上か」の判定に使う。
 */
function isPublicHosting(): boolean {
  return Boolean(process.env['K_SERVICE']);
}

/**
 * 設定値は毎回 process.env を読む。モジュール評価時に固定するとローダー順
 * （loadEnv.ts より先に評価されるケース）に依存して未設定と誤判定されうるため。
 */
function getSharedSecret(): string | null {
  const value = process.env['API_SHARED_SECRET'];
  return value && value.length > 0 ? value : null;
}

function isIapEnabled(): boolean {
  return process.env['IAP_ENABLED'] === 'true';
}

// Cloud Run 直接統合で JWT が実際に届くか、また aud クレームがどの形式になるかは
// 実測でしか確定できない（LB経由とは aud の形式が異なる）。確認できるまでは
// 「届いていれば検証し、届かなければ通す」で運用する。IAP がエッジで既に
// 認可しているため、この状態でも未認可のリクエストは到達しない。
// ログで JWT の到達を確認したら IAP_REQUIRE_JWT=true に切り替えること。
function isIapJwtRequired(): boolean {
  return process.env['IAP_REQUIRE_JWT'] === 'true';
}

/** 実測した aud を固定する。未設定なら aud 検証をスキップする */
function getIapAudience(): string | undefined {
  return process.env['IAP_AUDIENCE'];
}

/** 許可するメールアドレス。未設定なら IAP の IAM ポリシーのみに委ねる */
function getIapAllowedEmails(): string[] {
  return (process.env['IAP_ALLOWED_EMAILS'] ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

/** 長さの差や先頭一致の差で応答時間が変わらないよう定数時間で比較する */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // timingSafeEqual は同長を要求するため、ダミー比較で処理時間を揃えてから落とす
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * 起動時の設定検証。app.listen() より前に呼ぶこと。
 * 公開ホスティング上でどの認証も有効でない場合は例外を投げて起動を止める。
 */
export function assertApiAuthConfigured(): void {
  const secret = getSharedSecret();

  if (secret && secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[apiAuth] API_SHARED_SECRET が短すぎます（${secret.length}文字 / 最低${MIN_SECRET_LENGTH}文字）。` +
      '`openssl rand -hex 32` 等で生成し直してください。'
    );
  }

  // IAP は Cloud Run がコンテナ到達前にポリシーを適用するため、共有シークレットが
  // 無くても公開状態にはならない。IAP 構成では API_SHARED_SECRET を配らない運用に
  // なるので、これを有効な設定として認める。
  if (isIapEnabled()) {
    console.log(
      `[apiAuth] IAP 認証: 有効${secret ? '（共有シークレットも併用）' : ''}` +
      `${isIapJwtRequired() ? ' / JWT検証: 必須' : ' / JWT検証: 到達時のみ'}`
    );
    return;
  }

  if (secret) {
    console.log('[apiAuth] 共有シークレット認証: 有効');
    return;
  }

  if (isPublicHosting()) {
    throw new Error(
      '[apiAuth] IAP_ENABLED も API_SHARED_SECRET も未設定です。公開ホスティング環境（Cloud Run）では ' +
      '/api/* が無認証で公開されてしまうため起動を中止します。' +
      'IAP を使う場合は IAP_ENABLED=true を、共有シークレットを使う場合は ' +
      'API_SHARED_SECRET を指定してください（deploy.ps1 参照）。'
    );
  }

  console.warn(
    '[apiAuth] IAP_ENABLED も API_SHARED_SECRET も未設定のため認証は無効です（ローカル開発のみ許容）。' +
    '公開環境にデプロイする前に必ずどちらかを設定してください。'
  );
}

// ── IAP ────────────────────────────────────────────────────────────────────

const oauth2 = new OAuth2Client();

type IapPublicKeys = Awaited<ReturnType<OAuth2Client['getIapPublicKeysAsync']>>['pubkeys'];

const KEY_TTL_MS = 60 * 60 * 1000;
let keyCache: { keys: IapPublicKeys; fetchedAt: number } | null = null;

async function getIapKeys(forceRefresh: boolean): Promise<IapPublicKeys> {
  if (!forceRefresh && keyCache && Date.now() - keyCache.fetchedAt < KEY_TTL_MS) {
    return keyCache.keys;
  }
  const { pubkeys } = await oauth2.getIapPublicKeys();
  keyCache = { keys: pubkeys, fetchedAt: Date.now() };
  return pubkeys;
}

type VerifyResult =
  | { ok: true;  email: string | undefined; aud: string | undefined }
  | { ok: false; reason: string };

async function verifyIapJwt(token: string): Promise<VerifyResult> {
  // 鍵ローテーション直後は kid 不一致で失敗しうるので、一度だけ強制再取得して再試行する
  for (const forceRefresh of [false, true]) {
    try {
      const ticket = await oauth2.verifySignedJwtWithCertsAsync(
        token, await getIapKeys(forceRefresh), getIapAudience(), [IAP_ISSUER]
      );
      const payload = ticket.getPayload();
      return {
        ok:    true,
        email: payload?.email,
        aud:   typeof payload?.aud === 'string' ? payload.aud : undefined,
      };
    } catch (e) {
      if (forceRefresh) return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: false, reason: 'unreachable' };
}

// 起動後の最初の1回だけ、実際に届いたヘッダーと aud をログに出す（設定確定用）
let diagnosticLogged = false;

async function iapAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw   = req.headers[IAP_JWT_HEADER];
  const token = Array.isArray(raw) ? raw[0] : raw;

  if (!token) {
    if (!diagnosticLogged) {
      diagnosticLogged = true;
      const googHeaders = Object.keys(req.headers).filter(h => h.startsWith('x-goog'));
      console.warn(
        `[apiAuth] ${IAP_JWT_HEADER} が見つかりません。受信した x-goog-* ヘッダー: ` +
        `${googHeaders.join(', ') || '(なし)'}`
      );
    }
    if (isIapJwtRequired()) { res.status(401).json({ error: 'unauthorized' }); return; }
    next();   // IAP がエッジで認可済みのため通す
    return;
  }

  const result = await verifyIapJwt(token);
  if (!result.ok) {
    console.warn(`[apiAuth] IAP JWT の検証に失敗しました: ${result.reason}`);
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (!diagnosticLogged) {
    diagnosticLogged = true;
    console.log(`[apiAuth] IAP JWT 検証成功 (aud: ${result.aud}, email: ${result.email})`);
  }

  const allowed = getIapAllowedEmails();
  if (allowed.length > 0 && (!result.email || !allowed.includes(result.email))) {
    console.warn(`[apiAuth] 許可されていないアカウントです: ${result.email}`);
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  next();
}

// ── エントリポイント ────────────────────────────────────────────────────────

export function apiAuth(req: Request, res: Response, next: NextFunction): void {
  if (isIapEnabled()) {
    iapAuth(req, res, next).catch((e: unknown) => {
      console.error('[apiAuth] IAP 認証処理でエラー:', e);
      res.status(500).json({ error: 'auth error' });
    });
    return;
  }

  const secret = getSharedSecret();
  // 未設定でここに到達するのはローカル開発時のみ（assertApiAuthConfigured 済み）
  if (!secret) { next(); return; }

  const raw = req.headers[HEADER_NAME];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (typeof provided === 'string' && secretMatches(provided, secret)) { next(); return; }

  res.status(401).json({ error: 'unauthorized' });
}
