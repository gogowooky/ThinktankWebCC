/**
 * src/platform/web/FirebaseAuthService.ts
 * Web版の Firebase Authentication セッション管理。
 * Firestore のルールは users/{uid} を本人だけに許すため、中継の読み書きにはここで得た uid と ID トークンを使う。
 * Google ログイン（GoogleAuthService）で得たアクセストークンを Firebase の資格情報に交換する。
 */

import {
  refreshFirebaseIdToken,
  needsFirebaseTokenRefresh,
  type FirebaseAuthSession,
} from '../../../shared/firebaseAuth';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as signOutFirebaseSdk,
  type User,
} from 'firebase/auth';
import { getFirebaseApiKey, getFirebaseClient } from './firebaseClient';

const STORAGE_KEY_SESSION = 'thinktank.web.firebaseSession';

function getApiKey(): string {
  return getFirebaseApiKey();
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

  public async signOut(): Promise<void> {
    this.save(null);
    await Promise.all([
      getFirebaseClient()
        .then(({ auth }) => signOutFirebaseSdk(auth))
        .catch(() => {}),
      electronRelay()?.signOutFirebase?.().catch(() => {}) ?? Promise.resolve(),
    ]);
  }

  private async saveSdkUser(user: User): Promise<FirebaseAuthSession> {
    const tokenResult = await user.getIdTokenResult();
    const session: FirebaseAuthSession = {
      uid: user.uid,
      email: user.email || '',
      idToken: tokenResult.token,
      refreshToken: user.refreshToken,
      expiresAtMs: new Date(tokenResult.expirationTime).getTime(),
    };
    this.save(session);
    return session;
  }

  /**
   * Electron内のメインプロセスへログインを引き継ぐ。
   * Web版のデータログインをlocalhost常駐エージェントへ自動送信はしない。
   */
  private async shareSessionWithLocalRelay(session: FirebaseAuthSession): Promise<void> {
    const setSession = electronRelay()?.setFirebaseSession;
    if (setSession) {
      await setSession({ refreshToken: session.refreshToken, email: session.email, apiKey: getApiKey() });
      return;
    }
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

  /**
   * Web版のThink正本用ログイン。Drive用OAuthトークンとは分離し、
   * Firebase Auth自身の永続セッションを作る。
   */
  public async signInWithGooglePopup(): Promise<FirebaseAuthSession> {
    const { auth } = await getFirebaseClient();
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const session = await this.saveSdkUser(result.user);
    if (electronRelay()?.setFirebaseSession) {
      void this.shareSessionWithLocalRelay(session).catch(() => {});
    }
    return session;
  }

  /** Firestore の onSnapshot が使える Firebase SDK セッションを保証する。 */
  public async ensureSdkAuth(): Promise<User> {
    const { auth } = await getFirebaseClient();
    if (auth.currentUser) {
      await this.saveSdkUser(auth.currentUser);
      return auth.currentUser;
    }
    throw new Error('Firebase SDK が未ログインです。設定画面からもう一度ログインしてください。');
  }

  /** Electron メインプロセスで行ったOSブラウザログインをデータ画面へ引き継ぐ。 */
  public async syncFromElectronRelayIfAvailable(): Promise<FirebaseAuthSession | null> {
    const getSession = electronRelay()?.getFirebaseSession;
    if (!getSession) return null;
    const stored = await getSession();
    if (!stored?.refreshToken) return null;
    const session = await refreshFirebaseIdToken(
      stored.apiKey || getApiKey(),
      stored.refreshToken,
      stored.email || '',
    );
    this.save(session);
    return session;
  }

  /**
   * Firestore 用の uid と ID トークンを返す。期限が近ければ更新する。
   * 未ログイン時にDrive用トークンやlocalhostの資格情報から暗黙に再ログインはしない。
   */
  public async getAuth(): Promise<{ uid: string; idToken: string }> {
    let session = this.session;
    // Web版では永続化された SDK Auth を先に復元する。Electron はメイン側の
    // refresh token をRESTで利用するため、この経路に依存しない。
    if (typeof window !== 'undefined' && !window.electronAPI) {
      try {
        const { auth } = await getFirebaseClient();
        if (auth.currentUser) session = await this.saveSdkUser(auth.currentUser);
      } catch {
        // 従来セッションのrefresh経路を継続する
      }
    }
    if (!session) {
      session = await this.syncFromElectronRelayIfAvailable();
    }
    if (!session) {
      throw new Error('Firebase 未ログインです。設定画面の「Google でログイン」からログインしてください。');
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
