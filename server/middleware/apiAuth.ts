/**
 * apiAuth.ts
 * 共有シークレット(API_SHARED_SECRET)による /api/* の簡易認証ミドルウェア。
 *
 * このサーバーは Cloud Run に --allow-unauthenticated でデプロイされる運用が
 * あり、CORS 制限だけでは「サーバーの URL を直接知っている非ブラウザクライアント
 * (bot/curl 等)」からのアクセスを防げない。API_SHARED_SECRET が設定されている
 * 場合はヘッダー一致を必須にする。
 *
 * 未設定時は開発体験を壊さないよう認証をスキップするが、本番/公開環境では
 * 必ず設定すること（起動時に警告を出す）。
 */
import type { Request, Response, NextFunction } from 'express';

const SHARED_SECRET = process.env['API_SHARED_SECRET'];
const HEADER_NAME = 'x-thinktank-api-key';

if (!SHARED_SECRET) {
  console.warn(
    '[apiAuth] API_SHARED_SECRET が未設定のため、共有シークレットによる認証は無効です。' +
    'Cloud Run 等の公開環境にデプロイする前に必ず設定してください。'
  );
}

export function apiAuth(req: Request, res: Response, next: NextFunction): void {
  if (!SHARED_SECRET) { next(); return; }
  const key = req.headers[HEADER_NAME];
  if (key === SHARED_SECRET) { next(); return; }
  res.status(401).json({ error: 'unauthorized' });
}
