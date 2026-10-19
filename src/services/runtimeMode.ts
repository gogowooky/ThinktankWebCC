export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/**
 * 旧版の平文 `/api/think-support/*` 経路は使わない。
 * localhostの常駐エージェントも、PC連携ON時にFirestoreRelayClientの
 * 暗号化 `/api/relay/encrypted` fallbackからだけ利用する。
 */
export function usesLocalRelay(): boolean {
  return false;
}
