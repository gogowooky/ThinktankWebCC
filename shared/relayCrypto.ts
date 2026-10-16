/**
 * shared/relayCrypto.ts
 * Web版 ⇔ 中継役PC 間の E2EE（AES-256-GCM）暗号化・復号ユーティリティ。
 * Node.js 18+ および モダンブラウザの双方で標準 Web Crypto API (globalThis.crypto.subtle) を使用する。
 */

export interface EncryptedPayloadV1 {
  v: 1;
  alg: 'AES-256-GCM';
  iv: string;
  salt: string;
  ct: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesGcmKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 任意の JSON シリアライズ可能オブジェクトを AES-256-GCM で暗号化し、JSON 文字列を返す。
 */
export async function encryptRelayPayload<T>(payload: T, secretPassphrase: string): Promise<string> {
  if (!secretPassphrase) {
    throw new Error('E2EE 暗号化キー（ペアリングシークレット）が設定されていません。');
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(secretPassphrase, salt);

  const plaintextBytes = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintextBytes as BufferSource,
  );

  const envelope: EncryptedPayloadV1 = {
    v: 1,
    alg: 'AES-256-GCM',
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    ct: bytesToBase64(new Uint8Array(cipherBuffer)),
  };

  return JSON.stringify(envelope);
}

/**
 * encryptRelayPayload で暗号化された JSON 文字列を復号して元のオブジェクトを返す。
 */
export async function decryptRelayPayload<T>(
  encryptedJson: string,
  secretPassphrase: string,
): Promise<T> {
  if (!secretPassphrase) {
    throw new Error('E2EE 復号キー（ペアリングシークレット）が設定されていません。');
  }
  const parsed: unknown = JSON.parse(encryptedJson);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('不正な暗号化ペイロード形式です。');
  }
  const env = parsed as Partial<EncryptedPayloadV1>;
  if (env.v !== 1 || env.alg !== 'AES-256-GCM' || !env.iv || !env.salt || !env.ct) {
    throw new Error('未対応または破損した E2EE ペイロード形式です。');
  }

  const salt = base64ToBytes(env.salt);
  const iv = base64ToBytes(env.iv);
  const ct = base64ToBytes(env.ct);
  const key = await deriveAesGcmKey(secretPassphrase, salt);

  const plainBuffer = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );

  const plainText = new TextDecoder().decode(plainBuffer);
  return JSON.parse(plainText) as T;
}

/**
 * 新しいペアリング用ランダムシークレット（Base64URL 32バイト）を生成する。
 */
export function generatePairingSecret(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24));
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
