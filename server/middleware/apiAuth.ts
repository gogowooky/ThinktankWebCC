/**
 * apiAuth.ts
 * 共有シークレット(API_SHARED_SECRET)による /api/* の簡易認証ミドルウェア。
 *
 * このサーバーは Cloud Run に --allow-unauthenticated でデプロイされる運用が
 * あり、CORS 制限だけでは「サーバーの URL を直接知っている非ブラウザクライアント
 * (bot/curl 等)」からのアクセスを防げない。API_SHARED_SECRET が設定されている
 * 場合はヘッダー一致を必須にする。
 *
 * 【フェイルクローズ】
 * 以前は「未設定なら認証をスキップ」というフェイルオープンだったが、設定漏れが
 * そのまま Vault 全件の読み書き削除・AI APIキーの第三者利用・/api/system/open
 * （任意パス起動）の無認証公開に直結する。公開ホスティング上で未設定の場合は
 * 警告ではなく起動中止に倒す（assertApiAuthConfigured）。
 * ローカル開発時のみ、従来どおり未設定での起動を許容する。
 */
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';

const HEADER_NAME = 'x-thinktank-api-key';

/** シークレットの最低長。`openssl rand -hex 32` なら 64 文字になる */
const MIN_SECRET_LENGTH = 16;

/**
 * Cloud Run は実行時に K_SERVICE を必ず設定する。
 * 「インターネットから到達しうるホスティング上か」の判定に使う。
 */
function isPublicHosting(): boolean {
  return Boolean(process.env['K_SERVICE']);
}

/**
 * 毎回 process.env を読む。モジュール評価時に固定するとローダー順（loadEnv.ts より
 * 先に評価されるケース）に依存して未設定と誤判定されうるため。
 */
function getSharedSecret(): string | null {
  const value = process.env['API_SHARED_SECRET'];
  return value && value.length > 0 ? value : null;
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
 * 公開ホスティング上でシークレットが未設定・脆弱な場合は例外を投げて起動を止める。
 */
export function assertApiAuthConfigured(): void {
  const secret = getSharedSecret();

  if (secret) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `[apiAuth] API_SHARED_SECRET が短すぎます（${secret.length}文字 / 最低${MIN_SECRET_LENGTH}文字）。` +
        '`openssl rand -hex 32` 等で生成し直してください。'
      );
    }
    console.log('[apiAuth] 共有シークレット認証: 有効');
    return;
  }

  if (isPublicHosting()) {
    throw new Error(
      '[apiAuth] API_SHARED_SECRET が未設定です。公開ホスティング環境（Cloud Run）では ' +
      '/api/* が無認証で公開されてしまうため起動を中止します。' +
      'デプロイ時に --update-env-vars API_SHARED_SECRET=... を指定してください（deploy.ps1 参照）。'
    );
  }

  console.warn(
    '[apiAuth] API_SHARED_SECRET が未設定のため認証は無効です（ローカル開発のみ許容）。' +
    '公開環境にデプロイする前に必ず設定してください。'
  );
}

export function apiAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = getSharedSecret();
  // 未設定でここに到達するのはローカル開発時のみ（assertApiAuthConfigured 済み）
  if (!secret) { next(); return; }

  const raw = req.headers[HEADER_NAME];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (typeof provided === 'string' && secretMatches(provided, secret)) { next(); return; }

  res.status(401).json({ error: 'unauthorized' });
}
