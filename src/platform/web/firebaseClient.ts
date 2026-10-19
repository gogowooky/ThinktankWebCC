/**
 * Browser-side Firebase SDK singleton.
 *
 * Think の正本保存と PC 連携のリアルタイム監視は同じ Firebase Auth
 * セッションを共有する。プロジェクト ID を設定画面で切り替えられるため、
 * FirebaseApp はプロジェクトごとに分けて初期化する。
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const STORAGE_KEY_FIREBASE_PROJECT = 'thinktank.web.firebaseProjectId';
const initializedPersistence = new WeakSet<Auth>();

function envValue(name: string): string {
  const env =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env) ||
    {};
  return env[name] || '';
}

export function getFirebaseProjectId(explicitProjectId = ''): string {
  const stored =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY_FIREBASE_PROJECT) || ''
      : '';
  return explicitProjectId.trim() || stored.trim() || envValue('VITE_FIREBASE_PROJECT_ID').trim();
}

export function getFirebaseApiKey(): string {
  return envValue('VITE_FIREBASE_API_KEY').trim();
}

function appName(projectId: string): string {
  return `thinktank-${projectId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

export async function getFirebaseClient(
  explicitProjectId = '',
): Promise<{ app: FirebaseApp; auth: Auth; db: Firestore }> {
  const projectId = getFirebaseProjectId(explicitProjectId);
  const apiKey = getFirebaseApiKey();
  if (!projectId) throw new Error('Firebase Project ID が設定されていません。');
  if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY が設定されていません。');

  const name = appName(projectId);
  const app = getApps().some((candidate) => candidate.name === name)
    ? getApp(name)
    : initializeApp(
        {
          apiKey,
          projectId,
          authDomain: envValue('VITE_FIREBASE_AUTH_DOMAIN') || `${projectId}.firebaseapp.com`,
          appId: envValue('VITE_FIREBASE_APP_ID') || undefined,
        },
        name,
      );
  const auth = getAuth(app);
  if (!initializedPersistence.has(auth)) {
    await setPersistence(auth, browserLocalPersistence);
    initializedPersistence.add(auth);
  }
  await auth.authStateReady();
  return { app, auth, db: getFirestore(app) };
}
