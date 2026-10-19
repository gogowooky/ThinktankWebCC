export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/**
 * 旧版の平文 `/api/think-support/*` 経路は使わない。
 * PC連携ON時はFirestoreRelayClientでElectron提供側に接続する。
 */
export function usesLocalRelay(): boolean {
  return false;
}
