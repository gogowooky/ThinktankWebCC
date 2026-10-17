/**
 * shared/firebaseAuth.ts
 * Firebase Authentication の REST API（Identity Toolkit / Secure Token）を SDK なしで呼ぶ。
 * Web版（ブラウザ）と中継エージェント（Node）の両方で同じ uid・ID トークンを得るために使う。
 */

export interface FirebaseAuthSession {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  /** ID トークンの有効期限（epoch ms） */
  expiresAtMs: number;
}

// 期限ちょうどまで使うと通信中に失効するため、少し早めに更新する
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

async function readAuthError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Google の OAuth アクセストークンで Firebase にサインインする。
 * Firebase コンソールで Google プロバイダが有効になっている必要がある。
 */
export async function signInWithGoogleAccessToken(
  apiKey: string,
  googleAccessToken: string,
  requestUri: string,
): Promise<FirebaseAuthSession> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `access_token=${encodeURIComponent(googleAccessToken)}&providerId=google.com`,
        requestUri,
        returnSecureToken: true,
        returnIdpCredential: false,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Firebase サインインに失敗しました (${await readAuthError(res)})`);
  }
  const data = (await res.json()) as {
    localId: string;
    email?: string;
    idToken: string;
    refreshToken: string;
    expiresIn: string;
  };
  return {
    uid: data.localId,
    email: data.email || '',
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAtMs: Date.now() + Number(data.expiresIn || '3600') * 1000,
  };
}

/** リフレッシュトークンから新しい ID トークンを得る。uid もここで確定する。 */
export async function refreshFirebaseIdToken(
  apiKey: string,
  refreshToken: string,
  email = '',
): Promise<FirebaseAuthSession> {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    },
  );
  if (!res.ok) {
    throw new Error(`Firebase トークンの更新に失敗しました (${await readAuthError(res)})`);
  }
  const data = (await res.json()) as {
    user_id: string;
    id_token: string;
    refresh_token: string;
    expires_in: string;
  };
  return {
    uid: data.user_id,
    email,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAtMs: Date.now() + Number(data.expires_in || '3600') * 1000,
  };
}

export function needsFirebaseTokenRefresh(session: FirebaseAuthSession, nowMs = Date.now()): boolean {
  return !session.idToken || nowMs >= session.expiresAtMs - REFRESH_MARGIN_MS;
}

export function firestoreUserDocumentsBaseUrl(projectId: string, uid: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId,
  )}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
}
