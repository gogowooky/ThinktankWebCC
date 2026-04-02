/**
 * authMiddleware.ts
 * シンプルなパスワード認証ミドルウェア
 * 
 * 環境変数 APP_PASSWORD が設定されている場合のみ認証を有効化。
 * 未設定の場合はすべてのリクエストを許可する（ローカル開発用）。
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// セッショントークンの有効期限（30日）
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'tt_session';

// 署名用シークレット（起動ごとにランダム生成。再起動でセッション無効化）
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

/**
 * トークンを生成（パスワードのハッシュ + タイムスタンプ + 署名）
 */
function generateToken(password: string): string {
    const timestamp = Date.now().toString();
    const payload = `${password}:${timestamp}`;
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    // Base64エンコードして返す
    const token = Buffer.from(`${timestamp}:${signature}`).toString('base64');
    return token;
}

/**
 * トークンを検証
 */
function validateToken(token: string, password: string): boolean {
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [timestamp, signature] = decoded.split(':');
        if (!timestamp || !signature) return false;

        // 有効期限チェック
        const tokenTime = parseInt(timestamp, 10);
        if (isNaN(tokenTime) || Date.now() - tokenTime > SESSION_MAX_AGE_MS) {
            return false;
        }

        // 署名検証
        const payload = `${password}:${timestamp}`;
        const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    } catch {
        return false;
    }
}

/**
 * ログインページのHTML
 */
function loginPageHtml(errorMessage?: string): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thinktank - ログイン</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0a0a0f;
            font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            color: #e0e0e0;
        }
        .login-card {
            background: rgba(20, 20, 35, 0.9);
            border: 1px solid rgba(100, 100, 255, 0.15);
            border-radius: 16px;
            padding: 48px 40px;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(10px);
        }
        h1 {
            text-align: center;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #6a8cff, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            text-align: center;
            font-size: 13px;
            color: #888;
            margin-bottom: 32px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            font-size: 13px;
            color: #aaa;
            margin-bottom: 6px;
        }
        input[type="password"] {
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: #fff;
            font-size: 15px;
            outline: none;
            transition: border-color 0.2s;
        }
        input[type="password"]:focus {
            border-color: rgba(100, 140, 255, 0.5);
        }
        button {
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #4a6cf7, #6a4cf7);
            border: none;
            border-radius: 8px;
            color: #fff;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        button:hover { opacity: 0.85; }
        button:active { opacity: 0.7; }
        .error {
            background: rgba(255, 60, 60, 0.1);
            border: 1px solid rgba(255, 60, 60, 0.3);
            color: #ff6b6b;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 13px;
            margin-bottom: 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="login-card">
        <h1>Thinktank</h1>
        <p class="subtitle">パスワードを入力してください</p>
        ${errorMessage ? `<div class="error">${errorMessage}</div>` : ''}
        <form method="POST" action="/api/auth/login">
            <div class="form-group">
                <label for="password">パスワード</label>
                <input type="password" id="password" name="password" autofocus required />
            </div>
            <button type="submit">ログイン</button>
        </form>
    </div>
</body>
</html>`;
}

/**
 * Cookieをパース（簡易実装）
 */
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(pair => {
        const [key, ...vals] = pair.trim().split('=');
        if (key) cookies[key.trim()] = decodeURIComponent(vals.join('='));
    });
    return cookies;
}

/**
 * 認証ルート（/api/auth/*）
 */
export function authRoutes(): Router {
    const router = Router();

    // POST /api/auth/login - パスワード検証
    router.post('/login', express.urlencoded({ extended: false }), (req: Request, res: Response) => {
        const password = process.env.APP_PASSWORD;
        if (!password) {
            return res.redirect('/');
        }

        const inputPassword = req.body?.password;
        if (inputPassword === password) {
            // 認証成功 → Cookieにトークンを設定
            const token = generateToken(password);
            res.cookie(COOKIE_NAME, token, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: SESSION_MAX_AGE_MS,
                path: '/'
            });
            return res.redirect('/');
        }

        // 認証失敗
        res.status(401).send(loginPageHtml('パスワードが正しくありません'));
    });

    // GET /api/auth/logout - ログアウト
    router.get('/logout', (_req: Request, res: Response) => {
        res.clearCookie(COOKIE_NAME, { path: '/' });
        res.redirect('/');
    });

    return router;
}

/**
 * 認証ミドルウェア
 * APP_PASSWORD が設定されている場合のみ認証を要求
 */
export function authMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
        const password = process.env.APP_PASSWORD;

        // パスワード未設定 → 認証不要（ローカル開発用）
        if (!password) {
            return next();
        }

        // 認証ルートは除外（authRoutesで処理済み）
        if (req.path.startsWith('/api/auth/')) {
            return next();
        }

        // Cookieからトークンを取得・検証
        const cookies = parseCookies(req.headers.cookie);
        const token = cookies[COOKIE_NAME];

        if (token && validateToken(token, password)) {
            return next();
        }

        // APIリクエストの場合は401を返す
        if (req.path.startsWith('/api/') || req.path === '/ws') {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // ブラウザリクエストの場合はログインページを表示
        res.status(401).send(loginPageHtml());
    };
}
