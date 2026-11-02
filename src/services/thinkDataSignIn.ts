/**
 * Think データ用 Firebase へのログイン。
 * 設定画面と、一覧の未ログイン案内の両方から同じ手順で呼ぶ。
 */

import { FirebaseAuthService } from '../platform/web/FirebaseAuthService';
import { FirestoreRelayClient } from '../platform/web/FirestoreRelayClient';
import type { ElectronRelayStatus } from './storage/ElectronStorageBackend';

export interface ThinkDataSignInResult {
  user: { uid: string; email: string } | null;
  /** Electron 版でメインプロセス側のログイン状態。Web 版では null。 */
  relayStatus: ElectronRelayStatus | null;
}

export function isElectronBrowserSignIn(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.relay?.signInWithGoogle);
}

/**
 * Electron 版は製品版の画面（app://）を Google の戻り先に登録できないため、
 * いつものブラウザでログインしてメインプロセスから引き継ぐ。Web 版はポップアップ。
 */
export async function signInForThinkData(
  firebaseProjectId: string = FirestoreRelayClient.getConfig().firebaseProjectId,
): Promise<ThinkDataSignInResult> {
  const signIn = typeof window !== 'undefined' ? window.electronAPI?.relay?.signInWithGoogle : undefined;
  if (signIn) {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
    const relayStatus = await signIn({ apiKey: env.VITE_FIREBASE_API_KEY || '', firebaseProjectId });
    const session = await FirebaseAuthService.syncFromElectronRelayIfAvailable();
    return {
      user: session ? { uid: session.uid, email: session.email } : null,
      relayStatus,
    };
  }
  await FirebaseAuthService.signInWithGooglePopup();
  return { user: FirebaseAuthService.getCurrentUser(), relayStatus: null };
}
