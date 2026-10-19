/**
 * src/platform/web/FirebaseAuthService.ts
 * Web版の Firebase Authentication セッション管理。
 * Firestore のルールは users/{uid} を本人だけに許すため、中継の読み書きにはここで得た uid と ID トークンを使う。
 * Google ログイン（GoogleAuthService）で得たアクセストークンを Firebase の資格情報に交換する。
 */

import {
  signInWithGoogleAccessToken,
  refreshFirebaseIdToken,
  needsFirebaseTokenRefresh,
  type FirebaseAuthSession,
} from '../../../shared/firebaseAuth';
import { GoogleAuthService } from './GoogleAuthService';

const STORAGE_KEY_SESSION = 'thinktank.web.firebaseSession';

function getApiKey(): string {
  const env =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env) ||
    {};
  return env.VITE_FIREBASE_API_KEY || '';
}

function electronRelay() {
  return typeof window !== 'undefined' ? window.electronAPI?.relay : undefined;
}

class FirebaseAuthServiceImpl {
  private session: FirebaseAuthSession | null = this.load();
  private refreshing: Promise<FirebaseAuthSession> | null = null;

  private load(): FirebaseAuthSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION);
      return raw ? (JSON.parse(raw) as FirebaseAuthSession) : null;
    } catch {
      return null;
    }
  }

  private save(session: FirebaseAuthSession | null): void {
    this.session = session;
    if (typeof localStorage === 'undefined') return;
    if (session) {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    }
  }

  public getCurrentUser(): { uid: string; email: string } | null {
    return this.session ? { uid: this.session.uid, email: this.session.email } : null;
  }

  public signOut(): void {
    this.save(null);
    void electronRelay()?.signOutFirebase?.().catch(() => {});
  }

  /**
   * 同じ PC で中継役を務めるプロセスにログインを引き継ぐ。
   * Electron 版ならメインプロセスの中継役へ IPC で、ブラウザなら常駐エージェント（localhost:8080）へ送る。
   */
  private async shareSessionWithLocalRelay(session: FirebaseAuthSession): Promise<void> {
    const setSession = electronRelay()?.setFirebaseSession;
    if (setSession) {
      await setSession({ refreshToken: session.refreshToken, email: session.email, apiKey: getApiKey() });
      return;
    }
    await fetch('http://localhost:8080/relay-login/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken, email: session.email }),
    });
  }

  /**
   * Electron 版で、画面側はログイン済みなのにメインプロセスの中継役が未ログインのとき、ログインを渡す。
   * 以前の版では画面側のログインがメインプロセスに渡らなかったため、起動時や設定画面を開いたときに補う。
   */
  public async syncSessionToElectronRelay(): Promise<boolean> {
    const relay = electronRelay();
    if (!this.session || !relay?.setFirebaseSession) return false;
    const status = await relay.getStatus();
    if (status.firebaseSignedIn) return false;
    await this.shareSessionWithLocalRelay(this.session);
    return true;
  }

  /** 有効な Google アクセストークンを Firebase の資格情報に交換する。 */
  public async signInWithGoogleToken(): Promise<FirebaseAuthSession> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('VITE_FIREBASE_API_KEY が設定されていません。');
    }
    if (!GoogleAuthService.hasValidToken()) {
      throw new Error('先に「Google でログイン」を行ってください。');
    }
    const requestUri =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const session = await signInWithGoogleAccessToken(
      apiKey,
      GoogleAuthService.getConfig().accessToken,
      requestUri,
    );
    this.save(session);
    void this.shareSessionWithLocalRelay(session).catch(() => {});
    return session;
  }

  /**
   * 同一PC上で起動している中継役エージェント (http://localhost:8080/relay-login) が
   * 既にログイン済みであれば、そのセッションを引き継ぐ。
   */
  public async syncFromLocalRelayIfAvailable(): Promise<FirebaseAuthSession | null> {
    const apiKey = getApiKey();
    if (!apiKey || typeof fetch !== 'function') return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch('http://localhost:8080/relay-login/session', {
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) return null;
      const data = (await res.json()) as {
        signedIn?: boolean;
        refreshToken?: string;
        email?: string;
      };
      if (!data.signedIn || !data.refreshToken) return null;
      const session = await refreshFirebaseIdToken(apiKey, data.refreshToken, data.email || '');
      this.save(session);
      return session;
    } catch {
      return null;
    }
  }

  /**
   * Firestore 用の uid と ID トークンを返す。期限が近ければ更新する。
   * 未ログインでもローカル中継エージェントまたは Google トークンが有効なら自動で Firebase にサインインする
   * （AI 実行中はユーザー操作が無くポップアップを開けないため）。
   */
  public async getAuth(): Promise<{ uid: string; idToken: string }> {
    let session = this.session;
    if (!session) {
      session = await this.syncFromLocalRelayIfAvailable();
    }
    if (!session) {
      if (!GoogleAuthService.hasValidToken()) {
        throw new Error(
          'Firebase 未ログインです。設定画面の「Google でログイン」または http://localhost:8080/relay-login でログインしてから再度お試しください。',
        );
      }
      session = await this.signInWithGoogleToken();
    }
    if (needsFirebaseTokenRefresh(session)) {
      if (!this.refreshing) {
        const current = session;
        this.refreshing = refreshFirebaseIdToken(getApiKey(), current.refreshToken, current.email)
          .then((next) => {
            this.save(next);
            return next;
          })
          .catch((err: unknown) => {
            // リフレッシュトークンが失効した場合は再ログインが必要
            this.save(null);
            throw err;
          })
          .finally(() => {
            this.refreshing = null;
          });
      }
      session = await this.refreshing;
    }
    return { uid: session.uid, idToken: session.idToken };
  }
}

export const FirebaseAuthService = new FirebaseAuthServiceImpl();
